BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT no_plan();

SELECT has_table('public', 'billing_revenue_periods', 'revenue periods exist');
SELECT has_table('public', 'billing_revenue_submissions', 'immutable revenue revisions exist');
SELECT has_table('public', 'billing_revenue_submission_evidence', 'submission evidence lineage exists');
SELECT has_table('public', 'billing_revenue_command_events', 'revenue command replay journal exists');
SELECT has_function('public', 'ensure_billing_revenue_period', ARRAY['jsonb'], 'period identity command exists');
SELECT has_function('public', 'submit_billing_revenue_revision', ARRAY['jsonb'], 'revenue revision command exists');

SELECT is(
  (
    SELECT count(*)
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = ANY (ARRAY[
        'billing_revenue_periods', 'billing_revenue_submissions',
        'billing_revenue_submission_evidence', 'billing_revenue_command_events'
      ])
      AND relation.relrowsecurity
      AND relation.relforcerowsecurity
  ),
  4::bigint,
  'all revenue relations enable and force RLS'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.billing_revenue_periods', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.billing_revenue_submissions', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.billing_revenue_submission_evidence', 'DELETE')
    AND has_function_privilege('authenticated', 'public.ensure_billing_revenue_period(jsonb)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.submit_billing_revenue_revision(jsonb)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.ensure_billing_revenue_period(jsonb)', 'EXECUTE'),
  'revenue writes are RPC-only and anonymous callers are denied'
);

INSERT INTO public.billing_agreements (
  id, organization_id, account_id, agreement_family, created_by
) VALUES (
  '21000000-0000-0000-0000-000000000800',
  '21000000-0000-0000-0000-000000000100',
  '21000000-0000-0000-0000-000000000200',
  'revenue_validation',
  '21000000-0000-0000-0000-000000000002'
);

INSERT INTO public.billing_agreement_versions (
  id, organization_id, account_id, agreement_id, version_number, state,
  effective_start, effective_end, formula_kind, minimum_amount_minor,
  rate_numerator, rate_denominator, submitted_percentage,
  signed_evidence_id, signed_evidence_sha256, terms_fingerprint,
  authored_by, authored_by_role, submitted_by, submitted_by_role,
  submitted_at, approved_by, approved_by_role, approved_at
) VALUES (
  '21000000-0000-0000-0000-000000000801',
  '21000000-0000-0000-0000-000000000100',
  '21000000-0000-0000-0000-000000000200',
  '21000000-0000-0000-0000-000000000800',
  1, 'active', '2026-01-01', '2027-01-01', 'hybrid', 125000,
  7, 100, '7%', '21000000-0000-0000-0000-000000000601', repeat('1', 64),
  repeat('8', 64), '21000000-0000-0000-0000-000000000002', 'operator',
  '21000000-0000-0000-0000-000000000002', 'operator', now(),
  '21000000-0000-0000-0000-000000000003', 'reviewer', now()
);

INSERT INTO public.billing_agreement_revenue_rules (
  agreement_version_id, organization_id, account_id, timezone, timing_basis,
  included_amounts, excluded_amounts, tax_treatment, refund_chargeback_policy,
  cutoff_day, dispute_policy, missing_report_policy, true_up_policy,
  evidence_priority
) VALUES (
  '21000000-0000-0000-0000-000000000801',
  '21000000-0000-0000-0000-000000000100',
  '21000000-0000-0000-0000-000000000200',
  'America/Los_Angeles', 'cash', '["service_revenue"]', '["sales_tax"]',
  'exclude', 'deduct_in_period', 5, 'hold_close', 'minimum_only',
  'next_period_adjustment', '["api","statement","portal"]'
);

INSERT INTO public.billing_evidence_objects (
  id, organization_id, account_id, sha256, size_bytes, mime_type,
  inspection_status, inspection_principal_id, inspection_grant_id,
  inspection_decided_at, inspection_reason_code, retention_expires_at,
  lifecycle_status, created_at, updated_at, kind, original_filename,
  uploader_label
) VALUES (
  '21000000-0000-0000-0000-000000000607',
  '21000000-0000-0000-0000-000000000100',
  '21000000-0000-0000-0000-000000000200', repeat('7', 64), 107,
  'application/pdf', 'clean',
  '21000000-0000-0000-0000-000000000400',
  '21000000-0000-0000-0000-000000000502', now(), 'SCAN_CLEAN',
  '2030-01-01T00:00:00Z', 'active', now(), now(), 'revenue_statement',
  'october-revenue.pdf', 'Fixture operator'
);

SELECT set_config('request.jwt.claim.sub', '21000000-0000-0000-0000-000000000002', true);
SELECT set_config('request.jwt.claims', '{"sub":"21000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

CREATE TEMP TABLE revenue_period_result AS
SELECT public.ensure_billing_revenue_period(jsonb_build_object(
  'account_id', '21000000-0000-0000-0000-000000000200',
  'agreement_version_id', '21000000-0000-0000-0000-000000000801',
  'period_month', '2026-10',
  'command_key', 'revenue-period-alpha-0001'
)) AS response;

SELECT is(
  (SELECT response->>'result' FROM revenue_period_result),
  'created',
  'operator creates a server-derived monthly period'
);

SELECT is(
  public.ensure_billing_revenue_period(jsonb_build_object(
    'account_id', '21000000-0000-0000-0000-000000000200',
    'agreement_version_id', '21000000-0000-0000-0000-000000000801',
    'period_month', '2026-10',
    'command_key', 'revenue-period-alpha-0001'
  )),
  (SELECT response FROM revenue_period_result),
  'identical period command replay returns the original response'
);

SELECT throws_ok(
  $$SELECT public.ensure_billing_revenue_period(jsonb_build_object(
    'account_id', '21000000-0000-0000-0000-000000000200',
    'agreement_version_id', '21000000-0000-0000-0000-000000000801',
    'period_month', '2026-11',
    'command_key', 'revenue-period-alpha-0001'
  ))$$,
  'P0001',
  'REVENUE_IDEMPOTENCY_CONFLICT',
  'changed period command reuse fails before mutation'
);

SELECT is(
  (
    SELECT jsonb_build_object(
      'count', count(*),
      'start', min(period_start),
      'end', max(period_end),
      'timezone', min(timezone)
    )
    FROM public.billing_revenue_periods
  ),
  '{"count":1,"start":"2026-10-01","end":"2026-11-01","timezone":"America/Los_Angeles"}'::jsonb,
  'period identity is stable and carries the immutable agreement timezone'
);

CREATE FUNCTION pg_temp.valid_revenue_payload(p_command_key text)
RETURNS jsonb LANGUAGE sql AS $function$
  SELECT jsonb_build_object(
    'account_id', '21000000-0000-0000-0000-000000000200',
    'period_id', (SELECT response->>'period_id' FROM revenue_period_result),
    'gross_amount', jsonb_build_object('amount_minor', '1000000', 'currency', 'USD'),
    'excluded_amount', jsonb_build_object('amount_minor', '100000', 'currency', 'USD'),
    'commissionable_amount', jsonb_build_object('amount_minor', '900000', 'currency', 'USD'),
    'provenance_kind', 'statement',
    'provenance_source_id', 'statement-october-2026',
    'attestation', jsonb_build_object('accurate', true, 'text', 'Source totals reconciled'),
    'evidence_ids', jsonb_build_array('21000000-0000-0000-0000-000000000607'),
    'command_key', p_command_key
  );
$function$;

CREATE TEMP TABLE revenue_submission_result AS
SELECT public.submit_billing_revenue_revision(
  pg_temp.valid_revenue_payload('revenue-submit-alpha-0001')
) AS response;

SELECT is(
  (SELECT response->>'revision_number' FROM revenue_submission_result),
  '1',
  'first exact revenue submission is revision one'
);

SELECT is(
  public.submit_billing_revenue_revision(
    pg_temp.valid_revenue_payload('revenue-submit-alpha-0001')
  ),
  (SELECT response FROM revenue_submission_result),
  'identical submission replay returns the original response'
);

SELECT throws_ok(
  $$SELECT public.submit_billing_revenue_revision(
    pg_temp.valid_revenue_payload('revenue-submit-alpha-0001')
      || jsonb_build_object('provenance_source_id', 'changed-source')
  )$$,
  'P0001',
  'REVENUE_IDEMPOTENCY_CONFLICT',
  'changed submission reuse fails before effects'
);

SELECT throws_ok(
  $$SELECT public.submit_billing_revenue_revision(
    pg_temp.valid_revenue_payload('revenue-submit-bad-arithmetic-0001')
      || jsonb_build_object(
        'commissionable_amount', jsonb_build_object('amount_minor', '899999', 'currency', 'USD')
      )
  )$$,
  '22023',
  'REVENUE_AMOUNT_MISMATCH',
  'submission arithmetic must reconcile exactly'
);

SELECT throws_ok(
  $$SELECT public.submit_billing_revenue_revision(
    pg_temp.valid_revenue_payload('revenue-submit-negative-0001')
      || jsonb_build_object(
        'gross_amount', jsonb_build_object('amount_minor', '-1', 'currency', 'USD')
      )
  )$$,
  '22023',
  'REVENUE_AMOUNT_INVALID',
  'negative gross revenue is rejected'
);

SELECT throws_ok(
  $$SELECT public.submit_billing_revenue_revision(
    pg_temp.valid_revenue_payload('revenue-submit-dirty-evidence-0001')
      || jsonb_build_object(
        'evidence_ids', jsonb_build_array('21000000-0000-0000-0000-000000000600')
      )
  )$$,
  '22023',
  'REVENUE_EVIDENCE_INVALID',
  'quarantined evidence cannot support a revision'
);

CREATE TEMP TABLE revenue_correction_result AS
SELECT public.submit_billing_revenue_revision(
  pg_temp.valid_revenue_payload('revenue-submit-alpha-0002')
    || jsonb_build_object(
      'gross_amount', jsonb_build_object('amount_minor', '1100000', 'currency', 'USD'),
      'commissionable_amount', jsonb_build_object('amount_minor', '1000000', 'currency', 'USD'),
      'attestation', jsonb_build_object('accurate', true, 'text', 'Corrected source totals')
    )
) AS response;

SELECT is(
  (SELECT response->>'revision_number' FROM revenue_correction_result),
  '2',
  'correction appends the next monotonic revision'
);

RESET ROLE;

SELECT is(
  (
    SELECT jsonb_build_object(
      'revisions', count(*),
      'min_gross', min(gross_amount_minor)::text,
      'max_gross', max(gross_amount_minor)::text,
      'evidence_links', (SELECT count(*) FROM public.billing_revenue_submission_evidence)
    )
    FROM public.billing_revenue_submissions
  ),
  '{"revisions":2,"min_gross":"1000000","max_gross":"1100000","evidence_links":2}'::jsonb,
  'both immutable revision values and evidence hashes remain present'
);

SELECT throws_ok(
  $$UPDATE public.billing_revenue_submissions SET gross_amount_minor = 1$$,
  'P0001', 'REVENUE_SUBMISSION_IMMUTABLE',
  'revenue submissions cannot be edited'
);

SELECT throws_ok(
  $$DELETE FROM public.billing_revenue_submission_evidence$$,
  'P0001', 'REVENUE_EVIDENCE_LINK_IMMUTABLE',
  'submission evidence lineage cannot be deleted'
);

SELECT set_config('request.jwt.claim.sub', '21000000-0000-0000-0000-000000000004', true);
SELECT set_config('request.jwt.claims', '{"sub":"21000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT public.ensure_billing_revenue_period(jsonb_build_object(
    'account_id', '21000000-0000-0000-0000-000000000200',
    'agreement_version_id', '21000000-0000-0000-0000-000000000801',
    'period_month', '2026-12',
    'command_key', 'revenue-auditor-denied-0001'
  ))$$,
  'P0001', 'REVENUE_NOT_AUTHORIZED',
  'auditor cannot create operator revenue periods'
);

SELECT is((SELECT count(*) FROM public.billing_revenue_periods), 0::bigint,
  'auditor cannot enumerate operator revenue periods');

RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '22000000-0000-0000-0000-000000000002', true);
SELECT set_config('request.jwt.claims', '{"sub":"22000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT public.submit_billing_revenue_revision(
    pg_temp.valid_revenue_payload('revenue-cross-tenant-denied-0001')
  )$$,
  'P0001', 'REVENUE_NOT_AUTHORIZED',
  'wrong-tenant operator cannot submit revenue'
);

SELECT is((SELECT count(*) FROM public.billing_revenue_submissions), 0::bigint,
  'wrong tenant cannot enumerate revenue submissions');

RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
