BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(22);

SELECT has_schema('test_release', 'test support schema is loaded only for this transaction');

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.leads'::regclass),
  'leads has live row-level security enabled'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.lead_activities'::regclass),
  'lead activities has live row-level security enabled'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.touchpoints'::regclass),
  'touchpoints has live row-level security enabled'
);

SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.convert_lead_to_contact(bigint,text,bigint)',
    'EXECUTE'
  ),
  'authenticated role can execute the caller-bound conversion RPC'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.convert_lead_to_contact(bigint,text,bigint)',
    'EXECUTE'
  ),
  'anonymous role cannot execute the privileged conversion RPC'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_proc AS procedure_record,
      LATERAL aclexplode(procedure_record.proacl) AS privilege
    WHERE procedure_record.oid = 'public.convert_lead_to_contact(bigint,text,bigint)'::regprocedure
      AND privilege.grantee = 0
      AND privilege.privilege_type = 'EXECUTE'
  ),
  'PUBLIC has no conversion RPC execute grant'
);

SELECT set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT array_agg(id ORDER BY id) FROM public.leads),
  ARRAY[940001, 940003]::bigint[],
  'owner one can select only owner-one leads'
);

SELECT is(
  (SELECT count(*) FROM public.leads WHERE id = 940002),
  0::bigint,
  'owner one cannot select owner-two lead'
);

SELECT lives_ok(
  $$
    INSERT INTO public.leads (
      id, first_name, last_name, email, source, status, sales_id
    ) VALUES (
      940004, 'Inserted', 'Owner One', 'inserted@release.example',
      'manual', 'new', 930001
    )
  $$,
  'owner one can insert an owner-one lead'
);

SELECT is(
  (SELECT count(*) FROM public.leads WHERE id = 940004),
  1::bigint,
  'same-owner insert is visible through RLS'
);

SELECT throws_ok(
  $$
    INSERT INTO public.leads (
      id, first_name, last_name, email, source, status, sales_id
    ) VALUES (
      940005, 'Denied', 'Owner Two', 'denied@release.example',
      'manual', 'new', 930002
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "leads"',
  'owner one cannot insert an owner-two lead'
);

SELECT lives_ok(
  $$UPDATE public.leads SET first_name = 'Unauthorized' WHERE id = 940002$$,
  'cross-owner update completes without exposing a row'
);

SELECT lives_ok(
  $$DELETE FROM public.leads WHERE id = 940002$$,
  'cross-owner delete completes without exposing a row'
);

SELECT is(
  (SELECT count(*) FROM public.lead_activities),
  1::bigint,
  'owner one sees only owner-one lead activity'
);

SELECT throws_ok(
  $$
    INSERT INTO public.lead_activities (
      id, lead_id, sales_id, activity_type, description, score_delta
    ) VALUES (
      960003, 940002, 930002, 'note', 'Denied cross-owner activity', 0
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "lead_activities"',
  'owner one cannot insert activity for owner-two lead'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000099', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000099","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  (SELECT count(*) FROM public.leads),
  0::bigint,
  'invalid authenticated subject sees zero owner rows'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL ROLE anon;

SELECT throws_ok(
  $$SELECT count(*) FROM public.leads$$,
  '42501',
  'permission denied for table leads',
  'anonymous role cannot read lead rows'
);

SELECT throws_ok(
  $$SELECT public.convert_lead_to_contact(940001, NULL, NULL)$$,
  '42501',
  'permission denied for function convert_lead_to_contact',
  'anonymous role cannot call the privileged RPC'
);

RESET ROLE;

SELECT is(
  (SELECT first_name FROM public.leads WHERE id = 940002),
  'Owner',
  'cross-owner update and delete left owner-two lead unchanged'
);

SELECT is(
  (SELECT count(*) FROM public.leads WHERE id = 940005),
  0::bigint,
  'denied cross-owner insert left no row'
);

SELECT is(
  (SELECT count(*) FROM public.lead_activities WHERE id = 960003),
  0::bigint,
  'denied cross-owner activity left no row'
);

SELECT * FROM finish();
ROLLBACK;
