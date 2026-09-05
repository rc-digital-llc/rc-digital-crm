CREATE EXTENSION IF NOT EXISTS pgtap;
SET search_path TO public, extensions;

BEGIN;

SELECT plan(147);

SELECT has_table(
  'public',
  'financial_currency_policies',
  'the immutable currency policy catalog exists'
);
SELECT has_table(
  'public',
  'financial_rate_policies',
  'the immutable rate policy catalog exists'
);
SELECT has_table(
  'public',
  'financial_rounding_policies',
  'the immutable rounding policy catalog exists'
);

SELECT is(
  (
    SELECT pg_catalog.jsonb_build_object(
      'policy_version', policy_version,
      'currency', currency,
      'exponent', exponent
    )
    FROM public.financial_currency_policies
  ),
  '{"currency":"USD","exponent":2,"policy_version":"usd-v1"}'::jsonb,
  'the currency catalog contains exactly the USD v1 exponent contract'
);
SELECT is(
  (
    SELECT pg_catalog.jsonb_build_object(
      'policy_version', policy_version,
      'rate_kind', rate_kind,
      'minimum', minimum_numerator::text || '/' || minimum_denominator::text,
      'maximum', maximum_numerator::text || '/' || maximum_denominator::text,
      'fractional_digits', maximum_fractional_digits
    )
    FROM public.financial_rate_policies
  ),
  '{"maximum":"1/1","minimum":"0/1","rate_kind":"ordinary_percentage","policy_version":"ordinary-percentage-v1","fractional_digits":9}'::jsonb,
  'the rate catalog contains exactly the bounded ordinary percentage v1 contract'
);
SELECT is(
  (
    SELECT pg_catalog.jsonb_build_object(
      'policy_version', policy_version,
      'currency_policy_version', currency_policy_version,
      'currency_exponent', currency_exponent,
      'tie_rule', tie_rule
    )
    FROM public.financial_rounding_policies
  ),
  '{"tie_rule":"half_away_from_zero","policy_version":"half-away-from-zero-v1","currency_exponent":2,"currency_policy_version":"usd-v1"}'::jsonb,
  'the rounding catalog contains exactly the named signed tie rule'
);

SELECT col_type_is(
  'public',
  'financial_rate_policies',
  'minimum_numerator',
  'bigint',
  'rate policy minimum numerators use signed bigint persistence'
);
SELECT col_type_is(
  'public',
  'financial_rate_policies',
  'minimum_denominator',
  'bigint',
  'rate policy minimum denominators use signed bigint persistence'
);
SELECT col_type_is(
  'public',
  'financial_rate_policies',
  'maximum_numerator',
  'bigint',
  'rate policy maximum numerators use signed bigint persistence'
);
SELECT col_type_is(
  'public',
  'financial_rate_policies',
  'maximum_denominator',
  'bigint',
  'rate policy maximum denominators use signed bigint persistence'
);

SELECT is(
  (
    SELECT count(*)
    FROM pg_catalog.pg_class AS relation
    WHERE relation.oid = ANY (ARRAY[
      'public.financial_currency_policies'::regclass,
      'public.financial_rate_policies'::regclass,
      'public.financial_rounding_policies'::regclass
    ])
      AND relation.relrowsecurity
  ),
  3::bigint,
  'every financial policy catalog has row-level security enabled'
);
SELECT is(
  (
    SELECT count(*)
    FROM pg_catalog.pg_class AS relation
    WHERE relation.oid = ANY (ARRAY[
      'public.financial_currency_policies'::regclass,
      'public.financial_rate_policies'::regclass,
      'public.financial_rounding_policies'::regclass
    ])
      AND relation.relforcerowsecurity
  ),
  3::bigint,
  'every financial policy catalog forces row-level security'
);
SELECT is(
  (
    SELECT count(*)
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN (
        'financial_currency_policies',
        'financial_rate_policies',
        'financial_rounding_policies'
      )
      AND column_name = 'sales_id'
  ),
  0::bigint,
  'global server-owned policy rows do not pretend to have tenant sales ownership'
);
SELECT ok(
  has_table_privilege('authenticated', 'public.financial_currency_policies', 'SELECT')
    AND has_table_privilege('authenticated', 'public.financial_rate_policies', 'SELECT')
    AND has_table_privilege('authenticated', 'public.financial_rounding_policies', 'SELECT'),
  'authenticated callers have the intended safe catalog read boundary'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.financial_currency_policies', 'INSERT,UPDATE,DELETE')
    AND NOT has_table_privilege('authenticated', 'public.financial_rate_policies', 'INSERT,UPDATE,DELETE')
    AND NOT has_table_privilege('authenticated', 'public.financial_rounding_policies', 'INSERT,UPDATE,DELETE')
    AND NOT has_table_privilege('anon', 'public.financial_currency_policies', 'SELECT,INSERT,UPDATE,DELETE'),
  'browser roles cannot mutate policy catalogs and anonymous callers cannot read them'
);

SELECT throws_ok(
  $$UPDATE public.financial_currency_policies SET exponent = 3 WHERE policy_version = 'usd-v1'$$,
  'P0001',
  'FINANCIAL_POLICY_IMMUTABLE',
  'catalog rows reject accidental owner updates'
);
SELECT throws_ok(
  $$DELETE FROM public.financial_rounding_policies WHERE policy_version = 'half-away-from-zero-v1'$$,
  'P0001',
  'FINANCIAL_POLICY_IMMUTABLE',
  'catalog rows reject accidental owner deletes'
);

SELECT has_function(
  'public',
  'financial_normalize_integer',
  ARRAY['jsonb'],
  'the public integer normalization boundary exists'
);
SELECT has_function(
  'public',
  'financial_parse_percentage',
  ARRAY['jsonb', 'text'],
  'the public percentage parsing boundary exists'
);
SELECT has_function(
  'public',
  'financial_reduce_ratio',
  ARRAY['jsonb', 'jsonb'],
  'the public exact ratio boundary exists'
);
SELECT has_function(
  'public',
  'financial_round_to_minor_units',
  ARRAY['jsonb', 'jsonb', 'text', 'text', 'smallint', 'text'],
  'the public named rounding boundary exists'
);
SELECT ok(
  (
    SELECT pg_catalog.bool_and(
      coalesce(pg_catalog.array_to_string(procedure_record.proconfig, ','), '')
        IN ('search_path=', 'search_path=""')
    )
    FROM pg_catalog.pg_proc AS procedure_record
    JOIN pg_catalog.pg_namespace AS namespace_record
      ON namespace_record.oid = procedure_record.pronamespace
    WHERE namespace_record.nspname IN ('private', 'public')
      AND procedure_record.proname LIKE 'financial_%'
  ),
  'every exact financial function has an empty search_path'
);
SELECT ok(
  (
    SELECT pg_catalog.bool_and(owner_role.rolname = 'postgres')
    FROM pg_catalog.pg_proc AS procedure_record
    JOIN pg_catalog.pg_namespace AS namespace_record
      ON namespace_record.oid = procedure_record.pronamespace
    JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = procedure_record.proowner
    WHERE namespace_record.nspname IN ('private', 'public')
      AND procedure_record.proname LIKE 'financial_%'
  ),
  'every exact financial function has the locked migration owner'
);
SELECT ok(
  NOT has_function_privilege(
    'public',
    'private.financial_canonical_integer_text(jsonb,boolean)',
    'EXECUTE'
  )
    AND NOT has_function_privilege(
      'authenticated',
      'private.financial_canonical_integer_text(jsonb,boolean)',
      'EXECUTE'
    )
    AND NOT has_function_privilege(
      'public',
      'private.financial_reduce_ratio(jsonb,jsonb,boolean)',
      'EXECUTE'
    ),
  'private exact helpers have no PUBLIC or browser execute authority'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.financial_normalize_integer(jsonb)',
    'EXECUTE'
  )
    AND has_function_privilege(
      'authenticated',
      'public.financial_parse_percentage(jsonb,text)',
      'EXECUTE'
    )
    AND NOT has_function_privilege(
      'anon',
      'public.financial_normalize_integer(jsonb)',
      'EXECUTE'
    )
    AND NOT has_function_privilege(
      'public',
      'public.financial_normalize_integer(jsonb)',
      'EXECUTE'
    ),
  'only the intended authenticated public helper boundary is executable'
);

SELECT is(
  public.financial_normalize_integer('"00042"'::jsonb),
  '42',
  'integer text is emitted canonically as text'
);
SELECT is(
  public.financial_normalize_integer('"-000000"'::jsonb),
  '0',
  'signed zero normalizes to canonical unsigned zero'
);
SELECT is(
  public.financial_normalize_integer(pg_catalog.to_jsonb(pg_catalog.repeat('0', 64))),
  '0',
  'a 64-byte integer string is accepted before exact parsing'
);
SELECT throws_ok(
  $$SELECT public.financial_normalize_integer('42'::jsonb)$$,
  '22023',
  'FINANCIAL_INVALID_INTEGER',
  'a JSON numeric token is rejected before any integer cast'
);
SELECT throws_ok(
  $$SELECT public.financial_normalize_integer(to_jsonb(repeat('0', 65)))$$,
  '22023',
  'FINANCIAL_INPUT_TOO_LONG',
  'a 65-byte integer string is rejected before any integer cast'
);
SELECT throws_ok(
  $$SELECT public.financial_normalize_integer('"1.0"'::jsonb)$$,
  '22023',
  'FINANCIAL_INVALID_INTEGER',
  'malformed integer text fails closed'
);
SELECT throws_ok(
  $$SELECT public.financial_normalize_integer('"9223372036854775808"'::jsonb)$$,
  '22003',
  'FINANCIAL_OVERFLOW',
  'one step beyond the signed bigint persistence maximum fails closed'
);
SELECT is(
  public.financial_normalize_integer('"-9223372036854775808"'::jsonb),
  '-9223372036854775808',
  'the signed bigint persistence minimum succeeds exactly as text'
);

SELECT throws_ok(
  $$SELECT public.financial_parse_percentage('12.5'::jsonb, 'ordinary-percentage-v1')$$,
  '22023',
  'FINANCIAL_INVALID_PERCENTAGE',
  'a JSON numeric percentage token is rejected before any numeric cast'
);
SELECT throws_ok(
  $$SELECT public.financial_parse_percentage(to_jsonb('0100.000000000%'::text), 'ordinary-percentage-v1')$$,
  '22023',
  'FINANCIAL_INPUT_TOO_LONG',
  'a 15-byte percentage string fails before exact parsing'
);
SELECT throws_ok(
  $$SELECT public.financial_parse_percentage('"5"'::jsonb, 'ordinary-percentage-v1')$$,
  '22023',
  'FINANCIAL_INVALID_PERCENTAGE',
  'malformed percentage text fails closed'
);
SELECT throws_ok(
  $$SELECT public.financial_parse_percentage('"101%"'::jsonb, 'ordinary-percentage-v1')$$,
  '22023',
  'FINANCIAL_RATE_OUT_OF_BOUNDS',
  'ordinary percentages above the named policy maximum fail closed'
);
SELECT throws_ok(
  $$SELECT public.financial_parse_percentage('"12.5%"'::jsonb, 'ordinary-percentage-v2')$$,
  '22023',
  'FINANCIAL_POLICY_MISMATCH',
  'unsupported rate policies fail closed'
);
SELECT is(
  public.financial_parse_percentage('"12.500%"'::jsonb, 'ordinary-percentage-v1'),
  '{"kind":"ordinary_percentage","numerator":"1","denominator":"8","submitted_percentage":"12.500%","rate_policy_version":"ordinary-percentage-v1"}'::jsonb,
  'percentage evidence reduces to canonical string ratio components'
);

SELECT is(
  public.financial_reduce_ratio('"-0006"'::jsonb, '"0008"'::jsonb),
  '{"numerator":"-3","denominator":"4"}'::jsonb,
  'exact ratios normalize sign, zeros, and common factors'
);
SELECT throws_ok(
  $$SELECT public.financial_reduce_ratio('6'::jsonb, '"8"'::jsonb)$$,
  '22023',
  'FINANCIAL_INVALID_RATIO',
  'ratio JSON numeric tokens fail before casts'
);
SELECT throws_ok(
  $$SELECT public.financial_reduce_ratio('"1"'::jsonb, '"0"'::jsonb)$$,
  '22012',
  'FINANCIAL_ZERO_DENOMINATOR',
  'zero denominators fail closed'
);
SELECT throws_ok(
  $$SELECT public.financial_reduce_ratio('"1"'::jsonb, '"-2"'::jsonb)$$,
  '22023',
  'FINANCIAL_INVALID_RATIO',
  'negative denominators cannot become persisted authority'
);
SELECT throws_ok(
  $$SELECT public.financial_reduce_ratio('"9223372036854775808"'::jsonb, '"1"'::jsonb)$$,
  '22003',
  'FINANCIAL_OVERFLOW',
  'out-of-range canonical ratio components cannot cross persistence'
);

SELECT throws_ok(
  $$SELECT public.financial_round_to_minor_units(
    '"1"'::jsonb, '"2"'::jsonb, 'EUR', 'usd-v1', 2::smallint, 'half-away-from-zero-v1'
  )$$,
  '22023',
  'FINANCIAL_UNSUPPORTED_CURRENCY',
  'unsupported currencies fail closed at the rounding boundary'
);
SELECT throws_ok(
  $$SELECT public.financial_round_to_minor_units(
    '"1"'::jsonb, '"2"'::jsonb, 'USD', 'usd-v1', 3::smallint, 'half-away-from-zero-v1'
  )$$,
  '22023',
  'FINANCIAL_POLICY_MISMATCH',
  'currency exponent mismatches fail closed at the rounding boundary'
);
SELECT throws_ok(
  $$SELECT public.financial_round_to_minor_units(
    '"1"'::jsonb, '"2"'::jsonb, 'USD', 'usd-v1', 2::smallint, 'ambient-rounding'
  )$$,
  '22023',
  'FINANCIAL_POLICY_MISMATCH',
  'rounding policy mismatches fail closed'
);
SELECT is(
  public.financial_round_to_minor_units(
    '"1"'::jsonb, '"2"'::jsonb, 'USD', 'usd-v1', 2::smallint, 'half-away-from-zero-v1'
  ),
  '{"currency":"USD","amount_minor":"1"}'::jsonb,
  'the named boundary emits rounded minor units as a JSON string'
);

-- Independent PostgreSQL translation of the TypeScript golden fixtures.
SELECT is(
  public.financial_parse_percentage(
    pg_catalog.to_jsonb(golden.submitted),
    'ordinary-percentage-v1'
  ),
  pg_catalog.jsonb_build_object(
    'kind', 'ordinary_percentage',
    'numerator', golden.numerator,
    'denominator', golden.denominator,
    'submitted_percentage', golden.submitted,
    'rate_policy_version', 'ordinary-percentage-v1'
  ),
  'percentage golden vector reduces exactly: ' || golden.submitted
)
FROM (
  VALUES
    ('0%', '0', '1'),
    ('100%', '1', '1'),
    ('100.000000000%', '1', '1'),
    ('12.5%', '1', '8'),
    ('12.500%', '1', '8'),
    ('8.875%', '71', '800')
) AS golden(submitted, numerator, denominator);

SELECT is(
  public.financial_round_to_minor_units(
    pg_catalog.to_jsonb(golden.numerator),
    pg_catalog.to_jsonb(golden.denominator),
    'USD',
    'usd-v1',
    2::smallint,
    'half-away-from-zero-v1'
  ),
  pg_catalog.jsonb_build_object(
    'amount_minor', golden.expected_minor,
    'currency', 'USD'
  ),
  'signed rounding golden vector is exact: '
    || golden.numerator || '/' || golden.denominator
)
FROM (
  VALUES
    ('1', '2', '1'),
    ('-1', '2', '-1'),
    ('1', '3', '0'),
    ('-1', '3', '0'),
    ('2', '3', '1'),
    ('-2', '3', '-1'),
    ('6', '3', '2'),
    ('-6', '3', '-2'),
    ('0', '7', '0'),
    ('-0', '7', '0'),
    ('710000', '800', '888'),
    ('9223372036854775807', '1', '9223372036854775807'),
    ('-9223372036854775808', '1', '-9223372036854775808')
) AS golden(numerator, denominator, expected_minor);

SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$SELECT public.financial_parse_percentage(
    '"8.875%"'::jsonb,
    'ordinary-percentage-v1'
  )$$,
  'authenticated callers can use the narrow exact percentage wrapper'
);
SELECT throws_ok(
  $$INSERT INTO public.financial_currency_policies (
    policy_version, currency, exponent
  ) VALUES ('eur-v1', 'EUR', 2)$$,
  '42501',
  'permission denied for table financial_currency_policies',
  'authenticated callers cannot add policy catalog rows'
);
SELECT throws_ok(
  $$SELECT private.financial_canonical_integer_text('"1"'::jsonb, true)$$,
  '42501',
  'permission denied for function financial_canonical_integer_text',
  'authenticated callers cannot execute private exact helpers directly'
);

RESET ROLE;

SELECT throws_ok(
  $$SELECT public.financial_parse_percentage(
    '"0.0000000000%"'::jsonb,
    'ordinary-percentage-v1'
  )$$,
  '22023',
  'FINANCIAL_INVALID_PERCENTAGE',
  'ten fractional percentage digits exceed the v1 precision contract'
);
SELECT throws_ok(
  $$SELECT public.financial_parse_percentage(
    '"100.000000001%"'::jsonb,
    'ordinary-percentage-v1'
  )$$,
  '22023',
  'FINANCIAL_RATE_OUT_OF_BOUNDS',
  'percentage precision cannot conceal a value above 100 percent'
);
SELECT throws_ok(
  $$SELECT public.financial_round_to_minor_units(
    '1'::jsonb, '"2"'::jsonb,
    'USD', 'usd-v1', 2::smallint, 'half-away-from-zero-v1'
  )$$,
  '22023',
  'FINANCIAL_INVALID_RATIO',
  'numeric numerator JSON is rejected at the rounding boundary'
);
SELECT throws_ok(
  $$SELECT public.financial_round_to_minor_units(
    '"1"'::jsonb, '2'::jsonb,
    'USD', 'usd-v1', 2::smallint, 'half-away-from-zero-v1'
  )$$,
  '22023',
  'FINANCIAL_INVALID_RATIO',
  'numeric denominator JSON is rejected at the rounding boundary'
);
SELECT throws_ok(
  $$SELECT public.financial_round_to_minor_units(
    '"1"'::jsonb, '"0"'::jsonb,
    'USD', 'usd-v1', 2::smallint, 'half-away-from-zero-v1'
  )$$,
  '22012',
  'FINANCIAL_ZERO_DENOMINATOR',
  'rounding rejects a zero denominator before division'
);
SELECT throws_ok(
  $$SELECT public.financial_round_to_minor_units(
    '"1"'::jsonb, '"-2"'::jsonb,
    'USD', 'usd-v1', 2::smallint, 'half-away-from-zero-v1'
  )$$,
  '22023',
  'FINANCIAL_INVALID_RATIO',
  'rounding rejects a negative denominator'
);
SELECT throws_ok(
  $$SELECT public.financial_round_to_minor_units(
    '"1"'::jsonb, '"2"'::jsonb,
    'CAD', 'usd-v1', 2::smallint, 'half-away-from-zero-v1'
  )$$,
  '22023',
  'FINANCIAL_UNSUPPORTED_CURRENCY',
  'rounding rejects an unsupported currency identity'
);
SELECT throws_ok(
  $$SELECT public.financial_round_to_minor_units(
    '"1"'::jsonb, '"2"'::jsonb,
    'USD', 'usd-v2', 2::smallint, 'half-away-from-zero-v1'
  )$$,
  '22023',
  'FINANCIAL_POLICY_MISMATCH',
  'rounding rejects an unsupported currency policy version'
);
SELECT throws_ok(
  $$SELECT public.financial_round_to_minor_units(
    '"1"'::jsonb, '"2"'::jsonb,
    'USD', 'usd-v1', 3::smallint, 'half-away-from-zero-v1'
  )$$,
  '22023',
  'FINANCIAL_POLICY_MISMATCH',
  'rounding rejects an exponent mismatch'
);
SELECT throws_ok(
  $$SELECT public.financial_round_to_minor_units(
    '"1"'::jsonb, '"2"'::jsonb,
    'USD', 'usd-v1', 2::smallint, 'bankers-v1'
  )$$,
  '22023',
  'FINANCIAL_POLICY_MISMATCH',
  'rounding rejects an unsupported tie policy'
);

CREATE TEMPORARY TABLE financial_effect_snapshot AS
SELECT count(*) AS audit_count
FROM public.billing_audit_events;

SELECT throws_ok(
  $$SELECT public.financial_round_to_minor_units(
    '"9223372036854775808"'::jsonb, '"1"'::jsonb,
    'USD', 'usd-v1', 2::smallint, 'half-away-from-zero-v1'
  )$$,
  '22003',
  'FINANCIAL_OVERFLOW',
  'one step beyond the positive signed endpoint fails closed'
);
SELECT throws_ok(
  $$SELECT public.financial_round_to_minor_units(
    '"-9223372036854775809"'::jsonb, '"1"'::jsonb,
    'USD', 'usd-v1', 2::smallint, 'half-away-from-zero-v1'
  )$$,
  '22003',
  'FINANCIAL_OVERFLOW',
  'one step beyond the negative signed endpoint fails closed'
);
SELECT is(
  (SELECT count(*) FROM public.billing_audit_events),
  (SELECT audit_count FROM financial_effect_snapshot),
  'overflow failures create no persisted or audited effect'
);

-- Sixteen deterministic cases in each property family keep proof bounded.
WITH generated AS (
  SELECT
    property_case,
    (property_case * 37 - 91)::text AS numerator,
    (property_case % 11 + 2)::text AS denominator
  FROM pg_catalog.generate_series(1, 16) AS property_case
), reduced AS (
  SELECT
    property_case,
    public.financial_reduce_ratio(
      pg_catalog.to_jsonb(numerator),
      pg_catalog.to_jsonb(denominator)
    ) AS ratio
  FROM generated
)
SELECT is(
  public.financial_reduce_ratio(
    pg_catalog.to_jsonb(ratio->>'numerator'),
    pg_catalog.to_jsonb(ratio->>'denominator')
  ),
  ratio,
  'ratio reduction is idempotent for generated case ' || property_case::text
)
FROM reduced;

WITH generated AS (
  SELECT
    property_case,
    (property_case * 37 + 1)::text AS numerator,
    (property_case % 11 + 2)::text AS denominator
  FROM pg_catalog.generate_series(1, 16) AS property_case
), rounded AS (
  SELECT
    property_case,
    public.financial_round_to_minor_units(
      pg_catalog.to_jsonb(numerator),
      pg_catalog.to_jsonb(denominator),
      'USD', 'usd-v1', 2::smallint, 'half-away-from-zero-v1'
    ) AS positive,
    public.financial_round_to_minor_units(
      pg_catalog.to_jsonb('-' || numerator),
      pg_catalog.to_jsonb(denominator),
      'USD', 'usd-v1', 2::smallint, 'half-away-from-zero-v1'
    ) AS negative
  FROM generated
)
SELECT is(
  negative->>'amount_minor',
  '-' || (positive->>'amount_minor'),
  'signed rounding is symmetric for generated case ' || property_case::text
)
FROM rounded;

WITH generated AS (
  SELECT
    property_case,
    (property_case * 19 - 41)::text AS numerator,
    (property_case % 7 + 2)::text AS denominator,
    (property_case % 5 + 2)::text AS multiplier
  FROM pg_catalog.generate_series(1, 16) AS property_case
)
SELECT is(
  public.financial_reduce_ratio(
    pg_catalog.to_jsonb(numerator),
    pg_catalog.to_jsonb(denominator)
  ),
  public.financial_reduce_ratio(
    pg_catalog.to_jsonb((numerator::numeric * multiplier::numeric)::text),
    pg_catalog.to_jsonb((denominator::numeric * multiplier::numeric)::text)
  ),
  'equivalent generated ratios have one canonical value for case '
    || property_case::text
)
FROM generated;

WITH generated AS (
  SELECT
    property_case,
    (property_case * 23 - 177)::text AS left_numerator,
    (property_case * 23 - 176)::text AS right_numerator,
    (property_case % 9 + 2)::text AS denominator
  FROM pg_catalog.generate_series(1, 16) AS property_case
), rounded AS (
  SELECT
    property_case,
    public.financial_round_to_minor_units(
      pg_catalog.to_jsonb(left_numerator),
      pg_catalog.to_jsonb(denominator),
      'USD', 'usd-v1', 2::smallint, 'half-away-from-zero-v1'
    )->>'amount_minor' AS left_result,
    public.financial_round_to_minor_units(
      pg_catalog.to_jsonb(right_numerator),
      pg_catalog.to_jsonb(denominator),
      'USD', 'usd-v1', 2::smallint, 'half-away-from-zero-v1'
    )->>'amount_minor' AS right_result
  FROM generated
)
SELECT ok(
  left_result::numeric <= right_result::numeric,
  'rounding is monotonic for generated case ' || property_case::text
)
FROM rounded;

SELECT * FROM finish();
ROLLBACK;
