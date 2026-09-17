BEGIN;

CREATE TABLE public.external_lead_sources (
  account_key text PRIMARY KEY,
  sales_id bigint NOT NULL REFERENCES public.sales(id) ON DELETE RESTRICT,
  active boolean NOT NULL DEFAULT true,
  hourly_limit integer NOT NULL DEFAULT 10 CHECK (hourly_limit BETWEEN 1 AND 1000),
  daily_limit integer NOT NULL DEFAULT 50 CHECK (daily_limit BETWEEN 1 AND 10000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (account_key ~ '^[a-z0-9][a-z0-9-]{2,63}$')
);

CREATE TABLE public.external_lead_ingest_receipts (
  account_key text NOT NULL REFERENCES public.external_lead_sources(account_key) ON DELETE RESTRICT,
  intake_id text NOT NULL,
  lead_id bigint NOT NULL REFERENCES public.leads(id) ON DELETE RESTRICT,
  payload_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_key, intake_id),
  UNIQUE (lead_id),
  CHECK (intake_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{15,95}$'),
  CHECK (payload_hash ~ '^[a-f0-9]{32}$')
);

CREATE INDEX external_lead_ingest_receipts_account_created_idx
  ON public.external_lead_ingest_receipts (account_key, created_at DESC);

ALTER TABLE public.external_lead_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_lead_ingest_receipts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.external_lead_sources FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.external_lead_ingest_receipts FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.external_lead_sources IS
  'Server-owned mapping and quotas for external website lead ingestion. No browser authority.';
COMMENT ON TABLE public.external_lead_ingest_receipts IS
  'Atomic idempotency receipts for external lead ingestion. Contains no raw customer payload.';

CREATE OR REPLACE FUNCTION public.ingest_external_lead(
  p_account_key text,
  p_intake_id text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_source public.external_lead_sources%ROWTYPE;
  v_receipt public.external_lead_ingest_receipts%ROWTYPE;
  v_payload_hash text;
  v_browser_attribution jsonb;
  v_lead_id bigint;
  v_count bigint;
  v_now timestamptz := now();
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'EXTERNAL_LEAD_INGEST_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF p_account_key IS NULL OR p_account_key !~ '^[a-z0-9][a-z0-9-]{2,63}$' THEN
    RAISE EXCEPTION 'INVALID_ACCOUNT_KEY' USING ERRCODE = '22023';
  END IF;
  IF p_intake_id IS NULL OR p_intake_id !~ '^[A-Za-z0-9][A-Za-z0-9_-]{15,95}$' THEN
    RAISE EXCEPTION 'INVALID_INTAKE_ID' USING ERRCODE = '22023';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_LEAD_PAYLOAD' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_account_key || ':' || p_intake_id, 0));

  SELECT * INTO v_source
  FROM public.external_lead_sources
  WHERE account_key = p_account_key AND active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INGEST_SOURCE_NOT_CONFIGURED' USING ERRCODE = 'P0001';
  END IF;

  v_payload_hash := md5(p_payload::text);
  SELECT * INTO v_receipt
  FROM public.external_lead_ingest_receipts
  WHERE account_key = p_account_key AND intake_id = p_intake_id;

  IF FOUND THEN
    IF v_receipt.payload_hash <> v_payload_hash THEN
      RAISE EXCEPTION 'INTAKE_ID_CONFLICT' USING ERRCODE = 'P0001';
    END IF;
    RETURN jsonb_build_object(
      'status', 'duplicate',
      'lead_id', v_receipt.lead_id,
      'duplicate', true
    );
  END IF;

  SELECT count(*) INTO v_count
  FROM public.external_lead_ingest_receipts
  WHERE account_key = p_account_key
    AND created_at >= v_now - interval '1 hour';
  IF v_count >= v_source.hourly_limit THEN
    RAISE EXCEPTION 'INGEST_RATE_LIMITED_HOURLY' USING ERRCODE = 'P0001';
  END IF;

  SELECT count(*) INTO v_count
  FROM public.external_lead_ingest_receipts
  WHERE account_key = p_account_key
    AND created_at >= v_now - interval '24 hours';
  IF v_count >= v_source.daily_limit THEN
    RAISE EXCEPTION 'INGEST_RATE_LIMITED_DAILY' USING ERRCODE = 'P0001';
  END IF;

  v_browser_attribution := CASE
    WHEN jsonb_typeof(p_payload->'browser_attribution') = 'object'
      THEN p_payload->'browser_attribution'
    ELSE '{}'::jsonb
  END;

  INSERT INTO public.leads (
    first_name,
    last_name,
    email,
    phone,
    source,
    source_detail,
    status,
    sales_id,
    notes,
    custom_fields
  ) VALUES (
    left(NULLIF(p_payload->>'first_name', ''), 120),
    left(NULLIF(p_payload->>'last_name', ''), 120),
    left(NULLIF(lower(p_payload->>'email'), ''), 180),
    left(NULLIF(p_payload->>'phone', ''), 40),
    'website_form',
    p_account_key || ':' || p_intake_id,
    'new',
    v_source.sales_id,
    left(NULLIF(p_payload->>'message', ''), 1200),
    jsonb_build_object(
      'account_key', p_account_key,
      'intake_id', p_intake_id,
      'full_name', left(COALESCE(p_payload->>'full_name', ''), 120),
      'service', left(COALESCE(p_payload->>'service', ''), 100),
      'project_city', left(COALESCE(p_payload->>'project_city', ''), 100),
      'dimensions', left(COALESCE(p_payload->>'dimensions', ''), 180),
      'project_type', left(COALESCE(p_payload->>'project_type', ''), 100),
      'timing', left(COALESCE(p_payload->>'timing', ''), 100),
      'browser_attribution', v_browser_attribution,
      'attribution_verification', 'unverified_browser',
      'commissionable', NULL,
      'commission_note', 'Requires downstream reconciliation and collected-revenue evidence.',
      'intake_payload_hash', v_payload_hash
    )
  )
  RETURNING id INTO v_lead_id;

  INSERT INTO public.touchpoints (
    lead_id,
    anonymous_id,
    touchpoint_type,
    channel,
    source,
    is_lead_creation_touch,
    metadata,
    sales_id
  ) VALUES (
    v_lead_id,
    p_intake_id,
    'form_submit',
    'unverified_web',
    p_account_key,
    true,
    jsonb_build_object(
      'account_key', p_account_key,
      'browser_attribution', v_browser_attribution,
      'attribution_verification', 'unverified_browser'
    ),
    v_source.sales_id
  );

  INSERT INTO public.external_lead_ingest_receipts (
    account_key,
    intake_id,
    lead_id,
    payload_hash,
    created_at
  ) VALUES (
    p_account_key,
    p_intake_id,
    v_lead_id,
    v_payload_hash,
    v_now
  );

  RETURN jsonb_build_object(
    'status', 'created',
    'lead_id', v_lead_id,
    'duplicate', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ingest_external_lead(text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_external_lead(text, text, jsonb) TO service_role;

COMMENT ON FUNCTION public.ingest_external_lead(text, text, jsonb) IS
  'Atomic service-role-only external lead ingestion with server-owned account mapping, quotas, and idempotency.';

COMMIT;
