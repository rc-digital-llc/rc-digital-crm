-- Deterministic two-organization billing security fixture.

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
SELECT
  '00000000-0000-0000-0000-000000000000'::uuid,
  fixture.id,
  'authenticated',
  'authenticated',
  fixture.email,
  '',
  '2026-09-01T20:00:00Z'::timestamptz,
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('first_name', fixture.first_name, 'last_name', 'Fixture'),
  '2026-09-01T20:00:00Z'::timestamptz,
  '2026-09-01T20:00:00Z'::timestamptz
FROM (VALUES
  ('21000000-0000-0000-0000-000000000001'::uuid, 'alpha-admin@billing.example', 'Alpha Admin'),
  ('21000000-0000-0000-0000-000000000002'::uuid, 'alpha-operator@billing.example', 'Alpha Operator'),
  ('21000000-0000-0000-0000-000000000003'::uuid, 'alpha-reviewer@billing.example', 'Alpha Reviewer'),
  ('21000000-0000-0000-0000-000000000004'::uuid, 'alpha-auditor@billing.example', 'Alpha Auditor'),
  ('21000000-0000-0000-0000-000000000005'::uuid, 'alpha-customer@billing.example', 'Alpha Customer'),
  ('21000000-0000-0000-0000-000000000006'::uuid, 'alpha-automation@billing.example', 'Alpha Automation'),
  ('22000000-0000-0000-0000-000000000001'::uuid, 'bravo-admin@billing.example', 'Bravo Admin'),
  ('22000000-0000-0000-0000-000000000002'::uuid, 'bravo-operator@billing.example', 'Bravo Operator'),
  ('22000000-0000-0000-0000-000000000003'::uuid, 'bravo-reviewer@billing.example', 'Bravo Reviewer'),
  ('22000000-0000-0000-0000-000000000004'::uuid, 'bravo-auditor@billing.example', 'Bravo Auditor'),
  ('22000000-0000-0000-0000-000000000005'::uuid, 'bravo-customer@billing.example', 'Bravo Customer'),
  ('22000000-0000-0000-0000-000000000006'::uuid, 'bravo-automation@billing.example', 'Bravo Automation')
) AS fixture(id, email, first_name)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.billing_organizations (id, name, status)
VALUES
  ('21000000-0000-0000-0000-000000000100', 'Alpha Billing Fixture', 'active'),
  ('22000000-0000-0000-0000-000000000100', 'Bravo Billing Fixture', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.billing_automation_principals (
  id, organization_id, auth_user_id, name
)
VALUES
  (
    '21000000-0000-0000-0000-000000000400',
    '21000000-0000-0000-0000-000000000100',
    '21000000-0000-0000-0000-000000000006',
    'Alpha Automation Fixture'
  ),
  (
    '22000000-0000-0000-0000-000000000400',
    '22000000-0000-0000-0000-000000000100',
    '22000000-0000-0000-0000-000000000006',
    'Bravo Automation Fixture'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.billing_accounts (id, organization_id, customer_name, billing_status)
VALUES
  ('21000000-0000-0000-0000-000000000200', '21000000-0000-0000-0000-000000000100', 'Alpha Account Fixture', 'active'),
  ('22000000-0000-0000-0000-000000000200', '22000000-0000-0000-0000-000000000100', 'Bravo Account Fixture', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.billing_automation_grants (
  id,
  organization_id,
  account_id,
  principal_id,
  command_name,
  provider_reference,
  policy_version,
  action_kind,
  max_amount_minor,
  currency,
  max_actions
)
VALUES
  (
    '21000000-0000-0000-0000-000000000500',
    '21000000-0000-0000-0000-000000000100',
    '21000000-0000-0000-0000-000000000200',
    '21000000-0000-0000-0000-000000000400',
    'test.nonfinancial',
    'provider-alpha-fixture',
    'policy-fixture-v1',
    'record.test',
    10000,
    'USD',
    2
  ),
  (
    '21000000-0000-0000-0000-000000000501',
    '21000000-0000-0000-0000-000000000100',
    '21000000-0000-0000-0000-000000000200',
    '21000000-0000-0000-0000-000000000400',
    'test.concurrent',
    'provider-alpha-fixture',
    'policy-fixture-v1',
    'record.concurrent',
    100,
    'USD',
    1
  ),
  (
    '22000000-0000-0000-0000-000000000500',
    '22000000-0000-0000-0000-000000000100',
    '22000000-0000-0000-0000-000000000200',
    '22000000-0000-0000-0000-000000000400',
    'test.nonfinancial',
    'provider-bravo-fixture',
    'policy-fixture-v1',
    'record.test',
    10000,
    'USD',
    2
  ),
  (
    '21000000-0000-0000-0000-000000000502',
    '21000000-0000-0000-0000-000000000100',
    '21000000-0000-0000-0000-000000000200',
    '21000000-0000-0000-0000-000000000400',
    'evidence.inspect',
    'scanner-alpha-fixture',
    'scanner-fixture-v1',
    'evidence.inspection',
    NULL,
    'USD',
    100
  ),
  (
    '22000000-0000-0000-0000-000000000502',
    '22000000-0000-0000-0000-000000000100',
    '22000000-0000-0000-0000-000000000200',
    '22000000-0000-0000-0000-000000000400',
    'evidence.inspect',
    'scanner-bravo-fixture',
    'scanner-fixture-v1',
    'evidence.inspection',
    NULL,
    'USD',
    100
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.billing_evidence_objects (
  id,
  organization_id,
  account_id,
  sha256,
  size_bytes,
  mime_type,
  inspection_status,
  inspection_principal_id,
  inspection_grant_id,
  inspection_decided_at,
  inspection_reason_code,
  retention_expires_at,
  hold_started_at,
  hold_reason,
  lifecycle_status,
  ended_at,
  end_reason,
  created_at,
  updated_at
)
VALUES
  (
    '21000000-0000-0000-0000-000000000600',
    '21000000-0000-0000-0000-000000000100',
    '21000000-0000-0000-0000-000000000200',
    repeat('0', 64), 100, 'application/pdf',
    'quarantined', NULL, NULL, NULL, NULL,
    '2030-01-01T00:00:00Z', NULL, NULL,
    'active', NULL, NULL,
    '2026-09-01T20:00:00Z', '2026-09-01T20:00:00Z'
  ),
  (
    '21000000-0000-0000-0000-000000000601',
    '21000000-0000-0000-0000-000000000100',
    '21000000-0000-0000-0000-000000000200',
    repeat('1', 64), 101, 'application/pdf',
    'clean',
    '21000000-0000-0000-0000-000000000400',
    '21000000-0000-0000-0000-000000000502',
    '2026-09-01T20:05:00Z', 'SCAN_CLEAN',
    '2030-01-01T00:00:00Z', NULL, NULL,
    'active', NULL, NULL,
    '2026-09-01T20:00:00Z', '2026-09-01T20:05:00Z'
  ),
  (
    '21000000-0000-0000-0000-000000000602',
    '21000000-0000-0000-0000-000000000100',
    '21000000-0000-0000-0000-000000000200',
    repeat('2', 64), 102, 'application/pdf',
    'rejected',
    '21000000-0000-0000-0000-000000000400',
    '21000000-0000-0000-0000-000000000502',
    '2026-09-01T20:05:00Z', 'SCAN_REJECTED',
    '2030-01-01T00:00:00Z', NULL, NULL,
    'active', NULL, NULL,
    '2026-09-01T20:00:00Z', '2026-09-01T20:05:00Z'
  ),
  (
    '21000000-0000-0000-0000-000000000603',
    '21000000-0000-0000-0000-000000000100',
    '21000000-0000-0000-0000-000000000200',
    repeat('3', 64), 103, 'application/pdf',
    'clean',
    '21000000-0000-0000-0000-000000000400',
    '21000000-0000-0000-0000-000000000502',
    '2026-01-02T00:00:00Z', 'SCAN_CLEAN',
    '2026-02-01T00:00:00Z', NULL, NULL,
    'active', NULL, NULL,
    '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z'
  ),
  (
    '21000000-0000-0000-0000-000000000604',
    '21000000-0000-0000-0000-000000000100',
    '21000000-0000-0000-0000-000000000200',
    repeat('4', 64), 104, 'application/pdf',
    'clean',
    '21000000-0000-0000-0000-000000000400',
    '21000000-0000-0000-0000-000000000502',
    '2026-09-01T20:05:00Z', 'SCAN_CLEAN',
    '2030-01-01T00:00:00Z',
    '2026-09-01T20:10:00Z', 'fixture legal hold',
    'active', NULL, NULL,
    '2026-09-01T20:00:00Z', '2026-09-01T20:10:00Z'
  ),
  (
    '21000000-0000-0000-0000-000000000605',
    '21000000-0000-0000-0000-000000000100',
    '21000000-0000-0000-0000-000000000200',
    repeat('5', 64), 105, 'application/pdf',
    'clean',
    '21000000-0000-0000-0000-000000000400',
    '21000000-0000-0000-0000-000000000502',
    '2026-09-01T20:05:00Z', 'SCAN_CLEAN',
    '2030-01-01T00:00:00Z', NULL, NULL,
    'disabled', '2026-09-01T20:10:00Z', 'fixture disabled evidence',
    '2026-09-01T20:00:00Z', '2026-09-01T20:10:00Z'
  ),
  (
    '21000000-0000-0000-0000-000000000606',
    '21000000-0000-0000-0000-000000000100',
    '21000000-0000-0000-0000-000000000200',
    repeat('6', 64), 106, 'application/pdf',
    'quarantined', NULL, NULL, NULL, NULL,
    '2030-01-01T00:00:00Z', NULL, NULL,
    'active', NULL, NULL,
    '2026-09-01T20:00:00Z', '2026-09-01T20:00:00Z'
  ),
  (
    '22000000-0000-0000-0000-000000000600',
    '22000000-0000-0000-0000-000000000100',
    '22000000-0000-0000-0000-000000000200',
    repeat('a', 64), 200, 'application/pdf',
    'clean',
    '22000000-0000-0000-0000-000000000400',
    '22000000-0000-0000-0000-000000000502',
    '2026-09-01T20:05:00Z', 'SCAN_CLEAN',
    '2030-01-01T00:00:00Z', NULL, NULL,
    'active', NULL, NULL,
    '2026-09-01T20:00:00Z', '2026-09-01T20:05:00Z'
  ),
  (
    '22000000-0000-0000-0000-000000000606',
    '22000000-0000-0000-0000-000000000100',
    '22000000-0000-0000-0000-000000000200',
    repeat('b', 64), 206, 'application/pdf',
    'quarantined', NULL, NULL, NULL, NULL,
    '2030-01-01T00:00:00Z', NULL, NULL,
    'active', NULL, NULL,
    '2026-09-01T20:00:00Z', '2026-09-01T20:00:00Z'
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.billing_role_assignments (organization_id, account_id, sales_id, role)
SELECT fixture.organization_id, fixture.account_id, sale.id, fixture.role
FROM (VALUES
  ('21000000-0000-0000-0000-000000000001'::uuid, '21000000-0000-0000-0000-000000000100'::uuid, NULL::uuid, 'administrator'),
  ('21000000-0000-0000-0000-000000000002'::uuid, '21000000-0000-0000-0000-000000000100'::uuid, '21000000-0000-0000-0000-000000000200'::uuid, 'operator'),
  ('21000000-0000-0000-0000-000000000003'::uuid, '21000000-0000-0000-0000-000000000100'::uuid, '21000000-0000-0000-0000-000000000200'::uuid, 'reviewer'),
  ('21000000-0000-0000-0000-000000000004'::uuid, '21000000-0000-0000-0000-000000000100'::uuid, NULL::uuid, 'auditor'),
  ('22000000-0000-0000-0000-000000000001'::uuid, '22000000-0000-0000-0000-000000000100'::uuid, NULL::uuid, 'administrator'),
  ('22000000-0000-0000-0000-000000000002'::uuid, '22000000-0000-0000-0000-000000000100'::uuid, '22000000-0000-0000-0000-000000000200'::uuid, 'operator'),
  ('22000000-0000-0000-0000-000000000003'::uuid, '22000000-0000-0000-0000-000000000100'::uuid, '22000000-0000-0000-0000-000000000200'::uuid, 'reviewer'),
  ('22000000-0000-0000-0000-000000000004'::uuid, '22000000-0000-0000-0000-000000000100'::uuid, NULL::uuid, 'auditor')
) AS fixture(user_id, organization_id, account_id, role)
JOIN public.sales AS sale ON sale.user_id = fixture.user_id
ON CONFLICT DO NOTHING;

INSERT INTO public.billing_account_owners (organization_id, account_id, sales_id)
SELECT fixture.organization_id, fixture.account_id, sale.id
FROM (VALUES
  ('21000000-0000-0000-0000-000000000002'::uuid, '21000000-0000-0000-0000-000000000100'::uuid, '21000000-0000-0000-0000-000000000200'::uuid),
  ('22000000-0000-0000-0000-000000000002'::uuid, '22000000-0000-0000-0000-000000000100'::uuid, '22000000-0000-0000-0000-000000000200'::uuid)
) AS fixture(user_id, organization_id, account_id)
JOIN public.sales AS sale ON sale.user_id = fixture.user_id
ON CONFLICT DO NOTHING;

INSERT INTO public.billing_contacts (
  id, organization_id, account_id, name, email, preferred_contact_method, auth_user_id
)
VALUES
  (
    '21000000-0000-0000-0000-000000000300',
    '21000000-0000-0000-0000-000000000100',
    '21000000-0000-0000-0000-000000000200',
    'Alpha Customer Fixture',
    'alpha-customer@billing.example',
    'email',
    '21000000-0000-0000-0000-000000000005'
  ),
  (
    '22000000-0000-0000-0000-000000000300',
    '22000000-0000-0000-0000-000000000100',
    '22000000-0000-0000-0000-000000000200',
    'Bravo Customer Fixture',
    'bravo-customer@billing.example',
    'email',
    '22000000-0000-0000-0000-000000000005'
  )
ON CONFLICT (id) DO NOTHING;
