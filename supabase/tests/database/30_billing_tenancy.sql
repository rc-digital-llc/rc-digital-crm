BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(42);

SELECT is(
  (SELECT count(*) FROM public.billing_organizations WHERE id IN (
    '21000000-0000-0000-0000-000000000100'::uuid,
    '22000000-0000-0000-0000-000000000100'::uuid
  )),
  2::bigint,
  'billing fixture contains two isolated organizations'
);

SELECT is(
  (SELECT array_agg(role ORDER BY role) FROM public.billing_roles),
  ARRAY['administrator', 'auditor', 'customer', 'operator', 'reviewer']::text[],
  'billing role catalog contains the five normalized human roles'
);

SELECT is(
  (
    SELECT count(*)
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = ANY (ARRAY[
        'billing_organizations', 'billing_accounts', 'billing_account_owners',
        'billing_contacts', 'billing_roles', 'billing_role_capabilities',
        'billing_role_assignments', 'billing_audit_events'
      ])
      AND relation.relrowsecurity
  ),
  8::bigint,
  'every billing relation has row-level security enabled'
);

SELECT is(
  (
    SELECT count(*)
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = ANY (ARRAY[
        'billing_organizations', 'billing_accounts', 'billing_account_owners',
        'billing_contacts', 'billing_roles', 'billing_role_capabilities',
        'billing_role_assignments', 'billing_audit_events'
      ])
      AND relation.relforcerowsecurity
  ),
  8::bigint,
  'every billing relation forces row-level security'
);

SELECT ok(
  (
    SELECT coalesce(array_to_string(procedure_record.proconfig, ','), '') IN ('search_path=', 'search_path=""')
    FROM pg_proc AS procedure_record
    WHERE procedure_record.oid = 'private.billing_has_organization_access(uuid)'::regprocedure
  ),
  'organization access helper has an empty search_path'
);

SELECT ok(
  (
    SELECT coalesce(array_to_string(procedure_record.proconfig, ','), '') IN ('search_path=', 'search_path=""')
    FROM pg_proc AS procedure_record
    WHERE procedure_record.oid = 'private.billing_has_capability(uuid,uuid,text)'::regprocedure
  ),
  'capability helper has an empty search_path'
);

SELECT ok(
  NOT has_function_privilege('public', 'private.billing_has_organization_access(uuid)', 'EXECUTE'),
  'PUBLIC cannot execute the organization access helper'
);

SELECT ok(
  NOT has_function_privilege('public', 'private.billing_has_capability(uuid,uuid,text)', 'EXECUTE'),
  'PUBLIC cannot execute the capability helper'
);

SELECT ok(
  has_function_privilege('authenticated', 'private.billing_has_organization_access(uuid)', 'EXECUTE'),
  'authenticated callers can execute the organization access helper'
);

SELECT ok(
  has_function_privilege('authenticated', 'private.billing_has_capability(uuid,uuid,text)', 'EXECUTE'),
  'authenticated callers can execute the capability helper'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.billing_role_capabilities', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.billing_role_capabilities', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.billing_role_capabilities', 'DELETE'),
  'authenticated callers cannot mutate the capability catalog'
);

-- Alpha administrator: organization-wide read/write, no Bravo visibility.
SELECT set_config('request.jwt.claim.sub', '21000000-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"21000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT array_agg(id ORDER BY id) FROM public.billing_accounts),
  ARRAY['21000000-0000-0000-0000-000000000200'::uuid],
  'administrator sees only accounts in the assigned organization'
);

SELECT is(
  (SELECT count(*) FROM public.billing_accounts WHERE id = '22000000-0000-0000-0000-000000000200'),
  0::bigint,
  'administrator cannot see a cross-organization account'
);

SELECT lives_ok(
  $$UPDATE public.billing_accounts
      SET customer_name = 'Alpha Account Admin Updated', updated_at = now()
      WHERE id = '21000000-0000-0000-0000-000000000200'$$,
  'administrator can update a same-organization account'
);

SELECT results_eq(
  $$UPDATE public.billing_accounts
      SET customer_name = 'Bravo Forbidden Admin Update'
      WHERE id = '22000000-0000-0000-0000-000000000200'
      RETURNING customer_name$$,
  ARRAY[]::text[],
  'administrator cross-organization update affects no rows'
);

SELECT ok(
  private.billing_has_capability(
    '21000000-0000-0000-0000-000000000100',
    '21000000-0000-0000-0000-000000000200',
    'role.manage'
  ),
  'administrator has role-management authority'
);

RESET ROLE;

-- Alpha operator: account/contact operations only inside the assigned account.
SELECT set_config('request.jwt.claim.sub', '21000000-0000-0000-0000-000000000002', true);
SELECT set_config('request.jwt.claims', '{"sub":"21000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT is((SELECT count(*) FROM public.billing_accounts), 1::bigint, 'operator sees the assigned account');
SELECT is(
  (SELECT count(*) FROM public.billing_accounts WHERE id = '22000000-0000-0000-0000-000000000200'),
  0::bigint,
  'operator cannot see a cross-organization account'
);
SELECT results_eq(
  $$UPDATE public.billing_accounts
      SET customer_name = 'Alpha Account Operator Updated', updated_at = now()
      WHERE id = '21000000-0000-0000-0000-000000000200'
      RETURNING customer_name$$,
  ARRAY['Alpha Account Operator Updated']::text[],
  'operator can update the assigned account'
);
SELECT ok(
  NOT private.billing_has_capability(
    '21000000-0000-0000-0000-000000000100',
    '21000000-0000-0000-0000-000000000200',
    'role.manage'
  ),
  'operator cannot manage role assignments'
);

RESET ROLE;

-- Alpha reviewer: read/review authority with no account mutation.
SELECT set_config('request.jwt.claim.sub', '21000000-0000-0000-0000-000000000003', true);
SELECT set_config('request.jwt.claims', '{"sub":"21000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT is((SELECT count(*) FROM public.billing_accounts), 1::bigint, 'reviewer sees the assigned account');
SELECT is(
  (SELECT count(*) FROM public.billing_accounts WHERE id = '22000000-0000-0000-0000-000000000200'),
  0::bigint,
  'reviewer cannot see a cross-organization account'
);
SELECT results_eq(
  $$UPDATE public.billing_accounts
      SET customer_name = 'Reviewer Forbidden Update'
      WHERE id = '21000000-0000-0000-0000-000000000200'
      RETURNING customer_name$$,
  ARRAY[]::text[],
  'reviewer account update affects no rows'
);
SELECT ok(
  private.billing_has_capability(
    '21000000-0000-0000-0000-000000000100',
    '21000000-0000-0000-0000-000000000200',
    'evidence.review'
  ),
  'reviewer has evidence-review authority'
);

RESET ROLE;

-- Alpha auditor: organization-wide read and audit visibility, no account mutation.
SELECT set_config('request.jwt.claim.sub', '21000000-0000-0000-0000-000000000004', true);
SELECT set_config('request.jwt.claims', '{"sub":"21000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT is((SELECT count(*) FROM public.billing_accounts), 1::bigint, 'auditor sees accounts only in the assigned organization');
SELECT is(
  (SELECT count(*) FROM public.billing_accounts WHERE id = '22000000-0000-0000-0000-000000000200'),
  0::bigint,
  'auditor cannot see a cross-organization account'
);
SELECT ok((SELECT count(*) FROM public.billing_audit_events) > 0, 'auditor can read same-organization audit events');
SELECT results_eq(
  $$UPDATE public.billing_accounts
      SET customer_name = 'Auditor Forbidden Update'
      WHERE id = '21000000-0000-0000-0000-000000000200'
      RETURNING customer_name$$,
  ARRAY[]::text[],
  'auditor account update affects no rows'
);

RESET ROLE;

-- Alpha customer: own account and contact only, no operational mutation.
SELECT set_config('request.jwt.claim.sub', '21000000-0000-0000-0000-000000000005', true);
SELECT set_config('request.jwt.claims', '{"sub":"21000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT is((SELECT count(*) FROM public.billing_accounts), 1::bigint, 'customer sees the bound billing account');
SELECT is(
  (SELECT count(*) FROM public.billing_accounts WHERE id = '22000000-0000-0000-0000-000000000200'),
  0::bigint,
  'customer cannot see a cross-organization account'
);
SELECT is(
  (SELECT array_agg(id ORDER BY id) FROM public.billing_contacts),
  ARRAY['21000000-0000-0000-0000-000000000300'::uuid],
  'customer sees only the contact bound to the authenticated user'
);
SELECT results_eq(
  $$UPDATE public.billing_accounts
      SET customer_name = 'Customer Forbidden Update'
      WHERE id = '21000000-0000-0000-0000-000000000200'
      RETURNING customer_name$$,
  ARRAY[]::text[],
  'customer account update affects no rows'
);
SELECT ok(
  NOT private.billing_has_capability(
    '21000000-0000-0000-0000-000000000100',
    '21000000-0000-0000-0000-000000000200',
    'contact.manage'
  ),
  'customer cannot manage billing contacts'
);

RESET ROLE;

-- Role union, denied destructive operations, and audit integrity.
SELECT set_config('request.jwt.claim.sub', '21000000-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"21000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$INSERT INTO public.billing_role_assignments (organization_id, account_id, sales_id, role)
    SELECT
      '21000000-0000-0000-0000-000000000100'::uuid,
      '21000000-0000-0000-0000-000000000200'::uuid,
      id,
      'reviewer'
    FROM public.sales
    WHERE user_id = '21000000-0000-0000-0000-000000000001'::uuid$$,
  'administrator can receive an additional account role'
);

SELECT ok(
  private.billing_has_capability(
    '21000000-0000-0000-0000-000000000100',
    '21000000-0000-0000-0000-000000000200',
    'evidence.review'
  ) AND private.billing_has_capability(
    '21000000-0000-0000-0000-000000000100',
    '21000000-0000-0000-0000-000000000200',
    'account.update'
  ),
  'multiple roles combine capabilities without reducing administrator authority'
);

SELECT throws_ok(
  $$DELETE FROM public.billing_accounts
    WHERE id = '21000000-0000-0000-0000-000000000200'$$,
  '42501',
  'permission denied for table billing_accounts',
  'authenticated callers cannot hard-delete billing accounts'
);

RESET ROLE;

SELECT is(
  (SELECT customer_name FROM public.billing_accounts WHERE id = '22000000-0000-0000-0000-000000000200'),
  'Bravo Account Fixture',
  'denied cross-organization mutations leave the target account unchanged'
);

SELECT is(
  (
    SELECT jsonb_build_object(
      'total', count(*),
      'exact', count(*) FILTER (
        WHERE subject_type = 'billing_accounts'
          AND subject_id = '21000000-0000-0000-0000-000000000200'
          AND result = 'succeeded'
          AND reason IS NULL
      )
    )
    FROM public.billing_audit_events
    WHERE organization_id = '21000000-0000-0000-0000-000000000100'
      AND account_id = '21000000-0000-0000-0000-000000000200'
      AND action = 'billing_accounts.update'
  ),
  '{"exact": 2, "total": 2}'::jsonb,
  'two allowed account updates append exact succeeded audit events without reasons'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM public.billing_audit_events
    WHERE details - ARRAY['role', 'status'] <> '{}'::jsonb
  ),
  'generic audit events persist only allowlisted role and status detail keys'
);

SELECT set_config('request.jwt.claim.sub', '21000000-0000-0000-0000-000000000004', true);
SELECT set_config('request.jwt.claims', '{"sub":"21000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$UPDATE public.billing_audit_events
    SET reason = 'tampered'
    WHERE organization_id = '21000000-0000-0000-0000-000000000100'$$,
  '42501',
  'permission denied for table billing_audit_events',
  'authenticated auditor has no audit update grant'
);

RESET ROLE;

SELECT throws_ok(
  $$UPDATE public.billing_audit_events
    SET reason = 'tampered'
    WHERE id = (SELECT min(id) FROM public.billing_audit_events)$$,
  'P0001',
  'Billing audit events are append-only',
  'audit update is rejected even for the migration owner'
);

SELECT throws_ok(
  $$DELETE FROM public.billing_audit_events
    WHERE id = (SELECT min(id) FROM public.billing_audit_events)$$,
  'P0001',
  'Billing audit events are append-only',
  'audit delete is rejected even for the migration owner'
);

SELECT * FROM finish();
ROLLBACK;
