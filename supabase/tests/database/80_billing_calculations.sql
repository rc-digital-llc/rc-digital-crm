BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT no_plan();

SELECT has_function(
  'private', 'billing_calculate_exact', ARRAY['jsonb'],
  'private exact billing formula kernel exists'
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
