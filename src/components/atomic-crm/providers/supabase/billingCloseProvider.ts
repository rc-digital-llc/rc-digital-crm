import type {
  BillingAdjustmentCalculation,
  BillingAgreementEventType,
  BillingAgreementLifecycleState,
  BillingAgreementVersion,
  BillingCalculation,
  BillingCalculationAnomaly,
  BillingCalculationComparison,
  BillingCalculationLineage,
} from "../../types";
import {
  calculateBillingFormula,
  classifyBillingAdjustment,
} from "../../financial/billingCalculationFixtures";
import {
  parseCanonicalIntegerText,
  parseExactRatio,
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
  BillingRevenueReviewRequest,
  BillingRevenueReviewResponse,
  BillingRevenueSubmissionRequest,
  BillingRevenueSubmissionResponse,
} from "../types";

export const BILLING_CLOSE_INVALID_REQUEST =
  "BILLING_CLOSE_INVALID_REQUEST" as const;
export const BILLING_CLOSE_INVALID_RESPONSE =
  "BILLING_CLOSE_INVALID_RESPONSE" as const;
export const BILLING_CLOSE_READ_FAILED = "BILLING_CLOSE_READ_FAILED" as const;
export const BILLING_CLOSE_COMMAND_FAILED =
  "BILLING_CLOSE_COMMAND_FAILED" as const;

export class BillingCloseProviderError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "BillingCloseProviderError";
    this.code = code;
  }
}

type RpcName =
  | "read_billing_agreements"
  | "read_billing_revenue_periods"
  | "read_billing_calculations"
  | "save_billing_agreement_draft"
  | "submit_billing_agreement_version"
  | "activate_billing_agreement_version"
  | "pause_billing_agreement_version"
  | "terminate_billing_agreement_version"
  | "ensure_billing_revenue_period"
  | "submit_billing_revenue_revision"
  | "review_billing_revenue_revision"
  | "close_billing_revenue_period"
  | "preview_billing_calculation"
  | "create_billing_calculation"
  | "approve_billing_calculation"
  | "read_billing_calculation_lineage"
  | "create_billing_adjustment_calculation";

export type BillingCloseRpc = (
  name: RpcName,
  args: Readonly<Record<string, unknown>>,
) => Promise<Readonly<{ data: unknown; error: unknown }>>;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const DATE_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;
const MONTH_PATTERN = /^[0-9]{4}-(?:0[1-9]|1[0-2])$/;
const COMMAND_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{7,127}$/;

const SAFE_RPC_CODES = new Set([
  "AGREEMENT_EFFECTIVE_RANGE_CONFLICT",
  "AGREEMENT_IDEMPOTENCY_CONFLICT",
  "AGREEMENT_INVALID_REQUEST",
  "AGREEMENT_LIFECYCLE_INVALID",
  "AGREEMENT_NOT_AUTHORIZED",
  "AGREEMENT_READ_NOT_AUTHORIZED",
  "AGREEMENT_SIGNED_EVIDENCE_INVALID",
  "CALCULATION_ADJUSTMENT_BUSINESS_CONFLICT",
  "CALCULATION_ADJUSTMENT_EVIDENCE_STALE",
  "CALCULATION_ADJUSTMENT_IDEMPOTENCY_CONFLICT",
  "CALCULATION_ADJUSTMENT_INVALID_REQUEST",
  "CALCULATION_ADJUSTMENT_LINEAGE_INVALID",
  "CALCULATION_AGREEMENT_STALE",
  "CALCULATION_AUTO_NOT_AUTHORIZED",
  "CALCULATION_BUSINESS_KEY_CONFLICT",
  "CALCULATION_IDEMPOTENCY_CONFLICT",
  "CALCULATION_INVALID_REQUEST",
  "CALCULATION_NOT_AUTHORIZED",
  "CALCULATION_POLICY_MISMATCH",
  "CALCULATION_PREVIEW_STALE",
  "REVENUE_AGREEMENT_INACTIVE",
  "REVENUE_AMOUNT_INVALID",
  "REVENUE_AMOUNT_MISMATCH",
  "REVENUE_CLOSE_AGREEMENT_STALE",
  "REVENUE_CLOSE_EVIDENCE_STALE",
  "REVENUE_CLOSE_EXCEPTION_OPEN",
  "REVENUE_CLOSE_INPUT_STALE",
  "REVENUE_CLOSE_INVALID",
  "REVENUE_CLOSE_REVIEW_STALE",
  "REVENUE_EVIDENCE_INVALID",
  "REVENUE_IDEMPOTENCY_CONFLICT",
  "REVENUE_INVALID_REQUEST",
  "REVENUE_MINIMUM_DEADLINE_PENDING",
  "REVENUE_MINIMUM_EXCEPTION_REQUIRED",
  "REVENUE_MINIMUM_NOT_PERMITTED",
  "REVENUE_MINIMUM_REVIEW_REQUIRED",
  "REVENUE_NOT_AUTHORIZED",
  "REVENUE_PERIOD_CLOSED",
  "REVENUE_PERIOD_OUTSIDE_AGREEMENT",
  "REVENUE_READ_INVALID_REQUEST",
  "REVENUE_REVISION_ALREADY_ACCEPTED",
  "REVENUE_REVIEW_INVALID",
]);

const FORMULA_KINDS = [
  "fixed",
  "percentage",
  "minimum_support",
  "hybrid",
] as const;
const SELECTED_BRANCHES = [
  "fixed",
  "percentage",
  "minimum",
  "minimum_equal",
] as const;
const PROVENANCE_KINDS = ["api", "statement", "portal"] as const;
const REVIEW_OUTCOMES = [
  "accept",
  "reject",
  "request_correction",
  "hold",
] as const;
const EXCEPTION_REASONS = [
  "MISSING_EVIDENCE",
  "CONFLICTING_EVIDENCE",
  "LATE_EVIDENCE",
  "ANOMALOUS_REVENUE",
  "HELD_EVIDENCE",
  "UNVERIFIED_EVIDENCE",
] as const;
const BILLING_ROLES = [
  "administrator",
  "operator",
  "reviewer",
  "auditor",
  "customer",
] as const;

function fail(code: string): never {
  throw new BillingCloseProviderError(code);
}

function invalidRequest(): never {
  fail(BILLING_CLOSE_INVALID_REQUEST);
}

function invalidResponse(): never {
  fail(BILLING_CLOSE_INVALID_RESPONSE);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function keysEqual(
  value: Record<string, unknown>,
  expected: readonly string[],
) {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function keysAllowed(
  value: Record<string, unknown>,
  required: readonly string[],
  allowed: readonly string[],
) {
  const actual = Object.keys(value);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    actual.every((key) => allowed.includes(key))
  );
}

function requireRecord(value: unknown, code: string): Record<string, unknown> {
  if (!isRecord(value)) fail(code);
  return value;
}

function requireString(
  value: unknown,
  maximumBytes: number,
  code: string,
  allowEmpty = false,
) {
  if (
    typeof value !== "string" ||
    (!allowEmpty && value.trim() === "") ||
    new TextEncoder().encode(value).byteLength > maximumBytes
  ) {
    fail(code);
  }
  return value;
}

function requireNullableString(
  value: unknown,
  maximumBytes: number,
  code: string,
) {
  return value === null ? null : requireString(value, maximumBytes, code);
}

function requireUuid(value: unknown, code: string) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) fail(code);
  return value;
}

function requireNullableUuid(value: unknown, code: string) {
  return value === null || value === undefined
    ? null
    : requireUuid(value, code);
}

function requireHash(value: unknown, code: string) {
  if (typeof value !== "string" || !HASH_PATTERN.test(value)) fail(code);
  return value;
}

function requireHashPrefix(value: unknown, code: string) {
  if (typeof value !== "string" || !/^[0-9a-f]{12}$/.test(value)) fail(code);
  return value;
}

function requireDate(value: unknown, code: string) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) fail(code);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    fail(code);
  }
  return value;
}

function requireTimestamp(value: unknown, code: string) {
  const timestamp = requireString(value, 64, code);
  if (!Number.isFinite(new Date(timestamp).getTime())) fail(code);
  return timestamp;
}

function requireInteger(value: unknown, minimum: number, maximum: number) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    invalidResponse();
  }
  return value;
}

function requireRequestInteger(
  value: unknown,
  minimum: number,
  maximum: number,
) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    invalidRequest();
  }
  return value;
}

function requireEnum<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  code: string,
): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) fail(code);
  return value as T[number];
}

function requireStringArray(
  value: unknown,
  minimum: number,
  maximum: number,
  code: string,
) {
  if (
    !Array.isArray(value) ||
    value.length < minimum ||
    value.length > maximum
  ) {
    fail(code);
  }
  const result = value.map((item) => requireString(item, 64, code));
  if (new Set(result).size !== result.length) fail(code);
  return Object.freeze(result);
}

function requireEnumArray<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  minimum: number,
  maximum: number,
  code: string,
) {
  if (
    !Array.isArray(value) ||
    value.length < minimum ||
    value.length > maximum
  ) {
    fail(code);
  }
  const result = value.map((item) => requireEnum(item, allowed, code));
  if (new Set(result).size !== result.length) fail(code);
  return Object.freeze(result);
}

function money(amountMinor: unknown, currency: unknown = "USD") {
  try {
    return parseUsdMoney({ amount_minor: amountMinor, currency });
  } catch {
    invalidResponse();
  }
}

function requestMoney(value: unknown) {
  try {
    const record = requireRecord(value, BILLING_CLOSE_INVALID_REQUEST);
    if (!keysEqual(record, ["amount_minor", "currency"])) invalidRequest();
    return parseUsdMoney(record);
  } catch (error) {
    if (error instanceof BillingCloseProviderError) throw error;
    invalidRequest();
  }
}

function nullableMoney(amountMinor: unknown, currency: unknown = "USD") {
  return amountMinor === null || amountMinor === undefined
    ? null
    : money(amountMinor, currency);
}

function requireCommandKey(value: unknown) {
  if (typeof value !== "string" || !COMMAND_KEY_PATTERN.test(value)) {
    invalidRequest();
  }
  return value;
}

function requireRequestReason(value: unknown) {
  return requireString(value, 1000, BILLING_CLOSE_INVALID_REQUEST);
}

function safeRpcError(error: unknown, fallback: string): never {
  const message =
    isRecord(error) && typeof error.message === "string" ? error.message : "";
  const tokens = message.match(/[A-Z][A-Z0-9_]{3,}/g) ?? [];
  const code = tokens.find((candidate) => SAFE_RPC_CODES.has(candidate));
  fail(code ?? fallback);
}

function parseDraftRequest(value: unknown): BillingAgreementDraftRequest {
  const request = requireRecord(value, BILLING_CLOSE_INVALID_REQUEST);
  const required = [
    "account_id",
    "agreement_family",
    "command_key",
    "cutoff_day",
    "dispute_policy",
    "effective_end",
    "effective_start",
    "evidence_priority",
    "excluded_amounts",
    "fixed_amount",
    "formula_kind",
    "included_amounts",
    "minimum_amount",
    "missing_report_policy",
    "percentage",
    "refund_chargeback_policy",
    "signed_evidence_id",
    "tax_treatment",
    "timing_basis",
    "timezone",
    "true_up_policy",
  ];
  if (
    !keysAllowed(request, required, [...required, "agreement_id", "version_id"])
  ) {
    invalidRequest();
  }
  const formulaKind = requireEnum(
    request.formula_kind,
    FORMULA_KINDS,
    BILLING_CLOSE_INVALID_REQUEST,
  );
  const fixed =
    request.fixed_amount === null ? null : requestMoney(request.fixed_amount);
  const minimum =
    request.minimum_amount === null
      ? null
      : requestMoney(request.minimum_amount);
  let percentage = null;
  if (request.percentage !== null) {
    try {
      percentage = parseOrdinaryPercentageRate(request.percentage);
    } catch {
      invalidRequest();
    }
  }
  if (
    (formulaKind === "fixed" && (!fixed || minimum || percentage)) ||
    (formulaKind === "percentage" && (fixed || minimum || !percentage)) ||
    (formulaKind === "minimum_support" && (fixed || !minimum || percentage)) ||
    (formulaKind === "hybrid" && (fixed || !minimum || !percentage))
  ) {
    invalidRequest();
  }
  const included = requireStringArray(
    request.included_amounts,
    1,
    100,
    BILLING_CLOSE_INVALID_REQUEST,
  );
  const excluded = requireStringArray(
    request.excluded_amounts,
    0,
    100,
    BILLING_CLOSE_INVALID_REQUEST,
  );
  if (included.some((item) => excluded.includes(item))) invalidRequest();
  const result = {
    account_id: requireUuid(request.account_id, BILLING_CLOSE_INVALID_REQUEST),
    ...(request.agreement_id === undefined
      ? {}
      : {
          agreement_id: requireUuid(
            request.agreement_id,
            BILLING_CLOSE_INVALID_REQUEST,
          ),
        }),
    ...(request.version_id === undefined
      ? {}
      : {
          version_id: requireUuid(
            request.version_id,
            BILLING_CLOSE_INVALID_REQUEST,
          ),
        }),
    agreement_family: requireString(
      request.agreement_family,
      64,
      BILLING_CLOSE_INVALID_REQUEST,
    ),
    command_key: requireCommandKey(request.command_key),
    effective_start: requireDate(
      request.effective_start,
      BILLING_CLOSE_INVALID_REQUEST,
    ),
    effective_end: requireDate(
      request.effective_end,
      BILLING_CLOSE_INVALID_REQUEST,
    ),
    formula_kind: formulaKind,
    fixed_amount: fixed,
    minimum_amount: minimum,
    percentage,
    signed_evidence_id: requireUuid(
      request.signed_evidence_id,
      BILLING_CLOSE_INVALID_REQUEST,
    ),
    timezone: requireString(
      request.timezone,
      100,
      BILLING_CLOSE_INVALID_REQUEST,
    ),
    timing_basis: requireEnum(
      request.timing_basis,
      ["cash", "accrual"],
      BILLING_CLOSE_INVALID_REQUEST,
    ),
    included_amounts: included,
    excluded_amounts: excluded,
    tax_treatment: requireEnum(
      request.tax_treatment,
      ["include", "exclude"],
      BILLING_CLOSE_INVALID_REQUEST,
    ),
    refund_chargeback_policy: requireEnum(
      request.refund_chargeback_policy,
      ["deduct_in_period", "next_period_adjustment"],
      BILLING_CLOSE_INVALID_REQUEST,
    ),
    cutoff_day: requireRequestInteger(request.cutoff_day, 1, 28),
    dispute_policy: requireEnum(
      request.dispute_policy,
      ["hold_close", "exclude_disputed"],
      BILLING_CLOSE_INVALID_REQUEST,
    ),
    missing_report_policy: requireEnum(
      request.missing_report_policy,
      ["hold_close", "minimum_only"],
      BILLING_CLOSE_INVALID_REQUEST,
    ),
    true_up_policy: requireEnum(
      request.true_up_policy,
      ["next_period_adjustment", "credit_candidate"],
      BILLING_CLOSE_INVALID_REQUEST,
    ),
    evidence_priority: requireEnumArray(
      request.evidence_priority,
      PROVENANCE_KINDS,
      1,
      3,
      BILLING_CLOSE_INVALID_REQUEST,
    ),
  };
  return Object.freeze(result) as BillingAgreementDraftRequest;
}

function parseLifecycleRequest(
  value: unknown,
): BillingAgreementLifecycleRequest {
  const request = requireRecord(value, BILLING_CLOSE_INVALID_REQUEST);
  if (!keysEqual(request, ["command_key", "reason", "version_id"])) {
    invalidRequest();
  }
  return Object.freeze({
    version_id: requireUuid(request.version_id, BILLING_CLOSE_INVALID_REQUEST),
    reason: requireRequestReason(request.reason),
    command_key: requireCommandKey(request.command_key),
  });
}

function normalizeAgreementState(
  state: unknown,
  latestEvent: BillingAgreementEventType,
): BillingAgreementLifecycleState {
  if (latestEvent === "paused" || latestEvent === "terminated")
    return latestEvent;
  if (state === "draft") return "draft";
  if (state === "submitted") return "pending_review";
  if (state === "active") return "active";
  invalidResponse();
}

const AGREEMENT_WIRE_KEYS = [
  "agreement_id",
  "version_id",
  "agreement_family",
  "cadence",
  "state",
  "latest_event",
  "version_number",
  "effective_start",
  "effective_end",
  "formula_kind",
  "fixed_amount_minor",
  "minimum_amount_minor",
  "rate_numerator",
  "rate_denominator",
  "submitted_percentage",
  "currency",
  "currency_policy_version",
  "rate_policy_version",
  "rounding_policy_version",
  "formula_version",
  "explanation_version",
  "signed_evidence_id",
  "signed_evidence_sha256",
  "terms_fingerprint",
  "self_approved",
  "lifecycle_events",
  "rules",
] as const;

function parseAgreement(value: unknown): BillingAgreementVersion {
  const row = requireRecord(value, BILLING_CLOSE_INVALID_RESPONSE);
  if (!keysEqual(row, AGREEMENT_WIRE_KEYS)) invalidResponse();
  const latestEvent = requireEnum(
    row.latest_event,
    ["draft_saved", "submitted", "activated", "paused", "terminated"],
    BILLING_CLOSE_INVALID_RESPONSE,
  );
  const formulaKind = requireEnum(
    row.formula_kind,
    FORMULA_KINDS,
    BILLING_CLOSE_INVALID_RESPONSE,
  );
  if (
    row.currency !== "USD" ||
    row.currency_policy_version !== "usd-v1" ||
    row.rate_policy_version !== "ordinary-percentage-v1" ||
    row.rounding_policy_version !== "half-away-from-zero-v1" ||
    row.formula_version !== "billing-agreement-formula-v1" ||
    row.explanation_version !== "billing-agreement-explanation-v1" ||
    typeof row.self_approved !== "boolean"
  ) {
    invalidResponse();
  }
  const fixed = nullableMoney(row.fixed_amount_minor, row.currency);
  const minimum = nullableMoney(row.minimum_amount_minor, row.currency);
  let rate = null;
  if (
    row.rate_numerator !== null ||
    row.rate_denominator !== null ||
    row.submitted_percentage !== null
  ) {
    try {
      rate = parseOrdinaryPercentageRate({
        kind: "ordinary_percentage",
        numerator: row.rate_numerator,
        denominator: row.rate_denominator,
        submitted_percentage: row.submitted_percentage,
        rate_policy_version: row.rate_policy_version,
      });
    } catch {
      invalidResponse();
    }
  }
  if (
    (formulaKind === "fixed" && (!fixed || minimum || rate)) ||
    (formulaKind === "percentage" && (fixed || minimum || !rate)) ||
    (formulaKind === "minimum_support" && (fixed || !minimum || rate)) ||
    (formulaKind === "hybrid" && (fixed || !minimum || !rate))
  ) {
    invalidResponse();
  }
  const rules = requireRecord(row.rules, BILLING_CLOSE_INVALID_RESPONSE);
  if (
    !keysEqual(rules, [
      "timezone",
      "timing_basis",
      "included_amounts",
      "excluded_amounts",
      "tax_treatment",
      "refund_chargeback_policy",
      "cutoff_day",
      "dispute_policy",
      "missing_report_policy",
      "true_up_policy",
      "evidence_priority",
    ])
  ) {
    invalidResponse();
  }
  if (
    !Array.isArray(row.lifecycle_events) ||
    row.lifecycle_events.length < 1 ||
    row.lifecycle_events.length > 100
  ) {
    invalidResponse();
  }
  const lifecycleEvents = Object.freeze(
    row.lifecycle_events.map((value) => {
      const event = requireRecord(value, BILLING_CLOSE_INVALID_RESPONSE);
      if (
        !keysEqual(event, [
          "event_id",
          "event_type",
          "actor_id",
          "actor_role",
          "reason",
          "created_at",
        ])
      ) {
        invalidResponse();
      }
      return Object.freeze({
        event_id: requirePositiveStringId(
          event.event_id,
          BILLING_CLOSE_INVALID_RESPONSE,
        ),
        event_type: requireEnum(
          event.event_type,
          ["draft_saved", "submitted", "activated", "paused", "terminated"],
          BILLING_CLOSE_INVALID_RESPONSE,
        ),
        actor_id: requireUuid(event.actor_id, BILLING_CLOSE_INVALID_RESPONSE),
        actor_role: requireEnum(
          event.actor_role,
          BILLING_ROLES,
          BILLING_CLOSE_INVALID_RESPONSE,
        ),
        reason: requireString(
          event.reason,
          1000,
          BILLING_CLOSE_INVALID_RESPONSE,
        ),
        created_at: requireTimestamp(
          event.created_at,
          BILLING_CLOSE_INVALID_RESPONSE,
        ),
      });
    }),
  );
  if (lifecycleEvents[0]?.event_type !== latestEvent) invalidResponse();
  return Object.freeze({
    agreement_id: requireUuid(row.agreement_id, BILLING_CLOSE_INVALID_RESPONSE),
    version_id: requireUuid(row.version_id, BILLING_CLOSE_INVALID_RESPONSE),
    agreement_family: requireString(
      row.agreement_family,
      64,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    cadence: requireEnum(
      row.cadence,
      ["monthly"],
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    state: normalizeAgreementState(row.state, latestEvent),
    latest_event: latestEvent,
    version_number: requireInteger(row.version_number, 1, 2_147_483_647),
    effective_start: requireDate(
      row.effective_start,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    effective_end: requireDate(
      row.effective_end,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    formula_kind: formulaKind,
    fixed_amount: fixed,
    minimum_amount: minimum,
    rate,
    currency_policy_version: "usd-v1",
    rate_policy_version: "ordinary-percentage-v1",
    rounding_policy_version: "half-away-from-zero-v1",
    formula_version: "billing-agreement-formula-v1",
    explanation_version: "billing-agreement-explanation-v1",
    signed_evidence_id: requireUuid(
      row.signed_evidence_id,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    signed_evidence_sha256: requireHash(
      row.signed_evidence_sha256,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    terms_fingerprint: requireHash(
      row.terms_fingerprint,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    self_approved: row.self_approved,
    lifecycle_events: lifecycleEvents,
    rules: Object.freeze({
      timezone: requireString(
        rules.timezone,
        100,
        BILLING_CLOSE_INVALID_RESPONSE,
      ),
      timing_basis: requireEnum(
        rules.timing_basis,
        ["cash", "accrual"],
        BILLING_CLOSE_INVALID_RESPONSE,
      ),
      included_amounts: requireStringArray(
        rules.included_amounts,
        1,
        100,
        BILLING_CLOSE_INVALID_RESPONSE,
      ),
      excluded_amounts: requireStringArray(
        rules.excluded_amounts,
        0,
        100,
        BILLING_CLOSE_INVALID_RESPONSE,
      ),
      tax_treatment: requireEnum(
        rules.tax_treatment,
        ["include", "exclude"],
        BILLING_CLOSE_INVALID_RESPONSE,
      ),
      refund_chargeback_policy: requireEnum(
        rules.refund_chargeback_policy,
        ["deduct_in_period", "next_period_adjustment"],
        BILLING_CLOSE_INVALID_RESPONSE,
      ),
      cutoff_day: requireInteger(rules.cutoff_day, 1, 28),
      dispute_policy: requireEnum(
        rules.dispute_policy,
        ["hold_close", "exclude_disputed"],
        BILLING_CLOSE_INVALID_RESPONSE,
      ),
      missing_report_policy: requireEnum(
        rules.missing_report_policy,
        ["hold_close", "minimum_only"],
        BILLING_CLOSE_INVALID_RESPONSE,
      ),
      true_up_policy: requireEnum(
        rules.true_up_policy,
        ["next_period_adjustment", "credit_candidate"],
        BILLING_CLOSE_INVALID_RESPONSE,
      ),
      evidence_priority: requireEnumArray(
        rules.evidence_priority,
        PROVENANCE_KINDS,
        1,
        3,
        BILLING_CLOSE_INVALID_RESPONSE,
      ),
    }),
  });
}

function parseAgreementList(value: unknown): BillingAgreementListResult {
  const response = requireRecord(value, BILLING_CLOSE_INVALID_RESPONSE);
  if (!keysEqual(response, ["data"]) || !Array.isArray(response.data)) {
    invalidResponse();
  }
  return Object.freeze({
    data: Object.freeze(response.data.map(parseAgreement)),
  });
}

function parseAgreementCommand(
  value: unknown,
  expectedResult?: BillingAgreementCommandResponse["result"],
): BillingAgreementCommandResponse {
  const response = requireRecord(value, BILLING_CLOSE_INVALID_RESPONSE);
  const result = requireEnum(
    response.result,
    ["created", "updated", "submitted", "activated", "paused", "terminated"],
    BILLING_CLOSE_INVALID_RESPONSE,
  );
  const isDraft = result === "created" || result === "updated";
  const expectedKeys = isDraft
    ? [
        "result",
        "agreement_id",
        "version_id",
        "version_number",
        "state",
        "currency",
        "terms_fingerprint",
      ]
    : [
        "result",
        "agreement_id",
        "version_id",
        "version_number",
        "state",
        "self_approved",
        "terms_fingerprint",
      ];
  if (
    !keysEqual(response, expectedKeys) ||
    (expectedResult && result !== expectedResult)
  ) {
    invalidResponse();
  }
  if (
    (isDraft && response.currency !== "USD") ||
    (!isDraft && typeof response.self_approved !== "boolean")
  ) {
    invalidResponse();
  }
  const latestEvent =
    result === "submitted"
      ? "submitted"
      : result === "activated"
        ? "activated"
        : result === "paused"
          ? "paused"
          : result === "terminated"
            ? "terminated"
            : "draft_saved";
  return Object.freeze({
    result,
    agreement_id: requireUuid(
      response.agreement_id,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    version_id: requireUuid(
      response.version_id,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    version_number: requireInteger(response.version_number, 1, 2_147_483_647),
    state: normalizeAgreementState(response.state, latestEvent),
    self_approved: isDraft ? false : (response.self_approved as boolean),
    terms_fingerprint: requireHash(
      response.terms_fingerprint,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
  });
}

function parsePeriodEnsureRequest(
  value: unknown,
): BillingRevenuePeriodEnsureRequest {
  const request = requireRecord(value, BILLING_CLOSE_INVALID_REQUEST);
  if (
    !keysEqual(request, [
      "account_id",
      "agreement_version_id",
      "period_month",
      "command_key",
    ])
  ) {
    invalidRequest();
  }
  if (
    typeof request.period_month !== "string" ||
    !MONTH_PATTERN.test(request.period_month)
  ) {
    invalidRequest();
  }
  return Object.freeze({
    account_id: requireUuid(request.account_id, BILLING_CLOSE_INVALID_REQUEST),
    agreement_version_id: requireUuid(
      request.agreement_version_id,
      BILLING_CLOSE_INVALID_REQUEST,
    ),
    period_month: request.period_month,
    command_key: requireCommandKey(request.command_key),
  });
}

function parsePeriodEnsureResponse(
  value: unknown,
): BillingRevenuePeriodEnsureResponse {
  const response = requireRecord(value, BILLING_CLOSE_INVALID_RESPONSE);
  if (
    !keysEqual(response, [
      "result",
      "period_id",
      "agreement_id",
      "agreement_version_id",
      "period_start",
      "period_end",
      "timezone",
      "submission_deadline_at",
    ])
  ) {
    invalidResponse();
  }
  return Object.freeze({
    result: requireEnum(
      response.result,
      ["created", "existing"],
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    period_id: requireUuid(response.period_id, BILLING_CLOSE_INVALID_RESPONSE),
    agreement_id: requireUuid(
      response.agreement_id,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    agreement_version_id: requireUuid(
      response.agreement_version_id,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    period_start: requireDate(
      response.period_start,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    period_end: requireDate(
      response.period_end,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    timezone: requireString(
      response.timezone,
      100,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    submission_deadline_at: requireTimestamp(
      response.submission_deadline_at,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
  });
}

function parseSubmissionRequest(
  value: unknown,
): BillingRevenueSubmissionRequest {
  const request = requireRecord(value, BILLING_CLOSE_INVALID_REQUEST);
  if (
    !keysEqual(request, [
      "account_id",
      "attestation",
      "command_key",
      "commissionable_amount",
      "evidence_ids",
      "excluded_amount",
      "gross_amount",
      "period_id",
      "provenance_kind",
      "provenance_source_id",
    ])
  ) {
    invalidRequest();
  }
  const gross = requestMoney(request.gross_amount);
  const excluded = requestMoney(request.excluded_amount);
  const commissionable = requestMoney(request.commissionable_amount);
  if (
    BigInt(gross.amount_minor) < 0n ||
    BigInt(excluded.amount_minor) < 0n ||
    BigInt(commissionable.amount_minor) < 0n ||
    BigInt(gross.amount_minor) - BigInt(excluded.amount_minor) !==
      BigInt(commissionable.amount_minor)
  ) {
    invalidRequest();
  }
  const attestation = requireRecord(
    request.attestation,
    BILLING_CLOSE_INVALID_REQUEST,
  );
  if (
    !keysEqual(attestation, ["accurate", "text"]) ||
    attestation.accurate !== true
  ) {
    invalidRequest();
  }
  const evidence = requireStringArray(
    request.evidence_ids,
    1,
    100,
    BILLING_CLOSE_INVALID_REQUEST,
  ).map((id) => requireUuid(id, BILLING_CLOSE_INVALID_REQUEST));
  return Object.freeze({
    account_id: requireUuid(request.account_id, BILLING_CLOSE_INVALID_REQUEST),
    period_id: requireUuid(request.period_id, BILLING_CLOSE_INVALID_REQUEST),
    gross_amount: gross,
    excluded_amount: excluded,
    commissionable_amount: commissionable,
    provenance_kind: requireEnum(
      request.provenance_kind,
      PROVENANCE_KINDS,
      BILLING_CLOSE_INVALID_REQUEST,
    ),
    provenance_source_id: requireString(
      request.provenance_source_id,
      500,
      BILLING_CLOSE_INVALID_REQUEST,
    ),
    attestation: Object.freeze({
      accurate: true,
      text: requireString(
        attestation.text,
        1000,
        BILLING_CLOSE_INVALID_REQUEST,
      ),
    }),
    evidence_ids: Object.freeze(evidence),
    command_key: requireCommandKey(request.command_key),
  });
}

function parseSubmissionResponse(
  value: unknown,
): BillingRevenueSubmissionResponse {
  const response = requireRecord(value, BILLING_CLOSE_INVALID_RESPONSE);
  if (
    !keysEqual(response, [
      "result",
      "period_id",
      "submission_id",
      "revision_number",
      "previous_submission_id",
      "gross_amount_minor",
      "excluded_amount_minor",
      "commissionable_amount_minor",
      "currency",
      "request_fingerprint",
    ]) ||
    response.result !== "submitted"
  ) {
    invalidResponse();
  }
  const gross = money(response.gross_amount_minor, response.currency);
  const excluded = money(response.excluded_amount_minor, response.currency);
  const commissionable = money(
    response.commissionable_amount_minor,
    response.currency,
  );
  if (
    BigInt(gross.amount_minor) - BigInt(excluded.amount_minor) !==
    BigInt(commissionable.amount_minor)
  ) {
    invalidResponse();
  }
  return Object.freeze({
    result: "submitted",
    period_id: requireUuid(response.period_id, BILLING_CLOSE_INVALID_RESPONSE),
    submission_id: requireUuid(
      response.submission_id,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    revision_number: requireInteger(response.revision_number, 1, 2_147_483_647),
    previous_submission_id: requireNullableUuid(
      response.previous_submission_id,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    gross_amount: gross,
    excluded_amount: excluded,
    commissionable_amount: commissionable,
    request_fingerprint: requireHash(
      response.request_fingerprint,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
  });
}

function parseReviewRequest(value: unknown): BillingRevenueReviewRequest {
  const request = requireRecord(value, BILLING_CLOSE_INVALID_REQUEST);
  if (
    !keysEqual(request, [
      "account_id",
      "command_key",
      "exception",
      "outcome",
      "period_id",
      "reason",
      "reason_code",
      "submission_id",
    ])
  ) {
    invalidRequest();
  }
  const outcome = requireEnum(
    request.outcome,
    REVIEW_OUTCOMES,
    BILLING_CLOSE_INVALID_REQUEST,
  );
  const common = {
    account_id: requireUuid(request.account_id, BILLING_CLOSE_INVALID_REQUEST),
    period_id: requireUuid(request.period_id, BILLING_CLOSE_INVALID_REQUEST),
    reason: requireRequestReason(request.reason),
    command_key: requireCommandKey(request.command_key),
  };
  if (outcome === "accept") {
    if (
      request.reason_code !== "REVENUE_ACCEPTED" ||
      request.exception !== null
    ) {
      invalidRequest();
    }
    return Object.freeze({
      ...common,
      submission_id: requireUuid(
        request.submission_id,
        BILLING_CLOSE_INVALID_REQUEST,
      ),
      outcome,
      reason_code: "REVENUE_ACCEPTED",
      exception: null,
    });
  }
  const reasonCode = requireEnum(
    request.reason_code,
    EXCEPTION_REASONS,
    BILLING_CLOSE_INVALID_REQUEST,
  );
  const exception = requireRecord(
    request.exception,
    BILLING_CLOSE_INVALID_REQUEST,
  );
  if (
    !keysEqual(exception, [
      "amount_at_risk",
      "due_at",
      "kind",
      "next_action",
      "owner_id",
    ]) ||
    exception.kind !== reasonCode
  ) {
    invalidRequest();
  }
  return Object.freeze({
    ...common,
    submission_id: requireNullableUuid(
      request.submission_id,
      BILLING_CLOSE_INVALID_REQUEST,
    ),
    outcome,
    reason_code: reasonCode,
    exception: Object.freeze({
      kind: reasonCode,
      owner_id: requireUuid(exception.owner_id, BILLING_CLOSE_INVALID_REQUEST),
      next_action: requireString(
        exception.next_action,
        1000,
        BILLING_CLOSE_INVALID_REQUEST,
      ),
      due_at: requireTimestamp(exception.due_at, BILLING_CLOSE_INVALID_REQUEST),
      amount_at_risk:
        exception.amount_at_risk === null
          ? null
          : requestMoney(exception.amount_at_risk),
    }),
  });
}

function parseReviewResponse(value: unknown): BillingRevenueReviewResponse {
  const response = requireRecord(value, BILLING_CLOSE_INVALID_RESPONSE);
  const required = [
    "result",
    "review_event_id",
    "period_id",
    "outcome",
    "reason_code",
    "input_fingerprint",
    "evidence_fingerprint",
    "review_policy_version",
  ];
  if (
    !keysAllowed(response, required, [
      ...required,
      "submission_id",
      "exception_id",
      "exception_status",
    ]) ||
    response.result !== "reviewed" ||
    response.review_policy_version !== "revenue-review-v1"
  ) {
    invalidResponse();
  }
  const outcome = requireEnum(
    response.outcome,
    REVIEW_OUTCOMES,
    BILLING_CLOSE_INVALID_RESPONSE,
  );
  const reasonCode =
    response.reason_code === "REVENUE_ACCEPTED"
      ? "REVENUE_ACCEPTED"
      : requireEnum(
          response.reason_code,
          EXCEPTION_REASONS,
          BILLING_CLOSE_INVALID_RESPONSE,
        );
  if ((outcome === "accept") !== (reasonCode === "REVENUE_ACCEPTED")) {
    invalidResponse();
  }
  const exceptionStatus =
    response.exception_status === undefined ||
    response.exception_status === null
      ? null
      : requireEnum(
          response.exception_status,
          ["open", "resolved"],
          BILLING_CLOSE_INVALID_RESPONSE,
        );
  return Object.freeze({
    result: "reviewed",
    review_event_id: requirePositiveTextId(
      response.review_event_id,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    period_id: requireUuid(response.period_id, BILLING_CLOSE_INVALID_RESPONSE),
    submission_id: requireNullableUuid(
      response.submission_id,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    outcome,
    reason_code: reasonCode,
    input_fingerprint: requireHash(
      response.input_fingerprint,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    evidence_fingerprint: requireHash(
      response.evidence_fingerprint,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    review_policy_version: "revenue-review-v1",
    exception_id: requireNullableUuid(
      response.exception_id,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    exception_status: exceptionStatus,
  });
}

function requirePositiveTextId(value: unknown, code: string) {
  try {
    const id = parseCanonicalIntegerText(
      typeof value === "number" && Number.isSafeInteger(value)
        ? String(value)
        : value,
    );
    if (BigInt(id) <= 0n) fail(code);
    return id;
  } catch (error) {
    if (error instanceof BillingCloseProviderError) throw error;
    fail(code);
  }
}

function requirePositiveStringId(value: unknown, code: string) {
  if (typeof value !== "string") fail(code);
  return requirePositiveTextId(value, code);
}

function requireCanonicalIntegerText(value: unknown, code: string) {
  try {
    return parseCanonicalIntegerText(value);
  } catch (error) {
    if (error instanceof BillingCloseProviderError) throw error;
    fail(code);
  }
}

function parseCloseRequest(value: unknown): BillingRevenueCloseRequest {
  const request = requireRecord(value, BILLING_CLOSE_INVALID_REQUEST);
  if (
    !keysEqual(request, [
      "account_id",
      "close_mode",
      "command_key",
      "period_id",
      "reason",
      "review_event_id",
    ])
  ) {
    invalidRequest();
  }
  return Object.freeze({
    account_id: requireUuid(request.account_id, BILLING_CLOSE_INVALID_REQUEST),
    period_id: requireUuid(request.period_id, BILLING_CLOSE_INVALID_REQUEST),
    close_mode: requireEnum(
      request.close_mode,
      ["accepted_evidence", "minimum_only"],
      BILLING_CLOSE_INVALID_REQUEST,
    ),
    review_event_id: requirePositiveTextId(
      request.review_event_id,
      BILLING_CLOSE_INVALID_REQUEST,
    ),
    reason: requireRequestReason(request.reason),
    command_key: requireCommandKey(request.command_key),
  });
}

function parseCloseResponse(value: unknown): BillingRevenueCloseResponse {
  const response = requireRecord(value, BILLING_CLOSE_INVALID_RESPONSE);
  const required = [
    "result",
    "close_snapshot_id",
    "period_id",
    "close_mode",
    "review_event_id",
    "currency",
    "agreement_fingerprint",
    "input_fingerprint",
    "evidence_fingerprint",
    "close_input_fingerprint",
    "review_policy_version",
    "close_policy_version",
  ];
  if (
    !keysAllowed(response, required, [
      ...required,
      "submission_id",
      "exception_id",
      "exception_status",
      "gross_amount_minor",
      "excluded_amount_minor",
      "commissionable_amount_minor",
    ]) ||
    response.result !== "closed" ||
    response.currency !== "USD" ||
    response.review_policy_version !== "revenue-review-v1" ||
    response.close_policy_version !== "revenue-close-v1"
  ) {
    invalidResponse();
  }
  const closeMode = requireEnum(
    response.close_mode,
    ["accepted_evidence", "minimum_only"],
    BILLING_CLOSE_INVALID_RESPONSE,
  );
  const gross = nullableMoney(response.gross_amount_minor, response.currency);
  const excluded = nullableMoney(
    response.excluded_amount_minor,
    response.currency,
  );
  const commissionable = nullableMoney(
    response.commissionable_amount_minor,
    response.currency,
  );
  if (
    (closeMode === "accepted_evidence" &&
      (!gross ||
        !excluded ||
        !commissionable ||
        BigInt(gross.amount_minor) - BigInt(excluded.amount_minor) !==
          BigInt(commissionable.amount_minor))) ||
    (closeMode === "minimum_only" && (gross || excluded || commissionable))
  ) {
    invalidResponse();
  }
  return Object.freeze({
    result: "closed",
    close_snapshot_id: requireUuid(
      response.close_snapshot_id,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    period_id: requireUuid(response.period_id, BILLING_CLOSE_INVALID_RESPONSE),
    close_mode: closeMode,
    submission_id: requireNullableUuid(
      response.submission_id,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    review_event_id: requirePositiveTextId(
      response.review_event_id,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    exception_id: requireNullableUuid(
      response.exception_id,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    exception_status: response.exception_status === "open" ? "open" : null,
    gross_amount: gross,
    excluded_amount: excluded,
    commissionable_amount: commissionable,
    agreement_fingerprint: requireHash(
      response.agreement_fingerprint,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    input_fingerprint: requireHash(
      response.input_fingerprint,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    evidence_fingerprint: requireHash(
      response.evidence_fingerprint,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    close_input_fingerprint: requireHash(
      response.close_input_fingerprint,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    review_policy_version: "revenue-review-v1",
    close_policy_version: "revenue-close-v1",
  });
}

function parsePreviewRequest(value: unknown): BillingCalculationPreviewRequest {
  const request = requireRecord(value, BILLING_CLOSE_INVALID_REQUEST);
  if (
    !keysAllowed(
      request,
      ["account_id", "close_snapshot_id"],
      ["account_id", "close_snapshot_id", "close_policy_version"],
    )
  ) {
    invalidRequest();
  }
  const policy =
    request.close_policy_version === undefined
      ? undefined
      : requireEnum(
          request.close_policy_version,
          ["billing-manual-v1", "billing-auto-v1"],
          BILLING_CLOSE_INVALID_REQUEST,
        );
  return Object.freeze({
    account_id: requireUuid(request.account_id, BILLING_CLOSE_INVALID_REQUEST),
    close_snapshot_id: requireUuid(
      request.close_snapshot_id,
      BILLING_CLOSE_INVALID_REQUEST,
    ),
    ...(policy === undefined ? {} : { close_policy_version: policy }),
  });
}

const PREVIEW_KEYS = [
  "preview_version",
  "organization_id",
  "account_id",
  "agreement_id",
  "agreement_version_id",
  "period_id",
  "period_start",
  "period_end",
  "close_snapshot_id",
  "close_mode",
  "close_input_fingerprint",
  "terms_fingerprint",
  "gross_amount_minor",
  "excluded_amount_minor",
  "source_commissionable_amount_minor",
  "calculation_base_minor",
  "provenance_kind",
  "provenance_source_id",
  "evidence_fingerprint",
  "formula_kind",
  "fixed_amount_minor",
  "minimum_amount_minor",
  "rate_numerator",
  "rate_denominator",
  "submitted_percentage",
  "intermediate_numerator",
  "intermediate_denominator",
  "fixed_candidate_minor",
  "minimum_candidate_minor",
  "percentage_candidate_minor",
  "selected_branch",
  "final_amount_minor",
  "currency",
  "currency_policy_version",
  "rate_policy_version",
  "rounding_policy_version",
  "formula_version",
  "revenue_close_policy_version",
  "close_policy_version",
  "close_policy",
  "explanation_version",
  "anomalies",
  "comparison_status",
  "previous_calculation_id",
  "previous_amount_minor",
  "delta_minor",
  "delta_rate_numerator",
  "delta_rate_denominator",
  "result",
  "preview_fingerprint",
] as const;

function parseAnomalies(value: unknown): readonly BillingCalculationAnomaly[] {
  if (!Array.isArray(value) || value.length > 20) invalidResponse();
  return Object.freeze(
    value.map((item) => {
      const anomaly = requireRecord(item, BILLING_CLOSE_INVALID_RESPONSE);
      const code = requireEnum(
        anomaly.code,
        [
          "ACCOUNT_NOT_ACTIVE",
          "EVIDENCE_STATE_CHANGED",
          "OPEN_CLOSE_EXCEPTION",
        ],
        BILLING_CLOSE_INVALID_RESPONSE,
      );
      const allowedKeys =
        code === "ACCOUNT_NOT_ACTIVE"
          ? ["code", "status"]
          : code === "EVIDENCE_STATE_CHANGED"
            ? ["code", "count"]
            : ["code"];
      if (!keysEqual(anomaly, allowedKeys)) invalidResponse();
      if (code === "ACCOUNT_NOT_ACTIVE") {
        requireEnum(
          anomaly.status,
          ["active", "on_hold", "closed"],
          BILLING_CLOSE_INVALID_RESPONSE,
        );
      }
      if (code === "EVIDENCE_STATE_CHANGED") {
        requireInteger(anomaly.count, 1, 1_000_000);
      }
      return Object.freeze({ code, status: "fail" as const, blocking: true });
    }),
  );
}

function parseComparison(
  response: Record<string, unknown>,
  finalAmountMinor: string,
): BillingCalculationComparison {
  const rawStatus = requireEnum(
    response.comparison_status,
    ["not_available", "zero_baseline", "available"],
    BILLING_CLOSE_INVALID_RESPONSE,
  );
  const previousId = requireNullableUuid(
    response.previous_calculation_id,
    BILLING_CLOSE_INVALID_RESPONSE,
  );
  const previous = nullableMoney(response.previous_amount_minor);
  const delta = nullableMoney(response.delta_minor);
  if (rawStatus === "not_available") {
    if (
      previousId ||
      previous ||
      delta ||
      response.delta_rate_numerator !== null ||
      response.delta_rate_denominator !== null
    ) {
      invalidResponse();
    }
    return Object.freeze({
      status: "unavailable",
      previous_calculation_id: null,
      previous_amount: null,
      delta: null,
      delta_rate: null,
    });
  }
  if (!previousId || !previous || !delta) invalidResponse();
  if (
    BigInt(finalAmountMinor) - BigInt(previous.amount_minor) !==
    BigInt(delta.amount_minor)
  ) {
    invalidResponse();
  }
  if (rawStatus === "zero_baseline") {
    if (
      previous.amount_minor !== "0" ||
      response.delta_rate_numerator !== null ||
      response.delta_rate_denominator !== null
    ) {
      invalidResponse();
    }
    return Object.freeze({
      status: "zero_baseline",
      previous_calculation_id: previousId,
      previous_amount: previous,
      delta,
      delta_rate: null,
    });
  }
  let deltaRate;
  let rawDeltaNumerator;
  let rawDeltaDenominator;
  try {
    rawDeltaNumerator = parseCanonicalIntegerText(
      response.delta_rate_numerator,
    );
    rawDeltaDenominator = parseCanonicalIntegerText(
      response.delta_rate_denominator,
    );
    deltaRate = parseExactRatio({
      numerator: rawDeltaNumerator,
      denominator: rawDeltaDenominator,
    });
  } catch {
    invalidResponse();
  }
  if (
    rawDeltaNumerator !== delta.amount_minor ||
    BigInt(rawDeltaDenominator) !==
      (BigInt(previous.amount_minor) < 0n
        ? -BigInt(previous.amount_minor)
        : BigInt(previous.amount_minor))
  ) {
    invalidResponse();
  }
  return Object.freeze({
    status: "available",
    previous_calculation_id: previousId,
    previous_amount: previous,
    delta,
    delta_rate: deltaRate,
  });
}

function parseClosePolicy(value: unknown, currency: unknown) {
  const policy = requireRecord(value, BILLING_CLOSE_INVALID_RESPONSE);
  if (
    !keysEqual(policy, [
      "mode",
      "active",
      "organization_id",
      "account_id",
      "allowed_account_statuses",
      "allowed_formula_kinds",
      "allowed_close_modes",
      "allowed_provenance_kinds",
      "require_zero_anomalies",
      "minimum_result_minor",
      "maximum_result_minor",
      "effective_from",
      "effective_until",
    ]) ||
    typeof policy.active !== "boolean" ||
    typeof policy.require_zero_anomalies !== "boolean"
  ) {
    invalidResponse();
  }
  requireNullableUuid(policy.organization_id, BILLING_CLOSE_INVALID_RESPONSE);
  requireNullableUuid(policy.account_id, BILLING_CLOSE_INVALID_RESPONSE);
  return Object.freeze({
    mode: requireEnum(
      policy.mode,
      ["manual", "auto"],
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    active: policy.active,
    allowed_account_statuses: requireEnumArray(
      policy.allowed_account_statuses,
      ["active", "on_hold", "closed"],
      1,
      3,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    allowed_formula_kinds: requireEnumArray(
      policy.allowed_formula_kinds,
      FORMULA_KINDS,
      1,
      4,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    allowed_close_modes: requireEnumArray(
      policy.allowed_close_modes,
      ["accepted_evidence", "minimum_only"],
      1,
      2,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    allowed_provenance_kinds: requireEnumArray(
      policy.allowed_provenance_kinds,
      ["api", "statement", "portal", "minimum_only"],
      1,
      4,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    require_zero_anomalies: policy.require_zero_anomalies,
    minimum_result: money(policy.minimum_result_minor, currency),
    maximum_result: nullableMoney(policy.maximum_result_minor, currency),
    effective_from: requireTimestamp(
      policy.effective_from,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    effective_until:
      policy.effective_until === null
        ? null
        : requireTimestamp(
            policy.effective_until,
            BILLING_CLOSE_INVALID_RESPONSE,
          ),
  });
}

export function parseBillingCalculationPreviewResponse(
  value: unknown,
  expected?: BillingCalculationPreviewRequest,
): BillingCalculationPreview {
  const response = requireRecord(value, BILLING_CLOSE_INVALID_RESPONSE);
  if (!keysEqual(response, PREVIEW_KEYS)) invalidResponse();
  if (
    response.preview_version !== "billing-calculation-preview-v1" ||
    response.result !== "preview" ||
    response.currency !== "USD" ||
    response.currency_policy_version !== "usd-v1" ||
    response.rate_policy_version !== "ordinary-percentage-v1" ||
    response.rounding_policy_version !== "half-away-from-zero-v1" ||
    response.formula_version !== "billing-agreement-formula-v1" ||
    response.revenue_close_policy_version !== "revenue-close-v1" ||
    response.explanation_version !== "billing-agreement-explanation-v1"
  ) {
    invalidResponse();
  }
  const accountId = requireUuid(
    response.account_id,
    BILLING_CLOSE_INVALID_RESPONSE,
  );
  const closeSnapshotId = requireUuid(
    response.close_snapshot_id,
    BILLING_CLOSE_INVALID_RESPONSE,
  );
  if (
    expected &&
    (accountId !== expected.account_id ||
      closeSnapshotId !== expected.close_snapshot_id)
  ) {
    invalidResponse();
  }
  const formulaKind = requireEnum(
    response.formula_kind,
    FORMULA_KINDS,
    BILLING_CLOSE_INVALID_RESPONSE,
  );
  const fixed = nullableMoney(response.fixed_amount_minor, response.currency);
  const minimum = nullableMoney(
    response.minimum_amount_minor,
    response.currency,
  );
  let rate = null;
  if (
    response.rate_numerator !== null ||
    response.rate_denominator !== null ||
    response.submitted_percentage !== null
  ) {
    try {
      rate = parseOrdinaryPercentageRate({
        kind: "ordinary_percentage",
        numerator: response.rate_numerator,
        denominator: response.rate_denominator,
        submitted_percentage: response.submitted_percentage,
        rate_policy_version: response.rate_policy_version,
      });
    } catch {
      invalidResponse();
    }
  }
  const calculationBase = money(
    response.calculation_base_minor,
    response.currency,
  );
  let calculated;
  try {
    calculated = calculateBillingFormula({
      formula_kind: formulaKind,
      commissionable_amount: calculationBase,
      fixed_amount: fixed,
      minimum_amount: minimum,
      rate,
      currency_policy_version: response.currency_policy_version,
      rounding_policy_version: response.rounding_policy_version,
      formula_version: response.formula_version,
    });
  } catch {
    invalidResponse();
  }
  for (const key of [
    "intermediate_numerator",
    "intermediate_denominator",
    "fixed_candidate_minor",
    "minimum_candidate_minor",
    "percentage_candidate_minor",
    "selected_branch",
    "final_amount_minor",
  ] as const) {
    if (response[key] !== calculated[key]) invalidResponse();
  }
  const selectedBranch = requireEnum(
    response.selected_branch,
    SELECTED_BRANCHES,
    BILLING_CLOSE_INVALID_RESPONSE,
  );
  const finalAmount = money(response.final_amount_minor, response.currency);
  const comparison = parseComparison(response, finalAmount.amount_minor);
  const anomalies = parseAnomalies(response.anomalies);
  const closePolicyVersion = requireEnum(
    response.close_policy_version,
    ["billing-manual-v1", "billing-auto-v1"],
    BILLING_CLOSE_INVALID_RESPONSE,
  );
  if (
    expected?.close_policy_version &&
    expected.close_policy_version !== closePolicyVersion
  ) {
    invalidResponse();
  }
  return Object.freeze({
    result: "preview",
    organization_id: requireUuid(
      response.organization_id,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    account_id: accountId,
    agreement_id: requireUuid(
      response.agreement_id,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    agreement_version_id: requireUuid(
      response.agreement_version_id,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    period_id: requireUuid(response.period_id, BILLING_CLOSE_INVALID_RESPONSE),
    period_start: requireDate(
      response.period_start,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    period_end: requireDate(
      response.period_end,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    close_snapshot_id: closeSnapshotId,
    close_mode: requireEnum(
      response.close_mode,
      ["accepted_evidence", "minimum_only"],
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    gross_amount: nullableMoney(response.gross_amount_minor, response.currency),
    excluded_amount: nullableMoney(
      response.excluded_amount_minor,
      response.currency,
    ),
    source_commissionable_amount: nullableMoney(
      response.source_commissionable_amount_minor,
      response.currency,
    ),
    calculation_base: calculationBase,
    provenance_kind: requireEnum(
      response.provenance_kind,
      ["api", "statement", "portal", "minimum_only"],
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    provenance_source_id: requireNullableString(
      response.provenance_source_id,
      500,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    evidence_fingerprint: requireHash(
      response.evidence_fingerprint,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    close_input_fingerprint: requireHash(
      response.close_input_fingerprint,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    terms_fingerprint: requireHash(
      response.terms_fingerprint,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    formula_kind: formulaKind,
    fixed_amount: fixed,
    minimum_amount: minimum,
    rate,
    intermediate_numerator:
      calculated.intermediate_numerator === null
        ? null
        : requireCanonicalIntegerText(
            calculated.intermediate_numerator,
            BILLING_CLOSE_INVALID_RESPONSE,
          ),
    intermediate_denominator:
      calculated.intermediate_denominator === null
        ? null
        : requireCanonicalIntegerText(
            calculated.intermediate_denominator,
            BILLING_CLOSE_INVALID_RESPONSE,
          ),
    fixed_candidate: nullableMoney(calculated.fixed_candidate_minor),
    minimum_candidate: nullableMoney(calculated.minimum_candidate_minor),
    percentage_candidate: nullableMoney(calculated.percentage_candidate_minor),
    selected_branch: selectedBranch,
    final_amount: finalAmount,
    currency_policy_version: "usd-v1",
    rate_policy_version: "ordinary-percentage-v1",
    rounding_policy_version: "half-away-from-zero-v1",
    formula_version: "billing-agreement-formula-v1",
    revenue_close_policy_version: "revenue-close-v1",
    close_policy_version: closePolicyVersion,
    explanation_version: "billing-agreement-explanation-v1",
    close_policy: parseClosePolicy(response.close_policy, response.currency),
    anomalies,
    comparison,
    explanation: Object.freeze({
      kind: formulaKind,
      selected_branch: selectedBranch,
      final_amount: finalAmount,
    }),
    preview_fingerprint: requireHash(
      response.preview_fingerprint,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
  });
}

function parseCreateRequest(value: unknown): BillingCalculationCreateRequest {
  const request = requireRecord(value, BILLING_CLOSE_INVALID_REQUEST);
  if (
    !keysAllowed(
      request,
      ["account_id", "close_snapshot_id", "preview_fingerprint", "command_key"],
      [
        "account_id",
        "close_snapshot_id",
        "close_policy_version",
        "preview_fingerprint",
        "command_key",
      ],
    )
  ) {
    invalidRequest();
  }
  const preview = parsePreviewRequest({
    account_id: request.account_id,
    close_snapshot_id: request.close_snapshot_id,
    ...(request.close_policy_version === undefined
      ? {}
      : { close_policy_version: request.close_policy_version }),
  });
  return Object.freeze({
    ...preview,
    preview_fingerprint: requireHash(
      request.preview_fingerprint,
      BILLING_CLOSE_INVALID_REQUEST,
    ),
    command_key: requireCommandKey(request.command_key),
  });
}

function parseCreateResponse(
  value: unknown,
  request: BillingCalculationCreateRequest,
): BillingCalculationCreateResponse {
  const response = requireRecord(value, BILLING_CLOSE_INVALID_RESPONSE);
  if (
    !keysEqual(response, [
      "result",
      "calculation_id",
      "period_id",
      "close_snapshot_id",
      "formula_kind",
      "selected_branch",
      "final_amount_minor",
      "currency",
      "close_policy_version",
      "snapshot_hash",
      "explanation_hash",
      "comparison_status",
      "previous_calculation_id",
      "delta_minor",
      "delta_rate_numerator",
      "delta_rate_denominator",
    ]) ||
    response.result !== "created" ||
    response.currency !== "USD" ||
    response.close_snapshot_id !== request.close_snapshot_id
  ) {
    invalidResponse();
  }
  const finalAmount = money(response.final_amount_minor, response.currency);
  const comparisonResponse = {
    ...response,
    previous_amount_minor:
      response.comparison_status === "not_available"
        ? null
        : response.delta_minor === null
          ? null
          : (
              BigInt(finalAmount.amount_minor) -
              BigInt(response.delta_minor as string)
            ).toString(),
  };
  return Object.freeze({
    result: "created",
    calculation_id: requireUuid(
      response.calculation_id,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    period_id: requireUuid(response.period_id, BILLING_CLOSE_INVALID_RESPONSE),
    close_snapshot_id: request.close_snapshot_id,
    formula_kind: requireEnum(
      response.formula_kind,
      FORMULA_KINDS,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    selected_branch: requireEnum(
      response.selected_branch,
      SELECTED_BRANCHES,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    final_amount: finalAmount,
    close_policy_version: requireEnum(
      response.close_policy_version,
      ["billing-manual-v1", "billing-auto-v1"],
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    snapshot_hash: requireHash(
      response.snapshot_hash,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    explanation_hash: requireHash(
      response.explanation_hash,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    comparison: parseComparison(comparisonResponse, finalAmount.amount_minor),
  });
}

function parseApproveRequest(value: unknown): BillingCalculationApproveRequest {
  const request = requireRecord(value, BILLING_CLOSE_INVALID_REQUEST);
  const required = [
    "account_id",
    "calculation_id",
    "mode",
    "close_policy_version",
    "preview_fingerprint",
    "reason",
    "command_key",
  ];
  if (
    !keysAllowed(request, required, [
      ...required,
      "grant_id",
      "provider_reference",
    ])
  ) {
    invalidRequest();
  }
  const mode = requireEnum(
    request.mode,
    ["manual", "auto"],
    BILLING_CLOSE_INVALID_REQUEST,
  );
  if (
    (mode === "manual" &&
      (request.grant_id !== undefined ||
        request.provider_reference !== undefined)) ||
    (mode === "auto" &&
      (request.grant_id === undefined ||
        request.provider_reference === undefined))
  ) {
    invalidRequest();
  }
  return Object.freeze({
    account_id: requireUuid(request.account_id, BILLING_CLOSE_INVALID_REQUEST),
    calculation_id: requireUuid(
      request.calculation_id,
      BILLING_CLOSE_INVALID_REQUEST,
    ),
    mode,
    close_policy_version: requireEnum(
      request.close_policy_version,
      ["billing-manual-v1", "billing-auto-v1"],
      BILLING_CLOSE_INVALID_REQUEST,
    ),
    preview_fingerprint: requireHash(
      request.preview_fingerprint,
      BILLING_CLOSE_INVALID_REQUEST,
    ),
    reason: requireRequestReason(request.reason),
    command_key: requireCommandKey(request.command_key),
    ...(mode === "auto"
      ? {
          grant_id: requireUuid(
            request.grant_id,
            BILLING_CLOSE_INVALID_REQUEST,
          ),
          provider_reference: requireString(
            request.provider_reference,
            500,
            BILLING_CLOSE_INVALID_REQUEST,
          ),
        }
      : {}),
  });
}

function parseApproveResponse(
  value: unknown,
  request: BillingCalculationApproveRequest,
): BillingCalculationApproveResponse {
  const response = requireRecord(value, BILLING_CLOSE_INVALID_RESPONSE);
  if (
    !keysEqual(response, [
      "result",
      "calculation_id",
      "event_id",
      "mode",
      "close_policy_version",
      "preview_fingerprint",
      "snapshot_hash",
      "approved_amount_minor",
      "currency",
    ]) ||
    response.result !== "approved" ||
    response.calculation_id !== request.calculation_id ||
    response.mode !== request.mode ||
    response.close_policy_version !== request.close_policy_version ||
    response.preview_fingerprint !== request.preview_fingerprint
  ) {
    invalidResponse();
  }
  return Object.freeze({
    result: "approved",
    calculation_id: request.calculation_id,
    event_id: requirePositiveTextId(
      response.event_id,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    mode: request.mode,
    close_policy_version: request.close_policy_version,
    preview_fingerprint: request.preview_fingerprint,
    snapshot_hash: requireHash(
      response.snapshot_hash,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    approved_amount: money(response.approved_amount_minor, response.currency),
  });
}

function parseAdjustmentRequest(
  value: unknown,
): BillingCalculationAdjustmentRequest {
  const request = requireRecord(value, BILLING_CLOSE_INVALID_REQUEST);
  if (
    !keysEqual(request, [
      "account_id",
      "command_key",
      "late_review_event_id",
      "late_submission_id",
      "original_calculation_id",
      "reason",
    ])
  ) {
    invalidRequest();
  }
  return Object.freeze({
    account_id: requireUuid(request.account_id, BILLING_CLOSE_INVALID_REQUEST),
    original_calculation_id: requireUuid(
      request.original_calculation_id,
      BILLING_CLOSE_INVALID_REQUEST,
    ),
    late_submission_id: requireUuid(
      request.late_submission_id,
      BILLING_CLOSE_INVALID_REQUEST,
    ),
    late_review_event_id: requirePositiveTextId(
      request.late_review_event_id,
      BILLING_CLOSE_INVALID_REQUEST,
    ),
    reason: requireRequestReason(request.reason),
    command_key: requireCommandKey(request.command_key),
  });
}

function parseAdjustmentResponse(
  value: unknown,
  request: BillingCalculationAdjustmentRequest,
): BillingCalculationAdjustmentResponse {
  const response = requireRecord(value, BILLING_CLOSE_INVALID_RESPONSE);
  if (
    !keysEqual(response, [
      "result",
      "adjustment_calculation_id",
      "original_calculation_id",
      "late_submission_id",
      "original_amount_minor",
      "actual_amount_minor",
      "delta_minor",
      "treatment",
      "currency",
      "snapshot_hash",
      "relationship_hash",
    ]) ||
    response.original_calculation_id !== request.original_calculation_id ||
    response.late_submission_id !== request.late_submission_id ||
    response.currency !== "USD"
  ) {
    invalidResponse();
  }
  const original = money(response.original_amount_minor, response.currency);
  const actual = money(response.actual_amount_minor, response.currency);
  const delta = money(response.delta_minor, response.currency);
  if (
    BigInt(actual.amount_minor) - BigInt(original.amount_minor) !==
    BigInt(delta.amount_minor)
  ) {
    invalidResponse();
  }
  const treatment = requireEnum(
    response.treatment,
    ["true_up", "no_adjustment", "credit_candidate", "held"],
    BILLING_CLOSE_INVALID_RESPONSE,
  );
  const result = requireEnum(
    response.result,
    ["approved", "no_adjustment", "held"],
    BILLING_CLOSE_INVALID_RESPONSE,
  );
  const possiblePolicies = [
    "next_period_adjustment",
    "credit_candidate",
  ] as const;
  const matchesClassification = possiblePolicies.some((policy) => {
    const classification = classifyBillingAdjustment({
      original_amount_minor: original.amount_minor,
      actual_amount_minor: actual.amount_minor,
      true_up_policy: policy,
    });
    return (
      classification.treatment === treatment && classification.status === result
    );
  });
  if (!matchesClassification) invalidResponse();
  return Object.freeze({
    id: requireUuid(
      response.adjustment_calculation_id,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    original_calculation_id: request.original_calculation_id,
    late_submission_id: request.late_submission_id,
    late_review_event_id: request.late_review_event_id,
    original_amount: original,
    actual_amount: actual,
    delta,
    treatment,
    status: result,
    reason: request.reason,
    snapshot_hash: requireHash(
      response.snapshot_hash,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    relationship_hash: requireHash(
      response.relationship_hash,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
  } satisfies BillingAdjustmentCalculation);
}

function parseLineageRequest(value: unknown): BillingCalculationLineageRequest {
  const request = requireRecord(value, BILLING_CLOSE_INVALID_REQUEST);
  if (!keysEqual(request, ["account_id", "calculation_id"])) invalidRequest();
  return Object.freeze({
    account_id: requireUuid(request.account_id, BILLING_CLOSE_INVALID_REQUEST),
    calculation_id: requireUuid(
      request.calculation_id,
      BILLING_CLOSE_INVALID_REQUEST,
    ),
  });
}

function parseLineageResponse(
  value: unknown,
  request: BillingCalculationLineageRequest,
): BillingCalculationLineage {
  const response = requireRecord(value, BILLING_CLOSE_INVALID_RESPONSE);
  if (
    !keysEqual(response, [
      "calculation",
      "agreement",
      "period",
      "evidence_review",
      "close",
      "formula",
      "policies",
      "approval",
    ])
  ) {
    invalidResponse();
  }
  const calculation = requireRecord(
    response.calculation,
    BILLING_CLOSE_INVALID_RESPONSE,
  );
  const agreement = requireRecord(
    response.agreement,
    BILLING_CLOSE_INVALID_RESPONSE,
  );
  const period = requireRecord(response.period, BILLING_CLOSE_INVALID_RESPONSE);
  const evidenceReview = requireRecord(
    response.evidence_review,
    BILLING_CLOSE_INVALID_RESPONSE,
  );
  const close = requireRecord(response.close, BILLING_CLOSE_INVALID_RESPONSE);
  const formula = requireRecord(
    response.formula,
    BILLING_CLOSE_INVALID_RESPONSE,
  );
  const policies = requireRecord(
    response.policies,
    BILLING_CLOSE_INVALID_RESPONSE,
  );
  const approval = requireRecord(
    response.approval,
    BILLING_CLOSE_INVALID_RESPONSE,
  );
  if (
    !keysEqual(calculation, [
      "id",
      "formula_kind",
      "selected_branch",
      "result_amount_minor",
      "currency",
      "snapshot_hash_prefix",
      "explanation_hash_prefix",
    ]) ||
    !keysEqual(agreement, [
      "id",
      "version_id",
      "signed_evidence_id",
      "terms_hash_prefix",
      "effective_start",
      "effective_end",
    ]) ||
    !keysEqual(period, ["id", "period_start", "period_end", "timezone"]) ||
    !keysEqual(evidenceReview, [
      "submission_id",
      "review_event_id",
      "outcome",
      "exception_id",
      "evidence",
      "evidence_hash_prefix",
    ]) ||
    !keysEqual(close, ["id", "mode", "input_hash_prefix"]) ||
    !keysEqual(formula, [
      "calculation_base_minor",
      "intermediate_numerator",
      "intermediate_denominator",
      "fixed_candidate_minor",
      "minimum_candidate_minor",
      "percentage_candidate_minor",
    ]) ||
    !keysEqual(policies, [
      "currency",
      "rate",
      "rounding",
      "formula",
      "revenue_close",
      "calculation_close",
      "explanation",
    ]) ||
    !keysEqual(approval, ["event_id", "mode", "actor_type"]) ||
    calculation.id !== request.calculation_id ||
    calculation.currency !== "USD" ||
    policies.currency !== "usd-v1" ||
    policies.rate !== "ordinary-percentage-v1" ||
    policies.rounding !== "half-away-from-zero-v1" ||
    policies.formula !== "billing-agreement-formula-v1" ||
    policies.revenue_close !== "revenue-close-v1" ||
    policies.explanation !== "billing-agreement-explanation-v1"
  ) {
    invalidResponse();
  }
  const formulaKind = requireEnum(
    calculation.formula_kind,
    FORMULA_KINDS,
    BILLING_CLOSE_INVALID_RESPONSE,
  );
  const selectedBranch = requireEnum(
    calculation.selected_branch,
    SELECTED_BRANCHES,
    BILLING_CLOSE_INVALID_RESPONSE,
  );
  const result = money(calculation.result_amount_minor, calculation.currency);
  const fixed = nullableMoney(formula.fixed_candidate_minor);
  const minimum = nullableMoney(formula.minimum_candidate_minor);
  const percentage = nullableMoney(formula.percentage_candidate_minor);
  const selected =
    selectedBranch === "fixed"
      ? fixed
      : selectedBranch === "percentage"
        ? percentage
        : minimum;
  if (!selected || selected.amount_minor !== result.amount_minor)
    invalidResponse();
  if (
    !Array.isArray(evidenceReview.evidence) ||
    evidenceReview.evidence.length > 100
  ) {
    invalidResponse();
  }
  const evidence = Object.freeze(
    evidenceReview.evidence.map((item) => {
      const link = requireRecord(item, BILLING_CLOSE_INVALID_RESPONSE);
      if (!keysEqual(link, ["evidence_id", "sha256_prefix", "ordinal"])) {
        invalidResponse();
      }
      return Object.freeze({
        evidence_id: requireUuid(
          link.evidence_id,
          BILLING_CLOSE_INVALID_RESPONSE,
        ),
        sha256_prefix: requireHashPrefix(
          link.sha256_prefix,
          BILLING_CLOSE_INVALID_RESPONSE,
        ),
        ordinal: requireInteger(link.ordinal, 1, 100),
      });
    }),
  );
  return Object.freeze({
    calculation: Object.freeze({
      id: request.calculation_id,
      formula_kind: formulaKind,
      selected_branch: selectedBranch,
      result,
      snapshot_hash_prefix: requireHashPrefix(
        calculation.snapshot_hash_prefix,
        BILLING_CLOSE_INVALID_RESPONSE,
      ),
      explanation_hash_prefix: requireHashPrefix(
        calculation.explanation_hash_prefix,
        BILLING_CLOSE_INVALID_RESPONSE,
      ),
    }),
    agreement: Object.freeze({
      id: requireUuid(agreement.id, BILLING_CLOSE_INVALID_RESPONSE),
      version_id: requireUuid(
        agreement.version_id,
        BILLING_CLOSE_INVALID_RESPONSE,
      ),
      signed_evidence_id: requireUuid(
        agreement.signed_evidence_id,
        BILLING_CLOSE_INVALID_RESPONSE,
      ),
      terms_hash_prefix: requireHashPrefix(
        agreement.terms_hash_prefix,
        BILLING_CLOSE_INVALID_RESPONSE,
      ),
      effective_start: requireDate(
        agreement.effective_start,
        BILLING_CLOSE_INVALID_RESPONSE,
      ),
      effective_end: requireDate(
        agreement.effective_end,
        BILLING_CLOSE_INVALID_RESPONSE,
      ),
    }),
    period: Object.freeze({
      id: requireUuid(period.id, BILLING_CLOSE_INVALID_RESPONSE),
      period_start: requireDate(
        period.period_start,
        BILLING_CLOSE_INVALID_RESPONSE,
      ),
      period_end: requireDate(
        period.period_end,
        BILLING_CLOSE_INVALID_RESPONSE,
      ),
      timezone: requireString(
        period.timezone,
        100,
        BILLING_CLOSE_INVALID_RESPONSE,
      ),
    }),
    evidence_review: Object.freeze({
      submission_id: requireNullableUuid(
        evidenceReview.submission_id,
        BILLING_CLOSE_INVALID_RESPONSE,
      ),
      review_event_id: requirePositiveTextId(
        evidenceReview.review_event_id,
        BILLING_CLOSE_INVALID_RESPONSE,
      ),
      outcome: requireEnum(
        evidenceReview.outcome,
        REVIEW_OUTCOMES,
        BILLING_CLOSE_INVALID_RESPONSE,
      ),
      exception_id: requireNullableUuid(
        evidenceReview.exception_id,
        BILLING_CLOSE_INVALID_RESPONSE,
      ),
      evidence,
      evidence_hash_prefix: requireHashPrefix(
        evidenceReview.evidence_hash_prefix,
        BILLING_CLOSE_INVALID_RESPONSE,
      ),
    }),
    close: Object.freeze({
      id: requireUuid(close.id, BILLING_CLOSE_INVALID_RESPONSE),
      mode: requireEnum(
        close.mode,
        ["accepted_evidence", "minimum_only"],
        BILLING_CLOSE_INVALID_RESPONSE,
      ),
      input_hash_prefix: requireHashPrefix(
        close.input_hash_prefix,
        BILLING_CLOSE_INVALID_RESPONSE,
      ),
    }),
    formula: Object.freeze({
      calculation_base: money(formula.calculation_base_minor),
      intermediate_numerator:
        formula.intermediate_numerator === null
          ? null
          : requireCanonicalIntegerText(
              formula.intermediate_numerator,
              BILLING_CLOSE_INVALID_RESPONSE,
            ),
      intermediate_denominator:
        formula.intermediate_denominator === null
          ? null
          : requireCanonicalIntegerText(
              formula.intermediate_denominator,
              BILLING_CLOSE_INVALID_RESPONSE,
            ),
      fixed_candidate: fixed,
      minimum_candidate: minimum,
      percentage_candidate: percentage,
    }),
    policies: Object.freeze({
      currency: "usd-v1",
      rate: "ordinary-percentage-v1",
      rounding: "half-away-from-zero-v1",
      formula: "billing-agreement-formula-v1",
      revenue_close: "revenue-close-v1",
      calculation_close: requireEnum(
        policies.calculation_close,
        ["billing-manual-v1", "billing-auto-v1"],
        BILLING_CLOSE_INVALID_RESPONSE,
      ),
      explanation: "billing-agreement-explanation-v1",
    }),
    approval: Object.freeze({
      event_id: requirePositiveTextId(
        approval.event_id,
        BILLING_CLOSE_INVALID_RESPONSE,
      ),
      mode: requireEnum(
        approval.mode,
        ["manual", "auto"],
        BILLING_CLOSE_INVALID_RESPONSE,
      ),
      actor_type: requireEnum(
        approval.actor_type,
        ["human", "automation"],
        BILLING_CLOSE_INVALID_RESPONSE,
      ),
    }),
  });
}

function parseBoundedListRequest<
  T extends BillingRevenuePeriodListRequest | BillingCalculationListRequest,
>(value: unknown): T {
  const request = requireRecord(value, BILLING_CLOSE_INVALID_REQUEST);
  if (!keysEqual(request, ["account_id", "page", "per_page"])) invalidRequest();
  return Object.freeze({
    account_id: requireUuid(request.account_id, BILLING_CLOSE_INVALID_REQUEST),
    page: requireRequestInteger(request.page, 1, 1_000_000),
    per_page: requireRequestInteger(request.per_page, 1, 100),
  }) as T;
}

function parseSupportList<T>(value: unknown): T {
  const result = requireRecord(value, BILLING_CLOSE_INVALID_RESPONSE);
  if (
    !keysEqual(result, ["data", "total"]) ||
    !Array.isArray(result.data) ||
    typeof result.total !== "number" ||
    !Number.isSafeInteger(result.total) ||
    result.total < 0
  ) {
    invalidResponse();
  }
  return Object.freeze({
    data: Object.freeze(
      result.data.map((item) =>
        freezeSupportWire(requireRecord(item, BILLING_CLOSE_INVALID_RESPONSE)),
      ),
    ),
    total: result.total,
  }) as T;
}

function parseAdjustmentSupport(value: unknown): BillingAdjustmentCalculation {
  const row = requireRecord(value, BILLING_CLOSE_INVALID_RESPONSE);
  if (
    !keysEqual(row, [
      "id",
      "original_calculation_id",
      "late_submission_id",
      "late_review_event_id",
      "original_amount",
      "actual_amount",
      "delta",
      "treatment",
      "status",
      "reason",
      "snapshot_hash",
      "relationship_hash",
    ])
  ) {
    invalidResponse();
  }
  const parseNestedMoney = (value: unknown) => {
    const nested = requireRecord(value, BILLING_CLOSE_INVALID_RESPONSE);
    if (!keysEqual(nested, ["amount_minor", "currency"])) invalidResponse();
    return money(nested.amount_minor, nested.currency);
  };
  const original = parseNestedMoney(row.original_amount);
  const actual = parseNestedMoney(row.actual_amount);
  const delta = parseNestedMoney(row.delta);
  if (
    BigInt(actual.amount_minor) - BigInt(original.amount_minor) !==
    BigInt(delta.amount_minor)
  ) {
    invalidResponse();
  }
  return Object.freeze({
    id: requireUuid(row.id, BILLING_CLOSE_INVALID_RESPONSE),
    original_calculation_id: requireUuid(
      row.original_calculation_id,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    late_submission_id: requireUuid(
      row.late_submission_id,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    late_review_event_id: requirePositiveStringId(
      row.late_review_event_id,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    original_amount: original,
    actual_amount: actual,
    delta,
    treatment: requireEnum(
      row.treatment,
      ["true_up", "no_adjustment", "credit_candidate", "held"],
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    status: requireEnum(
      row.status,
      ["approved", "no_adjustment", "held"],
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    reason: requireString(row.reason, 1000, BILLING_CLOSE_INVALID_RESPONSE),
    snapshot_hash: requireHash(
      row.snapshot_hash,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
    relationship_hash: requireHash(
      row.relationship_hash,
      BILLING_CLOSE_INVALID_RESPONSE,
    ),
  });
}

function parseCalculationSupportList(
  value: unknown,
): BillingCalculationListResult {
  const result = requireRecord(value, BILLING_CLOSE_INVALID_RESPONSE);
  if (
    !keysEqual(result, ["adjustments", "data", "total"]) ||
    !Array.isArray(result.data) ||
    !Array.isArray(result.adjustments) ||
    typeof result.total !== "number" ||
    !Number.isSafeInteger(result.total) ||
    result.total < 0
  ) {
    invalidResponse();
  }
  return Object.freeze({
    data: Object.freeze(
      result.data.map((item) =>
        freezeSupportWire(requireRecord(item, BILLING_CLOSE_INVALID_RESPONSE)),
      ),
    ) as readonly BillingCalculation[],
    adjustments: Object.freeze(result.adjustments.map(parseAdjustmentSupport)),
    total: result.total,
  });
}

function freezeSupportWire(value: unknown, key = "", depth = 0): unknown {
  if (depth > 20) invalidResponse();
  const isFinancialInteger =
    key === "amount_minor" ||
    key === "numerator" ||
    key === "denominator" ||
    key.endsWith("_minor") ||
    key.endsWith("_numerator") ||
    key.endsWith("_denominator");
  if (isFinancialInteger && value !== null && typeof value !== "string") {
    invalidResponse();
  }
  if (Array.isArray(value)) {
    return Object.freeze(
      value.map((item) => freezeSupportWire(item, key, depth + 1)),
    );
  }
  if (isRecord(value)) {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([nestedKey, nestedValue]) => [
          nestedKey,
          freezeSupportWire(nestedValue, nestedKey, depth + 1),
        ]),
      ),
    );
  }
  return value;
}

async function callRpc<T>(
  rpc: BillingCloseRpc,
  name: RpcName,
  argumentName: "p_payload" | "p_request",
  request: unknown,
  parse: (value: unknown) => T,
  fallback: string,
) {
  const { data, error } = await rpc(name, { [argumentName]: request });
  if (error || data === null) safeRpcError(error, fallback);
  return parse(data);
}

export function createSupabaseBillingCloseProvider({
  rpc,
}: Readonly<{
  rpc: BillingCloseRpc;
}>) {
  const lifecycle = (
    name: Extract<
      RpcName,
      | "submit_billing_agreement_version"
      | "activate_billing_agreement_version"
      | "pause_billing_agreement_version"
      | "terminate_billing_agreement_version"
    >,
    expected: BillingAgreementCommandResponse["result"],
    value: unknown,
  ) => {
    const request = parseLifecycleRequest(value);
    return callRpc(
      rpc,
      name,
      "p_payload",
      request,
      (response) => parseAgreementCommand(response, expected),
      BILLING_CLOSE_COMMAND_FAILED,
    );
  };

  return Object.freeze({
    async listBillingAgreements(
      value: BillingAgreementListRequest,
    ): Promise<BillingAgreementListResult> {
      const request = requireRecord(value, BILLING_CLOSE_INVALID_REQUEST);
      if (!keysEqual(request, ["account_id"])) invalidRequest();
      const parsed = Object.freeze({
        account_id: requireUuid(
          request.account_id,
          BILLING_CLOSE_INVALID_REQUEST,
        ),
      });
      return callRpc(
        rpc,
        "read_billing_agreements",
        "p_request",
        parsed,
        parseAgreementList,
        BILLING_CLOSE_READ_FAILED,
      );
    },
    async saveBillingAgreementDraft(
      value: BillingAgreementDraftRequest,
    ): Promise<BillingAgreementCommandResponse> {
      const request = parseDraftRequest(value);
      return callRpc(
        rpc,
        "save_billing_agreement_draft",
        "p_payload",
        request,
        (response) => parseAgreementCommand(response),
        BILLING_CLOSE_COMMAND_FAILED,
      );
    },
    submitBillingAgreementVersion(value: BillingAgreementLifecycleRequest) {
      return lifecycle("submit_billing_agreement_version", "submitted", value);
    },
    activateBillingAgreementVersion(value: BillingAgreementLifecycleRequest) {
      return lifecycle(
        "activate_billing_agreement_version",
        "activated",
        value,
      );
    },
    pauseBillingAgreementVersion(value: BillingAgreementLifecycleRequest) {
      return lifecycle("pause_billing_agreement_version", "paused", value);
    },
    terminateBillingAgreementVersion(value: BillingAgreementLifecycleRequest) {
      return lifecycle(
        "terminate_billing_agreement_version",
        "terminated",
        value,
      );
    },
    async listBillingRevenuePeriods(
      value: BillingRevenuePeriodListRequest,
    ): Promise<BillingRevenuePeriodListResult> {
      const request =
        parseBoundedListRequest<BillingRevenuePeriodListRequest>(value);
      return callRpc(
        rpc,
        "read_billing_revenue_periods",
        "p_request",
        request,
        parseSupportList<BillingRevenuePeriodListResult>,
        BILLING_CLOSE_READ_FAILED,
      );
    },
    async ensureBillingRevenuePeriod(
      value: BillingRevenuePeriodEnsureRequest,
    ): Promise<BillingRevenuePeriodEnsureResponse> {
      const request = parsePeriodEnsureRequest(value);
      return callRpc(
        rpc,
        "ensure_billing_revenue_period",
        "p_payload",
        request,
        parsePeriodEnsureResponse,
        BILLING_CLOSE_COMMAND_FAILED,
      );
    },
    async submitBillingRevenueRevision(
      value: BillingRevenueSubmissionRequest,
    ): Promise<BillingRevenueSubmissionResponse> {
      const request = parseSubmissionRequest(value);
      return callRpc(
        rpc,
        "submit_billing_revenue_revision",
        "p_payload",
        request,
        parseSubmissionResponse,
        BILLING_CLOSE_COMMAND_FAILED,
      );
    },
    async reviewBillingRevenueRevision(
      value: BillingRevenueReviewRequest,
    ): Promise<BillingRevenueReviewResponse> {
      const request = parseReviewRequest(value);
      return callRpc(
        rpc,
        "review_billing_revenue_revision",
        "p_payload",
        request,
        parseReviewResponse,
        BILLING_CLOSE_COMMAND_FAILED,
      );
    },
    async closeBillingRevenuePeriod(
      value: BillingRevenueCloseRequest,
    ): Promise<BillingRevenueCloseResponse> {
      const request = parseCloseRequest(value);
      return callRpc(
        rpc,
        "close_billing_revenue_period",
        "p_payload",
        request,
        parseCloseResponse,
        BILLING_CLOSE_COMMAND_FAILED,
      );
    },
    async listBillingCalculations(
      value: BillingCalculationListRequest,
    ): Promise<BillingCalculationListResult> {
      const request =
        parseBoundedListRequest<BillingCalculationListRequest>(value);
      return callRpc(
        rpc,
        "read_billing_calculations",
        "p_request",
        request,
        parseCalculationSupportList,
        BILLING_CLOSE_READ_FAILED,
      );
    },
    async getBillingCalculationLineage(
      value: BillingCalculationLineageRequest,
    ): Promise<BillingCalculationLineage> {
      const request = parseLineageRequest(value);
      return callRpc(
        rpc,
        "read_billing_calculation_lineage",
        "p_request",
        request,
        (response) => parseLineageResponse(response, request),
        BILLING_CLOSE_READ_FAILED,
      );
    },
    async previewBillingCalculation(
      value: BillingCalculationPreviewRequest,
    ): Promise<BillingCalculationPreview> {
      const request = parsePreviewRequest(value);
      return callRpc(
        rpc,
        "preview_billing_calculation",
        "p_request",
        request,
        (response) => parseBillingCalculationPreviewResponse(response, request),
        BILLING_CLOSE_COMMAND_FAILED,
      );
    },
    async createBillingCalculation(
      value: BillingCalculationCreateRequest,
    ): Promise<BillingCalculationCreateResponse> {
      const request = parseCreateRequest(value);
      return callRpc(
        rpc,
        "create_billing_calculation",
        "p_request",
        request,
        (response) => parseCreateResponse(response, request),
        BILLING_CLOSE_COMMAND_FAILED,
      );
    },
    async approveBillingCalculation(
      value: BillingCalculationApproveRequest,
    ): Promise<BillingCalculationApproveResponse> {
      const request = parseApproveRequest(value);
      return callRpc(
        rpc,
        "approve_billing_calculation",
        "p_request",
        request,
        (response) => parseApproveResponse(response, request),
        BILLING_CLOSE_COMMAND_FAILED,
      );
    },
    async createBillingAdjustmentCalculation(
      value: BillingCalculationAdjustmentRequest,
    ): Promise<BillingCalculationAdjustmentResponse> {
      const request = parseAdjustmentRequest(value);
      return callRpc(
        rpc,
        "create_billing_adjustment_calculation",
        "p_request",
        request,
        (response) => parseAdjustmentResponse(response, request),
        BILLING_CLOSE_COMMAND_FAILED,
      );
    },
  });
}

export type SupabaseBillingCloseProvider = ReturnType<
  typeof createSupabaseBillingCloseProvider
>;
