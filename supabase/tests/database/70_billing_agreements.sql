BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT no_plan();

SELECT has_table('public', 'billing_agreements', 'billing agreement identity exists');
SELECT has_table('public', 'billing_agreement_versions', 'billing agreement versions exist');
SELECT has_table('public', 'billing_agreement_revenue_rules', 'structured revenue rules exist');
SELECT has_table('public', 'billing_agreement_events', 'agreement lifecycle events exist');

SELECT has_function('public', 'save_billing_agreement_draft', ARRAY['jsonb'], 'agreement draft command exists');
SELECT has_function('public', 'submit_billing_agreement_version', ARRAY['jsonb'], 'agreement submit command exists');
SELECT has_function('public', 'activate_billing_agreement_version', ARRAY['jsonb'], 'agreement activation command exists');
SELECT has_function('public', 'pause_billing_agreement_version', ARRAY['jsonb'], 'agreement pause command exists');
SELECT has_function('public', 'terminate_billing_agreement_version', ARRAY['jsonb'], 'agreement terminate command exists');
SELECT has_function('public', 'read_billing_agreements', ARRAY['jsonb'], 'caller-filtered agreement read command exists');

SELECT is(
  (
    SELECT count(*)
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = ANY (ARRAY[
        'billing_agreements', 'billing_agreement_versions',
        'billing_agreement_revenue_rules', 'billing_agreement_events'
      ])
      AND relation.relrowsecurity
      AND relation.relforcerowsecurity
  ),
  4::bigint,
  'all agreement relations enable and force RLS'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.billing_agreements', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.billing_agreements', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.billing_agreements', 'DELETE')
    AND NOT has_table_privilege('authenticated', 'public.billing_agreement_versions', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.billing_agreement_versions', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.billing_agreement_versions', 'DELETE'),
  'authenticated callers cannot mutate agreement base tables'
);

SELECT ok(
  has_function_privilege('authenticated', 'public.save_billing_agreement_draft(jsonb)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.submit_billing_agreement_version(jsonb)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.activate_billing_agreement_version(jsonb)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.read_billing_agreements(jsonb)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.save_billing_agreement_draft(jsonb)', 'EXECUTE'),
  'agreement RPC grants are narrow and anonymous callers are denied'
);

SELECT ok(
  (
    SELECT bool_and(
      coalesce(array_to_string(procedure_record.proconfig, ','), '') IN ('search_path=', 'search_path=""')
    )
    FROM pg_proc AS procedure_record
    JOIN pg_namespace AS namespace ON namespace.oid = procedure_record.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure_record.proname = ANY (ARRAY[
        'save_billing_agreement_draft', 'submit_billing_agreement_version',
        'activate_billing_agreement_version', 'pause_billing_agreement_version',
        'terminate_billing_agreement_version', 'read_billing_agreements'
      ])
  ),
  'all public agreement commands lock search_path'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.billing_agreement_versions'::regclass
      AND contype = 'x'
  ),
  'agreement versions enforce non-overlapping activation at the constraint layer'
);

UPDATE public.billing_evidence_objects
SET kind = 'contract', original_filename = 'signed-agreement.pdf'
WHERE id = '21000000-0000-0000-0000-000000000601';

CREATE FUNCTION pg_temp.valid_agreement_payload(p_command_key text)
RETURNS jsonb
LANGUAGE sql
AS $function$
  SELECT jsonb_build_object(
    'account_id', '21000000-0000-0000-0000-000000000200',
    'agreement_family', 'validation',
    'effective_start', '2035-01-01',
    'effective_end', '2036-01-01',
    'formula_kind', 'hybrid',
    'fixed_amount', NULL,
    'minimum_amount', jsonb_build_object('amount_minor', '125000', 'currency', 'USD'),
    'percentage', jsonb_build_object(
      'kind', 'ordinary_percentage', 'numerator', '7', 'denominator', '100',
      'submitted_percentage', '7%', 'rate_policy_version', 'ordinary-percentage-v1'
    ),
    'timezone', 'America/Los_Angeles',
    'timing_basis', 'cash',
    'included_amounts', jsonb_build_array('service_revenue'),
    'excluded_amounts', jsonb_build_array('sales_tax'),
    'tax_treatment', 'exclude',
    'refund_chargeback_policy', 'deduct_in_period',
    'cutoff_day', 5,
    'dispute_policy', 'hold_close',
    'missing_report_policy', 'minimum_only',
    'true_up_policy', 'next_period_adjustment',
    'evidence_priority', jsonb_build_array('api', 'statement', 'portal'),
    'signed_evidence_id', '21000000-0000-0000-0000-000000000601',
    'command_key', p_command_key
  );
$function$;

SELECT set_config('request.jwt.claim.sub', '21000000-0000-0000-0000-000000000002', true);
SELECT set_config('request.jwt.claims', '{"sub":"21000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

CREATE TEMP TABLE agreement_command_results AS
SELECT public.save_billing_agreement_draft(
  jsonb_build_object(
    'account_id', '21000000-0000-0000-0000-000000000200',
    'agreement_family', 'primary',
    'effective_start', '2026-10-01',
    'effective_end', '2027-10-01',
    'formula_kind', 'hybrid',
    'fixed_amount', NULL,
    'minimum_amount', jsonb_build_object('amount_minor', '125000', 'currency', 'USD'),
    'percentage', jsonb_build_object(
      'kind', 'ordinary_percentage',
      'numerator', '7',
      'denominator', '100',
      'submitted_percentage', '7%',
      'rate_policy_version', 'ordinary-percentage-v1'
    ),
    'timezone', 'America/Los_Angeles',
    'timing_basis', 'cash',
    'included_amounts', jsonb_build_array('service_revenue'),
    'excluded_amounts', jsonb_build_array('sales_tax'),
    'tax_treatment', 'exclude',
    'refund_chargeback_policy', 'deduct_in_period',
    'cutoff_day', 5,
    'dispute_policy', 'hold_close',
    'missing_report_policy', 'minimum_only',
    'true_up_policy', 'next_period_adjustment',
    'evidence_priority', jsonb_build_array('api', 'statement', 'portal'),
    'signed_evidence_id', '21000000-0000-0000-0000-000000000601',
    'command_key', 'agreement-draft-alpha-0001'
  )
) AS response;

SELECT is(
  (SELECT response->>'result' FROM agreement_command_results),
  'created',
  'authorized operator creates one complete exact agreement draft'
);

SELECT is(
  (SELECT response->>'currency' FROM agreement_command_results),
  'USD',
  'draft response uses the closed USD contract'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.read_billing_agreements(jsonb_build_object(
      'account_id', '21000000-0000-0000-0000-000000000200'
    )) AS response
    WHERE response->'data' <> '[]'::jsonb
  ),
  1::bigint,
  'caller-filtered read returns the operator account agreement'
);

SELECT throws_ok(
  $$SELECT public.save_billing_agreement_draft(
    pg_temp.valid_agreement_payload('agreement-invalid-timezone-0001')
      || jsonb_build_object('timezone', 'Mars/Olympus')
  )$$,
  '22023',
  'AGREEMENT_INVALID_REQUEST',
  'unknown agreement timezones fail closed'
);

SELECT throws_ok(
  $$SELECT public.save_billing_agreement_draft(
    (pg_temp.valid_agreement_payload('agreement-missing-timezone-0001') - 'timezone')
  )$$,
  '22023',
  'AGREEMENT_INVALID_REQUEST',
  'missing agreement timezone fails closed'
);

SELECT throws_ok(
  $$SELECT public.save_billing_agreement_draft(
    pg_temp.valid_agreement_payload('agreement-malformed-money-0001')
      || jsonb_build_object(
        'minimum_amount', jsonb_build_object('amount_minor', '12.5', 'currency', 'USD')
      )
  )$$,
  '22023',
  'AGREEMENT_INVALID_REQUEST',
  'malformed exact agreement money fails closed'
);

SELECT throws_ok(
  $$SELECT public.save_billing_agreement_draft(
    pg_temp.valid_agreement_payload('agreement-invalid-provenance-0001')
      || jsonb_build_object('evidence_priority', jsonb_build_array('spreadsheet_guess'))
  )$$,
  '22023',
  'AGREEMENT_INVALID_REQUEST',
  'unknown evidence provenance fails closed'
);

SELECT throws_ok(
  $$SELECT public.save_billing_agreement_draft(
    pg_temp.valid_agreement_payload('agreement-cross-evidence-0001')
      || jsonb_build_object(
        'signed_evidence_id', '22000000-0000-0000-0000-000000000600'
      )
  )$$,
  '22023',
  'AGREEMENT_SIGNED_EVIDENCE_INVALID',
  'wrong-account signed evidence fails closed'
);

RESET ROLE;

SELECT is(
  (SELECT count(*) FROM public.billing_agreements),
  1::bigint,
  'one stable agreement identity is stored'
);

SELECT is(
  (
    SELECT jsonb_build_object(
      'state', state,
      'formula_kind', formula_kind,
      'minimum_minor', minimum_amount_minor::text,
      'rate', rate_numerator::text || '/' || rate_denominator::text,
      'currency', currency,
      'currency_policy', currency_policy_version,
      'rate_policy', rate_policy_version,
      'rounding_policy', rounding_policy_version,
      'evidence_hash', signed_evidence_sha256
    )
    FROM public.billing_agreement_versions
  ),
  jsonb_build_object(
    'state', 'draft',
    'formula_kind', 'hybrid',
    'minimum_minor', '125000',
    'rate', '7/100',
    'currency', 'USD',
    'currency_policy', 'usd-v1',
    'rate_policy', 'ordinary-percentage-v1',
    'rounding_policy', 'half-away-from-zero-v1',
    'evidence_hash', repeat('1', 64)
  ),
  'draft freezes exact formula policy and signed evidence hash facts'
);

SELECT lives_ok(
  $$INSERT INTO public.billing_agreement_versions (
      id, organization_id, account_id, agreement_id, version_number, state,
      effective_start, effective_end, formula_kind, fixed_amount_minor,
      signed_evidence_id, signed_evidence_sha256, terms_fingerprint,
      authored_by, authored_by_role, submitted_by, submitted_by_role,
      submitted_at, approved_by, approved_by_role, approved_at
    )
    SELECT fixture.id, agreement.organization_id, agreement.account_id,
      agreement.id, fixture.version_number, 'active', fixture.effective_start,
      fixture.effective_end, 'fixed', fixture.amount_minor,
      '21000000-0000-0000-0000-000000000601', repeat('1', 64),
      repeat(fixture.fingerprint_character, 64),
      '21000000-0000-0000-0000-000000000002', 'operator',
      '21000000-0000-0000-0000-000000000002', 'operator', now(),
      '21000000-0000-0000-0000-000000000003', 'reviewer', now()
    FROM public.billing_agreements AS agreement
    CROSS JOIN (VALUES
      ('21000000-0000-0000-0000-000000000700'::uuid, 10, '2028-01-01'::date, '2029-01-01'::date, 10000::bigint, 'a'),
      ('21000000-0000-0000-0000-000000000701'::uuid, 11, '2029-01-01'::date, '2030-01-01'::date, 20000::bigint, 'b')
    ) AS fixture(id, version_number, effective_start, effective_end, amount_minor, fingerprint_character)$$,
  'adjacent half-open active agreement ranges are valid'
);

SELECT throws_like(
  $$INSERT INTO public.billing_agreement_versions (
      id, organization_id, account_id, agreement_id, version_number, state,
      effective_start, effective_end, formula_kind, fixed_amount_minor,
      signed_evidence_id, signed_evidence_sha256, terms_fingerprint,
      authored_by, authored_by_role, submitted_by, submitted_by_role,
      submitted_at, approved_by, approved_by_role, approved_at
    )
    SELECT '21000000-0000-0000-0000-000000000702', organization_id, account_id,
      id, 12, 'active', '2028-06-01', '2029-06-01', 'fixed', 30000,
      '21000000-0000-0000-0000-000000000601', repeat('1', 64), repeat('c', 64),
      '21000000-0000-0000-0000-000000000002', 'operator',
      '21000000-0000-0000-0000-000000000002', 'operator', now(),
      '21000000-0000-0000-0000-000000000003', 'reviewer', now()
    FROM public.billing_agreements$$,
  '%billing_agreement_versions_active_overlap_excl%',
  'overlapping active agreement ranges fail at the exclusion constraint'
);

SELECT lives_ok(
  $$INSERT INTO public.billing_agreement_versions (
      id, organization_id, account_id, agreement_id, version_number,
      effective_start, effective_end, formula_kind, fixed_amount_minor,
      minimum_amount_minor, rate_numerator, rate_denominator,
      submitted_percentage, signed_evidence_id, signed_evidence_sha256,
      terms_fingerprint, authored_by, authored_by_role
    )
    SELECT fixture.id, agreement.organization_id, agreement.account_id,
      agreement.id, fixture.version_number, fixture.effective_start,
      fixture.effective_end, fixture.formula_kind, fixture.fixed_amount_minor,
      fixture.minimum_amount_minor, fixture.rate_numerator,
      fixture.rate_denominator, fixture.submitted_percentage,
      '21000000-0000-0000-0000-000000000601', repeat('1', 64),
      repeat(fixture.fingerprint_character, 64),
      '21000000-0000-0000-0000-000000000002', 'operator'
    FROM public.billing_agreements AS agreement
    CROSS JOIN (VALUES
      ('21000000-0000-0000-0000-000000000710'::uuid, 20, '2030-01-01'::date, '2031-01-01'::date, 'fixed', 1000::bigint, NULL::bigint, NULL::bigint, NULL::bigint, NULL::text, 'd'),
      ('21000000-0000-0000-0000-000000000711'::uuid, 21, '2031-01-01'::date, '2032-01-01'::date, 'percentage', NULL::bigint, NULL::bigint, 1::bigint, 10::bigint, '10%', 'e'),
      ('21000000-0000-0000-0000-000000000712'::uuid, 22, '2032-01-01'::date, '2033-01-01'::date, 'minimum_support', NULL::bigint, 2000::bigint, NULL::bigint, NULL::bigint, NULL::text, 'f')
    ) AS fixture(
      id, version_number, effective_start, effective_end, formula_kind,
      fixed_amount_minor, minimum_amount_minor, rate_numerator,
      rate_denominator, submitted_percentage, fingerprint_character
    )$$,
  'fixed, percentage, and minimum-support exact agreement rows accept valid terms'
);

SELECT throws_like(
  $$INSERT INTO public.billing_agreement_versions (
      organization_id, account_id, agreement_id, version_number,
      effective_start, effective_end, formula_kind, signed_evidence_id,
      signed_evidence_sha256, terms_fingerprint, authored_by, authored_by_role
    )
    SELECT organization_id, account_id, id, 30, '2033-01-01', '2034-01-01',
      'invented', '21000000-0000-0000-0000-000000000601', repeat('1', 64),
      repeat('9', 64), '21000000-0000-0000-0000-000000000002', 'operator'
    FROM public.billing_agreements$$,
  '%billing_agreement_versions_formula_%',
  'unknown formula kinds fail closed'
);

SELECT throws_ok(
  $$UPDATE public.billing_agreement_versions
    SET fixed_amount_minor = 99999
    WHERE id = '21000000-0000-0000-0000-000000000700'$$,
  'P0001',
  'AGREEMENT_VERSION_IMMUTABLE',
  'activated agreement versions cannot be edited'
);

SELECT throws_ok(
  $$DELETE FROM public.billing_agreement_versions
    WHERE id = '21000000-0000-0000-0000-000000000700'$$,
  'P0001',
  'AGREEMENT_VERSION_IMMUTABLE',
  'activated agreement versions cannot be deleted'
);

SELECT throws_ok(
  $$UPDATE public.billing_agreement_events SET reason = 'tampered'$$,
  'P0001',
  'AGREEMENT_EVENT_IMMUTABLE',
  'agreement lifecycle events are append-only even for the table owner'
);

SELECT * FROM finish();
ROLLBACK;
