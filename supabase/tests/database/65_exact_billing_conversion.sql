CREATE EXTENSION IF NOT EXISTS pgtap;
SET search_path TO public, extensions;

BEGIN;

SELECT plan(44);

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
    SELECT jsonb_build_object(
      'amount_minor', amount_minor::text,
      'currency', currency,
      'rate', jsonb_build_array(tax_rate_numerator::text, tax_rate_denominator::text),
      'submitted', submitted_percentage,
      'tax_minor', tax_amount_minor::text,
      'total_minor', total_amount_minor::text
    )
    FROM public.invoices WHERE id = 6002
  ),
  '{"amount_minor":"1234567","currency":"USD","rate":["33","400"],"submitted":"8.25%","tax_minor":"101852","total_minor":"1336419"}'::jsonb,
  'accepted invoice values convert without guessing or rounding'
);
SELECT is(
  (SELECT line_items_exact->0->'quantity_ratio' FROM public.invoices WHERE id = 6001),
  '{"numerator":"1","denominator":"1"}'::jsonb,
  'legacy quantity maps to one canonical ratio'
);
SELECT is(
  (SELECT line_items_exact->0->'unit_price' FROM public.invoices WHERE id = 6001),
  '{"amount_minor":"1","currency":"USD"}'::jsonb,
  'legacy rate maps only to exact unit price'
);
SELECT is(
  (SELECT line_items_exact->0->'extended_amount' FROM public.invoices WHERE id = 6001),
  '{"amount_minor":"1","currency":"USD"}'::jsonb,
  'legacy amount maps only to exact extended amount'
);
SELECT is(
  (SELECT line_items_legacy_evidence FROM public.invoices WHERE id = 6001),
  (SELECT line_items FROM public.invoices WHERE id = 6001),
  'the accepted original line-item payload remains immutable evidence'
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

SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;
SELECT is(
  public.read_billing_invoices_exact('{"mode":"get","invoice_id":"6001"}'::jsonb)->'data'->>'amount_minor',
  '1',
  'same-account exact get returns canonical string money'
);
SELECT is(
  public.read_billing_invoices_legacy_compat('{"mode":"get","invoice_id":"6002"}'::jsonb)->'data'->>'tax_rate',
  '8.250000000',
  'compatibility get returns a fixed-nine-decimal bare percentage string'
);
SELECT is(
  public.read_billing_invoices_exact('{"mode":"get","invoice_id":"6003"}'::jsonb)->'data',
  NULL::jsonb,
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
