-- Phase 2: move inherited invoices behind explicit billing-account authority.

BEGIN;

ALTER TABLE public.invoices
  ADD COLUMN organization_id uuid,
  ADD COLUMN billing_account_id uuid;

DO $block$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.billing_organizations AS organization
    WHERE organization.id = '00000000-0000-0000-0000-000000000001'::uuid
      AND organization.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Default RC Digital billing organization is unavailable';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.invoices AS invoice
    JOIN public.companies AS company ON company.id = invoice.company_id
    WHERE NULLIF(pg_catalog.btrim(company.name), '') IS NULL
  ) THEN
    RAISE EXCEPTION 'Invoice company cannot produce a named billing account';
  END IF;

  IF EXISTS (
    SELECT invoice.company_id
    FROM public.invoices AS invoice
    GROUP BY invoice.company_id
    HAVING pg_catalog.count(DISTINCT invoice.sales_id) <> 1
  ) THEN
    RAISE EXCEPTION 'Invoice company has ambiguous responsible ownership';
  END IF;
END;
$block$;

INSERT INTO public.billing_accounts (
  id,
  organization_id,
  company_id,
  customer_name,
  billing_status
)
SELECT
  pg_catalog.md5('rc-digital-billing-account:' || company.id::text)::uuid,
  '00000000-0000-0000-0000-000000000001'::uuid,
  company.id,
  company.name,
  'active'
FROM public.companies AS company
WHERE EXISTS (
  SELECT 1
  FROM public.invoices AS invoice
  WHERE invoice.company_id = company.id
)
ON CONFLICT (organization_id, company_id) WHERE company_id IS NOT NULL DO NOTHING;

DO $block$
BEGIN
  IF EXISTS (
    SELECT invoice.id
    FROM public.invoices AS invoice
    LEFT JOIN public.billing_accounts AS account
      ON account.organization_id = '00000000-0000-0000-0000-000000000001'::uuid
      AND account.company_id = invoice.company_id
    GROUP BY invoice.id
    HAVING pg_catalog.count(account.id) <> 1
  ) THEN
    RAISE EXCEPTION 'Invoice must map to exactly one billing account';
  END IF;
END;
$block$;

-- Preserve accepted invoice timestamps and numeric/provider facts while adding keys.
ALTER TABLE public.invoices DISABLE TRIGGER invoices_updated_at;
ALTER TABLE public.invoices DISABLE TRIGGER invoices_calculate_totals;

UPDATE public.invoices AS invoice
SET
  organization_id = account.organization_id,
  billing_account_id = account.id
FROM public.billing_accounts AS account
WHERE account.organization_id = '00000000-0000-0000-0000-000000000001'::uuid
  AND account.company_id = invoice.company_id;

ALTER TABLE public.invoices ENABLE TRIGGER invoices_calculate_totals;
ALTER TABLE public.invoices ENABLE TRIGGER invoices_updated_at;

DO $block$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.invoices AS invoice
    LEFT JOIN public.billing_accounts AS account
      ON account.id = invoice.billing_account_id
      AND account.organization_id = invoice.organization_id
      AND account.company_id = invoice.company_id
    WHERE invoice.organization_id IS NULL
      OR invoice.billing_account_id IS NULL
      OR account.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Invoice tenant backfill is incomplete';
  END IF;
END;
$block$;

INSERT INTO public.billing_account_owners (
  id,
  organization_id,
  account_id,
  sales_id
)
SELECT DISTINCT
  pg_catalog.md5('rc-digital-billing-owner:' || invoice.billing_account_id::text)::uuid,
  invoice.organization_id,
  invoice.billing_account_id,
  invoice.sales_id
FROM public.invoices AS invoice
ON CONFLICT DO NOTHING;

INSERT INTO public.billing_role_assignments (
  id,
  organization_id,
  account_id,
  sales_id,
  role
)
SELECT DISTINCT
  pg_catalog.md5(
    'rc-digital-invoice-operator:' || invoice.billing_account_id::text || ':' || invoice.sales_id::text
  )::uuid,
  invoice.organization_id,
  invoice.billing_account_id,
  invoice.sales_id,
  'operator'
FROM public.invoices AS invoice
JOIN public.sales AS sale ON sale.id = invoice.sales_id
WHERE NOT sale.administrator
  AND NOT sale.disabled
ON CONFLICT DO NOTHING;

DO $block$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.invoices AS invoice
    LEFT JOIN public.billing_account_owners AS owner
      ON owner.organization_id = invoice.organization_id
      AND owner.account_id = invoice.billing_account_id
      AND owner.sales_id = invoice.sales_id
      AND owner.effective_until IS NULL
    WHERE owner.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Invoice responsible owner backfill is incomplete';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.invoices AS invoice
    JOIN public.sales AS sale ON sale.id = invoice.sales_id
    LEFT JOIN public.billing_role_assignments AS assignment
      ON assignment.organization_id = invoice.organization_id
      AND assignment.account_id = invoice.billing_account_id
      AND assignment.sales_id = invoice.sales_id
      AND assignment.role = 'operator'
      AND assignment.disabled_at IS NULL
      AND assignment.valid_until IS NULL
    WHERE NOT sale.administrator
      AND NOT sale.disabled
      AND assignment.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Invoice compatibility role backfill is incomplete';
  END IF;
END;
$block$;

INSERT INTO public.billing_role_capabilities (role, capability)
VALUES
  ('administrator', 'invoice.read'),
  ('administrator', 'invoice.create'),
  ('administrator', 'invoice.update'),
  ('operator', 'invoice.read'),
  ('operator', 'invoice.create'),
  ('operator', 'invoice.update'),
  ('reviewer', 'invoice.read'),
  ('auditor', 'invoice.read')
ON CONFLICT DO NOTHING;

ALTER TABLE public.billing_accounts
  ADD CONSTRAINT billing_accounts_id_org_company_unique
    UNIQUE (id, organization_id, company_id);

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_organization_id_fkey
    FOREIGN KEY (organization_id)
    REFERENCES public.billing_organizations(id)
    ON DELETE RESTRICT
    NOT VALID,
  ADD CONSTRAINT invoices_billing_account_id_fkey
    FOREIGN KEY (billing_account_id)
    REFERENCES public.billing_accounts(id)
    ON DELETE RESTRICT
    NOT VALID,
  ADD CONSTRAINT invoices_billing_account_scope_fkey
    FOREIGN KEY (billing_account_id, organization_id, company_id)
    REFERENCES public.billing_accounts(id, organization_id, company_id)
    ON DELETE RESTRICT
    NOT VALID;

ALTER TABLE public.invoices VALIDATE CONSTRAINT invoices_organization_id_fkey;
ALTER TABLE public.invoices VALIDATE CONSTRAINT invoices_billing_account_id_fkey;
ALTER TABLE public.invoices VALIDATE CONSTRAINT invoices_billing_account_scope_fkey;

ALTER TABLE public.invoices
  ALTER COLUMN organization_id SET NOT NULL,
  ALTER COLUMN billing_account_id SET NOT NULL;

CREATE INDEX invoices_organization_account_idx
  ON public.invoices (organization_id, billing_account_id, created_at DESC);

CREATE OR REPLACE FUNCTION private.billing_invoice_protect_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF OLD.id IS DISTINCT FROM NEW.id
    OR OLD.organization_id IS DISTINCT FROM NEW.organization_id
    OR OLD.billing_account_id IS DISTINCT FROM NEW.billing_account_id
    OR OLD.company_id IS DISTINCT FROM NEW.company_id
    OR OLD.sales_id IS DISTINCT FROM NEW.sales_id
  THEN
    RAISE EXCEPTION 'Invoice ownership scope is immutable';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.billing_invoice_protect_scope() FROM PUBLIC;

CREATE TRIGGER invoices_billing_scope_immutable
BEFORE UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION private.billing_invoice_protect_scope();

CREATE TRIGGER invoices_billing_audit
AFTER INSERT OR UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION private.billing_audit_change();

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
)
SELECT
  'system',
  NULL,
  invoice.organization_id,
  invoice.billing_account_id,
  'invoice.backfill',
  'invoices',
  invoice.id::text,
  'succeeded',
  NULL,
  '{}'::jsonb
FROM public.invoices AS invoice;

DROP POLICY IF EXISTS "Users can view own invoices" ON public.invoices;
DROP POLICY IF EXISTS "Users can insert own invoices" ON public.invoices;
DROP POLICY IF EXISTS "Users can update own invoices" ON public.invoices;
DROP POLICY IF EXISTS "Users can delete own invoices" ON public.invoices;

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices FORCE ROW LEVEL SECURITY;

CREATE POLICY invoices_billing_select ON public.invoices
  FOR SELECT TO authenticated
  USING (
    private.billing_has_capability(
      organization_id,
      billing_account_id,
      'invoice.read'
    )
  );

CREATE POLICY invoices_billing_insert ON public.invoices
  FOR INSERT TO authenticated
  WITH CHECK (
    private.billing_has_capability(
      organization_id,
      billing_account_id,
      'invoice.create'
    )
    AND EXISTS (
      SELECT 1
      FROM public.billing_account_owners AS owner
      WHERE owner.organization_id = invoices.organization_id
        AND owner.account_id = invoices.billing_account_id
        AND owner.sales_id = invoices.sales_id
        AND owner.effective_until IS NULL
    )
  );

CREATE POLICY invoices_billing_update ON public.invoices
  FOR UPDATE TO authenticated
  USING (
    private.billing_has_capability(
      organization_id,
      billing_account_id,
      'invoice.update'
    )
  )
  WITH CHECK (
    private.billing_has_capability(
      organization_id,
      billing_account_id,
      'invoice.update'
    )
  );

REVOKE ALL ON TABLE public.invoices FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public.invoices_id_seq FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.invoices TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.invoices_id_seq TO authenticated;
GRANT ALL ON TABLE public.invoices TO service_role;
GRANT ALL ON SEQUENCE public.invoices_id_seq TO service_role;

COMMIT;
