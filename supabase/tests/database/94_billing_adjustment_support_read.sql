BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(7);

SELECT has_function(
  'public', 'read_billing_calculations', ARRAY['jsonb'],
  'calculation support read remains available'
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
  'calculation support read stays a locked postgres-owned security definer'
);

SELECT ok(
  has_function_privilege('authenticated',
    'public.read_billing_calculations(jsonb)', 'EXECUTE')
  AND NOT has_function_privilege('anon',
    'public.read_billing_calculations(jsonb)', 'EXECUTE'),
  'calculation support read stays authenticated-only'
);

SELECT ok(
  pg_get_functiondef('public.read_billing_calculations(jsonb)'::regprocedure)
    ~ 'billing_has_capability[\s\S]*calculation\.read',
  'calculation support read remains caller-capability scoped'
);

SELECT ok(
  pg_get_functiondef('public.read_billing_calculations(jsonb)'::regprocedure)
    ~ '''adjustments'''
  AND pg_get_functiondef('public.read_billing_calculations(jsonb)'::regprocedure)
    ~ '''original_amount'''
  AND pg_get_functiondef('public.read_billing_calculations(jsonb)'::regprocedure)
    ~ '''actual_amount'''
  AND pg_get_functiondef('public.read_billing_calculations(jsonb)'::regprocedure)
    ~ '''delta'''
  AND pg_get_functiondef('public.read_billing_calculations(jsonb)'::regprocedure)
    ~ '''treatment'''
  AND pg_get_functiondef('public.read_billing_calculations(jsonb)'::regprocedure)
    ~ '''reason''',
  'calculation support read exposes durable adjustment explanation fields'
);

SELECT ok(
  pg_get_functiondef('public.read_billing_calculations(jsonb)'::regprocedure)
    ~ 'late_review_event_id::text'
  AND pg_get_functiondef('public.read_billing_calculations(jsonb)'::regprocedure)
    ~ 'original_amount_minor::text'
  AND pg_get_functiondef('public.read_billing_calculations(jsonb)'::regprocedure)
    ~ 'actual_amount_minor::text'
  AND pg_get_functiondef('public.read_billing_calculations(jsonb)'::regprocedure)
    ~ 'delta_minor::text',
  'adjustment IDs and exact financial integers cross as strings'
);

SELECT ok(
  pg_get_functiondef('public.read_billing_calculations(jsonb)'::regprocedure)
    !~ '''created_by'''
  AND pg_get_functiondef('public.read_billing_calculations(jsonb)'::regprocedure)
    !~ '''command_key'''
  AND pg_get_functiondef('public.read_billing_calculations(jsonb)'::regprocedure)
    !~ '''late_evidence_snapshot'''
  AND pg_get_functiondef('public.read_billing_calculations(jsonb)'::regprocedure)
    !~ '''response_snapshot''',
  'adjustment support rows exclude command and evidence internals'
);

SELECT * FROM finish();
ROLLBACK;
