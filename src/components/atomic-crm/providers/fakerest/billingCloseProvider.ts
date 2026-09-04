import type {
  BillingAdjustmentCalculation,
  BillingAgreementVersion,
  BillingCalculation,
  BillingCalculationLineage,
  BillingCloseException,
  BillingRevenueCloseSnapshot,
  BillingRevenuePeriod,
  BillingRevenueReview,
  BillingRevenueSubmission,
} from "../../types";
import {
  calculateBillingFormula,
  classifyBillingAdjustment,
} from "../../financial/billingCalculationFixtures";
import {
  parseOrdinaryPercentageRate,
  parseUsdMoney,
} from "../../financial/exactMoney";
import type {
  BillingAgreementCommandResponse,
  BillingAgreementDraftRequest,
  BillingAgreementLifecycleRequest,
  BillingAgreementListRequest,
  BillingAgreementListResult,
  BillingCalculationAdjustmentRequest,
  BillingCalculationAdjustmentResponse,
  BillingCalculationApproveRequest,
  BillingCalculationApproveResponse,
  BillingCalculationCreateRequest,
  BillingCalculationCreateResponse,
  BillingCalculationLineageRequest,
  BillingCalculationListRequest,
  BillingCalculationListResult,
  BillingCalculationPreview,
  BillingCalculationPreviewRequest,
  BillingRevenueCloseRequest,
  BillingRevenueCloseResponse,
  BillingRevenuePeriodEnsureRequest,
  BillingRevenuePeriodEnsureResponse,
  BillingRevenuePeriodListRequest,
  BillingRevenuePeriodListResult,
  BillingRevenuePeriodSummary,
  BillingRevenueReviewRequest,
  BillingRevenueReviewResponse,
  BillingRevenueSubmissionRequest,
  BillingRevenueSubmissionResponse,
} from "../types";
import { BillingCloseProviderError } from "../supabase/billingCloseProvider";
import {
  DEMO_BILLING_CLOSE_SCENARIOS,
  DEMO_EVIDENCE_NOW,
  type DemoBillingCloseScenario,
} from "./dataGenerator/billingAccounts";

const ALL_CAPABILITIES = Object.freeze([
  "agreement.read",
  "agreement.manage",
  "agreement.approve",
  "revenue.read",
  "revenue.manage",
  "revenue.review",
  "calculation.read",
  "calculation.calculate",
  "calculation.approve",
]);

type AgreementRecord = {
  account_id: string;
  version: BillingAgreementVersion;
};

type CommandReceipt = {
  operation: string;
  request_fingerprint: string;
  response: unknown;
};

type FakeBillingCloseState = {
  agreements: AgreementRecord[];
  periods: BillingRevenuePeriodSummary[];
  calculations: BillingCalculation[];
  lineages: BillingCalculationLineage[];
  adjustments: BillingAdjustmentCalculation[];
  receipts: Map<string, CommandReceipt>;
  next_uuid: number;
  next_event_id: number;
};

export type FakeBillingCloseProviderOptions = Readonly<{
  capabilities?: readonly string[];
}>;

const money = (amountMinor: string) =>
  parseUsdMoney({ amount_minor: amountMinor, currency: "USD" });

function fail(code: string): never {
  throw new BillingCloseProviderError(code);
}

function deepClone<T>(value: T): T {
  if (Array.isArray(value)) return value.map(deepClone) as T;
  if (value instanceof Map) return new Map(value) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, deepClone(nested)]),
    ) as T;
  }
  return value;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

function copy<T>(value: T): T {
  return deepFreeze(deepClone(value));
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalize(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function syntheticHash(value: unknown) {
  const mask = (1n << 256n) - 1n;
  let hash =
    0x6c62272e07bb014262b821756295c58d6c62272e07bb014262b821756295c58dn;
  for (const character of canonicalize(value)) {
    hash ^= BigInt(character.codePointAt(0) ?? 0);
    hash = (hash * 0x100000001b3n) & mask;
  }
  return hash.toString(16).padStart(64, "0");
}

function nextUuid(state: FakeBillingCloseState) {
  const suffix = String(state.next_uuid++).padStart(12, "0");
  return `45000000-0000-4000-8000-${suffix}`;
}

function nextEventId(state: FakeBillingCloseState) {
  return String(state.next_event_id++);
}

function accountAgreement(
  state: FakeBillingCloseState,
  accountId: string,
  versionId?: string,
) {
  return state.agreements.find(
    (record) =>
      record.account_id === accountId &&
      (versionId === undefined || record.version.version_id === versionId),
  );
}

function findPeriod(
  state: FakeBillingCloseState,
  accountId: string,
  periodId: string,
) {
  return state.periods.find(
    (summary) =>
      summary.period.account_id === accountId && summary.period.id === periodId,
  );
}

function findClose(
  state: FakeBillingCloseState,
  accountId: string,
  closeSnapshotId: string,
) {
  const summary = state.periods.find(
    (candidate) =>
      candidate.period.account_id === accountId &&
      candidate.close_snapshot?.id === closeSnapshotId,
  );
  return summary?.close_snapshot
    ? { summary, close: summary.close_snapshot }
    : null;
}

function scenarioForAccount(accountId: string) {
  return Object.values(DEMO_BILLING_CLOSE_SCENARIOS).find(
    (scenario) => scenario.account_id === accountId,
  );
}

function scenarioRate(scenario: DemoBillingCloseScenario) {
  return scenario.rate_numerator === null ||
    scenario.rate_denominator === null ||
    scenario.submitted_percentage === null
    ? null
    : parseOrdinaryPercentageRate({
        kind: "ordinary_percentage",
        numerator: scenario.rate_numerator,
        denominator: scenario.rate_denominator,
        submitted_percentage: scenario.submitted_percentage,
        rate_policy_version: "ordinary-percentage-v1",
      });
}

function seedAgreement(scenario: DemoBillingCloseScenario): AgreementRecord {
  return {
    account_id: scenario.account_id,
    version: {
      agreement_id: scenario.agreement_id,
      version_id: scenario.agreement_version_id,
      agreement_family: "primary",
      cadence: "monthly",
      state: "active",
      latest_event: "activated",
      version_number: 1,
      effective_start: "2026-09-01",
      effective_end: "2027-09-01",
      formula_kind: scenario.formula_kind,
      fixed_amount:
        scenario.fixed_amount_minor === null
          ? null
          : money(scenario.fixed_amount_minor),
      minimum_amount:
        scenario.minimum_amount_minor === null
          ? null
          : money(scenario.minimum_amount_minor),
      rate: scenarioRate(scenario),
      currency_policy_version: "usd-v1",
      rate_policy_version: "ordinary-percentage-v1",
      rounding_policy_version: "half-away-from-zero-v1",
      formula_version: "billing-agreement-formula-v1",
      explanation_version: "billing-agreement-explanation-v1",
      signed_evidence_id: scenario.evidence_id,
      signed_evidence_sha256: syntheticHash(scenario.evidence_id),
      terms_fingerprint: syntheticHash({
        agreement_id: scenario.agreement_id,
        formula_kind: scenario.formula_kind,
      }),
      self_approved: false,
      rules: {
        timezone: "America/Chicago",
        timing_basis: "cash",
        included_amounts: ["service_revenue"],
        excluded_amounts: ["sales_tax"],
        tax_treatment: "exclude",
        refund_chargeback_policy: "next_period_adjustment",
        cutoff_day: 10,
        dispute_policy: "hold_close",
        missing_report_policy: scenario.missing_report_policy,
        true_up_policy: scenario.true_up_policy,
        evidence_priority: ["api", "statement", "portal"],
      },
    },
  };
}

function seedPeriod(
  scenario: DemoBillingCloseScenario,
): BillingRevenuePeriodSummary {
  const period: BillingRevenuePeriod = {
    id: scenario.period_id,
    organization_id: scenario.organization_id,
    account_id: scenario.account_id,
    agreement_id: scenario.agreement_id,
    agreement_version_id: scenario.agreement_version_id,
    period_start: "2026-09-01",
    period_end: "2026-10-01",
    timezone: "America/Chicago",
    submission_deadline_at: "2026-10-10T05:00:00.000Z",
    state: scenario === DEMO_BILLING_CLOSE_SCENARIOS.hybrid ? "open" : "closed",
    created_at: DEMO_EVIDENCE_NOW,
  };
  if (scenario === DEMO_BILLING_CLOSE_SCENARIOS.hybrid) {
    return {
      period,
      submissions: [],
      reviews: [],
      exceptions: [],
      close_snapshot: null,
    };
  }

  const isMinimumOnly = scenario.open_exception;
  const submission: BillingRevenueSubmission | null = isMinimumOnly
    ? null
    : {
        id: `31000000-0000-4000-8000-000000007${scenario.account_id.slice(-3)}`,
        organization_id: scenario.organization_id,
        account_id: scenario.account_id,
        period_id: scenario.period_id,
        revision_number: 1,
        previous_submission_id: null,
        gross_amount: money(scenario.commissionable_amount_minor),
        excluded_amount: money("0"),
        commissionable_amount: money(scenario.commissionable_amount_minor),
        provenance_kind: "statement",
        provenance_source_id: `statement-${scenario.account_id.slice(-3)}`,
        submitter_id: "31000000-0000-4000-8000-000000000001",
        submitter_role: "operator",
        attestation_text: "Synthetic demo attestation",
        request_fingerprint: syntheticHash(scenario),
        submitted_at: DEMO_EVIDENCE_NOW,
        evidence: [
          {
            evidence_id: scenario.evidence_id,
            captured_sha256: syntheticHash(scenario.evidence_id),
            ordinal: 1,
          },
        ],
      };
  const review: BillingRevenueReview = {
    id: isMinimumOnly ? "6230" : `6${scenario.account_id.slice(-3)}`,
    period_id: scenario.period_id,
    submission_id: submission?.id ?? null,
    outcome: isMinimumOnly ? "hold" : "accept",
    reason_code: isMinimumOnly ? "MISSING_EVIDENCE" : "REVENUE_ACCEPTED",
    reviewer_id: "31000000-0000-4000-8000-000000000001",
    reviewer_role: "reviewer",
    reason: "Synthetic demo review",
    input_fingerprint: syntheticHash({ scenario, kind: "review" }),
    evidence_fingerprint: syntheticHash({ scenario, kind: "evidence" }),
    review_policy_version: "revenue-review-v1",
    created_at: DEMO_EVIDENCE_NOW,
  };
  const exception: BillingCloseException | null = isMinimumOnly
    ? {
        id: "31000000-0000-4000-8000-000000008230",
        period_id: scenario.period_id,
        submission_id: null,
        reason_code: "MISSING_EVIDENCE",
        amount_at_risk: money("50000"),
        owner_id: "31000000-0000-4000-8000-000000000001",
        next_action: "Collect the missing revenue statement",
        due_at: "2026-10-20T00:00:00.000Z",
        status: "open",
        caused_by_review_event_id: review.id,
        opened_at: DEMO_EVIDENCE_NOW,
        resolved_at: null,
        resolution_reason: null,
      }
    : null;
  const close: BillingRevenueCloseSnapshot = {
    id: scenario.close_snapshot_id,
    period_id: scenario.period_id,
    agreement_id: scenario.agreement_id,
    agreement_version_id: scenario.agreement_version_id,
    close_mode: isMinimumOnly ? "minimum_only" : "accepted_evidence",
    submission_id: submission?.id ?? null,
    review_event_id: review.id,
    exception_id: exception?.id ?? null,
    gross_amount: submission?.gross_amount ?? null,
    excluded_amount: submission?.excluded_amount ?? null,
    commissionable_amount: submission?.commissionable_amount ?? null,
    provenance_kind: submission?.provenance_kind ?? null,
    provenance_source_id: submission?.provenance_source_id ?? null,
    evidence: submission?.evidence ?? [],
    agreement_fingerprint: syntheticHash({ scenario, kind: "agreement" }),
    input_fingerprint: review.input_fingerprint,
    evidence_fingerprint: review.evidence_fingerprint,
    close_input_fingerprint: syntheticHash({ scenario, kind: "close" }),
    review_policy_version: "revenue-review-v1",
    close_policy_version: "revenue-close-v1",
    closed_at: DEMO_EVIDENCE_NOW,
  };
  return {
    period,
    submissions: submission ? [submission] : [],
    reviews: [review],
    exceptions: exception ? [exception] : [],
    close_snapshot: close,
  };
}

function createSeedState(): FakeBillingCloseState {
  const scenarios = Object.values(DEMO_BILLING_CLOSE_SCENARIOS);
  return {
    agreements: scenarios.map(seedAgreement),
    periods: scenarios.map(seedPeriod),
    calculations: [],
    lineages: [],
    adjustments: [],
    receipts: new Map(),
    next_uuid: 900001,
    next_event_id: 9001,
  };
}

function ensurePage(page: number, perPage: number) {
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(perPage) ||
    perPage < 1 ||
    perPage > 100
  ) {
    fail("BILLING_CLOSE_INVALID_REQUEST");
  }
}

function monthBounds(periodMonth: string) {
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(periodMonth)) {
    fail("REVENUE_INVALID_REQUEST");
  }
  const start = `${periodMonth}-01`;
  const date = new Date(`${start}T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return { start, end: date.toISOString().slice(0, 10) };
}

function agreementResponse(
  result: BillingAgreementCommandResponse["result"],
  version: BillingAgreementVersion,
): BillingAgreementCommandResponse {
  if (version.state === "superseded") fail("AGREEMENT_LIFECYCLE_INVALID");
  return copy({
    result,
    agreement_id: version.agreement_id,
    version_id: version.version_id,
    version_number: version.version_number,
    state: version.state,
    self_approved: version.self_approved,
    terms_fingerprint: version.terms_fingerprint,
  });
}

export function createFakeBillingCloseProvider(
  options: FakeBillingCloseProviderOptions = {},
) {
  const state = createSeedState();
  const capabilities = new Set(options.capabilities ?? ALL_CAPABILITIES);
  const cleanEvidenceIds = new Set(
    Object.values(DEMO_BILLING_CLOSE_SCENARIOS).map(
      (scenario) => scenario.evidence_id,
    ),
  );

  const requireCapability = (capability: string, denialCode: string) => {
    if (!capabilities.has(capability)) fail(denialCode);
  };

  const command = async <T>(
    operation: string,
    commandKey: string,
    request: unknown,
    conflictCode: string,
    effect: () => T,
  ): Promise<T> => {
    if (typeof commandKey !== "string" || commandKey.length < 8) {
      fail("BILLING_CLOSE_INVALID_REQUEST");
    }
    const requestFingerprint = syntheticHash(request);
    const receipt = state.receipts.get(commandKey);
    if (receipt) {
      if (
        receipt.operation !== operation ||
        receipt.request_fingerprint !== requestFingerprint
      ) {
        fail(conflictCode);
      }
      return copy(receipt.response as T);
    }
    const response = copy(effect());
    state.receipts.set(commandKey, {
      operation,
      request_fingerprint: requestFingerprint,
      response: copy(response),
    });
    return response;
  };

  const buildPreview = (
    request: BillingCalculationPreviewRequest,
  ): BillingCalculationPreview => {
    const found = findClose(
      state,
      request.account_id,
      request.close_snapshot_id,
    );
    if (!found) fail("CALCULATION_NOT_AUTHORIZED");
    const agreementRecord = accountAgreement(
      state,
      request.account_id,
      found.summary.period.agreement_version_id,
    );
    if (!agreementRecord) fail("CALCULATION_AGREEMENT_STALE");
    const agreement = agreementRecord.version;
    const close = found.close;
    const calculationBase =
      close.close_mode === "minimum_only"
        ? money("0")
        : close.commissionable_amount;
    if (!calculationBase) fail("CALCULATION_INVALID_REQUEST");
    const exact = calculateBillingFormula({
      formula_kind: agreement.formula_kind,
      commissionable_amount: calculationBase,
      fixed_amount: agreement.fixed_amount,
      minimum_amount: agreement.minimum_amount,
      rate: agreement.rate,
      currency_policy_version: agreement.currency_policy_version,
      rounding_policy_version: agreement.rounding_policy_version,
      formula_version: agreement.formula_version,
    });
    const anomalies = found.summary.exceptions
      .filter((exception) => exception.status === "open")
      .map(() => ({
        code: "OPEN_CLOSE_EXCEPTION",
        status: "fail" as const,
        blocking: true,
      }));
    const prior = [...state.calculations]
      .filter(
        (calculation) =>
          calculation.account_id === request.account_id &&
          calculation.status === "approved",
      )
      .at(-1);
    const delta = prior
      ? money(
          (
            BigInt(exact.final_amount_minor) -
            BigInt(prior.final_amount.amount_minor)
          ).toString(),
        )
      : null;
    const previousMinor = prior?.final_amount.amount_minor;
    const comparison =
      !prior || previousMinor === undefined
        ? {
            status: "unavailable" as const,
            previous_calculation_id: null,
            previous_amount: null,
            delta: null,
            delta_rate: null,
          }
        : previousMinor === "0"
          ? {
              status: "zero_baseline" as const,
              previous_calculation_id: prior.id,
              previous_amount: prior.final_amount,
              delta,
              delta_rate: null,
            }
          : {
              status: "available" as const,
              previous_calculation_id: prior.id,
              previous_amount: prior.final_amount,
              delta,
              delta_rate: {
                numerator: delta?.amount_minor ?? "0",
                denominator: (BigInt(previousMinor) < 0n
                  ? -BigInt(previousMinor)
                  : BigInt(previousMinor)
                ).toString(),
              },
            };
    const closePolicyVersion =
      request.close_policy_version ?? "billing-manual-v1";
    const previewCore = {
      result: "preview" as const,
      organization_id: found.summary.period.organization_id,
      account_id: request.account_id,
      agreement_id: agreement.agreement_id,
      agreement_version_id: agreement.version_id,
      period_id: found.summary.period.id,
      period_start: found.summary.period.period_start,
      period_end: found.summary.period.period_end,
      close_snapshot_id: close.id,
      close_mode: close.close_mode,
      gross_amount: close.gross_amount,
      excluded_amount: close.excluded_amount,
      source_commissionable_amount: close.commissionable_amount,
      calculation_base: calculationBase,
      provenance_kind:
        close.close_mode === "minimum_only"
          ? ("minimum_only" as const)
          : (close.provenance_kind ?? fail("CALCULATION_INVALID_REQUEST")),
      provenance_source_id: close.provenance_source_id,
      evidence_fingerprint: close.evidence_fingerprint,
      close_input_fingerprint: close.close_input_fingerprint,
      terms_fingerprint: agreement.terms_fingerprint,
      formula_kind: agreement.formula_kind,
      fixed_amount: agreement.fixed_amount,
      minimum_amount: agreement.minimum_amount,
      rate: agreement.rate,
      intermediate_numerator: exact.intermediate_numerator,
      intermediate_denominator: exact.intermediate_denominator,
      fixed_candidate:
        exact.fixed_candidate_minor === null
          ? null
          : money(exact.fixed_candidate_minor),
      minimum_candidate:
        exact.minimum_candidate_minor === null
          ? null
          : money(exact.minimum_candidate_minor),
      percentage_candidate:
        exact.percentage_candidate_minor === null
          ? null
          : money(exact.percentage_candidate_minor),
      selected_branch: exact.selected_branch,
      final_amount: money(exact.final_amount_minor),
      currency_policy_version: "usd-v1" as const,
      rate_policy_version: "ordinary-percentage-v1" as const,
      rounding_policy_version: "half-away-from-zero-v1" as const,
      formula_version: "billing-agreement-formula-v1" as const,
      revenue_close_policy_version: "revenue-close-v1" as const,
      close_policy_version: closePolicyVersion,
      explanation_version: "billing-agreement-explanation-v1" as const,
      close_policy: {
        mode:
          closePolicyVersion === "billing-auto-v1"
            ? ("auto" as const)
            : ("manual" as const),
        active: true,
        allowed_account_statuses: ["active" as const],
        allowed_formula_kinds: [agreement.formula_kind],
        allowed_close_modes: [close.close_mode],
        allowed_provenance_kinds: [
          close.close_mode === "minimum_only"
            ? ("minimum_only" as const)
            : (close.provenance_kind ?? "statement"),
        ],
        require_zero_anomalies: true,
        minimum_result: money("0"),
        maximum_result: null,
        effective_from: "2026-09-01T00:00:00.000Z",
        effective_until: null,
      },
      anomalies,
      comparison,
      explanation: {
        kind: agreement.formula_kind,
        selected_branch: exact.selected_branch,
        final_amount: money(exact.final_amount_minor),
      },
    };
    return copy({
      ...previewCore,
      preview_fingerprint: syntheticHash(previewCore),
    });
  };

  const provider = {
    inspectBillingCloseState() {
      return copy({
        agreements: state.agreements,
        periods: state.periods,
        calculations: state.calculations,
        lineages: state.lineages,
        adjustments: state.adjustments,
        receipts: [...state.receipts.entries()].sort(([left], [right]) =>
          left.localeCompare(right),
        ),
        next_uuid: state.next_uuid,
        next_event_id: state.next_event_id,
      });
    },

    async listBillingAgreements(
      request: BillingAgreementListRequest,
    ): Promise<BillingAgreementListResult> {
      requireCapability("agreement.read", "AGREEMENT_READ_NOT_AUTHORIZED");
      return copy({
        data: state.agreements
          .filter((record) => record.account_id === request.account_id)
          .map((record) => record.version),
      });
    },

    async saveBillingAgreementDraft(
      request: BillingAgreementDraftRequest,
    ): Promise<BillingAgreementCommandResponse> {
      requireCapability("agreement.manage", "AGREEMENT_NOT_AUTHORIZED");
      return command(
        "saveBillingAgreementDraft",
        request.command_key,
        request,
        "AGREEMENT_IDEMPOTENCY_CONFLICT",
        () => {
          const existing = request.version_id
            ? state.agreements.find(
                (record) =>
                  record.account_id === request.account_id &&
                  record.version.version_id === request.version_id,
              )
            : undefined;
          if (existing && existing.version.state !== "draft") {
            fail("AGREEMENT_LIFECYCLE_INVALID");
          }
          const agreementId =
            request.agreement_id ??
            existing?.version.agreement_id ??
            nextUuid(state);
          const versionId =
            request.version_id ??
            existing?.version.version_id ??
            nextUuid(state);
          const nextVersion: BillingAgreementVersion = {
            agreement_id: agreementId,
            version_id: versionId,
            agreement_family: request.agreement_family,
            cadence: "monthly",
            state: "draft",
            latest_event: "draft_saved",
            version_number: existing?.version.version_number ?? 1,
            effective_start: request.effective_start,
            effective_end: request.effective_end,
            formula_kind: request.formula_kind,
            fixed_amount: request.fixed_amount,
            minimum_amount: request.minimum_amount,
            rate: request.percentage,
            currency_policy_version: "usd-v1",
            rate_policy_version: "ordinary-percentage-v1",
            rounding_policy_version: "half-away-from-zero-v1",
            formula_version: "billing-agreement-formula-v1",
            explanation_version: "billing-agreement-explanation-v1",
            signed_evidence_id: request.signed_evidence_id,
            signed_evidence_sha256: syntheticHash(request.signed_evidence_id),
            terms_fingerprint: syntheticHash(request),
            self_approved: false,
            rules: {
              timezone: request.timezone,
              timing_basis: request.timing_basis,
              included_amounts: [...request.included_amounts],
              excluded_amounts: [...request.excluded_amounts],
              tax_treatment: request.tax_treatment,
              refund_chargeback_policy: request.refund_chargeback_policy,
              cutoff_day: request.cutoff_day,
              dispute_policy: request.dispute_policy,
              missing_report_policy: request.missing_report_policy,
              true_up_policy: request.true_up_policy,
              evidence_priority: [...request.evidence_priority],
            },
          };
          if (existing) existing.version = nextVersion;
          else
            state.agreements.push({
              account_id: request.account_id,
              version: nextVersion,
            });
          return agreementResponse(
            existing ? "updated" : "created",
            nextVersion,
          );
        },
      );
    },

    async submitBillingAgreementVersion(
      request: BillingAgreementLifecycleRequest,
    ) {
      requireCapability("agreement.manage", "AGREEMENT_NOT_AUTHORIZED");
      return command(
        "submitBillingAgreementVersion",
        request.command_key,
        request,
        "AGREEMENT_IDEMPOTENCY_CONFLICT",
        () => {
          const record = state.agreements.find(
            (candidate) => candidate.version.version_id === request.version_id,
          );
          if (!record || record.version.state !== "draft") {
            fail("AGREEMENT_LIFECYCLE_INVALID");
          }
          record.version = {
            ...record.version,
            state: "pending_review",
            latest_event: "submitted",
          };
          return agreementResponse("submitted", record.version);
        },
      );
    },

    async activateBillingAgreementVersion(
      request: BillingAgreementLifecycleRequest,
    ) {
      requireCapability("agreement.approve", "AGREEMENT_NOT_AUTHORIZED");
      return command(
        "activateBillingAgreementVersion",
        request.command_key,
        request,
        "AGREEMENT_IDEMPOTENCY_CONFLICT",
        () => {
          const record = state.agreements.find(
            (candidate) => candidate.version.version_id === request.version_id,
          );
          if (!record || record.version.state !== "pending_review") {
            fail("AGREEMENT_LIFECYCLE_INVALID");
          }
          state.agreements.forEach((candidate) => {
            if (
              candidate.account_id === record.account_id &&
              candidate.version.state === "active"
            ) {
              candidate.version = { ...candidate.version, state: "superseded" };
            }
          });
          record.version = {
            ...record.version,
            state: "active",
            latest_event: "activated",
          };
          return agreementResponse("activated", record.version);
        },
      );
    },

    async pauseBillingAgreementVersion(
      request: BillingAgreementLifecycleRequest,
    ) {
      requireCapability("agreement.manage", "AGREEMENT_NOT_AUTHORIZED");
      return command(
        "pauseBillingAgreementVersion",
        request.command_key,
        request,
        "AGREEMENT_IDEMPOTENCY_CONFLICT",
        () => {
          const record = state.agreements.find(
            (candidate) => candidate.version.version_id === request.version_id,
          );
          if (!record || record.version.state !== "active") {
            fail("AGREEMENT_LIFECYCLE_INVALID");
          }
          record.version = {
            ...record.version,
            state: "paused",
            latest_event: "paused",
          };
          return agreementResponse("paused", record.version);
        },
      );
    },

    async terminateBillingAgreementVersion(
      request: BillingAgreementLifecycleRequest,
    ) {
      requireCapability("agreement.manage", "AGREEMENT_NOT_AUTHORIZED");
      return command(
        "terminateBillingAgreementVersion",
        request.command_key,
        request,
        "AGREEMENT_IDEMPOTENCY_CONFLICT",
        () => {
          const record = state.agreements.find(
            (candidate) => candidate.version.version_id === request.version_id,
          );
          if (
            !record ||
            !["active", "paused", "pending_review"].includes(
              record.version.state,
            )
          ) {
            fail("AGREEMENT_LIFECYCLE_INVALID");
          }
          record.version = {
            ...record.version,
            state: "terminated",
            latest_event: "terminated",
          };
          return agreementResponse("terminated", record.version);
        },
      );
    },

    async listBillingRevenuePeriods(
      request: BillingRevenuePeriodListRequest,
    ): Promise<BillingRevenuePeriodListResult> {
      requireCapability("revenue.read", "REVENUE_NOT_AUTHORIZED");
      ensurePage(request.page, request.per_page);
      const records = state.periods.filter(
        (summary) => summary.period.account_id === request.account_id,
      );
      const start = (request.page - 1) * request.per_page;
      return copy({
        data: records.slice(start, start + request.per_page),
        total: records.length,
      });
    },

    async ensureBillingRevenuePeriod(
      request: BillingRevenuePeriodEnsureRequest,
    ): Promise<BillingRevenuePeriodEnsureResponse> {
      requireCapability("revenue.manage", "REVENUE_NOT_AUTHORIZED");
      return command(
        "ensureBillingRevenuePeriod",
        request.command_key,
        request,
        "REVENUE_IDEMPOTENCY_CONFLICT",
        () => {
          const bounds = monthBounds(request.period_month);
          const agreement = accountAgreement(
            state,
            request.account_id,
            request.agreement_version_id,
          );
          if (!agreement || agreement.version.state !== "active") {
            fail("REVENUE_AGREEMENT_INACTIVE");
          }
          const existing = state.periods.find(
            (summary) =>
              summary.period.account_id === request.account_id &&
              summary.period.agreement_version_id ===
                request.agreement_version_id &&
              summary.period.period_start === bounds.start,
          );
          if (existing) {
            return copy({
              result: "existing" as const,
              period_id: existing.period.id,
              agreement_id: existing.period.agreement_id,
              agreement_version_id: existing.period.agreement_version_id,
              period_start: existing.period.period_start,
              period_end: existing.period.period_end,
              timezone: existing.period.timezone,
              submission_deadline_at: existing.period.submission_deadline_at,
            });
          }
          const period: BillingRevenuePeriod = {
            id: nextUuid(state),
            organization_id:
              scenarioForAccount(request.account_id)?.organization_id ??
              DEMO_BILLING_CLOSE_SCENARIOS.hybrid.organization_id,
            account_id: request.account_id,
            agreement_id: agreement.version.agreement_id,
            agreement_version_id: agreement.version.version_id,
            period_start: bounds.start,
            period_end: bounds.end,
            timezone: agreement.version.rules.timezone,
            submission_deadline_at: `${bounds.end}T05:00:00.000Z`,
            state: "open",
            created_at: DEMO_EVIDENCE_NOW,
          };
          state.periods.push({
            period,
            submissions: [],
            reviews: [],
            exceptions: [],
            close_snapshot: null,
          });
          return copy({
            result: "created" as const,
            period_id: period.id,
            agreement_id: period.agreement_id,
            agreement_version_id: period.agreement_version_id,
            period_start: period.period_start,
            period_end: period.period_end,
            timezone: period.timezone,
            submission_deadline_at: period.submission_deadline_at,
          });
        },
      );
    },

    async submitBillingRevenueRevision(
      request: BillingRevenueSubmissionRequest,
    ): Promise<BillingRevenueSubmissionResponse> {
      requireCapability("revenue.manage", "REVENUE_NOT_AUTHORIZED");
      return command(
        "submitBillingRevenueRevision",
        request.command_key,
        request,
        "REVENUE_IDEMPOTENCY_CONFLICT",
        () => {
          const summary = findPeriod(
            state,
            request.account_id,
            request.period_id,
          );
          if (!summary) fail("REVENUE_NOT_AUTHORIZED");
          if (summary.period.state === "closed") fail("REVENUE_PERIOD_CLOSED");
          if (summary.reviews.some((review) => review.outcome === "accept")) {
            fail("REVENUE_REVISION_ALREADY_ACCEPTED");
          }
          const gross = parseUsdMoney(request.gross_amount);
          const excluded = parseUsdMoney(request.excluded_amount);
          const commissionable = parseUsdMoney(request.commissionable_amount);
          if (
            BigInt(gross.amount_minor) - BigInt(excluded.amount_minor) !==
            BigInt(commissionable.amount_minor)
          ) {
            fail("REVENUE_AMOUNT_MISMATCH");
          }
          if (
            !request.attestation.accurate ||
            request.evidence_ids.length === 0 ||
            request.evidence_ids.some(
              (evidenceId) => !cleanEvidenceIds.has(evidenceId),
            )
          ) {
            fail("REVENUE_EVIDENCE_INVALID");
          }
          const previous = summary.submissions.at(-1) ?? null;
          const submission: BillingRevenueSubmission = {
            id: nextUuid(state),
            organization_id: summary.period.organization_id,
            account_id: request.account_id,
            period_id: request.period_id,
            revision_number: (previous?.revision_number ?? 0) + 1,
            previous_submission_id: previous?.id ?? null,
            gross_amount: gross,
            excluded_amount: excluded,
            commissionable_amount: commissionable,
            provenance_kind: request.provenance_kind,
            provenance_source_id: request.provenance_source_id,
            submitter_id: "31000000-0000-4000-8000-000000000001",
            submitter_role: "operator",
            attestation_text: request.attestation.text,
            request_fingerprint: syntheticHash(request),
            submitted_at: DEMO_EVIDENCE_NOW,
            evidence: request.evidence_ids.map((evidenceId, index) => ({
              evidence_id: evidenceId,
              captured_sha256: syntheticHash(evidenceId),
              ordinal: index + 1,
            })),
          };
          summary.submissions = [...summary.submissions, submission];
          return copy({
            result: "submitted" as const,
            period_id: request.period_id,
            submission_id: submission.id,
            revision_number: submission.revision_number,
            previous_submission_id: submission.previous_submission_id,
            gross_amount: gross,
            excluded_amount: excluded,
            commissionable_amount: commissionable,
            request_fingerprint: submission.request_fingerprint,
          });
        },
      );
    },

    async reviewBillingRevenueRevision(
      request: BillingRevenueReviewRequest,
    ): Promise<BillingRevenueReviewResponse> {
      requireCapability("revenue.review", "REVENUE_NOT_AUTHORIZED");
      return command(
        "reviewBillingRevenueRevision",
        request.command_key,
        request,
        "REVENUE_IDEMPOTENCY_CONFLICT",
        () => {
          const summary = findPeriod(
            state,
            request.account_id,
            request.period_id,
          );
          if (!summary) fail("REVENUE_NOT_AUTHORIZED");
          const submission = request.submission_id
            ? summary.submissions.find(
                (candidate) => candidate.id === request.submission_id,
              )
            : null;
          if (request.outcome === "accept" && !submission) {
            fail("REVENUE_REVIEW_INVALID");
          }
          if (submission && summary.submissions.at(-1)?.id !== submission.id) {
            fail("REVENUE_REVIEW_INVALID");
          }
          const evidenceFingerprint = syntheticHash(submission?.evidence ?? []);
          const review: BillingRevenueReview = {
            id: nextEventId(state),
            period_id: request.period_id,
            submission_id: request.submission_id,
            outcome: request.outcome,
            reason_code: request.reason_code,
            reviewer_id: "31000000-0000-4000-8000-000000000001",
            reviewer_role: "reviewer",
            reason: request.reason,
            input_fingerprint: syntheticHash(request),
            evidence_fingerprint: evidenceFingerprint,
            review_policy_version: "revenue-review-v1",
            created_at: DEMO_EVIDENCE_NOW,
          };
          let exception: BillingCloseException | null = null;
          if (request.outcome !== "accept") {
            exception = {
              id: nextUuid(state),
              period_id: request.period_id,
              submission_id: request.submission_id,
              reason_code: request.exception.kind,
              amount_at_risk: request.exception.amount_at_risk,
              owner_id: request.exception.owner_id,
              next_action: request.exception.next_action,
              due_at: request.exception.due_at,
              status: "open",
              caused_by_review_event_id: review.id,
              opened_at: DEMO_EVIDENCE_NOW,
              resolved_at: null,
              resolution_reason: null,
            };
            summary.exceptions = [...summary.exceptions, exception];
          } else {
            summary.exceptions = summary.exceptions.map((candidate) =>
              candidate.status === "open"
                ? {
                    ...candidate,
                    status: "resolved" as const,
                    resolved_at: DEMO_EVIDENCE_NOW,
                    resolution_reason: request.reason,
                  }
                : candidate,
            );
          }
          summary.reviews = [...summary.reviews, review];
          return copy({
            result: "reviewed" as const,
            review_event_id: review.id,
            period_id: request.period_id,
            submission_id: request.submission_id,
            outcome: request.outcome,
            reason_code: request.reason_code,
            input_fingerprint: review.input_fingerprint,
            evidence_fingerprint: evidenceFingerprint,
            review_policy_version: "revenue-review-v1" as const,
            exception_id: exception?.id ?? null,
            exception_status: exception?.status ?? null,
          });
        },
      );
    },

    async closeBillingRevenuePeriod(
      request: BillingRevenueCloseRequest,
    ): Promise<BillingRevenueCloseResponse> {
      requireCapability("revenue.manage", "REVENUE_NOT_AUTHORIZED");
      return command(
        "closeBillingRevenuePeriod",
        request.command_key,
        request,
        "REVENUE_IDEMPOTENCY_CONFLICT",
        () => {
          const summary = findPeriod(
            state,
            request.account_id,
            request.period_id,
          );
          if (!summary) fail("REVENUE_NOT_AUTHORIZED");
          if (summary.close_snapshot) fail("REVENUE_PERIOD_CLOSED");
          const review = summary.reviews.find(
            (candidate) => candidate.id === request.review_event_id,
          );
          if (!review) fail("REVENUE_CLOSE_REVIEW_STALE");
          if (summary.reviews.at(-1)?.id !== review.id) {
            fail("REVENUE_CLOSE_REVIEW_STALE");
          }
          const submission = review.submission_id
            ? (summary.submissions.find(
                (candidate) => candidate.id === review.submission_id,
              ) ?? null)
            : null;
          const scenario = scenarioForAccount(request.account_id);
          const exception = summary.exceptions.find(
            (candidate) => candidate.status === "open",
          );
          const agreement = accountAgreement(
            state,
            request.account_id,
            summary.period.agreement_version_id,
          );
          if (!agreement) fail("REVENUE_CLOSE_AGREEMENT_STALE");
          if (
            request.close_mode === "accepted_evidence" &&
            (review.outcome !== "accept" || !submission || exception)
          ) {
            fail("REVENUE_CLOSE_INVALID");
          }
          if (
            request.close_mode === "minimum_only" &&
            (agreement.version.rules.missing_report_policy !== "minimum_only" ||
              review.outcome === "accept" ||
              !exception)
          ) {
            fail("REVENUE_MINIMUM_NOT_PERMITTED");
          }
          const close: BillingRevenueCloseSnapshot = {
            id: scenario?.close_snapshot_id ?? nextUuid(state),
            period_id: request.period_id,
            agreement_id: summary.period.agreement_id,
            agreement_version_id: summary.period.agreement_version_id,
            close_mode: request.close_mode,
            submission_id: submission?.id ?? null,
            review_event_id: review.id,
            exception_id: exception?.id ?? null,
            gross_amount: submission?.gross_amount ?? null,
            excluded_amount: submission?.excluded_amount ?? null,
            commissionable_amount: submission?.commissionable_amount ?? null,
            provenance_kind: submission?.provenance_kind ?? null,
            provenance_source_id: submission?.provenance_source_id ?? null,
            evidence: submission?.evidence ?? [],
            agreement_fingerprint: syntheticHash({
              agreement_id: summary.period.agreement_id,
              version_id: summary.period.agreement_version_id,
            }),
            input_fingerprint: review.input_fingerprint,
            evidence_fingerprint: review.evidence_fingerprint,
            close_input_fingerprint: syntheticHash(request),
            review_policy_version: "revenue-review-v1",
            close_policy_version: "revenue-close-v1",
            closed_at: DEMO_EVIDENCE_NOW,
          };
          summary.period = { ...summary.period, state: "closed" };
          summary.close_snapshot = close;
          return copy({
            result: "closed" as const,
            close_snapshot_id: close.id,
            period_id: close.period_id,
            close_mode: close.close_mode,
            submission_id: close.submission_id,
            review_event_id: close.review_event_id,
            exception_id: close.exception_id,
            exception_status: exception?.status ?? null,
            gross_amount: close.gross_amount,
            excluded_amount: close.excluded_amount,
            commissionable_amount: close.commissionable_amount,
            agreement_fingerprint: close.agreement_fingerprint,
            input_fingerprint: close.input_fingerprint,
            evidence_fingerprint: close.evidence_fingerprint,
            close_input_fingerprint: close.close_input_fingerprint,
            review_policy_version: "revenue-review-v1" as const,
            close_policy_version: "revenue-close-v1" as const,
          });
        },
      );
    },

    async listBillingCalculations(
      request: BillingCalculationListRequest,
    ): Promise<BillingCalculationListResult> {
      requireCapability("calculation.read", "CALCULATION_NOT_AUTHORIZED");
      ensurePage(request.page, request.per_page);
      const records = state.calculations.filter(
        (calculation) => calculation.account_id === request.account_id,
      );
      const start = (request.page - 1) * request.per_page;
      return copy({
        data: records.slice(start, start + request.per_page),
        total: records.length,
      });
    },

    async previewBillingCalculation(request: BillingCalculationPreviewRequest) {
      requireCapability("calculation.calculate", "CALCULATION_NOT_AUTHORIZED");
      return buildPreview(request);
    },

    async createBillingCalculation(
      request: BillingCalculationCreateRequest,
    ): Promise<BillingCalculationCreateResponse> {
      requireCapability("calculation.calculate", "CALCULATION_NOT_AUTHORIZED");
      return command(
        "createBillingCalculation",
        request.command_key,
        request,
        "CALCULATION_IDEMPOTENCY_CONFLICT",
        () => {
          const preview = buildPreview(request);
          if (preview.preview_fingerprint !== request.preview_fingerprint) {
            fail("CALCULATION_PREVIEW_STALE");
          }
          if (preview.anomalies.some((anomaly) => anomaly.blocking)) {
            fail("CALCULATION_POLICY_MISMATCH");
          }
          if (
            state.calculations.some(
              (calculation) =>
                calculation.account_id === request.account_id &&
                calculation.close_snapshot_id === request.close_snapshot_id,
            )
          ) {
            fail("CALCULATION_BUSINESS_KEY_CONFLICT");
          }
          const calculation: BillingCalculation = {
            id: nextUuid(state),
            account_id: request.account_id,
            agreement_id: preview.agreement_id,
            agreement_version_id: preview.agreement_version_id,
            period_id: preview.period_id,
            close_snapshot_id: request.close_snapshot_id,
            formula_kind: preview.formula_kind,
            selected_branch: preview.selected_branch,
            final_amount: preview.final_amount,
            close_policy_version: preview.close_policy_version,
            snapshot_hash: syntheticHash({ preview, kind: "snapshot" }),
            explanation_hash: syntheticHash({ preview, kind: "explanation" }),
            comparison: preview.comparison,
            status: "created",
          };
          state.calculations.push(calculation);
          return copy({
            result: "created" as const,
            calculation_id: calculation.id,
            period_id: calculation.period_id,
            close_snapshot_id: calculation.close_snapshot_id,
            formula_kind: calculation.formula_kind,
            selected_branch: calculation.selected_branch,
            final_amount: calculation.final_amount,
            close_policy_version: calculation.close_policy_version,
            snapshot_hash: calculation.snapshot_hash,
            explanation_hash: calculation.explanation_hash,
            comparison: calculation.comparison,
          });
        },
      );
    },

    async approveBillingCalculation(
      request: BillingCalculationApproveRequest,
    ): Promise<BillingCalculationApproveResponse> {
      requireCapability("calculation.approve", "CALCULATION_NOT_AUTHORIZED");
      return command(
        "approveBillingCalculation",
        request.command_key,
        request,
        "CALCULATION_IDEMPOTENCY_CONFLICT",
        () => {
          const index = state.calculations.findIndex(
            (calculation) =>
              calculation.id === request.calculation_id &&
              calculation.account_id === request.account_id,
          );
          if (index < 0) fail("CALCULATION_NOT_AUTHORIZED");
          const calculation = state.calculations[index];
          if (calculation.status !== "created") {
            fail("CALCULATION_BUSINESS_KEY_CONFLICT");
          }
          const preview = buildPreview({
            account_id: request.account_id,
            close_snapshot_id: calculation.close_snapshot_id,
            close_policy_version: request.close_policy_version,
          });
          if (
            request.preview_fingerprint !== preview.preview_fingerprint ||
            request.close_policy_version !== calculation.close_policy_version
          ) {
            fail("CALCULATION_PREVIEW_STALE");
          }
          if (
            request.mode === "auto" &&
            (!request.grant_id || !request.provider_reference)
          ) {
            fail("CALCULATION_AUTO_NOT_AUTHORIZED");
          }
          const approved = { ...calculation, status: "approved" as const };
          state.calculations[index] = approved;
          const eventId = nextEventId(state);
          const found = findClose(
            state,
            request.account_id,
            calculation.close_snapshot_id,
          );
          const agreement = accountAgreement(
            state,
            request.account_id,
            calculation.agreement_version_id,
          );
          if (!found || !agreement) fail("CALCULATION_AGREEMENT_STALE");
          const review = found.summary.reviews.find(
            (candidate) => candidate.id === found.close.review_event_id,
          );
          if (!review) fail("CALCULATION_PREVIEW_STALE");
          const lineage: BillingCalculationLineage = {
            calculation: {
              id: calculation.id,
              formula_kind: calculation.formula_kind,
              selected_branch: calculation.selected_branch,
              result: calculation.final_amount,
              snapshot_hash_prefix: calculation.snapshot_hash.slice(0, 16),
              explanation_hash_prefix: calculation.explanation_hash.slice(
                0,
                16,
              ),
            },
            agreement: {
              id: agreement.version.agreement_id,
              version_id: agreement.version.version_id,
              signed_evidence_id: agreement.version.signed_evidence_id,
              terms_hash_prefix: agreement.version.terms_fingerprint.slice(
                0,
                16,
              ),
              effective_start: agreement.version.effective_start,
              effective_end: agreement.version.effective_end,
            },
            period: {
              id: found.summary.period.id,
              period_start: found.summary.period.period_start,
              period_end: found.summary.period.period_end,
              timezone: found.summary.period.timezone,
            },
            evidence_review: {
              submission_id: found.close.submission_id,
              review_event_id: review.id,
              outcome: review.outcome,
              exception_id: found.close.exception_id,
              evidence: found.close.evidence.map((link) => ({
                evidence_id: link.evidence_id,
                sha256_prefix: link.captured_sha256.slice(0, 16),
                ordinal: link.ordinal,
              })),
              evidence_hash_prefix: found.close.evidence_fingerprint.slice(
                0,
                16,
              ),
            },
            close: {
              id: found.close.id,
              mode: found.close.close_mode,
              input_hash_prefix: found.close.close_input_fingerprint.slice(
                0,
                16,
              ),
            },
            formula: {
              calculation_base: preview.calculation_base,
              intermediate_numerator: preview.intermediate_numerator,
              intermediate_denominator: preview.intermediate_denominator,
              fixed_candidate: preview.fixed_candidate,
              minimum_candidate: preview.minimum_candidate,
              percentage_candidate: preview.percentage_candidate,
            },
            policies: {
              currency: "usd-v1",
              rate: "ordinary-percentage-v1",
              rounding: "half-away-from-zero-v1",
              formula: "billing-agreement-formula-v1",
              revenue_close: "revenue-close-v1",
              calculation_close: request.close_policy_version,
              explanation: "billing-agreement-explanation-v1",
            },
            approval: {
              event_id: eventId,
              mode: request.mode,
              actor_type: request.mode === "auto" ? "automation" : "human",
            },
          };
          state.lineages.push(lineage);
          return copy({
            result: "approved" as const,
            calculation_id: calculation.id,
            event_id: eventId,
            mode: request.mode,
            close_policy_version: request.close_policy_version,
            preview_fingerprint: request.preview_fingerprint,
            snapshot_hash: calculation.snapshot_hash,
            approved_amount: calculation.final_amount,
          });
        },
      );
    },

    async getBillingCalculationLineage(
      request: BillingCalculationLineageRequest,
    ): Promise<BillingCalculationLineage> {
      requireCapability("calculation.read", "CALCULATION_NOT_AUTHORIZED");
      const calculation = state.calculations.find(
        (candidate) =>
          candidate.id === request.calculation_id &&
          candidate.account_id === request.account_id,
      );
      const lineage = state.lineages.find(
        (candidate) => candidate.calculation.id === request.calculation_id,
      );
      if (!calculation || !lineage) fail("CALCULATION_NOT_AUTHORIZED");
      return copy(lineage);
    },

    async createBillingAdjustmentCalculation(
      request: BillingCalculationAdjustmentRequest,
    ): Promise<BillingCalculationAdjustmentResponse> {
      requireCapability("calculation.calculate", "CALCULATION_NOT_AUTHORIZED");
      return command(
        "createBillingAdjustmentCalculation",
        request.command_key,
        request,
        "CALCULATION_ADJUSTMENT_IDEMPOTENCY_CONFLICT",
        () => {
          const original = state.calculations.find(
            (candidate) =>
              candidate.id === request.original_calculation_id &&
              candidate.account_id === request.account_id &&
              candidate.status === "approved",
          );
          const scenario = scenarioForAccount(request.account_id);
          if (!original || !scenario)
            fail("CALCULATION_ADJUSTMENT_LINEAGE_INVALID");
          if (
            request.late_submission_id !== scenario.late_submission_id ||
            request.late_review_event_id !== scenario.late_review_event_id
          ) {
            fail("CALCULATION_ADJUSTMENT_EVIDENCE_STALE");
          }
          if (
            state.adjustments.some(
              (adjustment) =>
                adjustment.original_calculation_id === original.id &&
                adjustment.late_submission_id === request.late_submission_id,
            )
          ) {
            fail("CALCULATION_ADJUSTMENT_BUSINESS_CONFLICT");
          }
          const agreement = accountAgreement(
            state,
            request.account_id,
            original.agreement_version_id,
          );
          if (!agreement) fail("CALCULATION_ADJUSTMENT_LINEAGE_INVALID");
          const actualFormula = calculateBillingFormula({
            formula_kind: agreement.version.formula_kind,
            commissionable_amount: money(
              scenario.late_commissionable_amount_minor,
            ),
            fixed_amount: agreement.version.fixed_amount,
            minimum_amount: agreement.version.minimum_amount,
            rate: agreement.version.rate,
            currency_policy_version: agreement.version.currency_policy_version,
            rounding_policy_version: agreement.version.rounding_policy_version,
            formula_version: agreement.version.formula_version,
          });
          const classified = classifyBillingAdjustment({
            original_amount_minor: original.final_amount.amount_minor,
            actual_amount_minor: actualFormula.final_amount_minor,
            true_up_policy: agreement.version.rules.true_up_policy,
          });
          const adjustment: BillingAdjustmentCalculation = {
            id: nextUuid(state),
            original_calculation_id: original.id,
            late_submission_id: request.late_submission_id,
            original_amount: money(classified.original_amount_minor),
            actual_amount: money(classified.actual_amount_minor),
            delta: money(classified.delta_minor),
            treatment: classified.treatment,
            status: classified.status,
            snapshot_hash: syntheticHash({ request, actualFormula }),
            relationship_hash: syntheticHash({
              original_calculation_id: original.id,
              late_submission_id: request.late_submission_id,
              late_review_event_id: request.late_review_event_id,
            }),
          };
          state.adjustments.push(adjustment);
          return copy(adjustment);
        },
      );
    },
  };

  return provider;
}
