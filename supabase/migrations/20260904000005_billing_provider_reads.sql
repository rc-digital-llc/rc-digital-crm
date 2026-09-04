-- Phase 4: bounded support-safe provider reads with exact string money.

BEGIN;

CREATE FUNCTION public.read_billing_revenue_periods(p_request jsonb)
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
      ERRCODE = '22023', MESSAGE = 'REVENUE_READ_INVALID_REQUEST';
  END IF;
  BEGIN
    account_id_value := (p_request->>'account_id')::uuid;
    page_value := (p_request->>'page')::integer;
    per_page_value := (p_request->>'per_page')::integer;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023', MESSAGE = 'REVENUE_READ_INVALID_REQUEST';
  END;
  IF page_value NOT BETWEEN 1 AND 1000000
    OR per_page_value NOT BETWEEN 1 AND 100
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023', MESSAGE = 'REVENUE_READ_INVALID_REQUEST';
  END IF;

  SELECT account.organization_id INTO organization_id_value
  FROM public.billing_accounts AS account
  WHERE account.id = account_id_value;
  IF organization_id_value IS NULL OR NOT private.billing_has_capability(
    organization_id_value, account_id_value, 'revenue.read'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'REVENUE_NOT_AUTHORIZED';
  END IF;

  SELECT count(*) INTO total_value
  FROM public.billing_revenue_periods AS period
  WHERE period.organization_id = organization_id_value
    AND period.account_id = account_id_value;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(item.row_value ORDER BY item.period_start DESC, item.period_id),
    '[]'::jsonb
  ) INTO data_value
  FROM (
    SELECT period.period_start, period.id AS period_id,
      pg_catalog.jsonb_build_object(
        'period', pg_catalog.jsonb_build_object(
          'id', period.id,
          'organization_id', period.organization_id,
          'account_id', period.account_id,
          'agreement_id', period.agreement_id,
          'agreement_version_id', period.agreement_version_id,
          'period_start', period.period_start,
          'period_end', period.period_end,
          'timezone', period.timezone,
          'submission_deadline_at', period.submission_deadline_at,
          'state', CASE WHEN close_snapshot.id IS NULL THEN 'open' ELSE 'closed' END,
          'created_at', period.created_at
        ),
        'submissions', COALESCE((
          SELECT pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', submission.id,
              'organization_id', submission.organization_id,
              'account_id', submission.account_id,
              'period_id', submission.period_id,
              'revision_number', submission.revision_number,
              'previous_submission_id', submission.previous_submission_id,
              'gross_amount', pg_catalog.jsonb_build_object(
                'amount_minor', submission.gross_amount_minor::text,
                'currency', submission.currency
              ),
              'excluded_amount', pg_catalog.jsonb_build_object(
                'amount_minor', submission.excluded_amount_minor::text,
                'currency', submission.currency
              ),
              'commissionable_amount', pg_catalog.jsonb_build_object(
                'amount_minor', submission.commissionable_amount_minor::text,
                'currency', submission.currency
              ),
              'provenance_kind', submission.provenance_kind,
              'provenance_source_id', submission.provenance_source_id,
              'submitter_id', submission.submitter_id,
              'submitter_role', submission.submitter_role,
              'attestation_text', submission.attestation_text,
              'request_fingerprint', submission.request_fingerprint,
              'submitted_at', submission.submitted_at,
              'evidence', COALESCE((
                SELECT pg_catalog.jsonb_agg(
                  pg_catalog.jsonb_build_object(
                    'evidence_id', link.evidence_id,
                    'captured_sha256', link.captured_sha256,
                    'ordinal', link.evidence_ordinal
                  ) ORDER BY link.evidence_ordinal
                )
                FROM public.billing_revenue_submission_evidence AS link
                WHERE link.submission_id = submission.id
              ), '[]'::jsonb)
            ) ORDER BY submission.revision_number DESC
          )
          FROM public.billing_revenue_submissions AS submission
          WHERE submission.period_id = period.id
        ), '[]'::jsonb),
        'reviews', COALESCE((
          SELECT pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', review.id::text,
              'period_id', review.period_id,
              'submission_id', review.submission_id,
              'outcome', review.outcome,
              'reason_code', review.reason_code,
              'reviewer_id', review.reviewer_id,
              'reviewer_role', review.reviewer_role,
              'reason', review.reason,
              'input_fingerprint', review.input_fingerprint,
              'evidence_fingerprint', review.evidence_fingerprint,
              'review_policy_version', review.review_policy_version,
              'created_at', review.created_at
            ) ORDER BY review.created_at DESC, review.id DESC
          )
          FROM public.billing_revenue_review_events AS review
          WHERE review.period_id = period.id
        ), '[]'::jsonb),
        'exceptions', COALESCE((
          SELECT pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', exception.id,
              'period_id', exception.period_id,
              'submission_id', exception.submission_id,
              'reason_code', exception.reason_code,
              'amount_at_risk', CASE
                WHEN exception.amount_at_risk_minor IS NULL THEN NULL
                ELSE pg_catalog.jsonb_build_object(
                  'amount_minor', exception.amount_at_risk_minor::text,
                  'currency', exception.currency
                )
              END,
              'owner_id', exception.owner_id,
              'next_action', exception.next_action,
              'due_at', exception.due_at,
              'status', exception.status,
              'caused_by_review_event_id',
                exception.caused_by_review_event_id::text,
              'opened_at', exception.opened_at,
              'resolved_at', exception.resolved_at,
              'resolution_reason', exception.resolution_reason
            ) ORDER BY exception.opened_at DESC, exception.id
          )
          FROM public.billing_close_exceptions AS exception
          WHERE exception.period_id = period.id
        ), '[]'::jsonb),
        'close_snapshot', CASE WHEN close_snapshot.id IS NULL THEN NULL ELSE
          pg_catalog.jsonb_build_object(
            'id', close_snapshot.id,
            'period_id', close_snapshot.period_id,
            'agreement_id', close_snapshot.agreement_id,
            'agreement_version_id', close_snapshot.agreement_version_id,
            'close_mode', close_snapshot.close_mode,
            'submission_id', close_snapshot.submission_id,
            'review_event_id', close_snapshot.review_event_id::text,
            'exception_id', close_snapshot.exception_id,
            'gross_amount', CASE
              WHEN close_snapshot.gross_amount_minor IS NULL THEN NULL
              ELSE pg_catalog.jsonb_build_object(
                'amount_minor', close_snapshot.gross_amount_minor::text,
                'currency', close_snapshot.currency
              )
            END,
            'excluded_amount', CASE
              WHEN close_snapshot.excluded_amount_minor IS NULL THEN NULL
              ELSE pg_catalog.jsonb_build_object(
                'amount_minor', close_snapshot.excluded_amount_minor::text,
                'currency', close_snapshot.currency
              )
            END,
            'commissionable_amount', CASE
              WHEN close_snapshot.commissionable_amount_minor IS NULL THEN NULL
              ELSE pg_catalog.jsonb_build_object(
                'amount_minor', close_snapshot.commissionable_amount_minor::text,
                'currency', close_snapshot.currency
              )
            END,
            'provenance_kind', close_snapshot.provenance_kind,
            'provenance_source_id', close_snapshot.provenance_source_id,
            'evidence', close_snapshot.evidence_snapshot,
            'agreement_fingerprint', close_snapshot.agreement_fingerprint,
            'input_fingerprint', close_snapshot.input_fingerprint,
            'evidence_fingerprint', close_snapshot.evidence_fingerprint,
            'close_input_fingerprint', close_snapshot.close_input_fingerprint,
            'review_policy_version', close_snapshot.review_policy_version,
            'close_policy_version', close_snapshot.close_policy_version,
            'closed_at', close_snapshot.closed_at
          ) END
      ) AS row_value
    FROM public.billing_revenue_periods AS period
    LEFT JOIN public.billing_revenue_close_snapshots AS close_snapshot
      ON close_snapshot.period_id = period.id
    WHERE period.organization_id = organization_id_value
      AND period.account_id = account_id_value
    ORDER BY period.period_start DESC, period.id
    LIMIT per_page_value
    OFFSET (page_value - 1) * per_page_value
  ) AS item;

  RETURN pg_catalog.jsonb_build_object(
    'data', data_value,
    'total', total_value
  );
END;
$function$;

CREATE FUNCTION public.read_billing_calculations(p_request jsonb)
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
    pg_catalog.jsonb_agg(item.row_value ORDER BY item.created_at DESC, item.calculation_id),
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

  RETURN pg_catalog.jsonb_build_object(
    'data', data_value,
    'total', total_value
  );
END;
$function$;

ALTER FUNCTION public.read_billing_revenue_periods(jsonb) OWNER TO postgres;
ALTER FUNCTION public.read_billing_calculations(jsonb) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.read_billing_revenue_periods(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.read_billing_calculations(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.read_billing_revenue_periods(jsonb)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.read_billing_calculations(jsonb)
  TO authenticated;

COMMIT;
