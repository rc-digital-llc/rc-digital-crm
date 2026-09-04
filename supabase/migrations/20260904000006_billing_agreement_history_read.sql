-- Extend the caller-scoped agreement support read with immutable lifecycle
-- causation required by the operator history surface. No raw agreement terms,
-- evidence paths, signed URLs, or customer content are returned.

CREATE OR REPLACE FUNCTION public.read_billing_agreements(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  account_id_value uuid;
  organization_id_value uuid;
  data_value jsonb;
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR pg_catalog.jsonb_typeof(p_request) IS DISTINCT FROM 'object'
    OR (
      SELECT COALESCE(pg_catalog.array_agg(key ORDER BY key), ARRAY[]::text[])
      FROM pg_catalog.jsonb_object_keys(p_request) AS keys(key)
    ) IS DISTINCT FROM ARRAY['account_id']::text[]
    OR pg_catalog.jsonb_typeof(p_request->'account_id') IS DISTINCT FROM 'string'
    OR (p_request->>'account_id') !~ '^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AGREEMENT_READ_NOT_AUTHORIZED';
  END IF;

  account_id_value := (p_request->>'account_id')::uuid;
  SELECT account.organization_id INTO organization_id_value
  FROM public.billing_accounts AS account
  WHERE account.id = account_id_value;

  IF organization_id_value IS NULL OR NOT private.billing_has_capability(
    organization_id_value, account_id_value, 'agreement.read'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'AGREEMENT_READ_NOT_AUTHORIZED';
  END IF;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(row_value ORDER BY agreement_family, version_number DESC),
    '[]'::jsonb
  )
  INTO data_value
  FROM (
    SELECT
      agreement.agreement_family,
      version.version_number,
      pg_catalog.jsonb_build_object(
        'agreement_id', agreement.id,
        'version_id', version.id,
        'agreement_family', agreement.agreement_family,
        'cadence', agreement.cadence,
        'state', version.state,
        'latest_event', (
          SELECT event.event_type
          FROM public.billing_agreement_events AS event
          WHERE event.agreement_version_id = version.id
          ORDER BY event.id DESC
          LIMIT 1
        ),
        'version_number', version.version_number,
        'effective_start', version.effective_start,
        'effective_end', version.effective_end,
        'formula_kind', version.formula_kind,
        'fixed_amount_minor', CASE WHEN version.fixed_amount_minor IS NULL THEN NULL ELSE version.fixed_amount_minor::text END,
        'minimum_amount_minor', CASE WHEN version.minimum_amount_minor IS NULL THEN NULL ELSE version.minimum_amount_minor::text END,
        'rate_numerator', CASE WHEN version.rate_numerator IS NULL THEN NULL ELSE version.rate_numerator::text END,
        'rate_denominator', CASE WHEN version.rate_denominator IS NULL THEN NULL ELSE version.rate_denominator::text END,
        'submitted_percentage', version.submitted_percentage,
        'currency', version.currency,
        'currency_policy_version', version.currency_policy_version,
        'rate_policy_version', version.rate_policy_version,
        'rounding_policy_version', version.rounding_policy_version,
        'formula_version', version.formula_version,
        'explanation_version', version.explanation_version,
        'signed_evidence_id', version.signed_evidence_id,
        'signed_evidence_sha256', version.signed_evidence_sha256,
        'terms_fingerprint', version.terms_fingerprint,
        'self_approved', version.self_approved,
        'lifecycle_events', (
          SELECT COALESCE(
            pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'event_id', event.id::text,
                'event_type', event.event_type,
                'actor_id', event.actor_id,
                'actor_role', event.actor_role,
                'reason', event.reason,
                'created_at', event.created_at
              ) ORDER BY event.created_at DESC, event.id DESC
            ),
            '[]'::jsonb
          )
          FROM public.billing_agreement_events AS event
          WHERE event.agreement_version_id = version.id
        ),
        'rules', pg_catalog.jsonb_build_object(
          'timezone', rule.timezone,
          'timing_basis', rule.timing_basis,
          'included_amounts', rule.included_amounts,
          'excluded_amounts', rule.excluded_amounts,
          'tax_treatment', rule.tax_treatment,
          'refund_chargeback_policy', rule.refund_chargeback_policy,
          'cutoff_day', rule.cutoff_day,
          'dispute_policy', rule.dispute_policy,
          'missing_report_policy', rule.missing_report_policy,
          'true_up_policy', rule.true_up_policy,
          'evidence_priority', rule.evidence_priority
        )
      ) AS row_value
    FROM public.billing_agreements AS agreement
    JOIN public.billing_agreement_versions AS version
      ON version.agreement_id = agreement.id
    JOIN public.billing_agreement_revenue_rules AS rule
      ON rule.agreement_version_id = version.id
    WHERE agreement.organization_id = organization_id_value
      AND agreement.account_id = account_id_value
  ) AS rows;

  RETURN pg_catalog.jsonb_build_object('data', data_value);
END;
$function$;

ALTER FUNCTION public.read_billing_agreements(jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.read_billing_agreements(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.read_billing_agreements(jsonb) TO authenticated;
