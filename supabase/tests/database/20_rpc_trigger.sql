BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(29);

CREATE TEMPORARY TABLE conversion_result (result jsonb);
GRANT INSERT, SELECT ON TABLE conversion_result TO authenticated;

SELECT set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$
    INSERT INTO pg_temp.conversion_result (result)
    SELECT public.convert_lead_to_contact(940001, 'Converted Deal', 125000)
  $$,
  'same-owner conversion succeeds through the real RPC'
);

RESET ROLE;

SELECT ok(
  (SELECT result ?& ARRAY['contact_id', 'deal_id', 'company_id'] FROM conversion_result),
  'conversion returns all public result identities'
);

SELECT is(
  (SELECT count(*) FROM public.contacts WHERE sales_id = 930001),
  1::bigint,
  'conversion creates exactly one contact'
);

SELECT is(
  (SELECT sales_id FROM public.contacts WHERE sales_id = 930001),
  930001::bigint,
  'converted contact remains owner-bound'
);

SELECT is(
  (SELECT email_jsonb FROM public.contacts WHERE sales_id = 930001),
  '[{"email":"owner-one-lead@release.example","type":"Other"}]'::jsonb,
  'converted contact uses the current email JSON shape'
);

SELECT is(
  (SELECT count(*) FROM public.deals WHERE name = 'Converted Deal'),
  1::bigint,
  'conversion creates exactly one requested deal'
);

SELECT is(
  (SELECT sales_id FROM public.deals WHERE name = 'Converted Deal'),
  930001::bigint,
  'converted deal remains owner-bound'
);

SELECT is(
  (SELECT status FROM public.leads WHERE id = 940001),
  'converted',
  'successful conversion marks the selected lead converted'
);

SELECT is(
  (SELECT count(*) FROM public.lead_activities WHERE lead_id = 940001),
  2::bigint,
  'conversion appends exactly one status activity'
);

SELECT is(
  (SELECT count(*) FROM public.companies WHERE name = 'Owner One Company' AND sales_id = 930001),
  1::bigint,
  'conversion reuses the existing same-owner company'
);

SELECT set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT public.convert_lead_to_contact(940002, 'Denied Deal', 50000)$$,
  'P0001',
  'Lead not found or not authorized',
  'cross-owner conversion is denied as not found'
);

RESET ROLE;

SELECT is((SELECT status FROM public.leads WHERE id = 940002), 'new', 'denied lead remains new');
SELECT is((SELECT count(*) FROM public.contacts WHERE sales_id = 930002), 0::bigint, 'denial creates no owner-two contact');
SELECT is((SELECT count(*) FROM public.deals WHERE sales_id = 930002), 0::bigint, 'denial creates no owner-two deal');
SELECT is((SELECT count(*) FROM public.lead_activities WHERE lead_id = 940002), 1::bigint, 'denial appends no owner-two activity');
SELECT is((SELECT count(*) FROM public.companies WHERE sales_id = 930002), 1::bigint, 'denial creates no owner-two company');

SELECT set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT public.convert_lead_to_contact(940003, 'Force Failure', 75000)$$,
  'P0001',
  'forced test-only deal failure',
  'an internal deal failure aborts the conversion statement'
);

RESET ROLE;

SELECT is((SELECT status FROM public.leads WHERE id = 940003), 'new', 'failed conversion leaves lead state unchanged');
SELECT is((SELECT count(*) FROM public.companies WHERE name = 'Atomic Failure Company'), 0::bigint, 'failed conversion rolls back company');
SELECT is((SELECT count(*) FROM public.contacts WHERE email_jsonb @> '[{"email":"atomic-failure@release.example"}]'::jsonb), 0::bigint, 'failed conversion rolls back contact');
SELECT is((SELECT count(*) FROM public.deals WHERE name = 'Force Failure'), 0::bigint, 'failed conversion rolls back deal');
SELECT is((SELECT count(*) FROM public.lead_activities WHERE lead_id = 940003), 0::bigint, 'failed conversion rolls back activity');

INSERT INTO public.touchpoints (
  id, created_at, lead_id, anonymous_id, touchpoint_type, channel, source, metadata, sales_id
) VALUES (
  980010, '2026-08-25T20:10:00Z', 940003, 'owner-one-first',
  'page_view', 'organic_search', 'owner-one-first-source', '{}'::jsonb, 930001
);

SELECT pass('first attribution touchpoint insert succeeds');

SELECT ok(
  (SELECT is_first_touch AND is_last_touch FROM public.touchpoints WHERE id = 980010),
  'first touchpoint is both first and last'
);

INSERT INTO public.touchpoints (
  id, created_at, lead_id, anonymous_id, touchpoint_type, channel, source, metadata, sales_id
) VALUES (
  980011, '2026-08-25T20:11:00Z', 940003, 'owner-one-last',
  'form_submit', 'direct', 'owner-one-last-source', '{}'::jsonb, 930001
);

SELECT pass('second attribution touchpoint insert succeeds');

SELECT ok(
  (SELECT is_first_touch AND NOT is_last_touch FROM public.touchpoints WHERE id = 980010),
  'prior touchpoint remains first and is no longer last'
);

SELECT ok(
  (SELECT is_last_touch AND NOT is_first_touch FROM public.touchpoints WHERE id = 980011),
  'new touchpoint becomes last without replacing first'
);

SELECT set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$SELECT * FROM public.channel_attribution_summary$$,
  'security-invoker attribution view is queryable by its owner'
);

SELECT is(
  (SELECT count(*) FROM public.channel_attribution_summary WHERE source = 'owner-two-source'),
  0::bigint,
  'security-invoker attribution view hides cross-owner source rows'
);

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
