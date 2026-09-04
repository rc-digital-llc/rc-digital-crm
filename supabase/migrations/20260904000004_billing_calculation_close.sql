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

CREATE TABLE public.billing_adjustment_calculations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  account_id uuid NOT NULL,
  original_calculation_id uuid NOT NULL,
  agreement_id uuid NOT NULL,
  agreement_version_id uuid NOT NULL,
  period_id uuid NOT NULL,
  original_close_snapshot_id uuid NOT NULL,
  late_submission_id uuid NOT NULL,
  late_review_event_id bigint NOT NULL
    REFERENCES public.billing_revenue_review_events(id) ON DELETE RESTRICT,
  original_approval_event_id bigint NOT NULL
    REFERENCES public.billing_calculation_events(id) ON DELETE RESTRICT,
  business_key text NOT NULL CHECK (business_key ~ '^[0-9a-f]{64}$'),
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  terms_fingerprint text NOT NULL CHECK (terms_fingerprint ~ '^[0-9a-f]{64}$'),
  original_snapshot_hash text NOT NULL CHECK (
    original_snapshot_hash ~ '^[0-9a-f]{64}$'
  ),
  late_input_fingerprint text NOT NULL CHECK (
    late_input_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  late_evidence_fingerprint text NOT NULL CHECK (
    late_evidence_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  late_evidence_snapshot jsonb NOT NULL CHECK (
    pg_catalog.jsonb_typeof(late_evidence_snapshot) = 'array'
    AND pg_catalog.jsonb_array_length(late_evidence_snapshot) BETWEEN 1 AND 100
  ),
  formula_kind text NOT NULL CHECK (formula_kind IN ('minimum_support', 'hybrid')),
  calculation_base_minor bigint NOT NULL CHECK (calculation_base_minor >= 0),
  minimum_amount_minor bigint NOT NULL CHECK (minimum_amount_minor >= 0),
  rate_numerator bigint,
  rate_denominator bigint,
  submitted_percentage text,
  intermediate_numerator numeric,
  intermediate_denominator bigint,
  minimum_candidate_minor bigint NOT NULL CHECK (minimum_candidate_minor >= 0),
  percentage_candidate_minor bigint,
  selected_branch text NOT NULL CHECK (
    selected_branch IN ('minimum', 'minimum_equal', 'percentage')
  ),
  original_amount_minor bigint NOT NULL CHECK (original_amount_minor >= 0),
  actual_amount_minor bigint NOT NULL CHECK (actual_amount_minor >= 0),
  delta_minor bigint NOT NULL,
  true_up_policy text NOT NULL CHECK (
    true_up_policy IN ('next_period_adjustment', 'credit_candidate')
  ),
  treatment text NOT NULL CHECK (
    treatment IN ('true_up', 'no_adjustment', 'credit_candidate', 'held')
  ),
  status text NOT NULL CHECK (status IN ('approved', 'no_adjustment', 'held')),
  currency text NOT NULL CHECK (currency = 'USD'),
  currency_policy_version text NOT NULL REFERENCES
    public.financial_currency_policies(policy_version),
  rate_policy_version text NOT NULL REFERENCES
    public.financial_rate_policies(policy_version),
  rounding_policy_version text NOT NULL REFERENCES
    public.financial_rounding_policies(policy_version),
  formula_version text NOT NULL CHECK (
    formula_version = 'billing-agreement-formula-v1'
  ),
  close_policy_version text NOT NULL REFERENCES
    public.billing_close_policies(policy_version),
  explanation_version text NOT NULL CHECK (
    explanation_version = 'billing-agreement-explanation-v1'
  ),
  snapshot_payload jsonb NOT NULL,
  snapshot_hash text NOT NULL CHECK (snapshot_hash ~ '^[0-9a-f]{64}$'),
  explanation_payload jsonb NOT NULL,
  explanation_hash text NOT NULL CHECK (explanation_hash ~ '^[0-9a-f]{64}$'),
  response_snapshot jsonb NOT NULL CHECK (
    pg_catalog.jsonb_typeof(response_snapshot) = 'object'
  ),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_by_role text NOT NULL REFERENCES public.billing_roles(role),
  reason text NOT NULL CHECK (
    pg_catalog.btrim(reason) <> '' AND pg_catalog.octet_length(reason) <= 1000
  ),
  command_key text NOT NULL CHECK (
    command_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$'
  ),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT billing_adjustments_original_scope_fk
    FOREIGN KEY (original_calculation_id, organization_id, account_id)
    REFERENCES public.billing_calculations(id, organization_id, account_id)
    ON DELETE RESTRICT,
  CONSTRAINT billing_adjustments_submission_scope_fk
    FOREIGN KEY (late_submission_id, organization_id, account_id)
    REFERENCES public.billing_revenue_submissions(id, organization_id, account_id)
    ON DELETE RESTRICT,
  CONSTRAINT billing_adjustments_agreement_scope_fk
    FOREIGN KEY (agreement_id, organization_id, account_id)
    REFERENCES public.billing_agreements(id, organization_id, account_id)
    ON DELETE RESTRICT,
  CONSTRAINT billing_adjustments_version_scope_fk
    FOREIGN KEY (agreement_version_id, organization_id, account_id)
    REFERENCES public.billing_agreement_versions(id, organization_id, account_id)
    ON DELETE RESTRICT,
  CONSTRAINT billing_adjustments_period_scope_fk
    FOREIGN KEY (period_id, organization_id, account_id)
    REFERENCES public.billing_revenue_periods(id, organization_id, account_id)
    ON DELETE RESTRICT,
  CONSTRAINT billing_adjustments_close_scope_fk
    FOREIGN KEY (original_close_snapshot_id, organization_id, account_id)
    REFERENCES public.billing_revenue_close_snapshots(id, organization_id, account_id)
    ON DELETE RESTRICT,
  CONSTRAINT billing_adjustments_scope_unique UNIQUE (id, organization_id, account_id),
  CONSTRAINT billing_adjustments_business_unique
    UNIQUE (organization_id, account_id, business_key),
  CONSTRAINT billing_adjustments_late_revision_unique
    UNIQUE (original_calculation_id, late_submission_id),
  CONSTRAINT billing_adjustments_actor_command_unique
    UNIQUE (created_by, command_key),
  CONSTRAINT billing_adjustments_exact_check CHECK (
    actual_amount_minor - original_amount_minor = delta_minor
    AND minimum_candidate_minor = minimum_amount_minor
    AND (
      (formula_kind = 'minimum_support'
        AND rate_numerator IS NULL AND rate_denominator IS NULL
        AND submitted_percentage IS NULL
        AND intermediate_numerator IS NULL AND intermediate_denominator IS NULL
        AND percentage_candidate_minor IS NULL
        AND selected_branch = 'minimum'
        AND actual_amount_minor = minimum_candidate_minor)
      OR (formula_kind = 'hybrid'
        AND rate_numerator IS NOT NULL AND rate_numerator >= 0
        AND rate_denominator IS NOT NULL AND rate_denominator > 0
        AND submitted_percentage IS NOT NULL
        AND intermediate_numerator =
          calculation_base_minor::numeric * rate_numerator::numeric
        AND intermediate_denominator = rate_denominator
        AND percentage_candidate_minor IS NOT NULL
        AND percentage_candidate_minor >= 0
        AND ((selected_branch = 'minimum'
            AND percentage_candidate_minor < minimum_candidate_minor
            AND actual_amount_minor = percentage_candidate_minor)
          OR (selected_branch = 'minimum_equal'
            AND percentage_candidate_minor = minimum_candidate_minor
            AND actual_amount_minor = percentage_candidate_minor)
          OR (selected_branch = 'percentage'
            AND percentage_candidate_minor > minimum_candidate_minor
            AND actual_amount_minor = percentage_candidate_minor)))
    )
    AND (
      (delta_minor > 0 AND treatment = 'true_up' AND status = 'approved')
      OR (delta_minor = 0 AND treatment = 'no_adjustment'
        AND status = 'no_adjustment')
      OR (delta_minor < 0 AND true_up_policy = 'credit_candidate'
        AND treatment = 'credit_candidate' AND status = 'approved')
      OR (delta_minor < 0 AND true_up_policy = 'next_period_adjustment'
        AND treatment = 'held' AND status = 'held')
    )
  ),
  CONSTRAINT billing_adjustments_snapshot_hash_check CHECK (
    pg_catalog.jsonb_typeof(snapshot_payload) = 'object'
    AND snapshot_hash = pg_catalog.encode(
      extensions.digest(snapshot_payload::text, 'sha256'), 'hex'
    )
    AND pg_catalog.jsonb_typeof(explanation_payload) = 'object'
    AND explanation_hash = pg_catalog.encode(
      extensions.digest(explanation_payload::text, 'sha256'), 'hex'
    )
  )
);

CREATE TABLE public.billing_calculation_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  account_id uuid NOT NULL,
  original_calculation_id uuid NOT NULL,
  adjustment_calculation_id uuid NOT NULL,
  late_submission_id uuid NOT NULL,
  late_review_event_id bigint NOT NULL
    REFERENCES public.billing_revenue_review_events(id) ON DELETE RESTRICT,
  link_type text NOT NULL CHECK (link_type = 'late_evidence'),
  delta_minor bigint NOT NULL,
  treatment text NOT NULL CHECK (
    treatment IN ('true_up', 'no_adjustment', 'credit_candidate', 'held')
  ),
  relationship_hash text NOT NULL CHECK (relationship_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT billing_calculation_links_original_scope_fk
    FOREIGN KEY (original_calculation_id, organization_id, account_id)
    REFERENCES public.billing_calculations(id, organization_id, account_id)
    ON DELETE RESTRICT,
  CONSTRAINT billing_calculation_links_adjustment_scope_fk
    FOREIGN KEY (adjustment_calculation_id, organization_id, account_id)
    REFERENCES public.billing_adjustment_calculations(id, organization_id, account_id)
    ON DELETE RESTRICT,
  CONSTRAINT billing_calculation_links_submission_scope_fk
    FOREIGN KEY (late_submission_id, organization_id, account_id)
    REFERENCES public.billing_revenue_submissions(id, organization_id, account_id)
    ON DELETE RESTRICT,
  CONSTRAINT billing_calculation_links_acyclic_check CHECK (
    original_calculation_id <> adjustment_calculation_id
  ),
  CONSTRAINT billing_calculation_links_adjustment_unique
    UNIQUE (adjustment_calculation_id),
  CONSTRAINT billing_calculation_links_revision_unique
    UNIQUE (original_calculation_id, late_submission_id)
);

CREATE TABLE public.billing_adjustment_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  account_id uuid NOT NULL,
  adjustment_calculation_id uuid NOT NULL,
  reason_code text NOT NULL CHECK (reason_code = 'CONTRACT_REVIEW_REQUIRED'),
  amount_at_risk_minor bigint NOT NULL CHECK (amount_at_risk_minor > 0),
  currency text NOT NULL CHECK (currency = 'USD'),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  next_action text NOT NULL CHECK (
    pg_catalog.btrim(next_action) <> ''
    AND pg_catalog.octet_length(next_action) <= 1000
  ),
  status text NOT NULL CHECK (status = 'held'),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT billing_adjustment_exceptions_adjustment_scope_fk
    FOREIGN KEY (adjustment_calculation_id, organization_id, account_id)
    REFERENCES public.billing_adjustment_calculations(id, organization_id, account_id)
    ON DELETE RESTRICT,
  CONSTRAINT billing_adjustment_exceptions_one_per_adjustment
    UNIQUE (adjustment_calculation_id)
);

CREATE INDEX billing_adjustment_calculations_scope_created_idx
  ON public.billing_adjustment_calculations (
    organization_id, account_id, created_at DESC, id
  );
CREATE INDEX billing_calculation_links_original_idx
  ON public.billing_calculation_links (
    organization_id, account_id, original_calculation_id, created_at, id
  );

CREATE FUNCTION private.billing_adjustment_calculation_freeze()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  original_row public.billing_calculations%ROWTYPE;
  original_snapshot public.billing_calculation_snapshots%ROWTYPE;
  close_row public.billing_revenue_close_snapshots%ROWTYPE;
  version_row public.billing_agreement_versions%ROWTYPE;
  rule_row public.billing_agreement_revenue_rules%ROWTYPE;
  submission_row public.billing_revenue_submissions%ROWTYPE;
  review_row public.billing_revenue_review_events%ROWTYPE;
  formula_result jsonb;
  formula_input jsonb;
  expected_evidence jsonb;
BEGIN
  PERFORM private.billing_validate_calculation_lineage(
    NEW.original_calculation_id, true
  );
  SELECT calculation.* INTO original_row
  FROM public.billing_calculations AS calculation
  WHERE calculation.id = NEW.original_calculation_id;
  SELECT snapshot.* INTO original_snapshot
  FROM public.billing_calculation_snapshots AS snapshot
  WHERE snapshot.calculation_id = NEW.original_calculation_id;
  SELECT close_snapshot.* INTO close_row
  FROM public.billing_revenue_close_snapshots AS close_snapshot
  WHERE close_snapshot.id = original_row.close_snapshot_id;
  SELECT version.* INTO version_row
  FROM public.billing_agreement_versions AS version
  WHERE version.id = original_row.agreement_version_id;
  SELECT rule.* INTO rule_row
  FROM public.billing_agreement_revenue_rules AS rule
  WHERE rule.agreement_version_id = original_row.agreement_version_id;
  SELECT submission.* INTO submission_row
  FROM public.billing_revenue_submissions AS submission
  WHERE submission.id = NEW.late_submission_id;
  SELECT review.* INTO review_row
  FROM public.billing_revenue_review_events AS review
  WHERE review.id = NEW.late_review_event_id;
  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'evidence_id', link.evidence_id,
      'captured_sha256', link.captured_sha256,
      'ordinal', link.evidence_ordinal
    ) ORDER BY link.evidence_ordinal
  ), '[]'::jsonb)
  INTO expected_evidence
  FROM public.billing_revenue_submission_evidence AS link
  WHERE link.submission_id = NEW.late_submission_id;

  formula_input := pg_catalog.jsonb_build_object(
    'formula_kind', version_row.formula_kind,
    'commissionable_amount', pg_catalog.jsonb_build_object(
      'amount_minor', submission_row.commissionable_amount_minor::text,
      'currency', version_row.currency
    ),
    'fixed_amount', NULL,
    'minimum_amount', pg_catalog.jsonb_build_object(
      'amount_minor', version_row.minimum_amount_minor::text,
      'currency', version_row.currency
    ),
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

  IF close_row.close_mode <> 'minimum_only'
    OR ROW(
      NEW.organization_id, NEW.account_id, NEW.agreement_id,
      NEW.agreement_version_id, NEW.period_id, NEW.original_close_snapshot_id
    ) IS DISTINCT FROM ROW(
      original_row.organization_id, original_row.account_id,
      original_row.agreement_id, original_row.agreement_version_id,
      original_row.period_id, original_row.close_snapshot_id
    )
    OR ROW(
      submission_row.organization_id, submission_row.account_id,
      submission_row.period_id, submission_row.id
    ) IS DISTINCT FROM ROW(
      NEW.organization_id, NEW.account_id, NEW.period_id,
      NEW.late_submission_id
    )
    OR ROW(
      review_row.organization_id, review_row.account_id, review_row.period_id,
      review_row.submission_id, review_row.id
    ) IS DISTINCT FROM ROW(
      NEW.organization_id, NEW.account_id, NEW.period_id,
      NEW.late_submission_id, NEW.late_review_event_id
    )
    OR review_row.outcome <> 'accept'
    OR review_row.reason_code <> 'REVENUE_ACCEPTED'
    OR review_row.input_fingerprint IS DISTINCT FROM submission_row.request_fingerprint
    OR review_row.evidence_fingerprint IS DISTINCT FROM
      private.billing_revenue_evidence_fingerprint(submission_row.id)
    OR submission_row.submitted_at <= close_row.closed_at
    OR review_row.created_at < submission_row.submitted_at
    OR NEW.terms_fingerprint IS DISTINCT FROM version_row.terms_fingerprint
    OR NEW.original_snapshot_hash IS DISTINCT FROM original_snapshot.snapshot_hash
    OR NEW.original_amount_minor IS DISTINCT FROM original_row.result_amount_minor
    OR NEW.late_input_fingerprint IS DISTINCT FROM submission_row.request_fingerprint
    OR NEW.late_evidence_fingerprint IS DISTINCT FROM review_row.evidence_fingerprint
    OR NEW.late_evidence_snapshot IS DISTINCT FROM expected_evidence
    OR NEW.formula_kind IS DISTINCT FROM formula_result->>'formula_kind'
    OR NEW.calculation_base_minor IS DISTINCT FROM submission_row.commissionable_amount_minor
    OR NEW.minimum_amount_minor IS DISTINCT FROM version_row.minimum_amount_minor
    OR NEW.rate_numerator IS DISTINCT FROM version_row.rate_numerator
    OR NEW.rate_denominator IS DISTINCT FROM version_row.rate_denominator
    OR NEW.submitted_percentage IS DISTINCT FROM version_row.submitted_percentage
    OR NEW.intermediate_numerator
      IS DISTINCT FROM (formula_result->>'intermediate_numerator')::numeric
    OR NEW.intermediate_denominator
      IS DISTINCT FROM (formula_result->>'intermediate_denominator')::bigint
    OR NEW.minimum_candidate_minor
      IS DISTINCT FROM (formula_result->>'minimum_candidate_minor')::bigint
    OR NEW.percentage_candidate_minor
      IS DISTINCT FROM (formula_result->>'percentage_candidate_minor')::bigint
    OR NEW.selected_branch IS DISTINCT FROM formula_result->>'selected_branch'
    OR NEW.actual_amount_minor IS DISTINCT FROM (CASE
      WHEN version_row.formula_kind = 'hybrid'
      THEN (formula_result->>'percentage_candidate_minor')::bigint
      ELSE (formula_result->>'final_amount_minor')::bigint
    END)
    OR NEW.delta_minor IS DISTINCT FROM
      (CASE WHEN version_row.formula_kind = 'hybrid'
        THEN (formula_result->>'percentage_candidate_minor')::bigint
        ELSE (formula_result->>'final_amount_minor')::bigint
      END) - original_row.result_amount_minor
    OR NEW.true_up_policy IS DISTINCT FROM rule_row.true_up_policy
    OR NEW.currency_policy_version IS DISTINCT FROM version_row.currency_policy_version
    OR NEW.rate_policy_version IS DISTINCT FROM version_row.rate_policy_version
    OR NEW.rounding_policy_version IS DISTINCT FROM version_row.rounding_policy_version
    OR NEW.formula_version IS DISTINCT FROM version_row.formula_version
    OR NEW.close_policy_version IS DISTINCT FROM original_row.close_policy_version
    OR NEW.explanation_version IS DISTINCT FROM version_row.explanation_version
    OR NEW.snapshot_payload#>>'{lineage,original_calculation_id}'
      IS DISTINCT FROM original_row.id::text
    OR NEW.snapshot_payload#>>'{late_evidence,evidence_fingerprint}'
      IS DISTINCT FROM review_row.evidence_fingerprint
    OR NEW.snapshot_payload#>>'{reconciliation,delta_minor}'
      IS DISTINCT FROM NEW.delta_minor::text
    OR NEW.snapshot_payload#>>'{reconciliation,treatment}'
      IS DISTINCT FROM NEW.treatment
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BILLING_ADJUSTMENT_SNAPSHOT_MISMATCH';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE FUNCTION private.billing_calculation_link_freeze()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  adjustment_row public.billing_adjustment_calculations%ROWTYPE;
  expected_hash text;
BEGIN
  SELECT adjustment.* INTO adjustment_row
  FROM public.billing_adjustment_calculations AS adjustment
  WHERE adjustment.id = NEW.adjustment_calculation_id;
  expected_hash := pg_catalog.encode(
    extensions.digest(
      pg_catalog.jsonb_build_object(
        'original_calculation_id', NEW.original_calculation_id,
        'adjustment_calculation_id', NEW.adjustment_calculation_id,
        'late_submission_id', NEW.late_submission_id,
        'late_review_event_id', NEW.late_review_event_id,
        'delta_minor', NEW.delta_minor::text,
        'treatment', NEW.treatment
      )::text,
      'sha256'
    ),
    'hex'
  );
  IF adjustment_row.id IS NULL
    OR ROW(
      NEW.organization_id, NEW.account_id, NEW.original_calculation_id,
      NEW.late_submission_id, NEW.late_review_event_id, NEW.delta_minor,
      NEW.treatment
    ) IS DISTINCT FROM ROW(
      adjustment_row.organization_id, adjustment_row.account_id,
      adjustment_row.original_calculation_id,
      adjustment_row.late_submission_id,
      adjustment_row.late_review_event_id, adjustment_row.delta_minor,
      adjustment_row.treatment
    )
    OR NEW.relationship_hash IS DISTINCT FROM expected_hash
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BILLING_ADJUSTMENT_LINK_INVALID';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE FUNCTION private.billing_adjustment_exception_freeze()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  adjustment_row public.billing_adjustment_calculations%ROWTYPE;
BEGIN
  SELECT adjustment.* INTO adjustment_row
  FROM public.billing_adjustment_calculations AS adjustment
  WHERE adjustment.id = NEW.adjustment_calculation_id;
  IF adjustment_row.id IS NULL
    OR adjustment_row.status <> 'held'
    OR adjustment_row.treatment <> 'held'
    OR ROW(NEW.organization_id, NEW.account_id)
      IS DISTINCT FROM ROW(
        adjustment_row.organization_id, adjustment_row.account_id
      )
    OR NEW.amount_at_risk_minor IS DISTINCT FROM
      pg_catalog.abs(adjustment_row.delta_minor)
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'BILLING_ADJUSTMENT_EXCEPTION_INVALID';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER billing_adjustment_calculations_freeze
BEFORE INSERT ON public.billing_adjustment_calculations
FOR EACH ROW EXECUTE FUNCTION private.billing_adjustment_calculation_freeze();
CREATE TRIGGER billing_adjustment_calculations_immutable
BEFORE UPDATE OR DELETE ON public.billing_adjustment_calculations
FOR EACH ROW EXECUTE FUNCTION private.billing_calculation_fact_immutable();
CREATE TRIGGER billing_calculation_links_freeze
BEFORE INSERT ON public.billing_calculation_links
FOR EACH ROW EXECUTE FUNCTION private.billing_calculation_link_freeze();
CREATE TRIGGER billing_calculation_links_immutable
BEFORE UPDATE OR DELETE ON public.billing_calculation_links
FOR EACH ROW EXECUTE FUNCTION private.billing_calculation_fact_immutable();
CREATE TRIGGER billing_adjustment_exceptions_freeze
BEFORE INSERT ON public.billing_adjustment_exceptions
FOR EACH ROW EXECUTE FUNCTION private.billing_adjustment_exception_freeze();
CREATE TRIGGER billing_adjustment_exceptions_immutable
BEFORE UPDATE OR DELETE ON public.billing_adjustment_exceptions
FOR EACH ROW EXECUTE FUNCTION private.billing_calculation_fact_immutable();

CREATE FUNCTION public.create_billing_adjustment_calculation(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  request_keys text[];
  account_id_value uuid;
  original_calculation_id_value uuid;
  late_submission_id_value uuid;
  late_review_event_id_value bigint;
  request_fingerprint_value text;
  business_key_value text;
  actor_role_value text;
  original_row public.billing_calculations%ROWTYPE;
  original_snapshot public.billing_calculation_snapshots%ROWTYPE;
  original_approval public.billing_calculation_events%ROWTYPE;
  close_row public.billing_revenue_close_snapshots%ROWTYPE;
  version_row public.billing_agreement_versions%ROWTYPE;
  rule_row public.billing_agreement_revenue_rules%ROWTYPE;
  late_submission public.billing_revenue_submissions%ROWTYPE;
  late_review public.billing_revenue_review_events%ROWTYPE;
  existing_adjustment public.billing_adjustment_calculations%ROWTYPE;
  adjustment_row public.billing_adjustment_calculations%ROWTYPE;
  adjustment_id_value uuid;
  evidence_snapshot_value jsonb;
  evidence_fingerprint_value text;
  invalid_evidence_count bigint;
  formula_input jsonb;
  formula_result jsonb;
  actual_amount_value bigint;
  delta_value bigint;
  treatment_value text;
  status_value text;
  snapshot_value jsonb;
  snapshot_hash_value text;
  explanation_value jsonb;
  explanation_hash_value text;
  response_value jsonb;
  relationship_hash_value text;
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
  IF request_keys IS DISTINCT FROM ARRAY[
      'account_id', 'command_key', 'late_review_event_id',
      'late_submission_id', 'original_calculation_id', 'reason'
    ]::text[]
    OR EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_each(p_request) AS entry(key, value)
      WHERE pg_catalog.jsonb_typeof(entry.value) IS DISTINCT FROM 'string'
    )
    OR p_request->>'command_key' !~
      '^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$'
    OR NULLIF(pg_catalog.btrim(p_request->>'reason'), '') IS NULL
    OR pg_catalog.octet_length(p_request->>'reason') > 1000
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023', MESSAGE = 'CALCULATION_ADJUSTMENT_INVALID_REQUEST';
  END IF;
  BEGIN
    account_id_value := (p_request->>'account_id')::uuid;
    original_calculation_id_value :=
      (p_request->>'original_calculation_id')::uuid;
    late_submission_id_value := (p_request->>'late_submission_id')::uuid;
    late_review_event_id_value := (p_request->>'late_review_event_id')::bigint;
  EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023', MESSAGE = 'CALCULATION_ADJUSTMENT_INVALID_REQUEST';
  END;
  request_fingerprint_value := private.billing_calculation_fingerprint(
    'calculation.adjust', p_request
  );

  SELECT calculation.* INTO original_row
  FROM public.billing_calculations AS calculation
  WHERE calculation.id = original_calculation_id_value
    AND calculation.account_id = account_id_value;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'CALCULATION_NOT_AUTHORIZED';
  END IF;
  actor_role_value := private.billing_calculation_human_role(
    original_row.organization_id, original_row.account_id,
    'calculation.approve'
  );
  IF actor_role_value IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'CALCULATION_NOT_AUTHORIZED';
  END IF;

  business_key_value := pg_catalog.encode(
    extensions.digest(
      pg_catalog.jsonb_build_object(
        'kind', 'late_evidence_adjustment',
        'original_calculation_id', original_row.id,
        'late_submission_id', late_submission_id_value
      )::text,
      'sha256'
    ),
    'hex'
  );
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      original_row.organization_id::text || ':' || original_row.account_id::text
        || ':' || original_row.id::text,
      0
    )
  );

  SELECT adjustment.* INTO existing_adjustment
  FROM public.billing_adjustment_calculations AS adjustment
  WHERE adjustment.created_by = (SELECT auth.uid())
    AND adjustment.command_key = p_request->>'command_key';
  IF FOUND THEN
    IF existing_adjustment.request_fingerprint = request_fingerprint_value THEN
      RETURN existing_adjustment.response_snapshot;
    END IF;
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'CALCULATION_ADJUSTMENT_IDEMPOTENCY_CONFLICT';
  END IF;

  SELECT adjustment.* INTO existing_adjustment
  FROM public.billing_adjustment_calculations AS adjustment
  WHERE adjustment.organization_id = original_row.organization_id
    AND adjustment.account_id = original_row.account_id
    AND adjustment.business_key = business_key_value;
  IF FOUND THEN
    IF existing_adjustment.request_fingerprint = request_fingerprint_value THEN
      RETURN existing_adjustment.response_snapshot;
    END IF;
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'CALCULATION_ADJUSTMENT_BUSINESS_CONFLICT';
  END IF;

  PERFORM private.billing_validate_calculation_lineage(original_row.id, true);
  SELECT snapshot.* INTO original_snapshot
  FROM public.billing_calculation_snapshots AS snapshot
  WHERE snapshot.calculation_id = original_row.id;
  SELECT event.* INTO original_approval
  FROM public.billing_calculation_events AS event
  WHERE event.calculation_id = original_row.id
    AND event.event_type = 'approved';
  SELECT close_snapshot.* INTO close_row
  FROM public.billing_revenue_close_snapshots AS close_snapshot
  WHERE close_snapshot.id = original_row.close_snapshot_id;
  SELECT version.* INTO version_row
  FROM public.billing_agreement_versions AS version
  WHERE version.id = original_row.agreement_version_id;
  SELECT rule.* INTO rule_row
  FROM public.billing_agreement_revenue_rules AS rule
  WHERE rule.agreement_version_id = original_row.agreement_version_id;
  SELECT submission.* INTO late_submission
  FROM public.billing_revenue_submissions AS submission
  WHERE submission.id = late_submission_id_value;
  SELECT review.* INTO late_review
  FROM public.billing_revenue_review_events AS review
  WHERE review.id = late_review_event_id_value;

  IF close_row.close_mode <> 'minimum_only'
    OR close_row.exception_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.billing_close_exceptions AS exception
      WHERE exception.id = close_row.exception_id
        AND exception.organization_id = original_row.organization_id
        AND exception.account_id = original_row.account_id
        AND exception.period_id = original_row.period_id
        AND exception.reason_code = 'MISSING_EVIDENCE'
        AND exception.status = 'open'
    )
    OR late_submission.id IS NULL OR late_review.id IS NULL
    OR ROW(
      late_submission.organization_id, late_submission.account_id,
      late_submission.period_id
    ) IS DISTINCT FROM ROW(
      original_row.organization_id, original_row.account_id,
      original_row.period_id
    )
    OR ROW(
      late_review.organization_id, late_review.account_id, late_review.period_id,
      late_review.submission_id
    ) IS DISTINCT FROM ROW(
      original_row.organization_id, original_row.account_id,
      original_row.period_id, late_submission.id
    )
    OR late_submission.submitted_at <= close_row.closed_at
    OR late_review.created_at <= close_row.closed_at
    OR late_review.created_at < late_submission.submitted_at
    OR late_review.outcome <> 'accept'
    OR late_review.reason_code <> 'REVENUE_ACCEPTED'
    OR late_review.review_policy_version <> 'revenue-review-v1'
    OR late_review.input_fingerprint IS DISTINCT FROM late_submission.request_fingerprint
    OR version_row.id IS NULL OR rule_row.agreement_version_id IS NULL
    OR original_row.terms_fingerprint IS DISTINCT FROM version_row.terms_fingerprint
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'CALCULATION_ADJUSTMENT_LINEAGE_INVALID';
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
        OR evidence.inspection_status <> 'clean'
        OR evidence.lifecycle_status <> 'active'
        OR evidence.retention_expires_at <= pg_catalog.now()
        OR (evidence.hold_started_at IS NOT NULL
          AND evidence.hold_released_at IS NULL)
    )
  INTO evidence_snapshot_value, invalid_evidence_count
  FROM public.billing_revenue_submission_evidence AS link
  LEFT JOIN public.billing_evidence_objects AS evidence
    ON evidence.id = link.evidence_id
    AND evidence.organization_id = link.organization_id
    AND evidence.account_id = link.account_id
  WHERE link.submission_id = late_submission.id;
  evidence_fingerprint_value :=
    private.billing_revenue_evidence_fingerprint(late_submission.id);
  IF pg_catalog.jsonb_array_length(evidence_snapshot_value) = 0
    OR invalid_evidence_count <> 0
    OR late_review.evidence_fingerprint IS DISTINCT FROM evidence_fingerprint_value
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'CALCULATION_ADJUSTMENT_EVIDENCE_STALE';
  END IF;

  formula_input := pg_catalog.jsonb_build_object(
    'formula_kind', version_row.formula_kind,
    'commissionable_amount', pg_catalog.jsonb_build_object(
      'amount_minor', late_submission.commissionable_amount_minor::text,
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
  -- A hybrid minimum-only close freezes the minimum candidate. Its late
  -- evidence adjustment reconciles the independently exact percentage
  -- candidate against that frozen minimum; the agreement's true-up policy
  -- then decides whether a negative candidate may become a credit.
  actual_amount_value := CASE WHEN version_row.formula_kind = 'hybrid'
    THEN (formula_result->>'percentage_candidate_minor')::bigint
    ELSE (formula_result->>'final_amount_minor')::bigint
  END;
  delta_value := actual_amount_value - original_row.result_amount_minor;
  treatment_value := CASE
    WHEN delta_value > 0 THEN 'true_up'
    WHEN delta_value = 0 THEN 'no_adjustment'
    WHEN rule_row.true_up_policy = 'credit_candidate' THEN 'credit_candidate'
    ELSE 'held'
  END;
  status_value := CASE
    WHEN treatment_value = 'held' THEN 'held'
    WHEN treatment_value = 'no_adjustment' THEN 'no_adjustment'
    ELSE 'approved'
  END;

  explanation_value := pg_catalog.jsonb_build_object(
    'explanation_version', version_row.explanation_version,
    'kind', 'late_evidence_adjustment',
    'original_amount_minor', original_row.result_amount_minor::text,
    'actual_amount_minor', actual_amount_value::text,
    'delta_minor', delta_value::text,
    'treatment', treatment_value,
    'currency', version_row.currency
  );
  explanation_hash_value := pg_catalog.encode(
    extensions.digest(explanation_value::text, 'sha256'), 'hex'
  );
  snapshot_value := pg_catalog.jsonb_build_object(
    'snapshot_version', 'billing-adjustment-snapshot-v1',
    'lineage', pg_catalog.jsonb_build_object(
      'original_calculation_id', original_row.id,
      'original_close_snapshot_id', close_row.id,
      'original_approval_event_id', original_approval.id,
      'late_submission_id', late_submission.id,
      'late_review_event_id', late_review.id
    ),
    'original', pg_catalog.jsonb_build_object(
      'snapshot_hash', original_snapshot.snapshot_hash,
      'terms_fingerprint', original_row.terms_fingerprint,
      'amount_minor', original_row.result_amount_minor::text
    ),
    'late_evidence', pg_catalog.jsonb_build_object(
      'input_fingerprint', late_submission.request_fingerprint,
      'evidence_fingerprint', evidence_fingerprint_value,
      'evidence', evidence_snapshot_value,
      'gross_amount_minor', late_submission.gross_amount_minor::text,
      'excluded_amount_minor', late_submission.excluded_amount_minor::text,
      'commissionable_amount_minor',
        late_submission.commissionable_amount_minor::text
    ),
    'formula', formula_result,
    'reconciliation', pg_catalog.jsonb_build_object(
      'original_amount_minor', original_row.result_amount_minor::text,
      'actual_amount_minor', actual_amount_value::text,
      'delta_minor', delta_value::text,
      'true_up_policy', rule_row.true_up_policy,
      'treatment', treatment_value,
      'status', status_value
    ),
    'policies', pg_catalog.jsonb_build_object(
      'currency_policy_version', version_row.currency_policy_version,
      'rate_policy_version', version_row.rate_policy_version,
      'rounding_policy_version', version_row.rounding_policy_version,
      'formula_version', version_row.formula_version,
      'close_policy_version', original_row.close_policy_version,
      'explanation_version', version_row.explanation_version
    )
  );
  snapshot_hash_value := pg_catalog.encode(
    extensions.digest(snapshot_value::text, 'sha256'), 'hex'
  );

  adjustment_id_value := gen_random_uuid();
  relationship_hash_value := pg_catalog.encode(
    extensions.digest(
      pg_catalog.jsonb_build_object(
        'original_calculation_id', original_row.id,
        'adjustment_calculation_id', adjustment_id_value,
        'late_submission_id', late_submission.id,
        'late_review_event_id', late_review.id,
        'delta_minor', delta_value::text,
        'treatment', treatment_value
      )::text,
      'sha256'
    ),
    'hex'
  );
  response_value := pg_catalog.jsonb_build_object(
    'result', status_value,
    'adjustment_calculation_id', adjustment_id_value,
    'original_calculation_id', original_row.id,
    'late_submission_id', late_submission.id,
    'original_amount_minor', original_row.result_amount_minor::text,
    'actual_amount_minor', actual_amount_value::text,
    'delta_minor', delta_value::text,
    'treatment', treatment_value,
    'currency', version_row.currency,
    'snapshot_hash', snapshot_hash_value,
    'relationship_hash', relationship_hash_value
  );

  INSERT INTO public.billing_adjustment_calculations (
    id, organization_id, account_id, original_calculation_id, agreement_id,
    agreement_version_id, period_id, original_close_snapshot_id,
    late_submission_id, late_review_event_id, original_approval_event_id,
    business_key, request_fingerprint, terms_fingerprint,
    original_snapshot_hash, late_input_fingerprint,
    late_evidence_fingerprint, late_evidence_snapshot, formula_kind,
    calculation_base_minor, minimum_amount_minor, rate_numerator,
    rate_denominator, submitted_percentage, intermediate_numerator,
    intermediate_denominator, minimum_candidate_minor,
    percentage_candidate_minor, selected_branch, original_amount_minor,
    actual_amount_minor, delta_minor, true_up_policy, treatment, status,
    currency, currency_policy_version, rate_policy_version,
    rounding_policy_version, formula_version, close_policy_version,
    explanation_version, snapshot_payload, snapshot_hash,
    explanation_payload, explanation_hash, response_snapshot,
    created_by, created_by_role, reason, command_key
  ) VALUES (
    adjustment_id_value, original_row.organization_id,
    original_row.account_id, original_row.id,
    original_row.agreement_id, original_row.agreement_version_id,
    original_row.period_id, close_row.id, late_submission.id, late_review.id,
    original_approval.id, business_key_value, request_fingerprint_value,
    original_row.terms_fingerprint, original_snapshot.snapshot_hash,
    late_submission.request_fingerprint, evidence_fingerprint_value,
    evidence_snapshot_value, version_row.formula_kind,
    late_submission.commissionable_amount_minor,
    version_row.minimum_amount_minor, version_row.rate_numerator,
    version_row.rate_denominator, version_row.submitted_percentage,
    (formula_result->>'intermediate_numerator')::numeric,
    (formula_result->>'intermediate_denominator')::bigint,
    (formula_result->>'minimum_candidate_minor')::bigint,
    (formula_result->>'percentage_candidate_minor')::bigint,
    formula_result->>'selected_branch', original_row.result_amount_minor,
    actual_amount_value, delta_value, rule_row.true_up_policy,
    treatment_value, status_value, version_row.currency,
    version_row.currency_policy_version, version_row.rate_policy_version,
    version_row.rounding_policy_version, version_row.formula_version,
    original_row.close_policy_version, version_row.explanation_version,
    snapshot_value, snapshot_hash_value, explanation_value,
    explanation_hash_value, response_value, (SELECT auth.uid()),
    actor_role_value, pg_catalog.btrim(p_request->>'reason'),
    p_request->>'command_key'
  ) RETURNING * INTO adjustment_row;

  INSERT INTO public.billing_calculation_links (
    organization_id, account_id, original_calculation_id,
    adjustment_calculation_id, late_submission_id, late_review_event_id,
    link_type, delta_minor, treatment, relationship_hash
  ) VALUES (
    original_row.organization_id, original_row.account_id, original_row.id,
    adjustment_row.id, late_submission.id, late_review.id, 'late_evidence',
    delta_value, treatment_value, relationship_hash_value
  );

  IF treatment_value = 'held' THEN
    INSERT INTO public.billing_adjustment_exceptions (
      organization_id, account_id, adjustment_calculation_id,
      reason_code, amount_at_risk_minor, currency, owner_id,
      next_action, status
    ) VALUES (
      original_row.organization_id, original_row.account_id,
      adjustment_row.id, 'CONTRACT_REVIEW_REQUIRED',
      pg_catalog.abs(delta_value), version_row.currency, (SELECT auth.uid()),
      'Review the original agreement before authorizing negative treatment',
      'held'
    );
  END IF;

  RETURN response_value;
END;
$function$;

ALTER TABLE public.billing_adjustment_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_adjustment_calculations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.billing_calculation_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_calculation_links FORCE ROW LEVEL SECURITY;
ALTER TABLE public.billing_adjustment_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_adjustment_exceptions FORCE ROW LEVEL SECURITY;

CREATE POLICY billing_adjustment_calculations_select
ON public.billing_adjustment_calculations
FOR SELECT TO authenticated
USING (private.billing_has_capability(
  organization_id, account_id, 'calculation.read'
));
CREATE POLICY billing_calculation_links_select
ON public.billing_calculation_links
FOR SELECT TO authenticated
USING (private.billing_has_capability(
  organization_id, account_id, 'calculation.read'
));
CREATE POLICY billing_adjustment_exceptions_select
ON public.billing_adjustment_exceptions
FOR SELECT TO authenticated
USING (private.billing_has_capability(
  organization_id, account_id, 'calculation.read'
));

REVOKE ALL ON TABLE public.billing_adjustment_calculations,
  public.billing_calculation_links,
  public.billing_adjustment_exceptions
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.billing_adjustment_calculations,
  public.billing_calculation_links,
  public.billing_adjustment_exceptions
  TO authenticated;
GRANT ALL ON TABLE public.billing_adjustment_calculations,
  public.billing_calculation_links,
  public.billing_adjustment_exceptions
  TO service_role;

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
ALTER FUNCTION public.create_billing_adjustment_calculation(jsonb)
  OWNER TO postgres;
ALTER FUNCTION private.billing_adjustment_calculation_freeze()
  OWNER TO postgres;
ALTER FUNCTION private.billing_calculation_link_freeze()
  OWNER TO postgres;
ALTER FUNCTION private.billing_adjustment_exception_freeze()
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
REVOKE ALL ON FUNCTION public.create_billing_adjustment_calculation(jsonb)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.billing_adjustment_calculation_freeze()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_calculation_link_freeze()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.billing_adjustment_exception_freeze()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.read_billing_calculation_lineage(jsonb)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_billing_adjustment_calculation(jsonb)
  TO authenticated;

COMMIT;
