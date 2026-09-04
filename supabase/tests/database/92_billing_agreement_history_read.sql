BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(6);

SELECT has_function(
  'public', 'read_billing_agreements', ARRAY['jsonb'],
  'agreement support read remains available'
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
      'public.read_billing_agreements(jsonb)'::regprocedure
  ),
  'agreement support read stays a locked postgres-owned security definer'
);

SELECT ok(
  has_function_privilege(
    'authenticated', 'public.read_billing_agreements(jsonb)', 'EXECUTE'
  )
    AND NOT has_function_privilege(
      'anon', 'public.read_billing_agreements(jsonb)', 'EXECUTE'
    ),
  'agreement support read stays authenticated-only'
);

SELECT ok(
  pg_get_functiondef(
    'public.read_billing_agreements(jsonb)'::regprocedure
  ) ~ 'billing_has_capability'
    AND pg_get_functiondef(
      'public.read_billing_agreements(jsonb)'::regprocedure
    ) ~ '''agreement.read''',
  'agreement support read remains caller-capability scoped'
);

SELECT ok(
  pg_get_functiondef(
    'public.read_billing_agreements(jsonb)'::regprocedure
  ) ~ '''lifecycle_events'''
    AND pg_get_functiondef(
      'public.read_billing_agreements(jsonb)'::regprocedure
    ) ~ '''actor_id'''
    AND pg_get_functiondef(
      'public.read_billing_agreements(jsonb)'::regprocedure
    ) ~ '''actor_role'''
    AND pg_get_functiondef(
      'public.read_billing_agreements(jsonb)'::regprocedure
    ) ~ '''reason'''
    AND pg_get_functiondef(
      'public.read_billing_agreements(jsonb)'::regprocedure
    ) ~ '''created_at''',
  'agreement history exposes immutable lifecycle causation'
);

SELECT ok(
  pg_get_functiondef(
    'public.read_billing_agreements(jsonb)'::regprocedure
  ) ~ 'event.id::text'
    AND pg_get_functiondef(
      'public.read_billing_agreements(jsonb)'::regprocedure
    ) !~* 'object_path|storage_path|signed_url|raw_content',
  'agreement history stringifies event IDs and excludes unsafe evidence fields'
);

SELECT * FROM finish();
ROLLBACK;
