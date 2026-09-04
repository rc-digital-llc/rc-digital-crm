BEGIN;

-- These catalogs are global, server-owned reference data. They intentionally
-- have no sales_id because financial policy identity is shared by every tenant.
CREATE TABLE public.financial_currency_policies (
  policy_version text PRIMARY KEY,
  currency text NOT NULL,
  minor_unit_exponent smallint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT financial_currency_policy_version_check
    CHECK (policy_version ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT financial_currency_code_check
    CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT financial_currency_exponent_check
    CHECK (minor_unit_exponent BETWEEN 0 AND 9),
  CONSTRAINT financial_currency_policy_identity_unique
    UNIQUE (currency, minor_unit_exponent)
);

CREATE TABLE public.financial_rate_policies (
  policy_version text PRIMARY KEY,
  kind text NOT NULL,
  minimum_numerator bigint NOT NULL,
  minimum_denominator bigint NOT NULL,
  maximum_numerator bigint NOT NULL,
  maximum_denominator bigint NOT NULL,
  maximum_fraction_digits smallint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT financial_rate_policy_version_check
    CHECK (policy_version ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT financial_rate_kind_check
    CHECK (kind = 'ordinary_percentage'),
  CONSTRAINT financial_rate_bounds_check
    CHECK (
      minimum_numerator = 0
      AND minimum_denominator = 1
      AND maximum_numerator = 1
      AND maximum_denominator > 0
      AND maximum_fraction_digits BETWEEN 0 AND 9
    )
);

CREATE TABLE public.financial_rounding_policies (
  policy_version text PRIMARY KEY,
  currency_policy_version text NOT NULL
    REFERENCES public.financial_currency_policies (policy_version),
  tie_rule text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT financial_rounding_policy_version_check
    CHECK (policy_version ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT financial_rounding_tie_rule_check
    CHECK (tie_rule = 'half_away_from_zero')
);

INSERT INTO public.financial_currency_policies (
  policy_version,
  currency,
  minor_unit_exponent
)
VALUES ('usd-v1', 'USD', 2);

INSERT INTO public.financial_rate_policies (
  policy_version,
  kind,
  minimum_numerator,
  minimum_denominator,
  maximum_numerator,
  maximum_denominator,
  maximum_fraction_digits
)
VALUES (
  'ordinary-percentage-v1',
  'ordinary_percentage',
  0,
  1,
  1,
  100000000000,
  9
);

INSERT INTO public.financial_rounding_policies (
  policy_version,
  currency_policy_version,
  tie_rule
)
VALUES ('half-away-from-zero-v1', 'usd-v1', 'half_away_from_zero');

ALTER TABLE public.financial_currency_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_currency_policies FORCE ROW LEVEL SECURITY;
ALTER TABLE public.financial_rate_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_rate_policies FORCE ROW LEVEL SECURITY;
ALTER TABLE public.financial_rounding_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_rounding_policies FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.financial_currency_policies FROM PUBLIC;
REVOKE ALL ON TABLE public.financial_currency_policies FROM anon;
REVOKE ALL ON TABLE public.financial_currency_policies FROM authenticated;
REVOKE ALL ON TABLE public.financial_currency_policies FROM service_role;
REVOKE ALL ON TABLE public.financial_rate_policies FROM PUBLIC;
REVOKE ALL ON TABLE public.financial_rate_policies FROM anon;
REVOKE ALL ON TABLE public.financial_rate_policies FROM authenticated;
REVOKE ALL ON TABLE public.financial_rate_policies FROM service_role;
REVOKE ALL ON TABLE public.financial_rounding_policies FROM PUBLIC;
REVOKE ALL ON TABLE public.financial_rounding_policies FROM anon;
REVOKE ALL ON TABLE public.financial_rounding_policies FROM authenticated;
REVOKE ALL ON TABLE public.financial_rounding_policies FROM service_role;

CREATE FUNCTION private.financial_policy_catalog_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = 'P0001',
    MESSAGE = 'FINANCIAL_POLICY_IMMUTABLE';
END;
$$;

CREATE TRIGGER financial_currency_policies_immutable
BEFORE UPDATE OR DELETE ON public.financial_currency_policies
FOR EACH ROW EXECUTE FUNCTION private.financial_policy_catalog_immutable();

CREATE TRIGGER financial_rate_policies_immutable
BEFORE UPDATE OR DELETE ON public.financial_rate_policies
FOR EACH ROW EXECUTE FUNCTION private.financial_policy_catalog_immutable();

CREATE TRIGGER financial_rounding_policies_immutable
BEFORE UPDATE OR DELETE ON public.financial_rounding_policies
FOR EACH ROW EXECUTE FUNCTION private.financial_policy_catalog_immutable();

CREATE FUNCTION private.financial_parse_exact_integer(p_value jsonb)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  integer_text text;
BEGIN
  IF pg_catalog.jsonb_typeof(p_value) IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'FINANCIAL_INVALID_INTEGER';
  END IF;

  integer_text := p_value #>> '{}';
  IF pg_catalog.octet_length(integer_text) > 64 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'FINANCIAL_INPUT_TOO_LONG';
  END IF;
  IF integer_text !~ '^-?[0-9]+$' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'FINANCIAL_INVALID_INTEGER';
  END IF;

  RETURN integer_text::numeric;
END;
$$;

CREATE FUNCTION private.financial_parse_canonical_integer(p_value jsonb)
RETURNS bigint
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  parsed_value numeric;
BEGIN
  parsed_value := private.financial_parse_exact_integer(p_value);
  IF parsed_value < -9223372036854775808::numeric
    OR parsed_value > 9223372036854775807::numeric THEN
    RAISE EXCEPTION USING
      ERRCODE = '22003',
      MESSAGE = 'FINANCIAL_OVERFLOW';
  END IF;

  RETURN parsed_value::bigint;
END;
$$;

CREATE FUNCTION private.financial_gcd(p_left numeric, p_right numeric)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  left_value numeric := pg_catalog.abs(p_left);
  right_value numeric := pg_catalog.abs(p_right);
  remainder_value numeric;
BEGIN
  WHILE right_value <> 0 LOOP
    remainder_value := pg_catalog.mod(left_value, right_value);
    left_value := right_value;
    right_value := remainder_value;
  END LOOP;
  RETURN left_value;
END;
$$;

CREATE FUNCTION private.financial_normalize_ratio(
  p_numerator jsonb,
  p_denominator jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  numerator_value numeric;
  denominator_value numeric;
  divisor numeric;
  reduced_numerator numeric;
  reduced_denominator numeric;
BEGIN
  numerator_value := private.financial_parse_canonical_integer(p_numerator)::numeric;
  denominator_value := private.financial_parse_canonical_integer(p_denominator)::numeric;

  IF denominator_value = 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22012',
      MESSAGE = 'FINANCIAL_DIVISION_BY_ZERO';
  END IF;
  IF denominator_value < 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'FINANCIAL_INVALID_RATIO';
  END IF;

  IF numerator_value = 0 THEN
    reduced_numerator := 0;
    reduced_denominator := 1;
  ELSE
    divisor := private.financial_gcd(numerator_value, denominator_value);
    reduced_numerator := numerator_value / divisor;
    reduced_denominator := denominator_value / divisor;
  END IF;

  IF reduced_numerator < -9223372036854775808::numeric
    OR reduced_numerator > 9223372036854775807::numeric
    OR reduced_denominator < 1
    OR reduced_denominator > 9223372036854775807::numeric THEN
    RAISE EXCEPTION USING
      ERRCODE = '22003',
      MESSAGE = 'FINANCIAL_OVERFLOW';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'numerator', reduced_numerator::bigint::text,
    'denominator', reduced_denominator::bigint::text
  );
END;
$$;

CREATE FUNCTION private.financial_parse_ordinary_percentage(
  p_value jsonb,
  p_policy_version text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  percentage_text text;
  decimal_text text;
  whole_text text;
  fraction_text text;
  fraction_digits integer;
  scale_value numeric;
  scaled_value numeric;
  maximum_value numeric;
  maximum_fraction_digits smallint;
  normalized_value jsonb;
BEGIN
  SELECT policy.maximum_fraction_digits
  INTO maximum_fraction_digits
  FROM public.financial_rate_policies AS policy
  WHERE policy.policy_version = p_policy_version
    AND policy.kind = 'ordinary_percentage';

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'FINANCIAL_POLICY_MISMATCH';
  END IF;

  IF pg_catalog.jsonb_typeof(p_value) IS DISTINCT FROM 'string' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'FINANCIAL_INVALID_RATE';
  END IF;

  percentage_text := p_value #>> '{}';
  IF pg_catalog.octet_length(percentage_text) > 14 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'FINANCIAL_INPUT_TOO_LONG';
  END IF;
  IF percentage_text !~ '^(0|[1-9][0-9]?|100)(\.[0-9]{1,9})?%$' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'FINANCIAL_INVALID_RATE';
  END IF;

  decimal_text := pg_catalog.rtrim(percentage_text, '%');
  whole_text := pg_catalog.split_part(decimal_text, '.', 1);
  fraction_text := CASE
    WHEN pg_catalog.strpos(decimal_text, '.') = 0 THEN ''
    ELSE pg_catalog.split_part(decimal_text, '.', 2)
  END;
  fraction_digits := pg_catalog.length(fraction_text);
  IF fraction_digits > maximum_fraction_digits THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'FINANCIAL_INVALID_RATE';
  END IF;

  scale_value := ('1' || pg_catalog.repeat('0', fraction_digits))::numeric;
  scaled_value := (whole_text || fraction_text)::numeric;
  maximum_value := 100 * scale_value;
  IF scaled_value < 0 OR scaled_value > maximum_value THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'FINANCIAL_RATE_OUT_OF_BOUNDS';
  END IF;

  normalized_value := private.financial_normalize_ratio(
    pg_catalog.to_jsonb(scaled_value::text),
    pg_catalog.to_jsonb(maximum_value::text)
  );

  RETURN normalized_value || pg_catalog.jsonb_build_object(
    'kind', 'ordinary_percentage',
    'submitted_percentage', percentage_text,
    'rate_policy_version', p_policy_version
  );
END;
$$;

CREATE FUNCTION private.financial_round_ratio(
  p_numerator numeric,
  p_denominator numeric,
  p_currency_policy_version text,
  p_rounding_policy_version text,
  p_currency_exponent integer
)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  absolute_numerator numeric;
  absolute_quotient numeric;
  remainder_value numeric;
  rounded_value numeric;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.financial_currency_policies AS currency_policy
    JOIN public.financial_rounding_policies AS rounding_policy
      ON rounding_policy.currency_policy_version = currency_policy.policy_version
    WHERE currency_policy.policy_version = p_currency_policy_version
      AND currency_policy.currency = 'USD'
      AND currency_policy.minor_unit_exponent = p_currency_exponent
      AND rounding_policy.policy_version = p_rounding_policy_version
      AND rounding_policy.tie_rule = 'half_away_from_zero'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'FINANCIAL_POLICY_MISMATCH';
  END IF;

  IF p_denominator = 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22012',
      MESSAGE = 'FINANCIAL_DIVISION_BY_ZERO';
  END IF;
  IF p_denominator < 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'FINANCIAL_INVALID_RATIO';
  END IF;

  absolute_numerator := pg_catalog.abs(p_numerator);
  absolute_quotient := pg_catalog.trunc(absolute_numerator / p_denominator);
  remainder_value := pg_catalog.mod(absolute_numerator, p_denominator);
  IF 2 * remainder_value >= p_denominator THEN
    absolute_quotient := absolute_quotient + 1;
  END IF;
  rounded_value := CASE
    WHEN p_numerator < 0 THEN -absolute_quotient
    ELSE absolute_quotient
  END;

  IF rounded_value < -9223372036854775808::numeric
    OR rounded_value > 9223372036854775807::numeric THEN
    RAISE EXCEPTION USING
      ERRCODE = '22003',
      MESSAGE = 'FINANCIAL_OVERFLOW';
  END IF;

  RETURN rounded_value::bigint;
END;
$$;

CREATE FUNCTION public.financial_parse_usd_money(
  p_value jsonb,
  p_currency_policy_version text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  amount_minor bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.financial_currency_policies AS policy
    WHERE policy.policy_version = p_currency_policy_version
      AND policy.currency = 'USD'
      AND policy.minor_unit_exponent = 2
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'FINANCIAL_POLICY_MISMATCH';
  END IF;

  IF p_value->>'currency' IS DISTINCT FROM 'USD' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'FINANCIAL_UNSUPPORTED_CURRENCY';
  END IF;

  amount_minor := private.financial_parse_canonical_integer(p_value->'amount_minor');
  RETURN pg_catalog.jsonb_build_object(
    'amount_minor', amount_minor::text,
    'currency', 'USD'
  );
END;
$$;

CREATE FUNCTION public.financial_parse_ordinary_percentage(
  p_value jsonb,
  p_rate_policy_version text
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.financial_parse_ordinary_percentage(p_value, p_rate_policy_version);
$$;

CREATE FUNCTION public.financial_round_usd_minor(
  p_ratio jsonb,
  p_currency_policy_version text,
  p_rounding_policy_version text,
  p_currency_exponent integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  numerator_value numeric;
  denominator_value numeric;
  rounded_value bigint;
BEGIN
  IF p_ratio ? 'currency'
    AND p_ratio->>'currency' IS DISTINCT FROM 'USD' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'FINANCIAL_UNSUPPORTED_CURRENCY';
  END IF;

  numerator_value := private.financial_parse_exact_integer(p_ratio->'numerator');
  denominator_value := private.financial_parse_exact_integer(p_ratio->'denominator');
  rounded_value := private.financial_round_ratio(
    numerator_value,
    denominator_value,
    p_currency_policy_version,
    p_rounding_policy_version,
    p_currency_exponent
  );

  RETURN pg_catalog.jsonb_build_object(
    'amount_minor', rounded_value::text,
    'currency', 'USD'
  );
END;
$$;

ALTER FUNCTION private.financial_policy_catalog_immutable() OWNER TO postgres;
ALTER FUNCTION private.financial_parse_exact_integer(jsonb) OWNER TO postgres;
ALTER FUNCTION private.financial_parse_canonical_integer(jsonb) OWNER TO postgres;
ALTER FUNCTION private.financial_gcd(numeric, numeric) OWNER TO postgres;
ALTER FUNCTION private.financial_normalize_ratio(jsonb, jsonb) OWNER TO postgres;
ALTER FUNCTION private.financial_parse_ordinary_percentage(jsonb, text) OWNER TO postgres;
ALTER FUNCTION private.financial_round_ratio(numeric, numeric, text, text, integer) OWNER TO postgres;
ALTER FUNCTION public.financial_parse_usd_money(jsonb, text) OWNER TO postgres;
ALTER FUNCTION public.financial_parse_ordinary_percentage(jsonb, text) OWNER TO postgres;
ALTER FUNCTION public.financial_round_usd_minor(jsonb, text, text, integer) OWNER TO postgres;

REVOKE ALL ON FUNCTION private.financial_policy_catalog_immutable() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.financial_parse_exact_integer(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.financial_parse_canonical_integer(jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.financial_gcd(numeric, numeric) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.financial_normalize_ratio(jsonb, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.financial_parse_ordinary_percentage(jsonb, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.financial_round_ratio(numeric, numeric, text, text, integer) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.financial_parse_usd_money(jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.financial_parse_ordinary_percentage(jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.financial_round_usd_minor(jsonb, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.financial_parse_usd_money(jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.financial_parse_ordinary_percentage(jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.financial_round_usd_minor(jsonb, text, text, integer) TO authenticated, service_role;

COMMIT;
