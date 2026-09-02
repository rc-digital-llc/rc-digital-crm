BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(10);

SELECT ok(
  (SELECT coalesce(array_to_string(procedure_record.proconfig, ','), '') IN ('search_path=', 'search_path=""')
   FROM pg_proc AS procedure_record
   WHERE procedure_record.oid = 'public.get_billing_capability_summary()'::regprocedure),
  'billing capability summary has an empty search_path'
);

SELECT ok(
  NOT has_function_privilege('public', 'public.get_billing_capability_summary()', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.get_billing_capability_summary()', 'EXECUTE'),
  'billing capability summary is authenticated-only'
);

SELECT set_config('request.jwt.claim.sub', '21000000-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"21000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT ok(
  public.get_billing_capability_summary()->'global_capabilities' ?&
    ARRAY['account.read', 'account.create', 'role.manage', 'automation.manage'],
  'administrator receives the normalized global capability union'
);

SELECT ok(
  (public.get_billing_account_access_summary('21000000-0000-0000-0000-000000000200')->'roles') @>
    '[{"role":"administrator","scope_label":"All RC Digital billing accounts"}]'::jsonb,
  'access summary presents readable global role scope'
);

SELECT ok(
  public.get_billing_account_access_summary('21000000-0000-0000-0000-000000000200')::text !~
    'organization_id|sales_id|auth_user_id|provider_reference',
  'access summary omits tenant, subject, auth, and raw provider authority fields'
);

SELECT lives_ok(
  $$SELECT public.assign_billing_role(
    '21000000-0000-0000-0000-000000000200',
    (SELECT id FROM public.sales WHERE user_id = '21000000-0000-0000-0000-000000000002'::uuid),
    'reviewer'
  )$$,
  'administrator can assign an additional account-scoped role'
);

SELECT lives_ok(
  $$SELECT public.end_billing_role_assignment(
    (SELECT id FROM public.billing_role_assignments
     WHERE account_id = '21000000-0000-0000-0000-000000000200'
       AND role = 'reviewer'
       AND sales_id = (SELECT id FROM public.sales WHERE user_id = '21000000-0000-0000-0000-000000000002'::uuid)
     ORDER BY created_at DESC LIMIT 1),
    'Access responsibilities changed',
    now() + interval '1 second'
  )$$,
  'administrator ends the assignment with a reason and effective time'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '21000000-0000-0000-0000-000000000002', true);
SELECT set_config('request.jwt.claims', '{"sub":"21000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT ok(
  (public.get_billing_capability_summary()->'accounts' @>
    '[{"account_id":"21000000-0000-0000-0000-000000000200"}]'::jsonb)
    AND NOT (public.get_billing_capability_summary()->'global_capabilities' ? 'role.manage'),
  'operator receives account scope without role-management authority'
);

SELECT throws_ok(
  $$SELECT public.assign_billing_role(
    '21000000-0000-0000-0000-000000000200',
    (SELECT id FROM public.sales WHERE user_id = '21000000-0000-0000-0000-000000000002'::uuid),
    'reviewer'
  )$$,
  'P0001',
  'Billing role assignment is not authorized',
  'operator cannot bypass presentation and assign a role'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '21000000-0000-0000-0000-000000000005', true);
SELECT set_config('request.jwt.claims', '{"sub":"21000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT ok(
  (public.get_billing_capability_summary()->'accounts' @>
    '[{"account_id":"21000000-0000-0000-0000-000000000200"}]'::jsonb)
    AND public.get_billing_capability_summary()::text !~ 'role.manage|automation.manage',
  'customer summary remains account-scoped and non-administrative'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
