begin;

create extension if not exists pgtap;

select plan(24);

select has_view(
  'public',
  'customer_journeys',
  'customer_journeys is created by a clean replay'
);

select lives_ok(
  $$select * from public.customer_journeys limit 1$$,
  'customer_journeys is executable against current contact columns'
);

select has_function(
  'public',
  'convert_lead_to_contact',
  array['bigint', 'text', 'bigint'],
  'lead conversion keeps its public RPC signature'
);

select ok(
  (
    select coalesce(array_to_string(p.proconfig, ','), '') in (
      'search_path=',
      'search_path=""'
    )
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'convert_lead_to_contact'
      and pg_get_function_identity_arguments(p.oid) = 'p_lead_id bigint, p_deal_name text, p_deal_amount bigint'
  ),
  'lead conversion has an empty search_path'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.convert_lead_to_contact(bigint,text,bigint)',
    'execute'
  ),
  'authenticated callers may execute lead conversion'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.convert_lead_to_contact(bigint,text,bigint)',
    'execute'
  ),
  'anonymous callers may not execute lead conversion'
);

select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(
      coalesce(p.proacl, acldefault('f', p.proowner))
    ) acl
    where n.nspname = 'public'
      and p.proname = 'convert_lead_to_contact'
      and pg_get_function_identity_arguments(p.oid) = 'p_lead_id bigint, p_deal_name text, p_deal_amount bigint'
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ),
  'PUBLIC has no implicit execute grant'
);

select has_column('public', 'contacts', 'email_jsonb', 'contacts use JSONB email storage');
select has_column('public', 'contacts', 'phone_jsonb', 'contacts use JSONB phone storage');
select hasnt_column('public', 'contacts', 'email', 'removed contacts.email is absent');
select hasnt_column(
  'public',
  'contacts',
  'phone_1_number',
  'removed contacts.phone_1_number is absent'
);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at
) values
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'release-owner-one@example.invalid',
    '',
    now(),
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'release-owner-two@example.invalid',
    '',
    now(),
    now(),
    now()
  );

insert into public.sales (
  id,
  first_name,
  last_name,
  email,
  administrator,
  user_id
) values
  (
    910001,
    'Release',
    'Owner One',
    'release-owner-one@example.invalid',
    false,
    '10000000-0000-0000-0000-000000000001'
  ),
  (
    910002,
    'Release',
    'Owner Two',
    'release-owner-two@example.invalid',
    false,
    '10000000-0000-0000-0000-000000000002'
  );

insert into public.leads (
  id,
  first_name,
  last_name,
  email,
  phone,
  company_name,
  job_title,
  sales_id
) values
  (
    920001,
    'First',
    'Lead',
    'first.lead@example.invalid',
    '+15550000001',
    'Owner One Company',
    'Buyer',
    910001
  ),
  (
    920002,
    'Second',
    'Lead',
    'second.lead@example.invalid',
    '+15550000002',
    'Owner Two Company',
    'Buyer',
    910002
  );

create temporary table conversion_result (result jsonb);
grant insert, select on table conversion_result to authenticated;

select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select lives_ok(
  $$
    insert into pg_temp.conversion_result (result)
    select public.convert_lead_to_contact(920001, 'Release Deal', 125000)
  $$,
  'same-owner authenticated conversion succeeds once'
);

reset role;

select ok(
  (select result ?& array['contact_id', 'deal_id', 'company_id'] from conversion_result),
  'conversion returns the three caller-facing result keys'
);

select is(
  (select email_jsonb from public.contacts where sales_id = 910001),
  jsonb_build_array(
    jsonb_build_object('email', 'first.lead@example.invalid', 'type', 'Other')
  ),
  'conversion writes current email_jsonb shape'
);

select is(
  (select phone_jsonb from public.contacts where sales_id = 910001),
  jsonb_build_array(
    jsonb_build_object('number', '+15550000001', 'type', 'Other')
  ),
  'conversion writes current phone_jsonb shape'
);

select is(
  (select sales_id from public.deals where name = 'Release Deal'),
  910001::bigint,
  'created deal remains bound to the caller owner'
);

select is(
  (select status from public.leads where id = 920001),
  'converted',
  'successful conversion marks only the selected lead converted'
);

select is(
  (select count(*) from public.lead_activities where lead_id = 920001),
  1::bigint,
  'successful conversion records one conversion activity'
);

select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select throws_ok(
  $$select public.convert_lead_to_contact(920002, 'Forbidden Deal', 9000)$$,
  'P0001',
  'Lead not found or not authorized',
  'cross-owner conversion is denied before mutation'
);

reset role;

select is(
  (select status from public.leads where id = 920002),
  'new',
  'cross-owner denial leaves the lead unchanged'
);

select is(
  (select count(*) from public.contacts where sales_id = 910002),
  0::bigint,
  'cross-owner denial creates no contact'
);

set local role authenticated;

select throws_ok(
  $$select public.convert_lead_to_contact(929999, null, null)$$,
  'P0001',
  'Lead not found or not authorized',
  'missing lead conversion fails without mutation'
);

select throws_ok(
  $$select public.convert_lead_to_contact(920001, 'Duplicate Deal', 125000)$$,
  'P0001',
  'Lead already converted',
  'repeat conversion is denied'
);

reset role;

select is(
  (select count(*) from public.contacts where sales_id = 910001),
  1::bigint,
  'repeat denial preserves the single original contact'
);

select * from finish();
rollback;
