BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT no_plan();

SELECT has_function(
  'private', 'billing_validate_revenue_close_lineage', ARRAY['uuid'],
  'shared revenue-close lineage validator exists'
);
SELECT has_function(
  'private', 'billing_validate_calculation_lineage', ARRAY['uuid', 'boolean'],
  'shared calculation lineage validator exists'
);
SELECT has_function(
  'public', 'read_billing_calculation_lineage', ARRAY['jsonb'],
  'support-safe calculation lineage RPC exists'
);

SELECT is(
  (
    SELECT count(*)
    FROM pg_catalog.pg_trigger AS trigger_record
    JOIN pg_catalog.pg_class AS relation ON relation.oid = trigger_record.tgrelid
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND trigger_record.tgname IN (
        'billing_revenue_close_snapshots_validate_lineage',
        'billing_calculation_snapshots_validate_lineage',
        'billing_calculation_approvals_validate_lineage'
      )
      AND NOT trigger_record.tgisinternal
  ),
  3::bigint,
  'close, create, and approve transitions independently recheck shared lineage'
);

SELECT ok(
  (
    SELECT owner_role.rolname = 'postgres'
      AND procedure_record.prosecdef
      AND COALESCE(pg_catalog.array_to_string(procedure_record.proconfig, ','), '')
        IN ('search_path=', 'search_path=""')
    FROM pg_catalog.pg_proc AS procedure_record
    JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = procedure_record.proowner
    WHERE procedure_record.oid =
      'public.read_billing_calculation_lineage(jsonb)'::regprocedure
  ),
  'lineage read is a locked security definer with an empty search path'
);

SELECT ok(
  has_function_privilege(
    'authenticated', 'public.read_billing_calculation_lineage(jsonb)', 'EXECUTE'
  )
    AND NOT has_function_privilege(
      'anon', 'public.read_billing_calculation_lineage(jsonb)', 'EXECUTE'
    ),
  'lineage read is authenticated-only'
);

SELECT ok(
  pg_get_functiondef(
    'public.read_billing_calculation_lineage(jsonb)'::regprocedure
  ) !~* 'evidence_path|storage_path|raw_content|customer_name',
  'support-safe lineage source does not expose raw evidence or customer fields'
);

SELECT ok(
  pg_get_functiondef(
    'private.billing_validate_calculation_lineage(uuid,boolean)'::regprocedure
  ) !~* '(insert\s+into|update)\s+public\.(invoices|payments|ledger)',
  'calculation lineage validation creates no invoice, payment, or ledger effect'
);

SELECT has_table(
  'public', 'billing_adjustment_calculations',
  'append-only late-evidence adjustment calculations exist'
);
SELECT has_table(
  'public', 'billing_calculation_links',
  'acyclic original-to-adjustment links exist'
);
SELECT has_table(
  'public', 'billing_adjustment_exceptions',
  'prohibited negative deltas have a durable held exception'
);
SELECT has_function(
  'public', 'create_billing_adjustment_calculation', ARRAY['jsonb'],
  'late-evidence adjustment command exists'
);

SELECT is(
  (
    SELECT count(*)
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname IN (
        'billing_adjustment_calculations', 'billing_calculation_links',
        'billing_adjustment_exceptions'
      )
      AND relation.relrowsecurity
      AND relation.relforcerowsecurity
  ),
  3::bigint,
  'all adjustment facts force row security'
);

SELECT is(
  (
    SELECT count(*)
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'billing_adjustment_calculations'
      AND column_name IN (
        'original_amount_minor', 'actual_amount_minor', 'delta_minor',
        'intermediate_numerator', 'intermediate_denominator',
        'minimum_candidate_minor', 'percentage_candidate_minor'
      )
      AND data_type IN ('bigint', 'numeric')
  ),
  7::bigint,
  'adjustment reconciliation uses exact typed columns'
);

SELECT ok(
  NOT has_table_privilege(
    'authenticated', 'public.billing_adjustment_calculations', 'INSERT'
  )
    AND NOT has_table_privilege(
      'authenticated', 'public.billing_calculation_links', 'UPDATE'
    )
    AND has_function_privilege(
      'authenticated', 'public.create_billing_adjustment_calculation(jsonb)',
      'EXECUTE'
    )
    AND NOT has_function_privilege(
      'anon', 'public.create_billing_adjustment_calculation(jsonb)', 'EXECUTE'
    ),
  'adjustment writes are RPC-only and anonymous callers are denied'
);

SELECT ok(
  pg_get_functiondef(
    'public.create_billing_adjustment_calculation(jsonb)'::regprocedure
  ) !~* '(insert\s+into|update)\s+public\.(invoices|payments|ledger)',
  'adjustment command creates no invoice, payment, or ledger effect'
);

SELECT * FROM finish();
ROLLBACK;
