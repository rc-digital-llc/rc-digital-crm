-- Phase 2: allowlisted evidence presentation metadata for the operator UI.

BEGIN;

ALTER TABLE public.billing_evidence_objects
  ADD COLUMN kind text NOT NULL DEFAULT 'other'
    CHECK (kind IN ('contract', 'revenue_statement', 'receipt', 'dispute', 'other')),
  ADD COLUMN original_filename text NOT NULL DEFAULT 'evidence'
    CHECK (
      btrim(original_filename) <> ''
      AND length(original_filename) <= 255
      AND original_filename !~ '[/\\[:cntrl:]]'
    ),
  ADD COLUMN uploader_label text NOT NULL DEFAULT 'RC Digital operator'
    CHECK (
      btrim(uploader_label) <> ''
      AND length(uploader_label) <= 160
      AND uploader_label !~ '[[:cntrl:]]'
    );

CREATE OR REPLACE VIEW public.billing_evidence_support_safe
WITH (security_invoker = true)
AS
SELECT
  evidence.id,
  evidence.organization_id,
  evidence.account_id,
  evidence.mime_type,
  evidence.size_bytes,
  evidence.inspection_status,
  evidence.inspection_reason_code,
  evidence.retention_expires_at,
  evidence.hold_started_at IS NOT NULL
    AND evidence.hold_released_at IS NULL AS is_held,
  evidence.lifecycle_status,
  evidence.end_reason,
  evidence.created_at,
  evidence.updated_at,
  evidence.kind,
  evidence.original_filename,
  evidence.uploader_label
FROM public.billing_evidence_objects AS evidence;

CREATE OR REPLACE FUNCTION public.begin_billing_evidence_upload(
  p_actor_user_id uuid,
  p_account_id uuid,
  p_sha256 text,
  p_size_bytes bigint,
  p_mime_type text,
  p_kind text,
  p_original_filename text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  decision jsonb;
  uploader_label_value text;
BEGIN
  IF p_kind IS NULL
    OR p_kind NOT IN ('contract', 'revenue_statement', 'receipt', 'dispute', 'other')
    OR p_original_filename IS NULL
    OR btrim(p_original_filename) = ''
    OR length(p_original_filename) > 255
    OR p_original_filename ~ '[/\\[:cntrl:]]'
  THEN
    RETURN pg_catalog.jsonb_build_object(
      'result', 'denied',
      'reason_code', 'UPLOAD_NOT_AUTHORIZED'
    );
  END IF;

  decision := private.billing_begin_evidence_upload(
    p_actor_user_id,
    p_account_id,
    p_sha256,
    p_size_bytes,
    p_mime_type
  );
  IF decision->>'result' <> 'created' THEN
    RETURN decision;
  END IF;

  SELECT NULLIF(btrim(sale.first_name || ' ' || sale.last_name), '')
  INTO uploader_label_value
  FROM public.sales AS sale
  WHERE sale.user_id = p_actor_user_id
    AND NOT sale.disabled;

  UPDATE public.billing_evidence_objects
  SET kind = p_kind,
      original_filename = p_original_filename,
      uploader_label = COALESCE(uploader_label_value, 'RC Digital operator')
  WHERE id = (decision->>'evidence_id')::uuid;

  RETURN decision;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.begin_billing_evidence_upload(uuid, uuid, text, bigint, text)
  FROM service_role;
REVOKE ALL ON FUNCTION public.begin_billing_evidence_upload(uuid, uuid, text, bigint, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_billing_evidence_upload(uuid, uuid, text, bigint, text, text, text)
  TO service_role;

GRANT SELECT (kind, original_filename, uploader_label)
  ON TABLE public.billing_evidence_objects TO authenticated;
REVOKE ALL ON TABLE public.billing_evidence_support_safe FROM anon, authenticated;
GRANT SELECT ON TABLE public.billing_evidence_support_safe TO authenticated;

COMMIT;
