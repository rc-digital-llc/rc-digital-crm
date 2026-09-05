-- Phase 3: immutable exact-money policies and PostgreSQL arithmetic primitives.

BEGIN;

-- Exact invoice reads require an explicit historical issue date. Refuse the
-- entire Phase 3 chain before creating any exact-money policy, seed row,
-- trigger, policy, or helper when that legacy fact is unresolved. Migration
-- 20260902000002 repeats this check to protect against intervening drift.
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

CREATE TABLE public.financial_currency_policies (
  policy_version text PRIMARY KEY CHECK (
    policy_version ~ '^[a-z][a-z0-9-]*-v[1-9][0-9]*$'
  ),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  exponent smallint NOT NULL CHECK (exponent BETWEEN 0 AND 9),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  UNIQUE (currency, policy_version),
  UNIQUE (policy_version, exponent)
);

CREATE TABLE public.financial_rate_policies (
  policy_version text PRIMARY KEY CHECK (
    policy_version ~ '^[a-z][a-z0-9-]*-v[1-9][0-9]*$'
  ),
  rate_kind text NOT NULL UNIQUE CHECK (
    rate_kind ~ '^[a-z][a-z0-9_]*$'
  ),
  minimum_numerator bigint NOT NULL,
  minimum_denominator bigint NOT NULL CHECK (minimum_denominator > 0),
  maximum_numerator bigint NOT NULL,
  maximum_denominator bigint NOT NULL CHECK (maximum_denominator > 0),
  maximum_fractional_digits smallint NOT NULL CHECK (
    maximum_fractional_digits BETWEEN 0 AND 9
  ),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT financial_rate_policy_order CHECK (
    minimum_numerator >= 0
      AND maximum_numerator >= 0
      AND minimum_numerator::numeric * maximum_denominator::numeric
        <= maximum_numerator::numeric * minimum_denominator::numeric
  )
);

CREATE TABLE public.financial_rounding_policies (
  policy_version text PRIMARY KEY CHECK (
    policy_version ~ '^[a-z][a-z0-9-]*-v[1-9][0-9]*$'
  ),
  currency_policy_version text NOT NULL,
  currency_exponent smallint NOT NULL CHECK (currency_exponent BETWEEN 0 AND 9),
  tie_rule text NOT NULL CHECK (tie_rule = 'half_away_from_zero'),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT financial_rounding_currency_policy_fk
    FOREIGN KEY (currency_policy_version, currency_exponent)
    REFERENCES public.financial_currency_policies (policy_version, exponent)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT
);

INSERT INTO public.financial_currency_policies (
  policy_version,
  currency,
  exponent
) VALUES (
  'usd-v1',
  'USD',
  2
);

INSERT INTO public.financial_rate_policies (
  policy_version,
  rate_kind,
  minimum_numerator,
  minimum_denominator,
  maximum_numerator,
  maximum_denominator,
  maximum_fractional_digits
) VALUES (
  'ordinary-percentage-v1',
  'ordinary_percentage',
  0,
  1,
  1,
  1,
  9
);

INSERT INTO public.financial_rounding_policies (
  policy_version,
  currency_policy_version,
  currency_exponent,
  tie_rule
) VALUES (
  'half-away-from-zero-v1',
  'usd-v1',
  2,
  'half_away_from_zero'
);

CREATE OR REPLACE FUNCTION private.financial_catalog_row_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = 'P0001',
    MESSAGE = 'FINANCIAL_POLICY_IMMUTABLE';
END;
$function$;

CREATE TRIGGER financial_currency_policies_immutable
BEFORE UPDATE OR DELETE ON public.financial_currency_policies
FOR EACH ROW EXECUTE FUNCTION private.financial_catalog_row_immutable();

CREATE TRIGGER financial_rate_policies_immutable
BEFORE UPDATE OR DELETE ON public.financial_rate_policies
FOR EACH ROW EXECUTE FUNCTION private.financial_catalog_row_immutable();

CREATE TRIGGER financial_rounding_policies_immutable
BEFORE UPDATE OR DELETE ON public.financial_rounding_policies
FOR EACH ROW EXECUTE FUNCTION private.financial_catalog_row_immutable();

ALTER TABLE public.financial_currency_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_currency_policies FORCE ROW LEVEL SECURITY;
ALTER TABLE public.financial_rate_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_rate_policies FORCE ROW LEVEL SECURITY;
ALTER TABLE public.financial_rounding_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_rounding_policies FORCE ROW LEVEL SECURITY;

CREATE POLICY financial_currency_policies_select
ON public.financial_currency_policies
FOR SELECT TO authenticated
USING (true);

CREATE POLICY financial_rate_policies_select
ON public.financial_rate_policies
FOR SELECT TO authenticated
USING (true);

CREATE POLICY financial_rounding_policies_select
ON public.financial_rounding_policies
FOR SELECT TO authenticated
USING (true);

COMMENT ON TABLE public.financial_currency_policies IS
  'Global server-owned reference policy. Tenant sales_id ownership is intentionally inapplicable.';
COMMENT ON TABLE public.financial_rate_policies IS
  'Global server-owned reference policy. Tenant sales_id ownership is intentionally inapplicable.';
COMMENT ON TABLE public.financial_rounding_policies IS
  'Global server-owned reference policy. Tenant sales_id ownership is intentionally inapplicable.';

CREATE OR REPLACE FUNCTION private.financial_canonical_integer_text(
  p_input jsonb,
  p_require_bigint boolean
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
  input_text text;
  is_negative boolean;
  input_digits text;
  canonical_digits text;
  canonical_text text;
  exact_value numeric;
BEGIN
  IF p_input IS NULL
    OR pg_catalog.jsonb_typeof(p_input) IS DISTINCT FROM 'string'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'FINANCIAL_INVALID_INTEGER';
  END IF;

  input_text := p_input #>> '{}';
  IF pg_catalog.octet_length(input_text) > 64 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'FINANCIAL_INPUT_TOO_LONG';
  END IF;
  IF input_text !~ '^-?[0-9]+$' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'FINANCIAL_INVALID_INTEGER';
  END IF;

  is_negative := pg_catalog.left(input_text, 1) = '-';
  input_digits := CASE
    WHEN is_negative THEN pg_catalog.substr(input_text, 2)
    ELSE input_text
  END;
  canonical_digits := pg_catalog.ltrim(input_digits, '0');
  IF canonical_digits = '' THEN
    canonical_digits := '0';
  END IF;
  canonical_text := CASE
    WHEN canonical_digits = '0' THEN '0'
    WHEN is_negative THEN '-' || canonical_digits
    ELSE canonical_digits
  END;

  IF p_require_bigint THEN
    exact_value := canonical_text::numeric;
    IF exact_value < '-9223372036854775808'::numeric
      OR exact_value > '9223372036854775807'::numeric
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '22003',
        MESSAGE = 'FINANCIAL_OVERFLOW';
    END IF;
    canonical_text := exact_value::bigint::text;
  END IF;

  RETURN canonical_text;
END;
$function$;

CREATE OR REPLACE FUNCTION private.financial_gcd(
  p_left numeric,
  p_right numeric
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = ''
AS $function$
DECLARE
  dividend numeric := CASE WHEN p_left < 0 THEN -p_left ELSE p_left END;
  divisor numeric := CASE WHEN p_right < 0 THEN -p_right ELSE p_right END;
  remainder_value numeric;
BEGIN
  WHILE divisor <> 0 LOOP
    remainder_value := pg_catalog.mod(dividend, divisor);
    dividend := divisor;
    divisor := remainder_value;
  END LOOP;
  RETURN CASE WHEN dividend = 0 THEN 1::numeric ELSE dividend END;
END;
$function$;

CREATE OR REPLACE FUNCTION private.financial_reduce_ratio(
  p_numerator jsonb,
  p_denominator jsonb,
  p_require_bigint boolean
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $function$
DECLARE
  numerator_input text;
  denominator_input text;
  numerator_text text;
  denominator_text text;
  numerator_value numeric;
  denominator_value numeric;
  common_divisor numeric;
  reduced_numerator numeric;
  reduced_denominator numeric;
BEGIN
  IF p_numerator IS NULL
    OR p_denominator IS NULL
    OR pg_catalog.jsonb_typeof(p_numerator) IS DISTINCT FROM 'string'
    OR pg_catalog.jsonb_typeof(p_denominator) IS DISTINCT FROM 'string'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'FINANCIAL_INVALID_RATIO';
  END IF;

  numerator_input := p_numerator #>> '{}';
  denominator_input := p_denominator #>> '{}';
  IF pg_catalog.octet_length(numerator_input) > 64
    OR pg_catalog.octet_length(denominator_input) > 64
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'FINANCIAL_INPUT_TOO_LONG';
  END IF;
  IF numerator_input !~ '^-?[0-9]+$'
    OR denominator_input !~ '^-?[0-9]+$'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'FINANCIAL_INVALID_RATIO';
  END IF;

  numerator_text := private.financial_canonical_integer_text(p_numerator, false);
  denominator_text := private.financial_canonical_integer_text(p_denominator, false);
  numerator_value := numerator_text::numeric;
  denominator_value := denominator_text::numeric;

  IF denominator_value = 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22012',
      MESSAGE = 'FINANCIAL_ZERO_DENOMINATOR';
  END IF;
  IF denominator_value < 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'FINANCIAL_INVALID_RATIO';
  END IF;

  common_divisor := private.financial_gcd(numerator_value, denominator_value);
  reduced_numerator := numerator_value / common_divisor;
  reduced_denominator := CASE
    WHEN reduced_numerator = 0 THEN 1::numeric
    ELSE denominator_value / common_divisor
  END;

  IF p_require_bigint AND (
    reduced_numerator < '-9223372036854775808'::numeric
    OR reduced_numerator > '9223372036854775807'::numeric
    OR reduced_denominator > '9223372036854775807'::numeric
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22003',
      MESSAGE = 'FINANCIAL_OVERFLOW';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'numerator', CASE
      WHEN p_require_bigint THEN reduced_numerator::bigint::text
      ELSE reduced_numerator::text
    END,
    'denominator', CASE
      WHEN p_require_bigint THEN reduced_denominator::bigint::text
      ELSE reduced_denominator::text
    END
  );
END;
$function$;

CREATE OR REPLACE FUNCTION private.financial_parse_percentage(
  p_percentage jsonb,
  p_rate_policy_version text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  percentage_text text;
  decimal_text text;
  whole_text text;
  fraction_text text;
  scale_value numeric;
  scaled_percentage numeric;
  ratio_value jsonb;
BEGIN
  IF p_percentage IS NULL
    OR pg_catalog.jsonb_typeof(p_percentage) IS DISTINCT FROM 'string'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'FINANCIAL_INVALID_PERCENTAGE';
  END IF;

  percentage_text := p_percentage #>> '{}';
  IF pg_catalog.octet_length(percentage_text) > 14 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'FINANCIAL_INPUT_TOO_LONG';
  END IF;

  IF p_rate_policy_version IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.financial_rate_policies AS policy
    WHERE policy.policy_version = p_rate_policy_version
      AND policy.rate_kind = 'ordinary_percentage'
      AND policy.minimum_numerator = 0
      AND policy.minimum_denominator = 1
      AND policy.maximum_numerator = 1
      AND policy.maximum_denominator = 1
      AND policy.maximum_fractional_digits = 9
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'FINANCIAL_POLICY_MISMATCH';
  END IF;

  IF percentage_text ~ '^[0-9]{1,3}(\.[0-9]{1,9})?%$' THEN
    decimal_text := pg_catalog.left(
      percentage_text,
      pg_catalog.length(percentage_text) - 1
    );
    IF decimal_text::numeric > 100::numeric THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'FINANCIAL_RATE_OUT_OF_BOUNDS';
    END IF;
  END IF;

  IF percentage_text !~ '^(0|[1-9][0-9]?|100)(\.[0-9]{1,9})?%$' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'FINANCIAL_INVALID_PERCENTAGE';
  END IF;

  decimal_text := pg_catalog.left(
    percentage_text,
    pg_catalog.length(percentage_text) - 1
  );
  whole_text := pg_catalog.split_part(decimal_text, '.', 1);
  fraction_text := CASE
    WHEN pg_catalog.strpos(decimal_text, '.') = 0 THEN ''
    ELSE pg_catalog.split_part(decimal_text, '.', 2)
  END;
  scale_value := (
    '1' || pg_catalog.repeat('0', pg_catalog.length(fraction_text))
  )::numeric;
  scaled_percentage := (whole_text || fraction_text)::numeric;
  ratio_value := private.financial_reduce_ratio(
    pg_catalog.to_jsonb(scaled_percentage::text),
    pg_catalog.to_jsonb((100::numeric * scale_value)::text),
    true
  );

  RETURN pg_catalog.jsonb_build_object(
    'kind', 'ordinary_percentage',
    'numerator', ratio_value->>'numerator',
    'denominator', ratio_value->>'denominator',
    'submitted_percentage', percentage_text,
    'rate_policy_version', p_rate_policy_version
  );
END;
$function$;

CREATE OR REPLACE FUNCTION private.financial_round_ratio(
  p_numerator jsonb,
  p_denominator jsonb,
  p_currency text,
  p_currency_policy_version text,
  p_currency_exponent smallint,
  p_rounding_policy_version text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  reduced_ratio jsonb;
  numerator_value numeric;
  denominator_value numeric;
  magnitude numeric;
  quotient_value numeric;
  remainder_value numeric;
  rounded_magnitude numeric;
  rounded_value numeric;
BEGIN
  IF p_currency IS DISTINCT FROM 'USD' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'FINANCIAL_UNSUPPORTED_CURRENCY';
  END IF;

  IF p_currency_policy_version IS NULL
    OR p_currency_exponent IS NULL
    OR p_rounding_policy_version IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM public.financial_currency_policies AS currency_policy
      JOIN public.financial_rounding_policies AS rounding_policy
        ON rounding_policy.currency_policy_version = currency_policy.policy_version
        AND rounding_policy.currency_exponent = currency_policy.exponent
      WHERE currency_policy.policy_version = p_currency_policy_version
        AND currency_policy.currency = p_currency
        AND currency_policy.exponent = p_currency_exponent
        AND rounding_policy.policy_version = p_rounding_policy_version
        AND rounding_policy.tie_rule = 'half_away_from_zero'
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'FINANCIAL_POLICY_MISMATCH';
  END IF;

  reduced_ratio := private.financial_reduce_ratio(
    p_numerator,
    p_denominator,
    false
  );
  numerator_value := (reduced_ratio->>'numerator')::numeric;
  denominator_value := (reduced_ratio->>'denominator')::numeric;
  magnitude := CASE
    WHEN numerator_value < 0 THEN -numerator_value
    ELSE numerator_value
  END;
  quotient_value := pg_catalog.trunc(magnitude / denominator_value);
  remainder_value := pg_catalog.mod(magnitude, denominator_value);
  rounded_magnitude := CASE
    WHEN remainder_value * 2 >= denominator_value THEN quotient_value + 1
    ELSE quotient_value
  END;
  rounded_value := CASE
    WHEN numerator_value < 0 THEN -rounded_magnitude
    ELSE rounded_magnitude
  END;

  IF rounded_value < '-9223372036854775808'::numeric
    OR rounded_value > '9223372036854775807'::numeric
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22003',
      MESSAGE = 'FINANCIAL_OVERFLOW';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'amount_minor', rounded_value::bigint::text,
    'currency', p_currency
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.financial_normalize_integer(p_input jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT private.financial_canonical_integer_text(p_input, true);
$function$;

CREATE OR REPLACE FUNCTION public.financial_parse_percentage(
  p_percentage jsonb,
  p_rate_policy_version text
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT private.financial_parse_percentage(
    p_percentage,
    p_rate_policy_version
  );
$function$;

CREATE OR REPLACE FUNCTION public.financial_reduce_ratio(
  p_numerator jsonb,
  p_denominator jsonb
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT private.financial_reduce_ratio(
    p_numerator,
    p_denominator,
    true
  );
$function$;

CREATE OR REPLACE FUNCTION public.financial_round_to_minor_units(
  p_numerator jsonb,
  p_denominator jsonb,
  p_currency text,
  p_currency_policy_version text,
  p_currency_exponent smallint,
  p_rounding_policy_version text
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT private.financial_round_ratio(
    p_numerator,
    p_denominator,
    p_currency,
    p_currency_policy_version,
    p_currency_exponent,
    p_rounding_policy_version
  );
$function$;

REVOKE ALL ON FUNCTION private.financial_catalog_row_immutable()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.financial_canonical_integer_text(jsonb, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.financial_gcd(numeric, numeric)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.financial_reduce_ratio(jsonb, jsonb, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.financial_parse_percentage(jsonb, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.financial_round_ratio(jsonb, jsonb, text, text, smallint, text)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.financial_normalize_integer(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.financial_parse_percentage(jsonb, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.financial_reduce_ratio(jsonb, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.financial_round_to_minor_units(jsonb, jsonb, text, text, smallint, text)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.financial_normalize_integer(jsonb)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.financial_parse_percentage(jsonb, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.financial_reduce_ratio(jsonb, jsonb)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.financial_round_to_minor_units(jsonb, jsonb, text, text, smallint, text)
  TO authenticated, service_role;

REVOKE ALL ON TABLE public.financial_currency_policies,
  public.financial_rate_policies,
  public.financial_rounding_policies
  FROM anon, authenticated, service_role;
GRANT SELECT ON TABLE public.financial_currency_policies,
  public.financial_rate_policies,
  public.financial_rounding_policies
  TO authenticated, service_role;

COMMIT;
