-- Phase 2: caller-bound, exact, and bounded automation authorization.

BEGIN;

CREATE TABLE public.billing_automation_principals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.billing_organizations(id) ON DELETE RESTRICT,
  auth_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (btrim(name) <> ''),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  disabled_at timestamptz,
  disabled_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_automation_principals_validity CHECK (
    valid_until IS NULL OR valid_until > valid_from
  ),
  CONSTRAINT billing_automation_principals_disabled_state CHECK (
    (status = 'active' AND disabled_at IS NULL AND disabled_reason IS NULL)
    OR (
      status = 'disabled'
      AND disabled_at IS NOT NULL
      AND NULLIF(btrim(disabled_reason), '') IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX billing_automation_principals_active_user_unique
  ON public.billing_automation_principals (auth_user_id)
  WHERE status = 'active' AND disabled_at IS NULL;
CREATE INDEX billing_automation_principals_org_status_idx
  ON public.billing_automation_principals (organization_id, status);

CREATE TABLE public.billing_automation_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.billing_organizations(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL REFERENCES public.billing_accounts(id) ON DELETE RESTRICT,
  principal_id uuid NOT NULL REFERENCES public.billing_automation_principals(id) ON DELETE RESTRICT,
  command_name text NOT NULL CHECK (command_name ~ '^[a-z][a-z0-9_.-]+$'),
  provider_reference text NOT NULL CHECK (btrim(provider_reference) <> ''),
  policy_version text NOT NULL CHECK (policy_version ~ '^[A-Za-z0-9][A-Za-z0-9_.-]*$'),
  action_kind text NOT NULL CHECK (action_kind ~ '^[a-z][a-z0-9_.-]+$'),
  max_amount numeric(20, 2) CHECK (max_amount IS NULL OR max_amount >= 0),
  max_actions integer CHECK (max_actions IS NULL OR max_actions > 0),
  total_amount_consumed numeric(20, 2) NOT NULL DEFAULT 0 CHECK (total_amount_consumed >= 0),
  actions_consumed integer NOT NULL DEFAULT 0 CHECK (actions_consumed >= 0),
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'exhausted')),
  disabled_at timestamptz,
  disabled_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_automation_grants_validity CHECK (
    valid_until IS NULL OR valid_until > valid_from
  ),
  CONSTRAINT billing_automation_grants_action_limit CHECK (
    max_actions IS NULL OR actions_consumed <= max_actions
  ),
  CONSTRAINT billing_automation_grants_amount_limit CHECK (
    max_amount IS NULL OR total_amount_consumed <= max_amount
  ),
  CONSTRAINT billing_automation_grants_disabled_state CHECK (
    (status = 'active' AND disabled_at IS NULL AND disabled_reason IS NULL)
    OR (
      status IN ('disabled', 'exhausted')
      AND disabled_at IS NOT NULL
      AND NULLIF(btrim(disabled_reason), '') IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX billing_automation_grants_active_tuple_unique
  ON public.billing_automation_grants (
    principal_id,
    account_id,
    command_name,
    provider_reference,
    policy_version,
    action_kind
  )
  WHERE status = 'active' AND disabled_at IS NULL;
CREATE INDEX billing_automation_grants_principal_status_idx
  ON public.billing_automation_grants (principal_id, status, valid_until);
CREATE INDEX billing_automation_grants_account_idx
  ON public.billing_automation_grants (organization_id, account_id);

CREATE TABLE public.billing_automation_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.billing_organizations(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL REFERENCES public.billing_accounts(id) ON DELETE RESTRICT,
  principal_id uuid NOT NULL REFERENCES public.billing_automation_principals(id) ON DELETE RESTRICT,
  grant_id uuid NOT NULL REFERENCES public.billing_automation_grants(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL CHECK (
    idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$'
  ),
  command_name text NOT NULL CHECK (command_name ~ '^[a-z][a-z0-9_.-]+$'),
  policy_version text NOT NULL CHECK (policy_version ~ '^[A-Za-z0-9][A-Za-z0-9_.-]*$'),
  action_kind text NOT NULL CHECK (action_kind ~ '^[a-z][a-z0-9_.-]+$'),
  amount numeric(20, 2) NOT NULL CHECK (amount >= 0),
  result text NOT NULL CHECK (result = 'succeeded'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (principal_id, idempotency_key)
);

CREATE INDEX billing_automation_executions_grant_created_idx
  ON public.billing_automation_executions (grant_id, created_at DESC);

CREATE OR REPLACE FUNCTION private.billing_automation_protect_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  old_data jsonb := pg_catalog.to_jsonb(OLD);
  new_data jsonb := pg_catalog.to_jsonb(NEW);
BEGIN
  IF old_data->>'id' IS DISTINCT FROM new_data->>'id'
    OR old_data->>'organization_id' IS DISTINCT FROM new_data->>'organization_id'
    OR (
      TG_TABLE_NAME = 'billing_automation_principals'
      AND old_data->>'auth_user_id' IS DISTINCT FROM new_data->>'auth_user_id'
    )
    OR (
      TG_TABLE_NAME = 'billing_automation_grants'
      AND (
        old_data->>'account_id' IS DISTINCT FROM new_data->>'account_id'
        OR old_data->>'principal_id' IS DISTINCT FROM new_data->>'principal_id'
        OR old_data->>'command_name' IS DISTINCT FROM new_data->>'command_name'
        OR old_data->>'provider_reference' IS DISTINCT FROM new_data->>'provider_reference'
        OR old_data->>'policy_version' IS DISTINCT FROM new_data->>'policy_version'
        OR old_data->>'action_kind' IS DISTINCT FROM new_data->>'action_kind'
      )
    )
  THEN
    RAISE EXCEPTION 'Automation authority scope is immutable';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION private.billing_reject_human_automation_overlap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF TG_TABLE_NAME = 'billing_automation_principals' THEN
    IF NEW.status = 'active' AND EXISTS (
      SELECT 1
      FROM public.sales AS sale
      JOIN public.billing_role_assignments AS assignment ON assignment.sales_id = sale.id
      WHERE sale.user_id = NEW.auth_user_id
        AND assignment.disabled_at IS NULL
        AND assignment.valid_from <= pg_catalog.now()
        AND (assignment.valid_until IS NULL OR assignment.valid_until > pg_catalog.now())
    ) THEN
      RAISE EXCEPTION 'Automation principals cannot inherit human billing roles';
    END IF;
  ELSE
    IF NEW.disabled_at IS NULL AND EXISTS (
      SELECT 1
      FROM public.sales AS sale
      JOIN public.billing_automation_principals AS principal
        ON principal.auth_user_id = sale.user_id
      WHERE sale.id = NEW.sales_id
        AND principal.status = 'active'
        AND principal.disabled_at IS NULL
        AND principal.valid_from <= pg_catalog.now()
        AND (principal.valid_until IS NULL OR principal.valid_until > pg_catalog.now())
    ) THEN
      RAISE EXCEPTION 'Automation principals cannot inherit human billing roles';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION private.billing_automation_execution_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION 'Automation execution receipts are append-only';
END;
$function$;

CREATE OR REPLACE FUNCTION private.billing_consume_automation_grant(
  p_grant_id uuid,
  p_account_id uuid,
  p_command_name text,
  p_provider_reference text,
  p_policy_version text,
  p_action_kind text,
  p_amount numeric,
  p_idempotency_key text
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
  new_action_count integer;
  new_amount_total numeric(20, 2);
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR p_grant_id IS NULL
    OR p_account_id IS NULL
    OR p_command_name IS NULL
    OR p_provider_reference IS NULL
    OR p_policy_version IS NULL
    OR p_action_kind IS NULL
    OR p_amount IS NULL
    OR p_amount < 0
    OR p_idempotency_key IS NULL
    OR p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$'
  THEN
    RETURN pg_catalog.jsonb_build_object('result', 'denied', 'reason_code', 'GRANT_NOT_AUTHORIZED');
  END IF;

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

  SELECT execution.*
  INTO existing_execution
  FROM public.billing_automation_executions AS execution
  WHERE execution.principal_id = principal_record.id
    AND execution.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    INSERT INTO public.billing_audit_events (
      actor_type, actor_id, organization_id, account_id, action,
      subject_type, subject_id, result, reason, details
    ) VALUES (
      'automation', principal_record.id, principal_record.organization_id, grant_record.account_id,
      'automation.command', 'billing_automation_executions', existing_execution.id::text,
      'ignored', 'DUPLICATE_COMMAND', pg_catalog.jsonb_build_object(
        'command', grant_record.command_name,
        'policy_version', grant_record.policy_version,
        'action_kind', grant_record.action_kind
      )
    );
    RETURN pg_catalog.jsonb_build_object('result', 'duplicate', 'reason_code', 'DUPLICATE_COMMAND');
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
  new_amount_total := grant_record.total_amount_consumed + p_amount;
  IF (grant_record.max_actions IS NOT NULL AND new_action_count > grant_record.max_actions)
    OR (grant_record.max_amount IS NOT NULL AND new_amount_total > grant_record.max_amount)
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
    command_name, policy_version, action_kind, amount, result
  ) VALUES (
    principal_record.organization_id, grant_record.account_id, principal_record.id,
    grant_record.id, p_idempotency_key, grant_record.command_name,
    grant_record.policy_version, grant_record.action_kind, p_amount, 'succeeded'
  );

  UPDATE public.billing_automation_grants
  SET
    actions_consumed = new_action_count,
    total_amount_consumed = new_amount_total,
    status = CASE
      WHEN (max_actions IS NOT NULL AND new_action_count = max_actions)
        OR (max_amount IS NOT NULL AND new_amount_total = max_amount)
      THEN 'exhausted'
      ELSE status
    END,
    disabled_at = CASE
      WHEN (max_actions IS NOT NULL AND new_action_count = max_actions)
        OR (max_amount IS NOT NULL AND new_amount_total = max_amount)
      THEN pg_catalog.now()
      ELSE disabled_at
    END,
    disabled_reason = CASE
      WHEN (max_actions IS NOT NULL AND new_action_count = max_actions)
        OR (max_amount IS NOT NULL AND new_amount_total = max_amount)
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
    'actions_consumed', new_action_count,
    'amount_consumed', new_amount_total::text
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
  p_amount numeric,
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
    p_idempotency_key
  );
$function$;

CREATE TRIGGER billing_automation_principals_scope_immutable
BEFORE UPDATE ON public.billing_automation_principals
FOR EACH ROW EXECUTE FUNCTION private.billing_automation_protect_scope();
CREATE TRIGGER billing_automation_grants_scope_immutable
BEFORE UPDATE ON public.billing_automation_grants
FOR EACH ROW EXECUTE FUNCTION private.billing_automation_protect_scope();
CREATE TRIGGER billing_automation_executions_immutable
BEFORE UPDATE OR DELETE ON public.billing_automation_executions
FOR EACH ROW EXECUTE FUNCTION private.billing_automation_execution_immutable();
CREATE TRIGGER billing_automation_principals_no_human_overlap
BEFORE INSERT OR UPDATE ON public.billing_automation_principals
FOR EACH ROW EXECUTE FUNCTION private.billing_reject_human_automation_overlap();
CREATE TRIGGER billing_role_assignments_no_automation_overlap
BEFORE INSERT OR UPDATE ON public.billing_role_assignments
FOR EACH ROW EXECUTE FUNCTION private.billing_reject_human_automation_overlap();
CREATE TRIGGER billing_automation_principals_audit
AFTER INSERT OR UPDATE ON public.billing_automation_principals
FOR EACH ROW EXECUTE FUNCTION private.billing_audit_change();
CREATE TRIGGER billing_automation_grants_audit
AFTER INSERT OR UPDATE ON public.billing_automation_grants
FOR EACH ROW EXECUTE FUNCTION private.billing_audit_change();

ALTER TABLE public.billing_automation_principals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_automation_principals FORCE ROW LEVEL SECURITY;
ALTER TABLE public.billing_automation_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_automation_grants FORCE ROW LEVEL SECURITY;
ALTER TABLE public.billing_automation_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_automation_executions FORCE ROW LEVEL SECURITY;

REVOKE ALL ON FUNCTION private.billing_automation_protect_scope() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.billing_reject_human_automation_overlap() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.billing_automation_execution_immutable() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.billing_consume_automation_grant(uuid, uuid, text, text, text, text, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.execute_billing_automation_command(uuid, uuid, text, text, text, text, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.execute_billing_automation_command(uuid, uuid, text, text, text, text, numeric, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.execute_billing_automation_command(uuid, uuid, text, text, text, text, numeric, text) TO authenticated;

REVOKE ALL ON TABLE public.billing_automation_principals,
  public.billing_automation_grants,
  public.billing_automation_executions
  FROM anon, authenticated;
GRANT ALL ON TABLE public.billing_automation_principals,
  public.billing_automation_grants,
  public.billing_automation_executions
  TO service_role;

COMMIT;
