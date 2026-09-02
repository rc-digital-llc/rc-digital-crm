BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(8);

SELECT is(
  (
    SELECT array_agg(column_name::text ORDER BY ordinal_position)
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'billing_evidence_support_safe'
  ),
  ARRAY[
    'id', 'organization_id', 'account_id', 'mime_type', 'size_bytes',
    'inspection_status', 'inspection_reason_code', 'retention_expires_at',
    'is_held', 'lifecycle_status', 'end_reason', 'created_at', 'updated_at',
    'kind', 'original_filename', 'uploader_label'
  ]::text[],
  'support view appends exact allowlisted presentation metadata'
);

SELECT is(
  (
    SELECT count(*)
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'billing_evidence_support_safe'
      AND column_name ~ '(path|sha|signed|token|provider|payload)'
  ),
  0::bigint,
  'presentation metadata does not add authority-bearing fields'
);

SELECT ok(
  has_column_privilege('authenticated', 'public.billing_evidence_objects', 'kind', 'SELECT')
    AND has_column_privilege('authenticated', 'public.billing_evidence_objects', 'original_filename', 'SELECT')
    AND has_column_privilege('authenticated', 'public.billing_evidence_objects', 'uploader_label', 'SELECT'),
  'authenticated readers receive only the new safe evidence labels'
);

SELECT ok(
  (SELECT coalesce(array_to_string(proconfig, ','), '') IN ('search_path=', 'search_path=""')
   FROM pg_proc
   WHERE oid = 'public.begin_billing_evidence_upload(uuid,uuid,text,bigint,text,text,text)'::regprocedure),
  'presentation-aware upload entry point has an empty search_path'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.begin_billing_evidence_upload(uuid,uuid,text,bigint,text,text,text)',
    'EXECUTE'
  )
    AND NOT has_function_privilege(
      'authenticated',
      'public.begin_billing_evidence_upload(uuid,uuid,text,bigint,text,text,text)',
      'EXECUTE'
    )
    AND NOT has_function_privilege(
      'service_role',
      'public.begin_billing_evidence_upload(uuid,uuid,text,bigint,text)',
      'EXECUTE'
    ),
  'only the metadata-complete upload entry point is available to the service boundary'
);

SET LOCAL ROLE service_role;
SELECT is(
  public.begin_billing_evidence_upload(
    '21000000-0000-0000-0000-000000000001',
    '21000000-0000-0000-0000-000000000200',
    repeat('f', 64),
    2048,
    'application/pdf',
    'contract',
    'signed-contract.pdf'
  )->>'result',
  'created',
  'service upload creates quarantine metadata with allowlisted presentation fields'
);
RESET ROLE;

SELECT is(
  (
    SELECT kind || ':' || original_filename
    FROM public.billing_evidence_objects
    WHERE sha256 = repeat('f', 64)
  ),
  'contract:signed-contract.pdf',
  'created evidence retains its kind and safe original filename'
);

SELECT is(
  (
    SELECT uploader_label
    FROM public.billing_evidence_objects
    WHERE sha256 = repeat('f', 64)
  ),
  'Alpha Admin Fixture',
  'uploader identity is derived server-side as a display label'
);

SELECT * FROM finish();
ROLLBACK;
