-- Phase 2: allowlisted presentation summaries and reasoned access commands.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_billing_capability_summary()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  WITH human_capabilities AS (
    SELECT assignment.account_id, role_capability.capability
    FROM public.billing_role_assignments AS assignment
    JOIN public.billing_role_capabilities AS role_capability
      ON role_capability.role = assignment.role
    JOIN public.sales AS sale ON sale.id = assignment.sales_id
    JOIN public.billing_organizations AS organization
      ON organization.id = assignment.organization_id
    LEFT JOIN public.billing_accounts AS account
      ON account.id = assignment.account_id
    WHERE sale.user_id = (SELECT auth.uid())
      AND NOT sale.disabled
      AND assignment.disabled_at IS NULL
      AND assignment.valid_from <= pg_catalog.now()
      AND (assignment.valid_until IS NULL OR assignment.valid_until > pg_catalog.now())
      AND organization.status = 'active'
      AND (assignment.account_id IS NULL OR account.billing_status <> 'closed')
  ),
  customer_capabilities AS (
    SELECT contact.account_id, role_capability.capability
    FROM public.billing_contacts AS contact
    JOIN public.billing_role_capabilities AS role_capability
      ON role_capability.role = 'customer'
    JOIN public.billing_accounts AS account ON account.id = contact.account_id
    JOIN public.billing_organizations AS organization
      ON organization.id = contact.organization_id
    WHERE contact.auth_user_id = (SELECT auth.uid())
      AND contact.active
      AND contact.effective_from <= pg_catalog.now()
      AND (contact.effective_until IS NULL OR contact.effective_until > pg_catalog.now())
      AND account.billing_status <> 'closed'
      AND organization.status = 'active'
  ),
  scoped_capabilities AS (
    SELECT account_id, capability FROM human_capabilities WHERE account_id IS NOT NULL
    UNION
    SELECT account_id, capability FROM customer_capabilities
  ),
  account_rows AS (
    SELECT
      account_id,
      jsonb_agg(capability ORDER BY capability) AS capabilities
    FROM scoped_capabilities
    GROUP BY account_id
  )
  SELECT jsonb_build_object(
    'global_capabilities', COALESCE(
      (SELECT jsonb_agg(capability ORDER BY capability)
       FROM (SELECT DISTINCT capability FROM human_capabilities WHERE account_id IS NULL) AS global_values),
      '[]'::jsonb
    ),
    'accounts', COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'account_id', account_rows.account_id,
          'capabilities', account_rows.capabilities
        ) ORDER BY account_rows.account_id
      ) FROM account_rows),
      '[]'::jsonb
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.get_billing_account_access_summary(
  p_account_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  account_row public.billing_accounts%ROWTYPE;
  roles_value jsonb := '[]'::jsonb;
  automation_value jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO account_row
  FROM public.billing_accounts AS account
  WHERE account.id = p_account_id;

  IF NOT FOUND OR NOT private.billing_has_capability(
    account_row.organization_id,
    account_row.id,
    'account.read'
  ) THEN
    RAISE EXCEPTION 'Billing account access is not authorized';
  END IF;

  IF private.billing_has_capability(
    account_row.organization_id,
    account_row.id,
    'role.read'
  ) THEN
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'assignment_id', role_row.assignment_id,
        'role', role_row.role,
        'description', role_row.description,
        'subject_display_name', role_row.subject_display_name,
        'scope_label', role_row.scope_label,
        'effective_from', role_row.effective_from,
        'effective_until', role_row.effective_until,
        'status', role_row.status,
        'reason', role_row.reason
      ) ORDER BY role_row.status, role_row.role, role_row.subject_display_name
    ), '[]'::jsonb)
    INTO roles_value
    FROM (
      SELECT
        assignment.id AS assignment_id,
        assignment.role,
        role_record.description,
        btrim(sale.first_name || ' ' || sale.last_name) AS subject_display_name,
        CASE
          WHEN assignment.account_id IS NULL THEN 'All RC Digital billing accounts'
          ELSE account_row.customer_name
        END AS scope_label,
        assignment.valid_from AS effective_from,
        assignment.valid_until AS effective_until,
        CASE
          WHEN assignment.disabled_at IS NOT NULL
            OR (assignment.valid_until IS NOT NULL AND assignment.valid_until <= pg_catalog.now())
          THEN 'ended'
          ELSE 'active'
        END AS status,
        assignment.disabled_reason AS reason
      FROM public.billing_role_assignments AS assignment
      JOIN public.billing_roles AS role_record ON role_record.role = assignment.role
      JOIN public.sales AS sale ON sale.id = assignment.sales_id
      WHERE assignment.organization_id = account_row.organization_id
        AND (assignment.account_id IS NULL OR assignment.account_id = account_row.id)
    ) AS role_row;
  END IF;

  IF private.billing_has_capability(
    account_row.organization_id,
    account_row.id,
    'automation.read'
  ) THEN
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'principal_id', principal_row.principal_id,
        'name', principal_row.name,
        'status', principal_row.status,
        'valid_from', principal_row.valid_from,
        'valid_until', principal_row.valid_until,
        'disabled_reason', principal_row.disabled_reason,
        'grants', principal_row.grants
      ) ORDER BY principal_row.status, principal_row.name
    ), '[]'::jsonb)
    INTO automation_value
    FROM (
      SELECT
        principal.id AS principal_id,
        principal.name,
        principal.status,
        principal.valid_from,
        principal.valid_until,
        principal.disabled_reason,
        COALESCE(jsonb_agg(
          jsonb_build_object(
            'grant_id', grant_record.id,
            'command_name', grant_record.command_name,
            'policy_version', grant_record.policy_version,
            'action_kind', grant_record.action_kind,
            'provider_label', 'Registered provider ••••' || right(md5(grant_record.provider_reference), 4),
            'limit_summary', CASE
              WHEN grant_record.max_actions IS NULL AND grant_record.max_amount IS NULL
                THEN 'No configured action or amount limit'
              WHEN grant_record.max_actions IS NOT NULL AND grant_record.max_amount IS NULL
                THEN grant_record.max_actions::text || ' actions maximum'
              WHEN grant_record.max_actions IS NULL
                THEN 'Amount limit configured'
              ELSE grant_record.max_actions::text || ' actions and amount limit configured'
            END,
            'status', grant_record.status
          ) ORDER BY grant_record.command_name, grant_record.action_kind
        ) FILTER (WHERE grant_record.id IS NOT NULL), '[]'::jsonb) AS grants
      FROM public.billing_automation_principals AS principal
      JOIN public.billing_automation_grants AS grant_record
        ON grant_record.principal_id = principal.id
       AND grant_record.account_id = account_row.id
      WHERE principal.organization_id = account_row.organization_id
      GROUP BY principal.id
    ) AS principal_row;
  END IF;

  RETURN jsonb_build_object(
    'roles', roles_value,
    'automation', automation_value
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.assign_billing_role(
  p_account_id uuid,
  p_sales_id bigint,
  p_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  account_row public.billing_accounts%ROWTYPE;
  assignment_id_value uuid;
BEGIN
  SELECT * INTO account_row
  FROM public.billing_accounts AS account
  WHERE account.id = p_account_id;

  IF NOT FOUND OR NOT private.billing_has_capability(
    account_row.organization_id,
    account_row.id,
    'role.manage'
  ) THEN
    RAISE EXCEPTION 'Billing role assignment is not authorized';
  END IF;
  IF p_role NOT IN ('administrator', 'operator', 'reviewer', 'auditor') THEN
    RAISE EXCEPTION 'Billing role is invalid';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.sales AS sale
    JOIN public.billing_role_assignments AS membership
      ON membership.sales_id = sale.id
    WHERE sale.id = p_sales_id
      AND NOT sale.disabled
      AND membership.organization_id = account_row.organization_id
      AND membership.disabled_at IS NULL
      AND membership.valid_from <= pg_catalog.now()
      AND (membership.valid_until IS NULL OR membership.valid_until > pg_catalog.now())
  ) THEN
    RAISE EXCEPTION 'Billing role subject is invalid';
  END IF;

  INSERT INTO public.billing_role_assignments (
    organization_id, account_id, sales_id, role
  ) VALUES (
    account_row.organization_id, account_row.id, p_sales_id, p_role
  ) RETURNING id INTO assignment_id_value;

  RETURN jsonb_build_object('assignment_id', assignment_id_value);
END;
$function$;

CREATE OR REPLACE FUNCTION public.end_billing_role_assignment(
  p_assignment_id uuid,
  p_reason text,
  p_effective_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  assignment_row public.billing_role_assignments%ROWTYPE;
  reason_value text := NULLIF(btrim(p_reason), '');
  effective_at_value timestamptz := COALESCE(p_effective_at, pg_catalog.now());
BEGIN
  SELECT * INTO assignment_row
  FROM public.billing_role_assignments AS assignment
  WHERE assignment.id = p_assignment_id
  FOR UPDATE;

  IF NOT FOUND OR NOT private.billing_has_capability(
    assignment_row.organization_id,
    assignment_row.account_id,
    'role.manage'
  ) THEN
    RAISE EXCEPTION 'Billing role end is not authorized';
  END IF;
  IF reason_value IS NULL OR effective_at_value <= assignment_row.valid_from THEN
    RAISE EXCEPTION 'Billing role end reason and effective time are required';
  END IF;
  IF assignment_row.disabled_at IS NOT NULL OR assignment_row.valid_until IS NOT NULL THEN
    RETURN jsonb_build_object('assignment_id', assignment_row.id);
  END IF;
  IF assignment_row.role = 'administrator'
    AND assignment_row.account_id IS NULL
    AND (
      SELECT count(*)
      FROM public.billing_role_assignments AS remaining
      WHERE remaining.organization_id = assignment_row.organization_id
        AND remaining.role = 'administrator'
        AND remaining.account_id IS NULL
        AND remaining.disabled_at IS NULL
        AND remaining.valid_until IS NULL
    ) <= 1
  THEN
    RAISE EXCEPTION 'The last organization administrator cannot be ended';
  END IF;

  UPDATE public.billing_role_assignments
  SET valid_until = effective_at_value,
      disabled_at = effective_at_value,
      disabled_reason = reason_value,
      updated_at = pg_catalog.now()
  WHERE id = assignment_row.id;

  RETURN jsonb_build_object('assignment_id', assignment_row.id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.disable_billing_automation_principal(
  p_account_id uuid,
  p_principal_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  account_row public.billing_accounts%ROWTYPE;
  principal_row public.billing_automation_principals%ROWTYPE;
  reason_value text := NULLIF(btrim(p_reason), '');
BEGIN
  SELECT * INTO account_row
  FROM public.billing_accounts AS account
  WHERE account.id = p_account_id;
  SELECT * INTO principal_row
  FROM public.billing_automation_principals AS principal
  WHERE principal.id = p_principal_id
  FOR UPDATE;

  IF account_row.id IS NULL OR principal_row.id IS NULL
    OR principal_row.organization_id <> account_row.organization_id
    OR NOT EXISTS (
      SELECT 1 FROM public.billing_automation_grants AS grant_record
      WHERE grant_record.principal_id = principal_row.id
        AND grant_record.account_id = account_row.id
    )
    OR NOT private.billing_has_capability(
      account_row.organization_id,
      account_row.id,
      'automation.manage'
    )
  THEN
    RAISE EXCEPTION 'Automation principal disable is not authorized';
  END IF;
  IF reason_value IS NULL THEN
    RAISE EXCEPTION 'Automation disable reason is required';
  END IF;
  IF principal_row.status = 'disabled' THEN
    RETURN jsonb_build_object('principal_id', principal_row.id);
  END IF;

  UPDATE public.billing_automation_principals
  SET status = 'disabled',
      disabled_at = pg_catalog.now(),
      disabled_reason = reason_value,
      updated_at = pg_catalog.now()
  WHERE id = principal_row.id;

  UPDATE public.billing_automation_grants
  SET status = 'disabled',
      disabled_at = pg_catalog.now(),
      disabled_reason = reason_value,
      updated_at = pg_catalog.now()
  WHERE principal_id = principal_row.id
    AND status = 'active';

  RETURN jsonb_build_object('principal_id', principal_row.id);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_billing_capability_summary() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_billing_account_access_summary(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assign_billing_role(uuid, bigint, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.end_billing_role_assignment(uuid, text, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.disable_billing_automation_principal(uuid, uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_billing_capability_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_billing_account_access_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_billing_role(uuid, bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_billing_role_assignment(uuid, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.disable_billing_automation_principal(uuid, uuid, text) TO authenticated;

COMMIT;
