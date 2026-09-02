-- Phase 2: explicit billing tenants, accounts, human roles, and audit authority.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE TABLE public.billing_organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (btrim(name) <> ''),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  end_reason text,
  CONSTRAINT billing_organizations_end_state CHECK (
    (status = 'active' AND ended_at IS NULL AND end_reason IS NULL)
    OR (status = 'disabled' AND ended_at IS NOT NULL AND NULLIF(btrim(end_reason), '') IS NOT NULL)
  )
);

CREATE TABLE public.billing_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.billing_organizations(id) ON DELETE RESTRICT,
  company_id bigint REFERENCES public.companies(id) ON DELETE RESTRICT,
  customer_name text NOT NULL CHECK (btrim(customer_name) <> ''),
  billing_status text NOT NULL DEFAULT 'active' CHECK (billing_status IN ('active', 'on_hold', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  end_reason text,
  CONSTRAINT billing_accounts_end_state CHECK (
    (billing_status <> 'closed' AND ended_at IS NULL)
    OR (billing_status = 'closed' AND ended_at IS NOT NULL AND NULLIF(btrim(end_reason), '') IS NOT NULL)
  )
);

CREATE UNIQUE INDEX billing_accounts_org_company_unique
  ON public.billing_accounts (organization_id, company_id)
  WHERE company_id IS NOT NULL;
CREATE INDEX billing_accounts_org_status_idx
  ON public.billing_accounts (organization_id, billing_status);

CREATE TABLE public.billing_account_owners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.billing_organizations(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL REFERENCES public.billing_accounts(id) ON DELETE RESTRICT,
  sales_id bigint NOT NULL REFERENCES public.sales(id) ON DELETE RESTRICT,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_until timestamptz,
  end_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_account_owners_end_state CHECK (
    (effective_until IS NULL AND end_reason IS NULL)
    OR (effective_until IS NOT NULL AND effective_until > effective_from AND NULLIF(btrim(end_reason), '') IS NOT NULL)
  )
);

CREATE UNIQUE INDEX billing_account_owners_one_active
  ON public.billing_account_owners (account_id)
  WHERE effective_until IS NULL;
CREATE INDEX billing_account_owners_sales_idx
  ON public.billing_account_owners (sales_id, account_id);

CREATE TABLE public.billing_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.billing_organizations(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL REFERENCES public.billing_accounts(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (btrim(name) <> ''),
  email text,
  phone text,
  preferred_contact_method text NOT NULL DEFAULT 'email'
    CHECK (preferred_contact_method IN ('email', 'phone', 'none')),
  auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_until timestamptz,
  end_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_contacts_method_value CHECK (
    (preferred_contact_method = 'email' AND NULLIF(btrim(email), '') IS NOT NULL)
    OR (preferred_contact_method = 'phone' AND NULLIF(btrim(phone), '') IS NOT NULL)
    OR preferred_contact_method = 'none'
  ),
  CONSTRAINT billing_contacts_end_state CHECK (
    (active AND effective_until IS NULL AND end_reason IS NULL)
    OR (NOT active AND effective_until IS NOT NULL AND effective_until > effective_from AND NULLIF(btrim(end_reason), '') IS NOT NULL)
  )
);

CREATE UNIQUE INDEX billing_contacts_active_user_unique
  ON public.billing_contacts (account_id, auth_user_id)
  WHERE auth_user_id IS NOT NULL AND active;
CREATE INDEX billing_contacts_account_active_idx
  ON public.billing_contacts (account_id, active);

CREATE TABLE public.billing_roles (
  role text PRIMARY KEY,
  description text NOT NULL,
  human_assignable boolean NOT NULL DEFAULT true
);

CREATE TABLE public.billing_role_capabilities (
  role text NOT NULL REFERENCES public.billing_roles(role) ON DELETE RESTRICT,
  capability text NOT NULL CHECK (capability ~ '^[a-z][a-z0-9_.-]+$'),
  PRIMARY KEY (role, capability)
);

CREATE TABLE public.billing_role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.billing_organizations(id) ON DELETE RESTRICT,
  account_id uuid REFERENCES public.billing_accounts(id) ON DELETE RESTRICT,
  sales_id bigint NOT NULL REFERENCES public.sales(id) ON DELETE RESTRICT,
  role text NOT NULL REFERENCES public.billing_roles(role) ON DELETE RESTRICT,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  disabled_at timestamptz,
  disabled_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_role_assignments_validity CHECK (
    valid_until IS NULL OR valid_until > valid_from
  ),
  CONSTRAINT billing_role_assignments_disabled_state CHECK (
    (disabled_at IS NULL AND disabled_reason IS NULL)
    OR (disabled_at IS NOT NULL AND NULLIF(btrim(disabled_reason), '') IS NOT NULL)
  )
);

CREATE UNIQUE INDEX billing_role_assignments_active_unique
  ON public.billing_role_assignments (organization_id, COALESCE(account_id, '00000000-0000-0000-0000-000000000000'::uuid), sales_id, role)
  WHERE disabled_at IS NULL AND valid_until IS NULL;
CREATE INDEX billing_role_assignments_subject_idx
  ON public.billing_role_assignments (sales_id, organization_id, account_id);

CREATE TABLE public.billing_audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_type text NOT NULL CHECK (actor_type IN ('human', 'customer', 'automation', 'system')),
  actor_id uuid,
  organization_id uuid NOT NULL REFERENCES public.billing_organizations(id) ON DELETE RESTRICT,
  account_id uuid REFERENCES public.billing_accounts(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action ~ '^[a-z][a-z0-9_.-]+$'),
  subject_type text NOT NULL CHECK (subject_type ~ '^[a-z][a-z0-9_.-]+$'),
  subject_id text NOT NULL CHECK (btrim(subject_id) <> ''),
  result text NOT NULL CHECK (result IN ('succeeded', 'denied', 'failed', 'ignored')),
  reason text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_audit_details_object CHECK (jsonb_typeof(details) = 'object')
);

CREATE INDEX billing_audit_org_account_created_idx
  ON public.billing_audit_events (organization_id, account_id, created_at DESC);
CREATE INDEX billing_audit_actor_created_idx
  ON public.billing_audit_events (actor_id, created_at DESC);

INSERT INTO public.billing_roles (role, description)
VALUES
  ('administrator', 'Manage billing accounts and scoped access'),
  ('operator', 'Operate billing account records'),
  ('reviewer', 'Review billing evidence and approvals'),
  ('auditor', 'Read billing records and immutable audit evidence'),
  ('customer', 'Restricted access for an authenticated billing contact');

INSERT INTO public.billing_role_capabilities (role, capability)
VALUES
  ('administrator', 'organization.read'),
  ('administrator', 'account.read'),
  ('administrator', 'account.create'),
  ('administrator', 'account.update'),
  ('administrator', 'owner.read'),
  ('administrator', 'owner.manage'),
  ('administrator', 'contact.read'),
  ('administrator', 'contact.manage'),
  ('administrator', 'role.read'),
  ('administrator', 'role.manage'),
  ('administrator', 'audit.read'),
  ('administrator', 'automation.read'),
  ('administrator', 'automation.manage'),
  ('administrator', 'evidence.read'),
  ('administrator', 'evidence.upload'),
  ('administrator', 'evidence.access'),
  ('operator', 'organization.read'),
  ('operator', 'account.read'),
  ('operator', 'account.create'),
  ('operator', 'account.update'),
  ('operator', 'owner.read'),
  ('operator', 'contact.read'),
  ('operator', 'contact.manage'),
  ('operator', 'role.read'),
  ('operator', 'evidence.read'),
  ('operator', 'evidence.upload'),
  ('operator', 'evidence.access'),
  ('reviewer', 'organization.read'),
  ('reviewer', 'account.read'),
  ('reviewer', 'owner.read'),
  ('reviewer', 'contact.read'),
  ('reviewer', 'role.read'),
  ('reviewer', 'evidence.read'),
  ('reviewer', 'evidence.review'),
  ('reviewer', 'evidence.access'),
  ('auditor', 'organization.read'),
  ('auditor', 'account.read'),
  ('auditor', 'owner.read'),
  ('auditor', 'contact.read'),
  ('auditor', 'role.read'),
  ('auditor', 'audit.read'),
  ('auditor', 'automation.read'),
  ('auditor', 'evidence.read'),
  ('customer', 'organization.read'),
  ('customer', 'account.read'),
  ('customer', 'contact.self.read'),
  ('customer', 'evidence.read'),
  ('customer', 'evidence.access');

INSERT INTO public.billing_organizations (id, name, status)
VALUES ('00000000-0000-0000-0000-000000000001', 'RC Digital LLC', 'active');

INSERT INTO public.billing_role_assignments (organization_id, sales_id, role)
SELECT
  '00000000-0000-0000-0000-000000000001'::uuid,
  sale.id,
  'administrator'
FROM public.sales AS sale
WHERE sale.administrator AND NOT sale.disabled
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION private.billing_has_organization_access(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.billing_role_assignments AS assignment
    JOIN public.sales AS sale ON sale.id = assignment.sales_id
    JOIN public.billing_organizations AS organization ON organization.id = assignment.organization_id
    WHERE sale.user_id = (SELECT auth.uid())
      AND NOT sale.disabled
      AND assignment.organization_id = p_organization_id
      AND assignment.disabled_at IS NULL
      AND assignment.valid_from <= pg_catalog.now()
      AND (assignment.valid_until IS NULL OR assignment.valid_until > pg_catalog.now())
      AND organization.status = 'active'
  ) OR EXISTS (
    SELECT 1
    FROM public.billing_contacts AS contact
    JOIN public.billing_accounts AS account ON account.id = contact.account_id
    JOIN public.billing_organizations AS organization ON organization.id = contact.organization_id
    WHERE contact.auth_user_id = (SELECT auth.uid())
      AND contact.organization_id = p_organization_id
      AND contact.active
      AND contact.effective_from <= pg_catalog.now()
      AND (contact.effective_until IS NULL OR contact.effective_until > pg_catalog.now())
      AND account.billing_status <> 'closed'
      AND organization.status = 'active'
  );
$function$;

CREATE OR REPLACE FUNCTION private.billing_has_capability(
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
    FROM public.billing_role_assignments AS assignment
    JOIN public.billing_role_capabilities AS role_capability ON role_capability.role = assignment.role
    JOIN public.sales AS sale ON sale.id = assignment.sales_id
    JOIN public.billing_organizations AS organization ON organization.id = assignment.organization_id
    LEFT JOIN public.billing_accounts AS account ON account.id = p_account_id
    WHERE sale.user_id = (SELECT auth.uid())
      AND NOT sale.disabled
      AND assignment.organization_id = p_organization_id
      AND (assignment.account_id IS NULL OR assignment.account_id = p_account_id)
      AND role_capability.capability = p_capability
      AND assignment.disabled_at IS NULL
      AND assignment.valid_from <= pg_catalog.now()
      AND (assignment.valid_until IS NULL OR assignment.valid_until > pg_catalog.now())
      AND organization.status = 'active'
      AND (p_account_id IS NULL OR (account.organization_id = p_organization_id AND account.billing_status <> 'closed'))
  ) OR EXISTS (
    SELECT 1
    FROM public.billing_contacts AS contact
    JOIN public.billing_role_capabilities AS role_capability ON role_capability.role = 'customer'
    JOIN public.billing_accounts AS account ON account.id = contact.account_id
    JOIN public.billing_organizations AS organization ON organization.id = contact.organization_id
    WHERE contact.auth_user_id = (SELECT auth.uid())
      AND contact.organization_id = p_organization_id
      AND contact.account_id = p_account_id
      AND role_capability.capability = p_capability
      AND contact.active
      AND contact.effective_from <= pg_catalog.now()
      AND (contact.effective_until IS NULL OR contact.effective_until > pg_catalog.now())
      AND account.billing_status <> 'closed'
      AND organization.status = 'active'
  );
$function$;

CREATE OR REPLACE FUNCTION private.billing_protect_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF to_jsonb(OLD)->>'organization_id' IS DISTINCT FROM to_jsonb(NEW)->>'organization_id'
    OR to_jsonb(OLD)->>'account_id' IS DISTINCT FROM to_jsonb(NEW)->>'account_id'
    OR (TG_TABLE_NAME = 'billing_accounts' AND OLD.id IS DISTINCT FROM NEW.id)
  THEN
    RAISE EXCEPTION 'Billing scope is immutable';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION private.billing_audit_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  RAISE EXCEPTION 'Billing audit events are append-only';
END;
$function$;

CREATE OR REPLACE FUNCTION private.billing_audit_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  row_data jsonb := to_jsonb(NEW);
  organization_value uuid;
  account_value uuid;
  reason_value text;
  status_value text;
BEGIN
  organization_value := COALESCE(
    NULLIF(row_data->>'organization_id', '')::uuid,
    CASE
      WHEN TG_TABLE_NAME = 'billing_organizations'
      THEN NULLIF(row_data->>'id', '')::uuid
      ELSE NULL
    END
  );
  account_value := COALESCE(
    NULLIF(row_data->>'account_id', '')::uuid,
    CASE
      WHEN TG_TABLE_NAME = 'billing_accounts'
      THEN NULLIF(row_data->>'id', '')::uuid
      ELSE NULL
    END
  );
  reason_value := COALESCE(
    NULLIF(row_data->>'end_reason', ''),
    NULLIF(row_data->>'disabled_reason', '')
  );
  status_value := COALESCE(
    NULLIF(row_data->>'billing_status', ''),
    NULLIF(row_data->>'status', ''),
    CASE WHEN row_data ? 'active' THEN row_data->>'active' ELSE NULL END
  );

  INSERT INTO public.billing_audit_events (
    actor_type,
    actor_id,
    organization_id,
    account_id,
    action,
    subject_type,
    subject_id,
    result,
    reason,
    details
  ) VALUES (
    CASE WHEN (SELECT auth.uid()) IS NULL THEN 'system' ELSE 'human' END,
    (SELECT auth.uid()),
    organization_value,
    account_value,
    TG_TABLE_NAME || '.' || lower(TG_OP),
    TG_TABLE_NAME,
    row_data->>'id',
    'succeeded',
    reason_value,
    jsonb_strip_nulls(jsonb_build_object(
      'role', row_data->>'role',
      'status', status_value
    ))
  );
  RETURN NEW;
END;
$function$;

CREATE TRIGGER billing_accounts_scope_immutable
BEFORE UPDATE ON public.billing_accounts
FOR EACH ROW EXECUTE FUNCTION private.billing_protect_scope();
CREATE TRIGGER billing_account_owners_scope_immutable
BEFORE UPDATE ON public.billing_account_owners
FOR EACH ROW EXECUTE FUNCTION private.billing_protect_scope();
CREATE TRIGGER billing_contacts_scope_immutable
BEFORE UPDATE ON public.billing_contacts
FOR EACH ROW EXECUTE FUNCTION private.billing_protect_scope();
CREATE TRIGGER billing_role_assignments_scope_immutable
BEFORE UPDATE ON public.billing_role_assignments
FOR EACH ROW EXECUTE FUNCTION private.billing_protect_scope();

CREATE TRIGGER billing_audit_events_immutable
BEFORE UPDATE OR DELETE ON public.billing_audit_events
FOR EACH ROW EXECUTE FUNCTION private.billing_audit_immutable();

CREATE TRIGGER billing_organizations_audit
AFTER INSERT OR UPDATE ON public.billing_organizations
FOR EACH ROW EXECUTE FUNCTION private.billing_audit_change();
CREATE TRIGGER billing_accounts_audit
AFTER INSERT OR UPDATE ON public.billing_accounts
FOR EACH ROW EXECUTE FUNCTION private.billing_audit_change();
CREATE TRIGGER billing_account_owners_audit
AFTER INSERT OR UPDATE ON public.billing_account_owners
FOR EACH ROW EXECUTE FUNCTION private.billing_audit_change();
CREATE TRIGGER billing_contacts_audit
AFTER INSERT OR UPDATE ON public.billing_contacts
FOR EACH ROW EXECUTE FUNCTION private.billing_audit_change();
CREATE TRIGGER billing_role_assignments_audit
AFTER INSERT OR UPDATE ON public.billing_role_assignments
FOR EACH ROW EXECUTE FUNCTION private.billing_audit_change();

ALTER TABLE public.billing_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_organizations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.billing_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.billing_account_owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_account_owners FORCE ROW LEVEL SECURITY;
ALTER TABLE public.billing_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_contacts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.billing_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_roles FORCE ROW LEVEL SECURITY;
ALTER TABLE public.billing_role_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_role_capabilities FORCE ROW LEVEL SECURITY;
ALTER TABLE public.billing_role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_role_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.billing_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_audit_events FORCE ROW LEVEL SECURITY;

CREATE POLICY billing_organizations_select ON public.billing_organizations
  FOR SELECT TO authenticated
  USING (private.billing_has_organization_access(id));
CREATE POLICY billing_organizations_update ON public.billing_organizations
  FOR UPDATE TO authenticated
  USING (private.billing_has_capability(id, NULL, 'account.update'))
  WITH CHECK (private.billing_has_capability(id, NULL, 'account.update'));

CREATE POLICY billing_accounts_select ON public.billing_accounts
  FOR SELECT TO authenticated
  USING (private.billing_has_capability(organization_id, id, 'account.read'));
CREATE POLICY billing_accounts_insert ON public.billing_accounts
  FOR INSERT TO authenticated
  WITH CHECK (private.billing_has_capability(organization_id, NULL, 'account.create'));
CREATE POLICY billing_accounts_update ON public.billing_accounts
  FOR UPDATE TO authenticated
  USING (private.billing_has_capability(organization_id, id, 'account.update'))
  WITH CHECK (private.billing_has_capability(organization_id, id, 'account.update'));

CREATE POLICY billing_account_owners_select ON public.billing_account_owners
  FOR SELECT TO authenticated
  USING (private.billing_has_capability(organization_id, account_id, 'owner.read'));
CREATE POLICY billing_account_owners_insert ON public.billing_account_owners
  FOR INSERT TO authenticated
  WITH CHECK (private.billing_has_capability(organization_id, account_id, 'owner.manage'));
CREATE POLICY billing_account_owners_update ON public.billing_account_owners
  FOR UPDATE TO authenticated
  USING (private.billing_has_capability(organization_id, account_id, 'owner.manage'))
  WITH CHECK (private.billing_has_capability(organization_id, account_id, 'owner.manage'));

CREATE POLICY billing_contacts_select ON public.billing_contacts
  FOR SELECT TO authenticated
  USING (
    private.billing_has_capability(organization_id, account_id, 'contact.read')
    OR (auth_user_id = (SELECT auth.uid()) AND private.billing_has_capability(organization_id, account_id, 'contact.self.read'))
  );
CREATE POLICY billing_contacts_insert ON public.billing_contacts
  FOR INSERT TO authenticated
  WITH CHECK (private.billing_has_capability(organization_id, account_id, 'contact.manage'));
CREATE POLICY billing_contacts_update ON public.billing_contacts
  FOR UPDATE TO authenticated
  USING (private.billing_has_capability(organization_id, account_id, 'contact.manage'))
  WITH CHECK (private.billing_has_capability(organization_id, account_id, 'contact.manage'));

CREATE POLICY billing_roles_select ON public.billing_roles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY billing_role_capabilities_select ON public.billing_role_capabilities
  FOR SELECT TO authenticated USING (true);

CREATE POLICY billing_role_assignments_select ON public.billing_role_assignments
  FOR SELECT TO authenticated
  USING (
    private.billing_has_capability(organization_id, account_id, 'role.read')
    OR sales_id = (SELECT sale.id FROM public.sales AS sale WHERE sale.user_id = (SELECT auth.uid()))
  );
CREATE POLICY billing_role_assignments_insert ON public.billing_role_assignments
  FOR INSERT TO authenticated
  WITH CHECK (private.billing_has_capability(organization_id, account_id, 'role.manage'));
CREATE POLICY billing_role_assignments_update ON public.billing_role_assignments
  FOR UPDATE TO authenticated
  USING (private.billing_has_capability(organization_id, account_id, 'role.manage'))
  WITH CHECK (private.billing_has_capability(organization_id, account_id, 'role.manage'));

CREATE POLICY billing_audit_events_select ON public.billing_audit_events
  FOR SELECT TO authenticated
  USING (private.billing_has_capability(organization_id, account_id, 'audit.read'));

REVOKE ALL ON FUNCTION private.billing_has_organization_access(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.billing_has_capability(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.billing_protect_scope() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.billing_audit_immutable() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.billing_audit_change() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.billing_has_organization_access(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.billing_has_capability(uuid, uuid, text) TO authenticated, service_role;

REVOKE ALL ON public.billing_organizations, public.billing_accounts,
  public.billing_account_owners, public.billing_contacts, public.billing_roles,
  public.billing_role_capabilities, public.billing_role_assignments,
  public.billing_audit_events FROM anon, authenticated;

GRANT SELECT, UPDATE ON public.billing_organizations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.billing_accounts TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.billing_account_owners TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.billing_contacts TO authenticated;
GRANT SELECT ON public.billing_roles, public.billing_role_capabilities TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.billing_role_assignments TO authenticated;
GRANT SELECT ON public.billing_audit_events TO authenticated;

GRANT ALL ON public.billing_organizations, public.billing_accounts,
  public.billing_account_owners, public.billing_contacts, public.billing_roles,
  public.billing_role_capabilities, public.billing_role_assignments,
  public.billing_audit_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.billing_audit_events_id_seq TO service_role;
