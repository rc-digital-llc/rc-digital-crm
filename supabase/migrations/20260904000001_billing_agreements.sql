-- Phase 4: immutable structured billing agreements and caller-bound lifecycle.

BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

INSERT INTO public.billing_role_capabilities (role, capability)
VALUES
  ('administrator', 'agreement.read'),
  ('administrator', 'agreement.manage'),
  ('administrator', 'agreement.approve'),
  ('operator', 'agreement.read'),
  ('operator', 'agreement.manage'),
  ('reviewer', 'agreement.read'),
  ('reviewer', 'agreement.approve'),
  ('auditor', 'agreement.read'),
  ('customer', 'agreement.read')
ON CONFLICT DO NOTHING;

CREATE TABLE public.billing_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  account_id uuid NOT NULL,
  agreement_family text NOT NULL DEFAULT 'primary',
  cadence text NOT NULL DEFAULT 'monthly',
  currency text NOT NULL DEFAULT 'USD',
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT billing_agreements_account_scope_fk
    FOREIGN KEY (account_id, organization_id)
    REFERENCES public.billing_accounts(id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT billing_agreements_scope_unique
    UNIQUE (id, organization_id, account_id),
  CONSTRAINT billing_agreements_family_unique
    UNIQUE (organization_id, account_id, agreement_family),
  CONSTRAINT billing_agreements_family_check
    CHECK (agreement_family ~ '^[a-z][a-z0-9_-]{0,63}$'),
  CONSTRAINT billing_agreements_cadence_check CHECK (cadence = 'monthly'),
  CONSTRAINT billing_agreements_currency_check CHECK (currency = 'USD')
);

CREATE TABLE public.billing_agreement_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  account_id uuid NOT NULL,
  agreement_id uuid NOT NULL,
  version_number integer NOT NULL CHECK (version_number > 0),
  state text NOT NULL DEFAULT 'draft'
    CHECK (state IN ('draft', 'submitted', 'active')),
  effective_start date NOT NULL,
  effective_end date NOT NULL,
  effective_range daterange GENERATED ALWAYS AS (
    pg_catalog.daterange(effective_start, effective_end, '[)')
  ) STORED,
  formula_kind text NOT NULL
    CHECK (formula_kind IN ('fixed', 'percentage', 'minimum_support', 'hybrid')),
  fixed_amount_minor bigint,
  minimum_amount_minor bigint,
  rate_numerator bigint,
  rate_denominator bigint,
  submitted_percentage text,
  currency text NOT NULL DEFAULT 'USD',
  currency_policy_version text NOT NULL DEFAULT 'usd-v1'
    REFERENCES public.financial_currency_policies(policy_version),
  rate_policy_version text NOT NULL DEFAULT 'ordinary-percentage-v1'
    REFERENCES public.financial_rate_policies(policy_version),
  rounding_policy_version text NOT NULL DEFAULT 'half-away-from-zero-v1'
    REFERENCES public.financial_rounding_policies(policy_version),
  formula_version text NOT NULL DEFAULT 'billing-agreement-formula-v1',
  explanation_version text NOT NULL DEFAULT 'billing-agreement-explanation-v1',
  signed_evidence_id uuid NOT NULL,
  signed_evidence_sha256 text NOT NULL,
  terms_fingerprint text NOT NULL,
  authored_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  authored_by_role text NOT NULL REFERENCES public.billing_roles(role),
  submitted_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  submitted_by_role text REFERENCES public.billing_roles(role),
  submitted_at timestamptz,
  approved_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  approved_by_role text REFERENCES public.billing_roles(role),
  approved_at timestamptz,
  self_approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT billing_agreement_versions_agreement_scope_fk
    FOREIGN KEY (agreement_id, organization_id, account_id)
    REFERENCES public.billing_agreements(id, organization_id, account_id)
    ON DELETE RESTRICT,
  CONSTRAINT billing_agreement_versions_evidence_scope_fk
    FOREIGN KEY (signed_evidence_id, organization_id, account_id)
    REFERENCES public.billing_evidence_objects(id, organization_id, account_id)
    ON DELETE RESTRICT,
  CONSTRAINT billing_agreement_versions_scope_unique
    UNIQUE (id, organization_id, account_id),
  CONSTRAINT billing_agreement_versions_number_unique
    UNIQUE (agreement_id, version_number),
  CONSTRAINT billing_agreement_versions_dates_check
    CHECK (
      effective_end > effective_start
      AND extract(day FROM effective_start) = 1
      AND extract(day FROM effective_end) = 1
    ),
  CONSTRAINT billing_agreement_versions_formula_check
    CHECK (
      (formula_kind = 'fixed'
        AND fixed_amount_minor IS NOT NULL AND fixed_amount_minor >= 0
        AND minimum_amount_minor IS NULL
        AND rate_numerator IS NULL AND rate_denominator IS NULL
        AND submitted_percentage IS NULL)
      OR (formula_kind = 'percentage'
        AND fixed_amount_minor IS NULL AND minimum_amount_minor IS NULL
        AND rate_numerator IS NOT NULL AND rate_numerator >= 0
        AND rate_denominator IS NOT NULL AND rate_denominator > 0
        AND rate_numerator <= rate_denominator
        AND submitted_percentage IS NOT NULL)
      OR (formula_kind = 'minimum_support'
        AND fixed_amount_minor IS NULL
        AND minimum_amount_minor IS NOT NULL AND minimum_amount_minor >= 0
        AND rate_numerator IS NULL AND rate_denominator IS NULL
        AND submitted_percentage IS NULL)
      OR (formula_kind = 'hybrid'
        AND fixed_amount_minor IS NULL
        AND minimum_amount_minor IS NOT NULL AND minimum_amount_minor >= 0
        AND rate_numerator IS NOT NULL AND rate_numerator >= 0
        AND rate_denominator IS NOT NULL AND rate_denominator > 0
        AND rate_numerator <= rate_denominator
        AND submitted_percentage IS NOT NULL)
    ),
  CONSTRAINT billing_agreement_versions_policy_check
    CHECK (
      currency = 'USD'
      AND currency_policy_version = 'usd-v1'
      AND rate_policy_version = 'ordinary-percentage-v1'
      AND rounding_policy_version = 'half-away-from-zero-v1'
      AND formula_version = 'billing-agreement-formula-v1'
      AND explanation_version = 'billing-agreement-explanation-v1'
    ),
  CONSTRAINT billing_agreement_versions_percentage_check
    CHECK (
      submitted_percentage IS NULL
      OR (
        pg_catalog.octet_length(submitted_percentage) <= 14
        AND submitted_percentage ~ '^(0|[1-9][0-9]?|100)(\.[0-9]{1,9})?%$'
      )
    ),
  CONSTRAINT billing_agreement_versions_hash_check
    CHECK (
      signed_evidence_sha256 ~ '^[0-9a-f]{64}$'
      AND terms_fingerprint ~ '^[0-9a-f]{64}$'
    ),
  CONSTRAINT billing_agreement_versions_lifecycle_check
    CHECK (
      (state = 'draft'
        AND submitted_by IS NULL AND submitted_by_role IS NULL AND submitted_at IS NULL
        AND approved_by IS NULL AND approved_by_role IS NULL AND approved_at IS NULL
        AND NOT self_approved)
      OR (state = 'submitted'
        AND submitted_by IS NOT NULL AND submitted_by_role IS NOT NULL AND submitted_at IS NOT NULL
        AND approved_by IS NULL AND approved_by_role IS NULL AND approved_at IS NULL
        AND NOT self_approved)
      OR (state = 'active'
        AND submitted_by IS NOT NULL AND submitted_by_role IS NOT NULL AND submitted_at IS NOT NULL
        AND approved_by IS NOT NULL AND approved_by_role IS NOT NULL AND approved_at IS NOT NULL)
    ),
  CONSTRAINT billing_agreement_versions_active_overlap_excl
    EXCLUDE USING gist (
      organization_id WITH =,
      account_id WITH =,
      agreement_id WITH =,
      effective_range WITH &&
    ) WHERE (state = 'active')
);

CREATE INDEX billing_agreement_versions_scope_state_idx
  ON public.billing_agreement_versions (
    organization_id, account_id, agreement_id, state, effective_start DESC
  );

CREATE TABLE public.billing_agreement_revenue_rules (
  agreement_version_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  account_id uuid NOT NULL,
  timezone text NOT NULL,
  timing_basis text NOT NULL CHECK (timing_basis IN ('cash', 'accrual')),
  included_amounts jsonb NOT NULL,
  excluded_amounts jsonb NOT NULL,
  tax_treatment text NOT NULL CHECK (tax_treatment IN ('include', 'exclude')),
  refund_chargeback_policy text NOT NULL
    CHECK (refund_chargeback_policy IN ('deduct_in_period', 'next_period_adjustment')),
  cutoff_day smallint NOT NULL CHECK (cutoff_day BETWEEN 1 AND 28),
  dispute_policy text NOT NULL CHECK (dispute_policy IN ('hold_close', 'exclude_disputed')),
  missing_report_policy text NOT NULL
    CHECK (missing_report_policy IN ('hold_close', 'minimum_only')),
  true_up_policy text NOT NULL
    CHECK (true_up_policy IN ('next_period_adjustment', 'credit_candidate')),
  evidence_priority jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT billing_agreement_rules_version_scope_fk
    FOREIGN KEY (agreement_version_id, organization_id, account_id)
    REFERENCES public.billing_agreement_versions(id, organization_id, account_id)
    ON DELETE RESTRICT,
  CONSTRAINT billing_agreement_rules_arrays_check CHECK (
    pg_catalog.jsonb_typeof(included_amounts) = 'array'
    AND pg_catalog.jsonb_array_length(included_amounts) BETWEEN 1 AND 100
    AND pg_catalog.jsonb_typeof(excluded_amounts) = 'array'
    AND pg_catalog.jsonb_array_length(excluded_amounts) <= 100
    AND pg_catalog.jsonb_typeof(evidence_priority) = 'array'
    AND pg_catalog.jsonb_array_length(evidence_priority) BETWEEN 1 AND 10
  )
);

CREATE TABLE public.billing_agreement_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL,
  account_id uuid NOT NULL,
  agreement_id uuid NOT NULL,
  agreement_version_id uuid NOT NULL,
  event_type text NOT NULL CHECK (
    event_type IN ('draft_saved', 'submitted', 'activated', 'paused', 'terminated')
  ),
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  actor_role text NOT NULL REFERENCES public.billing_roles(role),
  reason text NOT NULL CHECK (btrim(reason) <> '' AND octet_length(reason) <= 1000),
  command_key text NOT NULL CHECK (command_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$'),
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  evidence_sha256 text NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
  response_snapshot jsonb NOT NULL CHECK (jsonb_typeof(response_snapshot) = 'object'),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT billing_agreement_events_agreement_scope_fk
    FOREIGN KEY (agreement_id, organization_id, account_id)
    REFERENCES public.billing_agreements(id, organization_id, account_id)
    ON DELETE RESTRICT,
  CONSTRAINT billing_agreement_events_version_scope_fk
    FOREIGN KEY (agreement_version_id, organization_id, account_id)
    REFERENCES public.billing_agreement_versions(id, organization_id, account_id)
    ON DELETE RESTRICT,
  CONSTRAINT billing_agreement_events_actor_command_unique UNIQUE (actor_id, command_key)
);

CREATE INDEX billing_agreement_events_scope_created_idx
  ON public.billing_agreement_events (
    organization_id, account_id, agreement_id, agreement_version_id, created_at DESC, id DESC
  );

CREATE FUNCTION private.billing_agreement_identity_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AGREEMENT_IDENTITY_IMMUTABLE';
END;
$function$;

CREATE FUNCTION private.billing_agreement_version_protect()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.state = 'active' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AGREEMENT_VERSION_IMMUTABLE';
  END IF;
  IF OLD.state = 'submitted' THEN
    IF NEW.state <> 'active'
      OR ROW(
        OLD.id, OLD.organization_id, OLD.account_id, OLD.agreement_id,
        OLD.version_number, OLD.effective_start, OLD.effective_end,
        OLD.formula_kind, OLD.fixed_amount_minor, OLD.minimum_amount_minor,
        OLD.rate_numerator, OLD.rate_denominator, OLD.submitted_percentage,
        OLD.currency, OLD.currency_policy_version, OLD.rate_policy_version,
        OLD.rounding_policy_version, OLD.formula_version,
        OLD.explanation_version, OLD.signed_evidence_id,
        OLD.signed_evidence_sha256, OLD.terms_fingerprint, OLD.authored_by,
        OLD.authored_by_role, OLD.submitted_by, OLD.submitted_by_role,
        OLD.submitted_at, OLD.created_at
      ) IS DISTINCT FROM ROW(
        NEW.id, NEW.organization_id, NEW.account_id, NEW.agreement_id,
        NEW.version_number, NEW.effective_start, NEW.effective_end,
        NEW.formula_kind, NEW.fixed_amount_minor, NEW.minimum_amount_minor,
        NEW.rate_numerator, NEW.rate_denominator, NEW.submitted_percentage,
        NEW.currency, NEW.currency_policy_version, NEW.rate_policy_version,
        NEW.rounding_policy_version, NEW.formula_version,
        NEW.explanation_version, NEW.signed_evidence_id,
        NEW.signed_evidence_sha256, NEW.terms_fingerprint, NEW.authored_by,
        NEW.authored_by_role, NEW.submitted_by, NEW.submitted_by_role,
        NEW.submitted_at, NEW.created_at
      )
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AGREEMENT_VERSION_IMMUTABLE';
    END IF;
  ELSIF OLD.state = 'draft' AND NEW.state NOT IN ('draft', 'submitted') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AGREEMENT_LIFECYCLE_INVALID';
  END IF;
  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$function$;

CREATE FUNCTION private.billing_agreement_rule_protect()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  version_state text;
BEGIN
  SELECT version.state INTO version_state
  FROM public.billing_agreement_versions AS version
  WHERE version.id = OLD.agreement_version_id;
  IF version_state IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AGREEMENT_RULE_IMMUTABLE';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := pg_catalog.now();
    RETURN NEW;
  END IF;
  RETURN OLD;
END;
$function$;

CREATE FUNCTION private.billing_agreement_event_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AGREEMENT_EVENT_IMMUTABLE';
END;
$function$;

CREATE TRIGGER billing_agreements_immutable
BEFORE UPDATE OR DELETE ON public.billing_agreements
FOR EACH ROW EXECUTE FUNCTION private.billing_agreement_identity_immutable();

CREATE TRIGGER billing_agreement_versions_protect
BEFORE UPDATE OR DELETE ON public.billing_agreement_versions
FOR EACH ROW EXECUTE FUNCTION private.billing_agreement_version_protect();

CREATE TRIGGER billing_agreement_rules_protect
BEFORE UPDATE OR DELETE ON public.billing_agreement_revenue_rules
FOR EACH ROW EXECUTE FUNCTION private.billing_agreement_rule_protect();

CREATE TRIGGER billing_agreement_events_immutable
BEFORE UPDATE OR DELETE ON public.billing_agreement_events
FOR EACH ROW EXECUTE FUNCTION private.billing_agreement_event_immutable();

CREATE FUNCTION private.billing_agreement_request_fingerprint(
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

CREATE FUNCTION private.billing_agreement_replay(
  p_command_key text,
  p_request_fingerprint text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  existing_event public.billing_agreement_events%ROWTYPE;
BEGIN
  SELECT event.* INTO existing_event
  FROM public.billing_agreement_events AS event
  WHERE event.actor_id = (SELECT auth.uid())
    AND event.command_key = p_command_key;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF existing_event.request_fingerprint IS DISTINCT FROM p_request_fingerprint THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AGREEMENT_IDEMPOTENCY_CONFLICT';
  END IF;
  RETURN existing_event.response_snapshot;
END;
$function$;

CREATE FUNCTION private.billing_agreement_actor_role(
  p_organization_id uuid,
  p_account_id uuid,
  p_capability text
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT assignment.role
  FROM public.sales AS sale
  JOIN public.billing_role_assignments AS assignment ON assignment.sales_id = sale.id
  JOIN public.billing_role_capabilities AS capability ON capability.role = assignment.role
  WHERE sale.user_id = (SELECT auth.uid())
    AND NOT sale.disabled
    AND assignment.organization_id = p_organization_id
    AND (assignment.account_id IS NULL OR assignment.account_id = p_account_id)
    AND assignment.disabled_at IS NULL
    AND assignment.valid_from <= pg_catalog.now()
    AND (assignment.valid_until IS NULL OR assignment.valid_until > pg_catalog.now())
    AND capability.capability = p_capability
  ORDER BY CASE assignment.role
    WHEN 'administrator' THEN 1
    WHEN 'reviewer' THEN 2
    WHEN 'operator' THEN 3
    WHEN 'auditor' THEN 4
    ELSE 5
  END
  LIMIT 1;
$function$;

CREATE FUNCTION private.billing_record_agreement_event(
  p_version public.billing_agreement_versions,
  p_event_type text,
  p_actor_role text,
  p_reason text,
  p_command_key text,
  p_request_fingerprint text,
  p_response jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  INSERT INTO public.billing_agreement_events (
    organization_id, account_id, agreement_id, agreement_version_id,
    event_type, actor_id, actor_role, reason, command_key,
    request_fingerprint, evidence_sha256, response_snapshot
  ) VALUES (
    p_version.organization_id, p_version.account_id, p_version.agreement_id,
    p_version.id, p_event_type, (SELECT auth.uid()), p_actor_role, p_reason,
    p_command_key, p_request_fingerprint, p_version.signed_evidence_sha256,
    p_response
  );

  INSERT INTO public.billing_audit_events (
    actor_type, actor_id, organization_id, account_id, action,
    subject_type, subject_id, result, reason, details
  ) VALUES (
    'human', (SELECT auth.uid()), p_version.organization_id, p_version.account_id,
    'agreement.' || p_event_type, 'billing_agreement_versions', p_version.id::text,
    'succeeded', p_reason, pg_catalog.jsonb_build_object(
      'agreement_id', p_version.agreement_id,
      'version_number', p_version.version_number,
      'state', p_version.state
    )
  );
END;
$function$;

CREATE FUNCTION public.save_billing_agreement_draft(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  payload_keys text[];
  required_keys CONSTANT text[] := ARRAY[
    'account_id', 'agreement_family', 'command_key', 'cutoff_day',
    'dispute_policy', 'effective_end', 'effective_start', 'evidence_priority',
    'excluded_amounts', 'fixed_amount', 'formula_kind', 'included_amounts',
    'minimum_amount', 'missing_report_policy', 'percentage',
    'refund_chargeback_policy', 'signed_evidence_id', 'tax_treatment',
    'timing_basis', 'timezone', 'true_up_policy'
  ];
  allowed_keys CONSTANT text[] := required_keys || ARRAY['agreement_id', 'version_id'];
  account_id_value uuid;
  organization_id_value uuid;
  agreement_id_value uuid;
  version_id_value uuid;
  evidence_id_value uuid;
  agreement_row public.billing_agreements%ROWTYPE;
  version_row public.billing_agreement_versions%ROWTYPE;
  evidence_row public.billing_evidence_objects%ROWTYPE;
  actor_role_value text;
  request_fingerprint_value text;
  replay_value jsonb;
  fixed_money jsonb;
  minimum_money jsonb;
  percentage_value jsonb;
  normalized_rate jsonb;
  fixed_amount_value bigint;
  minimum_amount_value bigint;
  rate_numerator_value bigint;
  rate_denominator_value bigint;
  submitted_percentage_value text;
  effective_start_value date;
  effective_end_value date;
  response_value jsonb;
  next_version integer;
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR pg_catalog.jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AGREEMENT_NOT_AUTHORIZED';
  END IF;
  SELECT COALESCE(pg_catalog.array_agg(key ORDER BY key), ARRAY[]::text[])
  INTO payload_keys
  FROM pg_catalog.jsonb_object_keys(p_payload) AS keys(key);
  IF NOT payload_keys <@ allowed_keys
    OR NOT required_keys <@ payload_keys
    OR pg_catalog.jsonb_typeof(p_payload->'account_id') IS DISTINCT FROM 'string'
    OR (p_payload->>'account_id') !~ '^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR pg_catalog.jsonb_typeof(p_payload->'agreement_family') IS DISTINCT FROM 'string'
    OR (p_payload->>'agreement_family') !~ '^[a-z][a-z0-9_-]{0,63}$'
    OR pg_catalog.jsonb_typeof(p_payload->'command_key') IS DISTINCT FROM 'string'
    OR (p_payload->>'command_key') !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$'
    OR pg_catalog.jsonb_typeof(p_payload->'signed_evidence_id') IS DISTINCT FROM 'string'
    OR (p_payload->>'signed_evidence_id') !~ '^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR (p_payload ? 'agreement_id' AND (
      pg_catalog.jsonb_typeof(p_payload->'agreement_id') IS DISTINCT FROM 'string'
      OR (p_payload->>'agreement_id') !~ '^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    ))
    OR (p_payload ? 'version_id' AND (
      pg_catalog.jsonb_typeof(p_payload->'version_id') IS DISTINCT FROM 'string'
      OR (p_payload->>'version_id') !~ '^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    ))
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AGREEMENT_INVALID_REQUEST';
  END IF;

  request_fingerprint_value := private.billing_agreement_request_fingerprint('draft_saved', p_payload);
  replay_value := private.billing_agreement_replay(
    p_payload->>'command_key', request_fingerprint_value
  );
  IF replay_value IS NOT NULL THEN
    RETURN replay_value;
  END IF;

  account_id_value := (p_payload->>'account_id')::uuid;
  SELECT account.organization_id INTO organization_id_value
  FROM public.billing_accounts AS account
  WHERE account.id = account_id_value
    AND account.billing_status <> 'closed';
  actor_role_value := private.billing_agreement_actor_role(
    organization_id_value, account_id_value, 'agreement.manage'
  );
  IF organization_id_value IS NULL OR actor_role_value IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AGREEMENT_NOT_AUTHORIZED';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      account_id_value::text || ':' || (p_payload->>'agreement_family'),
      0
    )
  );

  IF pg_catalog.jsonb_typeof(p_payload->'effective_start') IS DISTINCT FROM 'string'
    OR (p_payload->>'effective_start') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    OR pg_catalog.jsonb_typeof(p_payload->'effective_end') IS DISTINCT FROM 'string'
    OR (p_payload->>'effective_end') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    OR pg_catalog.jsonb_typeof(p_payload->'timezone') IS DISTINCT FROM 'string'
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_timezone_names AS timezone
      WHERE timezone.name = p_payload->>'timezone'
    )
    OR pg_catalog.jsonb_typeof(p_payload->'cutoff_day') IS DISTINCT FROM 'number'
    OR (p_payload->>'cutoff_day') !~ '^[0-9]+$'
    OR (p_payload->>'cutoff_day')::integer NOT BETWEEN 1 AND 28
    OR p_payload->>'formula_kind' NOT IN ('fixed', 'percentage', 'minimum_support', 'hybrid')
    OR p_payload->>'timing_basis' NOT IN ('cash', 'accrual')
    OR p_payload->>'tax_treatment' NOT IN ('include', 'exclude')
    OR p_payload->>'refund_chargeback_policy' NOT IN ('deduct_in_period', 'next_period_adjustment')
    OR p_payload->>'dispute_policy' NOT IN ('hold_close', 'exclude_disputed')
    OR p_payload->>'missing_report_policy' NOT IN ('hold_close', 'minimum_only')
    OR p_payload->>'true_up_policy' NOT IN ('next_period_adjustment', 'credit_candidate')
    OR pg_catalog.jsonb_typeof(p_payload->'included_amounts') IS DISTINCT FROM 'array'
    OR pg_catalog.jsonb_array_length(p_payload->'included_amounts') NOT BETWEEN 1 AND 100
    OR pg_catalog.jsonb_typeof(p_payload->'excluded_amounts') IS DISTINCT FROM 'array'
    OR pg_catalog.jsonb_array_length(p_payload->'excluded_amounts') > 100
    OR pg_catalog.jsonb_typeof(p_payload->'evidence_priority') IS DISTINCT FROM 'array'
    OR pg_catalog.jsonb_array_length(p_payload->'evidence_priority') NOT BETWEEN 1 AND 10
    OR EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_array_elements(p_payload->'included_amounts') AS item(value)
      WHERE pg_catalog.jsonb_typeof(item.value) IS DISTINCT FROM 'string'
        OR (item.value #>> '{}') !~ '^[a-z][a-z0-9_-]{0,63}$'
    )
    OR EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_array_elements(p_payload->'excluded_amounts') AS item(value)
      WHERE pg_catalog.jsonb_typeof(item.value) IS DISTINCT FROM 'string'
        OR (item.value #>> '{}') !~ '^[a-z][a-z0-9_-]{0,63}$'
    )
    OR EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_array_elements(p_payload->'evidence_priority') AS item(value)
      WHERE pg_catalog.jsonb_typeof(item.value) IS DISTINCT FROM 'string'
        OR (item.value #>> '{}') NOT IN ('api', 'statement', 'portal')
    )
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_array_elements_text(p_payload->'included_amounts') AS included(value)
      JOIN pg_catalog.jsonb_array_elements_text(p_payload->'excluded_amounts') AS excluded(value)
        USING (value)
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AGREEMENT_INVALID_REQUEST';
  END IF;

  BEGIN
    effective_start_value := (p_payload->>'effective_start')::date;
    effective_end_value := (p_payload->>'effective_end')::date;
  EXCEPTION
    WHEN datetime_field_overflow OR invalid_datetime_format THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AGREEMENT_INVALID_REQUEST';
  END;
  IF effective_end_value <= effective_start_value
    OR extract(day FROM effective_start_value) <> 1
    OR extract(day FROM effective_end_value) <> 1
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AGREEMENT_INVALID_REQUEST';
  END IF;

  fixed_money := p_payload->'fixed_amount';
  minimum_money := p_payload->'minimum_amount';
  percentage_value := p_payload->'percentage';
  BEGIN
    IF p_payload->>'formula_kind' = 'fixed' THEN
      IF fixed_money = 'null'::jsonb OR minimum_money <> 'null'::jsonb
        OR percentage_value <> 'null'::jsonb THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AGREEMENT_INVALID_REQUEST';
      END IF;
      fixed_amount_value := (
        public.financial_parse_usd_money(fixed_money, 'usd-v1')->>'amount_minor'
      )::bigint;
    ELSIF p_payload->>'formula_kind' = 'minimum_support' THEN
      IF fixed_money <> 'null'::jsonb OR minimum_money = 'null'::jsonb
        OR percentage_value <> 'null'::jsonb THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AGREEMENT_INVALID_REQUEST';
      END IF;
      minimum_amount_value := (
        public.financial_parse_usd_money(minimum_money, 'usd-v1')->>'amount_minor'
      )::bigint;
    ELSE
      IF fixed_money <> 'null'::jsonb
        OR (p_payload->>'formula_kind' = 'percentage' AND minimum_money <> 'null'::jsonb)
        OR (p_payload->>'formula_kind' = 'hybrid' AND minimum_money = 'null'::jsonb)
        OR pg_catalog.jsonb_typeof(percentage_value) IS DISTINCT FROM 'object'
      THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AGREEMENT_INVALID_REQUEST';
      END IF;
      IF p_payload->>'formula_kind' = 'hybrid' THEN
        minimum_amount_value := (
          public.financial_parse_usd_money(minimum_money, 'usd-v1')->>'amount_minor'
        )::bigint;
      END IF;
      IF (
        SELECT pg_catalog.array_agg(key ORDER BY key)
        FROM pg_catalog.jsonb_object_keys(percentage_value) AS keys(key)
      ) IS DISTINCT FROM ARRAY[
        'denominator', 'kind', 'numerator', 'rate_policy_version', 'submitted_percentage'
      ]::text[]
        OR percentage_value->>'kind' IS DISTINCT FROM 'ordinary_percentage'
        OR percentage_value->>'rate_policy_version' IS DISTINCT FROM 'ordinary-percentage-v1'
      THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AGREEMENT_INVALID_REQUEST';
      END IF;
      normalized_rate := public.financial_parse_ordinary_percentage(
        percentage_value->'submitted_percentage', 'ordinary-percentage-v1'
      );
      IF normalized_rate->>'numerator' IS DISTINCT FROM percentage_value->>'numerator'
        OR normalized_rate->>'denominator' IS DISTINCT FROM percentage_value->>'denominator'
      THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AGREEMENT_INVALID_REQUEST';
      END IF;
      rate_numerator_value := (normalized_rate->>'numerator')::bigint;
      rate_denominator_value := (normalized_rate->>'denominator')::bigint;
      submitted_percentage_value := normalized_rate->>'submitted_percentage';
    END IF;
    IF COALESCE(fixed_amount_value, minimum_amount_value, 0) < 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AGREEMENT_INVALID_REQUEST';
    END IF;
  EXCEPTION
    WHEN SQLSTATE '22003' OR SQLSTATE '22012' OR SQLSTATE '22023' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AGREEMENT_INVALID_REQUEST';
  END;

  evidence_id_value := (p_payload->>'signed_evidence_id')::uuid;
  SELECT evidence.* INTO evidence_row
  FROM public.billing_evidence_objects AS evidence
  WHERE evidence.id = evidence_id_value
    AND evidence.organization_id = organization_id_value
    AND evidence.account_id = account_id_value
    AND evidence.kind = 'contract'
    AND evidence.inspection_status = 'clean'
    AND evidence.lifecycle_status = 'active'
    AND evidence.retention_expires_at > pg_catalog.now()
    AND NOT (evidence.hold_started_at IS NOT NULL AND evidence.hold_released_at IS NULL)
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AGREEMENT_SIGNED_EVIDENCE_INVALID';
  END IF;

  IF p_payload ? 'agreement_id' THEN
    agreement_id_value := (p_payload->>'agreement_id')::uuid;
    SELECT agreement.* INTO agreement_row
    FROM public.billing_agreements AS agreement
    WHERE agreement.id = agreement_id_value
      AND agreement.organization_id = organization_id_value
      AND agreement.account_id = account_id_value
      AND agreement.agreement_family = p_payload->>'agreement_family'
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AGREEMENT_NOT_AUTHORIZED';
    END IF;
  ELSE
    SELECT agreement.* INTO agreement_row
    FROM public.billing_agreements AS agreement
    WHERE agreement.organization_id = organization_id_value
      AND agreement.account_id = account_id_value
      AND agreement.agreement_family = p_payload->>'agreement_family'
    FOR UPDATE;
    IF NOT FOUND THEN
      INSERT INTO public.billing_agreements (
        organization_id, account_id, agreement_family, created_by
      ) VALUES (
        organization_id_value, account_id_value, p_payload->>'agreement_family',
        (SELECT auth.uid())
      ) RETURNING * INTO agreement_row;
    END IF;
    agreement_id_value := agreement_row.id;
  END IF;

  IF p_payload ? 'version_id' THEN
    version_id_value := (p_payload->>'version_id')::uuid;
    SELECT version.* INTO version_row
    FROM public.billing_agreement_versions AS version
    WHERE version.id = version_id_value
      AND version.agreement_id = agreement_id_value
      AND version.organization_id = organization_id_value
      AND version.account_id = account_id_value
      AND version.state = 'draft'
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AGREEMENT_NOT_AUTHORIZED';
    END IF;
    UPDATE public.billing_agreement_versions
    SET effective_start = effective_start_value,
        effective_end = effective_end_value,
        formula_kind = p_payload->>'formula_kind',
        fixed_amount_minor = fixed_amount_value,
        minimum_amount_minor = minimum_amount_value,
        rate_numerator = rate_numerator_value,
        rate_denominator = rate_denominator_value,
        submitted_percentage = submitted_percentage_value,
        signed_evidence_id = evidence_row.id,
        signed_evidence_sha256 = evidence_row.sha256,
        terms_fingerprint = request_fingerprint_value,
        authored_by = (SELECT auth.uid()),
        authored_by_role = actor_role_value
    WHERE id = version_id_value
    RETURNING * INTO version_row;
    DELETE FROM public.billing_agreement_revenue_rules
    WHERE agreement_version_id = version_id_value;
  ELSE
    SELECT COALESCE(pg_catalog.max(version.version_number), 0) + 1
    INTO next_version
    FROM public.billing_agreement_versions AS version
    WHERE version.agreement_id = agreement_id_value;
    INSERT INTO public.billing_agreement_versions (
      organization_id, account_id, agreement_id, version_number,
      effective_start, effective_end, formula_kind, fixed_amount_minor,
      minimum_amount_minor, rate_numerator, rate_denominator,
      submitted_percentage, signed_evidence_id, signed_evidence_sha256,
      terms_fingerprint, authored_by, authored_by_role
    ) VALUES (
      organization_id_value, account_id_value, agreement_id_value, next_version,
      effective_start_value, effective_end_value, p_payload->>'formula_kind',
      fixed_amount_value, minimum_amount_value, rate_numerator_value,
      rate_denominator_value, submitted_percentage_value, evidence_row.id,
      evidence_row.sha256, request_fingerprint_value, (SELECT auth.uid()),
      actor_role_value
    ) RETURNING * INTO version_row;
  END IF;

  INSERT INTO public.billing_agreement_revenue_rules (
    agreement_version_id, organization_id, account_id, timezone, timing_basis,
    included_amounts, excluded_amounts, tax_treatment,
    refund_chargeback_policy, cutoff_day, dispute_policy,
    missing_report_policy, true_up_policy, evidence_priority
  ) VALUES (
    version_row.id, organization_id_value, account_id_value,
    p_payload->>'timezone', p_payload->>'timing_basis',
    p_payload->'included_amounts', p_payload->'excluded_amounts',
    p_payload->>'tax_treatment', p_payload->>'refund_chargeback_policy',
    (p_payload->>'cutoff_day')::smallint, p_payload->>'dispute_policy',
    p_payload->>'missing_report_policy', p_payload->>'true_up_policy',
    p_payload->'evidence_priority'
  );

  response_value := pg_catalog.jsonb_build_object(
    'result', CASE WHEN p_payload ? 'version_id' THEN 'updated' ELSE 'created' END,
    'agreement_id', version_row.agreement_id,
    'version_id', version_row.id,
    'version_number', version_row.version_number,
    'state', version_row.state,
    'currency', version_row.currency,
    'terms_fingerprint', version_row.terms_fingerprint
  );
  PERFORM private.billing_record_agreement_event(
    version_row, 'draft_saved', actor_role_value, 'Agreement draft saved',
    p_payload->>'command_key', request_fingerprint_value, response_value
  );
  RETURN response_value;
END;
$function$;

CREATE FUNCTION private.billing_transition_agreement_version(
  p_payload jsonb,
  p_event_type text,
  p_capability text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  payload_keys text[];
  version_row public.billing_agreement_versions%ROWTYPE;
  evidence_row public.billing_evidence_objects%ROWTYPE;
  actor_role_value text;
  request_fingerprint_value text;
  replay_value jsonb;
  response_value jsonb;
  latest_event text;
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR pg_catalog.jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AGREEMENT_NOT_AUTHORIZED';
  END IF;
  SELECT COALESCE(pg_catalog.array_agg(key ORDER BY key), ARRAY[]::text[])
  INTO payload_keys FROM pg_catalog.jsonb_object_keys(p_payload) AS keys(key);
  IF payload_keys IS DISTINCT FROM ARRAY['command_key', 'reason', 'version_id']::text[]
    OR pg_catalog.jsonb_typeof(p_payload->'version_id') IS DISTINCT FROM 'string'
    OR (p_payload->>'version_id') !~ '^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR pg_catalog.jsonb_typeof(p_payload->'command_key') IS DISTINCT FROM 'string'
    OR (p_payload->>'command_key') !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$'
    OR pg_catalog.jsonb_typeof(p_payload->'reason') IS DISTINCT FROM 'string'
    OR NULLIF(pg_catalog.btrim(p_payload->>'reason'), '') IS NULL
    OR pg_catalog.octet_length(p_payload->>'reason') > 1000
    OR p_event_type NOT IN ('submitted', 'activated', 'paused', 'terminated')
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AGREEMENT_INVALID_REQUEST';
  END IF;

  request_fingerprint_value := private.billing_agreement_request_fingerprint(p_event_type, p_payload);
  replay_value := private.billing_agreement_replay(
    p_payload->>'command_key', request_fingerprint_value
  );
  IF replay_value IS NOT NULL THEN RETURN replay_value; END IF;

  SELECT version.* INTO version_row
  FROM public.billing_agreement_versions AS version
  WHERE version.id = (p_payload->>'version_id')::uuid
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AGREEMENT_NOT_AUTHORIZED';
  END IF;
  actor_role_value := private.billing_agreement_actor_role(
    version_row.organization_id, version_row.account_id, p_capability
  );
  IF actor_role_value IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AGREEMENT_NOT_AUTHORIZED';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(version_row.account_id::text || ':' || version_row.agreement_id::text, 0)
  );

  IF p_event_type = 'submitted' THEN
    IF version_row.state <> 'draft' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AGREEMENT_LIFECYCLE_INVALID';
    END IF;
    UPDATE public.billing_agreement_versions
    SET state = 'submitted', submitted_by = (SELECT auth.uid()),
        submitted_by_role = actor_role_value, submitted_at = pg_catalog.now()
    WHERE id = version_row.id
    RETURNING * INTO version_row;
  ELSIF p_event_type = 'activated' THEN
    IF version_row.state <> 'submitted'
      OR extract(day FROM version_row.effective_start) <> 1
      OR extract(day FROM version_row.effective_end) <> 1
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AGREEMENT_LIFECYCLE_INVALID';
    END IF;
    SELECT evidence.* INTO evidence_row
    FROM public.billing_evidence_objects AS evidence
    WHERE evidence.id = version_row.signed_evidence_id
      AND evidence.organization_id = version_row.organization_id
      AND evidence.account_id = version_row.account_id
      AND evidence.kind = 'contract'
      AND evidence.sha256 = version_row.signed_evidence_sha256
      AND evidence.inspection_status = 'clean'
      AND evidence.lifecycle_status = 'active'
      AND evidence.retention_expires_at > pg_catalog.now()
      AND NOT (evidence.hold_started_at IS NOT NULL AND evidence.hold_released_at IS NULL)
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AGREEMENT_SIGNED_EVIDENCE_INVALID';
    END IF;
    BEGIN
      UPDATE public.billing_agreement_versions
      SET state = 'active', approved_by = (SELECT auth.uid()),
          approved_by_role = actor_role_value, approved_at = pg_catalog.now(),
          self_approved = authored_by = (SELECT auth.uid())
      WHERE id = version_row.id
      RETURNING * INTO version_row;
    EXCEPTION
      WHEN exclusion_violation OR unique_violation THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AGREEMENT_EFFECTIVE_RANGE_CONFLICT';
    END;
  ELSE
    IF version_row.state <> 'active' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AGREEMENT_LIFECYCLE_INVALID';
    END IF;
    SELECT event.event_type INTO latest_event
    FROM public.billing_agreement_events AS event
    WHERE event.agreement_version_id = version_row.id
    ORDER BY event.id DESC LIMIT 1;
    IF latest_event = 'terminated'
      OR (p_event_type = 'paused' AND latest_event = 'paused')
    THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AGREEMENT_LIFECYCLE_INVALID';
    END IF;
  END IF;

  response_value := pg_catalog.jsonb_build_object(
    'result', p_event_type,
    'agreement_id', version_row.agreement_id,
    'version_id', version_row.id,
    'version_number', version_row.version_number,
    'state', version_row.state,
    'self_approved', version_row.self_approved,
    'terms_fingerprint', version_row.terms_fingerprint
  );
  PERFORM private.billing_record_agreement_event(
    version_row, p_event_type, actor_role_value, pg_catalog.btrim(p_payload->>'reason'),
    p_payload->>'command_key', request_fingerprint_value, response_value
  );
  RETURN response_value;
END;
$function$;

CREATE FUNCTION public.submit_billing_agreement_version(p_payload jsonb)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $function$
  SELECT private.billing_transition_agreement_version(p_payload, 'submitted', 'agreement.manage');
$function$;

CREATE FUNCTION public.activate_billing_agreement_version(p_payload jsonb)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $function$
  SELECT private.billing_transition_agreement_version(p_payload, 'activated', 'agreement.approve');
$function$;

CREATE FUNCTION public.pause_billing_agreement_version(p_payload jsonb)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $function$
  SELECT private.billing_transition_agreement_version(p_payload, 'paused', 'agreement.approve');
$function$;

CREATE FUNCTION public.terminate_billing_agreement_version(p_payload jsonb)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $function$
  SELECT private.billing_transition_agreement_version(p_payload, 'terminated', 'agreement.approve');
$function$;

CREATE FUNCTION public.read_billing_agreements(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  account_id_value uuid;
  organization_id_value uuid;
  data_value jsonb;
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR pg_catalog.jsonb_typeof(p_request) IS DISTINCT FROM 'object'
    OR (
      SELECT COALESCE(pg_catalog.array_agg(key ORDER BY key), ARRAY[]::text[])
      FROM pg_catalog.jsonb_object_keys(p_request) AS keys(key)
    ) IS DISTINCT FROM ARRAY['account_id']::text[]
    OR pg_catalog.jsonb_typeof(p_request->'account_id') IS DISTINCT FROM 'string'
    OR (p_request->>'account_id') !~ '^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AGREEMENT_READ_NOT_AUTHORIZED';
  END IF;
  account_id_value := (p_request->>'account_id')::uuid;
  SELECT account.organization_id INTO organization_id_value
  FROM public.billing_accounts AS account
  WHERE account.id = account_id_value;
  IF organization_id_value IS NULL OR NOT private.billing_has_capability(
    organization_id_value, account_id_value, 'agreement.read'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AGREEMENT_READ_NOT_AUTHORIZED';
  END IF;

  SELECT COALESCE(pg_catalog.jsonb_agg(row_value ORDER BY agreement_family, version_number DESC), '[]'::jsonb)
  INTO data_value
  FROM (
    SELECT
      agreement.agreement_family,
      version.version_number,
      pg_catalog.jsonb_build_object(
        'agreement_id', agreement.id,
        'version_id', version.id,
        'agreement_family', agreement.agreement_family,
        'cadence', agreement.cadence,
        'state', version.state,
        'latest_event', (
          SELECT event.event_type FROM public.billing_agreement_events AS event
          WHERE event.agreement_version_id = version.id
          ORDER BY event.id DESC LIMIT 1
        ),
        'version_number', version.version_number,
        'effective_start', version.effective_start,
        'effective_end', version.effective_end,
        'formula_kind', version.formula_kind,
        'fixed_amount_minor', CASE WHEN version.fixed_amount_minor IS NULL THEN NULL ELSE version.fixed_amount_minor::text END,
        'minimum_amount_minor', CASE WHEN version.minimum_amount_minor IS NULL THEN NULL ELSE version.minimum_amount_minor::text END,
        'rate_numerator', CASE WHEN version.rate_numerator IS NULL THEN NULL ELSE version.rate_numerator::text END,
        'rate_denominator', CASE WHEN version.rate_denominator IS NULL THEN NULL ELSE version.rate_denominator::text END,
        'submitted_percentage', version.submitted_percentage,
        'currency', version.currency,
        'currency_policy_version', version.currency_policy_version,
        'rate_policy_version', version.rate_policy_version,
        'rounding_policy_version', version.rounding_policy_version,
        'formula_version', version.formula_version,
        'explanation_version', version.explanation_version,
        'signed_evidence_id', version.signed_evidence_id,
        'signed_evidence_sha256', version.signed_evidence_sha256,
        'terms_fingerprint', version.terms_fingerprint,
        'self_approved', version.self_approved,
        'rules', pg_catalog.jsonb_build_object(
          'timezone', rule.timezone,
          'timing_basis', rule.timing_basis,
          'included_amounts', rule.included_amounts,
          'excluded_amounts', rule.excluded_amounts,
          'tax_treatment', rule.tax_treatment,
          'refund_chargeback_policy', rule.refund_chargeback_policy,
          'cutoff_day', rule.cutoff_day,
          'dispute_policy', rule.dispute_policy,
          'missing_report_policy', rule.missing_report_policy,
          'true_up_policy', rule.true_up_policy,
          'evidence_priority', rule.evidence_priority
        )
      ) AS row_value
    FROM public.billing_agreements AS agreement
    JOIN public.billing_agreement_versions AS version ON version.agreement_id = agreement.id
    JOIN public.billing_agreement_revenue_rules AS rule ON rule.agreement_version_id = version.id
    WHERE agreement.organization_id = organization_id_value
      AND agreement.account_id = account_id_value
  ) AS rows;
  RETURN pg_catalog.jsonb_build_object('data', data_value);
END;
$function$;

ALTER TABLE public.billing_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_agreements FORCE ROW LEVEL SECURITY;
ALTER TABLE public.billing_agreement_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_agreement_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.billing_agreement_revenue_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_agreement_revenue_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE public.billing_agreement_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_agreement_events FORCE ROW LEVEL SECURITY;

CREATE POLICY billing_agreements_select ON public.billing_agreements
FOR SELECT TO authenticated
USING (private.billing_has_capability(organization_id, account_id, 'agreement.read'));
CREATE POLICY billing_agreement_versions_select ON public.billing_agreement_versions
FOR SELECT TO authenticated
USING (private.billing_has_capability(organization_id, account_id, 'agreement.read'));
CREATE POLICY billing_agreement_rules_select ON public.billing_agreement_revenue_rules
FOR SELECT TO authenticated
USING (private.billing_has_capability(organization_id, account_id, 'agreement.read'));
CREATE POLICY billing_agreement_events_select ON public.billing_agreement_events
FOR SELECT TO authenticated
USING (private.billing_has_capability(organization_id, account_id, 'agreement.read'));

ALTER FUNCTION private.billing_agreement_identity_immutable() OWNER TO postgres;
ALTER FUNCTION private.billing_agreement_version_protect() OWNER TO postgres;
ALTER FUNCTION private.billing_agreement_rule_protect() OWNER TO postgres;
ALTER FUNCTION private.billing_agreement_event_immutable() OWNER TO postgres;
ALTER FUNCTION private.billing_agreement_request_fingerprint(text, jsonb) OWNER TO postgres;
ALTER FUNCTION private.billing_agreement_replay(text, text) OWNER TO postgres;
ALTER FUNCTION private.billing_agreement_actor_role(uuid, uuid, text) OWNER TO postgres;
ALTER FUNCTION private.billing_record_agreement_event(public.billing_agreement_versions, text, text, text, text, text, jsonb) OWNER TO postgres;
ALTER FUNCTION private.billing_transition_agreement_version(jsonb, text, text) OWNER TO postgres;
ALTER FUNCTION public.save_billing_agreement_draft(jsonb) OWNER TO postgres;
ALTER FUNCTION public.submit_billing_agreement_version(jsonb) OWNER TO postgres;
ALTER FUNCTION public.activate_billing_agreement_version(jsonb) OWNER TO postgres;
ALTER FUNCTION public.pause_billing_agreement_version(jsonb) OWNER TO postgres;
ALTER FUNCTION public.terminate_billing_agreement_version(jsonb) OWNER TO postgres;
ALTER FUNCTION public.read_billing_agreements(jsonb) OWNER TO postgres;

REVOKE ALL ON FUNCTION private.billing_agreement_identity_immutable() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_agreement_version_protect() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_agreement_rule_protect() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_agreement_event_immutable() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_agreement_request_fingerprint(text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_agreement_replay(text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_agreement_actor_role(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_record_agreement_event(public.billing_agreement_versions, text, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_transition_agreement_version(jsonb, text, text) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.save_billing_agreement_draft(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_billing_agreement_version(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.activate_billing_agreement_version(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pause_billing_agreement_version(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.terminate_billing_agreement_version(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.read_billing_agreements(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_billing_agreement_draft(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_billing_agreement_version(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_billing_agreement_version(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pause_billing_agreement_version(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.terminate_billing_agreement_version(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.read_billing_agreements(jsonb) TO authenticated;

REVOKE ALL ON TABLE public.billing_agreements,
  public.billing_agreement_versions,
  public.billing_agreement_revenue_rules,
  public.billing_agreement_events
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.billing_agreements,
  public.billing_agreement_versions,
  public.billing_agreement_revenue_rules,
  public.billing_agreement_events
  TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.billing_agreement_events_id_seq TO service_role;

COMMIT;
