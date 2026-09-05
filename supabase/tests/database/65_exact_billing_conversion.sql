CREATE EXTENSION IF NOT EXISTS pgtap;
SET search_path TO public, extensions;

BEGIN;

SELECT no_plan();

SELECT is(
  (
    SELECT pg_catalog.jsonb_object_agg(
      column_name,
      pg_catalog.jsonb_build_object(
        'type', data_type,
        'udt', udt_name,
        'nullable', is_nullable
      )
      ORDER BY column_name
    )
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'invoices'
      AND column_name IN (
        'amount_minor', 'currency', 'currency_policy_version',
        'tax_rate_kind', 'tax_rate_numerator', 'tax_rate_denominator',
        'submitted_percentage', 'rate_policy_version', 'tax_amount_minor',
        'total_amount_minor', 'rounding_policy_version', 'line_items_exact',
        'line_items_legacy_evidence', 'issue_date'
      )
  ),
  '{
    "amount_minor":{"type":"bigint","udt":"int8","nullable":"NO"},
    "currency":{"type":"text","udt":"text","nullable":"NO"},
    "currency_policy_version":{"type":"text","udt":"text","nullable":"NO"},
    "issue_date":{"type":"date","udt":"date","nullable":"NO"},
    "line_items_exact":{"type":"jsonb","udt":"jsonb","nullable":"NO"},
    "line_items_legacy_evidence":{"type":"jsonb","udt":"jsonb","nullable":"NO"},
    "rate_policy_version":{"type":"text","udt":"text","nullable":"NO"},
    "rounding_policy_version":{"type":"text","udt":"text","nullable":"NO"},
    "submitted_percentage":{"type":"text","udt":"text","nullable":"NO"},
    "tax_amount_minor":{"type":"bigint","udt":"int8","nullable":"NO"},
    "tax_rate_denominator":{"type":"bigint","udt":"int8","nullable":"NO"},
    "tax_rate_kind":{"type":"text","udt":"text","nullable":"NO"},
    "tax_rate_numerator":{"type":"bigint","udt":"int8","nullable":"NO"},
    "total_amount_minor":{"type":"bigint","udt":"int8","nullable":"NO"}
  }'::jsonb,
  'invoice exact authority columns are checked non-null database values'
);

SELECT is(
  (
    SELECT pg_catalog.jsonb_object_agg(
      column_name,
      pg_catalog.format_type(attribute.atttypid, attribute.atttypmod)
      ORDER BY column_name
    )
    FROM information_schema.columns AS column_record
    JOIN pg_catalog.pg_attribute AS attribute
      ON attribute.attrelid = 'public.invoices'::regclass
      AND attribute.attname = column_record.column_name
    WHERE column_record.table_schema = 'public'
      AND column_record.table_name = 'invoices'
      AND column_record.column_name IN ('amount', 'tax_amount', 'total_amount', 'tax_rate')
  ),
  '{"amount":"numeric(19,2)","tax_amount":"numeric(19,2)","tax_rate":"numeric(12,9)","total_amount":"numeric(19,2)"}'::jsonb,
  'legacy money and tax-rate compatibility columns have exact non-narrowing capacity'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.invoices'::regclass
      AND conname = 'invoices_tax_rate_compatibility_check'
      AND pg_catalog.pg_get_constraintdef(oid, true) ~ 'tax_rate >= 0'
      AND pg_catalog.pg_get_constraintdef(oid, true) ~ 'tax_rate <= 100'
  ),
  'tax_rate compatibility is constrained to the ordinary percentage range'
);

SELECT is(
  (
    SELECT pg_catalog.count(*)
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relkind = 'v'
      AND relation.relname LIKE '%invoice%'
  ),
  0::bigint,
  'invoice reads do not depend on a base-table-backed view'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.invoices', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'public.invoices', 'INSERT')
    AND NOT has_table_privilege('authenticated', 'public.invoices', 'UPDATE')
    AND NOT has_table_privilege('authenticated', 'public.invoices', 'DELETE'),
  'authenticated callers have no direct invoice table privilege'
);

SELECT ok(
  NOT has_sequence_privilege('authenticated', 'public.invoices_id_seq', 'USAGE')
    AND NOT has_sequence_privilege('authenticated', 'public.invoices_id_seq', 'SELECT'),
  'authenticated callers have no invoice sequence privilege'
);

SELECT is(
  (
    SELECT pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'identity', pg_catalog.format(
          '%I.%I(%s)',
          namespace.nspname,
          procedure.proname,
          pg_catalog.pg_get_function_identity_arguments(procedure.oid)
        ),
        'owner', owner_role.rolname,
        'definer', procedure.prosecdef,
        'search_path', CASE
          WHEN pg_catalog.array_to_string(procedure.proconfig, ',')
            IN ('search_path=', 'search_path=""')
          THEN '' ELSE NULL
        END,
        'dynamic', pg_catalog.pg_get_functiondef(procedure.oid)
          ~* '\m(EXECUTE|format[[:space:]]*\()'
      ) ORDER BY procedure.proname
    )
    FROM pg_catalog.pg_proc AS procedure
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
    JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid = procedure.proowner
    WHERE namespace.nspname = 'public'
      AND procedure.proname IN (
        'read_billing_invoices_exact',
        'read_billing_invoices_legacy_compat',
        'save_billing_invoice_exact'
      )
      AND pg_catalog.pg_get_function_identity_arguments(procedure.oid) = 'jsonb'
  ),
  '[
    {"identity":"public.read_billing_invoices_exact(jsonb)","owner":"postgres","definer":true,"search_path":"","dynamic":false},
    {"identity":"public.read_billing_invoices_legacy_compat(jsonb)","owner":"postgres","definer":true,"search_path":"","dynamic":false},
    {"identity":"public.save_billing_invoice_exact(jsonb)","owner":"postgres","definer":true,"search_path":"","dynamic":false}
  ]'::jsonb,
  'all invoice RPCs are locked caller-bound SECURITY DEFINER functions without dynamic SQL'
);

SELECT ok(
  has_function_privilege('authenticated', 'public.read_billing_invoices_exact(jsonb)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.read_billing_invoices_legacy_compat(jsonb)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.save_billing_invoice_exact(jsonb)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.read_billing_invoices_exact(jsonb)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.read_billing_invoices_legacy_compat(jsonb)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.save_billing_invoice_exact(jsonb)', 'EXECUTE')
    AND NOT has_function_privilege('public', 'public.read_billing_invoices_exact(jsonb)', 'EXECUTE')
    AND NOT has_function_privilege('public', 'public.read_billing_invoices_legacy_compat(jsonb)', 'EXECUTE')
    AND NOT has_function_privilege('public', 'public.save_billing_invoice_exact(jsonb)', 'EXECUTE'),
  'invoice RPC ACLs expose only the authenticated caller boundary'
);

SELECT ok(
  pg_catalog.to_regprocedure(
    'private.billing_consume_automation_grant(uuid,uuid,text,text,text,text,jsonb,text,jsonb)'
  ) IS NOT NULL
    AND pg_catalog.to_regprocedure(
      'public.execute_billing_automation_command(uuid,uuid,text,text,text,text,jsonb,text)'
    ) IS NOT NULL
    AND pg_catalog.to_regprocedure(
      'private.billing_consume_automation_grant(uuid,uuid,text,text,text,text,numeric,text)'
    ) IS NULL
    AND pg_catalog.to_regprocedure(
      'public.execute_billing_automation_command(uuid,uuid,text,text,text,text,numeric,text)'
    ) IS NULL,
  'only exact automation signatures survive the cutover'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'private.billing_consume_automation_grant(uuid,uuid,text,text,text,text,jsonb,text,jsonb)',
    'EXECUTE'
  )
    AND has_function_privilege(
      'authenticated',
      'public.execute_billing_automation_command(uuid,uuid,text,text,text,text,jsonb,text)',
      'EXECUTE'
    )
    AND NOT has_function_privilege(
      'anon',
      'public.execute_billing_automation_command(uuid,uuid,text,text,text,text,jsonb,text)',
      'EXECUTE'
    ),
  'exact automation keeps its private kernel behind the authenticated wrapper'
);

SELECT ok(
  pg_catalog.to_regprocedure(
    'private.billing_legacy_execution_effect(uuid)'
  ) IS NOT NULL
    AND NOT has_function_privilege(
      'authenticated',
      'private.billing_legacy_execution_effect(uuid)',
      'EXECUTE'
    )
    AND NOT has_function_privilege(
      'public',
      'private.billing_legacy_execution_effect(uuid)',
      'EXECUTE'
    ),
  'legacy execution classification remains a locked migration-only helper'
);

SELECT ok(
  pg_catalog.to_regprocedure('private.billing_canonical_date(jsonb,boolean)') IS NOT NULL
    AND NOT has_function_privilege(
      'authenticated',
      'private.billing_canonical_date(jsonb,boolean)',
      'EXECUTE'
    )
    AND NOT has_function_privilege(
      'public',
      'private.billing_canonical_date(jsonb,boolean)',
      'EXECUTE'
    ),
  'canonical date parsing remains a locked server-side invoice helper'
);

UPDATE public.billing_accounts
SET company_id = 950001
WHERE id = '21000000-0000-0000-0000-000000000200';

SELECT set_config('request.jwt.claim.sub', '21000000-0000-0000-0000-000000000002', true);
SELECT set_config('request.jwt.claims', '{"sub":"21000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

CREATE TEMP TABLE exact_invoice_request AS
SELECT '{
    "billing_account_id":"21000000-0000-0000-0000-000000000200",
    "invoice_number":"EXACT-0001",
    "description":"Exact conversion fixture",
    "amount":{"amount_minor":"1000","currency":"USD"},
    "currency_policy_version":"usd-v1",
    "tax_rate":{"kind":"ordinary_percentage","numerator":"71","denominator":"800","submitted_percentage":"8.875%","rate_policy_version":"ordinary-percentage-v1"},
    "rounding_policy_version":"half-away-from-zero-v1",
    "line_items":[{"quantity_ratio":{"numerator":"1","denominator":"1"},"unit_price":{"amount_minor":"1000","currency":"USD"},"extended_amount":{"amount_minor":"1000","currency":"USD"},"currency_policy_version":"usd-v1","rounding_policy_version":"half-away-from-zero-v1"}],
    "status":"Draft",
    "issue_date":"2026-09-04"
  }'::jsonb AS request;

CREATE TEMP TABLE exact_invoice_result AS
SELECT public.save_billing_invoice_exact(request) AS result
FROM exact_invoice_request;

SELECT is(
  (SELECT result->>'result' FROM exact_invoice_result),
  'saved',
  'a valid exact invoice draft saves through the closed RPC'
);

SELECT ok(
  (
    SELECT result->'data'->'amount' = '{"amount_minor":"1000","currency":"USD"}'::jsonb
      AND result->'data'->'tax_amount' = '{"amount_minor":"89","currency":"USD"}'::jsonb
      AND result->'data'->'total_amount' = '{"amount_minor":"1089","currency":"USD"}'::jsonb
      AND result->'data'->'tax_rate'->>'numerator' = '71'
      AND result->'data'->'tax_rate'->>'denominator' = '800'
      AND result->'data'->'tax_rate'->>'submitted_percentage' = '8.875%'
      AND result->'data'->>'issue_date' = '2026-09-04'
    FROM exact_invoice_result
  ),
  'save output contains canonical money, reduced rate, evidence, and one named rounding result'
);

SELECT is(
  public.read_billing_invoices_exact(
    '{"mode":"list","page":1,"per_page":10,"sort":"id","order":"ASC","filters":{"billing_account_id":"21000000-0000-0000-0000-000000000200"}}'::jsonb
  )->>'total',
  '1',
  'same-account exact list reads use caller-derived invoice.read authority'
);

SELECT is(
  public.read_billing_invoices_exact(
    '{"mode":"list","page":1000000,"per_page":100,"sort":"id","order":"ASC","filters":{}}'::jsonb
  ),
  '{"data":[],"total":1}'::jsonb,
  'exact invoice reads accept the documented maximum page without offset overflow'
);

SELECT is(
  public.read_billing_invoices_legacy_compat(
    '{"mode":"list","page":1000000,"per_page":100,"sort":"id","order":"ASC","filters":{}}'::jsonb
  ),
  '{"data":[],"total":1}'::jsonb,
  'legacy compatibility reads share the exact maximum-page behavior'
);

SELECT throws_ok(
  $$SELECT public.read_billing_invoices_exact('{"mode":"list","page":1000001,"per_page":100,"sort":"id","order":"ASC","filters":{}}'::jsonb)$$,
  'P0001',
  'INVOICE_READ_INVALID_REQUEST',
  'exact invoice reads reject the first page above the documented bound'
);

SELECT throws_ok(
  $$SELECT public.read_billing_invoices_legacy_compat('{"mode":"list","page":1000001,"per_page":100,"sort":"id","order":"ASC","filters":{}}'::jsonb)$$,
  'P0001',
  'INVOICE_READ_INVALID_REQUEST',
  'legacy compatibility reads reject the same first out-of-range page'
);

SELECT is(
  public.read_billing_invoices_legacy_compat(
    pg_catalog.jsonb_build_object(
      'mode', 'get',
      'invoice_id', (SELECT result->'data'->>'id' FROM exact_invoice_result)
    )
  )->'data'->>'tax_rate',
  '8.875000000',
  'legacy compatibility returns an exact fixed-nine-decimal percentage string'
);

SELECT ok(
  (
    SELECT result->'data'->>'amount' = '10.00'
      AND result->'data'->>'tax_amount' = '0.89'
      AND result->'data'->>'total_amount' = '10.89'
      AND result->'data'->>'issue_date' = '2026-09-04'
    FROM (
      SELECT public.read_billing_invoices_legacy_compat(
        pg_catalog.jsonb_build_object(
          'mode', 'get',
          'invoice_id', (SELECT result->'data'->>'id' FROM exact_invoice_result)
        )
      ) AS result
    ) AS compatibility
  ),
  'legacy compatibility returns fixed-decimal money strings'
);

CREATE TEMP TABLE exact_invoice_leap_result AS
SELECT public.save_billing_invoice_exact(
  request || pg_catalog.jsonb_build_object(
    'id', (SELECT result->'data'->>'id' FROM exact_invoice_result),
    'issue_date', '2024-02-29',
    'due_date', '2028-02-29'
  )
) AS result
FROM exact_invoice_request;

SELECT ok(
  (
    SELECT result->>'result' = 'saved'
      AND result->'data'->>'issue_date' = '2024-02-29'
      AND result->'data'->>'due_date' = '2028-02-29'
    FROM exact_invoice_leap_result
  )
    AND public.read_billing_invoices_exact(
      pg_catalog.jsonb_build_object(
        'mode', 'get',
        'invoice_id', (SELECT result->'data'->>'id' FROM exact_invoice_result)
      )
    )->'data'->>'issue_date' = '2024-02-29'
    AND public.read_billing_invoices_legacy_compat(
      pg_catalog.jsonb_build_object(
        'mode', 'get',
        'invoice_id', (SELECT result->'data'->>'id' FROM exact_invoice_result)
      )
    )->'data'->>'due_date' = '2028-02-29',
  'canonical leap dates save and remain readable through exact and compatibility RPCs'
);

RESET ROLE;

CREATE TEMP TABLE exact_date_boundary_snapshot AS
SELECT pg_catalog.jsonb_build_object(
  'invoice', pg_catalog.to_jsonb(invoice),
  'audit', (
    SELECT COALESCE(
      pg_catalog.jsonb_agg(pg_catalog.to_jsonb(audit) ORDER BY audit.id),
      '[]'::jsonb
    )
    FROM public.billing_audit_events AS audit
    WHERE audit.subject_type = 'invoices'
      AND audit.subject_id = invoice.id::text
  )
) AS snapshot
FROM public.invoices AS invoice
WHERE invoice.id = (SELECT (result->'data'->>'id')::bigint FROM exact_invoice_result);

SET LOCAL ROLE authenticated;

SELECT throws_ok(
  pg_catalog.format(
    'SELECT public.save_billing_invoice_exact(%L::jsonb)',
    (
      SELECT (
        request
          || pg_catalog.jsonb_build_object(
            'id', (SELECT result->'data'->>'id' FROM exact_invoice_result)
          )
          || invalid_date.mutation
      )::text
      FROM exact_invoice_request
    )
  ),
  'P0001',
  'INVOICE_SAVE_INVALID_REQUEST',
  invalid_date.description
)
FROM (
  VALUES
    (pg_catalog.jsonb_build_object('issue_date', 'today'), 'relative issue date today is rejected'),
    (pg_catalog.jsonb_build_object('issue_date', 'tomorrow'), 'relative issue date tomorrow is rejected'),
    (pg_catalog.jsonb_build_object('issue_date', '09/04/2026'), 'locale-formatted issue date is rejected'),
    (pg_catalog.jsonb_build_object('issue_date', '2026-02-30'), 'impossible issue date is rejected'),
    (pg_catalog.jsonb_build_object('issue_date', '0000-01-01'), 'year-zero issue date is rejected'),
    (pg_catalog.jsonb_build_object('due_date', 'today'), 'relative due date today is rejected'),
    (pg_catalog.jsonb_build_object('due_date', 'tomorrow'), 'relative due date tomorrow is rejected'),
    (pg_catalog.jsonb_build_object('due_date', '09/04/2026'), 'locale-formatted due date is rejected'),
    (pg_catalog.jsonb_build_object('due_date', '2026-02-30'), 'impossible due date is rejected'),
    (pg_catalog.jsonb_build_object('due_date', '0000-02-29'), 'year-zero due date is rejected')
) AS invalid_date(mutation, description);

RESET ROLE;

SELECT is(
  (
    SELECT pg_catalog.jsonb_build_object(
      'invoice', pg_catalog.to_jsonb(invoice),
      'audit', (
        SELECT COALESCE(
          pg_catalog.jsonb_agg(pg_catalog.to_jsonb(audit) ORDER BY audit.id),
          '[]'::jsonb
        )
        FROM public.billing_audit_events AS audit
        WHERE audit.subject_type = 'invoices'
          AND audit.subject_id = invoice.id::text
      )
    )
    FROM public.invoices AS invoice
    WHERE invoice.id = (SELECT (result->'data'->>'id')::bigint FROM exact_invoice_result)
  ),
  (SELECT snapshot FROM exact_date_boundary_snapshot),
  'rejected noncanonical dates leave invoice and audit state unchanged'
);

SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$SELECT public.read_billing_invoices_exact('{"mode":"list","page":0,"per_page":101,"sort":"unsafe","order":"SIDEWAYS","filters":{},"organization_id":"forged"}'::jsonb)$$,
  'P0001',
  'INVOICE_READ_INVALID_REQUEST',
  'forged scope, unsafe pagination, and unknown sort/order fail with one non-reflective error'
);

SELECT throws_ok(
  $$SELECT public.read_billing_invoices_exact('{"mode":"get","invoice_id":1}'::jsonb)$$,
  'P0001',
  'INVOICE_READ_INVALID_REQUEST',
  'invoice identifiers cannot cross the JSON boundary as numeric tokens'
);

SELECT throws_ok(
  $$SELECT public.save_billing_invoice_exact('{"billing_account_id":"21000000-0000-0000-0000-000000000200","invoice_number":"EXACT-BAD","amount":{"amount_minor":1000,"currency":"USD"},"currency_policy_version":"usd-v1","tax_rate":{"kind":"ordinary_percentage","numerator":"0","denominator":"1","submitted_percentage":"0%","rate_policy_version":"ordinary-percentage-v1"},"rounding_policy_version":"half-away-from-zero-v1","line_items":[],"issue_date":"2026-09-04"}'::jsonb)$$,
  'P0001',
  'INVOICE_SAVE_INVALID_REQUEST',
  'numeric money tokens fail before invoice casts or effects'
);

SELECT throws_ok(
  $$SELECT public.save_billing_invoice_exact(jsonb_build_object('billing_account_id','21000000-0000-0000-0000-000000000200','invoice_number','EXACT-LONG','amount',jsonb_build_object('amount_minor',repeat('9',65),'currency','USD'),'currency_policy_version','usd-v1','tax_rate',jsonb_build_object('kind','ordinary_percentage','numerator','0','denominator','1','submitted_percentage','0%','rate_policy_version','ordinary-percentage-v1'),'rounding_policy_version','half-away-from-zero-v1','line_items','[]'::jsonb,'issue_date','2026-09-04'))$$,
  'P0001',
  'INVOICE_SAVE_INVALID_REQUEST',
  'overlong money text fails before casts or effects'
);

SELECT throws_ok(
  $$SELECT public.save_billing_invoice_exact('{
    "billing_account_id":"21000000-0000-0000-0000-000000000200",
    "invoice_number":"EXACT-MISSING-ISSUE-DATE",
    "amount":{"amount_minor":"1","currency":"USD"},
    "currency_policy_version":"usd-v1",
    "tax_rate":{"kind":"ordinary_percentage","numerator":"0","denominator":"1","submitted_percentage":"0%","rate_policy_version":"ordinary-percentage-v1"},
    "rounding_policy_version":"half-away-from-zero-v1",
    "line_items":[{"quantity_ratio":{"numerator":"1","denominator":"1"},"unit_price":{"amount_minor":"1","currency":"USD"},"extended_amount":{"amount_minor":"1","currency":"USD"},"currency_policy_version":"usd-v1","rounding_policy_version":"half-away-from-zero-v1"}]
  }'::jsonb)$$,
  'P0001',
  'INVOICE_SAVE_INVALID_REQUEST',
  'invoice save requires an explicit issue date instead of deriving wall-clock state'
);

RESET ROLE;

SELECT is(
  (SELECT pg_catalog.count(*) FROM public.invoices WHERE invoice_number LIKE 'EXACT-%'),
  1::bigint,
  'invalid exact saves leave invoice effects unchanged'
);

SELECT is(
  (
    SELECT pg_catalog.count(*)
    FROM public.billing_audit_events
    WHERE subject_type = 'invoices'
      AND subject_id IS NULL
  ),
  0::bigint,
  'invalid exact saves append no audit event'
);

UPDATE public.invoices
SET status = 'Sent'
WHERE id = (SELECT (result->'data'->>'id')::bigint FROM exact_invoice_result);

CREATE TEMP TABLE exact_sent_invoice_snapshot AS
SELECT pg_catalog.jsonb_build_object(
  'invoice', pg_catalog.to_jsonb(invoice),
  'audit', (
    SELECT COALESCE(
      pg_catalog.jsonb_agg(pg_catalog.to_jsonb(audit) ORDER BY audit.id),
      '[]'::jsonb
    )
    FROM public.billing_audit_events AS audit
    WHERE audit.subject_type = 'invoices'
      AND audit.subject_id = invoice.id::text
  )
) AS snapshot
FROM public.invoices AS invoice
WHERE invoice.id = (SELECT (result->'data'->>'id')::bigint FROM exact_invoice_result);

SELECT throws_ok(
  pg_catalog.format(
    'UPDATE public.invoices SET description = %L WHERE id = %s',
    'forbidden sent rewrite',
    (SELECT result->'data'->>'id' FROM exact_invoice_result)
  ),
  'P0001',
  'INVOICE_ISSUED_SNAPSHOT_IMMUTABLE',
  'database invariant rejects direct rewrites of sent invoice snapshots'
);

SELECT is(
  (
    SELECT pg_catalog.jsonb_build_object(
      'invoice', pg_catalog.to_jsonb(invoice),
      'audit', (
        SELECT COALESCE(
          pg_catalog.jsonb_agg(pg_catalog.to_jsonb(audit) ORDER BY audit.id),
          '[]'::jsonb
        )
        FROM public.billing_audit_events AS audit
        WHERE audit.subject_type = 'invoices'
          AND audit.subject_id = invoice.id::text
      )
    )
    FROM public.invoices AS invoice
    WHERE invoice.id = (SELECT (result->'data'->>'id')::bigint FROM exact_invoice_result)
  ),
  (SELECT snapshot FROM exact_sent_invoice_snapshot),
  'rejected sent rewrite leaves invoice and audit state unchanged'
);

UPDATE public.invoices
SET status = 'Paid'
WHERE id = (SELECT (result->'data'->>'id')::bigint FROM exact_invoice_result);

CREATE TEMP TABLE exact_paid_invoice_snapshot AS
SELECT pg_catalog.jsonb_build_object(
  'invoice', pg_catalog.to_jsonb(invoice),
  'audit', (
    SELECT COALESCE(
      pg_catalog.jsonb_agg(pg_catalog.to_jsonb(audit) ORDER BY audit.id),
      '[]'::jsonb
    )
    FROM public.billing_audit_events AS audit
    WHERE audit.subject_type = 'invoices'
      AND audit.subject_id = invoice.id::text
  )
) AS snapshot
FROM public.invoices AS invoice
WHERE invoice.id = (SELECT (result->'data'->>'id')::bigint FROM exact_invoice_result);

SELECT throws_ok(
  pg_catalog.format(
    'UPDATE public.invoices SET amount_minor = amount_minor + 1 WHERE id = %s',
    (SELECT result->'data'->>'id' FROM exact_invoice_result)
  ),
  'P0001',
  'INVOICE_ISSUED_SNAPSHOT_IMMUTABLE',
  'database invariant rejects direct rewrites of paid invoice amounts'
);

SELECT is(
  (
    SELECT pg_catalog.jsonb_build_object(
      'invoice', pg_catalog.to_jsonb(invoice),
      'audit', (
        SELECT COALESCE(
          pg_catalog.jsonb_agg(pg_catalog.to_jsonb(audit) ORDER BY audit.id),
          '[]'::jsonb
        )
        FROM public.billing_audit_events AS audit
        WHERE audit.subject_type = 'invoices'
          AND audit.subject_id = invoice.id::text
      )
    )
    FROM public.invoices AS invoice
    WHERE invoice.id = (SELECT (result->'data'->>'id')::bigint FROM exact_invoice_result)
  ),
  (SELECT snapshot FROM exact_paid_invoice_snapshot),
  'rejected paid rewrite leaves invoice and audit state unchanged'
);

INSERT INTO public.invoices (
  id, company_id, sales_id, organization_id, billing_account_id,
  invoice_number, description, amount_minor, currency,
  currency_policy_version, tax_rate_kind, tax_rate_numerator,
  tax_rate_denominator, submitted_percentage, rate_policy_version,
  tax_amount_minor, total_amount_minor, rounding_policy_version,
  line_items_exact, line_items_legacy_evidence, status, issue_date
) VALUES
  (
    965001, 950001, (SELECT sales_id FROM public.billing_account_owners WHERE account_id = '21000000-0000-0000-0000-000000000200' AND effective_until IS NULL LIMIT 1),
    '21000000-0000-0000-0000-000000000100', '21000000-0000-0000-0000-000000000200',
    'EXACT-MIN', 'Signed bigint minimum', '-9223372036854775808', 'USD',
    'usd-v1', 'ordinary_percentage', 0, 1, '0%', 'ordinary-percentage-v1',
    0, '-9223372036854775808', 'half-away-from-zero-v1', '[]'::jsonb, '[]'::jsonb,
    'Draft', '2026-09-04'
  ),
  (
    965002, 950001, (SELECT sales_id FROM public.billing_account_owners WHERE account_id = '21000000-0000-0000-0000-000000000200' AND effective_until IS NULL LIMIT 1),
    '21000000-0000-0000-0000-000000000100', '21000000-0000-0000-0000-000000000200',
    'EXACT-MAX', 'Signed bigint maximum', '9223372036854775807', 'USD',
    'usd-v1', 'ordinary_percentage', 0, 1, '0%', 'ordinary-percentage-v1',
    0, '9223372036854775807', 'half-away-from-zero-v1', '[]'::jsonb, '[]'::jsonb,
    'Draft', '2026-09-04'
  );

SELECT set_config('request.jwt.claim.sub', '21000000-0000-0000-0000-000000000002', true);
SELECT set_config('request.jwt.claims', '{"sub":"21000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT is(
  (
    SELECT pg_catalog.jsonb_agg(item->'amount'->>'amount_minor' ORDER BY item->>'invoice_number')
    FROM pg_catalog.jsonb_array_elements(
      public.read_billing_invoices_exact(
        '{"mode":"list","page":1,"per_page":10,"sort":"invoice_number","order":"ASC","filters":{}}'::jsonb
      )->'data'
    ) AS item
    WHERE item->>'invoice_number' IN ('EXACT-MAX', 'EXACT-MIN')
  ),
  '["9223372036854775807","-9223372036854775808"]'::jsonb,
  'both signed-bigint endpoints remain exact strings in exact output'
);

SELECT is(
  (
    SELECT pg_catalog.jsonb_agg(item->>'amount' ORDER BY item->>'invoice_number')
    FROM pg_catalog.jsonb_array_elements(
      public.read_billing_invoices_legacy_compat(
        '{"mode":"list","page":1,"per_page":10,"sort":"invoice_number","order":"ASC","filters":{}}'::jsonb
      )->'data'
    ) AS item
    WHERE item->>'invoice_number' IN ('EXACT-MAX', 'EXACT-MIN')
  ),
  '["92233720368547758.07","-92233720368547758.08"]'::jsonb,
  'both signed-bigint endpoints remain fixed-decimal strings in compatibility output'
);

SELECT is(
  public.read_billing_invoices_exact(
    '{"mode":"get","invoice_id":"965001"}'::jsonb
  )->'data'->'amount'->>'amount_minor',
  '-9223372036854775808',
  'get mode preserves the minimum signed-bigint endpoint'
);

RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '22000000-0000-0000-0000-000000000002', true);
SELECT set_config('request.jwt.claims', '{"sub":"22000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT is(
  public.read_billing_invoices_exact('{"mode":"get","invoice_id":"965001"}'::jsonb),
  '{"data":null}'::jsonb,
  'cross-tenant get is indistinguishable from an unknown invoice'
);

RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '21000000-0000-0000-0000-000000000006', true);
SELECT set_config('request.jwt.claims', '{"sub":"21000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

SELECT is(
  public.execute_billing_automation_command(
    '21000000-0000-0000-0000-000000000500',
    '21000000-0000-0000-0000-000000000200',
    'test.nonfinancial', 'provider-alpha-fixture', 'policy-fixture-v1',
    'record.test', '{"amount_minor":"2500","currency":"USD"}'::jsonb,
    'exact-command-0001'
  )->>'result',
  'applied',
  'exact automation applies canonical non-negative money once'
);

SELECT is(
  public.execute_billing_automation_command(
    '21000000-0000-0000-0000-000000000500',
    '21000000-0000-0000-0000-000000000200',
    'test.nonfinancial', 'provider-alpha-fixture', 'policy-fixture-v1',
    'record.test', '{"amount_minor":"2500","currency":"USD"}'::jsonb,
    'exact-command-0001'
  )->>'result',
  'duplicate',
  'an identical exact automation replay is safe'
);

SELECT is(
  public.execute_billing_automation_command(
    '21000000-0000-0000-0000-000000000500',
    '21000000-0000-0000-0000-000000000200',
    'test.nonfinancial', 'provider-alpha-fixture', 'policy-fixture-v1',
    'record.test', '{"amount_minor":"2501","currency":"USD"}'::jsonb,
    'exact-command-0001'
  )->>'reason_code',
  'IDEMPOTENCY_KEY_CONFLICT',
  'same-key exact request mismatch is rejected as a conflict'
);

RESET ROLE;

SELECT is(
  (
    SELECT pg_catalog.jsonb_build_object(
      'executions', pg_catalog.count(*),
      'request_fingerprints', pg_catalog.count(DISTINCT request_fingerprint),
      'effect_fingerprints', pg_catalog.count(DISTINCT effect_fingerprint),
      'amount_minor', pg_catalog.min(amount_minor)::text
    )
    FROM public.billing_automation_executions
    WHERE idempotency_key = 'exact-command-0001'
  ),
  '{"executions":1,"request_fingerprints":1,"effect_fingerprints":1,"amount_minor":"2500"}'::jsonb,
  'conflicting automation replay leaves one canonical fingerprinted effect'
);

SELECT is(
  (
    SELECT pg_catalog.jsonb_build_object(
      'actions', actions_consumed,
      'amount_minor', total_amount_consumed_minor::text,
      'legacy_amount', total_amount_consumed::text
    )
    FROM public.billing_automation_grants
    WHERE id = '21000000-0000-0000-0000-000000000500'
  ),
  '{"actions":1,"amount_minor":"2500","legacy_amount":"25.00"}'::jsonb,
  'conflicting automation replay consumes no second allowance'
);

SELECT is(
  (
    SELECT pg_catalog.count(*)
    FROM public.billing_audit_events
    WHERE actor_id = '21000000-0000-0000-0000-000000000400'
      AND action = 'automation.command'
      AND subject_id = 'exact-command-0001'
  ),
  1::bigint,
  'duplicate and conflicting replays add no command audit effect'
);

SELECT ok(
  (
    SELECT request_fingerprint ~ '^[0-9a-f]{64}$'
      AND effect_fingerprint ~ '^[0-9a-f]{64}$'
    FROM public.billing_automation_executions
    WHERE idempotency_key = 'exact-command-0001'
  ),
  'automation request and command-owned effect fingerprints are canonical SHA-256'
);

SELECT set_config('request.jwt.claim.sub', '21000000-0000-0000-0000-000000000006', true);
SELECT set_config('request.jwt.claims', '{"sub":"21000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
SET LOCAL ROLE authenticated;

CREATE TEMP TABLE exact_legacy_evidence_execution AS
SELECT public.finalize_billing_evidence_inspection(
  '21000000-0000-0000-0000-000000000600',
  '21000000-0000-0000-0000-000000000502',
  'scanner-alpha-fixture', 'scanner-fixture-v1',
  'clean', 'SCAN_CLEAN', 'legacy-effect-binding-0001'
) AS result;

SELECT is(
  (SELECT result->>'result' FROM exact_legacy_evidence_execution),
  'applied',
  'evidence fixture creates one exact execution for legacy binding validation'
);

RESET ROLE;

SELECT is(
  private.billing_legacy_execution_effect(
    (
      SELECT id
      FROM public.billing_automation_executions
      WHERE idempotency_key = 'legacy-effect-binding-0001'
    )
  ),
  '{"kind":"evidence.inspection","decision":"clean","evidence_id":"21000000-0000-0000-0000-000000000600","reason_code":"SCAN_CLEAN"}'::jsonb,
  'legacy evidence classification reconstructs the exact command-owned effect'
);

INSERT INTO public.billing_evidence_objects (
  id, organization_id, account_id, sha256, size_bytes, mime_type,
  inspection_status, inspection_principal_id, inspection_grant_id,
  inspection_decided_at, inspection_reason_code, retention_expires_at
)
SELECT
  '21000000-0000-0000-0000-000000000607',
  execution.organization_id,
  execution.account_id,
  pg_catalog.repeat('7', 64),
  107,
  'application/pdf',
  'clean',
  execution.principal_id,
  execution.grant_id,
  execution.created_at,
  'SCAN_CLEAN',
  execution.created_at + interval '7 years'
FROM public.billing_automation_executions AS execution
WHERE execution.idempotency_key = 'legacy-effect-binding-0001';

INSERT INTO public.billing_audit_events (
  actor_type, actor_id, organization_id, account_id, action,
  subject_type, subject_id, result, reason, details, created_at
)
SELECT
  'automation', execution.principal_id, execution.organization_id,
  execution.account_id, 'evidence.inspection', 'billing_evidence_objects',
  '21000000-0000-0000-0000-000000000607', 'succeeded', 'SCAN_CLEAN',
  '{"decision":"clean"}'::jsonb, execution.created_at
FROM public.billing_automation_executions AS execution
WHERE execution.idempotency_key = 'legacy-effect-binding-0001';

SELECT throws_ok(
  pg_catalog.format(
    'SELECT private.billing_legacy_execution_effect(%L::uuid)',
    (
      SELECT id::text
      FROM public.billing_automation_executions
      WHERE idempotency_key = 'legacy-effect-binding-0001'
    )
  ),
  'P0001',
  'EXACT_BILLING_LEGACY_EVIDENCE_BINDING_AMBIGUOUS',
  'ambiguous historical evidence bindings abort instead of choosing a fingerprint'
);

SELECT * FROM finish();
ROLLBACK;
