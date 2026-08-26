\set ON_ERROR_STOP on

BEGIN;

-- fixture-category: fixed-identities-and-timestamps
-- fixture-category: two-owners
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
    '10000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'owner-one@baseline.example',
    '',
    '2026-01-01T00:00:00Z',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"first_name":"Baseline","last_name":"Owner One"}'::jsonb,
    '2026-01-01T00:00:00Z',
    '2026-01-01T00:00:00Z'
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'owner-two@baseline.example',
    '',
    '2026-01-02T00:00:00Z',
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"first_name":"Baseline","last_name":"Owner Two"}'::jsonb,
    '2026-01-02T00:00:00Z',
    '2026-01-02T00:00:00Z'
  );

UPDATE public.sales
SET id = 1001, administrator = false, disabled = false
WHERE user_id = '10000000-0000-0000-0000-000000000001';

UPDATE public.sales
SET id = 1002, administrator = false, disabled = false
WHERE user_id = '10000000-0000-0000-0000-000000000002';

INSERT INTO public.configuration (id, config)
VALUES (
  1,
  '{"dealStages":[{"value":"lead","label":"Lead"},{"value":"paid","label":"Paid"}],"dealPipelineStatuses":["paid"]}'::jsonb
);

INSERT INTO public.companies (
  id,
  created_at,
  name,
  sector,
  website,
  sales_id,
  country,
  description,
  revenue
)
VALUES
  (
    2001,
    '2026-02-01T12:00:00Z',
    'Northwind Baseline',
    'services',
    'https://northwind.baseline.example',
    1001,
    'US',
    'Synthetic owner-one account',
    '0.01'
  ),
  (
    2002,
    '2026-02-02T12:00:00Z',
    'Café Niño — 東京',
    'retail',
    'https://cafe.baseline.example',
    1002,
    'US',
    'Résumé-only synthetic account',
    '9999999999999.99'
  ),
  (
    2003,
    '2026-02-03T12:00:00Z',
    'Unassigned Baseline',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL
  );

INSERT INTO public.contacts (
  id,
  first_name,
  last_name,
  title,
  first_seen,
  last_seen,
  status,
  company_id,
  sales_id,
  email_jsonb,
  phone_jsonb
)
VALUES
  (
    3001,
    'Avery',
    'Example',
    'Buyer',
    '2026-02-04T12:00:00Z',
    '2026-02-05T12:00:00Z',
    'is_customer',
    2001,
    1001,
    '[{"email":"avery@northwind.baseline.example","type":"Work"}]'::jsonb,
    '[{"number":"+15550100001","type":"Work"}]'::jsonb
  ),
  (
    3002,
    'Zoë',
    'Łukasz',
    NULL,
    '2026-02-06T12:00:00Z',
    NULL,
    'cold',
    2002,
    1002,
    '[]'::jsonb,
    '[]'::jsonb
  ),
  (
    3003,
    'Orphan',
    'Contact',
    NULL,
    '2026-02-07T12:00:00Z',
    NULL,
    NULL,
    NULL,
    NULL,
    '[]'::jsonb,
    '[]'::jsonb
  );

INSERT INTO public.deals (
  id,
  name,
  company_id,
  contact_ids,
  category,
  stage,
  description,
  amount,
  created_at,
  updated_at,
  expected_closing_date,
  sales_id,
  index
)
VALUES
  (
    4001,
    'Baseline Website',
    2001,
    ARRAY[3001]::bigint[],
    'website-build',
    'proposal-sent',
    'Synthetic deal with minimum unit value',
    1,
    '2026-02-08T12:00:00Z',
    '2026-02-08T12:00:00Z',
    '2026-04-01',
    1001,
    1
  ),
  (
    4002,
    'International Redesign',
    2002,
    ARRAY[3002]::bigint[],
    'redesign',
    'won',
    'Diseño — 完了',
    9007199254740991,
    '2026-02-09T12:00:00Z',
    '2026-02-10T12:00:00Z',
    NULL,
    1002,
    2
  );

-- fixture-category: projects-and-analytics
INSERT INTO public.projects (
  id,
  created_at,
  updated_at,
  name,
  description,
  project_type,
  company_id,
  deal_id,
  contact_ids,
  sales_id,
  tech_stack,
  domain,
  staging_url,
  production_url,
  repo_url,
  start_date,
  target_end_date,
  status,
  action_items,
  contract_value,
  monthly_retainer,
  total_paid,
  deliverables
)
VALUES
  (
    5001,
    '2026-02-11T12:00:00Z',
    '2026-02-11T12:00:00Z',
    'Northwind Launch',
    'Synthetic fixed-value project',
    'Website Build',
    2001,
    4001,
    ARRAY[3001]::bigint[],
    1001,
    ARRAY['PostgreSQL','TypeScript']::text[],
    'northwind.baseline.example',
    'https://staging.northwind.baseline.example',
    'https://northwind.baseline.example',
    'https://git.baseline.example/northwind/project',
    '2026-02-11',
    '2026-04-01',
    'In Progress',
    '[{"task":"Synthetic kickoff","done":true,"due":"2026-02-12"}]'::jsonb,
    0.01,
    0.00,
    0.00,
    'Homepage and measurement plan'
  ),
  (
    5002,
    '2026-02-12T12:00:00Z',
    '2026-02-12T12:00:00Z',
    '東京 Maintenance',
    NULL,
    'Maintenance',
    2002,
    NULL,
    ARRAY[]::bigint[],
    1002,
    NULL,
    'cafe.baseline.example',
    NULL,
    'https://cafe.baseline.example',
    NULL,
    '2026-02-12',
    NULL,
    'Not Started',
    '[]'::jsonb,
    9999999999999.99,
    0.01,
    9999999999999.99,
    '保守と改善'
  );

INSERT INTO public.project_analytics (
  id,
  created_at,
  project_id,
  date,
  organic_traffic,
  keyword_rankings,
  domain_authority,
  backlinks_count,
  leads_generated,
  lead_sources,
  form_submissions,
  phone_calls,
  revenue_from_leads,
  estimated_lead_value,
  page_speed_score,
  uptime_percent,
  performance_bonus_eligible,
  bonus_amount,
  bonus_notes
)
VALUES
  (
    5101,
    '2026-02-13T12:00:00Z',
    5001,
    '2026-02-13',
    1,
    '[{"keyword":"synthetic baseline","position":1,"change":0}]'::jsonb,
    0.01,
    0,
    1,
    '[{"source":"organic","count":1}]'::jsonb,
    1,
    0,
    0.01,
    9999999999999.99,
    100,
    100.00,
    true,
    0.01,
    'Synthetic boundary bonus'
  );

-- fixture-category: mutable-invoice-states
-- fixture-category: numeric-boundaries
INSERT INTO public.invoices (
  id,
  created_at,
  updated_at,
  company_id,
  project_id,
  deal_id,
  sales_id,
  invoice_number,
  description,
  amount,
  tax_rate,
  total_amount,
  line_items,
  status,
  issue_date,
  due_date,
  paid_date,
  payment_method,
  payment_reference,
  notes
)
VALUES
  (
    6001,
    '2026-02-14T12:00:00Z',
    '2026-02-14T12:00:00Z',
    2001,
    5001,
    4001,
    1001,
    'BASE-0001',
    'Minimum minor-unit invoice',
    0.01,
    0.00,
    0.01,
    '[{"description":"Synthetic unit","quantity":1,"rate":"0.01","amount":"0.01"}]'::jsonb,
    'Draft',
    '2026-02-14',
    '2026-03-16',
    NULL,
    NULL,
    NULL,
    NULL
  ),
  (
    6002,
    '2026-02-15T12:00:00Z',
    '2026-02-15T12:00:00Z',
    2001,
    NULL,
    NULL,
    1001,
    'BASE-0002',
    'Optional relationship edge invoice',
    12345.67,
    8.25,
    13364.19,
    '[]'::jsonb,
    'Sent',
    '2026-02-15',
    '2026-03-17',
    NULL,
    NULL,
    NULL,
    'No provider reference by design'
  ),
  (
    6003,
    '2026-02-16T12:00:00Z',
    '2026-02-16T12:00:00Z',
    2002,
    5002,
    4002,
    1002,
    'BASE-0003',
    'Maximum numeric boundary invoice',
    9999999999999.99,
    0.00,
    9999999999999.99,
    '[]'::jsonb,
    'Paid',
    '2026-02-16',
    '2026-03-18',
    '2026-02-20',
    'Check',
    NULL,
    'Pago sintético — 完了'
  ),
  (
    6004,
    '2026-02-17T12:00:00Z',
    '2026-02-17T12:00:00Z',
    2002,
    NULL,
    NULL,
    1002,
    'BASE-0004',
    'Overdue mutable state',
    100.00,
    0.00,
    100.00,
    '[]'::jsonb,
    'Overdue',
    '2026-01-01',
    '2026-01-31',
    NULL,
    NULL,
    NULL,
    NULL
  );

-- fixture-category: leads-and-attribution
INSERT INTO public.leads (
  id,
  created_at,
  updated_at,
  first_name,
  last_name,
  email,
  phone,
  company_name,
  source,
  source_detail,
  utm_source,
  utm_medium,
  utm_campaign,
  landing_page_url,
  referrer_url,
  lead_score,
  status,
  sales_id,
  assigned_at,
  notes,
  custom_fields
)
VALUES
  (
    7001,
    '2026-02-18T12:00:00Z',
    '2026-02-18T12:00:00Z',
    'Lead',
    'One',
    'lead-one@baseline.example',
    '+15550100011',
    'Northwind Baseline',
    'website_form',
    'synthetic-form',
    'organic',
    'search',
    'baseline-campaign',
    'https://northwind.baseline.example/contact',
    'https://referrer.baseline.example/article',
    0,
    'qualified',
    1001,
    '2026-02-18T12:01:00Z',
    'Fixed synthetic lead',
    '{"language":"en"}'::jsonb
  ),
  (
    7002,
    '2026-02-19T12:00:00Z',
    '2026-02-19T12:00:00Z',
    'Léa',
    '二',
    'lead-two@baseline.example',
    NULL,
    'Café Niño — 東京',
    'referral',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    0,
    'new',
    1002,
    NULL,
    NULL,
    '{}'::jsonb
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
  (
    7101,
    '2026-02-20T12:00:00Z',
    7001,
    1001,
    'form_submit',
    'Synthetic form submission',
    '{"form":"baseline"}'::jsonb,
    5
  ),
  (
    7102,
    '2026-02-21T12:00:00Z',
    7002,
    1002,
    'page_view',
    'Synthetic page view',
    '{"path":"/synthetic"}'::jsonb,
    1
  );

INSERT INTO public.touchpoints (
  id,
  created_at,
  lead_id,
  contact_id,
  deal_id,
  anonymous_id,
  touchpoint_type,
  channel,
  source,
  medium,
  campaign,
  page_url,
  page_title,
  referrer_url,
  is_lead_creation_touch,
  is_deal_creation_touch,
  metadata,
  sales_id
)
VALUES
  (
    8001,
    '2026-02-22T12:00:00Z',
    7001,
    NULL,
    NULL,
    'anon-baseline-001',
    'organic_search',
    'organic_search',
    'synthetic-search',
    'organic',
    'baseline-campaign',
    'https://northwind.baseline.example/',
    'Synthetic landing page',
    'https://referrer.baseline.example/',
    true,
    false,
    '{"position":1}'::jsonb,
    1001
  ),
  (
    8002,
    '2026-02-23T12:00:00Z',
    7001,
    3001,
    4001,
    'anon-baseline-001',
    'contract_signed',
    'direct',
    'synthetic-direct',
    NULL,
    NULL,
    'https://northwind.baseline.example/complete',
    'Synthetic completion page',
    NULL,
    false,
    true,
    '{"synthetic":true}'::jsonb,
    1001
  );

-- fixture-category: null-and-orphan-edges
INSERT INTO public.touchpoints (
  id,
  created_at,
  anonymous_id,
  touchpoint_type,
  channel,
  metadata,
  sales_id
)
VALUES (
  8003,
  '2026-02-24T12:00:00Z',
  'anonymous-only-baseline',
  'page_view',
  'direct',
  '{}'::jsonb,
  NULL
);

-- fixture-category: non-ascii-text
UPDATE public.companies
SET description = 'Café, niño, résumé, 東京, emoji 🚀'
WHERE id = 2002;

SELECT pg_catalog.setval('public.sales_id_seq', 1002, true);
SELECT pg_catalog.setval('public.companies_id_seq', 2003, true);
SELECT pg_catalog.setval('public.contacts_id_seq', 3003, true);
SELECT pg_catalog.setval('public.deals_id_seq', 4002, true);
SELECT pg_catalog.setval('public.projects_id_seq', 5002, true);
SELECT pg_catalog.setval('public.project_analytics_id_seq', 5101, true);
SELECT pg_catalog.setval('public.invoices_id_seq', 6004, true);
SELECT pg_catalog.setval('public.leads_id_seq', 7002, true);
SELECT pg_catalog.setval('public.lead_activities_id_seq', 7102, true);
SELECT pg_catalog.setval('public.touchpoints_id_seq', 8003, true);

COMMIT;
