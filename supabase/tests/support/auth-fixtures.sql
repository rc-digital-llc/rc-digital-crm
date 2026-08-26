DROP SCHEMA IF EXISTS test_release CASCADE;

DELETE FROM public.touchpoints WHERE id BETWEEN 980001 AND 980099;
DELETE FROM public.lead_activities WHERE lead_id BETWEEN 940001 AND 940099;
DELETE FROM public.leads WHERE id BETWEEN 940001 AND 940099;
DELETE FROM public.deals
WHERE sales_id IN (930001, 930002)
  AND name IN ('Converted Deal', 'Force Failure');
DELETE FROM public.contacts WHERE sales_id IN (930001, 930002);
DELETE FROM public.companies
WHERE sales_id IN (930001, 930002)
  AND name IN ('Owner One Company', 'Owner Two Company', 'Atomic Failure Company');
DELETE FROM public.sales WHERE id IN (930001, 930002);
DELETE FROM auth.users
WHERE id IN (
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002'
);

CREATE SCHEMA test_release;

CREATE TABLE test_release.principals (
  label text PRIMARY KEY,
  user_id uuid NOT NULL,
  sales_id bigint NOT NULL
);

INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
VALUES
  (
    '00000000-0000-0000-0000-000000000000',
    '20000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'sql-owner-one@release.example',
    '',
    '2026-08-25T20:00:00Z',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"first_name":"SQL","last_name":"Owner One"}'::jsonb,
    '2026-08-25T20:00:00Z',
    '2026-08-25T20:00:00Z'
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '20000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'sql-owner-two@release.example',
    '',
    '2026-08-25T20:01:00Z',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"first_name":"SQL","last_name":"Owner Two"}'::jsonb,
    '2026-08-25T20:01:00Z',
    '2026-08-25T20:01:00Z'
  );

UPDATE public.sales
SET id = 930001, administrator = false, disabled = false
WHERE user_id = '20000000-0000-0000-0000-000000000001';

UPDATE public.sales
SET id = 930002, administrator = false, disabled = false
WHERE user_id = '20000000-0000-0000-0000-000000000002';

INSERT INTO test_release.principals (label, user_id, sales_id)
VALUES
  ('owner_one', '20000000-0000-0000-0000-000000000001', 930001),
  ('owner_two', '20000000-0000-0000-0000-000000000002', 930002);

INSERT INTO public.companies (id, created_at, name, sales_id)
VALUES
  (950001, '2026-08-25T20:02:00Z', 'Owner One Company', 930001),
  (950002, '2026-08-25T20:03:00Z', 'Owner Two Company', 930002);

INSERT INTO public.leads (
  id,
  created_at,
  updated_at,
  first_name,
  last_name,
  email,
  phone,
  company_name,
  job_title,
  source,
  status,
  sales_id
)
VALUES
  (
    940001,
    '2026-08-25T20:04:00Z',
    '2026-08-25T20:04:00Z',
    'Owner',
    'One Lead',
    'owner-one-lead@release.example',
    '+15550200001',
    'Owner One Company',
    'Buyer',
    'manual',
    'new',
    930001
  ),
  (
    940002,
    '2026-08-25T20:05:00Z',
    '2026-08-25T20:05:00Z',
    'Owner',
    'Two Lead',
    'owner-two-lead@release.example',
    '+15550200002',
    'Owner Two Company',
    'Buyer',
    'referral',
    'new',
    930002
  ),
  (
    940003,
    '2026-08-25T20:06:00Z',
    '2026-08-25T20:06:00Z',
    'Atomic',
    'Failure Lead',
    'atomic-failure@release.example',
    NULL,
    'Atomic Failure Company',
    NULL,
    'manual',
    'new',
    930001
  );

INSERT INTO public.lead_activities (
  id,
  created_at,
  lead_id,
  sales_id,
  activity_type,
  description,
  metadata,
  score_delta
)
VALUES
  (960001, '2026-08-25T20:07:00Z', 940001, 930001, 'page_view', 'Owner one activity', '{}'::jsonb, 1),
  (960002, '2026-08-25T20:08:00Z', 940002, 930002, 'page_view', 'Owner two activity', '{}'::jsonb, 1);

INSERT INTO public.touchpoints (
  id,
  created_at,
  lead_id,
  anonymous_id,
  touchpoint_type,
  channel,
  source,
  metadata,
  sales_id
)
VALUES (
  980001,
  '2026-08-25T20:09:00Z',
  940002,
  'owner-two-anonymous',
  'page_view',
  'referral',
  'owner-two-source',
  '{}'::jsonb,
  930002
);

CREATE FUNCTION test_release.reject_named_deal()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.name = 'Force Failure' THEN
    RAISE EXCEPTION 'forced test-only deal failure';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER test_release_reject_named_deal
BEFORE INSERT ON public.deals
FOR EACH ROW EXECUTE FUNCTION test_release.reject_named_deal();
