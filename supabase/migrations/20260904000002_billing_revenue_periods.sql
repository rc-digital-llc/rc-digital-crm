-- Phase 4: immutable monthly revenue periods and exact submission revisions.

BEGIN;

INSERT INTO public.billing_role_capabilities (role, capability)
VALUES
  ('administrator', 'revenue.read'),
  ('administrator', 'revenue.submit'),
  ('administrator', 'revenue.review'),
  ('operator', 'revenue.read'),
  ('operator', 'revenue.submit'),
  ('reviewer', 'revenue.read'),
  ('reviewer', 'revenue.review')
ON CONFLICT DO NOTHING;

CREATE TABLE public.billing_revenue_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  account_id uuid NOT NULL,
  agreement_id uuid NOT NULL,
  agreement_version_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  timezone text NOT NULL,
  submission_deadline_at timestamptz NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_by_role text NOT NULL REFERENCES public.billing_roles(role),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT billing_revenue_periods_version_scope_fk
    FOREIGN KEY (agreement_version_id, organization_id, account_id)
    REFERENCES public.billing_agreement_versions(id, organization_id, account_id)
    ON DELETE RESTRICT,
  CONSTRAINT billing_revenue_periods_account_scope_fk
    FOREIGN KEY (account_id, organization_id)
    REFERENCES public.billing_accounts(id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT billing_revenue_periods_scope_unique
    UNIQUE (id, organization_id, account_id),
  CONSTRAINT billing_revenue_periods_business_key_unique
    UNIQUE (
      organization_id, account_id, agreement_id, agreement_version_id,
      period_start, timezone
    ),
  CONSTRAINT billing_revenue_periods_month_check CHECK (
    period_end = (period_start + interval '1 month')::date
    AND extract(day FROM period_start) = 1
    AND submission_deadline_at > period_end::timestamptz
  )
);

CREATE INDEX billing_revenue_periods_scope_start_idx
  ON public.billing_revenue_periods (
    organization_id, account_id, period_start DESC, id
  );

CREATE TABLE public.billing_revenue_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  account_id uuid NOT NULL,
  period_id uuid NOT NULL,
  revision_number integer NOT NULL CHECK (revision_number > 0),
  previous_submission_id uuid,
  gross_amount_minor bigint NOT NULL CHECK (gross_amount_minor >= 0),
  excluded_amount_minor bigint NOT NULL CHECK (excluded_amount_minor >= 0),
  commissionable_amount_minor bigint NOT NULL CHECK (commissionable_amount_minor >= 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  currency_policy_version text NOT NULL DEFAULT 'usd-v1'
    REFERENCES public.financial_currency_policies(policy_version),
  provenance_kind text NOT NULL CHECK (provenance_kind IN ('api', 'statement', 'portal')),
  provenance_source_id text NOT NULL CHECK (
    pg_catalog.btrim(provenance_source_id) <> ''
    AND pg_catalog.octet_length(provenance_source_id) <= 500
  ),
  submitter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  submitter_role text NOT NULL REFERENCES public.billing_roles(role),
  attested_accurate boolean NOT NULL CHECK (attested_accurate),
  attestation_text text NOT NULL CHECK (
    pg_catalog.btrim(attestation_text) <> ''
    AND pg_catalog.octet_length(attestation_text) <= 1000
  ),
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  submitted_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT billing_revenue_submissions_period_scope_fk
    FOREIGN KEY (period_id, organization_id, account_id)
    REFERENCES public.billing_revenue_periods(id, organization_id, account_id)
    ON DELETE RESTRICT,
  CONSTRAINT billing_revenue_submissions_previous_fk
    FOREIGN KEY (previous_submission_id)
    REFERENCES public.billing_revenue_submissions(id)
    ON DELETE RESTRICT,
  CONSTRAINT billing_revenue_submissions_scope_unique
    UNIQUE (id, organization_id, account_id),
  CONSTRAINT billing_revenue_submissions_revision_unique
    UNIQUE (period_id, revision_number),
  CONSTRAINT billing_revenue_submissions_reconciliation_check CHECK (
    gross_amount_minor - excluded_amount_minor = commissionable_amount_minor
    AND excluded_amount_minor <= gross_amount_minor
  )
);

CREATE INDEX billing_revenue_submissions_period_revision_idx
  ON public.billing_revenue_submissions (period_id, revision_number DESC);

CREATE TABLE public.billing_revenue_submission_evidence (
  submission_id uuid NOT NULL,
  evidence_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  account_id uuid NOT NULL,
  evidence_ordinal smallint NOT NULL CHECK (evidence_ordinal BETWEEN 1 AND 100),
  captured_sha256 text NOT NULL CHECK (captured_sha256 ~ '^[0-9a-f]{64}$'),
  linked_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  PRIMARY KEY (submission_id, evidence_id),
  CONSTRAINT billing_revenue_submission_evidence_submission_scope_fk
    FOREIGN KEY (submission_id, organization_id, account_id)
    REFERENCES public.billing_revenue_submissions(id, organization_id, account_id)
    ON DELETE RESTRICT,
  CONSTRAINT billing_revenue_submission_evidence_object_scope_fk
    FOREIGN KEY (evidence_id, organization_id, account_id)
    REFERENCES public.billing_evidence_objects(id, organization_id, account_id)
    ON DELETE RESTRICT,
  CONSTRAINT billing_revenue_submission_evidence_order_unique
    UNIQUE (submission_id, evidence_ordinal)
);

CREATE TABLE public.billing_revenue_command_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL,
  account_id uuid NOT NULL,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  actor_role text NOT NULL REFERENCES public.billing_roles(role),
  action text NOT NULL CHECK (
    action IN ('period.ensure', 'revision.submit', 'revision.review', 'period.close')
  ),
  command_key text NOT NULL CHECK (
    command_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$'
  ),
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  period_id uuid,
  submission_id uuid,
  response_snapshot jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(response_snapshot) = 'object'),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT billing_revenue_command_events_account_scope_fk
    FOREIGN KEY (account_id, organization_id)
    REFERENCES public.billing_accounts(id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT billing_revenue_command_events_period_scope_fk
    FOREIGN KEY (period_id, organization_id, account_id)
    REFERENCES public.billing_revenue_periods(id, organization_id, account_id)
    ON DELETE RESTRICT,
  CONSTRAINT billing_revenue_command_events_submission_scope_fk
    FOREIGN KEY (submission_id, organization_id, account_id)
    REFERENCES public.billing_revenue_submissions(id, organization_id, account_id)
    ON DELETE RESTRICT,
  CONSTRAINT billing_revenue_command_events_actor_key_unique
    UNIQUE (actor_id, command_key)
);

CREATE INDEX billing_revenue_command_events_scope_created_idx
  ON public.billing_revenue_command_events (
    organization_id, account_id, created_at DESC, id DESC
  );

CREATE FUNCTION private.billing_revenue_row_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE =
    CASE TG_TABLE_NAME
      WHEN 'billing_revenue_periods' THEN 'REVENUE_PERIOD_IMMUTABLE'
      WHEN 'billing_revenue_submissions' THEN 'REVENUE_SUBMISSION_IMMUTABLE'
      WHEN 'billing_revenue_submission_evidence' THEN 'REVENUE_EVIDENCE_LINK_IMMUTABLE'
      ELSE 'REVENUE_COMMAND_EVENT_IMMUTABLE'
    END;
END;
$function$;

CREATE TRIGGER billing_revenue_periods_immutable
BEFORE UPDATE OR DELETE ON public.billing_revenue_periods
FOR EACH ROW EXECUTE FUNCTION private.billing_revenue_row_immutable();

CREATE TRIGGER billing_revenue_submissions_immutable
BEFORE UPDATE OR DELETE ON public.billing_revenue_submissions
FOR EACH ROW EXECUTE FUNCTION private.billing_revenue_row_immutable();

CREATE TRIGGER billing_revenue_submission_evidence_immutable
BEFORE UPDATE OR DELETE ON public.billing_revenue_submission_evidence
FOR EACH ROW EXECUTE FUNCTION private.billing_revenue_row_immutable();

CREATE TRIGGER billing_revenue_command_events_immutable
BEFORE UPDATE OR DELETE ON public.billing_revenue_command_events
FOR EACH ROW EXECUTE FUNCTION private.billing_revenue_row_immutable();

CREATE FUNCTION private.billing_revenue_request_fingerprint(
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

CREATE FUNCTION private.billing_revenue_replay(
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
  event_row public.billing_revenue_command_events%ROWTYPE;
BEGIN
  SELECT event.* INTO event_row
  FROM public.billing_revenue_command_events AS event
  WHERE event.actor_id = (SELECT auth.uid())
    AND event.command_key = p_command_key;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF event_row.request_fingerprint IS DISTINCT FROM p_request_fingerprint THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'REVENUE_IDEMPOTENCY_CONFLICT';
  END IF;
  RETURN event_row.response_snapshot;
END;
$function$;

CREATE FUNCTION private.billing_record_revenue_command(
  p_organization_id uuid,
  p_account_id uuid,
  p_actor_role text,
  p_action text,
  p_command_key text,
  p_request_fingerprint text,
  p_period_id uuid,
  p_submission_id uuid,
  p_response jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  INSERT INTO public.billing_revenue_command_events (
    organization_id, account_id, actor_id, actor_role, action, command_key,
    request_fingerprint, period_id, submission_id, response_snapshot
  ) VALUES (
    p_organization_id, p_account_id, (SELECT auth.uid()), p_actor_role, p_action,
    p_command_key, p_request_fingerprint, p_period_id, p_submission_id, p_response
  );

  INSERT INTO public.billing_audit_events (
    actor_type, actor_id, organization_id, account_id, action,
    subject_type, subject_id, result, reason, details
  ) VALUES (
    'human', (SELECT auth.uid()), p_organization_id, p_account_id,
    'revenue.' || p_action,
    CASE WHEN p_submission_id IS NULL
      THEN 'billing_revenue_periods' ELSE 'billing_revenue_submissions' END,
    COALESCE(p_submission_id, p_period_id)::text,
    'succeeded', NULL,
    pg_catalog.jsonb_build_object('request_fingerprint', p_request_fingerprint)
  );
END;
$function$;

CREATE FUNCTION public.ensure_billing_revenue_period(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  payload_keys text[];
  account_id_value uuid;
  agreement_version_id_value uuid;
  agreement_row public.billing_agreement_versions%ROWTYPE;
  rule_row public.billing_agreement_revenue_rules%ROWTYPE;
  period_row public.billing_revenue_periods%ROWTYPE;
  actor_role_value text;
  period_start_value date;
  period_end_value date;
  deadline_value timestamptz;
  fingerprint_value text;
  replay_value jsonb;
  response_value jsonb;
  inserted_value boolean := false;
  latest_event_value text;
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR pg_catalog.jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'REVENUE_NOT_AUTHORIZED';
  END IF;
  SELECT COALESCE(pg_catalog.array_agg(key ORDER BY key), ARRAY[]::text[])
  INTO payload_keys
  FROM pg_catalog.jsonb_object_keys(p_payload) AS keys(key);
  IF payload_keys IS DISTINCT FROM ARRAY[
      'account_id', 'agreement_version_id', 'command_key', 'period_month'
    ]::text[]
    OR pg_catalog.jsonb_typeof(p_payload->'account_id') IS DISTINCT FROM 'string'
    OR (p_payload->>'account_id') !~ '^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR pg_catalog.jsonb_typeof(p_payload->'agreement_version_id') IS DISTINCT FROM 'string'
    OR (p_payload->>'agreement_version_id') !~ '^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR pg_catalog.jsonb_typeof(p_payload->'period_month') IS DISTINCT FROM 'string'
    OR (p_payload->>'period_month') !~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
    OR pg_catalog.jsonb_typeof(p_payload->'command_key') IS DISTINCT FROM 'string'
    OR (p_payload->>'command_key') !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'REVENUE_INVALID_REQUEST';
  END IF;

  fingerprint_value := private.billing_revenue_request_fingerprint('period.ensure', p_payload);
  replay_value := private.billing_revenue_replay(p_payload->>'command_key', fingerprint_value);
  IF replay_value IS NOT NULL THEN RETURN replay_value; END IF;

  account_id_value := (p_payload->>'account_id')::uuid;
  agreement_version_id_value := (p_payload->>'agreement_version_id')::uuid;
  SELECT version.* INTO agreement_row
  FROM public.billing_agreement_versions AS version
  WHERE version.id = agreement_version_id_value
    AND version.account_id = account_id_value
    AND version.state = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'REVENUE_NOT_AUTHORIZED';
  END IF;
  SELECT rule.* INTO STRICT rule_row
  FROM public.billing_agreement_revenue_rules AS rule
  WHERE rule.agreement_version_id = agreement_row.id;
  actor_role_value := private.billing_agreement_actor_role(
    agreement_row.organization_id, account_id_value, 'revenue.submit'
  );
  IF actor_role_value IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'REVENUE_NOT_AUTHORIZED';
  END IF;

  SELECT event.event_type INTO latest_event_value
  FROM public.billing_agreement_events AS event
  WHERE event.agreement_version_id = agreement_row.id
  ORDER BY event.id DESC LIMIT 1;
  IF latest_event_value IN ('paused', 'terminated') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'REVENUE_AGREEMENT_INACTIVE';
  END IF;

  period_start_value := ((p_payload->>'period_month') || '-01')::date;
  period_end_value := (period_start_value + interval '1 month')::date;
  IF period_start_value < agreement_row.effective_start
    OR period_end_value > agreement_row.effective_end
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'REVENUE_PERIOD_OUTSIDE_AGREEMENT';
  END IF;
  deadline_value := (
    period_end_value + (rule_row.cutoff_day::integer - 1)
  )::timestamp AT TIME ZONE rule_row.timezone;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      agreement_row.organization_id::text || ':' || account_id_value::text || ':' ||
      agreement_row.id::text || ':' || period_start_value::text || ':' || rule_row.timezone,
      0
    )
  );
  INSERT INTO public.billing_revenue_periods (
    organization_id, account_id, agreement_id, agreement_version_id,
    period_start, period_end, timezone, submission_deadline_at,
    created_by, created_by_role
  ) VALUES (
    agreement_row.organization_id, account_id_value, agreement_row.agreement_id,
    agreement_row.id, period_start_value, period_end_value, rule_row.timezone,
    deadline_value, (SELECT auth.uid()), actor_role_value
  )
  ON CONFLICT (
    organization_id, account_id, agreement_id, agreement_version_id,
    period_start, timezone
  ) DO NOTHING
  RETURNING * INTO period_row;
  IF FOUND THEN
    inserted_value := true;
  ELSE
    SELECT period.* INTO STRICT period_row
    FROM public.billing_revenue_periods AS period
    WHERE period.organization_id = agreement_row.organization_id
      AND period.account_id = account_id_value
      AND period.agreement_id = agreement_row.agreement_id
      AND period.agreement_version_id = agreement_row.id
      AND period.period_start = period_start_value
      AND period.timezone = rule_row.timezone;
  END IF;

  response_value := pg_catalog.jsonb_build_object(
    'result', CASE WHEN inserted_value THEN 'created' ELSE 'existing' END,
    'period_id', period_row.id,
    'agreement_id', period_row.agreement_id,
    'agreement_version_id', period_row.agreement_version_id,
    'period_start', period_row.period_start,
    'period_end', period_row.period_end,
    'timezone', period_row.timezone,
    'submission_deadline_at', period_row.submission_deadline_at
  );
  PERFORM private.billing_record_revenue_command(
    period_row.organization_id, period_row.account_id, actor_role_value,
    'period.ensure', p_payload->>'command_key', fingerprint_value,
    period_row.id, NULL, response_value
  );
  RETURN response_value;
END;
$function$;

CREATE FUNCTION public.submit_billing_revenue_revision(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  payload_keys text[];
  period_row public.billing_revenue_periods%ROWTYPE;
  submission_row public.billing_revenue_submissions%ROWTYPE;
  previous_submission_value uuid;
  actor_role_value text;
  fingerprint_value text;
  replay_value jsonb;
  response_value jsonb;
  gross_value bigint;
  excluded_value bigint;
  commissionable_value bigint;
  evidence_count integer;
  linked_count integer;
  next_revision integer;
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR pg_catalog.jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'REVENUE_NOT_AUTHORIZED';
  END IF;
  SELECT COALESCE(pg_catalog.array_agg(key ORDER BY key), ARRAY[]::text[])
  INTO payload_keys
  FROM pg_catalog.jsonb_object_keys(p_payload) AS keys(key);
  IF payload_keys IS DISTINCT FROM ARRAY[
      'account_id', 'attestation', 'command_key', 'commissionable_amount',
      'evidence_ids', 'excluded_amount', 'gross_amount', 'period_id',
      'provenance_kind', 'provenance_source_id'
    ]::text[]
    OR pg_catalog.jsonb_typeof(p_payload->'account_id') IS DISTINCT FROM 'string'
    OR (p_payload->>'account_id') !~ '^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR pg_catalog.jsonb_typeof(p_payload->'period_id') IS DISTINCT FROM 'string'
    OR (p_payload->>'period_id') !~ '^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR pg_catalog.jsonb_typeof(p_payload->'command_key') IS DISTINCT FROM 'string'
    OR (p_payload->>'command_key') !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$'
    OR p_payload->>'provenance_kind' NOT IN ('api', 'statement', 'portal')
    OR pg_catalog.jsonb_typeof(p_payload->'provenance_source_id') IS DISTINCT FROM 'string'
    OR NULLIF(pg_catalog.btrim(p_payload->>'provenance_source_id'), '') IS NULL
    OR pg_catalog.octet_length(p_payload->>'provenance_source_id') > 500
    OR pg_catalog.jsonb_typeof(p_payload->'attestation') IS DISTINCT FROM 'object'
    OR (
      SELECT COALESCE(pg_catalog.array_agg(key ORDER BY key), ARRAY[]::text[])
      FROM pg_catalog.jsonb_object_keys(p_payload->'attestation') AS keys(key)
    ) IS DISTINCT FROM ARRAY['accurate', 'text']::text[]
    OR pg_catalog.jsonb_typeof(p_payload->'attestation'->'accurate') IS DISTINCT FROM 'boolean'
    OR (p_payload->'attestation'->>'accurate')::boolean IS NOT TRUE
    OR pg_catalog.jsonb_typeof(p_payload->'attestation'->'text') IS DISTINCT FROM 'string'
    OR NULLIF(pg_catalog.btrim(p_payload->'attestation'->>'text'), '') IS NULL
    OR pg_catalog.octet_length(p_payload->'attestation'->>'text') > 1000
    OR pg_catalog.jsonb_typeof(p_payload->'evidence_ids') IS DISTINCT FROM 'array'
    OR pg_catalog.jsonb_array_length(p_payload->'evidence_ids') NOT BETWEEN 1 AND 100
    OR EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_array_elements(p_payload->'evidence_ids') AS item(value)
      WHERE pg_catalog.jsonb_typeof(item.value) IS DISTINCT FROM 'string'
        OR (item.value #>> '{}') !~ '^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    )
    OR (
      SELECT count(*) <> count(DISTINCT item.value)
      FROM pg_catalog.jsonb_array_elements_text(p_payload->'evidence_ids') AS item(value)
    )
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'REVENUE_INVALID_REQUEST';
  END IF;

  fingerprint_value := private.billing_revenue_request_fingerprint('revision.submit', p_payload);
  replay_value := private.billing_revenue_replay(p_payload->>'command_key', fingerprint_value);
  IF replay_value IS NOT NULL THEN RETURN replay_value; END IF;

  SELECT period.* INTO period_row
  FROM public.billing_revenue_periods AS period
  WHERE period.id = (p_payload->>'period_id')::uuid
    AND period.account_id = (p_payload->>'account_id')::uuid
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'REVENUE_NOT_AUTHORIZED';
  END IF;
  actor_role_value := private.billing_agreement_actor_role(
    period_row.organization_id, period_row.account_id, 'revenue.submit'
  );
  IF actor_role_value IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'REVENUE_NOT_AUTHORIZED';
  END IF;

  BEGIN
    gross_value := (
      public.financial_parse_usd_money(p_payload->'gross_amount', 'usd-v1')->>'amount_minor'
    )::bigint;
    excluded_value := (
      public.financial_parse_usd_money(p_payload->'excluded_amount', 'usd-v1')->>'amount_minor'
    )::bigint;
    commissionable_value := (
      public.financial_parse_usd_money(p_payload->'commissionable_amount', 'usd-v1')->>'amount_minor'
    )::bigint;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'REVENUE_AMOUNT_INVALID';
  END;
  IF gross_value < 0 OR excluded_value < 0 OR commissionable_value < 0
    OR excluded_value > gross_value
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'REVENUE_AMOUNT_INVALID';
  END IF;
  IF gross_value - excluded_value <> commissionable_value THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'REVENUE_AMOUNT_MISMATCH';
  END IF;

  SELECT count(*) INTO evidence_count
  FROM pg_catalog.jsonb_array_elements_text(p_payload->'evidence_ids');
  SELECT count(*) INTO linked_count
  FROM pg_catalog.jsonb_array_elements_text(p_payload->'evidence_ids') WITH ORDINALITY AS requested(id, ordinal)
  JOIN public.billing_evidence_objects AS evidence
    ON evidence.id = requested.id::uuid
    AND evidence.organization_id = period_row.organization_id
    AND evidence.account_id = period_row.account_id
    AND evidence.kind = 'revenue_statement'
    AND evidence.inspection_status = 'clean'
    AND evidence.lifecycle_status = 'active'
    AND evidence.retention_expires_at > pg_catalog.now()
    AND NOT (
      evidence.hold_started_at IS NOT NULL AND evidence.hold_released_at IS NULL
    );
  IF linked_count <> evidence_count THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'REVENUE_EVIDENCE_INVALID';
  END IF;

  SELECT submission.id, submission.revision_number + 1
  INTO previous_submission_value, next_revision
  FROM public.billing_revenue_submissions AS submission
  WHERE submission.period_id = period_row.id
  ORDER BY submission.revision_number DESC
  LIMIT 1;
  next_revision := COALESCE(next_revision, 1);

  INSERT INTO public.billing_revenue_submissions (
    organization_id, account_id, period_id, revision_number,
    previous_submission_id, gross_amount_minor, excluded_amount_minor,
    commissionable_amount_minor, provenance_kind, provenance_source_id,
    submitter_id, submitter_role, attested_accurate, attestation_text,
    request_fingerprint
  ) VALUES (
    period_row.organization_id, period_row.account_id, period_row.id,
    next_revision, previous_submission_value, gross_value, excluded_value,
    commissionable_value, p_payload->>'provenance_kind',
    pg_catalog.btrim(p_payload->>'provenance_source_id'), (SELECT auth.uid()),
    actor_role_value, true, pg_catalog.btrim(p_payload->'attestation'->>'text'),
    fingerprint_value
  ) RETURNING * INTO submission_row;

  INSERT INTO public.billing_revenue_submission_evidence (
    submission_id, evidence_id, organization_id, account_id,
    evidence_ordinal, captured_sha256
  )
  SELECT submission_row.id, evidence.id, period_row.organization_id,
    period_row.account_id, requested.ordinal::smallint, evidence.sha256
  FROM pg_catalog.jsonb_array_elements_text(p_payload->'evidence_ids')
    WITH ORDINALITY AS requested(id, ordinal)
  JOIN public.billing_evidence_objects AS evidence
    ON evidence.id = requested.id::uuid
    AND evidence.organization_id = period_row.organization_id
    AND evidence.account_id = period_row.account_id
    AND evidence.kind = 'revenue_statement'
    AND evidence.inspection_status = 'clean'
    AND evidence.lifecycle_status = 'active'
    AND evidence.retention_expires_at > pg_catalog.now()
    AND NOT (
      evidence.hold_started_at IS NOT NULL AND evidence.hold_released_at IS NULL
    );

  response_value := pg_catalog.jsonb_build_object(
    'result', 'submitted',
    'period_id', submission_row.period_id,
    'submission_id', submission_row.id,
    'revision_number', submission_row.revision_number,
    'previous_submission_id', submission_row.previous_submission_id,
    'gross_amount_minor', submission_row.gross_amount_minor::text,
    'excluded_amount_minor', submission_row.excluded_amount_minor::text,
    'commissionable_amount_minor', submission_row.commissionable_amount_minor::text,
    'currency', submission_row.currency,
    'request_fingerprint', submission_row.request_fingerprint
  );
  PERFORM private.billing_record_revenue_command(
    submission_row.organization_id, submission_row.account_id, actor_role_value,
    'revision.submit', p_payload->>'command_key', fingerprint_value,
    submission_row.period_id, submission_row.id, response_value
  );
  RETURN response_value;
END;
$function$;

ALTER TABLE public.billing_revenue_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_revenue_periods FORCE ROW LEVEL SECURITY;
ALTER TABLE public.billing_revenue_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_revenue_submissions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.billing_revenue_submission_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_revenue_submission_evidence FORCE ROW LEVEL SECURITY;
ALTER TABLE public.billing_revenue_command_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_revenue_command_events FORCE ROW LEVEL SECURITY;

CREATE POLICY billing_revenue_periods_select ON public.billing_revenue_periods
FOR SELECT TO authenticated
USING (private.billing_has_capability(organization_id, account_id, 'revenue.read'));

CREATE POLICY billing_revenue_submissions_select ON public.billing_revenue_submissions
FOR SELECT TO authenticated
USING (private.billing_has_capability(organization_id, account_id, 'revenue.read'));

CREATE POLICY billing_revenue_submission_evidence_select
ON public.billing_revenue_submission_evidence
FOR SELECT TO authenticated
USING (private.billing_has_capability(organization_id, account_id, 'revenue.read'));

CREATE POLICY billing_revenue_command_events_select ON public.billing_revenue_command_events
FOR SELECT TO authenticated
USING (private.billing_has_capability(organization_id, account_id, 'revenue.read'));

ALTER FUNCTION private.billing_revenue_row_immutable() OWNER TO postgres;
ALTER FUNCTION private.billing_revenue_request_fingerprint(text, jsonb) OWNER TO postgres;
ALTER FUNCTION private.billing_revenue_replay(text, text) OWNER TO postgres;
ALTER FUNCTION private.billing_record_revenue_command(uuid, uuid, text, text, text, text, uuid, uuid, jsonb) OWNER TO postgres;
ALTER FUNCTION public.ensure_billing_revenue_period(jsonb) OWNER TO postgres;
ALTER FUNCTION public.submit_billing_revenue_revision(jsonb) OWNER TO postgres;

REVOKE ALL ON FUNCTION private.billing_revenue_row_immutable() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_revenue_request_fingerprint(text, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_revenue_replay(text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_record_revenue_command(uuid, uuid, text, text, text, text, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ensure_billing_revenue_period(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_billing_revenue_revision(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_billing_revenue_period(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_billing_revenue_revision(jsonb) TO authenticated;

REVOKE ALL ON TABLE public.billing_revenue_periods,
  public.billing_revenue_submissions,
  public.billing_revenue_submission_evidence,
  public.billing_revenue_command_events
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.billing_revenue_periods,
  public.billing_revenue_submissions,
  public.billing_revenue_submission_evidence,
  public.billing_revenue_command_events
  TO authenticated;
GRANT ALL ON TABLE public.billing_revenue_periods,
  public.billing_revenue_submissions,
  public.billing_revenue_submission_evidence,
  public.billing_revenue_command_events
  TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.billing_revenue_command_events_id_seq
  TO service_role;

COMMIT;
