-- Phase 4 application readback: preserve durable linked adjustments after refresh.

CREATE OR REPLACE FUNCTION public.read_billing_calculations(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  account_id_value uuid;
  organization_id_value uuid;
  page_value integer;
  per_page_value integer;
  total_value bigint;
  data_value jsonb;
  adjustments_value jsonb;
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR pg_catalog.jsonb_typeof(p_request) IS DISTINCT FROM 'object'
    OR (
      SELECT COALESCE(pg_catalog.array_agg(key ORDER BY key), ARRAY[]::text[])
      FROM pg_catalog.jsonb_object_keys(p_request) AS keys(key)
    ) IS DISTINCT FROM ARRAY['account_id', 'page', 'per_page']::text[]
    OR pg_catalog.jsonb_typeof(p_request->'account_id') IS DISTINCT FROM 'string'
    OR pg_catalog.jsonb_typeof(p_request->'page') IS DISTINCT FROM 'number'
    OR pg_catalog.jsonb_typeof(p_request->'per_page') IS DISTINCT FROM 'number'
    OR (p_request->>'account_id') !~
      '^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR (p_request->>'page') !~ '^[0-9]+$'
    OR (p_request->>'per_page') !~ '^[0-9]+$'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023', MESSAGE = 'CALCULATION_INVALID_REQUEST';
  END IF;
  BEGIN
    account_id_value := (p_request->>'account_id')::uuid;
    page_value := (p_request->>'page')::integer;
    per_page_value := (p_request->>'per_page')::integer;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023', MESSAGE = 'CALCULATION_INVALID_REQUEST';
  END;
  IF page_value NOT BETWEEN 1 AND 1000000
    OR per_page_value NOT BETWEEN 1 AND 100
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023', MESSAGE = 'CALCULATION_INVALID_REQUEST';
  END IF;

  SELECT account.organization_id INTO organization_id_value
  FROM public.billing_accounts AS account
  WHERE account.id = account_id_value;
  IF organization_id_value IS NULL OR NOT private.billing_has_capability(
    organization_id_value, account_id_value, 'calculation.read'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'CALCULATION_NOT_AUTHORIZED';
  END IF;

  SELECT count(*) INTO total_value
  FROM public.billing_calculations AS calculation
  WHERE calculation.organization_id = organization_id_value
    AND calculation.account_id = account_id_value;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      item.row_value ORDER BY item.created_at DESC, item.calculation_id
    ),
    '[]'::jsonb
  ) INTO data_value
  FROM (
    SELECT calculation.created_at, calculation.id AS calculation_id,
      pg_catalog.jsonb_build_object(
        'id', calculation.id,
        'account_id', calculation.account_id,
        'agreement_id', calculation.agreement_id,
        'agreement_version_id', calculation.agreement_version_id,
        'period_id', calculation.period_id,
        'close_snapshot_id', calculation.close_snapshot_id,
        'formula_kind', calculation.formula_kind,
        'selected_branch', calculation.selected_branch,
        'final_amount', pg_catalog.jsonb_build_object(
          'amount_minor', calculation.result_amount_minor::text,
          'currency', calculation.currency
        ),
        'close_policy_version', calculation.close_policy_version,
        'snapshot_hash', snapshot.snapshot_hash,
        'explanation_hash', snapshot.explanation_hash,
        'comparison', pg_catalog.jsonb_build_object(
          'status', CASE snapshot.comparison_status
            WHEN 'not_available' THEN 'unavailable'
            ELSE snapshot.comparison_status
          END,
          'previous_calculation_id', snapshot.previous_calculation_id,
          'previous_amount', CASE
            WHEN snapshot.previous_calculation_id IS NULL THEN NULL
            ELSE pg_catalog.jsonb_build_object(
              'amount_minor', previous.result_amount_minor::text,
              'currency', previous.currency
            )
          END,
          'delta', CASE WHEN snapshot.delta_minor IS NULL THEN NULL ELSE
            pg_catalog.jsonb_build_object(
              'amount_minor', snapshot.delta_minor::text,
              'currency', calculation.currency
            ) END,
          'delta_rate', CASE
            WHEN snapshot.delta_rate_numerator IS NULL THEN NULL
            ELSE pg_catalog.jsonb_build_object(
              'numerator', snapshot.delta_rate_numerator::text,
              'denominator', snapshot.delta_rate_denominator::text
            )
          END
        ),
        'status', CASE WHEN EXISTS (
          SELECT 1 FROM public.billing_calculation_events AS event
          WHERE event.calculation_id = calculation.id
            AND event.event_type = 'approved'
        ) THEN 'approved' ELSE 'created' END
      ) AS row_value
    FROM public.billing_calculations AS calculation
    JOIN public.billing_calculation_snapshots AS snapshot
      ON snapshot.calculation_id = calculation.id
    LEFT JOIN public.billing_calculations AS previous
      ON previous.id = snapshot.previous_calculation_id
    WHERE calculation.organization_id = organization_id_value
      AND calculation.account_id = account_id_value
    ORDER BY calculation.created_at DESC, calculation.id
    LIMIT per_page_value
    OFFSET (page_value - 1) * per_page_value
  ) AS item;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      item.row_value ORDER BY item.created_at DESC, item.adjustment_id
    ),
    '[]'::jsonb
  ) INTO adjustments_value
  FROM (
    SELECT adjustment.created_at, adjustment.id AS adjustment_id,
      pg_catalog.jsonb_build_object(
        'id', adjustment.id,
        'original_calculation_id', adjustment.original_calculation_id,
        'late_submission_id', adjustment.late_submission_id,
        'late_review_event_id', adjustment.late_review_event_id::text,
        'original_amount', pg_catalog.jsonb_build_object(
          'amount_minor', adjustment.original_amount_minor::text,
          'currency', adjustment.currency
        ),
        'actual_amount', pg_catalog.jsonb_build_object(
          'amount_minor', adjustment.actual_amount_minor::text,
          'currency', adjustment.currency
        ),
        'delta', pg_catalog.jsonb_build_object(
          'amount_minor', adjustment.delta_minor::text,
          'currency', adjustment.currency
        ),
        'treatment', adjustment.treatment,
        'status', adjustment.status,
        'reason', adjustment.reason,
        'snapshot_hash', adjustment.snapshot_hash,
        'relationship_hash', link.relationship_hash
      ) AS row_value
    FROM public.billing_adjustment_calculations AS adjustment
    JOIN public.billing_calculation_links AS link
      ON link.adjustment_calculation_id = adjustment.id
     AND link.organization_id = adjustment.organization_id
     AND link.account_id = adjustment.account_id
    WHERE adjustment.organization_id = organization_id_value
      AND adjustment.account_id = account_id_value
    ORDER BY adjustment.created_at DESC, adjustment.id
    LIMIT 100
  ) AS item;

  RETURN pg_catalog.jsonb_build_object(
    'data', data_value,
    'adjustments', adjustments_value,
    'total', total_value
  );
END;
$function$;

ALTER FUNCTION public.read_billing_calculations(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.read_billing_calculations(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.read_billing_calculations(jsonb)
  TO authenticated;
