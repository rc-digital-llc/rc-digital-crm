CREATE EXTENSION IF NOT EXISTS pgtap;
SET search_path TO public, extensions;

BEGIN;

SELECT plan(47);

SELECT has_column('public', 'invoices', 'amount_minor', 'invoices have exact amount authority');
SELECT has_column('public', 'invoices', 'currency', 'invoices identify exact currency');
SELECT has_column('public', 'invoices', 'tax_rate_numerator', 'invoices have exact rate numerator');
SELECT has_column('public', 'invoices', 'tax_rate_denominator', 'invoices have exact rate denominator');
SELECT has_column('public', 'invoices', 'submitted_percentage', 'invoices preserve submitted rate evidence');
SELECT has_column('public', 'invoices', 'tax_amount_minor', 'invoices have exact tax authority');
SELECT has_column('public', 'invoices', 'total_amount_minor', 'invoices have exact total authority');
SELECT has_column('public', 'invoices', 'line_items_exact', 'invoices have canonical exact line items');
SELECT has_column('public', 'invoices', 'line_items_legacy_evidence', 'invoices retain immutable legacy evidence');

SELECT is(
  (
    SELECT data_type || ':' || numeric_precision || ':' || numeric_scale
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'tax_rate'
  ),
  'numeric:12:9',
  'legacy tax compatibility is widened independently to fixed nine-decimal precision'
);
SELECT is(
  (
    SELECT count(*) FROM public.invoices
    WHERE amount_minor IS NULL OR currency <> 'USD'
      OR tax_rate_denominator <= 0
      OR total_amount_minor::numeric <> amount_minor::numeric + tax_amount_minor::numeric
  ),
  0::bigint,
  'every existing invoice is converted and reconciled atomically'
);
SELECT is(
  private.billing_validate_exact_line_items('[{"description":"Synthetic unit","quantity_ratio":{"numerator":"1","denominator":"1"},"unit_price":{"amount_minor":"1","currency":"USD"},"extended_amount":{"amount_minor":"1","currency":"USD"},"currency_policy_version":"usd-v1","rounding_policy_version":"half-away-from-zero-v1"}]'::jsonb)->0->'quantity_ratio',
  '{"numerator":"1","denominator":"1"}'::jsonb,
  'exact quantity accepts one canonical ratio'
);
SELECT is(
  private.billing_validate_exact_line_items('[{"description":"Synthetic unit","quantity_ratio":{"numerator":"1","denominator":"1"},"unit_price":{"amount_minor":"1","currency":"USD"},"extended_amount":{"amount_minor":"1","currency":"USD"},"currency_policy_version":"usd-v1","rounding_policy_version":"half-away-from-zero-v1"}]'::jsonb)->0->'unit_price',
  '{"amount_minor":"1","currency":"USD"}'::jsonb,
  'exact unit price remains typed string money'
);
SELECT is(
  private.billing_validate_exact_line_items('[{"description":"Synthetic unit","quantity_ratio":{"numerator":"1","denominator":"1"},"unit_price":{"amount_minor":"1","currency":"USD"},"extended_amount":{"amount_minor":"1","currency":"USD"},"currency_policy_version":"usd-v1","rounding_policy_version":"half-away-from-zero-v1"}]'::jsonb)->0->'extended_amount',
  '{"amount_minor":"1","currency":"USD"}'::jsonb,
  'exact extended amount remains typed string money'
);
SELECT is(
  jsonb_build_array(
    private.billing_format_usd_minor('-9223372036854775808'::bigint),
    private.billing_format_usd_minor('9223372036854775807'::bigint)
  ),
  '["-92233720368547758.08","92233720368547758.07"]'::jsonb,
  'compatibility money preserves both signed-bigint endpoints exactly'
);

SELECT has_function('public', 'read_billing_invoices_exact', ARRAY['jsonb'], 'exact invoice read RPC exists');
SELECT has_function('public', 'read_billing_invoices_legacy_compat', ARRAY['jsonb'], 'compatibility invoice read RPC exists');
SELECT has_function('public', 'save_billing_invoice_exact', ARRAY['jsonb'], 'exact invoice save RPC exists');
SELECT is(
  (
    SELECT count(*)
    FROM pg_proc AS procedure_record
    JOIN pg_roles AS owner_role ON owner_role.oid = procedure_record.proowner
    WHERE procedure_record.oid = ANY (ARRAY[
      'public.read_billing_invoices_exact(jsonb)'::regprocedure,
      'public.read_billing_invoices_legacy_compat(jsonb)'::regprocedure,
      'public.save_billing_invoice_exact(jsonb)'::regprocedure
    ])
      AND procedure_record.prosecdef
      AND owner_role.rolname = 'postgres'
      AND coalesce(array_to_string(procedure_record.proconfig, ','), '') IN ('search_path=', 'search_path=""')
  ),
  3::bigint,
  'all invoice RPCs are locked SECURITY DEFINER functions with empty search paths'
);
SELECT is(
  (
    SELECT count(*) FROM pg_proc
    WHERE oid = ANY (ARRAY[
      'public.read_billing_invoices_exact(jsonb)'::regprocedure,
      'public.read_billing_invoices_legacy_compat(jsonb)'::regprocedure,
      'public.save_billing_invoice_exact(jsonb)'::regprocedure
    ]) AND pg_get_functiondef(oid) ~* '\mEXECUTE\M'
  ),
  0::bigint,
  'invoice RPCs contain no dynamic SQL'
);
SELECT ok(NOT has_table_privilege('authenticated', 'public.invoices', 'SELECT'), 'authenticated has no direct invoice SELECT');
SELECT ok(NOT has_table_privilege('authenticated', 'public.invoices', 'INSERT'), 'authenticated has no direct invoice INSERT');
SELECT ok(NOT has_table_privilege('authenticated', 'public.invoices', 'UPDATE'), 'authenticated has no direct invoice UPDATE');
SELECT ok(NOT has_table_privilege('authenticated', 'public.invoices', 'DELETE'), 'authenticated has no direct invoice DELETE');
SELECT ok(NOT has_sequence_privilege('authenticated', 'public.invoices_id_seq', 'USAGE'), 'authenticated has no invoice sequence usage');
SELECT ok(NOT has_table_privilege('anon', 'public.invoices', 'SELECT'), 'anonymous has no direct invoice SELECT');
SELECT ok(has_function_privilege('authenticated', 'public.read_billing_invoices_exact(jsonb)', 'EXECUTE'), 'authenticated can call exact reads');
SELECT ok(has_function_privilege('authenticated', 'public.read_billing_invoices_legacy_compat(jsonb)', 'EXECUTE'), 'authenticated can call compatibility reads');
SELECT ok(has_function_privilege('authenticated', 'public.save_billing_invoice_exact(jsonb)', 'EXECUTE'), 'authenticated can call exact saves');
SELECT ok(NOT has_function_privilege('anon', 'public.read_billing_invoices_exact(jsonb)', 'EXECUTE'), 'anonymous cannot call exact reads');

CREATE TEMP TABLE test_exact_invoice_results (label text PRIMARY KEY, payload jsonb) ON COMMIT DROP;
GRANT SELECT, INSERT ON test_exact_invoice_results TO authenticated;

SELECT set_config('request.jwt.claim.sub', '22000000-0000-0000-0000-000000000002', true);
SELECT set_config('request.jwt.claims', '{"sub":"22000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
INSERT INTO test_exact_invoice_results
VALUES (
  'bravo',
  public.save_billing_invoice_exact('{
    "billing_account_id":"22000000-0000-0000-0000-000000000200",
    "invoice_number":"EXACT-BRAVO-1",
    "amount":{"amount_minor":"9223372036854775807","currency":"USD"},
    "tax_rate":{"kind":"ordinary_percentage","numerator":"0","denominator":"1","submitted_percentage":"0%","rate_policy_version":"ordinary-percentage-v1"},
    "line_items":[],
    "status":"Draft"
  }'::jsonb)
);
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '21000000-0000-0000-0000-000000000002', true);
SELECT set_config('request.jwt.claims', '{"sub":"21000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
INSERT INTO test_exact_invoice_results
VALUES (
  'alpha',
  public.save_billing_invoice_exact('{
    "billing_account_id":"21000000-0000-0000-0000-000000000200",
    "invoice_number":"EXACT-ALPHA-1",
    "amount":{"amount_minor":"1","currency":"USD"},
    "tax_rate":{"kind":"ordinary_percentage","numerator":"71","denominator":"800","submitted_percentage":"8.875%","rate_policy_version":"ordinary-percentage-v1"},
    "line_items":[{"description":"Synthetic unit","quantity_ratio":{"numerator":"1","denominator":"1"},"unit_price":{"amount_minor":"1","currency":"USD"},"extended_amount":{"amount_minor":"1","currency":"USD"},"currency_policy_version":"usd-v1","rounding_policy_version":"half-away-from-zero-v1"}],
    "status":"Draft"
  }'::jsonb)
);
SELECT is(
  public.read_billing_invoices_exact(jsonb_build_object(
    'mode', 'get', 'invoice_id', (SELECT payload->'data'->>'id' FROM test_exact_invoice_results WHERE label = 'alpha')
  ))->'data'->>'amount_minor',
  '1',
  'same-account exact get returns canonical string money'
);
SELECT is(
  public.read_billing_invoices_legacy_compat(jsonb_build_object(
    'mode', 'get', 'invoice_id', (SELECT payload->'data'->>'id' FROM test_exact_invoice_results WHERE label = 'alpha')
  ))->'data'->>'tax_rate',
  '8.875000000',
  'compatibility get returns a fixed-nine-decimal bare percentage string'
);
SELECT is(
  public.read_billing_invoices_exact(jsonb_build_object(
    'mode', 'get', 'invoice_id', (SELECT payload->'data'->>'id' FROM test_exact_invoice_results WHERE label = 'bravo')
  ))->'data',
  'null'::jsonb,
  'a caller cannot enumerate another account invoice'
);
SELECT throws_ok(
  $$SELECT public.read_billing_invoices_exact('{"mode":"list","organization_id":"00000000-0000-0000-0000-000000000001"}'::jsonb)$$,
  'P0001', 'INVOICE_READ_INVALID_REQUEST',
  'client tenant identity is rejected'
);
SELECT throws_ok(
  $$SELECT public.read_billing_invoices_exact('{"mode":"list","page":0}'::jsonb)$$,
  'P0001', 'INVOICE_READ_INVALID_REQUEST',
  'unsafe pagination is rejected'
);
SELECT throws_ok(
  $$SELECT public.read_billing_invoices_exact('{"mode":"list","sort":"amount; drop table invoices"}'::jsonb)$$,
  'P0001', 'INVOICE_READ_INVALID_REQUEST',
  'unknown sort input is rejected'
);
SELECT throws_ok(
  $$SELECT public.read_billing_invoices_exact('{"mode":"list","filters":{"unknown":"x"}}'::jsonb)$$,
  'P0001', 'INVOICE_READ_INVALID_REQUEST',
  'unknown filters are rejected'
);
RESET ROLE;

CREATE TEMP TABLE test_invalid_save_snapshot AS
SELECT pg_catalog.jsonb_build_object(
  'invoice_count', (SELECT count(*)::text FROM public.invoices),
  'audit_count', (SELECT count(*)::text FROM public.billing_audit_events)
) AS payload;
SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.save_billing_invoice_exact('{
    "billing_account_id":"21000000-0000-0000-0000-000000000200",
    "invoice_number":"INVALID-NUMERIC-MONEY",
    "amount":{"amount_minor":1,"currency":"USD"},
    "tax_rate":{"kind":"ordinary_percentage","numerator":"0","denominator":"1","submitted_percentage":"0%","rate_policy_version":"ordinary-percentage-v1"},
    "line_items":[],
    "status":"Draft"
  }'::jsonb)$$,
  '22023', 'INVOICE_SAVE_INVALID_REQUEST',
  'numeric JSON money is rejected before any invoice save effect'
);
SELECT throws_ok(
  $$SELECT public.save_billing_invoice_exact('{
    "billing_account_id":"21000000-0000-0000-0000-000000000200",
    "invoice_number":"INVALID-PHASE5-KEY",
    "amount":{"amount_minor":"1","currency":"USD"},
    "tax_rate":{"kind":"ordinary_percentage","numerator":"0","denominator":"1","submitted_percentage":"0%","rate_policy_version":"ordinary-percentage-v1"},
    "line_items":[],
    "status":"Draft",
    "idempotency_key":"not-in-phase-three"
  }'::jsonb)$$,
  '22023', 'INVOICE_SAVE_INVALID_REQUEST',
  'invoice save rejects deferred Phase 5 idempotency fields'
);
RESET ROLE;
SELECT is(
  (SELECT payload FROM test_invalid_save_snapshot),
  pg_catalog.jsonb_build_object(
    'invoice_count', (SELECT count(*)::text FROM public.invoices),
    'audit_count', (SELECT count(*)::text FROM public.billing_audit_events)
  ),
  'invalid exact saves preserve invoice and audit effects'
);

SELECT has_column('public', 'billing_automation_grants', 'max_amount_minor', 'automation grant limits are exact');
SELECT has_column('public', 'billing_automation_grants', 'total_amount_consumed_minor', 'automation grant counters are exact');
SELECT has_column('public', 'billing_automation_executions', 'amount_minor', 'automation execution effects are exact');
SELECT has_column('public', 'billing_automation_executions', 'request_fingerprint', 'automation stores canonical request fingerprints');
SELECT has_column('public', 'billing_automation_executions', 'effect_fingerprint', 'automation stores canonical effect fingerprints');
SELECT is(
  (
    SELECT count(*) FROM pg_proc AS procedure_record
    JOIN pg_namespace AS namespace ON namespace.oid = procedure_record.pronamespace
    WHERE namespace.nspname = 'private'
      AND procedure_record.proname = 'billing_consume_automation_grant'
      AND pg_get_function_identity_arguments(procedure_record.oid) LIKE '%p_amount numeric%'
  ),
  0::bigint,
  'the old numeric automation helper signature is absent'
);
SELECT ok(
  pg_get_functiondef('private.billing_finalize_evidence_inspection(uuid,uuid,text,text,text,text,text)'::regprocedure)
    LIKE '%billing_consume_automation_grant%amount_minor%0%currency%USD%',
  'evidence finalization consumes canonical zero through the exact helper'
);

SELECT * FROM finish();
ROLLBACK;
