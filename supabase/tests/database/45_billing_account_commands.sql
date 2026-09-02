BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(9);

SELECT ok(
  (SELECT coalesce(array_to_string(procedure_record.proconfig, ','), '') IN ('search_path=', 'search_path=""')
   FROM pg_proc AS procedure_record
   WHERE procedure_record.oid = 'public.save_billing_account_boundary(jsonb)'::regprocedure),
  'billing account boundary command has an empty search_path'
);

SELECT ok(
  NOT has_function_privilege('public', 'public.save_billing_account_boundary(jsonb)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.save_billing_account_boundary(jsonb)', 'EXECUTE'),
  'only authenticated callers can invoke the billing account boundary command'
);

SELECT set_config('request.jwt.claim.sub', '21000000-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"21000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$SELECT public.save_billing_account_boundary(
    jsonb_build_object(
      'account_id', NULL,
      'customer_name', 'Command-created account',
      'billing_status', 'active',
      'responsible_owner_sales_id', (
        SELECT id FROM public.sales
        WHERE user_id = '21000000-0000-0000-0000-000000000001'::uuid
      ),
      'billing_contacts', jsonb_build_array(jsonb_build_object(
        'id', NULL,
        'name', 'Command contact',
        'email', NULL,
        'phone', '+15555550100',
        'preferred_contact_method', 'text',
        'auth_user_id', NULL,
        'active', true,
        'end_reason', NULL
      )),
      'lifecycle_reason', NULL
    )
  )$$,
  'administrator creates a complete account boundary without supplying organization scope'
);

SELECT is(
  (SELECT organization_id FROM public.billing_accounts WHERE customer_name = 'Command-created account'),
  '21000000-0000-0000-0000-000000000100'::uuid,
  'the command derives organization scope from the authenticated assignment'
);

SELECT is(
  (SELECT count(*) FROM public.billing_account_owners AS owner_record
   JOIN public.billing_accounts AS account ON account.id = owner_record.account_id
   WHERE account.customer_name = 'Command-created account' AND owner_record.effective_until IS NULL),
  1::bigint,
  'the command creates exactly one active responsible owner'
);

SELECT is(
  (SELECT jsonb_build_object(
    'count', count(*),
    'method', min(contact.preferred_contact_method),
    'active', bool_and(contact.active)
   )
   FROM public.billing_contacts AS contact
   JOIN public.billing_accounts AS account ON account.id = contact.account_id
   WHERE account.customer_name = 'Command-created account'),
  '{"count": 1, "method": "text", "active": true}'::jsonb,
  'the command creates the validated active contact including text preference'
);

SELECT throws_ok(
  $$SELECT public.save_billing_account_boundary(
    jsonb_build_object(
      'account_id', (SELECT id FROM public.billing_accounts WHERE customer_name = 'Command-created account'),
      'customer_name', 'Command-created account',
      'billing_status', 'active',
      'responsible_owner_sales_id', (
        SELECT id FROM public.sales
        WHERE user_id = '22000000-0000-0000-0000-000000000001'::uuid
      ),
      'billing_contacts', (
        SELECT jsonb_agg(jsonb_build_object(
          'id', contact.id, 'name', contact.name, 'email', contact.email,
          'phone', contact.phone,
          'preferred_contact_method', contact.preferred_contact_method,
          'auth_user_id', contact.auth_user_id, 'active', contact.active,
          'end_reason', contact.end_reason
        ))
        FROM public.billing_contacts AS contact
        JOIN public.billing_accounts AS account ON account.id = contact.account_id
        WHERE account.customer_name = 'Command-created account'
      ),
      'lifecycle_reason', NULL
    )
  )$$,
  'P0001',
  'Responsible owner is invalid',
  'a responsible owner must hold an active assignment in the derived organization'
);

SELECT throws_ok(
  $$SELECT public.save_billing_account_boundary(
    '{"account_id":null,"customer_name":"Bad","billing_status":"active","responsible_owner_sales_id":1,"billing_contacts":[],"lifecycle_reason":null,"organization_id":"22000000-0000-0000-0000-000000000100"}'::jsonb
  )$$,
  'P0001',
  'Billing account payload is invalid',
  'browser organization authority is rejected'
);

RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '22000000-0000-0000-0000-000000000003', true);
SELECT set_config('request.jwt.claims', '{"sub":"22000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT public.save_billing_account_boundary(
    jsonb_build_object(
      'account_id', NULL,
      'customer_name', 'Reviewer denied account',
      'billing_status', 'active',
      'responsible_owner_sales_id', 1,
      'billing_contacts', jsonb_build_array(jsonb_build_object(
        'id', NULL, 'name', 'Denied contact', 'email', 'denied@example.com',
        'phone', NULL, 'preferred_contact_method', 'email',
        'auth_user_id', NULL, 'active', true, 'end_reason', NULL
      )),
      'lifecycle_reason', NULL
    )
  )$$,
  'P0001',
  'Billing account save is not authorized',
  'a reviewer cannot create a billing account boundary'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
