-- Phase 4: complete close lineage and append-only late-evidence adjustments.

BEGIN;

CREATE FUNCTION private.billing_validate_revenue_close_lineage(
  p_close_snapshot_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  close_row public.billing_revenue_close_snapshots%ROWTYPE;
  period_row public.billing_revenue_periods%ROWTYPE;
  version_row public.billing_agreement_versions%ROWTYPE;
  rule_row public.billing_agreement_revenue_rules%ROWTYPE;
  review_row public.billing_revenue_review_events%ROWTYPE;
  submission_row public.billing_revenue_submissions%ROWTYPE;
  exception_row public.billing_close_exceptions%ROWTYPE;
  expected_evidence_snapshot jsonb := '[]'::jsonb;
  expected_evidence_fingerprint text;
  expected_close_fingerprint text;
  invalid_evidence_count bigint := 0;
BEGIN
  SELECT snapshot.* INTO close_row
  FROM public.billing_revenue_close_snapshots AS snapshot
  WHERE snapshot.id = p_close_snapshot_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BILLING_CLOSE_LINEAGE_INVALID';
  END IF;

  SELECT period.* INTO period_row
  FROM public.billing_revenue_periods AS period
  WHERE period.id = close_row.period_id;
  SELECT version.* INTO version_row
  FROM public.billing_agreement_versions AS version
  WHERE version.id = close_row.agreement_version_id;
  SELECT rule.* INTO rule_row
  FROM public.billing_agreement_revenue_rules AS rule
  WHERE rule.agreement_version_id = close_row.agreement_version_id;
  SELECT review.* INTO review_row
  FROM public.billing_revenue_review_events AS review
  WHERE review.id = close_row.review_event_id;

  IF period_row.id IS NULL OR version_row.id IS NULL
    OR rule_row.agreement_version_id IS NULL OR review_row.id IS NULL
    OR ROW(
      close_row.organization_id, close_row.account_id, close_row.agreement_id,
      close_row.agreement_version_id, close_row.period_id
    ) IS DISTINCT FROM ROW(
      period_row.organization_id, period_row.account_id,
      period_row.agreement_id, period_row.agreement_version_id, period_row.id
    )
    OR ROW(
      close_row.organization_id, close_row.account_id, close_row.agreement_id,
      close_row.agreement_version_id
    ) IS DISTINCT FROM ROW(
      version_row.organization_id, version_row.account_id,
      version_row.agreement_id, version_row.id
    )
    OR ROW(close_row.organization_id, close_row.account_id)
      IS DISTINCT FROM ROW(rule_row.organization_id, rule_row.account_id)
    OR ROW(
      close_row.organization_id, close_row.account_id, close_row.period_id
    ) IS DISTINCT FROM ROW(
      review_row.organization_id, review_row.account_id, review_row.period_id
    )
    OR version_row.state <> 'active'
    OR close_row.agreement_fingerprint IS DISTINCT FROM version_row.terms_fingerprint
    OR period_row.period_start < version_row.effective_start
    OR period_row.period_end > version_row.effective_end
    OR period_row.timezone IS DISTINCT FROM rule_row.timezone
    OR review_row.review_policy_version IS DISTINCT FROM 'revenue-review-v1'
    OR close_row.review_policy_version IS DISTINCT FROM review_row.review_policy_version
    OR close_row.close_policy_version IS DISTINCT FROM 'revenue-close-v1'
    OR review_row.created_at > close_row.closed_at
    OR NOT EXISTS (
      SELECT 1
      FROM public.billing_agreement_events AS event
      WHERE event.agreement_version_id = version_row.id
        AND event.organization_id = version_row.organization_id
        AND event.account_id = version_row.account_id
        AND event.agreement_id = version_row.agreement_id
        AND event.event_type = 'activated'
        AND event.evidence_sha256 = version_row.signed_evidence_sha256
        AND event.created_at <= close_row.closed_at
    )
    OR NOT EXISTS (
      SELECT 1
      FROM public.billing_evidence_objects AS evidence
      WHERE evidence.id = version_row.signed_evidence_id
        AND evidence.organization_id = version_row.organization_id
        AND evidence.account_id = version_row.account_id
        AND evidence.kind = 'contract'
        AND evidence.sha256 = version_row.signed_evidence_sha256
    )
    OR NOT EXISTS (
      SELECT 1
      FROM public.billing_role_capabilities AS capability
      WHERE capability.role = close_row.closed_by_role
        AND capability.capability = 'revenue.review'
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BILLING_CLOSE_LINEAGE_INVALID';
  END IF;

  IF close_row.close_mode = 'accepted_evidence' THEN
    SELECT submission.* INTO submission_row
    FROM public.billing_revenue_submissions AS submission
    WHERE submission.id = close_row.submission_id;
    IF submission_row.id IS NULL
      OR ROW(
        close_row.organization_id, close_row.account_id, close_row.period_id,
        close_row.submission_id
      ) IS DISTINCT FROM ROW(
        submission_row.organization_id, submission_row.account_id,
        submission_row.period_id, submission_row.id
      )
      OR review_row.outcome <> 'accept'
      OR review_row.reason_code <> 'REVENUE_ACCEPTED'
      OR review_row.submission_id IS DISTINCT FROM submission_row.id
      OR review_row.input_fingerprint IS DISTINCT FROM submission_row.request_fingerprint
      OR submission_row.submitted_at > review_row.created_at
      OR close_row.input_fingerprint IS DISTINCT FROM submission_row.request_fingerprint
      OR close_row.gross_amount_minor IS DISTINCT FROM submission_row.gross_amount_minor
      OR close_row.excluded_amount_minor IS DISTINCT FROM submission_row.excluded_amount_minor
      OR close_row.commissionable_amount_minor
        IS DISTINCT FROM submission_row.commissionable_amount_minor
      OR close_row.provenance_kind IS DISTINCT FROM submission_row.provenance_kind
      OR close_row.provenance_source_id
        IS DISTINCT FROM submission_row.provenance_source_id
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'BILLING_CLOSE_LINEAGE_INVALID';
    END IF;

    SELECT
      COALESCE(pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'evidence_id', link.evidence_id,
          'captured_sha256', link.captured_sha256,
          'ordinal', link.evidence_ordinal
        ) ORDER BY link.evidence_ordinal
      ), '[]'::jsonb),
      count(*) FILTER (
        WHERE evidence.id IS NULL
          OR evidence.sha256 IS DISTINCT FROM link.captured_sha256
      )
    INTO expected_evidence_snapshot, invalid_evidence_count
    FROM public.billing_revenue_submission_evidence AS link
    LEFT JOIN public.billing_evidence_objects AS evidence
      ON evidence.id = link.evidence_id
      AND evidence.organization_id = link.organization_id
      AND evidence.account_id = link.account_id
    WHERE link.submission_id = submission_row.id;
    expected_evidence_fingerprint :=
      private.billing_revenue_evidence_fingerprint(submission_row.id);

    IF pg_catalog.jsonb_array_length(expected_evidence_snapshot) = 0
      OR invalid_evidence_count <> 0
      OR close_row.evidence_snapshot IS DISTINCT FROM expected_evidence_snapshot
      OR close_row.evidence_fingerprint IS DISTINCT FROM expected_evidence_fingerprint
      OR review_row.evidence_fingerprint IS DISTINCT FROM expected_evidence_fingerprint
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'BILLING_CLOSE_LINEAGE_INVALID';
    END IF;
  ELSE
    SELECT exception.* INTO exception_row
    FROM public.billing_close_exceptions AS exception
    WHERE exception.id = close_row.exception_id;
    IF exception_row.id IS NULL
      OR ROW(
        close_row.organization_id, close_row.account_id, close_row.period_id
      ) IS DISTINCT FROM ROW(
        exception_row.organization_id, exception_row.account_id,
        exception_row.period_id
      )
      OR review_row.outcome <> 'hold'
      OR review_row.reason_code <> 'MISSING_EVIDENCE'
      OR review_row.submission_id IS NOT NULL
      OR exception_row.reason_code <> 'MISSING_EVIDENCE'
      OR exception_row.status <> 'open'
      OR exception_row.caused_by_review_event_id IS DISTINCT FROM review_row.id
      OR exception_row.opened_at > close_row.closed_at
      OR version_row.formula_kind NOT IN ('minimum_support', 'hybrid')
      OR version_row.minimum_amount_minor IS NULL
      OR rule_row.missing_report_policy <> 'minimum_only'
      OR close_row.evidence_snapshot IS DISTINCT FROM '[]'::jsonb
      OR close_row.evidence_fingerprint IS DISTINCT FROM review_row.evidence_fingerprint
      OR close_row.input_fingerprint IS DISTINCT FROM review_row.input_fingerprint
    THEN
      RAISE EXCEPTION USING
        ERRCODE = 'P0001', MESSAGE = 'BILLING_CLOSE_LINEAGE_INVALID';
    END IF;
    expected_evidence_fingerprint := review_row.evidence_fingerprint;
  END IF;

  expected_close_fingerprint := pg_catalog.encode(
    extensions.digest(
      pg_catalog.jsonb_build_object(
        'agreement_id', version_row.agreement_id,
        'agreement_version_id', version_row.id,
        'agreement_fingerprint', version_row.terms_fingerprint,
        'period_id', period_row.id,
        'period_start', period_row.period_start,
        'period_end', period_row.period_end,
        'timezone', period_row.timezone,
        'submission_deadline_at', period_row.submission_deadline_at,
        'close_mode', close_row.close_mode,
        'submission_id', submission_row.id,
        'review_event_id', review_row.id,
        'input_fingerprint', review_row.input_fingerprint,
        'evidence_fingerprint', expected_evidence_fingerprint,
        'exception_id', exception_row.id,
        'gross_amount_minor', submission_row.gross_amount_minor,
        'excluded_amount_minor', submission_row.excluded_amount_minor,
        'commissionable_amount_minor', submission_row.commissionable_amount_minor,
        'review_policy_version', review_row.review_policy_version,
        'close_policy_version', 'revenue-close-v1'
      )::text,
      'sha256'
    ),
    'hex'
  );
  IF close_row.close_input_fingerprint IS DISTINCT FROM expected_close_fingerprint THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BILLING_CLOSE_LINEAGE_INVALID';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'close_snapshot_id', close_row.id,
    'close_mode', close_row.close_mode,
    'submission_id', close_row.submission_id,
    'review_event_id', close_row.review_event_id,
    'exception_id', close_row.exception_id,
    'close_input_fingerprint', close_row.close_input_fingerprint
  );
END;
$function$;

CREATE FUNCTION private.billing_validate_calculation_lineage(
  p_calculation_id uuid,
  p_require_approved boolean
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  calculation_row public.billing_calculations%ROWTYPE;
  snapshot_row public.billing_calculation_snapshots%ROWTYPE;
  close_row public.billing_revenue_close_snapshots%ROWTYPE;
  version_row public.billing_agreement_versions%ROWTYPE;
  created_event public.billing_calculation_events%ROWTYPE;
  approval_event public.billing_calculation_events%ROWTYPE;
  formula_result jsonb;
  formula_input jsonb;
  approval_count bigint := 0;
BEGIN
  SELECT calculation.* INTO calculation_row
  FROM public.billing_calculations AS calculation
  WHERE calculation.id = p_calculation_id;
  SELECT snapshot.* INTO snapshot_row
  FROM public.billing_calculation_snapshots AS snapshot
  WHERE snapshot.calculation_id = p_calculation_id;
  IF calculation_row.id IS NULL OR snapshot_row.calculation_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BILLING_CALCULATION_LINEAGE_INVALID';
  END IF;

  PERFORM private.billing_validate_revenue_close_lineage(
    calculation_row.close_snapshot_id
  );
  SELECT close_snapshot.* INTO close_row
  FROM public.billing_revenue_close_snapshots AS close_snapshot
  WHERE close_snapshot.id = calculation_row.close_snapshot_id;
  SELECT version.* INTO version_row
  FROM public.billing_agreement_versions AS version
  WHERE version.id = calculation_row.agreement_version_id;

  IF version_row.id IS NULL
    OR ROW(
      calculation_row.organization_id, calculation_row.account_id,
      calculation_row.agreement_id, calculation_row.agreement_version_id,
      calculation_row.period_id, calculation_row.close_snapshot_id
    ) IS DISTINCT FROM ROW(
      snapshot_row.organization_id, snapshot_row.account_id,
      snapshot_row.agreement_id, snapshot_row.agreement_version_id,
      snapshot_row.period_id, snapshot_row.close_snapshot_id
    )
    OR ROW(
      calculation_row.organization_id, calculation_row.account_id,
      calculation_row.agreement_id, calculation_row.agreement_version_id,
      calculation_row.period_id, calculation_row.close_snapshot_id
    ) IS DISTINCT FROM ROW(
      close_row.organization_id, close_row.account_id, close_row.agreement_id,
      close_row.agreement_version_id, close_row.period_id, close_row.id
    )
    OR calculation_row.close_input_fingerprint
      IS DISTINCT FROM close_row.close_input_fingerprint
    OR calculation_row.terms_fingerprint IS DISTINCT FROM version_row.terms_fingerprint
    OR snapshot_row.snapshot_hash IS DISTINCT FROM pg_catalog.encode(
      extensions.digest(snapshot_row.snapshot_payload::text, 'sha256'), 'hex'
    )
    OR snapshot_row.explanation_hash IS DISTINCT FROM pg_catalog.encode(
      extensions.digest(snapshot_row.explanation_payload::text, 'sha256'), 'hex'
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BILLING_CALCULATION_LINEAGE_INVALID';
  END IF;

  formula_input := pg_catalog.jsonb_build_object(
    'formula_kind', version_row.formula_kind,
    'commissionable_amount', pg_catalog.jsonb_build_object(
      'amount_minor', snapshot_row.calculation_base_minor::text,
      'currency', version_row.currency
    ),
    'fixed_amount', CASE WHEN version_row.fixed_amount_minor IS NULL
      THEN NULL ELSE pg_catalog.jsonb_build_object(
        'amount_minor', version_row.fixed_amount_minor::text,
        'currency', version_row.currency
      ) END,
    'minimum_amount', CASE WHEN version_row.minimum_amount_minor IS NULL
      THEN NULL ELSE pg_catalog.jsonb_build_object(
        'amount_minor', version_row.minimum_amount_minor::text,
        'currency', version_row.currency
      ) END,
    'rate', CASE WHEN version_row.rate_numerator IS NULL
      THEN NULL ELSE pg_catalog.jsonb_build_object(
        'kind', 'ordinary_percentage',
        'numerator', version_row.rate_numerator::text,
        'denominator', version_row.rate_denominator::text,
        'submitted_percentage', version_row.submitted_percentage,
        'rate_policy_version', version_row.rate_policy_version
      ) END,
    'currency_policy_version', version_row.currency_policy_version,
    'rounding_policy_version', version_row.rounding_policy_version,
    'formula_version', version_row.formula_version
  );
  formula_result := private.billing_calculate_exact(formula_input);

  IF snapshot_row.formula_kind IS DISTINCT FROM formula_result->>'formula_kind'
    OR snapshot_row.intermediate_numerator
      IS DISTINCT FROM (formula_result->>'intermediate_numerator')::numeric
    OR snapshot_row.intermediate_denominator
      IS DISTINCT FROM (formula_result->>'intermediate_denominator')::bigint
    OR snapshot_row.fixed_candidate_minor
      IS DISTINCT FROM (formula_result->>'fixed_candidate_minor')::bigint
    OR snapshot_row.minimum_candidate_minor
      IS DISTINCT FROM (formula_result->>'minimum_candidate_minor')::bigint
    OR snapshot_row.percentage_candidate_minor
      IS DISTINCT FROM (formula_result->>'percentage_candidate_minor')::bigint
    OR snapshot_row.selected_branch IS DISTINCT FROM formula_result->>'selected_branch'
    OR snapshot_row.result_amount_minor
      IS DISTINCT FROM (formula_result->>'final_amount_minor')::bigint
    OR snapshot_row.result_amount_minor IS DISTINCT FROM calculation_row.result_amount_minor
    OR snapshot_row.selected_branch IS DISTINCT FROM calculation_row.selected_branch
    OR snapshot_row.currency IS DISTINCT FROM calculation_row.currency
    OR snapshot_row.currency_policy_version IS DISTINCT FROM version_row.currency_policy_version
    OR snapshot_row.rate_policy_version IS DISTINCT FROM version_row.rate_policy_version
    OR snapshot_row.rounding_policy_version IS DISTINCT FROM version_row.rounding_policy_version
    OR snapshot_row.formula_version IS DISTINCT FROM version_row.formula_version
    OR snapshot_row.revenue_close_policy_version IS DISTINCT FROM close_row.close_policy_version
    OR snapshot_row.close_policy_version IS DISTINCT FROM calculation_row.close_policy_version
    OR snapshot_row.explanation_version IS DISTINCT FROM version_row.explanation_version
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BILLING_CALCULATION_LINEAGE_INVALID';
  END IF;

  SELECT event.* INTO created_event
  FROM public.billing_calculation_events AS event
  WHERE event.calculation_id = calculation_row.id
    AND event.event_type = 'created';
  IF created_event.id IS NOT NULL AND (
    created_event.organization_id IS DISTINCT FROM calculation_row.organization_id
    OR created_event.account_id IS DISTINCT FROM calculation_row.account_id
    OR created_event.actor_type <> 'human'
    OR created_event.actor_id IS DISTINCT FROM calculation_row.created_by
    OR created_event.actor_role IS DISTINCT FROM calculation_row.created_by_role
    OR created_event.authorization_source <> 'capability:calculation.create'
    OR created_event.close_policy_version IS DISTINCT FROM calculation_row.close_policy_version
    OR NOT EXISTS (
      SELECT 1 FROM public.billing_role_capabilities AS capability
      WHERE capability.role = created_event.actor_role
        AND capability.capability = 'calculation.create'
    )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BILLING_CALCULATION_LINEAGE_INVALID';
  END IF;

  SELECT count(*), max(event.id) INTO approval_count, approval_event.id
  FROM public.billing_calculation_events AS event
  WHERE event.calculation_id = calculation_row.id
    AND event.event_type = 'approved';
  IF approval_count = 1 THEN
    SELECT event.* INTO approval_event
    FROM public.billing_calculation_events AS event
    WHERE event.id = approval_event.id;
  END IF;
  IF (p_require_approved AND (created_event.id IS NULL OR approval_count <> 1))
    OR approval_count > 1
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BILLING_CALCULATION_APPROVAL_REQUIRED';
  END IF;

  IF approval_count = 1 AND (
    approval_event.organization_id IS DISTINCT FROM calculation_row.organization_id
    OR approval_event.account_id IS DISTINCT FROM calculation_row.account_id
    OR approval_event.preview_fingerprint IS DISTINCT FROM created_event.preview_fingerprint
    OR approval_event.close_policy_version IS DISTINCT FROM calculation_row.close_policy_version
    OR (approval_event.approval_mode = 'manual' AND (
      approval_event.actor_type <> 'human'
      OR approval_event.authorization_source <> 'capability:calculation.approve'
      OR NOT EXISTS (
        SELECT 1 FROM public.billing_role_capabilities AS capability
        WHERE capability.role = approval_event.actor_role
          AND capability.capability = 'calculation.approve'
      )
    ))
    OR (approval_event.approval_mode = 'auto' AND (
      approval_event.actor_type <> 'automation'
      OR approval_event.authorization_source !~
        '^automation-grant:[0-9a-f-]{36}$'
      OR NOT EXISTS (
        SELECT 1
        FROM public.billing_automation_executions AS execution
        WHERE execution.principal_id = approval_event.actor_id
          AND execution.grant_id = pg_catalog.split_part(
            approval_event.authorization_source, ':', 2
          )::uuid
          AND execution.organization_id = calculation_row.organization_id
          AND execution.account_id = calculation_row.account_id
          AND execution.idempotency_key = approval_event.command_key
          AND execution.command_name = 'calculation.approve'
          AND execution.policy_version = approval_event.close_policy_version
          AND execution.action_kind = 'calculation.approval'
          AND execution.effect_discriminator = pg_catalog.jsonb_build_object(
            'kind', 'calculation-approval',
            'calculation_id', calculation_row.id,
            'preview_fingerprint', approval_event.preview_fingerprint,
            'reason_fingerprint', pg_catalog.encode(
              extensions.digest(approval_event.reason, 'sha256'), 'hex'
            )
          )
      )
    ))
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BILLING_CALCULATION_APPROVAL_INVALID';
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'calculation_id', calculation_row.id,
    'close_snapshot_id', calculation_row.close_snapshot_id,
    'snapshot_hash', snapshot_row.snapshot_hash,
    'explanation_hash', snapshot_row.explanation_hash,
    'approval_event_id', approval_event.id
  );
END;
$function$;

CREATE FUNCTION private.billing_revenue_close_lineage_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  PERFORM private.billing_validate_revenue_close_lineage(NEW.id);
  RETURN NEW;
END;
$function$;

CREATE FUNCTION private.billing_calculation_lineage_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  PERFORM private.billing_validate_calculation_lineage(NEW.calculation_id, false);
  RETURN NEW;
END;
$function$;

CREATE FUNCTION private.billing_calculation_approval_lineage_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  IF NEW.event_type = 'approved' THEN
    PERFORM private.billing_validate_calculation_lineage(NEW.calculation_id, true);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER billing_revenue_close_snapshots_validate_lineage
AFTER INSERT ON public.billing_revenue_close_snapshots
FOR EACH ROW EXECUTE FUNCTION private.billing_revenue_close_lineage_trigger();

CREATE TRIGGER billing_calculation_snapshots_validate_lineage
AFTER INSERT ON public.billing_calculation_snapshots
FOR EACH ROW EXECUTE FUNCTION private.billing_calculation_lineage_trigger();

CREATE TRIGGER billing_calculation_approvals_validate_lineage
AFTER INSERT ON public.billing_calculation_events
FOR EACH ROW EXECUTE FUNCTION private.billing_calculation_approval_lineage_trigger();

CREATE FUNCTION public.read_billing_calculation_lineage(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  request_keys text[];
  account_id_value uuid;
  calculation_id_value uuid;
  calculation_row public.billing_calculations%ROWTYPE;
  snapshot_row public.billing_calculation_snapshots%ROWTYPE;
  close_row public.billing_revenue_close_snapshots%ROWTYPE;
  period_row public.billing_revenue_periods%ROWTYPE;
  version_row public.billing_agreement_versions%ROWTYPE;
  review_row public.billing_revenue_review_events%ROWTYPE;
  approval_row public.billing_calculation_events%ROWTYPE;
  evidence_value jsonb;
BEGIN
  IF (SELECT auth.uid()) IS NULL
    OR pg_catalog.jsonb_typeof(p_request) IS DISTINCT FROM 'object'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'CALCULATION_NOT_AUTHORIZED';
  END IF;
  SELECT COALESCE(pg_catalog.array_agg(key ORDER BY key), ARRAY[]::text[])
  INTO request_keys
  FROM pg_catalog.jsonb_object_keys(p_request) AS keys(key);
  IF request_keys IS DISTINCT FROM ARRAY['account_id', 'calculation_id']::text[]
    OR EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_each(p_request) AS entry(key, value)
      WHERE pg_catalog.jsonb_typeof(entry.value) IS DISTINCT FROM 'string'
    )
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023', MESSAGE = 'CALCULATION_INVALID_REQUEST';
  END IF;
  BEGIN
    account_id_value := (p_request->>'account_id')::uuid;
    calculation_id_value := (p_request->>'calculation_id')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023', MESSAGE = 'CALCULATION_INVALID_REQUEST';
  END;

  SELECT calculation.* INTO calculation_row
  FROM public.billing_calculations AS calculation
  WHERE calculation.id = calculation_id_value
    AND calculation.account_id = account_id_value;
  IF NOT FOUND OR NOT private.billing_has_capability(
    calculation_row.organization_id, calculation_row.account_id,
    'calculation.read'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'CALCULATION_NOT_AUTHORIZED';
  END IF;
  PERFORM private.billing_validate_calculation_lineage(calculation_row.id, true);

  SELECT snapshot.* INTO snapshot_row
  FROM public.billing_calculation_snapshots AS snapshot
  WHERE snapshot.calculation_id = calculation_row.id;
  SELECT close_snapshot.* INTO close_row
  FROM public.billing_revenue_close_snapshots AS close_snapshot
  WHERE close_snapshot.id = calculation_row.close_snapshot_id;
  SELECT period.* INTO period_row
  FROM public.billing_revenue_periods AS period
  WHERE period.id = calculation_row.period_id;
  SELECT version.* INTO version_row
  FROM public.billing_agreement_versions AS version
  WHERE version.id = calculation_row.agreement_version_id;
  SELECT review.* INTO review_row
  FROM public.billing_revenue_review_events AS review
  WHERE review.id = close_row.review_event_id;
  SELECT event.* INTO approval_row
  FROM public.billing_calculation_events AS event
  WHERE event.calculation_id = calculation_row.id
    AND event.event_type = 'approved';

  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'evidence_id', item->>'evidence_id',
      'sha256_prefix', pg_catalog.left(item->>'captured_sha256', 12),
      'ordinal', (item->>'ordinal')::integer
    ) ORDER BY (item->>'ordinal')::integer
  ), '[]'::jsonb)
  INTO evidence_value
  FROM pg_catalog.jsonb_array_elements(close_row.evidence_snapshot) AS items(item);

  RETURN pg_catalog.jsonb_build_object(
    'calculation', pg_catalog.jsonb_build_object(
      'id', calculation_row.id,
      'formula_kind', calculation_row.formula_kind,
      'selected_branch', calculation_row.selected_branch,
      'result_amount_minor', calculation_row.result_amount_minor::text,
      'currency', calculation_row.currency,
      'snapshot_hash_prefix', pg_catalog.left(snapshot_row.snapshot_hash, 12),
      'explanation_hash_prefix', pg_catalog.left(snapshot_row.explanation_hash, 12)
    ),
    'agreement', pg_catalog.jsonb_build_object(
      'id', calculation_row.agreement_id,
      'version_id', calculation_row.agreement_version_id,
      'signed_evidence_id', version_row.signed_evidence_id,
      'terms_hash_prefix', pg_catalog.left(version_row.terms_fingerprint, 12),
      'effective_start', version_row.effective_start,
      'effective_end', version_row.effective_end
    ),
    'period', pg_catalog.jsonb_build_object(
      'id', period_row.id,
      'period_start', period_row.period_start,
      'period_end', period_row.period_end,
      'timezone', period_row.timezone
    ),
    'evidence_review', pg_catalog.jsonb_build_object(
      'submission_id', close_row.submission_id,
      'review_event_id', review_row.id,
      'outcome', review_row.outcome,
      'exception_id', close_row.exception_id,
      'evidence', evidence_value,
      'evidence_hash_prefix', pg_catalog.left(close_row.evidence_fingerprint, 12)
    ),
    'close', pg_catalog.jsonb_build_object(
      'id', close_row.id,
      'mode', close_row.close_mode,
      'input_hash_prefix', pg_catalog.left(close_row.close_input_fingerprint, 12)
    ),
    'formula', pg_catalog.jsonb_build_object(
      'calculation_base_minor', snapshot_row.calculation_base_minor::text,
      'intermediate_numerator', snapshot_row.intermediate_numerator::text,
      'intermediate_denominator', snapshot_row.intermediate_denominator::text,
      'fixed_candidate_minor', snapshot_row.fixed_candidate_minor::text,
      'minimum_candidate_minor', snapshot_row.minimum_candidate_minor::text,
      'percentage_candidate_minor', snapshot_row.percentage_candidate_minor::text
    ),
    'policies', pg_catalog.jsonb_build_object(
      'currency', snapshot_row.currency_policy_version,
      'rate', snapshot_row.rate_policy_version,
      'rounding', snapshot_row.rounding_policy_version,
      'formula', snapshot_row.formula_version,
      'revenue_close', snapshot_row.revenue_close_policy_version,
      'calculation_close', snapshot_row.close_policy_version,
      'explanation', snapshot_row.explanation_version
    ),
    'approval', pg_catalog.jsonb_build_object(
      'event_id', approval_row.id,
      'mode', approval_row.approval_mode,
      'actor_type', approval_row.actor_type
    )
  );
END;
$function$;

ALTER FUNCTION private.billing_validate_revenue_close_lineage(uuid)
  OWNER TO postgres;
ALTER FUNCTION private.billing_validate_calculation_lineage(uuid, boolean)
  OWNER TO postgres;
ALTER FUNCTION private.billing_revenue_close_lineage_trigger()
  OWNER TO postgres;
ALTER FUNCTION private.billing_calculation_lineage_trigger()
  OWNER TO postgres;
ALTER FUNCTION private.billing_calculation_approval_lineage_trigger()
  OWNER TO postgres;
ALTER FUNCTION public.read_billing_calculation_lineage(jsonb)
  OWNER TO postgres;

REVOKE ALL ON FUNCTION private.billing_validate_revenue_close_lineage(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_validate_calculation_lineage(uuid, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_revenue_close_lineage_trigger()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_calculation_lineage_trigger()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_calculation_approval_lineage_trigger()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.read_billing_calculation_lineage(jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.read_billing_calculation_lineage(jsonb)
  TO authenticated;

COMMIT;
