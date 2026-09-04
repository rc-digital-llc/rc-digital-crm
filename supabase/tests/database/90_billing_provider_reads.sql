BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(10);

SELECT has_function(
  'public', 'read_billing_revenue_periods', ARRAY['jsonb'],
  'bounded revenue-period support read exists'
);
SELECT has_function(
  'public', 'read_billing_calculations', ARRAY['jsonb'],
  'bounded calculation support read exists'
);

SELECT ok(
  (
    SELECT owner_role.rolname = 'postgres'
      AND procedure_record.prosecdef
      AND COALESCE(
        pg_catalog.array_to_string(procedure_record.proconfig, ','), ''
      ) IN ('search_path=', 'search_path=""')
    FROM pg_catalog.pg_proc AS procedure_record
    JOIN pg_catalog.pg_roles AS owner_role
      ON owner_role.oid = procedure_record.proowner
    WHERE procedure_record.oid =
      'public.read_billing_revenue_periods(jsonb)'::regprocedure
  ),
  'revenue support read is a locked postgres-owned security definer'
);
SELECT ok(
  (
    SELECT owner_role.rolname = 'postgres'
      AND procedure_record.prosecdef
      AND COALESCE(
        pg_catalog.array_to_string(procedure_record.proconfig, ','), ''
      ) IN ('search_path=', 'search_path=""')
    FROM pg_catalog.pg_proc AS procedure_record
    JOIN pg_catalog.pg_roles AS owner_role
      ON owner_role.oid = procedure_record.proowner
    WHERE procedure_record.oid =
      'public.read_billing_calculations(jsonb)'::regprocedure
  ),
  'calculation support read is a locked postgres-owned security definer'
);

SELECT ok(
  has_function_privilege(
    'authenticated', 'public.read_billing_revenue_periods(jsonb)', 'EXECUTE'
  )
    AND NOT has_function_privilege(
      'anon', 'public.read_billing_revenue_periods(jsonb)', 'EXECUTE'
    ),
  'revenue support read is authenticated-only'
);
SELECT ok(
  has_function_privilege(
    'authenticated', 'public.read_billing_calculations(jsonb)', 'EXECUTE'
  )
    AND NOT has_function_privilege(
      'anon', 'public.read_billing_calculations(jsonb)', 'EXECUTE'
    ),
  'calculation support read is authenticated-only'
);

SELECT ok(
  pg_get_functiondef(
    'public.read_billing_revenue_periods(jsonb)'::regprocedure
  ) ~ 'per_page_value NOT BETWEEN 1 AND 100'
    AND pg_get_functiondef(
      'public.read_billing_revenue_periods(jsonb)'::regprocedure
    ) ~ 'billing_has_capability',
  'revenue support read is bounded and caller-capability scoped'
);
SELECT ok(
  pg_get_functiondef(
    'public.read_billing_calculations(jsonb)'::regprocedure
  ) ~ 'per_page_value NOT BETWEEN 1 AND 100'
    AND pg_get_functiondef(
      'public.read_billing_calculations(jsonb)'::regprocedure
    ) ~ 'billing_has_capability',
  'calculation support read is bounded and caller-capability scoped'
);

SELECT ok(
  pg_get_functiondef(
    'public.read_billing_revenue_periods(jsonb)'::regprocedure
  ) !~* 'object_path|storage_path|signed_url|raw_content',
  'revenue support read excludes evidence storage and raw content'
);
SELECT ok(
  pg_get_functiondef(
    'public.read_billing_calculations(jsonb)'::regprocedure
  ) ~ 'result_amount_minor::text'
    AND pg_get_functiondef(
      'public.read_billing_calculations(jsonb)'::regprocedure
    ) ~ 'delta_rate_denominator::text',
  'calculation support read serializes authoritative integers as strings'
);

SELECT * FROM finish();
ROLLBACK;
