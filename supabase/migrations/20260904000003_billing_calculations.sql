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

INSERT INTO public.billing_role_capabilities (role, capability)
VALUES
  ('administrator', 'calculation.read'),
  ('administrator', 'calculation.create'),
  ('administrator', 'calculation.approve'),
  ('operator', 'calculation.read'),
  ('operator', 'calculation.create'),
  ('reviewer', 'calculation.read'),
  ('reviewer', 'calculation.approve')
ON CONFLICT DO NOTHING;

CREATE TABLE public.billing_close_policies (
  policy_version text PRIMARY KEY CHECK (
    policy_version ~ '^[a-z][a-z0-9_.-]{2,63}$'
  ),
  organization_id uuid,
  account_id uuid,
  policy_mode text NOT NULL DEFAULT 'manual'
    CHECK (policy_mode IN ('manual', 'auto')),
  active boolean NOT NULL DEFAULT false,
  allowed_account_statuses jsonb NOT NULL DEFAULT '["active"]'::jsonb,
  allowed_formula_kinds jsonb NOT NULL DEFAULT
    '["fixed","percentage","minimum_support","hybrid"]'::jsonb,
  allowed_close_modes jsonb NOT NULL DEFAULT
    '["accepted_evidence","minimum_only"]'::jsonb,
  allowed_provenance_kinds jsonb NOT NULL DEFAULT
    '["api","statement","portal","minimum_only"]'::jsonb,
  require_zero_anomalies boolean NOT NULL DEFAULT true,
  minimum_result_minor bigint NOT NULL DEFAULT 0
    CHECK (minimum_result_minor >= 0),
  maximum_result_minor bigint CHECK (
    maximum_result_minor IS NULL OR maximum_result_minor >= minimum_result_minor
  ),
  effective_from timestamptz NOT NULL DEFAULT pg_catalog.now(),
  effective_until timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT billing_close_policies_account_scope_fk
    FOREIGN KEY (account_id, organization_id)
    REFERENCES public.billing_accounts(id, organization_id)
    MATCH FULL ON DELETE RESTRICT,
  CONSTRAINT billing_close_policies_scope_check CHECK (
    (policy_mode = 'manual')
    OR (policy_mode = 'auto'
      AND organization_id IS NOT NULL
      AND account_id IS NOT NULL
      AND created_by IS NOT NULL)
  ),
  CONSTRAINT billing_close_policies_window_check CHECK (
    effective_until IS NULL OR effective_until > effective_from
  ),
  CONSTRAINT billing_close_policies_bounds_check CHECK (
    pg_catalog.jsonb_typeof(allowed_account_statuses) = 'array'
    AND pg_catalog.jsonb_array_length(allowed_account_statuses) BETWEEN 1 AND 3
    AND allowed_account_statuses <@ '["active","on_hold","closed"]'::jsonb
    AND pg_catalog.jsonb_typeof(allowed_formula_kinds) = 'array'
    AND pg_catalog.jsonb_array_length(allowed_formula_kinds) BETWEEN 1 AND 4
    AND allowed_formula_kinds <@
      '["fixed","percentage","minimum_support","hybrid"]'::jsonb
    AND pg_catalog.jsonb_typeof(allowed_close_modes) = 'array'
    AND pg_catalog.jsonb_array_length(allowed_close_modes) BETWEEN 1 AND 2
    AND allowed_close_modes <@ '["accepted_evidence","minimum_only"]'::jsonb
    AND pg_catalog.jsonb_typeof(allowed_provenance_kinds) = 'array'
    AND pg_catalog.jsonb_array_length(allowed_provenance_kinds) BETWEEN 1 AND 4
    AND allowed_provenance_kinds <@
      '["api","statement","portal","minimum_only"]'::jsonb
  )
);

INSERT INTO public.billing_close_policies (
  policy_version, policy_mode, active, allowed_account_statuses,
  allowed_formula_kinds, allowed_close_modes, allowed_provenance_kinds,
  require_zero_anomalies, minimum_result_minor, maximum_result_minor,
  effective_from
) VALUES (
  'billing-manual-v1', 'manual', true, '["active","on_hold","closed"]'::jsonb,
  '["fixed","percentage","minimum_support","hybrid"]'::jsonb,
  '["accepted_evidence","minimum_only"]'::jsonb,
  '["api","statement","portal","minimum_only"]'::jsonb,
  true, 0, NULL, '2026-01-01 00:00:00+00'::timestamptz
);

CREATE TABLE public.billing_calculations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  account_id uuid NOT NULL,
  agreement_id uuid NOT NULL,
  agreement_version_id uuid NOT NULL,
  period_id uuid NOT NULL,
  close_snapshot_id uuid NOT NULL,
  business_key text NOT NULL CHECK (business_key ~ '^[0-9a-f]{64}$'),
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  close_input_fingerprint text NOT NULL CHECK (
    close_input_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  terms_fingerprint text NOT NULL CHECK (terms_fingerprint ~ '^[0-9a-f]{64}$'),
  formula_kind text NOT NULL CHECK (
    formula_kind IN ('fixed', 'percentage', 'minimum_support', 'hybrid')
  ),
  formula_version text NOT NULL CHECK (
    formula_version = 'billing-agreement-formula-v1'
  ),
  rounding_policy_version text NOT NULL REFERENCES
    public.financial_rounding_policies(policy_version),
  close_policy_version text NOT NULL
    REFERENCES public.billing_close_policies(policy_version),
  explanation_version text NOT NULL CHECK (
    explanation_version = 'billing-agreement-explanation-v1'
  ),
  selected_branch text NOT NULL CHECK (
    selected_branch IN ('fixed', 'percentage', 'minimum', 'minimum_equal')
  ),
  result_amount_minor bigint NOT NULL CHECK (result_amount_minor >= 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  status text NOT NULL DEFAULT 'calculated' CHECK (status = 'calculated'),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_by_role text NOT NULL REFERENCES public.billing_roles(role),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT billing_calculations_account_scope_fk
    FOREIGN KEY (account_id, organization_id)
    REFERENCES public.billing_accounts(id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT billing_calculations_agreement_scope_fk
    FOREIGN KEY (agreement_id, organization_id, account_id)
    REFERENCES public.billing_agreements(id, organization_id, account_id)
    ON DELETE RESTRICT,
  CONSTRAINT billing_calculations_version_scope_fk
    FOREIGN KEY (agreement_version_id, organization_id, account_id)
    REFERENCES public.billing_agreement_versions(id, organization_id, account_id)
    ON DELETE RESTRICT,
  CONSTRAINT billing_calculations_period_scope_fk
    FOREIGN KEY (period_id, organization_id, account_id)
    REFERENCES public.billing_revenue_periods(id, organization_id, account_id)
    ON DELETE RESTRICT,
  CONSTRAINT billing_calculations_close_scope_fk
    FOREIGN KEY (close_snapshot_id, organization_id, account_id)
    REFERENCES public.billing_revenue_close_snapshots(id, organization_id, account_id)
    ON DELETE RESTRICT,
  CONSTRAINT billing_calculations_scope_unique
    UNIQUE (id, organization_id, account_id),
  CONSTRAINT billing_calculations_business_key_unique
    UNIQUE (organization_id, account_id, business_key),
  CONSTRAINT billing_calculations_close_unique UNIQUE (close_snapshot_id)
);

CREATE INDEX billing_calculations_scope_created_idx
  ON public.billing_calculations (
    organization_id, account_id, created_at DESC, id
  );

CREATE TABLE public.billing_calculation_snapshots (
  calculation_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  account_id uuid NOT NULL,
  agreement_id uuid NOT NULL,
  agreement_version_id uuid NOT NULL,
  period_id uuid NOT NULL,
  close_snapshot_id uuid NOT NULL,
  close_mode text NOT NULL CHECK (
    close_mode IN ('accepted_evidence', 'minimum_only')
  ),
  gross_amount_minor bigint,
  excluded_amount_minor bigint,
  source_commissionable_amount_minor bigint,
  calculation_base_minor bigint NOT NULL CHECK (calculation_base_minor >= 0),
  provenance_kind text CHECK (
    provenance_kind IS NULL OR provenance_kind IN ('api', 'statement', 'portal')
  ),
  provenance_source_id text,
  evidence_fingerprint text NOT NULL CHECK (
    evidence_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  formula_kind text NOT NULL CHECK (
    formula_kind IN ('fixed', 'percentage', 'minimum_support', 'hybrid')
  ),
  fixed_amount_minor bigint,
  minimum_amount_minor bigint,
  rate_numerator bigint,
  rate_denominator bigint,
  submitted_percentage text,
  intermediate_numerator numeric,
  intermediate_denominator bigint,
  fixed_candidate_minor bigint,
  minimum_candidate_minor bigint,
  percentage_candidate_minor bigint,
  selected_branch text NOT NULL CHECK (
    selected_branch IN ('fixed', 'percentage', 'minimum', 'minimum_equal')
  ),
  result_amount_minor bigint NOT NULL CHECK (result_amount_minor >= 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  currency_policy_version text NOT NULL REFERENCES
    public.financial_currency_policies(policy_version),
  rate_policy_version text NOT NULL REFERENCES
    public.financial_rate_policies(policy_version),
  rounding_policy_version text NOT NULL REFERENCES
    public.financial_rounding_policies(policy_version),
  formula_version text NOT NULL CHECK (
    formula_version = 'billing-agreement-formula-v1'
  ),
  revenue_close_policy_version text NOT NULL CHECK (
    revenue_close_policy_version = 'revenue-close-v1'
  ),
  close_policy_version text NOT NULL
    REFERENCES public.billing_close_policies(policy_version),
  explanation_version text NOT NULL CHECK (
    explanation_version = 'billing-agreement-explanation-v1'
  ),
  anomaly_results jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (
    pg_catalog.jsonb_typeof(anomaly_results) = 'array'
    AND pg_catalog.jsonb_array_length(anomaly_results) <= 100
  ),
  previous_calculation_id uuid REFERENCES
    public.billing_calculations(id) ON DELETE RESTRICT,
  comparison_status text NOT NULL CHECK (
    comparison_status IN ('not_available', 'available', 'zero_baseline')
  ),
  delta_minor bigint,
  delta_rate_numerator bigint,
  delta_rate_denominator bigint,
  snapshot_version text NOT NULL DEFAULT 'billing-calculation-snapshot-v1'
    CHECK (snapshot_version = 'billing-calculation-snapshot-v1'),
  snapshot_payload jsonb NOT NULL,
  snapshot_hash text NOT NULL CHECK (snapshot_hash ~ '^[0-9a-f]{64}$'),
  explanation_payload jsonb NOT NULL,
  explanation_hash text NOT NULL CHECK (explanation_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT billing_calculation_snapshots_calculation_scope_fk
    FOREIGN KEY (calculation_id, organization_id, account_id)
    REFERENCES public.billing_calculations(id, organization_id, account_id)
    ON DELETE RESTRICT,
  CONSTRAINT billing_calculation_snapshots_agreement_scope_fk
    FOREIGN KEY (agreement_id, organization_id, account_id)
    REFERENCES public.billing_agreements(id, organization_id, account_id)
    ON DELETE RESTRICT,
  CONSTRAINT billing_calculation_snapshots_version_scope_fk
    FOREIGN KEY (agreement_version_id, organization_id, account_id)
    REFERENCES public.billing_agreement_versions(id, organization_id, account_id)
    ON DELETE RESTRICT,
  CONSTRAINT billing_calculation_snapshots_period_scope_fk
    FOREIGN KEY (period_id, organization_id, account_id)
    REFERENCES public.billing_revenue_periods(id, organization_id, account_id)
    ON DELETE RESTRICT,
  CONSTRAINT billing_calculation_snapshots_close_scope_fk
    FOREIGN KEY (close_snapshot_id, organization_id, account_id)
    REFERENCES public.billing_revenue_close_snapshots(id, organization_id, account_id)
    ON DELETE RESTRICT,
  CONSTRAINT billing_calculation_snapshots_source_check CHECK (
    (close_mode = 'accepted_evidence'
      AND gross_amount_minor IS NOT NULL AND gross_amount_minor >= 0
      AND excluded_amount_minor IS NOT NULL AND excluded_amount_minor >= 0
      AND source_commissionable_amount_minor IS NOT NULL
      AND source_commissionable_amount_minor >= 0
      AND gross_amount_minor - excluded_amount_minor = source_commissionable_amount_minor
      AND calculation_base_minor = source_commissionable_amount_minor
      AND provenance_kind IS NOT NULL
      AND pg_catalog.btrim(provenance_source_id) <> '')
    OR (close_mode = 'minimum_only'
      AND gross_amount_minor IS NULL AND excluded_amount_minor IS NULL
      AND source_commissionable_amount_minor IS NULL
      AND calculation_base_minor = 0
      AND provenance_kind IS NULL AND provenance_source_id IS NULL)
  ),
  CONSTRAINT billing_calculation_snapshots_formula_check CHECK (
    (formula_kind = 'fixed'
      AND fixed_amount_minor IS NOT NULL AND fixed_amount_minor >= 0
      AND minimum_amount_minor IS NULL
      AND rate_numerator IS NULL AND rate_denominator IS NULL
      AND submitted_percentage IS NULL
      AND intermediate_numerator IS NULL AND intermediate_denominator IS NULL
      AND fixed_candidate_minor = fixed_amount_minor
      AND minimum_candidate_minor IS NULL AND percentage_candidate_minor IS NULL
      AND selected_branch = 'fixed' AND result_amount_minor = fixed_candidate_minor)
    OR (formula_kind = 'minimum_support'
      AND fixed_amount_minor IS NULL
      AND minimum_amount_minor IS NOT NULL AND minimum_amount_minor >= 0
      AND rate_numerator IS NULL AND rate_denominator IS NULL
      AND submitted_percentage IS NULL
      AND intermediate_numerator IS NULL AND intermediate_denominator IS NULL
      AND fixed_candidate_minor IS NULL
      AND minimum_candidate_minor = minimum_amount_minor
      AND percentage_candidate_minor IS NULL
      AND selected_branch = 'minimum'
      AND result_amount_minor = minimum_candidate_minor)
    OR (formula_kind = 'percentage'
      AND fixed_amount_minor IS NULL AND minimum_amount_minor IS NULL
      AND rate_numerator IS NOT NULL AND rate_numerator >= 0
      AND rate_denominator IS NOT NULL AND rate_denominator > 0
      AND submitted_percentage IS NOT NULL
      AND intermediate_numerator =
        calculation_base_minor::numeric * rate_numerator::numeric
      AND intermediate_denominator = rate_denominator
      AND fixed_candidate_minor IS NULL AND minimum_candidate_minor IS NULL
      AND percentage_candidate_minor IS NOT NULL AND percentage_candidate_minor >= 0
      AND selected_branch = 'percentage'
      AND result_amount_minor = percentage_candidate_minor)
    OR (formula_kind = 'hybrid'
      AND fixed_amount_minor IS NULL
      AND minimum_amount_minor IS NOT NULL AND minimum_amount_minor >= 0
      AND rate_numerator IS NOT NULL AND rate_numerator >= 0
      AND rate_denominator IS NOT NULL AND rate_denominator > 0
      AND submitted_percentage IS NOT NULL
      AND intermediate_numerator =
        calculation_base_minor::numeric * rate_numerator::numeric
      AND intermediate_denominator = rate_denominator
      AND fixed_candidate_minor IS NULL
      AND minimum_candidate_minor = minimum_amount_minor
      AND percentage_candidate_minor IS NOT NULL AND percentage_candidate_minor >= 0
      AND ((selected_branch = 'percentage'
          AND percentage_candidate_minor > minimum_candidate_minor
          AND result_amount_minor = percentage_candidate_minor)
        OR (selected_branch = 'minimum_equal'
          AND percentage_candidate_minor = minimum_candidate_minor
          AND result_amount_minor = minimum_candidate_minor)
        OR (selected_branch = 'minimum'
          AND percentage_candidate_minor < minimum_candidate_minor
          AND result_amount_minor = minimum_candidate_minor)))
  ),
  CONSTRAINT billing_calculation_snapshots_comparison_check CHECK (
    (comparison_status = 'not_available'
      AND previous_calculation_id IS NULL
      AND delta_minor IS NULL
      AND delta_rate_numerator IS NULL
      AND delta_rate_denominator IS NULL)
    OR (comparison_status = 'available'
      AND previous_calculation_id IS NOT NULL
      AND delta_minor IS NOT NULL
      AND delta_rate_numerator = delta_minor
      AND delta_rate_denominator IS NOT NULL
      AND delta_rate_denominator > 0)
    OR (comparison_status = 'zero_baseline'
      AND previous_calculation_id IS NOT NULL
      AND delta_minor IS NOT NULL
      AND delta_rate_numerator IS NULL
      AND delta_rate_denominator IS NULL)
  ),
  CONSTRAINT billing_calculation_snapshots_json_check CHECK (
    pg_catalog.jsonb_typeof(snapshot_payload) = 'object'
    AND pg_catalog.jsonb_typeof(explanation_payload) = 'object'
    AND snapshot_hash = pg_catalog.encode(
      extensions.digest(snapshot_payload::text, 'sha256'), 'hex'
    )
    AND explanation_hash = pg_catalog.encode(
      extensions.digest(explanation_payload::text, 'sha256'), 'hex'
    )
  )
);

CREATE TABLE public.billing_calculation_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  calculation_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  account_id uuid NOT NULL,
  event_type text NOT NULL CHECK (
    event_type IN ('created', 'approved', 'held')
  ),
  actor_type text NOT NULL CHECK (actor_type IN ('human', 'automation')),
  actor_id uuid NOT NULL,
  actor_role text,
  approval_mode text CHECK (
    approval_mode IS NULL OR approval_mode IN ('manual', 'auto')
  ),
  authorization_source text NOT NULL,
  reason text NOT NULL CHECK (
    pg_catalog.btrim(reason) <> '' AND pg_catalog.octet_length(reason) <= 1000
  ),
  command_key text NOT NULL CHECK (
    command_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$'
  ),
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  preview_fingerprint text NOT NULL CHECK (preview_fingerprint ~ '^[0-9a-f]{64}$'),
  close_policy_version text NOT NULL
    REFERENCES public.billing_close_policies(policy_version),
  response_snapshot jsonb NOT NULL CHECK (
    pg_catalog.jsonb_typeof(response_snapshot) = 'object'
  ),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT billing_calculation_events_calculation_scope_fk
    FOREIGN KEY (calculation_id, organization_id, account_id)
    REFERENCES public.billing_calculations(id, organization_id, account_id)
    ON DELETE RESTRICT,
  CONSTRAINT billing_calculation_events_actor_command_unique
    UNIQUE (actor_type, actor_id, command_key),
  CONSTRAINT billing_calculation_events_actor_check CHECK (
    (actor_type = 'human' AND actor_role IS NOT NULL)
    OR (actor_type = 'automation' AND actor_role IS NULL)
  ),
  CONSTRAINT billing_calculation_events_mode_check CHECK (
    (event_type = 'created' AND approval_mode IS NULL)
    OR (event_type IN ('approved', 'held') AND approval_mode IS NOT NULL)
  )
);

CREATE UNIQUE INDEX billing_calculation_events_one_approval
  ON public.billing_calculation_events (calculation_id)
  WHERE event_type = 'approved';
CREATE INDEX billing_calculation_events_scope_created_idx
  ON public.billing_calculation_events (
    organization_id, account_id, created_at DESC, id DESC
  );

CREATE FUNCTION private.billing_calculation_fact_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = 'P0001', MESSAGE = 'BILLING_CALCULATION_FACT_IMMUTABLE';
END;
$function$;

CREATE FUNCTION private.billing_calculation_snapshot_freeze()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  calculation_row public.billing_calculations%ROWTYPE;
  version_row public.billing_agreement_versions%ROWTYPE;
  period_row public.billing_revenue_periods%ROWTYPE;
  close_row public.billing_revenue_close_snapshots%ROWTYPE;
  previous_result bigint;
BEGIN
  SELECT calculation.* INTO calculation_row
  FROM public.billing_calculations AS calculation
  WHERE calculation.id = NEW.calculation_id;
  SELECT version.* INTO version_row
  FROM public.billing_agreement_versions AS version
  WHERE version.id = NEW.agreement_version_id;
  SELECT period.* INTO period_row
  FROM public.billing_revenue_periods AS period
  WHERE period.id = NEW.period_id;
  SELECT close_snapshot.* INTO close_row
  FROM public.billing_revenue_close_snapshots AS close_snapshot
  WHERE close_snapshot.id = NEW.close_snapshot_id;

  IF calculation_row.id IS NULL OR version_row.id IS NULL
    OR period_row.id IS NULL OR close_row.id IS NULL
    OR ROW(
      NEW.organization_id, NEW.account_id, NEW.agreement_id,
      NEW.agreement_version_id, NEW.period_id, NEW.close_snapshot_id
    ) IS DISTINCT FROM ROW(
      calculation_row.organization_id, calculation_row.account_id,
      calculation_row.agreement_id, calculation_row.agreement_version_id,
      calculation_row.period_id, calculation_row.close_snapshot_id
    )
    OR ROW(
      NEW.organization_id, NEW.account_id, NEW.agreement_id,
      NEW.agreement_version_id
    ) IS DISTINCT FROM ROW(
      version_row.organization_id, version_row.account_id,
      version_row.agreement_id, version_row.id
    )
    OR ROW(
      NEW.organization_id, NEW.account_id, NEW.agreement_id,
      NEW.agreement_version_id, NEW.period_id
    ) IS DISTINCT FROM ROW(
      period_row.organization_id, period_row.account_id,
      period_row.agreement_id, period_row.agreement_version_id, period_row.id
    )
    OR ROW(
      NEW.organization_id, NEW.account_id, NEW.agreement_id,
      NEW.agreement_version_id, NEW.period_id, NEW.close_snapshot_id
    ) IS DISTINCT FROM ROW(
      close_row.organization_id, close_row.account_id, close_row.agreement_id,
      close_row.agreement_version_id, close_row.period_id, close_row.id
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BILLING_CALCULATION_LINEAGE_INVALID';
  END IF;

  IF version_row.state <> 'active'
    OR NEW.close_mode IS DISTINCT FROM close_row.close_mode
    OR NEW.gross_amount_minor IS DISTINCT FROM close_row.gross_amount_minor
    OR NEW.excluded_amount_minor IS DISTINCT FROM close_row.excluded_amount_minor
    OR NEW.source_commissionable_amount_minor
      IS DISTINCT FROM close_row.commissionable_amount_minor
    OR NEW.provenance_kind IS DISTINCT FROM close_row.provenance_kind
    OR NEW.provenance_source_id IS DISTINCT FROM close_row.provenance_source_id
    OR NEW.evidence_fingerprint IS DISTINCT FROM close_row.evidence_fingerprint
    OR NEW.formula_kind IS DISTINCT FROM version_row.formula_kind
    OR NEW.fixed_amount_minor IS DISTINCT FROM version_row.fixed_amount_minor
    OR NEW.minimum_amount_minor IS DISTINCT FROM version_row.minimum_amount_minor
    OR NEW.rate_numerator IS DISTINCT FROM version_row.rate_numerator
    OR NEW.rate_denominator IS DISTINCT FROM version_row.rate_denominator
    OR NEW.submitted_percentage IS DISTINCT FROM version_row.submitted_percentage
    OR NEW.currency IS DISTINCT FROM version_row.currency
    OR NEW.currency_policy_version IS DISTINCT FROM version_row.currency_policy_version
    OR NEW.rate_policy_version IS DISTINCT FROM version_row.rate_policy_version
    OR NEW.rounding_policy_version IS DISTINCT FROM version_row.rounding_policy_version
    OR NEW.formula_version IS DISTINCT FROM version_row.formula_version
    OR NEW.revenue_close_policy_version IS DISTINCT FROM close_row.close_policy_version
    OR NEW.explanation_version IS DISTINCT FROM version_row.explanation_version
    OR calculation_row.close_input_fingerprint IS DISTINCT FROM close_row.close_input_fingerprint
    OR calculation_row.terms_fingerprint IS DISTINCT FROM version_row.terms_fingerprint
    OR calculation_row.formula_kind IS DISTINCT FROM NEW.formula_kind
    OR calculation_row.formula_version IS DISTINCT FROM NEW.formula_version
    OR calculation_row.rounding_policy_version IS DISTINCT FROM NEW.rounding_policy_version
    OR calculation_row.close_policy_version IS DISTINCT FROM NEW.close_policy_version
    OR calculation_row.explanation_version IS DISTINCT FROM NEW.explanation_version
    OR calculation_row.selected_branch IS DISTINCT FROM NEW.selected_branch
    OR calculation_row.result_amount_minor IS DISTINCT FROM NEW.result_amount_minor
    OR calculation_row.currency IS DISTINCT FROM NEW.currency
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BILLING_CALCULATION_SNAPSHOT_MISMATCH';
  END IF;

  IF NEW.previous_calculation_id IS NOT NULL THEN
    SELECT previous_snapshot.result_amount_minor INTO previous_result
    FROM public.billing_calculation_snapshots AS previous_snapshot
    JOIN public.billing_revenue_periods AS previous_period
      ON previous_period.id = previous_snapshot.period_id
    WHERE previous_snapshot.calculation_id = NEW.previous_calculation_id
      AND previous_snapshot.organization_id = NEW.organization_id
      AND previous_snapshot.account_id = NEW.account_id
      AND previous_snapshot.agreement_id = NEW.agreement_id
      AND previous_period.period_end <= period_row.period_start;
    IF previous_result IS NULL
      OR NEW.delta_minor IS DISTINCT FROM NEW.result_amount_minor - previous_result
      OR (previous_result = 0 AND NEW.comparison_status <> 'zero_baseline')
      OR (previous_result <> 0 AND (
        NEW.comparison_status <> 'available'
        OR NEW.delta_rate_denominator IS DISTINCT FROM pg_catalog.abs(previous_result)
      ))
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'BILLING_CALCULATION_COMPARISON_INVALID';
    END IF;
  ELSIF NEW.comparison_status <> 'not_available' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BILLING_CALCULATION_COMPARISON_INVALID';
  END IF;

  NEW.explanation_payload := pg_catalog.jsonb_build_object(
    'explanation_version', NEW.explanation_version,
    'formula_kind', NEW.formula_kind,
    'selected_branch', NEW.selected_branch,
    'calculation_base_minor', NEW.calculation_base_minor::text,
    'result_amount_minor', NEW.result_amount_minor::text,
    'currency', NEW.currency,
    'comparison_status', NEW.comparison_status
  );
  NEW.snapshot_payload := pg_catalog.jsonb_build_object(
    'snapshot_version', NEW.snapshot_version,
    'lineage', pg_catalog.jsonb_build_object(
      'organization_id', NEW.organization_id::text,
      'account_id', NEW.account_id::text,
      'agreement_id', NEW.agreement_id::text,
      'agreement_version_id', NEW.agreement_version_id::text,
      'period_id', NEW.period_id::text,
      'close_snapshot_id', NEW.close_snapshot_id::text,
      'calculation_id', NEW.calculation_id::text
    ),
    'source', pg_catalog.jsonb_build_object(
      'close_mode', NEW.close_mode,
      'gross_amount_minor', CASE WHEN NEW.gross_amount_minor IS NULL
        THEN NULL ELSE NEW.gross_amount_minor::text END,
      'excluded_amount_minor', CASE WHEN NEW.excluded_amount_minor IS NULL
        THEN NULL ELSE NEW.excluded_amount_minor::text END,
      'commissionable_amount_minor',
        CASE WHEN NEW.source_commissionable_amount_minor IS NULL
          THEN NULL ELSE NEW.source_commissionable_amount_minor::text END,
      'calculation_base_minor', NEW.calculation_base_minor::text,
      'provenance_kind', COALESCE(NEW.provenance_kind, 'minimum_only'),
      'provenance_source_id', NEW.provenance_source_id,
      'evidence_fingerprint', NEW.evidence_fingerprint
    ),
    'formula', pg_catalog.jsonb_build_object(
      'formula_kind', NEW.formula_kind,
      'fixed_amount_minor', CASE WHEN NEW.fixed_amount_minor IS NULL
        THEN NULL ELSE NEW.fixed_amount_minor::text END,
      'minimum_amount_minor', CASE WHEN NEW.minimum_amount_minor IS NULL
        THEN NULL ELSE NEW.minimum_amount_minor::text END,
      'rate_numerator', CASE WHEN NEW.rate_numerator IS NULL
        THEN NULL ELSE NEW.rate_numerator::text END,
      'rate_denominator', CASE WHEN NEW.rate_denominator IS NULL
        THEN NULL ELSE NEW.rate_denominator::text END,
      'submitted_percentage', NEW.submitted_percentage,
      'intermediate_numerator', CASE WHEN NEW.intermediate_numerator IS NULL
        THEN NULL ELSE NEW.intermediate_numerator::text END,
      'intermediate_denominator', CASE WHEN NEW.intermediate_denominator IS NULL
        THEN NULL ELSE NEW.intermediate_denominator::text END,
      'fixed_candidate_minor', CASE WHEN NEW.fixed_candidate_minor IS NULL
        THEN NULL ELSE NEW.fixed_candidate_minor::text END,
      'minimum_candidate_minor', CASE WHEN NEW.minimum_candidate_minor IS NULL
        THEN NULL ELSE NEW.minimum_candidate_minor::text END,
      'percentage_candidate_minor', CASE WHEN NEW.percentage_candidate_minor IS NULL
        THEN NULL ELSE NEW.percentage_candidate_minor::text END,
      'selected_branch', NEW.selected_branch,
      'result_amount_minor', NEW.result_amount_minor::text,
      'currency', NEW.currency
    ),
    'policies', pg_catalog.jsonb_build_object(
      'currency_policy_version', NEW.currency_policy_version,
      'rate_policy_version', NEW.rate_policy_version,
      'rounding_policy_version', NEW.rounding_policy_version,
      'formula_version', NEW.formula_version,
      'revenue_close_policy_version', NEW.revenue_close_policy_version,
      'close_policy_version', NEW.close_policy_version,
      'explanation_version', NEW.explanation_version
    ),
    'anomalies', NEW.anomaly_results,
    'comparison', pg_catalog.jsonb_build_object(
      'status', NEW.comparison_status,
      'previous_calculation_id', CASE WHEN NEW.previous_calculation_id IS NULL
        THEN NULL ELSE NEW.previous_calculation_id::text END,
      'delta_minor', CASE WHEN NEW.delta_minor IS NULL
        THEN NULL ELSE NEW.delta_minor::text END,
      'delta_rate_numerator', CASE WHEN NEW.delta_rate_numerator IS NULL
        THEN NULL ELSE NEW.delta_rate_numerator::text END,
      'delta_rate_denominator', CASE WHEN NEW.delta_rate_denominator IS NULL
        THEN NULL ELSE NEW.delta_rate_denominator::text END
    )
  );
  NEW.snapshot_hash := pg_catalog.encode(
    extensions.digest(NEW.snapshot_payload::text, 'sha256'), 'hex'
  );
  NEW.explanation_hash := pg_catalog.encode(
    extensions.digest(NEW.explanation_payload::text, 'sha256'), 'hex'
  );
  RETURN NEW;
END;
$function$;

CREATE FUNCTION private.billing_calculation_snapshot_required()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.billing_calculation_snapshots AS snapshot
    WHERE snapshot.calculation_id = NEW.id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BILLING_CALCULATION_SNAPSHOT_REQUIRED';
  END IF;
  RETURN NULL;
END;
$function$;

CREATE TRIGGER billing_close_policies_immutable
BEFORE UPDATE OR DELETE ON public.billing_close_policies
FOR EACH ROW EXECUTE FUNCTION private.billing_calculation_fact_immutable();
CREATE TRIGGER billing_calculations_immutable
BEFORE UPDATE OR DELETE ON public.billing_calculations
FOR EACH ROW EXECUTE FUNCTION private.billing_calculation_fact_immutable();
CREATE TRIGGER billing_calculation_snapshots_freeze
BEFORE INSERT ON public.billing_calculation_snapshots
FOR EACH ROW EXECUTE FUNCTION private.billing_calculation_snapshot_freeze();
CREATE TRIGGER billing_calculation_snapshots_immutable
BEFORE UPDATE OR DELETE ON public.billing_calculation_snapshots
FOR EACH ROW EXECUTE FUNCTION private.billing_calculation_fact_immutable();
CREATE TRIGGER billing_calculation_events_immutable
BEFORE UPDATE OR DELETE ON public.billing_calculation_events
FOR EACH ROW EXECUTE FUNCTION private.billing_calculation_fact_immutable();
CREATE CONSTRAINT TRIGGER billing_calculation_snapshot_required
AFTER INSERT ON public.billing_calculations
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION private.billing_calculation_snapshot_required();

ALTER TABLE public.billing_close_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_close_policies FORCE ROW LEVEL SECURITY;
ALTER TABLE public.billing_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_calculations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.billing_calculation_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_calculation_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE public.billing_calculation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_calculation_events FORCE ROW LEVEL SECURITY;

CREATE POLICY billing_close_policies_select ON public.billing_close_policies
FOR SELECT TO authenticated
USING (
  (organization_id IS NULL AND policy_mode = 'manual')
  OR private.billing_has_capability(
    organization_id, account_id, 'calculation.read'
  )
);
CREATE POLICY billing_calculations_select ON public.billing_calculations
FOR SELECT TO authenticated
USING (private.billing_has_capability(
  organization_id, account_id, 'calculation.read'
));
CREATE POLICY billing_calculation_snapshots_select
ON public.billing_calculation_snapshots
FOR SELECT TO authenticated
USING (private.billing_has_capability(
  organization_id, account_id, 'calculation.read'
));
CREATE POLICY billing_calculation_events_select
ON public.billing_calculation_events
FOR SELECT TO authenticated
USING (private.billing_has_capability(
  organization_id, account_id, 'calculation.read'
));

REVOKE ALL ON TABLE public.billing_close_policies,
  public.billing_calculations,
  public.billing_calculation_snapshots,
  public.billing_calculation_events
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.billing_close_policies,
  public.billing_calculations,
  public.billing_calculation_snapshots,
  public.billing_calculation_events
  TO authenticated;
GRANT ALL ON TABLE public.billing_close_policies,
  public.billing_calculations,
  public.billing_calculation_snapshots,
  public.billing_calculation_events
  TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.billing_calculation_events_id_seq
  TO service_role;

ALTER FUNCTION private.billing_calculate_exact(jsonb) OWNER TO postgres;
ALTER FUNCTION private.billing_calculation_fact_immutable() OWNER TO postgres;
ALTER FUNCTION private.billing_calculation_snapshot_freeze() OWNER TO postgres;
ALTER FUNCTION private.billing_calculation_snapshot_required() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.billing_calculate_exact(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_calculation_fact_immutable()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_calculation_snapshot_freeze()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_calculation_snapshot_required()
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
