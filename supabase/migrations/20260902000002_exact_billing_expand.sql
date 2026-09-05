-- Phase 3: atomically cut invoices and automation over to exact authority.

BEGIN;

-- Exact invoice reads require an explicit historical issue date. Refuse the
-- cutover before defining any Phase 3 helper or altering any table when that
-- legacy fact is unresolved; an operator-approved remediation must happen in
-- a separate, auditable change rather than being guessed here.
DO $block$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.invoices AS invoice
    WHERE invoice.issue_date IS NULL
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23502',
      MESSAGE = 'EXACT_BILLING_LEGACY_ISSUE_DATE_REQUIRED';
  END IF;
END;
$block$;

CREATE OR REPLACE FUNCTION private.billing_legacy_decimal_ratio(p_value jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
  value_text text;
  negative boolean;
  unsigned_text text;
  whole_text text;
  fraction_text text;
  scaled_text text;
  denominator_text text;
BEGIN
  IF p_value IS NULL
    OR pg_catalog.jsonb_typeof(p_value) NOT IN ('number', 'string')
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'EXACT_LEGACY_DECIMAL_INVALID';
  END IF;

  value_text := p_value #>> '{}';
  IF pg_catalog.octet_length(value_text) > 64
    OR value_text !~ '^-?(0|[1-9][0-9]*)(\.[0-9]+)?$'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'EXACT_LEGACY_DECIMAL_INVALID';
  END IF;

  negative := pg_catalog.left(value_text, 1) = '-';
  unsigned_text := CASE WHEN negative THEN pg_catalog.substr(value_text, 2) ELSE value_text END;
  whole_text := pg_catalog.split_part(unsigned_text, '.', 1);
  fraction_text := CASE
    WHEN pg_catalog.strpos(unsigned_text, '.') = 0 THEN ''
    ELSE pg_catalog.split_part(unsigned_text, '.', 2)
  END;
  scaled_text := pg_catalog.ltrim(whole_text || fraction_text, '0');
  IF scaled_text = '' THEN
    scaled_text := '0';
  ELSIF negative THEN
    scaled_text := '-' || scaled_text;
  END IF;
  denominator_text := '1' || pg_catalog.repeat('0', pg_catalog.length(fraction_text));

  RETURN private.financial_reduce_ratio(
    pg_catalog.to_jsonb(scaled_text),
    pg_catalog.to_jsonb(denominator_text),
    true
  );
END;
$function$;

CREATE OR REPLACE FUNCTION private.billing_legacy_money_minor(p_value jsonb)
RETURNS bigint
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
  value_text text;
  minor_value numeric;
BEGIN
  IF p_value IS NULL
    OR pg_catalog.jsonb_typeof(p_value) NOT IN ('number', 'string')
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'EXACT_LEGACY_MONEY_INVALID';
  END IF;
  value_text := p_value #>> '{}';
  IF pg_catalog.octet_length(value_text) > 64
    OR value_text !~ '^-?(0|[1-9][0-9]*)(\.[0-9]+)?$'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'EXACT_LEGACY_MONEY_INVALID';
  END IF;
  minor_value := value_text::numeric * 100::numeric;
  IF minor_value <> pg_catalog.trunc(minor_value)
    OR minor_value < '-9223372036854775808'::numeric
    OR minor_value > '9223372036854775807'::numeric
  THEN
    RAISE EXCEPTION USING ERRCODE = '22003', MESSAGE = 'EXACT_LEGACY_MONEY_INVALID';
  END IF;
  RETURN minor_value::bigint;
END;
$function$;

CREATE OR REPLACE FUNCTION private.billing_exact_money(p_value jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
  amount_text text;
BEGIN
  IF p_value IS NULL
    OR pg_catalog.jsonb_typeof(p_value) IS DISTINCT FROM 'object'
    OR NOT (p_value ?& ARRAY['amount_minor', 'currency'])
    OR EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_object_keys(p_value) AS key_name
      WHERE key_name NOT IN ('amount_minor', 'currency')
    )
    OR pg_catalog.jsonb_typeof(p_value->'amount_minor') IS DISTINCT FROM 'string'
    OR pg_catalog.jsonb_typeof(p_value->'currency') IS DISTINCT FROM 'string'
    OR p_value->>'currency' <> 'USD'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'FINANCIAL_INVALID_MONEY';
  END IF;
  amount_text := private.financial_canonical_integer_text(
    p_value->'amount_minor',
    true
  );
  RETURN pg_catalog.jsonb_build_object('amount_minor', amount_text, 'currency', 'USD');
END;
$function$;

CREATE OR REPLACE FUNCTION private.billing_canonical_date(
  p_value jsonb,
  p_required boolean
)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
  value_text text;
  parsed_date date;
BEGIN
  IF p_value IS NULL OR pg_catalog.jsonb_typeof(p_value) = 'null' THEN
    IF p_required THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid';
    END IF;
    RETURN NULL;
  END IF;
  IF pg_catalog.jsonb_typeof(p_value) IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid';
  END IF;

  value_text := p_value #>> '{}';
  IF pg_catalog.octet_length(value_text) <> 10
    OR value_text !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid';
  END IF;

  BEGIN
    parsed_date := value_text::date;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid';
  END;
  IF pg_catalog.to_char(parsed_date, 'YYYY-MM-DD') <> value_text THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid';
  END IF;
  RETURN parsed_date;
END;
$function$;

CREATE OR REPLACE FUNCTION private.billing_exact_rate(p_value jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  reduced jsonb;
  parsed jsonb;
BEGIN
  IF p_value IS NULL
    OR pg_catalog.jsonb_typeof(p_value) IS DISTINCT FROM 'object'
    OR NOT (p_value ?& ARRAY[
      'kind', 'numerator', 'denominator', 'submitted_percentage', 'rate_policy_version'
    ])
    OR EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_object_keys(p_value) AS key_name
      WHERE key_name NOT IN (
        'kind', 'numerator', 'denominator', 'submitted_percentage', 'rate_policy_version'
      )
    )
    OR pg_catalog.jsonb_typeof(p_value->'numerator') IS DISTINCT FROM 'string'
    OR pg_catalog.jsonb_typeof(p_value->'denominator') IS DISTINCT FROM 'string'
    OR pg_catalog.jsonb_typeof(p_value->'submitted_percentage') IS DISTINCT FROM 'string'
    OR p_value->>'kind' <> 'ordinary_percentage'
    OR p_value->>'rate_policy_version' <> 'ordinary-percentage-v1'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'FINANCIAL_INVALID_RATE';
  END IF;

  reduced := private.financial_reduce_ratio(
    p_value->'numerator',
    p_value->'denominator',
    true
  );
  parsed := private.financial_parse_percentage(
    p_value->'submitted_percentage',
    'ordinary-percentage-v1'
  );
  IF reduced->>'numerator' IS DISTINCT FROM p_value->>'numerator'
    OR reduced->>'denominator' IS DISTINCT FROM p_value->>'denominator'
    OR parsed->>'numerator' IS DISTINCT FROM reduced->>'numerator'
    OR parsed->>'denominator' IS DISTINCT FROM reduced->>'denominator'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'FINANCIAL_INVALID_RATE';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'kind', 'ordinary_percentage',
    'numerator', reduced->>'numerator',
    'denominator', reduced->>'denominator',
    'submitted_percentage', parsed->>'submitted_percentage',
    'rate_policy_version', 'ordinary-percentage-v1'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION private.billing_exact_line_items(p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  item jsonb;
  quantity jsonb;
  unit_price jsonb;
  extended_amount jsonb;
  calculated_amount jsonb;
  normalized jsonb := '[]'::jsonb;
BEGIN
  IF p_items IS NULL OR pg_catalog.jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'FINANCIAL_INVALID_LINE_ITEMS';
  END IF;

  FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(p_items) LOOP
    IF pg_catalog.jsonb_typeof(item) IS DISTINCT FROM 'object'
      OR NOT (item ?& ARRAY[
        'quantity_ratio', 'unit_price', 'extended_amount',
        'currency_policy_version', 'rounding_policy_version'
      ])
      OR EXISTS (
        SELECT 1 FROM pg_catalog.jsonb_object_keys(item) AS key_name
        WHERE key_name NOT IN (
          'quantity_ratio', 'unit_price', 'extended_amount',
          'currency_policy_version', 'rounding_policy_version'
        )
      )
      OR item->>'currency_policy_version' <> 'usd-v1'
      OR item->>'rounding_policy_version' <> 'half-away-from-zero-v1'
      OR pg_catalog.jsonb_typeof(item->'quantity_ratio') IS DISTINCT FROM 'object'
      OR NOT (item->'quantity_ratio' ?& ARRAY['numerator', 'denominator'])
      OR EXISTS (
        SELECT 1 FROM pg_catalog.jsonb_object_keys(item->'quantity_ratio') AS key_name
        WHERE key_name NOT IN ('numerator', 'denominator')
      )
      OR pg_catalog.jsonb_typeof(item->'quantity_ratio'->'numerator') IS DISTINCT FROM 'string'
      OR pg_catalog.jsonb_typeof(item->'quantity_ratio'->'denominator') IS DISTINCT FROM 'string'
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'FINANCIAL_INVALID_LINE_ITEMS';
    END IF;

    quantity := private.financial_reduce_ratio(
      item->'quantity_ratio'->'numerator',
      item->'quantity_ratio'->'denominator',
      true
    );
    IF quantity IS DISTINCT FROM item->'quantity_ratio' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'FINANCIAL_INVALID_LINE_ITEMS';
    END IF;
    unit_price := private.billing_exact_money(item->'unit_price');
    extended_amount := private.billing_exact_money(item->'extended_amount');
    calculated_amount := private.financial_round_ratio(
      pg_catalog.to_jsonb(
        ((unit_price->>'amount_minor')::numeric * (quantity->>'numerator')::numeric)::text
      ),
      pg_catalog.to_jsonb(quantity->>'denominator'),
      'USD', 'usd-v1', 2::smallint, 'half-away-from-zero-v1'
    );
    IF calculated_amount IS DISTINCT FROM extended_amount THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'FINANCIAL_INVALID_LINE_ITEMS';
    END IF;
    normalized := normalized || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'quantity_ratio', quantity,
        'unit_price', unit_price,
        'extended_amount', extended_amount,
        'currency_policy_version', 'usd-v1',
        'rounding_policy_version', 'half-away-from-zero-v1'
      )
    );
  END LOOP;
  RETURN normalized;
END;
$function$;

CREATE OR REPLACE FUNCTION private.billing_convert_legacy_line_items(p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  item jsonb;
  converted jsonb := '[]'::jsonb;
BEGIN
  IF p_items IS NULL OR pg_catalog.jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'EXACT_LEGACY_LINE_ITEMS_INVALID';
  END IF;
  FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(p_items) LOOP
    IF pg_catalog.jsonb_typeof(item) IS DISTINCT FROM 'object'
      OR NOT (item ?& ARRAY['quantity', 'rate', 'amount'])
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'EXACT_LEGACY_LINE_ITEMS_INVALID';
    END IF;
    converted := converted || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'quantity_ratio', private.billing_legacy_decimal_ratio(item->'quantity'),
        'unit_price', pg_catalog.jsonb_build_object(
          'amount_minor', private.billing_legacy_money_minor(item->'rate')::text,
          'currency', 'USD'
        ),
        'extended_amount', pg_catalog.jsonb_build_object(
          'amount_minor', private.billing_legacy_money_minor(item->'amount')::text,
          'currency', 'USD'
        ),
        'currency_policy_version', 'usd-v1',
        'rounding_policy_version', 'half-away-from-zero-v1'
      )
    );
  END LOOP;
  RETURN private.billing_exact_line_items(converted);
END;
$function$;

CREATE OR REPLACE FUNCTION private.billing_minor_fixed_decimal(p_amount bigint)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $function$
  SELECT CASE WHEN p_amount < 0 THEN '-' ELSE '' END
    || pg_catalog.trunc(
      (CASE WHEN p_amount::numeric < 0 THEN -p_amount::numeric ELSE p_amount::numeric END)
      / 100::numeric
    )::text
    || '.'
    || pg_catalog.lpad(
      pg_catalog.mod(
        CASE WHEN p_amount::numeric < 0 THEN -p_amount::numeric ELSE p_amount::numeric END,
        100::numeric
      )::integer::text,
      2,
      '0'
    );
$function$;

CREATE OR REPLACE FUNCTION private.billing_legacy_execution_effect(
  p_execution_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  execution_record public.billing_automation_executions%ROWTYPE;
  evidence_record public.billing_evidence_objects%ROWTYPE;
  binding_count bigint;
BEGIN
  SELECT execution.*
  INTO execution_record
  FROM public.billing_automation_executions AS execution
  WHERE execution.id = p_execution_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'EXACT_BILLING_LEGACY_EXECUTION_NOT_FOUND';
  END IF;

  IF execution_record.command_name = 'evidence.inspect'
    OR execution_record.action_kind = 'evidence.inspection'
  THEN
    IF execution_record.command_name <> 'evidence.inspect'
      OR execution_record.action_kind <> 'evidence.inspection'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'EXACT_BILLING_LEGACY_EFFECT_CLASSIFICATION_AMBIGUOUS';
    END IF;

    SELECT pg_catalog.count(*)
    INTO binding_count
    FROM public.billing_evidence_objects AS evidence
    JOIN public.billing_automation_grants AS grant_row
      ON grant_row.id = execution_record.grant_id
      AND grant_row.principal_id = execution_record.principal_id
      AND grant_row.organization_id = execution_record.organization_id
      AND grant_row.account_id = execution_record.account_id
      AND grant_row.command_name = execution_record.command_name
      AND grant_row.policy_version = execution_record.policy_version
      AND grant_row.action_kind = execution_record.action_kind
    WHERE evidence.organization_id = execution_record.organization_id
      AND evidence.account_id = execution_record.account_id
      AND evidence.inspection_principal_id = execution_record.principal_id
      AND evidence.inspection_grant_id = execution_record.grant_id
      AND evidence.inspection_decided_at = execution_record.created_at
      AND evidence.inspection_status IN ('clean', 'rejected')
      AND evidence.inspection_reason_code IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.billing_audit_events AS audit
        WHERE audit.actor_type = 'automation'
          AND audit.actor_id = execution_record.principal_id
          AND audit.organization_id = execution_record.organization_id
          AND audit.account_id = execution_record.account_id
          AND audit.action = 'evidence.inspection'
          AND audit.subject_type = 'billing_evidence_objects'
          AND audit.subject_id = evidence.id::text
          AND audit.result = 'succeeded'
          AND audit.reason = evidence.inspection_reason_code
          AND audit.details = pg_catalog.jsonb_build_object(
            'decision', evidence.inspection_status
          )
          AND audit.created_at = execution_record.created_at
      );

    IF binding_count <> 1 THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001',
        MESSAGE = 'EXACT_BILLING_LEGACY_EVIDENCE_BINDING_AMBIGUOUS';
    END IF;

    SELECT evidence.*
    INTO STRICT evidence_record
    FROM public.billing_evidence_objects AS evidence
    WHERE evidence.organization_id = execution_record.organization_id
      AND evidence.account_id = execution_record.account_id
      AND evidence.inspection_principal_id = execution_record.principal_id
      AND evidence.inspection_grant_id = execution_record.grant_id
      AND evidence.inspection_decided_at = execution_record.created_at
      AND evidence.inspection_status IN ('clean', 'rejected')
      AND EXISTS (
        SELECT 1
        FROM public.billing_audit_events AS audit
        WHERE audit.actor_type = 'automation'
          AND audit.actor_id = execution_record.principal_id
          AND audit.organization_id = execution_record.organization_id
          AND audit.account_id = execution_record.account_id
          AND audit.action = 'evidence.inspection'
          AND audit.subject_type = 'billing_evidence_objects'
          AND audit.subject_id = evidence.id::text
          AND audit.result = 'succeeded'
          AND audit.reason = evidence.inspection_reason_code
          AND audit.details = pg_catalog.jsonb_build_object(
            'decision', evidence.inspection_status
          )
          AND audit.created_at = execution_record.created_at
      );

    RETURN pg_catalog.jsonb_build_object(
      'kind', 'evidence.inspection',
      'evidence_id', evidence_record.id::text,
      'decision', evidence_record.inspection_status,
      'reason_code', evidence_record.inspection_reason_code
    );
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'kind', 'general',
    'command_name', execution_record.command_name,
    'action_kind', execution_record.action_kind
  );
END;
$function$;

ALTER TABLE public.invoices
  ADD COLUMN amount_minor bigint,
  ADD COLUMN currency text,
  ADD COLUMN currency_policy_version text,
  ADD COLUMN tax_rate_kind text,
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
  ADD COLUMN currency text;

ALTER TABLE public.billing_automation_executions
  ADD COLUMN amount_minor bigint,
  ADD COLUMN currency text,
  ADD COLUMN request_fingerprint text,
  ADD COLUMN effect_fingerprint text;

CREATE TEMP TABLE exact_billing_conversion_exceptions (
  table_name text NOT NULL,
  row_id text NOT NULL,
  field_path text NOT NULL,
  reason_code text NOT NULL,
  PRIMARY KEY (table_name, row_id, field_path, reason_code)
) ON COMMIT DROP;

CREATE TEMP TABLE exact_billing_pre_identity (
  table_name text PRIMARY KEY,
  row_count bigint NOT NULL,
  ids jsonb NOT NULL
) ON COMMIT DROP;

INSERT INTO exact_billing_pre_identity (table_name, row_count, ids)
VALUES
  ('invoices', (SELECT pg_catalog.count(*) FROM public.invoices),
    (SELECT COALESCE(pg_catalog.jsonb_agg(id::text ORDER BY id), '[]'::jsonb) FROM public.invoices)),
  ('billing_automation_grants', (SELECT pg_catalog.count(*) FROM public.billing_automation_grants),
    (SELECT COALESCE(pg_catalog.jsonb_agg(id::text ORDER BY id), '[]'::jsonb) FROM public.billing_automation_grants)),
  ('billing_automation_executions', (SELECT pg_catalog.count(*) FROM public.billing_automation_executions),
    (SELECT COALESCE(pg_catalog.jsonb_agg(id::text ORDER BY id), '[]'::jsonb) FROM public.billing_automation_executions));

DO $block$
DECLARE
  invoice_record record;
  item_record record;
  amount_minor_value bigint;
  tax_minor_value bigint;
  total_minor_value bigint;
  parsed_rate jsonb;
  rounded_tax jsonb;
  converted_items jsonb;
  line_sum numeric;
  grant_record record;
  execution_record record;
BEGIN
  FOR invoice_record IN SELECT * FROM public.invoices ORDER BY id LOOP
    BEGIN
      amount_minor_value := private.billing_legacy_money_minor(
        pg_catalog.to_jsonb(invoice_record.amount::text)
      );
      tax_minor_value := private.billing_legacy_money_minor(
        pg_catalog.to_jsonb(invoice_record.tax_amount::text)
      );
      total_minor_value := private.billing_legacy_money_minor(
        pg_catalog.to_jsonb(invoice_record.total_amount::text)
      );
      parsed_rate := private.financial_parse_percentage(
        pg_catalog.to_jsonb(pg_catalog.trim_scale(invoice_record.tax_rate)::text || '%'),
        'ordinary-percentage-v1'
      );
      rounded_tax := private.financial_round_ratio(
        pg_catalog.to_jsonb(
          (amount_minor_value::numeric * (parsed_rate->>'numerator')::numeric)::text
        ),
        pg_catalog.to_jsonb(parsed_rate->>'denominator'),
        'USD', 'usd-v1', 2::smallint, 'half-away-from-zero-v1'
      );
      IF (rounded_tax->>'amount_minor')::bigint <> tax_minor_value
        OR amount_minor_value::numeric + tax_minor_value::numeric <> total_minor_value::numeric
      THEN
        INSERT INTO exact_billing_conversion_exceptions
        VALUES ('invoices', invoice_record.id::text, 'totals', 'LEGACY_TOTAL_RECONCILIATION_FAILED')
        ON CONFLICT DO NOTHING;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO exact_billing_conversion_exceptions
      VALUES ('invoices', invoice_record.id::text, 'money_or_rate', 'LEGACY_VALUE_INVALID')
      ON CONFLICT DO NOTHING;
    END;

    BEGIN
      converted_items := private.billing_convert_legacy_line_items(invoice_record.line_items);
      IF pg_catalog.jsonb_array_length(converted_items) > 0 THEN
        SELECT COALESCE(pg_catalog.sum((item->'extended_amount'->>'amount_minor')::numeric), 0)
        INTO line_sum
        FROM pg_catalog.jsonb_array_elements(converted_items) AS item;
        IF line_sum <> amount_minor_value::numeric THEN
          INSERT INTO exact_billing_conversion_exceptions
          VALUES ('invoices', invoice_record.id::text, 'line_items', 'LEGACY_LINE_ITEMS_RECONCILIATION_FAILED')
          ON CONFLICT DO NOTHING;
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO exact_billing_conversion_exceptions
      VALUES ('invoices', invoice_record.id::text, 'line_items', 'LEGACY_LINE_ITEMS_INVALID')
      ON CONFLICT DO NOTHING;
    END;
  END LOOP;

  FOR grant_record IN SELECT * FROM public.billing_automation_grants ORDER BY id LOOP
    BEGIN
      IF grant_record.max_amount IS NOT NULL THEN
        PERFORM private.billing_legacy_money_minor(pg_catalog.to_jsonb(grant_record.max_amount::text));
      END IF;
      IF private.billing_legacy_money_minor(
        pg_catalog.to_jsonb(grant_record.total_amount_consumed::text)
      ) < 0 THEN
        RAISE EXCEPTION 'negative';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO exact_billing_conversion_exceptions
      VALUES ('billing_automation_grants', grant_record.id::text, 'amounts', 'LEGACY_AUTOMATION_AMOUNT_INVALID')
      ON CONFLICT DO NOTHING;
    END;
  END LOOP;

  FOR execution_record IN SELECT * FROM public.billing_automation_executions ORDER BY id LOOP
    BEGIN
      IF private.billing_legacy_money_minor(pg_catalog.to_jsonb(execution_record.amount::text)) < 0 THEN
        RAISE EXCEPTION 'negative';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO exact_billing_conversion_exceptions
      VALUES ('billing_automation_executions', execution_record.id::text, 'amount', 'LEGACY_AUTOMATION_AMOUNT_INVALID')
      ON CONFLICT DO NOTHING;
    END;

    BEGIN
      PERFORM private.billing_legacy_execution_effect(execution_record.id);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO exact_billing_conversion_exceptions
      VALUES (
        'billing_automation_executions', execution_record.id::text,
        'effect_binding', 'LEGACY_AUTOMATION_EFFECT_AMBIGUOUS'
      )
      ON CONFLICT DO NOTHING;
    END;
  END LOOP;

  IF EXISTS (SELECT 1 FROM exact_billing_conversion_exceptions) THEN
    SELECT * INTO item_record
    FROM exact_billing_conversion_exceptions
    ORDER BY table_name, row_id, field_path, reason_code
    LIMIT 1;
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = pg_catalog.format(
        'EXACT_BILLING_CONVERSION_ABORTED table=%s id=%s field=%s reason=%s',
        item_record.table_name,
        item_record.row_id,
        item_record.field_path,
        item_record.reason_code
      );
  END IF;
END;
$block$;

ALTER TABLE public.invoices DISABLE TRIGGER invoices_updated_at;
ALTER TABLE public.invoices DISABLE TRIGGER invoices_calculate_totals;
ALTER TABLE public.invoices DISABLE TRIGGER invoices_billing_audit;

UPDATE public.invoices AS invoice
SET
  amount_minor = private.billing_legacy_money_minor(pg_catalog.to_jsonb(invoice.amount::text)),
  currency = 'USD',
  currency_policy_version = 'usd-v1',
  tax_rate_kind = 'ordinary_percentage',
  tax_rate_numerator = (
    private.financial_parse_percentage(
      pg_catalog.to_jsonb(pg_catalog.trim_scale(invoice.tax_rate)::text || '%'),
      'ordinary-percentage-v1'
    )->>'numerator'
  )::bigint,
  tax_rate_denominator = (
    private.financial_parse_percentage(
      pg_catalog.to_jsonb(pg_catalog.trim_scale(invoice.tax_rate)::text || '%'),
      'ordinary-percentage-v1'
    )->>'denominator'
  )::bigint,
  submitted_percentage = pg_catalog.trim_scale(invoice.tax_rate)::text || '%',
  rate_policy_version = 'ordinary-percentage-v1',
  tax_amount_minor = private.billing_legacy_money_minor(pg_catalog.to_jsonb(invoice.tax_amount::text)),
  total_amount_minor = private.billing_legacy_money_minor(pg_catalog.to_jsonb(invoice.total_amount::text)),
  rounding_policy_version = 'half-away-from-zero-v1',
  line_items_exact = private.billing_convert_legacy_line_items(invoice.line_items),
  line_items_legacy_evidence = invoice.line_items;

ALTER TABLE public.invoices
  ALTER COLUMN amount TYPE numeric(19, 2),
  ALTER COLUMN tax_amount TYPE numeric(19, 2),
  ALTER COLUMN total_amount TYPE numeric(19, 2),
  ALTER COLUMN tax_rate DROP DEFAULT,
  ALTER COLUMN tax_rate TYPE numeric(12, 9),
  ALTER COLUMN tax_rate SET DEFAULT 0;

UPDATE public.billing_automation_grants AS grant_row
SET
  max_amount_minor = CASE WHEN grant_row.max_amount IS NULL THEN NULL
    ELSE private.billing_legacy_money_minor(pg_catalog.to_jsonb(grant_row.max_amount::text)) END,
  total_amount_consumed_minor = private.billing_legacy_money_minor(
    pg_catalog.to_jsonb(grant_row.total_amount_consumed::text)
  ),
  currency = 'USD';

ALTER TABLE public.billing_automation_executions
  DISABLE TRIGGER billing_automation_executions_immutable;

UPDATE public.billing_automation_executions AS execution
SET
  amount_minor = private.billing_legacy_money_minor(pg_catalog.to_jsonb(execution.amount::text)),
  currency = 'USD',
  request_fingerprint = pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'grant_id', execution.grant_id::text,
          'account_id', execution.account_id::text,
          'command_name', execution.command_name,
          'provider_reference', grant_row.provider_reference,
          'policy_version', execution.policy_version,
          'action_kind', execution.action_kind,
          'money', pg_catalog.jsonb_build_object(
            'amount_minor', private.billing_legacy_money_minor(
              pg_catalog.to_jsonb(execution.amount::text)
            )::text,
            'currency', 'USD'
          )
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  ),
  effect_fingerprint = pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        private.billing_legacy_execution_effect(execution.id)::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
FROM public.billing_automation_grants AS grant_row
WHERE grant_row.id = execution.grant_id;

ALTER TABLE public.billing_automation_executions
  ENABLE TRIGGER billing_automation_executions_immutable;

ALTER TABLE public.invoices
  ALTER COLUMN issue_date SET NOT NULL,
  ALTER COLUMN amount_minor SET NOT NULL,
  ALTER COLUMN currency SET NOT NULL,
  ALTER COLUMN currency_policy_version SET NOT NULL,
  ALTER COLUMN tax_rate_kind SET NOT NULL,
  ALTER COLUMN tax_rate_numerator SET NOT NULL,
  ALTER COLUMN tax_rate_denominator SET NOT NULL,
  ALTER COLUMN submitted_percentage SET NOT NULL,
  ALTER COLUMN rate_policy_version SET NOT NULL,
  ALTER COLUMN tax_amount_minor SET NOT NULL,
  ALTER COLUMN total_amount_minor SET NOT NULL,
  ALTER COLUMN rounding_policy_version SET NOT NULL,
  ALTER COLUMN line_items_exact SET NOT NULL,
  ALTER COLUMN line_items_legacy_evidence SET NOT NULL;

ALTER TABLE public.billing_automation_grants
  ALTER COLUMN total_amount_consumed_minor SET NOT NULL,
  ALTER COLUMN currency SET NOT NULL;

ALTER TABLE public.billing_automation_executions
  ALTER COLUMN amount_minor SET NOT NULL,
  ALTER COLUMN currency SET NOT NULL,
  ALTER COLUMN request_fingerprint SET NOT NULL,
  ALTER COLUMN effect_fingerprint SET NOT NULL;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_exact_currency_check CHECK (currency = 'USD'),
  ADD CONSTRAINT invoices_exact_currency_policy_check CHECK (
    currency_policy_version = 'usd-v1'
  ),
  ADD CONSTRAINT invoices_exact_rate_check CHECK (
    tax_rate_kind = 'ordinary_percentage'
      AND rate_policy_version = 'ordinary-percentage-v1'
      AND tax_rate_denominator > 0
      AND tax_rate_numerator >= 0
      AND tax_rate_numerator <= tax_rate_denominator
      AND pg_catalog.octet_length(submitted_percentage) <= 14
  ),
  ADD CONSTRAINT invoices_exact_rounding_policy_check CHECK (
    rounding_policy_version = 'half-away-from-zero-v1'
  ),
  ADD CONSTRAINT invoices_exact_total_check CHECK (
    amount_minor::numeric + tax_amount_minor::numeric = total_amount_minor::numeric
  ),
  ADD CONSTRAINT invoices_exact_money_compatibility_check CHECK (
    amount = amount_minor::numeric / 100::numeric
      AND tax_amount = tax_amount_minor::numeric / 100::numeric
      AND total_amount = total_amount_minor::numeric / 100::numeric
  ),
  ADD CONSTRAINT invoices_tax_rate_compatibility_check CHECK (
    tax_rate >= 0
      AND tax_rate <= 100
      AND tax_rate = (
        tax_rate_numerator::numeric * 100::numeric
          / tax_rate_denominator::numeric
      )::numeric(12, 9)
  ),
  ADD CONSTRAINT invoices_exact_line_items_check CHECK (
    pg_catalog.jsonb_typeof(line_items_exact) = 'array'
      AND pg_catalog.jsonb_typeof(line_items_legacy_evidence) = 'array'
  );

ALTER TABLE public.billing_automation_grants
  ADD CONSTRAINT billing_automation_grants_exact_values_check CHECK (
    currency = 'USD'
      AND total_amount_consumed_minor >= 0
      AND (max_amount_minor IS NULL OR max_amount_minor >= 0)
      AND total_amount_consumed = total_amount_consumed_minor::numeric / 100::numeric
      AND (
        (max_amount IS NULL AND max_amount_minor IS NULL)
        OR max_amount = max_amount_minor::numeric / 100::numeric
      )
      AND (max_amount_minor IS NULL OR total_amount_consumed_minor <= max_amount_minor)
  );

ALTER TABLE public.billing_automation_executions
  ADD CONSTRAINT billing_automation_executions_exact_values_check CHECK (
    currency = 'USD'
      AND amount_minor >= 0
      AND amount = amount_minor::numeric / 100::numeric
      AND request_fingerprint ~ '^[0-9a-f]{64}$'
      AND effect_fingerprint ~ '^[0-9a-f]{64}$'
  );

ALTER TABLE public.billing_automation_grants
  ALTER COLUMN total_amount_consumed_minor SET DEFAULT 0,
  ALTER COLUMN currency SET DEFAULT 'USD';

CREATE OR REPLACE FUNCTION private.billing_invoice_exact_payload(
  p_invoice public.invoices
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $function$
  SELECT pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'id', p_invoice.id::text,
    'organization_id', p_invoice.organization_id::text,
    'billing_account_id', p_invoice.billing_account_id::text,
    'company_id', p_invoice.company_id::text,
    'project_id', p_invoice.project_id::text,
    'deal_id', p_invoice.deal_id::text,
    'sales_id', p_invoice.sales_id::text,
    'invoice_number', p_invoice.invoice_number,
    'description', p_invoice.description,
    'amount', pg_catalog.jsonb_build_object(
      'amount_minor', p_invoice.amount_minor::text,
      'currency', p_invoice.currency
    ),
    'currency_policy_version', p_invoice.currency_policy_version,
    'tax_rate', pg_catalog.jsonb_build_object(
      'kind', p_invoice.tax_rate_kind,
      'numerator', p_invoice.tax_rate_numerator::text,
      'denominator', p_invoice.tax_rate_denominator::text,
      'submitted_percentage', p_invoice.submitted_percentage,
      'rate_policy_version', p_invoice.rate_policy_version
    ),
    'tax_amount', pg_catalog.jsonb_build_object(
      'amount_minor', p_invoice.tax_amount_minor::text,
      'currency', p_invoice.currency
    ),
    'total_amount', pg_catalog.jsonb_build_object(
      'amount_minor', p_invoice.total_amount_minor::text,
      'currency', p_invoice.currency
    ),
    'rounding_policy_version', p_invoice.rounding_policy_version,
    'line_items', p_invoice.line_items_exact,
    'status', p_invoice.status,
    'issue_date', p_invoice.issue_date::text,
    'due_date', p_invoice.due_date::text,
    'paid_date', p_invoice.paid_date::text,
    'payment_method', p_invoice.payment_method,
    'payment_reference', p_invoice.payment_reference,
    'notes', p_invoice.notes,
    'terms', p_invoice.terms,
    'created_at', p_invoice.created_at::text,
    'updated_at', p_invoice.updated_at::text
  ));
$function$;

CREATE OR REPLACE FUNCTION private.billing_invoice_legacy_payload(
  p_invoice public.invoices
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $function$
  SELECT pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'id', p_invoice.id::text,
    'organization_id', p_invoice.organization_id::text,
    'billing_account_id', p_invoice.billing_account_id::text,
    'company_id', p_invoice.company_id::text,
    'project_id', p_invoice.project_id::text,
    'deal_id', p_invoice.deal_id::text,
    'sales_id', p_invoice.sales_id::text,
    'invoice_number', p_invoice.invoice_number,
    'description', p_invoice.description,
    'amount', private.billing_minor_fixed_decimal(p_invoice.amount_minor),
    'tax_rate', pg_catalog.to_char(
      p_invoice.tax_rate_numerator::numeric * 100::numeric
        / p_invoice.tax_rate_denominator::numeric,
      'FM999999990.000000000'
    ),
    'submitted_percentage', p_invoice.submitted_percentage,
    'tax_amount', private.billing_minor_fixed_decimal(p_invoice.tax_amount_minor),
    'total_amount', private.billing_minor_fixed_decimal(p_invoice.total_amount_minor),
    'line_items', p_invoice.line_items_legacy_evidence,
    'status', p_invoice.status,
    'issue_date', p_invoice.issue_date::text,
    'due_date', p_invoice.due_date::text,
    'paid_date', p_invoice.paid_date::text,
    'payment_method', p_invoice.payment_method,
    'payment_reference', p_invoice.payment_reference,
    'notes', p_invoice.notes,
    'terms', p_invoice.terms,
    'created_at', p_invoice.created_at::text,
    'updated_at', p_invoice.updated_at::text
  ));
$function$;

CREATE OR REPLACE FUNCTION private.billing_invoice_exact_before_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  normalized_rate jsonb;
  normalized_items jsonb;
  rounded_tax jsonb;
  total_text text;
  line_sum numeric;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    OLD.line_items_legacy_evidence IS DISTINCT FROM NEW.line_items_legacy_evidence
      OR OLD.line_items IS DISTINCT FROM NEW.line_items
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVOICE_LEGACY_EVIDENCE_IMMUTABLE';
  END IF;

  IF NEW.currency IS DISTINCT FROM 'USD'
    OR NEW.currency_policy_version IS DISTINCT FROM 'usd-v1'
    OR NEW.rounding_policy_version IS DISTINCT FROM 'half-away-from-zero-v1'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'FINANCIAL_POLICY_MISMATCH';
  END IF;

  normalized_rate := private.billing_exact_rate(pg_catalog.jsonb_build_object(
    'kind', NEW.tax_rate_kind,
    'numerator', NEW.tax_rate_numerator::text,
    'denominator', NEW.tax_rate_denominator::text,
    'submitted_percentage', NEW.submitted_percentage,
    'rate_policy_version', NEW.rate_policy_version
  ));
  normalized_items := private.billing_exact_line_items(NEW.line_items_exact);
  IF normalized_items IS DISTINCT FROM NEW.line_items_exact THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'FINANCIAL_INVALID_LINE_ITEMS';
  END IF;

  IF pg_catalog.jsonb_array_length(normalized_items) > 0 THEN
    SELECT COALESCE(pg_catalog.sum((item->'extended_amount'->>'amount_minor')::numeric), 0)
    INTO line_sum
    FROM pg_catalog.jsonb_array_elements(normalized_items) AS item;
    IF line_sum <> NEW.amount_minor::numeric THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'FINANCIAL_LINE_ITEMS_MISMATCH';
    END IF;
  END IF;

  rounded_tax := private.financial_round_ratio(
    pg_catalog.to_jsonb(
      (NEW.amount_minor::numeric * (normalized_rate->>'numerator')::numeric)::text
    ),
    pg_catalog.to_jsonb(normalized_rate->>'denominator'),
    'USD', 'usd-v1', 2::smallint, 'half-away-from-zero-v1'
  );
  NEW.tax_amount_minor := (rounded_tax->>'amount_minor')::bigint;
  total_text := private.financial_canonical_integer_text(
    pg_catalog.to_jsonb((NEW.amount_minor::numeric + NEW.tax_amount_minor::numeric)::text),
    true
  );
  NEW.total_amount_minor := total_text::bigint;

  NEW.amount := NEW.amount_minor::numeric / 100::numeric;
  NEW.tax_amount := NEW.tax_amount_minor::numeric / 100::numeric;
  NEW.total_amount := NEW.total_amount_minor::numeric / 100::numeric;
  NEW.tax_rate := (
    NEW.tax_rate_numerator::numeric * 100::numeric
      / NEW.tax_rate_denominator::numeric
  )::numeric(12, 9);
  IF TG_OP = 'INSERT' THEN
    NEW.line_items := COALESCE(NEW.line_items_legacy_evidence, '[]'::jsonb);
    NEW.line_items_legacy_evidence := COALESCE(NEW.line_items_legacy_evidence, '[]'::jsonb);
  ELSE
    NEW.line_items := OLD.line_items;
    NEW.line_items_legacy_evidence := OLD.line_items_legacy_evidence;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION private.billing_invoice_protect_issued_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF OLD.status <> 'Draft'
    AND (
      NEW.status = 'Draft'
      OR OLD.project_id IS DISTINCT FROM NEW.project_id
      OR OLD.deal_id IS DISTINCT FROM NEW.deal_id
      OR OLD.invoice_number IS DISTINCT FROM NEW.invoice_number
      OR OLD.description IS DISTINCT FROM NEW.description
      OR OLD.amount IS DISTINCT FROM NEW.amount
      OR OLD.tax_rate IS DISTINCT FROM NEW.tax_rate
      OR OLD.tax_amount IS DISTINCT FROM NEW.tax_amount
      OR OLD.total_amount IS DISTINCT FROM NEW.total_amount
      OR OLD.amount_minor IS DISTINCT FROM NEW.amount_minor
      OR OLD.currency IS DISTINCT FROM NEW.currency
      OR OLD.currency_policy_version IS DISTINCT FROM NEW.currency_policy_version
      OR OLD.tax_rate_kind IS DISTINCT FROM NEW.tax_rate_kind
      OR OLD.tax_rate_numerator IS DISTINCT FROM NEW.tax_rate_numerator
      OR OLD.tax_rate_denominator IS DISTINCT FROM NEW.tax_rate_denominator
      OR OLD.submitted_percentage IS DISTINCT FROM NEW.submitted_percentage
      OR OLD.rate_policy_version IS DISTINCT FROM NEW.rate_policy_version
      OR OLD.tax_amount_minor IS DISTINCT FROM NEW.tax_amount_minor
      OR OLD.total_amount_minor IS DISTINCT FROM NEW.total_amount_minor
      OR OLD.rounding_policy_version IS DISTINCT FROM NEW.rounding_policy_version
      OR OLD.line_items IS DISTINCT FROM NEW.line_items
      OR OLD.line_items_exact IS DISTINCT FROM NEW.line_items_exact
      OR OLD.line_items_legacy_evidence IS DISTINCT FROM NEW.line_items_legacy_evidence
      OR OLD.issue_date IS DISTINCT FROM NEW.issue_date
      OR OLD.due_date IS DISTINCT FROM NEW.due_date
      OR OLD.notes IS DISTINCT FROM NEW.notes
      OR OLD.terms IS DISTINCT FROM NEW.terms
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'INVOICE_ISSUED_SNAPSHOT_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION private.billing_invoice_rate_presentation_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF OLD.submitted_percentage IS DISTINCT FROM NEW.submitted_percentage
    AND OLD.tax_rate_numerator = NEW.tax_rate_numerator
    AND OLD.tax_rate_denominator = NEW.tax_rate_denominator
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
  RETURN NEW;
END;
$function$;

DROP TRIGGER invoices_calculate_totals ON public.invoices;
DROP FUNCTION public.calculate_invoice_totals();

CREATE TRIGGER invoices_exact_before_write
BEFORE INSERT OR UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION private.billing_invoice_exact_before_write();

CREATE TRIGGER invoices_00_issued_snapshot_immutable
BEFORE UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION private.billing_invoice_protect_issued_snapshot();

CREATE TRIGGER invoices_rate_presentation_audit
AFTER UPDATE OF submitted_percentage ON public.invoices
FOR EACH ROW EXECUTE FUNCTION private.billing_invoice_rate_presentation_audit();

ALTER TABLE public.invoices ENABLE TRIGGER invoices_updated_at;
ALTER TABLE public.invoices ENABLE TRIGGER invoices_billing_audit;

CREATE OR REPLACE FUNCTION private.billing_automation_exact_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF NEW.currency IS DISTINCT FROM 'USD'
    OR NEW.total_amount_consumed_minor IS NULL
    OR NEW.total_amount_consumed_minor < 0
    OR (NEW.max_amount_minor IS NOT NULL AND NEW.max_amount_minor < 0)
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'FINANCIAL_INVALID_MONEY';
  END IF;
  NEW.total_amount_consumed := NEW.total_amount_consumed_minor::numeric / 100::numeric;
  NEW.max_amount := CASE WHEN NEW.max_amount_minor IS NULL THEN NULL
    ELSE NEW.max_amount_minor::numeric / 100::numeric END;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER billing_automation_grants_exact_before_write
BEFORE INSERT OR UPDATE OF max_amount_minor, total_amount_consumed_minor, currency,
  max_amount, total_amount_consumed
ON public.billing_automation_grants
FOR EACH ROW EXECUTE FUNCTION private.billing_automation_exact_before_write();

CREATE OR REPLACE FUNCTION private.billing_consume_automation_grant(
  p_grant_id uuid,
  p_account_id uuid,
  p_command_name text,
  p_provider_reference text,
  p_policy_version text,
  p_action_kind text,
  p_amount jsonb,
  p_idempotency_key text,
  p_effect jsonb
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
  normalized_money jsonb;
  normalized_effect jsonb;
  amount_minor_value bigint;
  new_action_count integer;
  new_amount_total numeric;
  request_fingerprint_value text;
  effect_fingerprint_value text;
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
    OR p_effect IS NULL
    OR pg_catalog.jsonb_typeof(p_effect) IS DISTINCT FROM 'object'
  THEN
    RETURN pg_catalog.jsonb_build_object('result', 'denied', 'reason_code', 'GRANT_NOT_AUTHORIZED');
  END IF;

  BEGIN
    normalized_money := private.billing_exact_money(p_amount);
  EXCEPTION WHEN OTHERS THEN
    RETURN pg_catalog.jsonb_build_object('result', 'denied', 'reason_code', 'FINANCIAL_INVALID_MONEY');
  END;
  amount_minor_value := (normalized_money->>'amount_minor')::bigint;
  IF amount_minor_value < 0 THEN
    RETURN pg_catalog.jsonb_build_object('result', 'denied', 'reason_code', 'FINANCIAL_INVALID_MONEY');
  END IF;

  IF p_effect->>'kind' = 'general'
    AND p_effect ?& ARRAY['kind', 'command_name', 'action_kind']
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_object_keys(p_effect) AS key_name
      WHERE key_name NOT IN ('kind', 'command_name', 'action_kind')
    )
    AND p_effect->>'command_name' = p_command_name
    AND p_effect->>'action_kind' = p_action_kind
  THEN
    normalized_effect := pg_catalog.jsonb_build_object(
      'kind', 'general',
      'command_name', p_command_name,
      'action_kind', p_action_kind
    );
  ELSIF p_effect->>'kind' = 'evidence.inspection'
    AND p_effect ?& ARRAY['kind', 'evidence_id', 'decision', 'reason_code']
    AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_object_keys(p_effect) AS key_name
      WHERE key_name NOT IN ('kind', 'evidence_id', 'decision', 'reason_code')
    )
    AND p_effect->>'evidence_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND p_effect->>'decision' IN ('clean', 'rejected')
    AND p_effect->>'reason_code' ~ '^[A-Z][A-Z0-9_]{2,63}$'
  THEN
    normalized_effect := pg_catalog.jsonb_build_object(
      'kind', 'evidence.inspection',
      'evidence_id', p_effect->>'evidence_id',
      'decision', p_effect->>'decision',
      'reason_code', p_effect->>'reason_code'
    );
  ELSE
    RETURN pg_catalog.jsonb_build_object('result', 'denied', 'reason_code', 'GRANT_NOT_AUTHORIZED');
  END IF;

  request_fingerprint_value := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'grant_id', p_grant_id::text,
          'account_id', p_account_id::text,
          'command_name', p_command_name,
          'provider_reference', p_provider_reference,
          'policy_version', p_policy_version,
          'action_kind', p_action_kind,
          'money', normalized_money
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
  effect_fingerprint_value := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(normalized_effect::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );

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
    IF existing_execution.request_fingerprint IS DISTINCT FROM request_fingerprint_value
      OR existing_execution.effect_fingerprint IS DISTINCT FROM effect_fingerprint_value
    THEN
      RETURN pg_catalog.jsonb_build_object(
        'result', 'denied',
        'reason_code', 'IDEMPOTENCY_KEY_CONFLICT'
      );
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'result', 'duplicate',
      'reason_code', 'DUPLICATE_COMMAND'
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
      'automation', principal_record.id, principal_record.organization_id,
      grant_record.account_id, 'automation.command', 'billing_automation_grants',
      grant_record.id::text, 'denied', 'GRANT_NOT_AUTHORIZED',
      pg_catalog.jsonb_build_object(
        'command', grant_record.command_name,
        'policy_version', grant_record.policy_version,
        'action_kind', grant_record.action_kind
      )
    );
    RETURN pg_catalog.jsonb_build_object('result', 'denied', 'reason_code', 'GRANT_NOT_AUTHORIZED');
  END IF;

  new_action_count := grant_record.actions_consumed + 1;
  new_amount_total := grant_record.total_amount_consumed_minor::numeric
    + amount_minor_value::numeric;
  IF new_amount_total > '9223372036854775807'::numeric
    OR (grant_record.max_actions IS NOT NULL AND new_action_count > grant_record.max_actions)
    OR (grant_record.max_amount_minor IS NOT NULL
      AND new_amount_total > grant_record.max_amount_minor::numeric)
  THEN
    INSERT INTO public.billing_audit_events (
      actor_type, actor_id, organization_id, account_id, action,
      subject_type, subject_id, result, reason, details
    ) VALUES (
      'automation', principal_record.id, principal_record.organization_id,
      grant_record.account_id, 'automation.command', 'billing_automation_grants',
      grant_record.id::text, 'denied', 'GRANT_LIMIT_EXCEEDED',
      pg_catalog.jsonb_build_object(
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
    amount_minor, currency, request_fingerprint, effect_fingerprint
  ) VALUES (
    principal_record.organization_id, grant_record.account_id, principal_record.id,
    grant_record.id, p_idempotency_key, grant_record.command_name,
    grant_record.policy_version, grant_record.action_kind,
    amount_minor_value::numeric / 100::numeric, 'succeeded', amount_minor_value,
    'USD', request_fingerprint_value, effect_fingerprint_value
  );

  UPDATE public.billing_automation_grants
  SET
    actions_consumed = new_action_count,
    total_amount_consumed_minor = new_amount_total::bigint,
    status = CASE
      WHEN (max_actions IS NOT NULL AND new_action_count = max_actions)
        OR (max_amount_minor IS NOT NULL AND new_amount_total = max_amount_minor::numeric)
      THEN 'exhausted' ELSE status END,
    disabled_at = CASE
      WHEN (max_actions IS NOT NULL AND new_action_count = max_actions)
        OR (max_amount_minor IS NOT NULL AND new_amount_total = max_amount_minor::numeric)
      THEN pg_catalog.now() ELSE disabled_at END,
    disabled_reason = CASE
      WHEN (max_actions IS NOT NULL AND new_action_count = max_actions)
        OR (max_amount_minor IS NOT NULL AND new_amount_total = max_amount_minor::numeric)
      THEN 'grant limit exhausted' ELSE disabled_reason END,
    updated_at = pg_catalog.now()
  WHERE id = grant_record.id;

  INSERT INTO public.billing_audit_events (
    actor_type, actor_id, organization_id, account_id, action,
    subject_type, subject_id, result, reason, details
  ) VALUES (
    'automation', principal_record.id, principal_record.organization_id,
    grant_record.account_id, 'automation.command',
    'billing_automation_executions', p_idempotency_key, 'succeeded', NULL,
    pg_catalog.jsonb_build_object(
      'command', grant_record.command_name,
      'policy_version', grant_record.policy_version,
      'action_kind', grant_record.action_kind
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'result', 'applied',
    'reason_code', 'COMMAND_APPLIED',
    'actions_consumed', new_action_count,
    'amount_consumed', pg_catalog.jsonb_build_object(
      'amount_minor', new_amount_total::bigint::text,
      'currency', 'USD'
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.execute_billing_automation_command(
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
    pg_catalog.jsonb_build_object(
      'kind', 'general',
      'command_name', p_command_name,
      'action_kind', p_action_kind
    )
  );
$function$;

CREATE OR REPLACE FUNCTION private.billing_finalize_evidence_inspection(
  p_evidence_id uuid,
  p_grant_id uuid,
  p_provider_reference text,
  p_policy_version text,
  p_decision text,
  p_reason_code text,
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
  effect_context_value jsonb;
  principal_id_value uuid;
  replay_exists boolean;
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
      'result', 'denied',
      'reason_code', 'INSPECTION_NOT_AUTHORIZED'
    );
  END IF;

  SELECT evidence.*
  INTO evidence_record
  FROM public.billing_evidence_objects AS evidence
  WHERE evidence.id = p_evidence_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'result', 'denied',
      'reason_code', 'INSPECTION_NOT_AUTHORIZED'
    );
  END IF;

  SELECT principal.id
  INTO principal_id_value
  FROM public.billing_automation_principals AS principal
  JOIN public.billing_organizations AS organization
    ON organization.id = principal.organization_id
  WHERE principal.auth_user_id = (SELECT auth.uid())
    AND principal.organization_id = evidence_record.organization_id
    AND principal.status = 'active'
    AND principal.disabled_at IS NULL
    AND principal.valid_from <= pg_catalog.now()
    AND (principal.valid_until IS NULL OR principal.valid_until > pg_catalog.now())
    AND organization.status = 'active';

  SELECT EXISTS (
    SELECT 1
    FROM public.billing_automation_executions AS execution
    WHERE execution.principal_id = principal_id_value
      AND execution.idempotency_key = p_idempotency_key
  ) INTO replay_exists;

  IF evidence_record.inspection_status <> 'quarantined' AND NOT replay_exists THEN
    RETURN pg_catalog.jsonb_build_object(
      'result', 'denied',
      'reason_code', 'INSPECTION_NOT_AUTHORIZED'
    );
  END IF;

  effect_context_value := pg_catalog.jsonb_build_object(
    'kind', 'evidence.inspection',
    'evidence_id', p_evidence_id::text,
    'decision', p_decision,
    'reason_code', p_reason_code
  );

  command_result := private.billing_consume_automation_grant(
    p_grant_id,
    evidence_record.account_id,
    'evidence.inspect',
    p_provider_reference,
    p_policy_version,
    'evidence.inspection',
    '{"amount_minor":"0","currency":"USD"}'::jsonb,
    p_idempotency_key,
    effect_context_value
  );

  IF command_result->>'reason_code' = 'IDEMPOTENCY_KEY_CONFLICT' THEN
    RETURN command_result;
  ELSIF command_result->>'result' = 'duplicate' THEN
    RETURN command_result;
  ELSIF command_result->>'result' <> 'applied' THEN
    RETURN pg_catalog.jsonb_build_object(
      'result', 'denied',
      'reason_code', 'INSPECTION_NOT_AUTHORIZED'
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
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INSPECTION_BINDING_CHANGED';
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

CREATE OR REPLACE FUNCTION public.finalize_billing_evidence_inspection(
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
    p_evidence_id,
    p_grant_id,
    p_provider_reference,
    p_policy_version,
    p_decision,
    p_reason_code,
    p_idempotency_key
  );
$function$;

CREATE OR REPLACE FUNCTION public.read_billing_invoices_exact(jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  p_request ALIAS FOR $1;
  mode_value text;
  invoice_id_value bigint;
  page_value integer;
  per_page_value integer;
  sort_value text;
  order_value text;
  filters_value jsonb;
  account_filter uuid;
  status_filter text;
  number_filter text;
  data_value jsonb;
  total_value bigint;
BEGIN
  IF p_request IS NULL
    OR pg_catalog.jsonb_typeof(p_request) IS DISTINCT FROM 'object'
    OR NOT (p_request ? 'mode')
    OR pg_catalog.jsonb_typeof(p_request->'mode') IS DISTINCT FROM 'string'
    OR EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_object_keys(p_request) AS key_name
      WHERE key_name NOT IN ('mode', 'invoice_id', 'page', 'per_page', 'sort', 'order', 'filters')
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVOICE_READ_INVALID_REQUEST';
  END IF;

  mode_value := p_request->>'mode';
  IF mode_value = 'get' THEN
    IF NOT (p_request ? 'invoice_id')
      OR p_request ?| ARRAY['page', 'per_page', 'sort', 'order', 'filters']
      OR pg_catalog.jsonb_typeof(p_request->'invoice_id') IS DISTINCT FROM 'string'
      OR p_request->>'invoice_id' !~ '^[1-9][0-9]{0,18}$'
      OR (p_request->>'invoice_id')::numeric > '9223372036854775807'::numeric
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVOICE_READ_INVALID_REQUEST';
    END IF;
    invoice_id_value := (p_request->>'invoice_id')::bigint;

    SELECT private.billing_invoice_exact_payload(invoice)
    INTO data_value
    FROM public.invoices AS invoice
    WHERE invoice.id = invoice_id_value
      AND private.billing_has_capability(
        invoice.organization_id,
        invoice.billing_account_id,
        'invoice.read'
      );
    RETURN pg_catalog.jsonb_build_object('data', data_value);
  ELSIF mode_value <> 'list' OR p_request ? 'invoice_id' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVOICE_READ_INVALID_REQUEST';
  END IF;

  IF (p_request ? 'page' AND pg_catalog.jsonb_typeof(p_request->'page') <> 'number')
    OR (p_request ? 'per_page' AND pg_catalog.jsonb_typeof(p_request->'per_page') <> 'number')
    OR (p_request ? 'sort' AND pg_catalog.jsonb_typeof(p_request->'sort') <> 'string')
    OR (p_request ? 'order' AND pg_catalog.jsonb_typeof(p_request->'order') <> 'string')
    OR (p_request ? 'filters' AND pg_catalog.jsonb_typeof(p_request->'filters') <> 'object')
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVOICE_READ_INVALID_REQUEST';
  END IF;

  BEGIN
    page_value := COALESCE((p_request->>'page')::integer, 1);
    per_page_value := COALESCE((p_request->>'per_page')::integer, 50);
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVOICE_READ_INVALID_REQUEST';
  END;
  sort_value := COALESCE(p_request->>'sort', 'created_at');
  order_value := COALESCE(p_request->>'order', 'DESC');
  filters_value := COALESCE(p_request->'filters', '{}'::jsonb);

  IF page_value < 1 OR page_value > 1000000
    OR per_page_value < 1 OR per_page_value > 100
    OR sort_value NOT IN ('id', 'invoice_number', 'status', 'issue_date', 'created_at', 'total_amount_minor')
    OR order_value NOT IN ('ASC', 'DESC')
    OR EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_object_keys(filters_value) AS key_name
      WHERE key_name NOT IN ('billing_account_id', 'status', 'invoice_number')
    )
    OR (filters_value ? 'billing_account_id'
      AND (pg_catalog.jsonb_typeof(filters_value->'billing_account_id') <> 'string'
        OR filters_value->>'billing_account_id' !~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
    OR (filters_value ? 'status'
      AND pg_catalog.jsonb_typeof(filters_value->'status') <> 'string')
    OR (filters_value ? 'invoice_number'
      AND pg_catalog.jsonb_typeof(filters_value->'invoice_number') <> 'string')
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVOICE_READ_INVALID_REQUEST';
  END IF;

  account_filter := NULLIF(filters_value->>'billing_account_id', '')::uuid;
  status_filter := filters_value->>'status';
  number_filter := filters_value->>'invoice_number';

  SELECT COALESCE(pg_catalog.jsonb_agg(authorized_invoice.payload), '[]'::jsonb)
  INTO data_value
  FROM (
    SELECT private.billing_invoice_exact_payload(invoice) AS payload
    FROM public.invoices AS invoice
    WHERE private.billing_has_capability(
        invoice.organization_id,
        invoice.billing_account_id,
        'invoice.read'
      )
      AND (account_filter IS NULL OR invoice.billing_account_id = account_filter)
      AND (status_filter IS NULL OR invoice.status = status_filter)
      AND (number_filter IS NULL OR invoice.invoice_number = number_filter)
    ORDER BY
      CASE WHEN sort_value = 'id' AND order_value = 'ASC' THEN invoice.id END ASC,
      CASE WHEN sort_value = 'id' AND order_value = 'DESC' THEN invoice.id END DESC,
      CASE WHEN sort_value = 'invoice_number' AND order_value = 'ASC' THEN invoice.invoice_number END ASC,
      CASE WHEN sort_value = 'invoice_number' AND order_value = 'DESC' THEN invoice.invoice_number END DESC,
      CASE WHEN sort_value = 'status' AND order_value = 'ASC' THEN invoice.status END ASC,
      CASE WHEN sort_value = 'status' AND order_value = 'DESC' THEN invoice.status END DESC,
      CASE WHEN sort_value = 'issue_date' AND order_value = 'ASC' THEN invoice.issue_date END ASC,
      CASE WHEN sort_value = 'issue_date' AND order_value = 'DESC' THEN invoice.issue_date END DESC,
      CASE WHEN sort_value = 'created_at' AND order_value = 'ASC' THEN invoice.created_at END ASC,
      CASE WHEN sort_value = 'created_at' AND order_value = 'DESC' THEN invoice.created_at END DESC,
      CASE WHEN sort_value = 'total_amount_minor' AND order_value = 'ASC' THEN invoice.total_amount_minor END ASC,
      CASE WHEN sort_value = 'total_amount_minor' AND order_value = 'DESC' THEN invoice.total_amount_minor END DESC,
      invoice.id ASC
    LIMIT per_page_value
    OFFSET (page_value - 1) * per_page_value
  ) AS authorized_invoice;

  SELECT pg_catalog.count(*)
  INTO total_value
  FROM public.invoices AS invoice
  WHERE private.billing_has_capability(
      invoice.organization_id,
      invoice.billing_account_id,
      'invoice.read'
    )
    AND (account_filter IS NULL OR invoice.billing_account_id = account_filter)
    AND (status_filter IS NULL OR invoice.status = status_filter)
    AND (number_filter IS NULL OR invoice.invoice_number = number_filter);

  RETURN pg_catalog.jsonb_build_object('data', data_value, 'total', total_value);
END;
$function$;

CREATE OR REPLACE FUNCTION public.read_billing_invoices_legacy_compat(jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  p_request ALIAS FOR $1;
  mode_value text;
  invoice_id_value bigint;
  page_value integer;
  per_page_value integer;
  sort_value text;
  order_value text;
  filters_value jsonb;
  account_filter uuid;
  status_filter text;
  number_filter text;
  data_value jsonb;
  total_value bigint;
BEGIN
  IF p_request IS NULL
    OR pg_catalog.jsonb_typeof(p_request) IS DISTINCT FROM 'object'
    OR NOT (p_request ? 'mode')
    OR pg_catalog.jsonb_typeof(p_request->'mode') IS DISTINCT FROM 'string'
    OR EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_object_keys(p_request) AS key_name
      WHERE key_name NOT IN ('mode', 'invoice_id', 'page', 'per_page', 'sort', 'order', 'filters')
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVOICE_READ_INVALID_REQUEST';
  END IF;

  mode_value := p_request->>'mode';
  IF mode_value = 'get' THEN
    IF NOT (p_request ? 'invoice_id')
      OR p_request ?| ARRAY['page', 'per_page', 'sort', 'order', 'filters']
      OR pg_catalog.jsonb_typeof(p_request->'invoice_id') IS DISTINCT FROM 'string'
      OR p_request->>'invoice_id' !~ '^[1-9][0-9]{0,18}$'
      OR (p_request->>'invoice_id')::numeric > '9223372036854775807'::numeric
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVOICE_READ_INVALID_REQUEST';
    END IF;
    invoice_id_value := (p_request->>'invoice_id')::bigint;

    SELECT private.billing_invoice_legacy_payload(invoice)
    INTO data_value
    FROM public.invoices AS invoice
    WHERE invoice.id = invoice_id_value
      AND private.billing_has_capability(
        invoice.organization_id,
        invoice.billing_account_id,
        'invoice.read'
      );
    RETURN pg_catalog.jsonb_build_object('data', data_value);
  ELSIF mode_value <> 'list' OR p_request ? 'invoice_id' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVOICE_READ_INVALID_REQUEST';
  END IF;

  IF (p_request ? 'page' AND pg_catalog.jsonb_typeof(p_request->'page') <> 'number')
    OR (p_request ? 'per_page' AND pg_catalog.jsonb_typeof(p_request->'per_page') <> 'number')
    OR (p_request ? 'sort' AND pg_catalog.jsonb_typeof(p_request->'sort') <> 'string')
    OR (p_request ? 'order' AND pg_catalog.jsonb_typeof(p_request->'order') <> 'string')
    OR (p_request ? 'filters' AND pg_catalog.jsonb_typeof(p_request->'filters') <> 'object')
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVOICE_READ_INVALID_REQUEST';
  END IF;

  BEGIN
    page_value := COALESCE((p_request->>'page')::integer, 1);
    per_page_value := COALESCE((p_request->>'per_page')::integer, 50);
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVOICE_READ_INVALID_REQUEST';
  END;
  sort_value := COALESCE(p_request->>'sort', 'created_at');
  order_value := COALESCE(p_request->>'order', 'DESC');
  filters_value := COALESCE(p_request->'filters', '{}'::jsonb);

  IF page_value < 1 OR page_value > 1000000
    OR per_page_value < 1 OR per_page_value > 100
    OR sort_value NOT IN ('id', 'invoice_number', 'status', 'issue_date', 'created_at', 'total_amount_minor')
    OR order_value NOT IN ('ASC', 'DESC')
    OR EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_object_keys(filters_value) AS key_name
      WHERE key_name NOT IN ('billing_account_id', 'status', 'invoice_number')
    )
    OR (filters_value ? 'billing_account_id'
      AND (pg_catalog.jsonb_typeof(filters_value->'billing_account_id') <> 'string'
        OR filters_value->>'billing_account_id' !~
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
    OR (filters_value ? 'status'
      AND pg_catalog.jsonb_typeof(filters_value->'status') <> 'string')
    OR (filters_value ? 'invoice_number'
      AND pg_catalog.jsonb_typeof(filters_value->'invoice_number') <> 'string')
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVOICE_READ_INVALID_REQUEST';
  END IF;

  account_filter := NULLIF(filters_value->>'billing_account_id', '')::uuid;
  status_filter := filters_value->>'status';
  number_filter := filters_value->>'invoice_number';

  SELECT COALESCE(pg_catalog.jsonb_agg(authorized_invoice.payload), '[]'::jsonb)
  INTO data_value
  FROM (
    SELECT private.billing_invoice_legacy_payload(invoice) AS payload
    FROM public.invoices AS invoice
    WHERE private.billing_has_capability(
        invoice.organization_id,
        invoice.billing_account_id,
        'invoice.read'
      )
      AND (account_filter IS NULL OR invoice.billing_account_id = account_filter)
      AND (status_filter IS NULL OR invoice.status = status_filter)
      AND (number_filter IS NULL OR invoice.invoice_number = number_filter)
    ORDER BY
      CASE WHEN sort_value = 'id' AND order_value = 'ASC' THEN invoice.id END ASC,
      CASE WHEN sort_value = 'id' AND order_value = 'DESC' THEN invoice.id END DESC,
      CASE WHEN sort_value = 'invoice_number' AND order_value = 'ASC' THEN invoice.invoice_number END ASC,
      CASE WHEN sort_value = 'invoice_number' AND order_value = 'DESC' THEN invoice.invoice_number END DESC,
      CASE WHEN sort_value = 'status' AND order_value = 'ASC' THEN invoice.status END ASC,
      CASE WHEN sort_value = 'status' AND order_value = 'DESC' THEN invoice.status END DESC,
      CASE WHEN sort_value = 'issue_date' AND order_value = 'ASC' THEN invoice.issue_date END ASC,
      CASE WHEN sort_value = 'issue_date' AND order_value = 'DESC' THEN invoice.issue_date END DESC,
      CASE WHEN sort_value = 'created_at' AND order_value = 'ASC' THEN invoice.created_at END ASC,
      CASE WHEN sort_value = 'created_at' AND order_value = 'DESC' THEN invoice.created_at END DESC,
      CASE WHEN sort_value = 'total_amount_minor' AND order_value = 'ASC' THEN invoice.total_amount_minor END ASC,
      CASE WHEN sort_value = 'total_amount_minor' AND order_value = 'DESC' THEN invoice.total_amount_minor END DESC,
      invoice.id ASC
    LIMIT per_page_value
    OFFSET (page_value - 1) * per_page_value
  ) AS authorized_invoice;

  SELECT pg_catalog.count(*)
  INTO total_value
  FROM public.invoices AS invoice
  WHERE private.billing_has_capability(
      invoice.organization_id,
      invoice.billing_account_id,
      'invoice.read'
    )
    AND (account_filter IS NULL OR invoice.billing_account_id = account_filter)
    AND (status_filter IS NULL OR invoice.status = status_filter)
    AND (number_filter IS NULL OR invoice.invoice_number = number_filter);

  RETURN pg_catalog.jsonb_build_object('data', data_value, 'total', total_value);
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_billing_invoice_exact(jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  p_request ALIAS FOR $1;
  account_record public.billing_accounts%ROWTYPE;
  invoice_record public.invoices%ROWTYPE;
  owner_sales_id bigint;
  invoice_id_value bigint;
  normalized_money jsonb;
  normalized_rate jsonb;
  normalized_items jsonb;
  amount_minor_value bigint;
  line_sum numeric;
  issue_date_value date;
  due_date_value date;
BEGIN
  BEGIN
    IF p_request IS NULL
      OR pg_catalog.jsonb_typeof(p_request) IS DISTINCT FROM 'object'
      OR NOT (p_request ?& ARRAY[
        'billing_account_id', 'invoice_number', 'amount',
        'currency_policy_version', 'tax_rate',
        'rounding_policy_version', 'line_items', 'issue_date'
      ])
      OR EXISTS (
        SELECT 1 FROM pg_catalog.jsonb_object_keys(p_request) AS key_name
        WHERE key_name NOT IN (
          'id', 'billing_account_id', 'invoice_number', 'description', 'amount',
          'currency_policy_version', 'tax_rate', 'rounding_policy_version',
          'line_items', 'status', 'issue_date', 'due_date', 'payment_method',
          'payment_reference', 'notes', 'terms'
        )
      )
      OR pg_catalog.jsonb_typeof(p_request->'billing_account_id') IS DISTINCT FROM 'string'
      OR p_request->>'billing_account_id' !~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR pg_catalog.jsonb_typeof(p_request->'invoice_number') IS DISTINCT FROM 'string'
      OR NULLIF(pg_catalog.btrim(p_request->>'invoice_number'), '') IS NULL
      OR pg_catalog.octet_length(p_request->>'invoice_number') > 128
      OR p_request->>'currency_policy_version' <> 'usd-v1'
      OR p_request->>'rounding_policy_version' <> 'half-away-from-zero-v1'
      OR COALESCE(p_request->>'status', 'Draft') <> 'Draft'
      OR (p_request ? 'id' AND (
        pg_catalog.jsonb_typeof(p_request->'id') <> 'string'
        OR p_request->>'id' !~ '^[1-9][0-9]{0,18}$'
        OR (p_request->>'id')::numeric > '9223372036854775807'::numeric
      ))
      OR pg_catalog.jsonb_typeof(p_request->'issue_date') <> 'string'
      OR (p_request ? 'due_date'
        AND pg_catalog.jsonb_typeof(p_request->'due_date') NOT IN ('string', 'null'))
      OR EXISTS (
        SELECT 1
        FROM pg_catalog.jsonb_each(p_request) AS field
        WHERE field.key IN (
          'description', 'payment_method', 'payment_reference', 'notes', 'terms'
        )
          AND pg_catalog.jsonb_typeof(field.value) NOT IN ('string', 'null')
      )
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid';
    END IF;

    normalized_money := private.billing_exact_money(p_request->'amount');
    normalized_rate := private.billing_exact_rate(p_request->'tax_rate');
    normalized_items := private.billing_exact_line_items(p_request->'line_items');
    amount_minor_value := (normalized_money->>'amount_minor')::bigint;

    SELECT COALESCE(pg_catalog.sum((item->'extended_amount'->>'amount_minor')::numeric), 0)
    INTO line_sum
    FROM pg_catalog.jsonb_array_elements(normalized_items) AS item;
    IF line_sum <> amount_minor_value::numeric THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid';
    END IF;

    issue_date_value := private.billing_canonical_date(
      p_request->'issue_date',
      true
    );
    due_date_value := private.billing_canonical_date(
      p_request->'due_date',
      false
    );

    SELECT account.*
    INTO account_record
    FROM public.billing_accounts AS account
    WHERE account.id = (p_request->>'billing_account_id')::uuid
      AND account.company_id IS NOT NULL
      AND account.billing_status <> 'closed';
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid';
    END IF;

    IF p_request ? 'id' THEN
      invoice_id_value := (p_request->>'id')::bigint;
      IF NOT private.billing_has_capability(
        account_record.organization_id,
        account_record.id,
        'invoice.update'
      ) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid';
      END IF;

      UPDATE public.invoices AS invoice
      SET invoice_number = p_request->>'invoice_number',
          description = p_request->>'description',
          amount_minor = amount_minor_value,
          currency = normalized_money->>'currency',
          currency_policy_version = p_request->>'currency_policy_version',
          tax_rate_kind = normalized_rate->>'kind',
          tax_rate_numerator = (normalized_rate->>'numerator')::bigint,
          tax_rate_denominator = (normalized_rate->>'denominator')::bigint,
          submitted_percentage = normalized_rate->>'submitted_percentage',
          rate_policy_version = normalized_rate->>'rate_policy_version',
          rounding_policy_version = p_request->>'rounding_policy_version',
          line_items_exact = normalized_items,
          status = 'Draft',
          issue_date = issue_date_value,
          due_date = due_date_value,
          payment_method = p_request->>'payment_method',
          payment_reference = p_request->>'payment_reference',
          notes = p_request->>'notes',
          terms = COALESCE(p_request->>'terms', invoice.terms)
      WHERE invoice.id = invoice_id_value
        AND invoice.organization_id = account_record.organization_id
        AND invoice.billing_account_id = account_record.id
        AND invoice.status = 'Draft'
      RETURNING invoice.* INTO invoice_record;
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid';
      END IF;
    ELSE
      IF NOT private.billing_has_capability(
        account_record.organization_id,
        account_record.id,
        'invoice.create'
      ) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid';
      END IF;

      SELECT owner.sales_id
      INTO STRICT owner_sales_id
      FROM public.billing_account_owners AS owner
      JOIN public.sales AS sale ON sale.id = owner.sales_id
      WHERE owner.organization_id = account_record.organization_id
        AND owner.account_id = account_record.id
        AND owner.effective_from <= pg_catalog.now()
        AND owner.effective_until IS NULL
        AND NOT sale.disabled
      FOR SHARE OF owner, sale;

      INSERT INTO public.invoices (
        company_id, sales_id, organization_id, billing_account_id,
        invoice_number, description, amount_minor, currency,
        currency_policy_version, tax_rate_kind, tax_rate_numerator,
        tax_rate_denominator, submitted_percentage, rate_policy_version,
        tax_amount_minor, total_amount_minor, rounding_policy_version,
        line_items_exact, line_items_legacy_evidence, status, issue_date,
        due_date, payment_method, payment_reference, notes, terms,
        amount, tax_rate, tax_amount, total_amount, line_items
      ) VALUES (
        account_record.company_id, owner_sales_id, account_record.organization_id,
        account_record.id, p_request->>'invoice_number', p_request->>'description',
        amount_minor_value, normalized_money->>'currency',
        p_request->>'currency_policy_version', normalized_rate->>'kind',
        (normalized_rate->>'numerator')::bigint,
        (normalized_rate->>'denominator')::bigint,
        normalized_rate->>'submitted_percentage', normalized_rate->>'rate_policy_version',
        0, amount_minor_value, p_request->>'rounding_policy_version',
        normalized_items, '[]'::jsonb, 'Draft', issue_date_value, due_date_value,
        p_request->>'payment_method', p_request->>'payment_reference',
        p_request->>'notes', COALESCE(
          p_request->>'terms',
          'Payment due within 30 days of invoice date.'
        ),
        amount_minor_value::numeric / 100::numeric, 0, 0,
        amount_minor_value::numeric / 100::numeric, '[]'::jsonb
      )
      RETURNING * INTO invoice_record;
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'result', 'saved',
      'data', private.billing_invoice_exact_payload(invoice_record)
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVOICE_SAVE_INVALID_REQUEST';
  END;
END;
$function$;

DROP FUNCTION public.execute_billing_automation_command(
  uuid, uuid, text, text, text, text, numeric, text
);
DROP FUNCTION private.billing_consume_automation_grant(
  uuid, uuid, text, text, text, text, numeric, text
);

DO $block$
DECLARE
  expected_record record;
  actual_count bigint;
  actual_ids jsonb;
BEGIN
  FOR expected_record IN SELECT * FROM exact_billing_pre_identity ORDER BY table_name LOOP
    IF expected_record.table_name = 'invoices' THEN
      SELECT pg_catalog.count(*),
        COALESCE(pg_catalog.jsonb_agg(id::text ORDER BY id), '[]'::jsonb)
      INTO actual_count, actual_ids FROM public.invoices;
    ELSIF expected_record.table_name = 'billing_automation_grants' THEN
      SELECT pg_catalog.count(*),
        COALESCE(pg_catalog.jsonb_agg(id::text ORDER BY id), '[]'::jsonb)
      INTO actual_count, actual_ids FROM public.billing_automation_grants;
    ELSE
      SELECT pg_catalog.count(*),
        COALESCE(pg_catalog.jsonb_agg(id::text ORDER BY id), '[]'::jsonb)
      INTO actual_count, actual_ids FROM public.billing_automation_executions;
    END IF;
    IF actual_count IS DISTINCT FROM expected_record.row_count
      OR actual_ids IS DISTINCT FROM expected_record.ids
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EXACT_BILLING_IDENTITY_CHANGED';
    END IF;
  END LOOP;
END;
$block$;

ALTER FUNCTION private.billing_legacy_decimal_ratio(jsonb) OWNER TO postgres;
ALTER FUNCTION private.billing_legacy_money_minor(jsonb) OWNER TO postgres;
ALTER FUNCTION private.billing_exact_money(jsonb) OWNER TO postgres;
ALTER FUNCTION private.billing_canonical_date(jsonb,boolean) OWNER TO postgres;
ALTER FUNCTION private.billing_exact_rate(jsonb) OWNER TO postgres;
ALTER FUNCTION private.billing_exact_line_items(jsonb) OWNER TO postgres;
ALTER FUNCTION private.billing_convert_legacy_line_items(jsonb) OWNER TO postgres;
ALTER FUNCTION private.billing_minor_fixed_decimal(bigint) OWNER TO postgres;
ALTER FUNCTION private.billing_legacy_execution_effect(uuid) OWNER TO postgres;
ALTER FUNCTION private.billing_invoice_exact_payload(public.invoices) OWNER TO postgres;
ALTER FUNCTION private.billing_invoice_legacy_payload(public.invoices) OWNER TO postgres;
ALTER FUNCTION private.billing_invoice_exact_before_write() OWNER TO postgres;
ALTER FUNCTION private.billing_invoice_protect_issued_snapshot() OWNER TO postgres;
ALTER FUNCTION private.billing_invoice_rate_presentation_audit() OWNER TO postgres;
ALTER FUNCTION private.billing_automation_exact_before_write() OWNER TO postgres;
ALTER FUNCTION private.billing_consume_automation_grant(uuid,uuid,text,text,text,text,jsonb,text,jsonb) OWNER TO postgres;
ALTER FUNCTION private.billing_finalize_evidence_inspection(uuid,uuid,text,text,text,text,text) OWNER TO postgres;
ALTER FUNCTION public.execute_billing_automation_command(uuid,uuid,text,text,text,text,jsonb,text) OWNER TO postgres;
ALTER FUNCTION public.finalize_billing_evidence_inspection(uuid,uuid,text,text,text,text,text) OWNER TO postgres;
ALTER FUNCTION public.read_billing_invoices_exact(jsonb) OWNER TO postgres;
ALTER FUNCTION public.read_billing_invoices_legacy_compat(jsonb) OWNER TO postgres;
ALTER FUNCTION public.save_billing_invoice_exact(jsonb) OWNER TO postgres;

REVOKE ALL ON FUNCTION private.billing_legacy_decimal_ratio(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_legacy_money_minor(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_exact_money(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_canonical_date(jsonb,boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_exact_rate(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_exact_line_items(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_convert_legacy_line_items(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_minor_fixed_decimal(bigint) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_legacy_execution_effect(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_invoice_exact_payload(public.invoices) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_invoice_legacy_payload(public.invoices) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_invoice_exact_before_write() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_invoice_protect_issued_snapshot() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_invoice_rate_presentation_audit() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_automation_exact_before_write() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_consume_automation_grant(uuid,uuid,text,text,text,text,jsonb,text,jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_finalize_evidence_inspection(uuid,uuid,text,text,text,text,text) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.read_billing_invoices_exact(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.read_billing_invoices_legacy_compat(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.save_billing_invoice_exact(jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.read_billing_invoices_exact(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.read_billing_invoices_legacy_compat(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_billing_invoice_exact(jsonb) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.execute_billing_automation_command(uuid,uuid,text,text,text,text,jsonb,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.execute_billing_automation_command(uuid,uuid,text,text,text,text,jsonb,text) TO authenticated;
REVOKE ALL ON FUNCTION public.finalize_billing_evidence_inspection(uuid,uuid,text,text,text,text,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_billing_evidence_inspection(uuid,uuid,text,text,text,text,text) TO authenticated;

REVOKE ALL ON TABLE public.invoices FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.invoices_id_seq FROM anon, authenticated;
GRANT ALL ON TABLE public.invoices TO service_role;
GRANT ALL ON SEQUENCE public.invoices_id_seq TO service_role;

COMMIT;
