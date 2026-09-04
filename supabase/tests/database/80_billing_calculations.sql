BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT no_plan();

SELECT has_function(
  'private', 'billing_calculate_exact', ARRAY['jsonb'],
  'private exact billing formula kernel exists'
);
SELECT has_function(
  'public', 'preview_billing_calculation', ARRAY['jsonb'],
  'caller-bound exact calculation preview RPC exists'
);
SELECT has_function(
  'public', 'create_billing_calculation', ARRAY['jsonb'],
  'idempotent exact calculation create RPC exists'
);
SELECT has_function(
  'public', 'approve_billing_calculation', ARRAY['jsonb'],
  'policy-gated exact calculation approval RPC exists'
);

SELECT is(
  (
    SELECT count(*)
    FROM pg_catalog.pg_proc AS procedure_record
    JOIN pg_catalog.pg_roles AS owner_role
      ON owner_role.oid = procedure_record.proowner
    WHERE procedure_record.oid = ANY (ARRAY[
      'public.preview_billing_calculation(jsonb)'::regprocedure,
      'public.create_billing_calculation(jsonb)'::regprocedure,
      'public.approve_billing_calculation(jsonb)'::regprocedure
    ])
      AND procedure_record.prosecdef
      AND owner_role.rolname = 'postgres'
      AND COALESCE(pg_catalog.array_to_string(procedure_record.proconfig, ','), '')
        IN ('search_path=', 'search_path=""')
  ),
  3::bigint,
  'all calculation RPCs are locked security definers with empty search paths'
);
SELECT ok(
  has_function_privilege(
    'authenticated', 'public.preview_billing_calculation(jsonb)', 'EXECUTE'
  )
    AND has_function_privilege(
      'authenticated', 'public.create_billing_calculation(jsonb)', 'EXECUTE'
    )
    AND has_function_privilege(
      'authenticated', 'public.approve_billing_calculation(jsonb)', 'EXECUTE'
    )
    AND NOT has_function_privilege(
      'anon', 'public.preview_billing_calculation(jsonb)', 'EXECUTE'
    ),
  'authenticated callers receive only the closed calculation RPC surface'
);

SELECT has_table(
  'public', 'billing_calculations',
  'immutable billing calculation identity exists'
);
SELECT has_table(
  'public', 'billing_calculation_snapshots',
  'typed exact calculation snapshot exists'
);
SELECT has_table(
  'public', 'billing_calculation_events',
  'append-only calculation event history exists'
);
SELECT has_table(
  'public', 'billing_close_policies',
  'versioned close policy authority exists'
);

SELECT is(
  (
    SELECT count(*)
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname IN (
        'billing_calculations', 'billing_calculation_snapshots',
        'billing_calculation_events', 'billing_close_policies'
      )
      AND relation.relrowsecurity
      AND relation.relforcerowsecurity
  ),
  4::bigint,
  'all calculation and policy facts force row security'
);

SELECT is(
  (
    SELECT count(*)
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('billing_calculations', 'billing_calculation_snapshots')
      AND column_name IN (
        'organization_id', 'account_id', 'agreement_id',
        'agreement_version_id', 'period_id', 'close_snapshot_id'
      )
      AND is_nullable = 'NO'
  ),
  12::bigint,
  'calculation identity and snapshot both require complete tenant lineage'
);

SELECT is(
  (
    SELECT count(*)
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'billing_calculation_snapshots'
      AND column_name IN (
        'intermediate_numerator', 'intermediate_denominator',
        'fixed_candidate_minor', 'minimum_candidate_minor',
        'percentage_candidate_minor', 'result_amount_minor', 'delta_minor'
      )
      AND data_type IN ('bigint', 'numeric')
  ),
  7::bigint,
  'all intermediates, candidates, result, and delta have exact typed authority'
);

SELECT is(
  (
    SELECT count(*)
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN (
        'billing_calculations', 'billing_calculation_snapshots',
        'billing_calculation_events', 'billing_close_policies'
      )
      AND data_type IN ('real', 'double precision', 'money')
  ),
  0::bigint,
  'calculation authority contains no floating-point or locale money columns'
);

SELECT is(
  (
    SELECT policy_mode || ':' || active::text
    FROM public.billing_close_policies
    WHERE policy_version = 'billing-manual-v1'
  ),
  'manual:true',
  'the pinned default close policy is active and manual'
);

SELECT throws_ok(
  $$UPDATE public.billing_close_policies
    SET active = false
    WHERE policy_version = 'billing-manual-v1'$$,
  'P0001', 'BILLING_CALCULATION_FACT_IMMUTABLE',
  'close policy versions cannot be updated'
);
SELECT throws_ok(
  $$DELETE FROM public.billing_close_policies
    WHERE policy_version = 'billing-manual-v1'$$,
  'P0001', 'BILLING_CALCULATION_FACT_IMMUTABLE',
  'close policy versions cannot be deleted'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.billing_close_policies', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.billing_close_policies', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.billing_close_policies', 'DELETE'),
  'authenticated users have no generic close-policy mutation access'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.billing_calculations', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.billing_calculation_snapshots', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.billing_calculation_events', 'INSERT'),
  'authenticated users have no generic calculation fact insertion access'
);

SELECT throws_ok(
  $$INSERT INTO public.billing_calculations (
      organization_id, account_id, agreement_id, agreement_version_id,
      period_id, close_snapshot_id, business_key, request_fingerprint,
      close_input_fingerprint, terms_fingerprint, formula_kind,
      formula_version, rounding_policy_version, close_policy_version,
      explanation_version, selected_branch, result_amount_minor, currency,
      created_by, created_by_role
    ) VALUES (
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000003',
      '00000000-0000-0000-0000-000000000004',
      '00000000-0000-0000-0000-000000000005',
      '00000000-0000-0000-0000-000000000006',
      repeat('a', 64), repeat('b', 64), repeat('c', 64), repeat('d', 64),
      'fixed', 'billing-agreement-formula-v1', 'half-away-from-zero-v1',
      'billing-manual-v1', 'billing-agreement-explanation-v1',
      'fixed', 1, 'USD',
      '00000000-0000-0000-0000-000000000007', 'administrator'
    )$$,
  '23503',
  NULL,
  'calculation identity rejects nonexistent scoped lineage'
);

SELECT ok(
  (
    SELECT pg_get_constraintdef(constraint_record.oid)
    FROM pg_catalog.pg_constraint AS constraint_record
    WHERE constraint_record.conname = 'billing_calculation_snapshots_comparison_check'
  ) LIKE '%comparison_status%not_available%previous_calculation_id%IS NULL%delta_minor%IS NULL%',
  'missing previous period is explicitly not_available with null comparison authority'
);

CREATE FUNCTION pg_temp.formula_input(
  p_kind text,
  p_commissionable text,
  p_fixed jsonb,
  p_minimum jsonb,
  p_rate jsonb
)
RETURNS jsonb LANGUAGE sql AS $function$
  SELECT jsonb_build_object(
    'formula_kind', p_kind,
    'commissionable_amount', jsonb_build_object(
      'amount_minor', p_commissionable, 'currency', 'USD'
    ),
    'fixed_amount', p_fixed,
    'minimum_amount', p_minimum,
    'rate', p_rate,
    'currency_policy_version', 'usd-v1',
    'rounding_policy_version', 'half-away-from-zero-v1',
    'formula_version', 'billing-agreement-formula-v1'
  );
$function$;

CREATE FUNCTION pg_temp.money(p_amount text)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $function$
  SELECT jsonb_build_object('amount_minor', p_amount, 'currency', 'USD');
$function$;

CREATE FUNCTION pg_temp.rate(p_numerator text, p_denominator text, p_submitted text)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $function$
  SELECT jsonb_build_object(
    'kind', 'ordinary_percentage',
    'numerator', p_numerator,
    'denominator', p_denominator,
    'submitted_percentage', p_submitted,
    'rate_policy_version', 'ordinary-percentage-v1'
  );
$function$;

SELECT is(
  private.billing_calculate_exact(
    pg_temp.formula_input('fixed', '0', pg_temp.money('0'), NULL, NULL)
  ),
  '{"formula_kind":"fixed","intermediate_numerator":null,"intermediate_denominator":null,"fixed_candidate_minor":"0","minimum_candidate_minor":null,"percentage_candidate_minor":null,"selected_branch":"fixed","final_amount_minor":"0","currency":"USD"}'::jsonb,
  'fixed zero matches the TypeScript golden vector'
);

SELECT is(
  private.billing_calculate_exact(
    pg_temp.formula_input(
      'fixed', '0', pg_temp.money('9223372036854775807'), NULL, NULL
    )
  )->>'final_amount_minor',
  '9223372036854775807',
  'fixed bigint maximum remains exact'
);

SELECT is(
  private.billing_calculate_exact(
    pg_temp.formula_input(
      'percentage', '1000', NULL, NULL, pg_temp.rate('1', '8', '12.5%')
    )
  ),
  '{"formula_kind":"percentage","intermediate_numerator":"1000","intermediate_denominator":"8","fixed_candidate_minor":null,"minimum_candidate_minor":null,"percentage_candidate_minor":"125","selected_branch":"percentage","final_amount_minor":"125","currency":"USD"}'::jsonb,
  'percentage exact division matches the TypeScript golden vector'
);

SELECT is(
  private.billing_calculate_exact(
    pg_temp.formula_input(
      'percentage', '1', NULL, NULL, pg_temp.rate('1', '2', '50%')
    )
  )->>'percentage_candidate_minor',
  '1',
  'positive percentage tie rounds half away from zero once'
);

SELECT is(
  private.billing_calculate_exact(
    pg_temp.formula_input(
      'minimum_support', '0', NULL, pg_temp.money('125000'), NULL
    )
  )->>'final_amount_minor',
  '125000',
  'minimum-support result is exact'
);

SELECT is(
  private.billing_calculate_exact(
    pg_temp.formula_input(
      'minimum_support', '0', NULL,
      pg_temp.money('9223372036854775807'), NULL
    )
  )->>'final_amount_minor',
  '9223372036854775807',
  'minimum-support bigint maximum remains exact'
);

SELECT is(
  private.billing_calculate_exact(
    pg_temp.formula_input(
      'hybrid', '1000', NULL, pg_temp.money('200'),
      pg_temp.rate('1', '10', '10%')
    )
  )->>'selected_branch',
  'minimum',
  'hybrid below minimum selects minimum'
);

SELECT is(
  private.billing_calculate_exact(
    pg_temp.formula_input(
      'hybrid', '2000', NULL, pg_temp.money('200'),
      pg_temp.rate('1', '10', '10%')
    )
  )->>'selected_branch',
  'minimum_equal',
  'hybrid equality deterministically selects minimum_equal'
);

SELECT is(
  private.billing_calculate_exact(
    pg_temp.formula_input(
      'hybrid', '3000', NULL, pg_temp.money('200'),
      pg_temp.rate('1', '10', '10%')
    )
  )->>'selected_branch',
  'percentage',
  'hybrid above minimum selects percentage'
);

SELECT throws_ok(
  $$SELECT private.billing_calculate_exact(
    pg_temp.formula_input('fixed', '-1', pg_temp.money('1'), NULL, NULL)
  )$$,
  '22023', 'BILLING_CALCULATION_NEGATIVE_REVENUE',
  'negative commissionable revenue fails closed'
);

SELECT throws_ok(
  $$SELECT private.billing_calculate_exact(
    pg_temp.formula_input('tiered', '0', NULL, NULL, NULL)
  )$$,
  '22023', 'BILLING_CALCULATION_UNSUPPORTED_FORMULA',
  'unsupported formula kinds fail closed'
);

SELECT throws_ok(
  $$SELECT private.billing_calculate_exact(
    pg_temp.formula_input('fixed', '0', pg_temp.money('1'), NULL, NULL)
      || jsonb_build_object('rounding_policy_version', 'bankers-v1')
  )$$,
  '22023', 'BILLING_CALCULATION_POLICY_MISMATCH',
  'wrong calculation policy fails closed'
);

SELECT throws_ok(
  $$SELECT private.billing_calculate_exact(
    pg_temp.formula_input(
      'fixed', '0', pg_temp.money('1'), pg_temp.money('1'), NULL
    )
  )$$,
  '22023', 'BILLING_CALCULATION_INVALID',
  'ambiguous candidate inputs fail closed'
);

SELECT throws_ok(
  $$SELECT private.billing_calculate_exact(
    pg_temp.formula_input(
      'percentage', '1', NULL, NULL, pg_temp.rate('1', '0', '50%')
    )
  )$$,
  '22012', 'BILLING_CALCULATION_DIVISION_BY_ZERO',
  'zero rate denominator fails with a stable code'
);

SELECT throws_ok(
  $$SELECT private.billing_calculate_exact(
    pg_temp.formula_input(
      'fixed', '0', pg_temp.money('9223372036854775808'), NULL, NULL
    )
  )$$,
  '22003', 'BILLING_CALCULATION_OVERFLOW',
  'formula results above bigint maximum fail with a stable overflow code'
);

SELECT is(
  public.financial_round_usd_minor(
    '{"numerator":"1","denominator":"2","currency":"USD"}',
    'usd-v1', 'half-away-from-zero-v1', 2
  )->>'amount_minor',
  '1',
  'positive adjustment tie rounds away from zero'
);

SELECT is(
  public.financial_round_usd_minor(
    '{"numerator":"-1","denominator":"2","currency":"USD"}',
    'usd-v1', 'half-away-from-zero-v1', 2
  )->>'amount_minor',
  '-1',
  'negative adjustment tie rounds away from zero'
);

SELECT ok(
  pg_get_functiondef('private.billing_calculate_exact(jsonb)'::regprocedure)
    !~* 'double precision|(^|[^a-z_])real([^a-z_]|$)|::money',
  'formula kernel contains no SQL floating-point or locale money authority'
);

SELECT * FROM finish();
ROLLBACK;
