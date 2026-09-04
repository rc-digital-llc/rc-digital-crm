-- Phase 4: exact billing formula and immutable calculation authority.

BEGIN;

CREATE FUNCTION private.billing_calculate_exact(p_input jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  input_keys text[];
  formula_kind_value text;
  commissionable_value bigint;
  fixed_value bigint;
  minimum_value bigint;
  rate_value jsonb;
  rate_numerator_value bigint;
  rate_denominator_value bigint;
  intermediate_numerator_value numeric;
  percentage_value bigint;
  selected_branch_value text;
  final_value bigint;
  financial_message text;
BEGIN
  IF pg_catalog.jsonb_typeof(p_input) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'BILLING_CALCULATION_INVALID';
  END IF;
  SELECT COALESCE(pg_catalog.array_agg(key ORDER BY key), ARRAY[]::text[])
  INTO input_keys
  FROM pg_catalog.jsonb_object_keys(p_input) AS keys(key);
  IF input_keys IS DISTINCT FROM ARRAY[
      'commissionable_amount', 'currency_policy_version', 'fixed_amount',
      'formula_kind', 'formula_version', 'minimum_amount', 'rate',
      'rounding_policy_version'
    ]::text[]
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'BILLING_CALCULATION_INVALID';
  END IF;

  formula_kind_value := p_input->>'formula_kind';
  IF formula_kind_value NOT IN ('fixed', 'percentage', 'minimum_support', 'hybrid') THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023', MESSAGE = 'BILLING_CALCULATION_UNSUPPORTED_FORMULA';
  END IF;
  IF p_input->>'currency_policy_version' IS DISTINCT FROM 'usd-v1'
    OR p_input->>'rounding_policy_version' IS DISTINCT FROM 'half-away-from-zero-v1'
    OR p_input->>'formula_version' IS DISTINCT FROM 'billing-agreement-formula-v1'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023', MESSAGE = 'BILLING_CALCULATION_POLICY_MISMATCH';
  END IF;

  BEGIN
    commissionable_value := (
      public.financial_parse_usd_money(
        p_input->'commissionable_amount', 'usd-v1'
      )->>'amount_minor'
    )::bigint;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS financial_message = MESSAGE_TEXT;
    IF financial_message = 'FINANCIAL_OVERFLOW' THEN
      RAISE EXCEPTION USING ERRCODE = '22003', MESSAGE = 'BILLING_CALCULATION_OVERFLOW';
    END IF;
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'BILLING_CALCULATION_INVALID';
  END;
  IF commissionable_value < 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023', MESSAGE = 'BILLING_CALCULATION_NEGATIVE_REVENUE';
  END IF;

  IF formula_kind_value = 'fixed' THEN
    IF p_input->'fixed_amount' = 'null'::jsonb
      OR p_input->'minimum_amount' <> 'null'::jsonb
      OR p_input->'rate' <> 'null'::jsonb
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'BILLING_CALCULATION_INVALID';
    END IF;
    BEGIN
      fixed_value := (
        public.financial_parse_usd_money(p_input->'fixed_amount', 'usd-v1')
          ->>'amount_minor'
      )::bigint;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS financial_message = MESSAGE_TEXT;
      IF financial_message = 'FINANCIAL_OVERFLOW' THEN
        RAISE EXCEPTION USING
          ERRCODE = '22003', MESSAGE = 'BILLING_CALCULATION_OVERFLOW';
      END IF;
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'BILLING_CALCULATION_INVALID';
    END;
    IF fixed_value < 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'BILLING_CALCULATION_INVALID';
    END IF;
    selected_branch_value := 'fixed';
    final_value := fixed_value;
  ELSIF formula_kind_value = 'minimum_support' THEN
    IF p_input->'fixed_amount' <> 'null'::jsonb
      OR p_input->'minimum_amount' = 'null'::jsonb
      OR p_input->'rate' <> 'null'::jsonb
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'BILLING_CALCULATION_INVALID';
    END IF;
    BEGIN
      minimum_value := (
        public.financial_parse_usd_money(p_input->'minimum_amount', 'usd-v1')
          ->>'amount_minor'
      )::bigint;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS financial_message = MESSAGE_TEXT;
      IF financial_message = 'FINANCIAL_OVERFLOW' THEN
        RAISE EXCEPTION USING
          ERRCODE = '22003', MESSAGE = 'BILLING_CALCULATION_OVERFLOW';
      END IF;
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'BILLING_CALCULATION_INVALID';
    END;
    IF minimum_value < 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'BILLING_CALCULATION_INVALID';
    END IF;
    selected_branch_value := 'minimum';
    final_value := minimum_value;
  ELSE
    IF p_input->'fixed_amount' <> 'null'::jsonb
      OR p_input->'rate' = 'null'::jsonb
      OR (formula_kind_value = 'percentage' AND p_input->'minimum_amount' <> 'null'::jsonb)
      OR (formula_kind_value = 'hybrid' AND p_input->'minimum_amount' = 'null'::jsonb)
    THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'BILLING_CALCULATION_INVALID';
    END IF;
    IF p_input->'rate'->>'denominator' = '0' THEN
      RAISE EXCEPTION USING
        ERRCODE = '22012', MESSAGE = 'BILLING_CALCULATION_DIVISION_BY_ZERO';
    END IF;
    BEGIN
      rate_value := public.financial_parse_ordinary_percentage(
        p_input->'rate'->'submitted_percentage', 'ordinary-percentage-v1'
      );
      IF rate_value->>'numerator' IS DISTINCT FROM p_input->'rate'->>'numerator'
        OR rate_value->>'denominator' IS DISTINCT FROM p_input->'rate'->>'denominator'
        OR p_input->'rate'->>'kind' IS DISTINCT FROM 'ordinary_percentage'
        OR p_input->'rate'->>'rate_policy_version'
          IS DISTINCT FROM 'ordinary-percentage-v1'
        OR (
          SELECT pg_catalog.array_agg(key ORDER BY key)
          FROM pg_catalog.jsonb_object_keys(p_input->'rate') AS keys(key)
        ) IS DISTINCT FROM ARRAY[
          'denominator', 'kind', 'numerator', 'rate_policy_version',
          'submitted_percentage'
        ]::text[]
      THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'BILLING_CALCULATION_INVALID';
      END IF;
      rate_numerator_value := (rate_value->>'numerator')::bigint;
      rate_denominator_value := (rate_value->>'denominator')::bigint;
    EXCEPTION
      WHEN SQLSTATE '22012' THEN
        RAISE EXCEPTION USING
          ERRCODE = '22012', MESSAGE = 'BILLING_CALCULATION_DIVISION_BY_ZERO';
      WHEN OTHERS THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'BILLING_CALCULATION_INVALID';
    END;
    intermediate_numerator_value :=
      commissionable_value::numeric * rate_numerator_value::numeric;
    BEGIN
      percentage_value := (
        public.financial_round_usd_minor(
          pg_catalog.jsonb_build_object(
            'numerator', intermediate_numerator_value::text,
            'denominator', rate_denominator_value::text,
            'currency', 'USD'
          ),
          'usd-v1', 'half-away-from-zero-v1', 2
        )->>'amount_minor'
      )::bigint;
    EXCEPTION WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS financial_message = MESSAGE_TEXT;
      IF financial_message = 'FINANCIAL_OVERFLOW' THEN
        RAISE EXCEPTION USING
          ERRCODE = '22003', MESSAGE = 'BILLING_CALCULATION_OVERFLOW';
      END IF;
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'BILLING_CALCULATION_INVALID';
    END;

    IF formula_kind_value = 'percentage' THEN
      selected_branch_value := 'percentage';
      final_value := percentage_value;
    ELSE
      BEGIN
        minimum_value := (
          public.financial_parse_usd_money(p_input->'minimum_amount', 'usd-v1')
            ->>'amount_minor'
        )::bigint;
      EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS financial_message = MESSAGE_TEXT;
        IF financial_message = 'FINANCIAL_OVERFLOW' THEN
          RAISE EXCEPTION USING
            ERRCODE = '22003', MESSAGE = 'BILLING_CALCULATION_OVERFLOW';
        END IF;
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'BILLING_CALCULATION_INVALID';
      END;
      IF minimum_value < 0 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'BILLING_CALCULATION_INVALID';
      END IF;
      IF percentage_value > minimum_value THEN
        selected_branch_value := 'percentage';
        final_value := percentage_value;
      ELSIF percentage_value = minimum_value THEN
        selected_branch_value := 'minimum_equal';
        final_value := minimum_value;
      ELSE
        selected_branch_value := 'minimum';
        final_value := minimum_value;
      END IF;
    END IF;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'formula_kind', formula_kind_value,
    'intermediate_numerator', CASE WHEN intermediate_numerator_value IS NULL
      THEN NULL ELSE intermediate_numerator_value::text END,
    'intermediate_denominator', CASE WHEN rate_denominator_value IS NULL
      THEN NULL ELSE rate_denominator_value::text END,
    'fixed_candidate_minor', CASE WHEN fixed_value IS NULL
      THEN NULL ELSE fixed_value::text END,
    'minimum_candidate_minor', CASE WHEN minimum_value IS NULL
      THEN NULL ELSE minimum_value::text END,
    'percentage_candidate_minor', CASE WHEN percentage_value IS NULL
      THEN NULL ELSE percentage_value::text END,
    'selected_branch', selected_branch_value,
    'final_amount_minor', final_value::text,
    'currency', 'USD'
  );
END;
$function$;

ALTER FUNCTION private.billing_calculate_exact(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.billing_calculate_exact(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
