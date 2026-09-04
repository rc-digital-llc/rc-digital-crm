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

CREATE FUNCTION private.billing_calculation_fingerprint(
  p_action text,
  p_payload jsonb
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT pg_catalog.encode(
    extensions.digest(
      pg_catalog.jsonb_build_object(
        'action', p_action,
        'payload', p_payload - 'command_key'
      )::text,
      'sha256'
    ),
    'hex'
  );
$function$;

CREATE OR REPLACE FUNCTION private.billing_validate_effect_discriminator(
  p_value jsonb
)
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
    RAISE EXCEPTION USING
      ERRCODE = '22023', MESSAGE = 'AUTOMATION_EFFECT_INVALID';
  END IF;
  SELECT pg_catalog.array_agg(key ORDER BY key) INTO keys
  FROM pg_catalog.jsonb_object_keys(p_value) AS object_keys(key);
  IF p_value->>'kind' = 'general-command' THEN
    IF keys IS DISTINCT FROM ARRAY['kind']::text[] THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023', MESSAGE = 'AUTOMATION_EFFECT_INVALID';
    END IF;
  ELSIF p_value->>'kind' = 'evidence-inspection' THEN
    IF keys IS DISTINCT FROM ARRAY[
        'decision', 'evidence_id', 'kind', 'reason_code'
      ]::text[]
      OR pg_catalog.jsonb_typeof(p_value->'evidence_id') IS DISTINCT FROM 'string'
      OR pg_catalog.jsonb_typeof(p_value->'decision') IS DISTINCT FROM 'string'
      OR pg_catalog.jsonb_typeof(p_value->'reason_code') IS DISTINCT FROM 'string'
      OR (p_value->>'evidence_id') !~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR p_value->>'decision' NOT IN ('clean', 'rejected')
      OR (p_value->>'reason_code') !~ '^[A-Z][A-Z0-9_]{2,63}$'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023', MESSAGE = 'AUTOMATION_EFFECT_INVALID';
    END IF;
  ELSIF p_value->>'kind' = 'calculation-approval' THEN
    IF keys IS DISTINCT FROM ARRAY[
        'calculation_id', 'kind', 'preview_fingerprint', 'reason_fingerprint'
      ]::text[]
      OR EXISTS (
        SELECT 1 FROM pg_catalog.jsonb_each(p_value) AS entry(key, value)
        WHERE entry.key <> 'kind'
          AND pg_catalog.jsonb_typeof(entry.value) IS DISTINCT FROM 'string'
      )
      OR (p_value->>'calculation_id') !~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR (p_value->>'preview_fingerprint') !~ '^[0-9a-f]{64}$'
      OR (p_value->>'reason_fingerprint') !~ '^[0-9a-f]{64}$'
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023', MESSAGE = 'AUTOMATION_EFFECT_INVALID';
    END IF;
  ELSE
    RAISE EXCEPTION USING
      ERRCODE = '22023', MESSAGE = 'AUTOMATION_EFFECT_INVALID';
  END IF;
  RETURN p_value;
END;
$function$;

CREATE FUNCTION private.billing_calculation_human_role(
  p_organization_id uuid,
  p_account_id uuid,
  p_capability text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  actor_role_value text;
BEGIN
  SELECT assignment.role INTO actor_role_value
  FROM public.billing_role_assignments AS assignment
  JOIN public.sales AS sale ON sale.id = assignment.sales_id
  JOIN public.billing_role_capabilities AS capability
    ON capability.role = assignment.role
  JOIN public.billing_accounts AS account
    ON account.id = p_account_id
    AND account.organization_id = p_organization_id
  JOIN public.billing_organizations AS organization
    ON organization.id = p_organization_id
  WHERE sale.user_id = (SELECT auth.uid())
    AND NOT sale.disabled
    AND assignment.organization_id = p_organization_id
    AND (assignment.account_id IS NULL OR assignment.account_id = p_account_id)
    AND assignment.disabled_at IS NULL
    AND assignment.valid_from <= pg_catalog.now()
    AND (assignment.valid_until IS NULL OR assignment.valid_until > pg_catalog.now())
    AND capability.capability = p_capability
    AND organization.status = 'active'
    AND account.billing_status <> 'closed'
  ORDER BY CASE assignment.role
    WHEN 'administrator' THEN 1
    WHEN 'reviewer' THEN 2
    WHEN 'operator' THEN 3
    ELSE 4
  END
  LIMIT 1;
  RETURN actor_role_value;
END;
$function$;

CREATE FUNCTION private.billing_build_calculation_preview(
  p_account_id uuid,
  p_close_snapshot_id uuid,
  p_close_policy_version text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  close_row public.billing_revenue_close_snapshots%ROWTYPE;
  version_row public.billing_agreement_versions%ROWTYPE;
  period_row public.billing_revenue_periods%ROWTYPE;
  account_row public.billing_accounts%ROWTYPE;
  policy_row public.billing_close_policies%ROWTYPE;
  formula_result jsonb;
  formula_input jsonb;
  anomalies_value jsonb := '[]'::jsonb;
  previous_calculation_value uuid;
  previous_result_value bigint;
  comparison_status_value text := 'not_available';
  delta_value bigint;
  delta_numerator_value bigint;
  delta_denominator_value bigint;
  calculation_base_value bigint;
  latest_agreement_event text;
  invalid_evidence_count bigint := 0;
  preview_value jsonb;
  preview_fingerprint_value text;
BEGIN
  SELECT close_snapshot.* INTO close_row
  FROM public.billing_revenue_close_snapshots AS close_snapshot
  WHERE close_snapshot.id = p_close_snapshot_id
    AND close_snapshot.account_id = p_account_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'CALCULATION_NOT_AUTHORIZED';
  END IF;

  SELECT version.* INTO version_row
  FROM public.billing_agreement_versions AS version
  WHERE version.id = close_row.agreement_version_id
    AND version.organization_id = close_row.organization_id
    AND version.account_id = close_row.account_id
    AND version.agreement_id = close_row.agreement_id;
  SELECT period.* INTO period_row
  FROM public.billing_revenue_periods AS period
  WHERE period.id = close_row.period_id
    AND period.organization_id = close_row.organization_id
    AND period.account_id = close_row.account_id;
  SELECT account.* INTO account_row
  FROM public.billing_accounts AS account
  WHERE account.id = close_row.account_id
    AND account.organization_id = close_row.organization_id;
  SELECT policy.* INTO policy_row
  FROM public.billing_close_policies AS policy
  WHERE policy.policy_version = p_close_policy_version
    AND (
      (policy.organization_id IS NULL AND policy.account_id IS NULL)
      OR (policy.organization_id = close_row.organization_id
        AND policy.account_id = close_row.account_id)
    );
  IF version_row.id IS NULL OR period_row.id IS NULL OR account_row.id IS NULL
    OR policy_row.policy_version IS NULL
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'CALCULATION_POLICY_MISMATCH';
  END IF;

  SELECT event.event_type INTO latest_agreement_event
  FROM public.billing_agreement_events AS event
  WHERE event.agreement_version_id = version_row.id
  ORDER BY event.created_at DESC, event.id DESC
  LIMIT 1;
  IF version_row.state <> 'active'
    OR latest_agreement_event IN ('paused', 'terminated')
    OR close_row.agreement_fingerprint IS DISTINCT FROM version_row.terms_fingerprint
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'CALCULATION_AGREEMENT_STALE';
  END IF;

  calculation_base_value := COALESCE(close_row.commissionable_amount_minor, 0);
  formula_input := pg_catalog.jsonb_build_object(
    'formula_kind', version_row.formula_kind,
    'commissionable_amount', pg_catalog.jsonb_build_object(
      'amount_minor', calculation_base_value::text,
      'currency', version_row.currency
    ),
    'fixed_amount', CASE WHEN version_row.fixed_amount_minor IS NULL
      THEN NULL ELSE pg_catalog.jsonb_build_object(
        'amount_minor', version_row.fixed_amount_minor::text,
        'currency', version_row.currency
      ) END,
    'minimum_amount', CASE WHEN version_row.minimum_amount_minor IS NULL
      THEN NULL ELSE pg_catalog.jsonb_build_object(
        'amount_minor', version_row.minimum_amount_minor::text,
        'currency', version_row.currency
      ) END,
    'rate', CASE WHEN version_row.rate_numerator IS NULL
      THEN NULL ELSE pg_catalog.jsonb_build_object(
        'kind', 'ordinary_percentage',
        'numerator', version_row.rate_numerator::text,
        'denominator', version_row.rate_denominator::text,
        'submitted_percentage', version_row.submitted_percentage,
        'rate_policy_version', version_row.rate_policy_version
      ) END,
    'currency_policy_version', version_row.currency_policy_version,
    'rounding_policy_version', version_row.rounding_policy_version,
    'formula_version', version_row.formula_version
  );
  formula_result := private.billing_calculate_exact(formula_input);

  IF account_row.billing_status <> 'active' THEN
    anomalies_value := anomalies_value || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'code', 'ACCOUNT_NOT_ACTIVE',
        'status', account_row.billing_status
      )
    );
  END IF;
  IF close_row.close_mode = 'accepted_evidence' THEN
    SELECT count(*) FILTER (
      WHERE evidence.id IS NULL
        OR evidence.sha256 IS DISTINCT FROM item->>'captured_sha256'
        OR evidence.inspection_status <> 'clean'
        OR evidence.lifecycle_status <> 'active'
        OR evidence.retention_expires_at <= pg_catalog.now()
        OR (evidence.hold_started_at IS NOT NULL
          AND evidence.hold_released_at IS NULL)
    ) INTO invalid_evidence_count
    FROM pg_catalog.jsonb_array_elements(close_row.evidence_snapshot) AS items(item)
    LEFT JOIN public.billing_evidence_objects AS evidence
      ON evidence.id = (item->>'evidence_id')::uuid
      AND evidence.organization_id = close_row.organization_id
      AND evidence.account_id = close_row.account_id;
    IF invalid_evidence_count <> 0 THEN
      anomalies_value := anomalies_value || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'code', 'EVIDENCE_STATE_CHANGED',
          'count', invalid_evidence_count
        )
      );
    END IF;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.billing_close_exceptions AS exception
    WHERE exception.period_id = close_row.period_id
      AND exception.status = 'open'
      AND NOT (
        close_row.close_mode = 'minimum_only'
        AND exception.reason_code = 'MISSING_EVIDENCE'
        AND exception.id = close_row.exception_id
      )
  ) THEN
    anomalies_value := anomalies_value || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('code', 'OPEN_CLOSE_EXCEPTION')
    );
  END IF;

  SELECT calculation.id, snapshot.result_amount_minor
  INTO previous_calculation_value, previous_result_value
  FROM public.billing_calculations AS calculation
  JOIN public.billing_calculation_snapshots AS snapshot
    ON snapshot.calculation_id = calculation.id
  JOIN public.billing_revenue_periods AS previous_period
    ON previous_period.id = calculation.period_id
  WHERE calculation.organization_id = close_row.organization_id
    AND calculation.account_id = close_row.account_id
    AND calculation.agreement_id = close_row.agreement_id
    AND calculation.formula_kind = version_row.formula_kind
    AND previous_period.period_start < period_row.period_start
    AND EXISTS (
      SELECT 1 FROM public.billing_calculation_events AS approval
      WHERE approval.calculation_id = calculation.id
        AND approval.event_type = 'approved'
    )
  ORDER BY previous_period.period_start DESC, calculation.created_at DESC
  LIMIT 1;
  IF previous_calculation_value IS NOT NULL THEN
    delta_value := (formula_result->>'final_amount_minor')::bigint
      - previous_result_value;
    IF previous_result_value = 0 THEN
      comparison_status_value := 'zero_baseline';
    ELSE
      comparison_status_value := 'available';
      delta_numerator_value := delta_value;
      delta_denominator_value := pg_catalog.abs(previous_result_value);
    END IF;
  END IF;

  preview_value := pg_catalog.jsonb_build_object(
    'preview_version', 'billing-calculation-preview-v1',
    'organization_id', close_row.organization_id,
    'account_id', close_row.account_id,
    'agreement_id', close_row.agreement_id,
    'agreement_version_id', close_row.agreement_version_id,
    'period_id', close_row.period_id,
    'period_start', period_row.period_start,
    'period_end', period_row.period_end,
    'close_snapshot_id', close_row.id,
    'close_mode', close_row.close_mode,
    'close_input_fingerprint', close_row.close_input_fingerprint,
    'terms_fingerprint', version_row.terms_fingerprint,
    'gross_amount_minor', CASE WHEN close_row.gross_amount_minor IS NULL
      THEN NULL ELSE close_row.gross_amount_minor::text END,
    'excluded_amount_minor', CASE WHEN close_row.excluded_amount_minor IS NULL
      THEN NULL ELSE close_row.excluded_amount_minor::text END,
    'source_commissionable_amount_minor',
      CASE WHEN close_row.commissionable_amount_minor IS NULL
        THEN NULL ELSE close_row.commissionable_amount_minor::text END,
    'calculation_base_minor', calculation_base_value::text,
    'provenance_kind', COALESCE(close_row.provenance_kind, 'minimum_only'),
    'provenance_source_id', close_row.provenance_source_id,
    'evidence_fingerprint', close_row.evidence_fingerprint,
    'formula_kind', version_row.formula_kind,
    'fixed_amount_minor', CASE WHEN version_row.fixed_amount_minor IS NULL
      THEN NULL ELSE version_row.fixed_amount_minor::text END,
    'minimum_amount_minor', CASE WHEN version_row.minimum_amount_minor IS NULL
      THEN NULL ELSE version_row.minimum_amount_minor::text END,
    'rate_numerator', CASE WHEN version_row.rate_numerator IS NULL
      THEN NULL ELSE version_row.rate_numerator::text END,
    'rate_denominator', CASE WHEN version_row.rate_denominator IS NULL
      THEN NULL ELSE version_row.rate_denominator::text END,
    'submitted_percentage', version_row.submitted_percentage,
    'intermediate_numerator', formula_result->'intermediate_numerator',
    'intermediate_denominator', formula_result->'intermediate_denominator',
    'fixed_candidate_minor', formula_result->'fixed_candidate_minor',
    'minimum_candidate_minor', formula_result->'minimum_candidate_minor',
    'percentage_candidate_minor', formula_result->'percentage_candidate_minor',
    'selected_branch', formula_result->>'selected_branch',
    'final_amount_minor', formula_result->>'final_amount_minor',
    'currency', formula_result->>'currency',
    'currency_policy_version', version_row.currency_policy_version,
    'rate_policy_version', version_row.rate_policy_version,
    'rounding_policy_version', version_row.rounding_policy_version,
    'formula_version', version_row.formula_version,
    'revenue_close_policy_version', close_row.close_policy_version,
    'close_policy_version', policy_row.policy_version,
    'close_policy', pg_catalog.jsonb_build_object(
      'mode', policy_row.policy_mode,
      'active', policy_row.active,
      'organization_id', policy_row.organization_id,
      'account_id', policy_row.account_id,
      'allowed_account_statuses', policy_row.allowed_account_statuses,
      'allowed_formula_kinds', policy_row.allowed_formula_kinds,
      'allowed_close_modes', policy_row.allowed_close_modes,
      'allowed_provenance_kinds', policy_row.allowed_provenance_kinds,
      'require_zero_anomalies', policy_row.require_zero_anomalies,
      'minimum_result_minor', policy_row.minimum_result_minor::text,
      'maximum_result_minor', CASE WHEN policy_row.maximum_result_minor IS NULL
        THEN NULL ELSE policy_row.maximum_result_minor::text END,
      'effective_from', policy_row.effective_from,
      'effective_until', policy_row.effective_until
    ),
    'explanation_version', version_row.explanation_version,
    'anomalies', anomalies_value,
    'comparison_status', comparison_status_value,
    'previous_calculation_id', previous_calculation_value,
    'previous_amount_minor', CASE WHEN previous_calculation_value IS NULL
      THEN NULL ELSE previous_result_value::text END,
    'delta_minor', CASE WHEN delta_value IS NULL THEN NULL ELSE delta_value::text END,
    'delta_rate_numerator', CASE WHEN delta_numerator_value IS NULL
      THEN NULL ELSE delta_numerator_value::text END,
    'delta_rate_denominator', CASE WHEN delta_denominator_value IS NULL
      THEN NULL ELSE delta_denominator_value::text END
  );
  preview_fingerprint_value := pg_catalog.encode(
    extensions.digest(preview_value::text, 'sha256'), 'hex'
  );
  RETURN preview_value || pg_catalog.jsonb_build_object(
    'result', 'preview',
    'preview_fingerprint', preview_fingerprint_value
  );
END;
$function$;

CREATE FUNCTION private.billing_calculation_response(p_calculation_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'result', 'created',
    'calculation_id', calculation.id,
    'period_id', calculation.period_id,
    'close_snapshot_id', calculation.close_snapshot_id,
    'formula_kind', calculation.formula_kind,
    'selected_branch', calculation.selected_branch,
    'final_amount_minor', calculation.result_amount_minor::text,
    'currency', calculation.currency,
    'close_policy_version', calculation.close_policy_version,
    'snapshot_hash', snapshot.snapshot_hash,
    'explanation_hash', snapshot.explanation_hash,
    'comparison_status', snapshot.comparison_status,
    'previous_calculation_id', snapshot.previous_calculation_id,
    'delta_minor', CASE WHEN snapshot.delta_minor IS NULL
      THEN NULL ELSE snapshot.delta_minor::text END,
    'delta_rate_numerator', CASE WHEN snapshot.delta_rate_numerator IS NULL
      THEN NULL ELSE snapshot.delta_rate_numerator::text END,
    'delta_rate_denominator', CASE WHEN snapshot.delta_rate_denominator IS NULL
      THEN NULL ELSE snapshot.delta_rate_denominator::text END
  )
  FROM public.billing_calculations AS calculation
  JOIN public.billing_calculation_snapshots AS snapshot
    ON snapshot.calculation_id = calculation.id
  WHERE calculation.id = p_calculation_id;
$function$;

CREATE FUNCTION public.preview_billing_calculation(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  request_keys text[];
  account_id_value uuid;
  close_snapshot_id_value uuid;
  organization_id_value uuid;
  policy_version_value text;
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR pg_catalog.jsonb_typeof(p_request) IS DISTINCT FROM 'object'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'CALCULATION_NOT_AUTHORIZED';
  END IF;
  SELECT COALESCE(pg_catalog.array_agg(key ORDER BY key), ARRAY[]::text[])
  INTO request_keys
  FROM pg_catalog.jsonb_object_keys(p_request) AS keys(key);
  IF NOT request_keys <@ ARRAY[
      'account_id', 'close_policy_version', 'close_snapshot_id'
    ]::text[]
    OR NOT ARRAY['account_id', 'close_snapshot_id']::text[] <@ request_keys
    OR pg_catalog.jsonb_typeof(p_request->'account_id') IS DISTINCT FROM 'string'
    OR pg_catalog.jsonb_typeof(p_request->'close_snapshot_id') IS DISTINCT FROM 'string'
    OR (p_request ? 'close_policy_version'
      AND pg_catalog.jsonb_typeof(p_request->'close_policy_version')
        IS DISTINCT FROM 'string')
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023', MESSAGE = 'CALCULATION_INVALID_REQUEST';
  END IF;
  BEGIN
    account_id_value := (p_request->>'account_id')::uuid;
    close_snapshot_id_value := (p_request->>'close_snapshot_id')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023', MESSAGE = 'CALCULATION_INVALID_REQUEST';
  END;
  policy_version_value := COALESCE(
    NULLIF(pg_catalog.btrim(p_request->>'close_policy_version'), ''),
    'billing-manual-v1'
  );
  SELECT account.organization_id INTO organization_id_value
  FROM public.billing_accounts AS account
  WHERE account.id = account_id_value;
  IF organization_id_value IS NULL
    OR NOT private.billing_has_capability(
      organization_id_value, account_id_value, 'calculation.create'
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'CALCULATION_NOT_AUTHORIZED';
  END IF;
  RETURN private.billing_build_calculation_preview(
    account_id_value, close_snapshot_id_value, policy_version_value
  );
END;
$function$;

CREATE FUNCTION public.create_billing_calculation(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  request_keys text[];
  account_id_value uuid;
  close_snapshot_id_value uuid;
  policy_version_value text;
  actor_role_value text;
  organization_id_value uuid;
  command_key_value text;
  supplied_preview_fingerprint text;
  request_fingerprint_value text;
  business_key_value text;
  preview_value jsonb;
  existing_event public.billing_calculation_events%ROWTYPE;
  existing_calculation public.billing_calculations%ROWTYPE;
  calculation_row public.billing_calculations%ROWTYPE;
  response_value jsonb;
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR pg_catalog.jsonb_typeof(p_request) IS DISTINCT FROM 'object'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'CALCULATION_NOT_AUTHORIZED';
  END IF;
  SELECT COALESCE(pg_catalog.array_agg(key ORDER BY key), ARRAY[]::text[])
  INTO request_keys
  FROM pg_catalog.jsonb_object_keys(p_request) AS keys(key);
  IF NOT request_keys <@ ARRAY[
      'account_id', 'close_policy_version', 'close_snapshot_id',
      'command_key', 'preview_fingerprint'
    ]::text[]
    OR NOT ARRAY[
      'account_id', 'close_snapshot_id', 'command_key', 'preview_fingerprint'
    ]::text[] <@ request_keys
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_each(p_request) AS entry(key, value)
      WHERE entry.key IN (
        'account_id', 'close_policy_version', 'close_snapshot_id',
        'command_key', 'preview_fingerprint'
      )
        AND pg_catalog.jsonb_typeof(entry.value) IS DISTINCT FROM 'string'
    )
    OR p_request->>'command_key' !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$'
    OR p_request->>'preview_fingerprint' !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023', MESSAGE = 'CALCULATION_INVALID_REQUEST';
  END IF;
  BEGIN
    account_id_value := (p_request->>'account_id')::uuid;
    close_snapshot_id_value := (p_request->>'close_snapshot_id')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023', MESSAGE = 'CALCULATION_INVALID_REQUEST';
  END;
  command_key_value := p_request->>'command_key';
  supplied_preview_fingerprint := p_request->>'preview_fingerprint';
  policy_version_value := COALESCE(
    NULLIF(pg_catalog.btrim(p_request->>'close_policy_version'), ''),
    'billing-manual-v1'
  );
  request_fingerprint_value := private.billing_calculation_fingerprint(
    'calculation.create', p_request
  );

  SELECT account.organization_id INTO organization_id_value
  FROM public.billing_accounts AS account
  WHERE account.id = account_id_value;
  actor_role_value := private.billing_calculation_human_role(
    organization_id_value, account_id_value, 'calculation.create'
  );
  IF organization_id_value IS NULL OR actor_role_value IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'CALCULATION_NOT_AUTHORIZED';
  END IF;

  SELECT event.* INTO existing_event
  FROM public.billing_calculation_events AS event
  WHERE event.actor_type = 'human'
    AND event.actor_id = (SELECT auth.uid())
    AND event.command_key = command_key_value;
  IF FOUND THEN
    IF existing_event.request_fingerprint = request_fingerprint_value THEN
      RETURN existing_event.response_snapshot;
    END IF;
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'CALCULATION_IDEMPOTENCY_CONFLICT';
  END IF;

  business_key_value := pg_catalog.encode(
    extensions.digest(
      pg_catalog.jsonb_build_object(
        'kind', 'standard', 'close_snapshot_id', close_snapshot_id_value
      )::text,
      'sha256'
    ),
    'hex'
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      organization_id_value::text || ':' || account_id_value::text || ':'
        || business_key_value,
      0
    )
  );

  SELECT event.* INTO existing_event
  FROM public.billing_calculation_events AS event
  WHERE event.actor_type = 'human'
    AND event.actor_id = (SELECT auth.uid())
    AND event.command_key = command_key_value;
  IF FOUND THEN
    IF existing_event.request_fingerprint = request_fingerprint_value THEN
      RETURN existing_event.response_snapshot;
    END IF;
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'CALCULATION_IDEMPOTENCY_CONFLICT';
  END IF;

  preview_value := private.billing_build_calculation_preview(
    account_id_value, close_snapshot_id_value, policy_version_value
  );
  IF preview_value->>'preview_fingerprint'
    IS DISTINCT FROM supplied_preview_fingerprint
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'CALCULATION_PREVIEW_STALE';
  END IF;

  SELECT calculation.* INTO existing_calculation
  FROM public.billing_calculations AS calculation
  WHERE calculation.organization_id = organization_id_value
    AND calculation.account_id = account_id_value
    AND calculation.business_key = business_key_value;
  IF FOUND THEN
    IF existing_calculation.request_fingerprint = request_fingerprint_value THEN
      RETURN private.billing_calculation_response(existing_calculation.id);
    END IF;
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'CALCULATION_BUSINESS_KEY_CONFLICT';
  END IF;

  INSERT INTO public.billing_calculations (
    organization_id, account_id, agreement_id, agreement_version_id,
    period_id, close_snapshot_id, business_key, request_fingerprint,
    close_input_fingerprint, terms_fingerprint, formula_kind, formula_version,
    rounding_policy_version, close_policy_version, explanation_version,
    selected_branch, result_amount_minor, currency, created_by, created_by_role
  ) VALUES (
    organization_id_value, account_id_value,
    (preview_value->>'agreement_id')::uuid,
    (preview_value->>'agreement_version_id')::uuid,
    (preview_value->>'period_id')::uuid,
    close_snapshot_id_value, business_key_value, request_fingerprint_value,
    preview_value->>'close_input_fingerprint', preview_value->>'terms_fingerprint',
    preview_value->>'formula_kind', preview_value->>'formula_version',
    preview_value->>'rounding_policy_version', policy_version_value,
    preview_value->>'explanation_version', preview_value->>'selected_branch',
    (preview_value->>'final_amount_minor')::bigint,
    preview_value->>'currency', (SELECT auth.uid()), actor_role_value
  ) RETURNING * INTO calculation_row;

  INSERT INTO public.billing_calculation_snapshots (
    calculation_id, organization_id, account_id, agreement_id,
    agreement_version_id, period_id, close_snapshot_id, close_mode,
    gross_amount_minor, excluded_amount_minor,
    source_commissionable_amount_minor, calculation_base_minor,
    provenance_kind, provenance_source_id, evidence_fingerprint, formula_kind,
    fixed_amount_minor, minimum_amount_minor, rate_numerator, rate_denominator,
    submitted_percentage, intermediate_numerator, intermediate_denominator,
    fixed_candidate_minor, minimum_candidate_minor, percentage_candidate_minor,
    selected_branch, result_amount_minor, currency, currency_policy_version,
    rate_policy_version, rounding_policy_version, formula_version,
    revenue_close_policy_version, close_policy_version, explanation_version,
    anomaly_results, previous_calculation_id, comparison_status, delta_minor,
    delta_rate_numerator, delta_rate_denominator, snapshot_payload,
    snapshot_hash, explanation_payload, explanation_hash
  ) VALUES (
    calculation_row.id, organization_id_value, account_id_value,
    (preview_value->>'agreement_id')::uuid,
    (preview_value->>'agreement_version_id')::uuid,
    (preview_value->>'period_id')::uuid, close_snapshot_id_value,
    preview_value->>'close_mode',
    (preview_value->>'gross_amount_minor')::bigint,
    (preview_value->>'excluded_amount_minor')::bigint,
    (preview_value->>'source_commissionable_amount_minor')::bigint,
    (preview_value->>'calculation_base_minor')::bigint,
    NULLIF(preview_value->>'provenance_kind', 'minimum_only'),
    preview_value->>'provenance_source_id',
    preview_value->>'evidence_fingerprint', preview_value->>'formula_kind',
    (preview_value->>'fixed_amount_minor')::bigint,
    (preview_value->>'minimum_amount_minor')::bigint,
    (preview_value->>'rate_numerator')::bigint,
    (preview_value->>'rate_denominator')::bigint,
    preview_value->>'submitted_percentage',
    (preview_value->>'intermediate_numerator')::numeric,
    (preview_value->>'intermediate_denominator')::bigint,
    (preview_value->>'fixed_candidate_minor')::bigint,
    (preview_value->>'minimum_candidate_minor')::bigint,
    (preview_value->>'percentage_candidate_minor')::bigint,
    preview_value->>'selected_branch',
    (preview_value->>'final_amount_minor')::bigint,
    preview_value->>'currency', preview_value->>'currency_policy_version',
    preview_value->>'rate_policy_version',
    preview_value->>'rounding_policy_version', preview_value->>'formula_version',
    preview_value->>'revenue_close_policy_version', policy_version_value,
    preview_value->>'explanation_version', preview_value->'anomalies',
    (preview_value->>'previous_calculation_id')::uuid,
    preview_value->>'comparison_status',
    (preview_value->>'delta_minor')::bigint,
    (preview_value->>'delta_rate_numerator')::bigint,
    (preview_value->>'delta_rate_denominator')::bigint,
    '{}'::jsonb, repeat('0', 64), '{}'::jsonb, repeat('0', 64)
  );

  response_value := private.billing_calculation_response(calculation_row.id);
  INSERT INTO public.billing_calculation_events (
    calculation_id, organization_id, account_id, event_type, actor_type,
    actor_id, actor_role, approval_mode, authorization_source, reason,
    command_key, request_fingerprint, preview_fingerprint,
    close_policy_version, response_snapshot
  ) VALUES (
    calculation_row.id, organization_id_value, account_id_value,
    'created', 'human', (SELECT auth.uid()), actor_role_value, NULL,
    'capability:calculation.create', 'Created from frozen calculation preview',
    command_key_value, request_fingerprint_value,
    supplied_preview_fingerprint, policy_version_value, response_value
  );
  RETURN response_value;
END;
$function$;

CREATE FUNCTION public.approve_billing_calculation(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  request_keys text[];
  mode_value text;
  account_id_value uuid;
  calculation_id_value uuid;
  grant_id_value uuid;
  policy_version_value text;
  command_key_value text;
  supplied_preview_fingerprint text;
  request_fingerprint_value text;
  actor_type_value text;
  actor_id_value uuid;
  actor_role_value text;
  calculation_row public.billing_calculations%ROWTYPE;
  snapshot_row public.billing_calculation_snapshots%ROWTYPE;
  policy_row public.billing_close_policies%ROWTYPE;
  account_row public.billing_accounts%ROWTYPE;
  automation_principal_row public.billing_automation_principals%ROWTYPE;
  existing_event public.billing_calculation_events%ROWTYPE;
  created_event public.billing_calculation_events%ROWTYPE;
  preview_value jsonb;
  automation_result jsonb;
  response_value jsonb;
  event_id_value bigint;
  provenance_class_value text;
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR pg_catalog.jsonb_typeof(p_request) IS DISTINCT FROM 'object'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'CALCULATION_NOT_AUTHORIZED';
  END IF;
  SELECT COALESCE(pg_catalog.array_agg(key ORDER BY key), ARRAY[]::text[])
  INTO request_keys
  FROM pg_catalog.jsonb_object_keys(p_request) AS keys(key);
  IF NOT request_keys <@ ARRAY[
      'account_id', 'calculation_id', 'close_policy_version', 'command_key',
      'grant_id', 'mode', 'preview_fingerprint', 'provider_reference', 'reason'
    ]::text[]
    OR NOT ARRAY[
      'account_id', 'calculation_id', 'close_policy_version', 'command_key',
      'mode', 'preview_fingerprint', 'reason'
    ]::text[] <@ request_keys
    OR EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_each(p_request) AS entry(key, value)
      WHERE pg_catalog.jsonb_typeof(entry.value) IS DISTINCT FROM 'string'
    )
    OR p_request->>'command_key' !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$'
    OR p_request->>'preview_fingerprint' !~ '^[0-9a-f]{64}$'
    OR pg_catalog.btrim(p_request->>'reason') = ''
    OR pg_catalog.octet_length(p_request->>'reason') > 1000
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023', MESSAGE = 'CALCULATION_INVALID_REQUEST';
  END IF;
  mode_value := p_request->>'mode';
  IF mode_value NOT IN ('manual', 'auto')
    OR (mode_value = 'manual' AND (p_request ? 'grant_id'
      OR p_request ? 'provider_reference'))
    OR (mode_value = 'auto' AND NOT ARRAY[
      'grant_id', 'provider_reference'
    ]::text[] <@ request_keys)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023', MESSAGE = 'CALCULATION_INVALID_REQUEST';
  END IF;
  BEGIN
    account_id_value := (p_request->>'account_id')::uuid;
    calculation_id_value := (p_request->>'calculation_id')::uuid;
    IF mode_value = 'auto' THEN
      grant_id_value := (p_request->>'grant_id')::uuid;
    END IF;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023', MESSAGE = 'CALCULATION_INVALID_REQUEST';
  END;
  policy_version_value := p_request->>'close_policy_version';
  command_key_value := p_request->>'command_key';
  supplied_preview_fingerprint := p_request->>'preview_fingerprint';
  request_fingerprint_value := private.billing_calculation_fingerprint(
    'calculation.approve', p_request
  );

  SELECT calculation.* INTO calculation_row
  FROM public.billing_calculations AS calculation
  WHERE calculation.id = calculation_id_value
    AND calculation.account_id = account_id_value
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'CALCULATION_NOT_AUTHORIZED';
  END IF;

  IF mode_value = 'manual' THEN
    actor_type_value := 'human';
    actor_id_value := (SELECT auth.uid());
    actor_role_value := private.billing_calculation_human_role(
      calculation_row.organization_id, calculation_row.account_id,
      'calculation.approve'
    );
    IF actor_role_value IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'CALCULATION_NOT_AUTHORIZED';
    END IF;
  ELSE
    actor_type_value := 'automation';
    SELECT principal.* INTO automation_principal_row
    FROM public.billing_automation_principals AS principal
    JOIN public.billing_organizations AS organization
      ON organization.id = principal.organization_id
    WHERE principal.auth_user_id = (SELECT auth.uid())
      AND principal.organization_id = calculation_row.organization_id
      AND principal.status = 'active'
      AND principal.disabled_at IS NULL
      AND principal.valid_from <= pg_catalog.now()
      AND (principal.valid_until IS NULL
        OR principal.valid_until > pg_catalog.now())
      AND organization.status = 'active';
    IF NOT FOUND THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'CALCULATION_AUTO_NOT_AUTHORIZED';
    END IF;
    actor_id_value := automation_principal_row.id;
  END IF;

  SELECT event.* INTO existing_event
  FROM public.billing_calculation_events AS event
  WHERE event.actor_type = actor_type_value
    AND event.actor_id = actor_id_value
    AND event.command_key = command_key_value;
  IF FOUND THEN
    IF existing_event.request_fingerprint = request_fingerprint_value THEN
      RETURN existing_event.response_snapshot;
    END IF;
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'CALCULATION_IDEMPOTENCY_CONFLICT';
  END IF;

  SELECT snapshot.* INTO snapshot_row
  FROM public.billing_calculation_snapshots AS snapshot
  WHERE snapshot.calculation_id = calculation_row.id;
  SELECT policy.* INTO policy_row
  FROM public.billing_close_policies AS policy
  WHERE policy.policy_version = policy_version_value
    AND (
      (policy.organization_id IS NULL AND policy.account_id IS NULL)
      OR (policy.organization_id = calculation_row.organization_id
        AND policy.account_id = calculation_row.account_id)
    );
  SELECT account.* INTO account_row
  FROM public.billing_accounts AS account
  WHERE account.id = calculation_row.account_id
    AND account.organization_id = calculation_row.organization_id;
  IF snapshot_row.calculation_id IS NULL OR policy_row.policy_version IS NULL
    OR account_row.id IS NULL
    OR calculation_row.close_policy_version <> policy_version_value
    OR snapshot_row.close_policy_version <> policy_version_value
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'CALCULATION_POLICY_MISMATCH';
  END IF;

  SELECT event.* INTO created_event
  FROM public.billing_calculation_events AS event
  WHERE event.calculation_id = calculation_row.id
    AND event.event_type = 'created';
  preview_value := private.billing_build_calculation_preview(
    calculation_row.account_id, calculation_row.close_snapshot_id,
    policy_version_value
  );
  IF created_event.id IS NULL
    OR created_event.preview_fingerprint
      IS DISTINCT FROM supplied_preview_fingerprint
    OR preview_value->>'preview_fingerprint'
      IS DISTINCT FROM supplied_preview_fingerprint
    OR snapshot_row.anomaly_results IS DISTINCT FROM preview_value->'anomalies'
    OR snapshot_row.selected_branch IS DISTINCT FROM preview_value->>'selected_branch'
    OR snapshot_row.result_amount_minor
      IS DISTINCT FROM (preview_value->>'final_amount_minor')::bigint
    OR calculation_row.close_input_fingerprint
      IS DISTINCT FROM preview_value->>'close_input_fingerprint'
    OR calculation_row.terms_fingerprint
      IS DISTINCT FROM preview_value->>'terms_fingerprint'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'CALCULATION_PREVIEW_STALE';
  END IF;
  IF pg_catalog.jsonb_array_length(preview_value->'anomalies') <> 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'CALCULATION_HELD';
  END IF;
  IF NOT policy_row.active
    OR policy_row.effective_from > pg_catalog.now()
    OR (policy_row.effective_until IS NOT NULL
      AND policy_row.effective_until <= pg_catalog.now())
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'CALCULATION_POLICY_MISMATCH';
  END IF;

  provenance_class_value := COALESCE(snapshot_row.provenance_kind, 'minimum_only');
  IF mode_value = 'manual' THEN
    IF policy_row.policy_mode <> 'manual' THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'CALCULATION_POLICY_MISMATCH';
    END IF;
  ELSE
    IF policy_row.policy_mode <> 'auto'
      OR policy_row.organization_id <> calculation_row.organization_id
      OR policy_row.account_id <> calculation_row.account_id
      OR NOT policy_row.allowed_account_statuses ? account_row.billing_status
      OR NOT policy_row.allowed_formula_kinds ? calculation_row.formula_kind
      OR NOT policy_row.allowed_close_modes ? snapshot_row.close_mode
      OR NOT policy_row.allowed_provenance_kinds ? provenance_class_value
      OR (policy_row.require_zero_anomalies
        AND pg_catalog.jsonb_array_length(snapshot_row.anomaly_results) <> 0)
      OR calculation_row.result_amount_minor < policy_row.minimum_result_minor
      OR (policy_row.maximum_result_minor IS NOT NULL
        AND calculation_row.result_amount_minor > policy_row.maximum_result_minor)
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'CALCULATION_POLICY_MISMATCH';
    END IF;
  END IF;

  SELECT event.* INTO existing_event
  FROM public.billing_calculation_events AS event
  WHERE event.calculation_id = calculation_row.id
    AND event.event_type = 'approved';
  IF FOUND THEN
    RETURN existing_event.response_snapshot;
  END IF;

  IF mode_value = 'auto' THEN
    automation_result := private.billing_consume_automation_grant(
      grant_id_value,
      calculation_row.account_id,
      'calculation.approve',
      p_request->>'provider_reference',
      policy_version_value,
      'calculation.approval',
      pg_catalog.jsonb_build_object('amount_minor', '0', 'currency', 'USD'),
      command_key_value,
      pg_catalog.jsonb_build_object(
        'kind', 'calculation-approval',
        'calculation_id', calculation_row.id,
        'preview_fingerprint', supplied_preview_fingerprint,
        'reason_fingerprint', pg_catalog.encode(
          extensions.digest(p_request->>'reason', 'sha256'), 'hex'
        )
      )
    );
    IF automation_result->>'result' <> 'applied' THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'CALCULATION_AUTO_NOT_AUTHORIZED';
    END IF;
  END IF;

  event_id_value := pg_catalog.nextval(
    'public.billing_calculation_events_id_seq'::regclass
  );
  response_value := pg_catalog.jsonb_build_object(
    'result', 'approved',
    'calculation_id', calculation_row.id,
    'event_id', event_id_value::text,
    'mode', mode_value,
    'close_policy_version', policy_version_value,
    'preview_fingerprint', supplied_preview_fingerprint,
    'snapshot_hash', snapshot_row.snapshot_hash,
    'approved_amount_minor', calculation_row.result_amount_minor::text,
    'currency', calculation_row.currency
  );
  INSERT INTO public.billing_calculation_events (
    id, calculation_id, organization_id, account_id, event_type, actor_type,
    actor_id, actor_role, approval_mode, authorization_source, reason,
    command_key, request_fingerprint, preview_fingerprint,
    close_policy_version, response_snapshot
  ) OVERRIDING SYSTEM VALUE VALUES (
    event_id_value, calculation_row.id, calculation_row.organization_id,
    calculation_row.account_id, 'approved', actor_type_value, actor_id_value,
    actor_role_value, mode_value,
    CASE WHEN mode_value = 'manual'
      THEN 'capability:calculation.approve'
      ELSE 'automation-grant:' || grant_id_value::text END,
    pg_catalog.btrim(p_request->>'reason'), command_key_value,
    request_fingerprint_value, supplied_preview_fingerprint,
    policy_version_value, response_value
  );
  RETURN response_value;
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
ALTER FUNCTION private.billing_calculation_fingerprint(text, jsonb) OWNER TO postgres;
ALTER FUNCTION private.billing_validate_effect_discriminator(jsonb) OWNER TO postgres;
ALTER FUNCTION private.billing_calculation_human_role(uuid, uuid, text) OWNER TO postgres;
ALTER FUNCTION private.billing_build_calculation_preview(uuid, uuid, text) OWNER TO postgres;
ALTER FUNCTION private.billing_calculation_response(uuid) OWNER TO postgres;
ALTER FUNCTION public.preview_billing_calculation(jsonb) OWNER TO postgres;
ALTER FUNCTION public.create_billing_calculation(jsonb) OWNER TO postgres;
ALTER FUNCTION public.approve_billing_calculation(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.billing_calculate_exact(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_calculation_fact_immutable()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_calculation_snapshot_freeze()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_calculation_snapshot_required()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_calculation_fingerprint(text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_validate_effect_discriminator(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_calculation_human_role(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_build_calculation_preview(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_calculation_response(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.preview_billing_calculation(jsonb)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_billing_calculation(jsonb)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approve_billing_calculation(jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_billing_calculation(jsonb)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_billing_calculation(jsonb)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_billing_calculation(jsonb)
  TO authenticated;

COMMIT;
