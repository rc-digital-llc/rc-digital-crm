BEGIN;

ALTER TABLE public.invoices
  ADD COLUMN amount_minor bigint,
  ADD COLUMN currency text,
  ADD COLUMN currency_policy_version text,
  ADD COLUMN tax_rate_numerator bigint,
  ADD COLUMN tax_rate_denominator bigint,
  ADD COLUMN submitted_percentage text,
  ADD COLUMN rate_policy_version text,
  ADD COLUMN tax_amount_minor bigint,
  ADD COLUMN total_amount_minor bigint,
  ADD COLUMN rounding_policy_version text,
  ADD COLUMN line_items_exact jsonb,
  ADD COLUMN line_items_legacy_evidence jsonb;

ALTER TABLE public.billing_automation_grants
  ADD COLUMN max_amount_minor bigint,
  ADD COLUMN total_amount_consumed_minor bigint,
  ADD COLUMN currency text,
  ADD COLUMN currency_policy_version text;

ALTER TABLE public.billing_automation_executions
  ADD COLUMN amount_minor bigint,
  ADD COLUMN currency text,
  ADD COLUMN currency_policy_version text,
  ADD COLUMN effect_discriminator jsonb,
  ADD COLUMN request_fingerprint text,
  ADD COLUMN effect_fingerprint text;

CREATE FUNCTION private.billing_legacy_decimal_to_minor(p_value numeric)
RETURNS bigint
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
  scaled numeric;
BEGIN
  IF p_value IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'BILLING_LEGACY_MONEY_INVALID';
  END IF;
  scaled := p_value * 100;
  IF scaled <> pg_catalog.trunc(scaled)
    OR scaled < -9223372036854775808::numeric
    OR scaled > 9223372036854775807::numeric
  THEN
    RAISE EXCEPTION USING ERRCODE = '22003', MESSAGE = 'BILLING_LEGACY_MONEY_INVALID';
  END IF;
  RETURN scaled::bigint;
END;
$function$;

CREATE FUNCTION private.billing_legacy_json_decimal_text(p_value jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
  value_text text;
BEGIN
  IF pg_catalog.jsonb_typeof(p_value) NOT IN ('string', 'number') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'BILLING_LINE_ITEM_INVALID';
  END IF;
  value_text := CASE
    WHEN pg_catalog.jsonb_typeof(p_value) = 'string' THEN p_value #>> '{}'
    ELSE p_value::text
  END;
  IF pg_catalog.octet_length(value_text) > 64
    OR value_text !~ '^-?(0|[1-9][0-9]*)(\.[0-9]+)?$'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'BILLING_LINE_ITEM_INVALID';
  END IF;
  RETURN value_text;
END;
$function$;

CREATE FUNCTION private.billing_legacy_json_money_minor(p_value jsonb)
RETURNS bigint
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
  value_text text := private.billing_legacy_json_decimal_text(p_value);
BEGIN
  IF value_text ~ '\.[0-9]{3,}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'BILLING_LINE_ITEM_INVALID';
  END IF;
  RETURN private.billing_legacy_decimal_to_minor(value_text::numeric);
END;
$function$;

CREATE FUNCTION private.billing_legacy_quantity_ratio(p_value jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
  value_text text := private.billing_legacy_json_decimal_text(p_value);
  whole_text text;
  fraction_text text;
  numerator_text text;
  denominator_text text;
BEGIN
  whole_text := pg_catalog.split_part(value_text, '.', 1);
  fraction_text := CASE
    WHEN pg_catalog.strpos(value_text, '.') = 0 THEN ''
    ELSE pg_catalog.split_part(value_text, '.', 2)
  END;
  IF pg_catalog.length(fraction_text) > 9 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'BILLING_LINE_ITEM_INVALID';
  END IF;
  numerator_text := whole_text || fraction_text;
  denominator_text := '1' || pg_catalog.repeat('0', pg_catalog.length(fraction_text));
  RETURN private.financial_normalize_ratio(
    pg_catalog.to_jsonb(numerator_text),
    pg_catalog.to_jsonb(denominator_text)
  );
END;
$function$;

CREATE FUNCTION private.billing_validate_exact_line_items(p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  item jsonb;
  normalized_ratio jsonb;
  unit_money jsonb;
  extended_money jsonb;
  expected_extended jsonb;
  normalized_items jsonb := '[]'::jsonb;
  item_keys text[];
BEGIN
  IF pg_catalog.jsonb_typeof(p_items) IS DISTINCT FROM 'array'
    OR pg_catalog.jsonb_array_length(p_items) > 100
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'BILLING_LINE_ITEMS_INVALID';
  END IF;

  FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(p_items) LOOP
    IF pg_catalog.jsonb_typeof(item) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'BILLING_LINE_ITEMS_INVALID';
    END IF;
    SELECT pg_catalog.array_agg(key ORDER BY key) INTO item_keys
    FROM pg_catalog.jsonb_object_keys(item) AS keys(key);
    IF item_keys IS DISTINCT FROM ARRAY[
      'currency_policy_version', 'description', 'extended_amount',
      'quantity_ratio', 'rounding_policy_version', 'unit_price'
    ]::text[]
      OR pg_catalog.jsonb_typeof(item->'description') IS DISTINCT FROM 'string'
      OR pg_catalog.octet_length(item->>'description') > 500
      OR item->>'currency_policy_version' IS DISTINCT FROM 'usd-v1'
      OR item->>'rounding_policy_version' IS DISTINCT FROM 'half-away-from-zero-v1'
      OR pg_catalog.jsonb_typeof(item->'quantity_ratio') IS DISTINCT FROM 'object'
      OR pg_catalog.jsonb_typeof(item->'unit_price') IS DISTINCT FROM 'object'
      OR pg_catalog.jsonb_typeof(item->'extended_amount') IS DISTINCT FROM 'object'
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'BILLING_LINE_ITEMS_INVALID';
    END IF;

    normalized_ratio := private.financial_normalize_ratio(
      item->'quantity_ratio'->'numerator',
      item->'quantity_ratio'->'denominator'
    );
    IF normalized_ratio IS DISTINCT FROM item->'quantity_ratio'
      OR (normalized_ratio->>'numerator')::numeric < 0
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'BILLING_LINE_ITEMS_INVALID';
    END IF;
    unit_money := public.financial_parse_usd_money(item->'unit_price', 'usd-v1');
    extended_money := public.financial_parse_usd_money(item->'extended_amount', 'usd-v1');
    expected_extended := public.financial_round_usd_minor(
      pg_catalog.jsonb_build_object(
        'numerator', (
          (unit_money->>'amount_minor')::numeric *
          (normalized_ratio->>'numerator')::numeric
        )::text,
        'denominator', normalized_ratio->>'denominator',
        'currency', 'USD'
      ),
      'usd-v1',
      'half-away-from-zero-v1',
      2
    );
    IF expected_extended IS DISTINCT FROM extended_money THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'BILLING_LINE_ITEMS_INVALID';
    END IF;

    normalized_items := normalized_items || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'description', item->>'description',
        'quantity_ratio', normalized_ratio,
        'unit_price', unit_money,
        'extended_amount', extended_money,
        'currency_policy_version', 'usd-v1',
        'rounding_policy_version', 'half-away-from-zero-v1'
      )
    );
  END LOOP;
  RETURN normalized_items;
EXCEPTION
  WHEN SQLSTATE '22003' OR SQLSTATE '22012' OR SQLSTATE '22023' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'BILLING_LINE_ITEMS_INVALID';
END;
$function$;

CREATE FUNCTION private.billing_convert_legacy_line_items(p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  item jsonb;
  quantity_ratio jsonb;
  unit_minor bigint;
  extended_minor bigint;
  converted jsonb := '[]'::jsonb;
BEGIN
  IF pg_catalog.jsonb_typeof(p_items) IS DISTINCT FROM 'array'
    OR pg_catalog.jsonb_array_length(p_items) > 100
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'BILLING_LINE_ITEMS_INVALID';
  END IF;
  FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(p_items) LOOP
    IF pg_catalog.jsonb_typeof(item) IS DISTINCT FROM 'object'
      OR NOT item ?& ARRAY['description', 'quantity', 'rate', 'amount']
      OR pg_catalog.jsonb_typeof(item->'description') IS DISTINCT FROM 'string'
      OR pg_catalog.octet_length(item->>'description') > 500
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'BILLING_LINE_ITEMS_INVALID';
    END IF;
    quantity_ratio := private.billing_legacy_quantity_ratio(item->'quantity');
    unit_minor := private.billing_legacy_json_money_minor(item->'rate');
    extended_minor := private.billing_legacy_json_money_minor(item->'amount');
    converted := converted || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'description', item->>'description',
        'quantity_ratio', quantity_ratio,
        'unit_price', pg_catalog.jsonb_build_object(
          'amount_minor', unit_minor::text, 'currency', 'USD'
        ),
        'extended_amount', pg_catalog.jsonb_build_object(
          'amount_minor', extended_minor::text, 'currency', 'USD'
        ),
        'currency_policy_version', 'usd-v1',
        'rounding_policy_version', 'half-away-from-zero-v1'
      )
    );
  END LOOP;
  RETURN private.billing_validate_exact_line_items(converted);
EXCEPTION
  WHEN SQLSTATE '22003' OR SQLSTATE '22012' OR SQLSTATE '22023' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'BILLING_LINE_ITEMS_INVALID';
END;
$function$;

CREATE TEMP TABLE billing_exact_conversion_exceptions (
  table_name text NOT NULL,
  row_id text NOT NULL,
  field_path text NOT NULL,
  reason_code text NOT NULL
) ON COMMIT DROP;

DO $block$
DECLARE
  invoice_record record;
BEGIN
  FOR invoice_record IN SELECT * FROM public.invoices ORDER BY id LOOP
    BEGIN
      PERFORM private.billing_legacy_decimal_to_minor(invoice_record.amount);
      PERFORM private.billing_legacy_decimal_to_minor(invoice_record.tax_amount);
      PERFORM private.billing_legacy_decimal_to_minor(invoice_record.total_amount);
      IF invoice_record.tax_rate < 0 OR invoice_record.tax_rate > 100 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'BILLING_RATE_INVALID';
      END IF;
      PERFORM public.financial_parse_ordinary_percentage(
        pg_catalog.to_jsonb(invoice_record.tax_rate::text || '%'),
        'ordinary-percentage-v1'
      );
      PERFORM private.billing_convert_legacy_line_items(invoice_record.line_items);
    EXCEPTION
      WHEN OTHERS THEN
        INSERT INTO billing_exact_conversion_exceptions
        VALUES ('invoices', invoice_record.id::text, 'financial', SQLSTATE);
    END;
  END LOOP;
END;
$block$;

INSERT INTO billing_exact_conversion_exceptions
SELECT 'billing_automation_grants', id::text, 'max_amount', 'BILLING_LEGACY_MONEY_INVALID'
FROM public.billing_automation_grants
WHERE max_amount IS NOT NULL
  AND (
    max_amount * 100 <> pg_catalog.trunc(max_amount * 100)
    OR max_amount * 100 > 9223372036854775807::numeric
  );

INSERT INTO billing_exact_conversion_exceptions
SELECT 'billing_automation_grants', id::text, 'total_amount_consumed', 'BILLING_LEGACY_MONEY_INVALID'
FROM public.billing_automation_grants
WHERE total_amount_consumed * 100 <> pg_catalog.trunc(total_amount_consumed * 100)
  OR total_amount_consumed * 100 > 9223372036854775807::numeric;

INSERT INTO billing_exact_conversion_exceptions
SELECT 'billing_automation_executions', id::text, 'amount', 'BILLING_LEGACY_MONEY_INVALID'
FROM public.billing_automation_executions
WHERE amount * 100 <> pg_catalog.trunc(amount * 100)
  OR amount * 100 > 9223372036854775807::numeric;

DO $block$
DECLARE
  first_exception billing_exact_conversion_exceptions%ROWTYPE;
BEGIN
  SELECT * INTO first_exception
  FROM billing_exact_conversion_exceptions
  ORDER BY table_name, row_id, field_path
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'BILLING_EXACT_CONVERSION_BLOCKED table=% id=% field=% reason=%',
      first_exception.table_name,
      first_exception.row_id,
      first_exception.field_path,
      first_exception.reason_code;
  END IF;
END;
$block$;

CREATE TEMP TABLE billing_exact_invoice_values ON COMMIT DROP AS
SELECT
  invoice.id,
  private.billing_legacy_decimal_to_minor(invoice.amount) AS amount_minor,
  rate->>'numerator' AS tax_rate_numerator,
  rate->>'denominator' AS tax_rate_denominator,
  rate->>'submitted_percentage' AS submitted_percentage,
  private.billing_legacy_decimal_to_minor(invoice.tax_amount) AS tax_amount_minor,
  private.billing_legacy_decimal_to_minor(invoice.total_amount) AS total_amount_minor,
  private.billing_convert_legacy_line_items(invoice.line_items) AS line_items_exact,
  invoice.line_items AS line_items_legacy_evidence
FROM public.invoices AS invoice
CROSS JOIN LATERAL public.financial_parse_ordinary_percentage(
  pg_catalog.to_jsonb(invoice.tax_rate::text || '%'),
  'ordinary-percentage-v1'
) AS rate;

DO $block$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM billing_exact_invoice_values AS exact_value
    WHERE exact_value.tax_amount_minor IS DISTINCT FROM (
      public.financial_round_usd_minor(
        pg_catalog.jsonb_build_object(
          'numerator', (
            exact_value.amount_minor::numeric * exact_value.tax_rate_numerator::numeric
          )::text,
          'denominator', exact_value.tax_rate_denominator,
          'currency', 'USD'
        ),
        'usd-v1', 'half-away-from-zero-v1', 2
      )->>'amount_minor'
    )::bigint
      OR exact_value.total_amount_minor::numeric IS DISTINCT FROM
        exact_value.amount_minor::numeric + exact_value.tax_amount_minor::numeric
      OR (
        pg_catalog.jsonb_array_length(exact_value.line_items_exact) > 0
        AND exact_value.amount_minor::numeric IS DISTINCT FROM (
          SELECT pg_catalog.sum((item->'extended_amount'->>'amount_minor')::numeric)
          FROM pg_catalog.jsonb_array_elements(exact_value.line_items_exact) AS items(item)
        )
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'BILLING_EXACT_CONVERSION_RECONCILIATION_FAILED';
  END IF;
END;
$block$;

ALTER TABLE public.invoices DISABLE TRIGGER invoices_calculate_totals;
ALTER TABLE public.invoices DISABLE TRIGGER invoices_updated_at;

ALTER TABLE public.invoices
  ALTER COLUMN amount TYPE numeric(19, 2),
  ALTER COLUMN tax_rate TYPE numeric(12, 9),
  ALTER COLUMN tax_amount TYPE numeric(19, 2),
  ALTER COLUMN total_amount TYPE numeric(19, 2);

UPDATE public.invoices AS invoice
SET
  amount_minor = exact_value.amount_minor,
  currency = 'USD',
  currency_policy_version = 'usd-v1',
  tax_rate_numerator = exact_value.tax_rate_numerator::bigint,
  tax_rate_denominator = exact_value.tax_rate_denominator::bigint,
  submitted_percentage = exact_value.submitted_percentage,
  rate_policy_version = 'ordinary-percentage-v1',
  tax_amount_minor = exact_value.tax_amount_minor,
  total_amount_minor = exact_value.total_amount_minor,
  rounding_policy_version = 'half-away-from-zero-v1',
  line_items_exact = exact_value.line_items_exact,
  line_items_legacy_evidence = exact_value.line_items_legacy_evidence,
  tax_rate = exact_value.tax_rate_numerator::numeric * 100 /
    exact_value.tax_rate_denominator::numeric
FROM billing_exact_invoice_values AS exact_value
WHERE exact_value.id = invoice.id;

ALTER TABLE public.invoices ENABLE TRIGGER invoices_updated_at;

UPDATE public.billing_automation_grants
SET
  max_amount_minor = CASE
    WHEN max_amount IS NULL THEN NULL
    ELSE private.billing_legacy_decimal_to_minor(max_amount)
  END,
  total_amount_consumed_minor = private.billing_legacy_decimal_to_minor(total_amount_consumed),
  currency = 'USD',
  currency_policy_version = 'usd-v1';

UPDATE public.billing_automation_executions
SET
  amount_minor = private.billing_legacy_decimal_to_minor(amount),
  currency = 'USD',
  currency_policy_version = 'usd-v1',
  effect_discriminator = pg_catalog.jsonb_build_object('kind', 'legacy-command'),
  request_fingerprint = pg_catalog.encode(
    extensions.digest(
      pg_catalog.jsonb_build_object(
        'grant_id', grant_id::text,
        'account_id', account_id::text,
        'command_name', command_name,
        'policy_version', policy_version,
        'action_kind', action_kind,
        'amount_minor', private.billing_legacy_decimal_to_minor(amount)::text,
        'currency', 'USD'
      )::text,
      'sha256'
    ),
    'hex'
  ),
  effect_fingerprint = pg_catalog.encode(
    extensions.digest('{"kind": "legacy-command"}', 'sha256'),
    'hex'
  );

ALTER TABLE public.invoices
  ALTER COLUMN amount_minor SET NOT NULL,
  ALTER COLUMN currency SET NOT NULL,
  ALTER COLUMN currency_policy_version SET NOT NULL,
  ALTER COLUMN tax_rate_numerator SET NOT NULL,
  ALTER COLUMN tax_rate_denominator SET NOT NULL,
  ALTER COLUMN submitted_percentage SET NOT NULL,
  ALTER COLUMN rate_policy_version SET NOT NULL,
  ALTER COLUMN tax_amount_minor SET NOT NULL,
  ALTER COLUMN total_amount_minor SET NOT NULL,
  ALTER COLUMN rounding_policy_version SET NOT NULL,
  ALTER COLUMN line_items_exact SET NOT NULL,
  ALTER COLUMN line_items_legacy_evidence SET NOT NULL,
  ALTER COLUMN currency SET DEFAULT 'USD',
  ALTER COLUMN currency_policy_version SET DEFAULT 'usd-v1',
  ALTER COLUMN rate_policy_version SET DEFAULT 'ordinary-percentage-v1',
  ALTER COLUMN rounding_policy_version SET DEFAULT 'half-away-from-zero-v1',
  ALTER COLUMN line_items_exact SET DEFAULT '[]'::jsonb,
  ALTER COLUMN line_items_legacy_evidence SET DEFAULT '[]'::jsonb,
  ADD CONSTRAINT invoices_currency_policy_fkey
    FOREIGN KEY (currency_policy_version)
    REFERENCES public.financial_currency_policies(policy_version),
  ADD CONSTRAINT invoices_rate_policy_fkey
    FOREIGN KEY (rate_policy_version)
    REFERENCES public.financial_rate_policies(policy_version),
  ADD CONSTRAINT invoices_rounding_policy_fkey
    FOREIGN KEY (rounding_policy_version)
    REFERENCES public.financial_rounding_policies(policy_version),
  ADD CONSTRAINT invoices_exact_currency_check
    CHECK (currency = 'USD' AND currency_policy_version = 'usd-v1'),
  ADD CONSTRAINT invoices_exact_rate_check
    CHECK (
      tax_rate_denominator > 0
      AND tax_rate_numerator >= 0
      AND tax_rate_numerator <= tax_rate_denominator
      AND rate_policy_version = 'ordinary-percentage-v1'
    ),
  ADD CONSTRAINT invoices_tax_rate_compatibility_check
    CHECK (
      tax_rate BETWEEN 0 AND 100
      AND tax_rate = tax_rate_numerator::numeric * 100 / tax_rate_denominator::numeric
    ),
  ADD CONSTRAINT invoices_exact_money_compatibility_check
    CHECK (
      amount = amount_minor::numeric / 100
      AND tax_amount = tax_amount_minor::numeric / 100
      AND total_amount = total_amount_minor::numeric / 100
      AND total_amount_minor::numeric = amount_minor::numeric + tax_amount_minor::numeric
      AND rounding_policy_version = 'half-away-from-zero-v1'
    ),
  ADD CONSTRAINT invoices_submitted_percentage_check
    CHECK (
      pg_catalog.octet_length(submitted_percentage) <= 14
      AND submitted_percentage ~ '^(0|[1-9][0-9]?|100)(\.[0-9]{1,9})?%$'
    ),
  ADD CONSTRAINT invoices_exact_line_items_check
    CHECK (pg_catalog.jsonb_typeof(line_items_exact) = 'array'),
  ADD CONSTRAINT invoices_legacy_line_items_evidence_check
    CHECK (pg_catalog.jsonb_typeof(line_items_legacy_evidence) = 'array');

ALTER TABLE public.billing_automation_grants
  ALTER COLUMN total_amount_consumed_minor SET NOT NULL,
  ALTER COLUMN currency SET NOT NULL,
  ALTER COLUMN currency_policy_version SET NOT NULL,
  ALTER COLUMN total_amount_consumed_minor SET DEFAULT 0,
  ALTER COLUMN currency SET DEFAULT 'USD',
  ALTER COLUMN currency_policy_version SET DEFAULT 'usd-v1',
  ADD CONSTRAINT billing_automation_grants_currency_policy_fkey
    FOREIGN KEY (currency_policy_version)
    REFERENCES public.financial_currency_policies(policy_version),
  ADD CONSTRAINT billing_automation_grants_exact_amount_check CHECK (
    currency = 'USD'
    AND currency_policy_version = 'usd-v1'
    AND total_amount_consumed_minor >= 0
    AND (max_amount_minor IS NULL OR max_amount_minor >= 0)
    AND (max_amount_minor IS NULL OR total_amount_consumed_minor <= max_amount_minor)
    AND max_amount IS NOT DISTINCT FROM (
      CASE WHEN max_amount_minor IS NULL THEN NULL ELSE max_amount_minor::numeric / 100 END
    )
    AND total_amount_consumed = total_amount_consumed_minor::numeric / 100
  );

ALTER TABLE public.billing_automation_executions
  ALTER COLUMN amount_minor SET NOT NULL,
  ALTER COLUMN currency SET NOT NULL,
  ALTER COLUMN currency_policy_version SET NOT NULL,
  ALTER COLUMN effect_discriminator SET NOT NULL,
  ALTER COLUMN request_fingerprint SET NOT NULL,
  ALTER COLUMN effect_fingerprint SET NOT NULL,
  ALTER COLUMN currency SET DEFAULT 'USD',
  ALTER COLUMN currency_policy_version SET DEFAULT 'usd-v1',
  ADD CONSTRAINT billing_automation_executions_currency_policy_fkey
    FOREIGN KEY (currency_policy_version)
    REFERENCES public.financial_currency_policies(policy_version),
  ADD CONSTRAINT billing_automation_executions_exact_amount_check CHECK (
    amount_minor >= 0
    AND currency = 'USD'
    AND currency_policy_version = 'usd-v1'
    AND amount = amount_minor::numeric / 100
  ),
  ADD CONSTRAINT billing_automation_executions_request_fingerprint_check
    CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT billing_automation_executions_effect_fingerprint_check
    CHECK (effect_fingerprint ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT billing_automation_executions_effect_discriminator_check
    CHECK (pg_catalog.jsonb_typeof(effect_discriminator) = 'object');

CREATE FUNCTION private.billing_format_usd_minor(p_amount_minor bigint)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT CASE WHEN p_amount_minor < 0 THEN '-' ELSE '' END
    || pg_catalog.trunc(pg_catalog.abs(p_amount_minor::numeric) / 100)::text
    || '.'
    || pg_catalog.lpad(
      pg_catalog.mod(pg_catalog.abs(p_amount_minor::numeric), 100)::text,
      2,
      '0'
    );
$function$;

CREATE FUNCTION private.billing_exact_line_items_to_legacy(p_items jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'description', item->>'description',
        'quantity', CASE
          WHEN item->'quantity_ratio'->>'denominator' = '1'
          THEN item->'quantity_ratio'->>'numerator'
          ELSE (
            (item->'quantity_ratio'->>'numerator')::numeric /
            (item->'quantity_ratio'->>'denominator')::numeric
          )::text
        END,
        'rate', private.billing_format_usd_minor(
          (item->'unit_price'->>'amount_minor')::bigint
        ),
        'amount', private.billing_format_usd_minor(
          (item->'extended_amount'->>'amount_minor')::bigint
        )
      ) ORDER BY item_index
    ),
    '[]'::jsonb
  )
  FROM pg_catalog.jsonb_array_elements(p_items) WITH ORDINALITY AS items(item, item_index);
$function$;

CREATE FUNCTION private.billing_invoice_sync_exact()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  normalized_rate jsonb;
  normalized_items jsonb;
  computed_tax jsonb;
  computed_total numeric;
BEGIN
  normalized_rate := public.financial_parse_ordinary_percentage(
    pg_catalog.to_jsonb(NEW.submitted_percentage),
    NEW.rate_policy_version
  );
  IF normalized_rate->>'numerator' IS DISTINCT FROM NEW.tax_rate_numerator::text
    OR normalized_rate->>'denominator' IS DISTINCT FROM NEW.tax_rate_denominator::text
    OR NEW.currency IS DISTINCT FROM 'USD'
    OR NEW.currency_policy_version IS DISTINCT FROM 'usd-v1'
    OR NEW.rounding_policy_version IS DISTINCT FROM 'half-away-from-zero-v1'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVOICE_EXACT_STATE_INVALID';
  END IF;
  normalized_items := private.billing_validate_exact_line_items(NEW.line_items_exact);
  computed_tax := public.financial_round_usd_minor(
    pg_catalog.jsonb_build_object(
      'numerator', (NEW.amount_minor::numeric * NEW.tax_rate_numerator::numeric)::text,
      'denominator', NEW.tax_rate_denominator::text,
      'currency', 'USD'
    ),
    NEW.currency_policy_version,
    NEW.rounding_policy_version,
    2
  );
  computed_total := NEW.amount_minor::numeric + (computed_tax->>'amount_minor')::numeric;
  IF computed_total < -9223372036854775808::numeric
    OR computed_total > 9223372036854775807::numeric
  THEN
    RAISE EXCEPTION USING ERRCODE = '22003', MESSAGE = 'FINANCIAL_OVERFLOW';
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.line_items_legacy_evidence IS DISTINCT FROM NEW.line_items_legacy_evidence
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVOICE_LEGACY_EVIDENCE_IMMUTABLE';
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.tax_rate_numerator = NEW.tax_rate_numerator
    AND OLD.tax_rate_denominator = NEW.tax_rate_denominator
    AND OLD.submitted_percentage IS DISTINCT FROM NEW.submitted_percentage
  THEN
    INSERT INTO public.billing_audit_events (
      actor_type, actor_id, organization_id, account_id, action,
      subject_type, subject_id, result, reason, details
    ) VALUES (
      CASE WHEN (SELECT auth.uid()) IS NULL THEN 'system' ELSE 'human' END,
      (SELECT auth.uid()), NEW.organization_id, NEW.billing_account_id,
      'invoice.rate_presentation_changed', 'invoices', NEW.id::text,
      'succeeded', NULL, pg_catalog.jsonb_build_object(
        'rate_policy_version', NEW.rate_policy_version
      )
    );
  END IF;

  NEW.line_items_exact := normalized_items;
  NEW.tax_amount_minor := (computed_tax->>'amount_minor')::bigint;
  NEW.total_amount_minor := computed_total::bigint;
  NEW.amount := NEW.amount_minor::numeric / 100;
  NEW.tax_rate := NEW.tax_rate_numerator::numeric * 100 / NEW.tax_rate_denominator::numeric;
  NEW.tax_amount := NEW.tax_amount_minor::numeric / 100;
  NEW.total_amount := NEW.total_amount_minor::numeric / 100;
  NEW.line_items := private.billing_exact_line_items_to_legacy(NEW.line_items_exact);
  NEW.line_items_legacy_evidence := COALESCE(NEW.line_items_legacy_evidence, '[]'::jsonb);
  RETURN NEW;
EXCEPTION
  WHEN SQLSTATE '22003' THEN
    RAISE;
  WHEN SQLSTATE '22012' OR SQLSTATE '22023' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVOICE_EXACT_STATE_INVALID';
END;
$function$;

DROP TRIGGER invoices_calculate_totals ON public.invoices;
CREATE TRIGGER invoices_calculate_totals
BEFORE INSERT OR UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION private.billing_invoice_sync_exact();

CREATE FUNCTION private.billing_automation_grant_sync_exact()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.currency IS DISTINCT FROM 'USD'
    OR NEW.currency_policy_version IS DISTINCT FROM 'usd-v1'
    OR NEW.total_amount_consumed_minor < 0
    OR (NEW.max_amount_minor IS NOT NULL AND NEW.max_amount_minor < 0)
    OR (
      NEW.max_amount_minor IS NOT NULL
      AND NEW.total_amount_consumed_minor > NEW.max_amount_minor
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AUTOMATION_EXACT_AMOUNT_INVALID';
  END IF;
  NEW.max_amount := CASE
    WHEN NEW.max_amount_minor IS NULL THEN NULL
    ELSE NEW.max_amount_minor::numeric / 100
  END;
  NEW.total_amount_consumed := NEW.total_amount_consumed_minor::numeric / 100;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER billing_automation_grants_exact_projection
BEFORE INSERT OR UPDATE ON public.billing_automation_grants
FOR EACH ROW EXECUTE FUNCTION private.billing_automation_grant_sync_exact();

CREATE FUNCTION private.billing_automation_execution_sync_exact()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.amount_minor < 0
    OR NEW.currency IS DISTINCT FROM 'USD'
    OR NEW.currency_policy_version IS DISTINCT FROM 'usd-v1'
    OR NEW.request_fingerprint !~ '^[0-9a-f]{64}$'
    OR NEW.effect_fingerprint !~ '^[0-9a-f]{64}$'
    OR pg_catalog.jsonb_typeof(NEW.effect_discriminator) IS DISTINCT FROM 'object'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AUTOMATION_EXACT_AMOUNT_INVALID';
  END IF;
  NEW.amount := NEW.amount_minor::numeric / 100;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER billing_automation_executions_exact_projection
BEFORE INSERT ON public.billing_automation_executions
FOR EACH ROW EXECUTE FUNCTION private.billing_automation_execution_sync_exact();

DROP FUNCTION public.execute_billing_automation_command(
  uuid, uuid, text, text, text, text, numeric, text
);
DROP FUNCTION private.billing_consume_automation_grant(
  uuid, uuid, text, text, text, text, numeric, text
);

CREATE FUNCTION private.billing_validate_effect_discriminator(p_value jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  keys text[];
BEGIN
  IF pg_catalog.jsonb_typeof(p_value) IS DISTINCT FROM 'object'
    OR pg_catalog.jsonb_typeof(p_value->'kind') IS DISTINCT FROM 'string'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AUTOMATION_EFFECT_INVALID';
  END IF;
  SELECT pg_catalog.array_agg(key ORDER BY key) INTO keys
  FROM pg_catalog.jsonb_object_keys(p_value) AS object_keys(key);
  IF p_value->>'kind' = 'general-command' THEN
    IF keys IS DISTINCT FROM ARRAY['kind']::text[] THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AUTOMATION_EFFECT_INVALID';
    END IF;
  ELSIF p_value->>'kind' = 'evidence-inspection' THEN
    IF keys IS DISTINCT FROM ARRAY['decision', 'evidence_id', 'kind', 'reason_code']::text[]
      OR pg_catalog.jsonb_typeof(p_value->'evidence_id') IS DISTINCT FROM 'string'
      OR pg_catalog.jsonb_typeof(p_value->'decision') IS DISTINCT FROM 'string'
      OR pg_catalog.jsonb_typeof(p_value->'reason_code') IS DISTINCT FROM 'string'
      OR (p_value->>'evidence_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR p_value->>'decision' NOT IN ('clean', 'rejected')
      OR (p_value->>'reason_code') !~ '^[A-Z][A-Z0-9_]{2,63}$'
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AUTOMATION_EFFECT_INVALID';
    END IF;
  ELSE
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AUTOMATION_EFFECT_INVALID';
  END IF;
  RETURN p_value;
END;
$function$;

CREATE FUNCTION private.billing_automation_fingerprints(
  p_grant_id uuid,
  p_account_id uuid,
  p_command_name text,
  p_provider_reference text,
  p_policy_version text,
  p_action_kind text,
  p_amount jsonb,
  p_effect_discriminator jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  money jsonb;
  effect_value jsonb;
  request_value jsonb;
BEGIN
  money := public.financial_parse_usd_money(p_amount, 'usd-v1');
  effect_value := private.billing_validate_effect_discriminator(p_effect_discriminator);
  request_value := pg_catalog.jsonb_build_object(
    'grant_id', p_grant_id::text,
    'account_id', p_account_id::text,
    'command_name', p_command_name,
    'provider_reference', p_provider_reference,
    'policy_version', p_policy_version,
    'action_kind', p_action_kind,
    'amount_minor', money->>'amount_minor',
    'currency', money->>'currency'
  );
  RETURN pg_catalog.jsonb_build_object(
    'amount_minor', money->>'amount_minor',
    'currency', money->>'currency',
    'effect_discriminator', effect_value,
    'request_fingerprint', pg_catalog.encode(
      extensions.digest(request_value::text, 'sha256'), 'hex'
    ),
    'effect_fingerprint', pg_catalog.encode(
      extensions.digest(effect_value::text, 'sha256'), 'hex'
    )
  );
EXCEPTION
  WHEN SQLSTATE '22003' OR SQLSTATE '22012' OR SQLSTATE '22023' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AUTOMATION_EXACT_REQUEST_INVALID';
END;
$function$;

CREATE FUNCTION private.billing_consume_automation_grant(
  p_grant_id uuid,
  p_account_id uuid,
  p_command_name text,
  p_provider_reference text,
  p_policy_version text,
  p_action_kind text,
  p_amount jsonb,
  p_idempotency_key text,
  p_effect_discriminator jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  principal_record public.billing_automation_principals%ROWTYPE;
  grant_record public.billing_automation_grants%ROWTYPE;
  existing_execution public.billing_automation_executions%ROWTYPE;
  fingerprints jsonb;
  amount_minor_value bigint;
  new_action_count integer;
  new_amount_total numeric;
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR p_grant_id IS NULL
    OR p_account_id IS NULL
    OR p_command_name IS NULL
    OR p_provider_reference IS NULL
    OR p_policy_version IS NULL
    OR p_action_kind IS NULL
    OR p_amount IS NULL
    OR p_idempotency_key IS NULL
    OR p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$'
  THEN
    RETURN pg_catalog.jsonb_build_object('result', 'denied', 'reason_code', 'GRANT_NOT_AUTHORIZED');
  END IF;

  BEGIN
    fingerprints := private.billing_automation_fingerprints(
      p_grant_id, p_account_id, p_command_name, p_provider_reference,
      p_policy_version, p_action_kind, p_amount, p_effect_discriminator
    );
    amount_minor_value := (fingerprints->>'amount_minor')::bigint;
    IF amount_minor_value < 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AUTOMATION_EXACT_REQUEST_INVALID';
    END IF;
  EXCEPTION
    WHEN SQLSTATE '22003' OR SQLSTATE '22012' OR SQLSTATE '22023' THEN
      RETURN pg_catalog.jsonb_build_object('result', 'denied', 'reason_code', 'GRANT_NOT_AUTHORIZED');
  END;

  SELECT principal.*
  INTO principal_record
  FROM public.billing_automation_principals AS principal
  JOIN public.billing_organizations AS organization ON organization.id = principal.organization_id
  WHERE principal.auth_user_id = (SELECT auth.uid())
    AND principal.status = 'active'
    AND principal.disabled_at IS NULL
    AND principal.valid_from <= pg_catalog.now()
    AND (principal.valid_until IS NULL OR principal.valid_until > pg_catalog.now())
    AND organization.status = 'active'
  FOR UPDATE OF principal;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('result', 'denied', 'reason_code', 'GRANT_NOT_AUTHORIZED');
  END IF;

  SELECT execution.*
  INTO existing_execution
  FROM public.billing_automation_executions AS execution
  WHERE execution.principal_id = principal_record.id
    AND execution.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF existing_execution.request_fingerprint = fingerprints->>'request_fingerprint'
      AND existing_execution.effect_fingerprint = fingerprints->>'effect_fingerprint'
    THEN
      INSERT INTO public.billing_audit_events (
        actor_type, actor_id, organization_id, account_id, action,
        subject_type, subject_id, result, reason, details
      ) VALUES (
        'automation', principal_record.id, existing_execution.organization_id,
        existing_execution.account_id, 'automation.command',
        'billing_automation_executions', existing_execution.id::text,
        'ignored', 'DUPLICATE_COMMAND', pg_catalog.jsonb_build_object(
          'command', existing_execution.command_name,
          'policy_version', existing_execution.policy_version,
          'action_kind', existing_execution.action_kind
        )
      );
      RETURN pg_catalog.jsonb_build_object(
        'result', 'duplicate',
        'reason_code', 'DUPLICATE_COMMAND',
        'execution_id', existing_execution.id
      );
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'result', 'denied',
      'reason_code', 'IDEMPOTENCY_KEY_CONFLICT'
    );
  END IF;

  SELECT grant_row.*
  INTO grant_record
  FROM public.billing_automation_grants AS grant_row
  JOIN public.billing_accounts AS account ON account.id = grant_row.account_id
  WHERE grant_row.id = p_grant_id
    AND grant_row.principal_id = principal_record.id
    AND grant_row.organization_id = principal_record.organization_id
    AND grant_row.account_id = p_account_id
    AND grant_row.command_name = p_command_name
    AND grant_row.provider_reference = p_provider_reference
    AND grant_row.policy_version = p_policy_version
    AND grant_row.action_kind = p_action_kind
    AND account.organization_id = principal_record.organization_id
    AND account.billing_status <> 'closed'
  FOR UPDATE OF grant_row;

  IF NOT FOUND THEN
    INSERT INTO public.billing_audit_events (
      actor_type, actor_id, organization_id, account_id, action,
      subject_type, subject_id, result, reason, details
    ) VALUES (
      'automation', principal_record.id, principal_record.organization_id, NULL,
      'automation.command', 'billing_automation_grants', p_grant_id::text,
      'denied', 'GRANT_NOT_AUTHORIZED', '{}'::jsonb
    );
    RETURN pg_catalog.jsonb_build_object('result', 'denied', 'reason_code', 'GRANT_NOT_AUTHORIZED');
  END IF;

  IF grant_record.status <> 'active'
    OR grant_record.disabled_at IS NOT NULL
    OR grant_record.valid_from > pg_catalog.now()
    OR (grant_record.valid_until IS NOT NULL AND grant_record.valid_until <= pg_catalog.now())
  THEN
    INSERT INTO public.billing_audit_events (
      actor_type, actor_id, organization_id, account_id, action,
      subject_type, subject_id, result, reason, details
    ) VALUES (
      'automation', principal_record.id, principal_record.organization_id, grant_record.account_id,
      'automation.command', 'billing_automation_grants', grant_record.id::text,
      'denied', 'GRANT_NOT_AUTHORIZED', pg_catalog.jsonb_build_object(
        'command', grant_record.command_name,
        'policy_version', grant_record.policy_version,
        'action_kind', grant_record.action_kind
      )
    );
    RETURN pg_catalog.jsonb_build_object('result', 'denied', 'reason_code', 'GRANT_NOT_AUTHORIZED');
  END IF;

  new_action_count := grant_record.actions_consumed + 1;
  new_amount_total := grant_record.total_amount_consumed_minor::numeric + amount_minor_value::numeric;
  IF new_amount_total > 9223372036854775807::numeric
    OR (grant_record.max_actions IS NOT NULL AND new_action_count > grant_record.max_actions)
    OR (grant_record.max_amount_minor IS NOT NULL AND new_amount_total > grant_record.max_amount_minor)
  THEN
    INSERT INTO public.billing_audit_events (
      actor_type, actor_id, organization_id, account_id, action,
      subject_type, subject_id, result, reason, details
    ) VALUES (
      'automation', principal_record.id, principal_record.organization_id, grant_record.account_id,
      'automation.command', 'billing_automation_grants', grant_record.id::text,
      'denied', 'GRANT_LIMIT_EXCEEDED', pg_catalog.jsonb_build_object(
        'command', grant_record.command_name,
        'policy_version', grant_record.policy_version,
        'action_kind', grant_record.action_kind
      )
    );
    RETURN pg_catalog.jsonb_build_object('result', 'denied', 'reason_code', 'GRANT_LIMIT_EXCEEDED');
  END IF;

  INSERT INTO public.billing_automation_executions (
    organization_id, account_id, principal_id, grant_id, idempotency_key,
    command_name, policy_version, action_kind, amount, result,
    amount_minor, currency, currency_policy_version, effect_discriminator,
    request_fingerprint, effect_fingerprint
  ) VALUES (
    principal_record.organization_id, grant_record.account_id, principal_record.id,
    grant_record.id, p_idempotency_key, grant_record.command_name,
    grant_record.policy_version, grant_record.action_kind,
    amount_minor_value::numeric / 100, 'succeeded', amount_minor_value,
    'USD', 'usd-v1', fingerprints->'effect_discriminator',
    fingerprints->>'request_fingerprint', fingerprints->>'effect_fingerprint'
  ) RETURNING * INTO existing_execution;

  UPDATE public.billing_automation_grants
  SET
    actions_consumed = new_action_count,
    total_amount_consumed_minor = new_amount_total::bigint,
    status = CASE
      WHEN (max_actions IS NOT NULL AND new_action_count = max_actions)
        OR (max_amount_minor IS NOT NULL AND new_amount_total = max_amount_minor)
      THEN 'exhausted'
      ELSE status
    END,
    disabled_at = CASE
      WHEN (max_actions IS NOT NULL AND new_action_count = max_actions)
        OR (max_amount_minor IS NOT NULL AND new_amount_total = max_amount_minor)
      THEN pg_catalog.now()
      ELSE disabled_at
    END,
    disabled_reason = CASE
      WHEN (max_actions IS NOT NULL AND new_action_count = max_actions)
        OR (max_amount_minor IS NOT NULL AND new_amount_total = max_amount_minor)
      THEN 'grant limit exhausted'
      ELSE disabled_reason
    END,
    updated_at = pg_catalog.now()
  WHERE id = grant_record.id;

  INSERT INTO public.billing_audit_events (
    actor_type, actor_id, organization_id, account_id, action,
    subject_type, subject_id, result, reason, details
  ) VALUES (
    'automation', principal_record.id, principal_record.organization_id, grant_record.account_id,
    'automation.command', 'billing_automation_executions', p_idempotency_key,
    'succeeded', NULL, pg_catalog.jsonb_build_object(
      'command', grant_record.command_name,
      'policy_version', grant_record.policy_version,
      'action_kind', grant_record.action_kind
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'result', 'applied',
    'reason_code', 'COMMAND_APPLIED',
    'execution_id', existing_execution.id,
    'actions_consumed', new_action_count,
    'amount_consumed', pg_catalog.jsonb_build_object(
      'amount_minor', new_amount_total::bigint::text,
      'currency', 'USD'
    )
  );
END;
$function$;

CREATE FUNCTION public.execute_billing_automation_command(
  p_grant_id uuid,
  p_account_id uuid,
  p_command_name text,
  p_provider_reference text,
  p_policy_version text,
  p_action_kind text,
  p_amount jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT private.billing_consume_automation_grant(
    p_grant_id,
    p_account_id,
    p_command_name,
    p_provider_reference,
    p_policy_version,
    p_action_kind,
    p_amount,
    p_idempotency_key,
    pg_catalog.jsonb_build_object('kind', 'general-command')
  );
$function$;

DROP FUNCTION public.finalize_billing_evidence_inspection(
  uuid, uuid, text, text, text, text, text
);
DROP FUNCTION private.billing_finalize_evidence_inspection(
  uuid, uuid, text, text, text, text, text
);

CREATE FUNCTION private.billing_finalize_evidence_inspection(
  p_grant_id uuid,
  p_evidence_id uuid,
  p_decision text,
  p_reason_code text,
  p_provider_reference text,
  p_policy_version text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  evidence_record public.billing_evidence_objects%ROWTYPE;
  command_result jsonb;
  existing_execution public.billing_automation_executions%ROWTYPE;
  principal_id_value uuid;
  effect_value jsonb;
  fingerprints jsonb;
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR p_evidence_id IS NULL
    OR p_grant_id IS NULL
    OR p_decision IS NULL
    OR p_decision NOT IN ('clean', 'rejected')
    OR p_reason_code IS NULL
    OR p_reason_code !~ '^[A-Z][A-Z0-9_]{2,63}$'
  THEN
    RETURN pg_catalog.jsonb_build_object(
      'result', 'denied', 'reason_code', 'INSPECTION_NOT_AUTHORIZED'
    );
  END IF;

  SELECT evidence.*
  INTO evidence_record
  FROM public.billing_evidence_objects AS evidence
  WHERE evidence.id = p_evidence_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'result', 'denied', 'reason_code', 'INSPECTION_NOT_AUTHORIZED'
    );
  END IF;

  effect_value := pg_catalog.jsonb_build_object(
    'kind', 'evidence-inspection',
    'evidence_id', p_evidence_id::text,
    'decision', p_decision,
    'reason_code', p_reason_code
  );
  fingerprints := private.billing_automation_fingerprints(
    p_grant_id,
    evidence_record.account_id,
    'evidence.inspect',
    p_provider_reference,
    p_policy_version,
    'evidence.inspection',
    pg_catalog.jsonb_build_object('amount_minor', '0', 'currency', 'USD'),
    effect_value
  );

  IF evidence_record.inspection_status <> 'quarantined' THEN
    SELECT execution.*
    INTO existing_execution
    FROM public.billing_automation_executions AS execution
    JOIN public.billing_automation_principals AS principal
      ON principal.id = execution.principal_id
    WHERE principal.auth_user_id = (SELECT auth.uid())
      AND execution.idempotency_key = p_idempotency_key;
    IF FOUND THEN
      IF existing_execution.request_fingerprint = fingerprints->>'request_fingerprint'
        AND existing_execution.effect_fingerprint = fingerprints->>'effect_fingerprint'
      THEN
        RETURN pg_catalog.jsonb_build_object(
          'result', 'duplicate', 'reason_code', 'DUPLICATE_COMMAND'
        );
      END IF;
      RETURN pg_catalog.jsonb_build_object(
        'result', 'denied', 'reason_code', 'IDEMPOTENCY_KEY_CONFLICT'
      );
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'result', 'denied', 'reason_code', 'INSPECTION_NOT_AUTHORIZED'
    );
  END IF;

  command_result := private.billing_consume_automation_grant(
    p_grant_id,
    evidence_record.account_id,
    'evidence.inspect',
    p_provider_reference,
    p_policy_version,
    'evidence.inspection',
    pg_catalog.jsonb_build_object('amount_minor', '0', 'currency', 'USD'),
    p_idempotency_key,
    effect_value
  );

  IF command_result->>'result' = 'duplicate' THEN
    RETURN pg_catalog.jsonb_build_object(
      'result', 'duplicate', 'reason_code', 'DUPLICATE_COMMAND'
    );
  ELSIF command_result->>'reason_code' = 'IDEMPOTENCY_KEY_CONFLICT' THEN
    RETURN command_result;
  ELSIF command_result->>'result' <> 'applied' THEN
    RETURN pg_catalog.jsonb_build_object(
      'result', 'denied', 'reason_code', 'INSPECTION_NOT_AUTHORIZED'
    );
  END IF;

  SELECT principal.id
  INTO principal_id_value
  FROM public.billing_automation_principals AS principal
  JOIN public.billing_automation_grants AS grant_row
    ON grant_row.principal_id = principal.id
  WHERE principal.auth_user_id = (SELECT auth.uid())
    AND grant_row.id = p_grant_id
    AND grant_row.organization_id = evidence_record.organization_id
    AND grant_row.account_id = evidence_record.account_id;
  IF principal_id_value IS NULL THEN
    RAISE EXCEPTION 'Inspection principal binding changed during execution';
  END IF;

  UPDATE public.billing_evidence_objects
  SET inspection_status = p_decision,
      inspection_principal_id = principal_id_value,
      inspection_grant_id = p_grant_id,
      inspection_decided_at = pg_catalog.now(),
      inspection_reason_code = p_reason_code
  WHERE id = evidence_record.id;

  INSERT INTO public.billing_audit_events (
    actor_type, actor_id, organization_id, account_id, action,
    subject_type, subject_id, result, reason, details
  ) VALUES (
    'automation', principal_id_value, evidence_record.organization_id,
    evidence_record.account_id, 'evidence.inspection',
    'billing_evidence_objects', evidence_record.id::text, 'succeeded',
    p_reason_code, pg_catalog.jsonb_build_object('decision', p_decision)
  );

  RETURN pg_catalog.jsonb_build_object(
    'result', 'applied',
    'reason_code', 'INSPECTION_RECORDED',
    'evidence_id', evidence_record.id,
    'decision', p_decision
  );
END;
$function$;

CREATE FUNCTION public.finalize_billing_evidence_inspection(
  p_evidence_id uuid,
  p_grant_id uuid,
  p_provider_reference text,
  p_policy_version text,
  p_decision text,
  p_reason_code text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT private.billing_finalize_evidence_inspection(
    p_grant_id,
    p_evidence_id,
    p_decision,
    p_reason_code,
    p_provider_reference,
    p_policy_version,
    p_idempotency_key
  );
$function$;

CREATE FUNCTION private.billing_validate_invoice_read_request(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  request_keys text[];
  filter_keys text[];
  mode_value text;
  page_value integer;
  per_page_value integer;
  sort_value text;
  order_value text;
  invoice_id_value text;
  filters_value jsonb;
BEGIN
  IF pg_catalog.jsonb_typeof(p_request) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVOICE_READ_INVALID_REQUEST';
  END IF;
  SELECT COALESCE(pg_catalog.array_agg(key ORDER BY key), ARRAY[]::text[])
  INTO request_keys
  FROM pg_catalog.jsonb_object_keys(p_request) AS keys(key);
  IF NOT request_keys <@ ARRAY[
    'filters', 'invoice_id', 'mode', 'order', 'page', 'per_page', 'sort'
  ]::text[] THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVOICE_READ_INVALID_REQUEST';
  END IF;

  mode_value := COALESCE(p_request->>'mode', 'list');
  IF mode_value NOT IN ('list', 'get')
    OR (p_request ? 'mode' AND pg_catalog.jsonb_typeof(p_request->'mode') IS DISTINCT FROM 'string')
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVOICE_READ_INVALID_REQUEST';
  END IF;

  IF mode_value = 'get' THEN
    IF request_keys IS DISTINCT FROM ARRAY['invoice_id', 'mode']::text[]
      OR pg_catalog.jsonb_typeof(p_request->'invoice_id') IS DISTINCT FROM 'string'
      OR pg_catalog.octet_length(p_request->>'invoice_id') > 64
      OR (p_request->>'invoice_id') !~ '^[1-9][0-9]*$'
      OR (p_request->>'invoice_id')::numeric > 9223372036854775807::numeric
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVOICE_READ_INVALID_REQUEST';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'mode', 'get', 'invoice_id', p_request->>'invoice_id'
    );
  END IF;

  IF p_request ? 'invoice_id' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVOICE_READ_INVALID_REQUEST';
  END IF;
  IF (p_request ? 'page' AND (
      pg_catalog.jsonb_typeof(p_request->'page') IS DISTINCT FROM 'number'
      OR (p_request->>'page') !~ '^[0-9]+$'
    ))
    OR (p_request ? 'per_page' AND (
      pg_catalog.jsonb_typeof(p_request->'per_page') IS DISTINCT FROM 'number'
      OR (p_request->>'per_page') !~ '^[0-9]+$'
    ))
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVOICE_READ_INVALID_REQUEST';
  END IF;
  page_value := COALESCE((p_request->>'page')::integer, 1);
  per_page_value := COALESCE((p_request->>'per_page')::integer, 25);
  IF page_value < 1 OR page_value > 1000000
    OR per_page_value < 1 OR per_page_value > 100
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVOICE_READ_INVALID_REQUEST';
  END IF;

  sort_value := COALESCE(p_request->>'sort', 'created_at');
  order_value := COALESCE(p_request->>'order', 'DESC');
  IF (p_request ? 'sort' AND pg_catalog.jsonb_typeof(p_request->'sort') IS DISTINCT FROM 'string')
    OR (p_request ? 'order' AND pg_catalog.jsonb_typeof(p_request->'order') IS DISTINCT FROM 'string')
    OR sort_value NOT IN ('id', 'created_at', 'updated_at', 'invoice_number', 'issue_date', 'due_date', 'status')
    OR order_value NOT IN ('ASC', 'DESC')
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVOICE_READ_INVALID_REQUEST';
  END IF;

  filters_value := COALESCE(p_request->'filters', '{}'::jsonb);
  IF pg_catalog.jsonb_typeof(filters_value) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVOICE_READ_INVALID_REQUEST';
  END IF;
  SELECT COALESCE(pg_catalog.array_agg(key ORDER BY key), ARRAY[]::text[])
  INTO filter_keys
  FROM pg_catalog.jsonb_object_keys(filters_value) AS keys(key);
  IF NOT filter_keys <@ ARRAY['billing_account_id', 'invoice_number', 'status']::text[]
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_each(filters_value) AS filter(key, value)
      WHERE pg_catalog.jsonb_typeof(value) IS DISTINCT FROM 'string'
        OR pg_catalog.octet_length(value #>> '{}') > 200
    )
    OR (
      filters_value ? 'billing_account_id'
      AND (filters_value->>'billing_account_id') !~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    )
    OR (
      filters_value ? 'status'
      AND filters_value->>'status' NOT IN ('Draft', 'Sent', 'Viewed', 'Paid', 'Overdue', 'Cancelled')
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVOICE_READ_INVALID_REQUEST';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'mode', 'list',
    'page', page_value,
    'per_page', per_page_value,
    'sort', sort_value,
    'order', order_value,
    'filters', filters_value
  );
EXCEPTION
  WHEN numeric_value_out_of_range THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVOICE_READ_INVALID_REQUEST';
END;
$function$;

CREATE FUNCTION private.billing_invoice_exact_json(p_invoice public.invoices)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'id', p_invoice.id::text,
    'created_at', p_invoice.created_at,
    'updated_at', p_invoice.updated_at,
    'billing_account_id', p_invoice.billing_account_id::text,
    'company_id', p_invoice.company_id::text,
    'project_id', p_invoice.project_id::text,
    'deal_id', p_invoice.deal_id::text,
    'invoice_number', p_invoice.invoice_number,
    'description', p_invoice.description,
    'amount_minor', p_invoice.amount_minor::text,
    'currency', p_invoice.currency,
    'currency_policy_version', p_invoice.currency_policy_version,
    'tax_rate_numerator', p_invoice.tax_rate_numerator::text,
    'tax_rate_denominator', p_invoice.tax_rate_denominator::text,
    'submitted_percentage', p_invoice.submitted_percentage,
    'rate_policy_version', p_invoice.rate_policy_version,
    'tax_amount_minor', p_invoice.tax_amount_minor::text,
    'total_amount_minor', p_invoice.total_amount_minor::text,
    'rounding_policy_version', p_invoice.rounding_policy_version,
    'line_items_exact', p_invoice.line_items_exact,
    'status', p_invoice.status,
    'issue_date', p_invoice.issue_date,
    'due_date', p_invoice.due_date,
    'paid_date', p_invoice.paid_date,
    'payment_method', p_invoice.payment_method,
    'payment_reference', p_invoice.payment_reference,
    'notes', p_invoice.notes,
    'terms', p_invoice.terms
  );
$function$;

CREATE FUNCTION private.billing_invoice_legacy_json(p_invoice public.invoices)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'id', p_invoice.id::text,
    'created_at', p_invoice.created_at,
    'updated_at', p_invoice.updated_at,
    'billing_account_id', p_invoice.billing_account_id::text,
    'company_id', p_invoice.company_id::text,
    'project_id', p_invoice.project_id::text,
    'deal_id', p_invoice.deal_id::text,
    'invoice_number', p_invoice.invoice_number,
    'description', p_invoice.description,
    'amount', private.billing_format_usd_minor(p_invoice.amount_minor),
    'currency', p_invoice.currency,
    'tax_rate', pg_catalog.to_char(p_invoice.tax_rate, 'FM990.000000000'),
    'tax_rate_numerator', p_invoice.tax_rate_numerator::text,
    'tax_rate_denominator', p_invoice.tax_rate_denominator::text,
    'submitted_percentage', p_invoice.submitted_percentage,
    'rate_policy_version', p_invoice.rate_policy_version,
    'tax_amount', private.billing_format_usd_minor(p_invoice.tax_amount_minor),
    'total_amount', private.billing_format_usd_minor(p_invoice.total_amount_minor),
    'line_items', p_invoice.line_items_exact,
    'status', p_invoice.status,
    'issue_date', p_invoice.issue_date,
    'due_date', p_invoice.due_date,
    'paid_date', p_invoice.paid_date,
    'payment_method', p_invoice.payment_method,
    'payment_reference', p_invoice.payment_reference,
    'notes', p_invoice.notes,
    'terms', p_invoice.terms
  );
$function$;

CREATE FUNCTION public.read_billing_invoices_exact(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  request_value jsonb := private.billing_validate_invoice_read_request(p_request);
  filters_value jsonb;
  data_value jsonb;
  total_value bigint;
  page_value integer;
  per_page_value integer;
  sort_value text;
  order_value text;
BEGIN
  IF request_value->>'mode' = 'get' THEN
    SELECT private.billing_invoice_exact_json(invoice)
    INTO data_value
    FROM public.invoices AS invoice
    WHERE invoice.id = (request_value->>'invoice_id')::bigint
      AND private.billing_has_capability(
        invoice.organization_id, invoice.billing_account_id, 'invoice.read'
      );
    RETURN pg_catalog.jsonb_build_object('data', data_value);
  END IF;

  filters_value := request_value->'filters';
  page_value := (request_value->>'page')::integer;
  per_page_value := (request_value->>'per_page')::integer;
  sort_value := request_value->>'sort';
  order_value := request_value->>'order';

  SELECT pg_catalog.count(*) INTO total_value
  FROM public.invoices AS invoice
  WHERE private.billing_has_capability(
      invoice.organization_id, invoice.billing_account_id, 'invoice.read'
    )
    AND (
      NOT filters_value ? 'billing_account_id'
      OR invoice.billing_account_id = (filters_value->>'billing_account_id')::uuid
    )
    AND (NOT filters_value ? 'status' OR invoice.status = filters_value->>'status')
    AND (
      NOT filters_value ? 'invoice_number'
      OR invoice.invoice_number = filters_value->>'invoice_number'
    );

  SELECT COALESCE(pg_catalog.jsonb_agg(rows.data), '[]'::jsonb)
  INTO data_value
  FROM (
    SELECT private.billing_invoice_exact_json(invoice) AS data
    FROM public.invoices AS invoice
    WHERE private.billing_has_capability(
        invoice.organization_id, invoice.billing_account_id, 'invoice.read'
      )
      AND (
        NOT filters_value ? 'billing_account_id'
        OR invoice.billing_account_id = (filters_value->>'billing_account_id')::uuid
      )
      AND (NOT filters_value ? 'status' OR invoice.status = filters_value->>'status')
      AND (
        NOT filters_value ? 'invoice_number'
        OR invoice.invoice_number = filters_value->>'invoice_number'
      )
    ORDER BY
      CASE WHEN sort_value = 'id' AND order_value = 'ASC' THEN invoice.id END ASC,
      CASE WHEN sort_value = 'id' AND order_value = 'DESC' THEN invoice.id END DESC,
      CASE WHEN sort_value = 'created_at' AND order_value = 'ASC' THEN invoice.created_at END ASC,
      CASE WHEN sort_value = 'created_at' AND order_value = 'DESC' THEN invoice.created_at END DESC,
      CASE WHEN sort_value = 'updated_at' AND order_value = 'ASC' THEN invoice.updated_at END ASC,
      CASE WHEN sort_value = 'updated_at' AND order_value = 'DESC' THEN invoice.updated_at END DESC,
      CASE WHEN sort_value = 'invoice_number' AND order_value = 'ASC' THEN invoice.invoice_number END ASC,
      CASE WHEN sort_value = 'invoice_number' AND order_value = 'DESC' THEN invoice.invoice_number END DESC,
      CASE WHEN sort_value = 'issue_date' AND order_value = 'ASC' THEN invoice.issue_date END ASC,
      CASE WHEN sort_value = 'issue_date' AND order_value = 'DESC' THEN invoice.issue_date END DESC,
      CASE WHEN sort_value = 'due_date' AND order_value = 'ASC' THEN invoice.due_date END ASC NULLS LAST,
      CASE WHEN sort_value = 'due_date' AND order_value = 'DESC' THEN invoice.due_date END DESC NULLS LAST,
      CASE WHEN sort_value = 'status' AND order_value = 'ASC' THEN invoice.status END ASC,
      CASE WHEN sort_value = 'status' AND order_value = 'DESC' THEN invoice.status END DESC,
      invoice.id ASC
    LIMIT per_page_value
    OFFSET (page_value - 1) * per_page_value
  ) AS rows;
  RETURN pg_catalog.jsonb_build_object('data', data_value, 'total', total_value);
END;
$function$;

CREATE FUNCTION public.read_billing_invoices_legacy_compat(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  request_value jsonb := private.billing_validate_invoice_read_request(p_request);
  filters_value jsonb;
  data_value jsonb;
  total_value bigint;
  page_value integer;
  per_page_value integer;
  sort_value text;
  order_value text;
BEGIN
  IF request_value->>'mode' = 'get' THEN
    SELECT private.billing_invoice_legacy_json(invoice)
    INTO data_value
    FROM public.invoices AS invoice
    WHERE invoice.id = (request_value->>'invoice_id')::bigint
      AND private.billing_has_capability(
        invoice.organization_id, invoice.billing_account_id, 'invoice.read'
      );
    RETURN pg_catalog.jsonb_build_object('data', data_value);
  END IF;
  filters_value := request_value->'filters';
  page_value := (request_value->>'page')::integer;
  per_page_value := (request_value->>'per_page')::integer;
  sort_value := request_value->>'sort';
  order_value := request_value->>'order';
  SELECT pg_catalog.count(*) INTO total_value
  FROM public.invoices AS invoice
  WHERE private.billing_has_capability(
      invoice.organization_id, invoice.billing_account_id, 'invoice.read'
    )
    AND (
      NOT filters_value ? 'billing_account_id'
      OR invoice.billing_account_id = (filters_value->>'billing_account_id')::uuid
    )
    AND (NOT filters_value ? 'status' OR invoice.status = filters_value->>'status')
    AND (
      NOT filters_value ? 'invoice_number'
      OR invoice.invoice_number = filters_value->>'invoice_number'
    );
  SELECT COALESCE(pg_catalog.jsonb_agg(rows.data), '[]'::jsonb)
  INTO data_value
  FROM (
    SELECT private.billing_invoice_legacy_json(invoice) AS data
    FROM public.invoices AS invoice
    WHERE private.billing_has_capability(
        invoice.organization_id, invoice.billing_account_id, 'invoice.read'
      )
      AND (
        NOT filters_value ? 'billing_account_id'
        OR invoice.billing_account_id = (filters_value->>'billing_account_id')::uuid
      )
      AND (NOT filters_value ? 'status' OR invoice.status = filters_value->>'status')
      AND (
        NOT filters_value ? 'invoice_number'
        OR invoice.invoice_number = filters_value->>'invoice_number'
      )
    ORDER BY
      CASE WHEN sort_value = 'id' AND order_value = 'ASC' THEN invoice.id END ASC,
      CASE WHEN sort_value = 'id' AND order_value = 'DESC' THEN invoice.id END DESC,
      CASE WHEN sort_value = 'created_at' AND order_value = 'ASC' THEN invoice.created_at END ASC,
      CASE WHEN sort_value = 'created_at' AND order_value = 'DESC' THEN invoice.created_at END DESC,
      CASE WHEN sort_value = 'updated_at' AND order_value = 'ASC' THEN invoice.updated_at END ASC,
      CASE WHEN sort_value = 'updated_at' AND order_value = 'DESC' THEN invoice.updated_at END DESC,
      CASE WHEN sort_value = 'invoice_number' AND order_value = 'ASC' THEN invoice.invoice_number END ASC,
      CASE WHEN sort_value = 'invoice_number' AND order_value = 'DESC' THEN invoice.invoice_number END DESC,
      CASE WHEN sort_value = 'issue_date' AND order_value = 'ASC' THEN invoice.issue_date END ASC,
      CASE WHEN sort_value = 'issue_date' AND order_value = 'DESC' THEN invoice.issue_date END DESC,
      CASE WHEN sort_value = 'due_date' AND order_value = 'ASC' THEN invoice.due_date END ASC NULLS LAST,
      CASE WHEN sort_value = 'due_date' AND order_value = 'DESC' THEN invoice.due_date END DESC NULLS LAST,
      CASE WHEN sort_value = 'status' AND order_value = 'ASC' THEN invoice.status END ASC,
      CASE WHEN sort_value = 'status' AND order_value = 'DESC' THEN invoice.status END DESC,
      invoice.id ASC
    LIMIT per_page_value
    OFFSET (page_value - 1) * per_page_value
  ) AS rows;
  RETURN pg_catalog.jsonb_build_object('data', data_value, 'total', total_value);
END;
$function$;

CREATE FUNCTION private.billing_parse_optional_relation_id(p_value jsonb)
RETURNS bigint
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  value_text text;
BEGIN
  IF p_value IS NULL OR p_value = 'null'::jsonb THEN
    RETURN NULL;
  END IF;
  IF pg_catalog.jsonb_typeof(p_value) NOT IN ('string', 'number') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVOICE_SAVE_INVALID_REQUEST';
  END IF;
  value_text := CASE
    WHEN pg_catalog.jsonb_typeof(p_value) = 'string' THEN p_value #>> '{}'
    ELSE p_value::text
  END;
  IF pg_catalog.octet_length(value_text) > 64
    OR value_text !~ '^[1-9][0-9]*$'
    OR value_text::numeric > 9223372036854775807::numeric
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVOICE_SAVE_INVALID_REQUEST';
  END IF;
  RETURN value_text::bigint;
EXCEPTION
  WHEN numeric_value_out_of_range THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVOICE_SAVE_INVALID_REQUEST';
END;
$function$;

CREATE FUNCTION public.save_billing_invoice_exact(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  request_keys text[];
  money_keys text[];
  rate_keys text[];
  account_id_value uuid;
  account_record public.billing_accounts%ROWTYPE;
  invoice_record public.invoices%ROWTYPE;
  sale_id_value bigint;
  invoice_id_value bigint;
  project_id_value bigint;
  deal_id_value bigint;
  money_value jsonb;
  rate_value jsonb;
  line_items_value jsonb;
  amount_minor_value bigint;
  tax_minor_value bigint;
  total_minor_numeric numeric;
  line_total numeric;
  issue_date_value date;
  due_date_value date;
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR pg_catalog.jsonb_typeof(p_request) IS DISTINCT FROM 'object'
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVOICE_SAVE_NOT_AUTHORIZED';
  END IF;
  SELECT COALESCE(pg_catalog.array_agg(key ORDER BY key), ARRAY[]::text[])
  INTO request_keys
  FROM pg_catalog.jsonb_object_keys(p_request) AS keys(key);
  IF NOT request_keys <@ ARRAY[
      'amount', 'billing_account_id', 'deal_id', 'description', 'due_date',
      'id', 'invoice_number', 'issue_date', 'line_items', 'notes',
      'payment_method', 'payment_reference', 'project_id', 'status',
      'tax_rate', 'terms'
    ]::text[]
    OR NOT ARRAY['amount', 'billing_account_id', 'invoice_number', 'line_items', 'status', 'tax_rate']::text[] <@ request_keys
    OR pg_catalog.jsonb_typeof(p_request->'billing_account_id') IS DISTINCT FROM 'string'
    OR (p_request->>'billing_account_id') !~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR pg_catalog.jsonb_typeof(p_request->'invoice_number') IS DISTINCT FROM 'string'
    OR pg_catalog.btrim(p_request->>'invoice_number') = ''
    OR pg_catalog.octet_length(p_request->>'invoice_number') > 100
    OR pg_catalog.jsonb_typeof(p_request->'status') IS DISTINCT FROM 'string'
    OR p_request->>'status' IS DISTINCT FROM 'Draft'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVOICE_SAVE_INVALID_REQUEST';
  END IF;

  SELECT pg_catalog.array_agg(key ORDER BY key) INTO money_keys
  FROM pg_catalog.jsonb_object_keys(p_request->'amount') AS keys(key);
  SELECT pg_catalog.array_agg(key ORDER BY key) INTO rate_keys
  FROM pg_catalog.jsonb_object_keys(p_request->'tax_rate') AS keys(key);
  IF pg_catalog.jsonb_typeof(p_request->'amount') IS DISTINCT FROM 'object'
    OR money_keys IS DISTINCT FROM ARRAY['amount_minor', 'currency']::text[]
    OR pg_catalog.jsonb_typeof(p_request->'tax_rate') IS DISTINCT FROM 'object'
    OR rate_keys IS DISTINCT FROM ARRAY[
      'denominator', 'kind', 'numerator', 'rate_policy_version', 'submitted_percentage'
    ]::text[]
    OR p_request->'tax_rate'->>'kind' IS DISTINCT FROM 'ordinary_percentage'
    OR p_request->'tax_rate'->>'rate_policy_version' IS DISTINCT FROM 'ordinary-percentage-v1'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVOICE_SAVE_INVALID_REQUEST';
  END IF;

  BEGIN
    money_value := public.financial_parse_usd_money(p_request->'amount', 'usd-v1');
    rate_value := public.financial_parse_ordinary_percentage(
      p_request->'tax_rate'->'submitted_percentage',
      'ordinary-percentage-v1'
    );
    IF rate_value->>'numerator' IS DISTINCT FROM p_request->'tax_rate'->>'numerator'
      OR rate_value->>'denominator' IS DISTINCT FROM p_request->'tax_rate'->>'denominator'
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVOICE_SAVE_INVALID_REQUEST';
    END IF;
    line_items_value := private.billing_validate_exact_line_items(p_request->'line_items');
    amount_minor_value := (money_value->>'amount_minor')::bigint;
    tax_minor_value := (
      public.financial_round_usd_minor(
        pg_catalog.jsonb_build_object(
          'numerator', (
            amount_minor_value::numeric * (rate_value->>'numerator')::numeric
          )::text,
          'denominator', rate_value->>'denominator',
          'currency', 'USD'
        ),
        'usd-v1', 'half-away-from-zero-v1', 2
      )->>'amount_minor'
    )::bigint;
    total_minor_numeric := amount_minor_value::numeric + tax_minor_value::numeric;
    IF total_minor_numeric < -9223372036854775808::numeric
      OR total_minor_numeric > 9223372036854775807::numeric
    THEN
      RAISE EXCEPTION USING ERRCODE = '22003', MESSAGE = 'FINANCIAL_OVERFLOW';
    END IF;
    IF pg_catalog.jsonb_array_length(line_items_value) > 0 THEN
      SELECT pg_catalog.sum((item->'extended_amount'->>'amount_minor')::numeric)
      INTO line_total
      FROM pg_catalog.jsonb_array_elements(line_items_value) AS items(item);
      IF line_total IS DISTINCT FROM amount_minor_value::numeric THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVOICE_SAVE_INVALID_REQUEST';
      END IF;
    END IF;
    project_id_value := private.billing_parse_optional_relation_id(p_request->'project_id');
    deal_id_value := private.billing_parse_optional_relation_id(p_request->'deal_id');
  EXCEPTION
    WHEN SQLSTATE '22003' OR SQLSTATE '22012' OR SQLSTATE '22023' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVOICE_SAVE_INVALID_REQUEST';
  END;

  IF p_request ? 'description' AND pg_catalog.jsonb_typeof(p_request->'description') NOT IN ('string', 'null')
    OR p_request ? 'notes' AND pg_catalog.jsonb_typeof(p_request->'notes') NOT IN ('string', 'null')
    OR p_request ? 'terms' AND pg_catalog.jsonb_typeof(p_request->'terms') NOT IN ('string', 'null')
    OR p_request ? 'payment_method' AND pg_catalog.jsonb_typeof(p_request->'payment_method') NOT IN ('string', 'null')
    OR p_request ? 'payment_reference' AND pg_catalog.jsonb_typeof(p_request->'payment_reference') NOT IN ('string', 'null')
    OR COALESCE(pg_catalog.octet_length(p_request->>'description'), 0) > 2000
    OR COALESCE(pg_catalog.octet_length(p_request->>'notes'), 0) > 10000
    OR COALESCE(pg_catalog.octet_length(p_request->>'terms'), 0) > 5000
    OR COALESCE(pg_catalog.octet_length(p_request->>'payment_reference'), 0) > 500
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVOICE_SAVE_INVALID_REQUEST';
  END IF;

  BEGIN
    IF p_request ? 'issue_date' THEN
      IF pg_catalog.jsonb_typeof(p_request->'issue_date') IS DISTINCT FROM 'string'
        OR (p_request->>'issue_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVOICE_SAVE_INVALID_REQUEST';
      END IF;
      issue_date_value := (p_request->>'issue_date')::date;
    ELSE
      issue_date_value := CURRENT_DATE;
    END IF;
    IF p_request ? 'due_date' AND p_request->'due_date' <> 'null'::jsonb THEN
      IF pg_catalog.jsonb_typeof(p_request->'due_date') IS DISTINCT FROM 'string'
        OR (p_request->>'due_date') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVOICE_SAVE_INVALID_REQUEST';
      END IF;
      due_date_value := (p_request->>'due_date')::date;
    END IF;
  EXCEPTION
    WHEN datetime_field_overflow OR invalid_datetime_format THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVOICE_SAVE_INVALID_REQUEST';
  END;

  account_id_value := (p_request->>'billing_account_id')::uuid;
  SELECT account.* INTO account_record
  FROM public.billing_accounts AS account
  WHERE account.id = account_id_value
    AND account.company_id IS NOT NULL
    AND account.billing_status <> 'closed';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVOICE_SAVE_NOT_AUTHORIZED';
  END IF;

  SELECT sale.id INTO sale_id_value
  FROM public.sales AS sale
  WHERE sale.user_id = (SELECT auth.uid())
    AND NOT sale.disabled;
  IF sale_id_value IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVOICE_SAVE_NOT_AUTHORIZED';
  END IF;

  IF p_request ? 'id' THEN
    invoice_id_value := private.billing_parse_optional_relation_id(p_request->'id');
    SELECT invoice.* INTO invoice_record
    FROM public.invoices AS invoice
    WHERE invoice.id = invoice_id_value
    FOR UPDATE;
    IF NOT FOUND
      OR invoice_record.billing_account_id <> account_id_value
      OR invoice_record.status <> 'Draft'
      OR NOT private.billing_has_capability(
        invoice_record.organization_id, invoice_record.billing_account_id, 'invoice.update'
      )
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVOICE_SAVE_NOT_AUTHORIZED';
    END IF;

    UPDATE public.invoices
    SET
      project_id = project_id_value,
      deal_id = deal_id_value,
      invoice_number = p_request->>'invoice_number',
      description = p_request->>'description',
      amount_minor = amount_minor_value,
      currency = 'USD',
      currency_policy_version = 'usd-v1',
      tax_rate_numerator = (rate_value->>'numerator')::bigint,
      tax_rate_denominator = (rate_value->>'denominator')::bigint,
      submitted_percentage = rate_value->>'submitted_percentage',
      rate_policy_version = 'ordinary-percentage-v1',
      tax_amount_minor = tax_minor_value,
      total_amount_minor = total_minor_numeric::bigint,
      rounding_policy_version = 'half-away-from-zero-v1',
      line_items_exact = line_items_value,
      status = 'Draft',
      issue_date = issue_date_value,
      due_date = due_date_value,
      payment_method = p_request->>'payment_method',
      payment_reference = p_request->>'payment_reference',
      notes = p_request->>'notes',
      terms = COALESCE(p_request->>'terms', invoice_record.terms)
    WHERE id = invoice_id_value
    RETURNING * INTO invoice_record;
  ELSE
    IF NOT private.billing_has_capability(
      account_record.organization_id, account_record.id, 'invoice.create'
    ) OR NOT EXISTS (
      SELECT 1
      FROM public.billing_account_owners AS owner
      WHERE owner.organization_id = account_record.organization_id
        AND owner.account_id = account_record.id
        AND owner.sales_id = sale_id_value
        AND owner.effective_until IS NULL
    ) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVOICE_SAVE_NOT_AUTHORIZED';
    END IF;

    INSERT INTO public.invoices (
      organization_id, billing_account_id, company_id, project_id, deal_id, sales_id,
      invoice_number, description, amount, tax_rate, tax_amount, total_amount,
      line_items, status, issue_date, due_date, payment_method, payment_reference,
      notes, terms, amount_minor, currency, currency_policy_version,
      tax_rate_numerator, tax_rate_denominator, submitted_percentage,
      rate_policy_version, tax_amount_minor, total_amount_minor,
      rounding_policy_version, line_items_exact, line_items_legacy_evidence
    ) VALUES (
      account_record.organization_id, account_record.id, account_record.company_id,
      project_id_value, deal_id_value, sale_id_value,
      p_request->>'invoice_number', p_request->>'description', 0, 0, 0, 0,
      '[]'::jsonb, 'Draft', issue_date_value, due_date_value,
      p_request->>'payment_method', p_request->>'payment_reference',
      p_request->>'notes', COALESCE(p_request->>'terms', 'Payment due within 30 days of invoice date.'),
      amount_minor_value, 'USD', 'usd-v1',
      (rate_value->>'numerator')::bigint, (rate_value->>'denominator')::bigint,
      rate_value->>'submitted_percentage', 'ordinary-percentage-v1',
      tax_minor_value, total_minor_numeric::bigint, 'half-away-from-zero-v1',
      line_items_value, '[]'::jsonb
    ) RETURNING * INTO invoice_record;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'data', private.billing_invoice_exact_json(invoice_record)
  );
END;
$function$;

REVOKE ALL ON TABLE public.invoices FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.invoices_id_seq FROM anon, authenticated;

ALTER FUNCTION private.billing_legacy_decimal_to_minor(numeric) OWNER TO postgres;
ALTER FUNCTION private.billing_legacy_json_decimal_text(jsonb) OWNER TO postgres;
ALTER FUNCTION private.billing_legacy_json_money_minor(jsonb) OWNER TO postgres;
ALTER FUNCTION private.billing_legacy_quantity_ratio(jsonb) OWNER TO postgres;
ALTER FUNCTION private.billing_validate_exact_line_items(jsonb) OWNER TO postgres;
ALTER FUNCTION private.billing_convert_legacy_line_items(jsonb) OWNER TO postgres;
ALTER FUNCTION private.billing_format_usd_minor(bigint) OWNER TO postgres;
ALTER FUNCTION private.billing_exact_line_items_to_legacy(jsonb) OWNER TO postgres;
ALTER FUNCTION private.billing_invoice_sync_exact() OWNER TO postgres;
ALTER FUNCTION private.billing_automation_grant_sync_exact() OWNER TO postgres;
ALTER FUNCTION private.billing_automation_execution_sync_exact() OWNER TO postgres;
ALTER FUNCTION private.billing_validate_effect_discriminator(jsonb) OWNER TO postgres;
ALTER FUNCTION private.billing_automation_fingerprints(uuid, uuid, text, text, text, text, jsonb, jsonb) OWNER TO postgres;
ALTER FUNCTION private.billing_consume_automation_grant(uuid, uuid, text, text, text, text, jsonb, text, jsonb) OWNER TO postgres;
ALTER FUNCTION public.execute_billing_automation_command(uuid, uuid, text, text, text, text, jsonb, text) OWNER TO postgres;
ALTER FUNCTION private.billing_finalize_evidence_inspection(uuid, uuid, text, text, text, text, text) OWNER TO postgres;
ALTER FUNCTION public.finalize_billing_evidence_inspection(uuid, uuid, text, text, text, text, text) OWNER TO postgres;
ALTER FUNCTION private.billing_validate_invoice_read_request(jsonb) OWNER TO postgres;
ALTER FUNCTION private.billing_invoice_exact_json(public.invoices) OWNER TO postgres;
ALTER FUNCTION private.billing_invoice_legacy_json(public.invoices) OWNER TO postgres;
ALTER FUNCTION private.billing_parse_optional_relation_id(jsonb) OWNER TO postgres;
ALTER FUNCTION public.read_billing_invoices_exact(jsonb) OWNER TO postgres;
ALTER FUNCTION public.read_billing_invoices_legacy_compat(jsonb) OWNER TO postgres;
ALTER FUNCTION public.save_billing_invoice_exact(jsonb) OWNER TO postgres;

REVOKE ALL ON FUNCTION private.billing_legacy_decimal_to_minor(numeric) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_legacy_json_decimal_text(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_legacy_json_money_minor(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_legacy_quantity_ratio(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_validate_exact_line_items(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_convert_legacy_line_items(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_format_usd_minor(bigint) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_exact_line_items_to_legacy(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_invoice_sync_exact() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_automation_grant_sync_exact() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_automation_execution_sync_exact() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_validate_effect_discriminator(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_automation_fingerprints(uuid, uuid, text, text, text, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_consume_automation_grant(uuid, uuid, text, text, text, text, jsonb, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_finalize_evidence_inspection(uuid, uuid, text, text, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_validate_invoice_read_request(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_invoice_exact_json(public.invoices) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_invoice_legacy_json(public.invoices) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_parse_optional_relation_id(jsonb) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.execute_billing_automation_command(uuid, uuid, text, text, text, text, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finalize_billing_evidence_inspection(uuid, uuid, text, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.read_billing_invoices_exact(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.read_billing_invoices_legacy_compat(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_billing_invoice_exact(jsonb) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.execute_billing_automation_command(uuid, uuid, text, text, text, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_billing_evidence_inspection(uuid, uuid, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.read_billing_invoices_exact(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.read_billing_invoices_legacy_compat(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_billing_invoice_exact(jsonb) TO authenticated, service_role;

COMMIT;
