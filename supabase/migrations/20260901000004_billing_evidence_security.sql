-- Phase 2: private, quarantine-first billing evidence security.

BEGIN;

INSERT INTO storage.buckets (id, name, public)
VALUES ('billing-evidence', 'billing-evidence', false)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    public = false;

ALTER TABLE public.billing_accounts
  ADD CONSTRAINT billing_accounts_id_organization_unique
  UNIQUE (id, organization_id);

CREATE TABLE public.billing_evidence_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.billing_organizations(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL,
  bucket_id text NOT NULL DEFAULT 'billing-evidence'
    CHECK (bucket_id = 'billing-evidence'),
  object_path text GENERATED ALWAYS AS (
    organization_id::text || '/' || account_id::text || '/' || id::text
  ) STORED,
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0),
  mime_type text NOT NULL CHECK (
    btrim(mime_type) <> ''
    AND length(mime_type) <= 255
    AND mime_type !~ '[[:cntrl:]]'
  ),
  inspection_status text NOT NULL DEFAULT 'quarantined'
    CHECK (inspection_status IN ('quarantined', 'clean', 'rejected')),
  inspection_principal_id uuid REFERENCES public.billing_automation_principals(id) ON DELETE RESTRICT,
  inspection_grant_id uuid REFERENCES public.billing_automation_grants(id) ON DELETE RESTRICT,
  inspection_decided_at timestamptz,
  inspection_reason_code text,
  retention_expires_at timestamptz NOT NULL,
  hold_started_at timestamptz,
  hold_reason text,
  hold_released_at timestamptz,
  hold_release_reason text,
  lifecycle_status text NOT NULL DEFAULT 'active'
    CHECK (lifecycle_status IN ('active', 'disabled', 'expired')),
  ended_at timestamptz,
  end_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_evidence_account_scope_fk
    FOREIGN KEY (account_id, organization_id)
    REFERENCES public.billing_accounts(id, organization_id)
    ON DELETE RESTRICT,
  CONSTRAINT billing_evidence_object_scope_unique
    UNIQUE (id, organization_id, account_id),
  CONSTRAINT billing_evidence_object_path_unique UNIQUE (object_path),
  CONSTRAINT billing_evidence_inspection_state CHECK (
    (
      inspection_status = 'quarantined'
      AND inspection_principal_id IS NULL
      AND inspection_grant_id IS NULL
      AND inspection_decided_at IS NULL
      AND inspection_reason_code IS NULL
    )
    OR (
      inspection_status IN ('clean', 'rejected')
      AND inspection_principal_id IS NOT NULL
      AND inspection_grant_id IS NOT NULL
      AND inspection_decided_at IS NOT NULL
      AND inspection_reason_code ~ '^[A-Z][A-Z0-9_]{2,63}$'
    )
  ),
  CONSTRAINT billing_evidence_retention_window CHECK (
    retention_expires_at > created_at
  ),
  CONSTRAINT billing_evidence_hold_state CHECK (
    (
      hold_started_at IS NULL
      AND hold_reason IS NULL
      AND hold_released_at IS NULL
      AND hold_release_reason IS NULL
    )
    OR (
      hold_started_at IS NOT NULL
      AND NULLIF(btrim(hold_reason), '') IS NOT NULL
      AND hold_released_at IS NULL
      AND hold_release_reason IS NULL
    )
    OR (
      hold_started_at IS NOT NULL
      AND NULLIF(btrim(hold_reason), '') IS NOT NULL
      AND hold_released_at >= hold_started_at
      AND NULLIF(btrim(hold_release_reason), '') IS NOT NULL
    )
  ),
  CONSTRAINT billing_evidence_lifecycle_state CHECK (
    (
      lifecycle_status = 'active'
      AND ended_at IS NULL
      AND end_reason IS NULL
    )
    OR (
      lifecycle_status IN ('disabled', 'expired')
      AND ended_at IS NOT NULL
      AND NULLIF(btrim(end_reason), '') IS NOT NULL
    )
  )
);

CREATE INDEX billing_evidence_objects_account_state_idx
  ON public.billing_evidence_objects (
    organization_id,
    account_id,
    lifecycle_status,
    inspection_status,
    retention_expires_at
  );

CREATE TABLE public.billing_evidence_access_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  evidence_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  account_id uuid NOT NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('human', 'customer')),
  actor_id uuid NOT NULL,
  purpose text NOT NULL CHECK (
    purpose IN ('download', 'review', 'audit', 'invalid')
  ),
  result text NOT NULL CHECK (result IN ('allowed', 'denied')),
  reason_code text NOT NULL CHECK (reason_code ~ '^[A-Z][A-Z0-9_]{2,63}$'),
  capability_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_evidence_access_scope_fk
    FOREIGN KEY (evidence_id, organization_id, account_id)
    REFERENCES public.billing_evidence_objects(id, organization_id, account_id)
    ON DELETE RESTRICT,
  CONSTRAINT billing_evidence_access_result_state CHECK (
    (
      result = 'allowed'
      AND reason_code = 'ACCESS_ALLOWED'
      AND capability_expires_at > created_at
      AND capability_expires_at <= created_at + interval '60 seconds'
    )
    OR (
      result = 'denied'
      AND reason_code <> 'ACCESS_ALLOWED'
      AND capability_expires_at IS NULL
    )
  )
);

CREATE INDEX billing_evidence_access_events_scope_created_idx
  ON public.billing_evidence_access_events (
    organization_id,
    account_id,
    evidence_id,
    created_at DESC
  );
CREATE INDEX billing_evidence_access_events_actor_created_idx
  ON public.billing_evidence_access_events (actor_id, created_at DESC);

CREATE OR REPLACE FUNCTION private.billing_evidence_protect_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF OLD.id IS DISTINCT FROM NEW.id
    OR OLD.organization_id IS DISTINCT FROM NEW.organization_id
    OR OLD.account_id IS DISTINCT FROM NEW.account_id
    OR OLD.bucket_id IS DISTINCT FROM NEW.bucket_id
    OR OLD.sha256 IS DISTINCT FROM NEW.sha256
    OR OLD.size_bytes IS DISTINCT FROM NEW.size_bytes
    OR OLD.mime_type IS DISTINCT FROM NEW.mime_type
    OR OLD.retention_expires_at IS DISTINCT FROM NEW.retention_expires_at
    OR OLD.created_at IS DISTINCT FROM NEW.created_at
  THEN
    RAISE EXCEPTION 'Evidence scope and byte metadata are immutable';
  END IF;

  IF OLD.inspection_status IS DISTINCT FROM NEW.inspection_status THEN
    IF OLD.inspection_status <> 'quarantined'
      OR NEW.inspection_status NOT IN ('clean', 'rejected')
    THEN
      RAISE EXCEPTION 'Evidence inspection decision is immutable';
    END IF;
  ELSIF OLD.inspection_principal_id IS DISTINCT FROM NEW.inspection_principal_id
    OR OLD.inspection_grant_id IS DISTINCT FROM NEW.inspection_grant_id
    OR OLD.inspection_decided_at IS DISTINCT FROM NEW.inspection_decided_at
    OR OLD.inspection_reason_code IS DISTINCT FROM NEW.inspection_reason_code
  THEN
    RAISE EXCEPTION 'Evidence inspection decision is immutable';
  END IF;

  IF OLD.lifecycle_status IS DISTINCT FROM NEW.lifecycle_status THEN
    IF OLD.lifecycle_status <> 'active'
      OR NEW.lifecycle_status NOT IN ('disabled', 'expired')
    THEN
      RAISE EXCEPTION 'Evidence lifecycle cannot be reopened';
    END IF;
  ELSIF OLD.ended_at IS DISTINCT FROM NEW.ended_at
    OR OLD.end_reason IS DISTINCT FROM NEW.end_reason
  THEN
    RAISE EXCEPTION 'Evidence lifecycle decision is immutable';
  END IF;

  IF OLD.hold_started_at IS NULL AND NEW.hold_started_at IS NOT NULL THEN
    NULL;
  ELSIF OLD.hold_started_at IS NOT NULL
    AND OLD.hold_released_at IS NULL
    AND NEW.hold_started_at = OLD.hold_started_at
    AND NEW.hold_reason = OLD.hold_reason
    AND NEW.hold_released_at IS NOT NULL
  THEN
    NULL;
  ELSIF OLD.hold_started_at IS DISTINCT FROM NEW.hold_started_at
    OR OLD.hold_reason IS DISTINCT FROM NEW.hold_reason
    OR OLD.hold_released_at IS DISTINCT FROM NEW.hold_released_at
    OR OLD.hold_release_reason IS DISTINCT FROM NEW.hold_release_reason
  THEN
    RAISE EXCEPTION 'Evidence hold history is immutable';
  END IF;

  NEW.updated_at := pg_catalog.now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION private.billing_evidence_event_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION 'Evidence access events are append-only';
END;
$function$;

CREATE OR REPLACE FUNCTION private.billing_actor_has_capability(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_account_id uuid,
  p_capability text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.sales AS sale
    JOIN public.billing_role_assignments AS assignment
      ON assignment.sales_id = sale.id
    JOIN public.billing_role_capabilities AS role_capability
      ON role_capability.role = assignment.role
    JOIN public.billing_organizations AS organization
      ON organization.id = assignment.organization_id
    JOIN public.billing_accounts AS account
      ON account.id = p_account_id
      AND account.organization_id = assignment.organization_id
    WHERE sale.user_id = p_actor_user_id
      AND NOT sale.disabled
      AND assignment.organization_id = p_organization_id
      AND (assignment.account_id IS NULL OR assignment.account_id = p_account_id)
      AND assignment.disabled_at IS NULL
      AND assignment.valid_from <= pg_catalog.now()
      AND (assignment.valid_until IS NULL OR assignment.valid_until > pg_catalog.now())
      AND role_capability.capability = p_capability
      AND organization.status = 'active'
      AND account.billing_status <> 'closed'
  );
$function$;

CREATE OR REPLACE FUNCTION private.billing_begin_evidence_upload(
  p_actor_user_id uuid,
  p_account_id uuid,
  p_sha256 text,
  p_size_bytes bigint,
  p_mime_type text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  organization_id_value uuid;
  evidence_record public.billing_evidence_objects%ROWTYPE;
BEGIN
  IF p_actor_user_id IS NULL
    OR p_account_id IS NULL
    OR p_sha256 IS NULL
    OR p_sha256 !~ '^[a-f0-9]{64}$'
    OR p_size_bytes IS NULL
    OR p_size_bytes <= 0
    OR p_size_bytes > 10485760
    OR p_mime_type NOT IN (
      'application/pdf',
      'image/jpeg',
      'image/png',
      'text/csv'
    )
  THEN
    RETURN pg_catalog.jsonb_build_object(
      'result', 'denied',
      'reason_code', 'UPLOAD_NOT_AUTHORIZED'
    );
  END IF;

  SELECT account.organization_id
  INTO organization_id_value
  FROM public.billing_accounts AS account
  WHERE account.id = p_account_id
    AND account.billing_status <> 'closed'
    AND private.billing_actor_has_capability(
      p_actor_user_id,
      account.organization_id,
      account.id,
      'evidence.upload'
    );

  IF organization_id_value IS NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'result', 'denied',
      'reason_code', 'UPLOAD_NOT_AUTHORIZED'
    );
  END IF;

  INSERT INTO public.billing_evidence_objects (
    organization_id,
    account_id,
    sha256,
    size_bytes,
    mime_type,
    retention_expires_at
  ) VALUES (
    organization_id_value,
    p_account_id,
    p_sha256,
    p_size_bytes,
    p_mime_type,
    pg_catalog.now() + interval '7 years'
  )
  RETURNING * INTO evidence_record;

  INSERT INTO public.billing_audit_events (
    actor_type, actor_id, organization_id, account_id, action,
    subject_type, subject_id, result, reason, details
  ) VALUES (
    'human', p_actor_user_id, evidence_record.organization_id,
    evidence_record.account_id, 'evidence.upload',
    'billing_evidence_objects', evidence_record.id::text,
    'succeeded', NULL, '{"status":"quarantined"}'::jsonb
  );

  RETURN pg_catalog.jsonb_build_object(
    'result', 'created',
    'evidence_id', evidence_record.id,
    'organization_id', evidence_record.organization_id,
    'account_id', evidence_record.account_id,
    'bucket_id', evidence_record.bucket_id,
    'object_path', evidence_record.object_path
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.begin_billing_evidence_upload(
  p_actor_user_id uuid,
  p_account_id uuid,
  p_sha256 text,
  p_size_bytes bigint,
  p_mime_type text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT private.billing_begin_evidence_upload(
    p_actor_user_id,
    p_account_id,
    p_sha256,
    p_size_bytes,
    p_mime_type
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
  existing_execution_id uuid;
  principal_id_value uuid;
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

  IF NOT FOUND OR evidence_record.inspection_status <> 'quarantined' THEN
    SELECT execution.id, principal.id
    INTO existing_execution_id, principal_id_value
    FROM public.billing_automation_executions AS execution
    JOIN public.billing_automation_grants AS grant_row
      ON grant_row.id = execution.grant_id
    JOIN public.billing_automation_principals AS principal
      ON principal.id = execution.principal_id
    WHERE evidence_record.id IS NOT NULL
      AND principal.auth_user_id = (SELECT auth.uid())
      AND execution.idempotency_key = p_idempotency_key
      AND execution.grant_id = p_grant_id
      AND execution.account_id = evidence_record.account_id
      AND grant_row.organization_id = evidence_record.organization_id
      AND grant_row.command_name = 'evidence.inspect'
      AND grant_row.provider_reference = p_provider_reference
      AND grant_row.policy_version = p_policy_version
      AND grant_row.action_kind = 'evidence.inspection';

    IF existing_execution_id IS NOT NULL THEN
      INSERT INTO public.billing_audit_events (
        actor_type, actor_id, organization_id, account_id, action,
        subject_type, subject_id, result, reason, details
      ) VALUES (
        'automation', principal_id_value, evidence_record.organization_id,
        evidence_record.account_id, 'evidence.inspection',
        'billing_automation_executions', existing_execution_id::text,
        'ignored', 'DUPLICATE_COMMAND', '{}'::jsonb
      );
      RETURN pg_catalog.jsonb_build_object(
        'result', 'duplicate',
        'reason_code', 'DUPLICATE_COMMAND'
      );
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'result', 'denied',
      'reason_code', 'INSPECTION_NOT_AUTHORIZED'
    );
  END IF;

  command_result := private.billing_consume_automation_grant(
    p_grant_id,
    evidence_record.account_id,
    'evidence.inspect',
    p_provider_reference,
    p_policy_version,
    'evidence.inspection',
    0,
    p_idempotency_key
  );

  IF command_result->>'result' = 'duplicate' THEN
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

CREATE OR REPLACE FUNCTION private.billing_authorize_evidence_access(
  p_evidence_id uuid,
  p_purpose text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  evidence_record public.billing_evidence_objects%ROWTYPE;
  actor_type_value text;
  normalized_purpose text;
  required_capability text;
  result_value text := 'denied';
  reason_code_value text := 'ACCESS_NOT_AUTHORIZED';
  capability_expires_value timestamptz;
  access_event_id bigint;
BEGIN
  IF (SELECT auth.uid()) IS NULL OR p_evidence_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'capability_eligible', false,
      'reason_code', 'ACCESS_NOT_AUTHORIZED'
    );
  END IF;

  SELECT evidence.*
  INTO evidence_record
  FROM public.billing_evidence_objects AS evidence
  WHERE evidence.id = p_evidence_id
  FOR SHARE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'capability_eligible', false,
      'reason_code', 'ACCESS_NOT_AUTHORIZED'
    );
  END IF;

  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM public.billing_contacts AS contact
    WHERE contact.auth_user_id = (SELECT auth.uid())
      AND contact.organization_id = evidence_record.organization_id
      AND contact.account_id = evidence_record.account_id
      AND contact.active
      AND contact.effective_from <= pg_catalog.now()
      AND (contact.effective_until IS NULL OR contact.effective_until > pg_catalog.now())
  ) THEN 'customer' ELSE 'human' END
  INTO actor_type_value;

  normalized_purpose := CASE
    WHEN p_purpose IN ('download', 'review', 'audit') THEN p_purpose
    ELSE 'invalid'
  END;
  required_capability := CASE normalized_purpose
    WHEN 'download' THEN 'evidence.access'
    WHEN 'review' THEN 'evidence.review'
    WHEN 'audit' THEN 'audit.read'
    ELSE NULL
  END;

  IF normalized_purpose = 'invalid' THEN
    reason_code_value := 'PURPOSE_NOT_ALLOWED';
  ELSIF NOT private.billing_has_capability(
    evidence_record.organization_id,
    evidence_record.account_id,
    required_capability
  ) THEN
    reason_code_value := 'ACCESS_NOT_AUTHORIZED';
  ELSIF evidence_record.lifecycle_status <> 'active' THEN
    reason_code_value := 'EVIDENCE_NOT_ACTIVE';
  ELSIF evidence_record.inspection_status = 'quarantined' THEN
    reason_code_value := 'EVIDENCE_QUARANTINED';
  ELSIF evidence_record.inspection_status = 'rejected' THEN
    reason_code_value := 'EVIDENCE_REJECTED';
  ELSIF evidence_record.retention_expires_at <= pg_catalog.now() THEN
    reason_code_value := 'EVIDENCE_EXPIRED';
  ELSIF evidence_record.hold_started_at IS NOT NULL
    AND evidence_record.hold_released_at IS NULL
  THEN
    reason_code_value := 'EVIDENCE_HELD';
  ELSE
    result_value := 'allowed';
    reason_code_value := 'ACCESS_ALLOWED';
    capability_expires_value := pg_catalog.now() + interval '60 seconds';
  END IF;

  INSERT INTO public.billing_evidence_access_events (
    evidence_id, organization_id, account_id, actor_type, actor_id,
    purpose, result, reason_code, capability_expires_at
  ) VALUES (
    evidence_record.id, evidence_record.organization_id, evidence_record.account_id,
    actor_type_value, (SELECT auth.uid()), normalized_purpose, result_value,
    reason_code_value, capability_expires_value
  )
  RETURNING id INTO access_event_id;

  INSERT INTO public.billing_audit_events (
    actor_type, actor_id, organization_id, account_id, action,
    subject_type, subject_id, result, reason, details
  ) VALUES (
    actor_type_value, (SELECT auth.uid()), evidence_record.organization_id,
    evidence_record.account_id, 'evidence.access',
    'billing_evidence_objects', evidence_record.id::text,
    CASE WHEN result_value = 'allowed' THEN 'succeeded' ELSE 'denied' END,
    reason_code_value,
    pg_catalog.jsonb_build_object('purpose', normalized_purpose)
  );

  RETURN pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'capability_eligible', result_value = 'allowed',
    'reason_code', reason_code_value,
    'access_event_id', access_event_id,
    'expires_at', capability_expires_value
  ));
END;
$function$;

CREATE OR REPLACE FUNCTION public.authorize_billing_evidence_access(
  p_evidence_id uuid,
  p_purpose text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT private.billing_authorize_evidence_access(p_evidence_id, p_purpose);
$function$;

CREATE TRIGGER billing_evidence_objects_protect_state
BEFORE UPDATE ON public.billing_evidence_objects
FOR EACH ROW EXECUTE FUNCTION private.billing_evidence_protect_state();

CREATE TRIGGER billing_evidence_access_events_immutable
BEFORE UPDATE OR DELETE ON public.billing_evidence_access_events
FOR EACH ROW EXECUTE FUNCTION private.billing_evidence_event_immutable();

ALTER TABLE public.billing_evidence_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_evidence_objects FORCE ROW LEVEL SECURITY;
ALTER TABLE public.billing_evidence_access_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_evidence_access_events FORCE ROW LEVEL SECURITY;

CREATE POLICY billing_evidence_objects_select
ON public.billing_evidence_objects
FOR SELECT TO authenticated
USING (
  private.billing_has_capability(organization_id, account_id, 'evidence.read')
);

CREATE POLICY billing_evidence_access_events_select
ON public.billing_evidence_access_events
FOR SELECT TO authenticated
USING (
  private.billing_has_capability(organization_id, account_id, 'evidence.review')
  OR private.billing_has_capability(organization_id, account_id, 'audit.read')
);

CREATE VIEW public.billing_evidence_support_safe
WITH (security_invoker = true)
AS
SELECT
  evidence.id,
  evidence.organization_id,
  evidence.account_id,
  evidence.mime_type,
  evidence.size_bytes,
  evidence.inspection_status,
  evidence.inspection_reason_code,
  evidence.retention_expires_at,
  evidence.hold_started_at IS NOT NULL
    AND evidence.hold_released_at IS NULL AS is_held,
  evidence.lifecycle_status,
  evidence.end_reason,
  evidence.created_at,
  evidence.updated_at
FROM public.billing_evidence_objects AS evidence;

REVOKE ALL ON FUNCTION private.billing_evidence_protect_state() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.billing_evidence_event_immutable() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.billing_actor_has_capability(uuid, uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.billing_begin_evidence_upload(uuid, uuid, text, bigint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.billing_finalize_evidence_inspection(uuid, uuid, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.billing_authorize_evidence_access(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.begin_billing_evidence_upload(uuid, uuid, text, bigint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_billing_evidence_inspection(uuid, uuid, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.authorize_billing_evidence_access(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_billing_evidence_inspection(uuid, uuid, text, text, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.authorize_billing_evidence_access(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.begin_billing_evidence_upload(uuid, uuid, text, bigint, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_billing_evidence_inspection(uuid, uuid, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_billing_evidence_access(uuid, text) TO authenticated;

REVOKE ALL ON TABLE public.billing_evidence_objects,
  public.billing_evidence_access_events
  FROM anon, authenticated;
GRANT SELECT (
  id,
  organization_id,
  account_id,
  mime_type,
  size_bytes,
  inspection_status,
  inspection_reason_code,
  retention_expires_at,
  hold_started_at,
  hold_released_at,
  lifecycle_status,
  end_reason,
  created_at,
  updated_at
) ON TABLE public.billing_evidence_objects TO authenticated;
GRANT SELECT ON TABLE public.billing_evidence_access_events TO authenticated;
GRANT ALL ON TABLE public.billing_evidence_objects,
  public.billing_evidence_access_events
  TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.billing_evidence_access_events_id_seq
  TO service_role;

REVOKE ALL ON TABLE public.billing_evidence_support_safe FROM anon, authenticated;
GRANT SELECT ON TABLE public.billing_evidence_support_safe TO authenticated;

COMMIT;
