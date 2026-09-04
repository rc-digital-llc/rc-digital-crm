CREATE EXTENSION IF NOT EXISTS pgtap;
SET search_path TO public, extensions;

BEGIN;

SELECT plan(56);

-- Immutable global policy catalogs and least-privilege boundaries.
SELECT is(
  (
    SELECT count(*)
    FROM pg_class AS relation
    WHERE relation.oid = ANY (ARRAY[
      'public.financial_currency_policies'::regclass,
      'public.financial_rate_policies'::regclass,
      'public.financial_rounding_policies'::regclass
    ]) AND relation.relrowsecurity
  ),
  3::bigint,
  'all exact-financial policy catalogs have row-level security enabled'
);
SELECT is(
  (
    SELECT count(*)
    FROM pg_class AS relation
    WHERE relation.oid = ANY (ARRAY[
      'public.financial_currency_policies'::regclass,
      'public.financial_rate_policies'::regclass,
      'public.financial_rounding_policies'::regclass
    ]) AND relation.relforcerowsecurity
  ),
  3::bigint,
  'all exact-financial policy catalogs force row-level security'
);
SELECT is(
  (SELECT jsonb_agg(to_jsonb(policy) - 'created_at' ORDER BY policy.policy_version)
   FROM public.financial_currency_policies AS policy),
  '[{"currency":"USD","minor_unit_exponent":2,"policy_version":"usd-v1"}]'::jsonb,
  'currency catalog contains exactly immutable USD exponent-2 policy v1'
);
SELECT is(
  (SELECT jsonb_agg(to_jsonb(policy) - 'created_at' ORDER BY policy.policy_version)
   FROM public.financial_rate_policies AS policy),
  '[{"kind":"ordinary_percentage","maximum_denominator":100000000000,"maximum_fraction_digits":9,"maximum_numerator":1,"minimum_denominator":1,"minimum_numerator":0,"policy_version":"ordinary-percentage-v1"}]'::jsonb,
  'rate catalog contains exactly the bounded nine-digit ordinary percentage policy'
);
SELECT is(
  (SELECT jsonb_agg(to_jsonb(policy) - 'created_at' ORDER BY policy.policy_version)
   FROM public.financial_rounding_policies AS policy),
  '[{"currency_policy_version":"usd-v1","policy_version":"half-away-from-zero-v1","tie_rule":"half_away_from_zero"}]'::jsonb,
  'rounding catalog contains exactly the named half-away-from-zero policy'
);
SELECT is(
  (
    SELECT count(*)
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name LIKE 'financial_%_policies'
      AND column_name = 'sales_id'
  ),
  0::bigint,
  'global server-owned policy rows intentionally have no tenant sales_id owner'
);
SELECT is(
  (SELECT count(*) FROM information_schema.table_privileges
   WHERE table_schema = 'public'
     AND table_name LIKE 'financial_%_policies'
     AND grantee = 'authenticated'),
  0::bigint,
  'authenticated callers have no direct catalog privileges'
);
SELECT is(
  (SELECT count(*) FROM information_schema.table_privileges
   WHERE table_schema = 'public'
     AND table_name LIKE 'financial_%_policies'
     AND grantee = 'anon'),
  0::bigint,
  'anonymous callers have no direct catalog privileges'
);
SELECT is(
  (SELECT count(*) FROM information_schema.table_privileges
   WHERE table_schema = 'public'
     AND table_name LIKE 'financial_%_policies'
     AND grantee = 'service_role'),
  0::bigint,
  'service callers use narrow definer functions rather than direct catalog DML'
);
SELECT is(
  (
    SELECT count(*)
    FROM pg_trigger
    WHERE tgrelid = ANY (ARRAY[
      'public.financial_currency_policies'::regclass,
      'public.financial_rate_policies'::regclass,
      'public.financial_rounding_policies'::regclass
    ])
      AND NOT tgisinternal
      AND tgname LIKE '%_immutable'
  ),
  3::bigint,
  'each policy catalog rejects update and delete mutation'
);
SELECT throws_ok(
  $$UPDATE public.financial_currency_policies SET minor_unit_exponent = 3 WHERE policy_version = 'usd-v1'$$,
  'P0001',
  'FINANCIAL_POLICY_IMMUTABLE',
  'currency policy rows cannot be updated accidentally'
);
SELECT throws_ok(
  $$DELETE FROM public.financial_rounding_policies WHERE policy_version = 'half-away-from-zero-v1'$$,
  'P0001',
  'FINANCIAL_POLICY_IMMUTABLE',
  'rounding policy rows cannot be deleted accidentally'
);
SELECT is(
  (
    SELECT count(*)
    FROM pg_proc AS procedure_record
    JOIN pg_namespace AS namespace ON namespace.oid = procedure_record.pronamespace
    WHERE namespace.nspname IN ('private', 'public')
      AND procedure_record.proname LIKE 'financial_%'
      AND coalesce(array_to_string(procedure_record.proconfig, ','), '') IN ('search_path=', 'search_path=""')
  ),
  10::bigint,
  'every exact-financial helper and wrapper has an empty search_path'
);
SELECT is(
  (
    SELECT count(*)
    FROM pg_proc AS procedure_record
    JOIN pg_namespace AS namespace ON namespace.oid = procedure_record.pronamespace
    WHERE namespace.nspname = 'private'
      AND procedure_record.proname LIKE 'financial_%'
      AND NOT has_function_privilege('public', procedure_record.oid, 'EXECUTE')
  ),
  7::bigint,
  'PUBLIC cannot execute any private exact-financial helper'
);
SELECT is(
  (
    SELECT count(*)
    FROM pg_proc AS procedure_record
    JOIN pg_namespace AS namespace ON namespace.oid = procedure_record.pronamespace
    WHERE namespace.nspname = 'private'
      AND procedure_record.proname LIKE 'financial_%'
      AND NOT has_function_privilege('authenticated', procedure_record.oid, 'EXECUTE')
  ),
  7::bigint,
  'authenticated callers cannot bypass public exact-financial wrappers'
);
SELECT is(
  (
    SELECT count(*)
    FROM pg_proc AS procedure_record
    JOIN pg_namespace AS namespace ON namespace.oid = procedure_record.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure_record.proname LIKE 'financial_%'
      AND has_function_privilege('authenticated', procedure_record.oid, 'EXECUTE')
  ),
  3::bigint,
  'authenticated callers can execute exactly the three public wrappers'
);
SELECT is(
  (
    SELECT count(*)
    FROM pg_proc AS procedure_record
    JOIN pg_namespace AS namespace ON namespace.oid = procedure_record.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure_record.proname LIKE 'financial_%'
      AND has_function_privilege('anon', procedure_record.oid, 'EXECUTE')
  ),
  0::bigint,
  'anonymous callers cannot execute exact-financial wrappers'
);
SELECT is(
  (
    SELECT count(*)
    FROM pg_proc AS procedure_record
    JOIN pg_namespace AS namespace ON namespace.oid = procedure_record.pronamespace
    JOIN pg_roles AS owner_role ON owner_role.oid = procedure_record.proowner
    WHERE namespace.nspname IN ('private', 'public')
      AND procedure_record.proname LIKE 'financial_%'
      AND owner_role.rolname = 'postgres'
  ),
  10::bigint,
  'all exact-financial functions are owned by the locked postgres migration owner'
);

-- String-only money boundary, canonicalization, and signed persistence range.
SELECT is(
  public.financial_parse_usd_money('{"amount_minor":"00010888","currency":"USD"}'::jsonb, 'usd-v1'),
  '{"amount_minor":"10888","currency":"USD"}'::jsonb,
  'money canonicalizes leading zeroes'
);
SELECT is(
  public.financial_parse_usd_money('{"amount_minor":"-9223372036854775808","currency":"USD"}'::jsonb, 'usd-v1'),
  '{"amount_minor":"-9223372036854775808","currency":"USD"}'::jsonb,
  'money accepts the signed bigint minimum exactly'
);
SELECT is(
  public.financial_parse_usd_money('{"amount_minor":"9223372036854775807","currency":"USD"}'::jsonb, 'usd-v1'),
  '{"amount_minor":"9223372036854775807","currency":"USD"}'::jsonb,
  'money accepts the signed bigint maximum exactly'
);
SELECT throws_ok(
  $$SELECT public.financial_parse_usd_money('{"amount_minor":1,"currency":"USD"}'::jsonb, 'usd-v1')$$,
  '22023', 'FINANCIAL_INVALID_INTEGER',
  'money rejects a JSON numeric token before casting'
);
SELECT throws_ok(
  $$SELECT public.financial_parse_usd_money(jsonb_build_object('amount_minor', repeat('0', 65), 'currency', 'USD'), 'usd-v1')$$,
  '22023', 'FINANCIAL_INPUT_TOO_LONG',
  'money rejects a 65-byte integer before casting'
);
SELECT throws_ok(
  $$SELECT public.financial_parse_usd_money('{"amount_minor":"1.0","currency":"USD"}'::jsonb, 'usd-v1')$$,
  '22023', 'FINANCIAL_INVALID_INTEGER',
  'money rejects malformed decimal integer text'
);
SELECT throws_ok(
  $$SELECT public.financial_parse_usd_money('{"amount_minor":"1","currency":"EUR"}'::jsonb, 'usd-v1')$$,
  '22023', 'FINANCIAL_UNSUPPORTED_CURRENCY',
  'money rejects unsupported currency'
);
SELECT throws_ok(
  $$SELECT public.financial_parse_usd_money('{"amount_minor":"1","currency":"USD"}'::jsonb, 'latest')$$,
  '22023', 'FINANCIAL_POLICY_MISMATCH',
  'money rejects an unsupported currency policy'
);
SELECT throws_ok(
  $$SELECT public.financial_parse_usd_money('{"amount_minor":"9223372036854775808","currency":"USD"}'::jsonb, 'usd-v1')$$,
  '22003', 'FINANCIAL_OVERFLOW',
  'money rejects one step above the signed bigint maximum'
);
SELECT throws_ok(
  $$SELECT public.financial_parse_usd_money('{"amount_minor":"-9223372036854775809","currency":"USD"}'::jsonb, 'usd-v1')$$,
  '22003', 'FINANCIAL_OVERFLOW',
  'money rejects one step below the signed bigint minimum'
);

-- Exact ordinary-percentage parsing and reduced-ratio evidence.
SELECT is(
  public.financial_parse_ordinary_percentage(to_jsonb('12.500%'::text), 'ordinary-percentage-v1'),
  '{"kind":"ordinary_percentage","numerator":"1","denominator":"8","submitted_percentage":"12.500%","rate_policy_version":"ordinary-percentage-v1"}'::jsonb,
  '12.500 percent reduces to one eighth while retaining submitted evidence'
);
SELECT is(
  public.financial_parse_ordinary_percentage(to_jsonb('8.875%'::text), 'ordinary-percentage-v1'),
  '{"kind":"ordinary_percentage","numerator":"71","denominator":"800","submitted_percentage":"8.875%","rate_policy_version":"ordinary-percentage-v1"}'::jsonb,
  '8.875 percent reduces exactly to 71/800'
);
SELECT is(
  public.financial_parse_ordinary_percentage(to_jsonb('0.000%'::text), 'ordinary-percentage-v1')->>'denominator',
  '1',
  'zero rate canonicalizes to denominator one'
);
SELECT is(
  public.financial_parse_ordinary_percentage(to_jsonb('100.000000000%'::text), 'ordinary-percentage-v1')->>'numerator',
  '1',
  'the 14-byte nine-digit 100-percent boundary is accepted'
);
SELECT throws_ok(
  $$SELECT public.financial_parse_ordinary_percentage(to_jsonb(12.5::numeric), 'ordinary-percentage-v1')$$,
  '22023', 'FINANCIAL_INVALID_RATE',
  'rate parser rejects JSON numeric tokens'
);
SELECT throws_ok(
  $$SELECT public.financial_parse_ordinary_percentage(to_jsonb('100.0000000000%'::text), 'ordinary-percentage-v1')$$,
  '22023', 'FINANCIAL_INPUT_TOO_LONG',
  'rate parser rejects a 15-byte percentage before casting'
);
SELECT throws_ok(
  $$SELECT public.financial_parse_ordinary_percentage(to_jsonb('100.000000001%'::text), 'ordinary-percentage-v1')$$,
  '22023', 'FINANCIAL_RATE_OUT_OF_BOUNDS',
  'rate parser rejects values above 100 percent'
);
SELECT throws_ok(
  $$SELECT public.financial_parse_ordinary_percentage(to_jsonb('01%'::text), 'ordinary-percentage-v1')$$,
  '22023', 'FINANCIAL_INVALID_RATE',
  'rate parser rejects noncanonical percentage grammar'
);
SELECT throws_ok(
  $$SELECT public.financial_parse_ordinary_percentage(to_jsonb('1%'::text), 'latest')$$,
  '22023', 'FINANCIAL_POLICY_MISMATCH',
  'rate parser rejects unsupported policy identity'
);

-- Named signed rounding and persistence-boundary behavior.
SELECT is(public.financial_round_usd_minor('{"numerator":"1","denominator":"2"}'::jsonb, 'usd-v1', 'half-away-from-zero-v1', 2)->>'amount_minor', '1', '+0.5 rounds to +1');
SELECT is(public.financial_round_usd_minor('{"numerator":"-1","denominator":"2"}'::jsonb, 'usd-v1', 'half-away-from-zero-v1', 2)->>'amount_minor', '-1', '-0.5 rounds to -1');
SELECT is(public.financial_round_usd_minor('{"numerator":"1","denominator":"3"}'::jsonb, 'usd-v1', 'half-away-from-zero-v1', 2)->>'amount_minor', '0', '+1/3 rounds toward zero');
SELECT is(public.financial_round_usd_minor('{"numerator":"-1","denominator":"3"}'::jsonb, 'usd-v1', 'half-away-from-zero-v1', 2)->>'amount_minor', '0', '-1/3 canonicalizes to unsigned zero');
SELECT is(public.financial_round_usd_minor('{"numerator":"2","denominator":"3"}'::jsonb, 'usd-v1', 'half-away-from-zero-v1', 2)->>'amount_minor', '1', '+2/3 rounds away from zero');
SELECT is(public.financial_round_usd_minor('{"numerator":"-2","denominator":"3"}'::jsonb, 'usd-v1', 'half-away-from-zero-v1', 2)->>'amount_minor', '-1', '-2/3 rounds away from zero');
SELECT is(public.financial_round_usd_minor('{"numerator":"6","denominator":"3"}'::jsonb, 'usd-v1', 'half-away-from-zero-v1', 2)->>'amount_minor', '2', 'exact division does not round');
SELECT is(public.financial_round_usd_minor('{"numerator":"710000","denominator":"800"}'::jsonb, 'usd-v1', 'half-away-from-zero-v1', 2)->>'amount_minor', '888', '10000 times 71/800 rounds once to 888 minor units');
SELECT is(public.financial_round_usd_minor('{"numerator":"-9223372036854775808","denominator":"1"}'::jsonb, 'usd-v1', 'half-away-from-zero-v1', 2)->>'amount_minor', '-9223372036854775808', 'rounding handles the full signed minimum without bigint negation overflow');
SELECT is(public.financial_round_usd_minor('{"numerator":"9223372036854775807","denominator":"1"}'::jsonb, 'usd-v1', 'half-away-from-zero-v1', 2)->>'amount_minor', '9223372036854775807', 'rounding handles the full signed maximum');
SELECT throws_ok(
  $$SELECT public.financial_round_usd_minor('{"numerator":"1","denominator":"0"}'::jsonb, 'usd-v1', 'half-away-from-zero-v1', 2)$$,
  '22012', 'FINANCIAL_DIVISION_BY_ZERO', 'rounding rejects denominator zero'
);
SELECT throws_ok(
  $$SELECT public.financial_round_usd_minor('{"numerator":"1","denominator":"2"}'::jsonb, 'usd-v1', 'latest', 2)$$,
  '22023', 'FINANCIAL_POLICY_MISMATCH', 'rounding rejects policy mismatch'
);
SELECT throws_ok(
  $$SELECT public.financial_round_usd_minor('{"numerator":"1","denominator":"2"}'::jsonb, 'usd-v1', 'half-away-from-zero-v1', 3)$$,
  '22023', 'FINANCIAL_POLICY_MISMATCH', 'rounding rejects currency exponent mismatch'
);
SELECT throws_ok(
  $$SELECT public.financial_round_usd_minor('{"numerator":"1","denominator":"2","currency":"EUR"}'::jsonb, 'usd-v1', 'half-away-from-zero-v1', 2)$$,
  '22023', 'FINANCIAL_UNSUPPORTED_CURRENCY', 'rounding rejects unsupported currency when supplied'
);
SELECT throws_ok(
  $$SELECT public.financial_round_usd_minor('{"numerator":"9223372036854775808","denominator":"1"}'::jsonb, 'usd-v1', 'half-away-from-zero-v1', 2)$$,
  '22003', 'FINANCIAL_OVERFLOW', 'rounding rejects final persistence overflow'
);

-- Bounded deterministic property proof, independent of the TypeScript implementation.
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM generate_series(-100, 100) AS numerator
    CROSS JOIN generate_series(1, 17) AS denominator
    CROSS JOIN LATERAL private.financial_normalize_ratio(to_jsonb(numerator::text), to_jsonb(denominator::text)) AS first_value
    CROSS JOIN LATERAL private.financial_normalize_ratio(to_jsonb(first_value->>'numerator'), to_jsonb(first_value->>'denominator')) AS second_value
    WHERE first_value <> second_value
  ),
  'ratio reduction is idempotent for the bounded generated matrix'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM generate_series(-100, 100) AS numerator
    CROSS JOIN generate_series(1, 17) AS denominator
    WHERE private.financial_normalize_ratio(to_jsonb(numerator::text), to_jsonb(denominator::text))
      <> private.financial_normalize_ratio(to_jsonb((numerator * 7)::text), to_jsonb((denominator * 7)::text))
  ),
  'equivalent generated ratios normalize identically'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM generate_series(-100, 100) AS numerator
    CROSS JOIN generate_series(1, 17) AS denominator
    WHERE (public.financial_round_usd_minor(jsonb_build_object('numerator', numerator::text, 'denominator', denominator::text), 'usd-v1', 'half-away-from-zero-v1', 2)->>'amount_minor')::numeric
      <> -((public.financial_round_usd_minor(jsonb_build_object('numerator', (-numerator)::text, 'denominator', denominator::text), 'usd-v1', 'half-away-from-zero-v1', 2)->>'amount_minor')::numeric)
  ),
  'signed rounding is symmetric for the bounded generated matrix'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM generate_series(-100, 100) AS numerator
    CROSS JOIN generate_series(1, 17) AS denominator
    WHERE (public.financial_round_usd_minor(jsonb_build_object('numerator', numerator::text, 'denominator', denominator::text), 'usd-v1', 'half-away-from-zero-v1', 2)->>'amount_minor')::numeric
      > (public.financial_round_usd_minor(jsonb_build_object('numerator', (numerator + 1)::text, 'denominator', denominator::text), 'usd-v1', 'half-away-from-zero-v1', 2)->>'amount_minor')::numeric
  ),
  'rounding is monotonic for the bounded generated matrix'
);

SELECT * FROM finish();
ROLLBACK;
