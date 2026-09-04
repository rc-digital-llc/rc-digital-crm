import { describe, expect, it } from "vitest";

import type {
  BillingAgreementDraftRequest,
  BillingCalculationPreview,
  BillingRevenueReviewRequest,
} from "../providers/types";
import {
  billingCloseProviderMethodKeys,
  billingCloseResourceNames,
  billingPhase4ContractValues,
} from "../providers/types";
import { parseOrdinaryPercentage, parseUsdMoney } from "./exactMoney";

const uuid = "44000000-0000-4000-8000-000000000001";
const fingerprint = "a".repeat(64);

const agreementDrafts = [
  {
    account_id: uuid,
    agreement_family: "primary",
    command_key: "agreement-fixed-0001",
    effective_start: "2026-09-01",
    effective_end: "2027-09-01",
    formula_kind: "fixed",
    fixed_amount: parseUsdMoney({ amount_minor: "50000", currency: "USD" }),
    minimum_amount: null,
    percentage: null,
    signed_evidence_id: uuid,
  },
  {
    account_id: uuid,
    agreement_family: "primary",
    command_key: "agreement-percentage-0001",
    effective_start: "2026-09-01",
    effective_end: "2027-09-01",
    formula_kind: "percentage",
    fixed_amount: null,
    minimum_amount: null,
    percentage: parseOrdinaryPercentage("10%"),
    signed_evidence_id: uuid,
  },
  {
    account_id: uuid,
    agreement_family: "primary",
    command_key: "agreement-minimum-0001",
    effective_start: "2026-09-01",
    effective_end: "2027-09-01",
    formula_kind: "minimum_support",
    fixed_amount: null,
    minimum_amount: parseUsdMoney({ amount_minor: "50000", currency: "USD" }),
    percentage: null,
    signed_evidence_id: uuid,
  },
  {
    account_id: uuid,
    agreement_family: "primary",
    command_key: "agreement-hybrid-0001",
    effective_start: "2026-09-01",
    effective_end: "2027-09-01",
    formula_kind: "hybrid",
    fixed_amount: null,
    minimum_amount: parseUsdMoney({ amount_minor: "50000", currency: "USD" }),
    percentage: parseOrdinaryPercentage("10%"),
    signed_evidence_id: uuid,
  },
].map(
  (draft) =>
    ({
      ...draft,
      timezone: "America/Chicago",
      timing_basis: "cash",
      included_amounts: ["service_revenue"],
      excluded_amounts: ["sales_tax"],
      tax_treatment: "exclude",
      refund_chargeback_policy: "next_period_adjustment",
      cutoff_day: 10,
      dispute_policy: "hold_close",
      missing_report_policy: "minimum_only",
      true_up_policy: "credit_candidate",
      evidence_priority: ["api", "statement", "portal"],
    }) satisfies BillingAgreementDraftRequest,
);

const reviewRequests: BillingRevenueReviewRequest[] = [
  {
    account_id: uuid,
    period_id: uuid,
    submission_id: uuid,
    outcome: "accept",
    reason_code: "REVENUE_ACCEPTED",
    reason: "Reviewed against clean evidence",
    exception: null,
    command_key: "revenue-accept-0001",
  },
  ...billingPhase4ContractValues.review_outcomes
    .filter((outcome) => outcome !== "accept")
    .map(
      (outcome): BillingRevenueReviewRequest => ({
        account_id: uuid,
        period_id: uuid,
        submission_id: uuid,
        outcome,
        reason_code: "ANOMALOUS_REVENUE",
        reason: "Requires another review",
        exception: {
          kind: "ANOMALOUS_REVENUE",
          owner_id: uuid,
          next_action: "Compare the submitted statement",
          due_at: "2026-09-20T00:00:00.000Z",
          amount_at_risk: parseUsdMoney({
            amount_minor: "10000",
            currency: "USD",
          }),
        },
        command_key: `revenue-${outcome}-0001`,
      }),
    ),
];

const preview: BillingCalculationPreview = {
  result: "preview",
  account_id: uuid,
  agreement_id: uuid,
  agreement_version_id: uuid,
  period_id: uuid,
  close_snapshot_id: uuid,
  close_mode: "accepted_evidence",
  gross_amount: parseUsdMoney({ amount_minor: "825000", currency: "USD" }),
  excluded_amount: parseUsdMoney({ amount_minor: "0", currency: "USD" }),
  source_commissionable_amount: parseUsdMoney({
    amount_minor: "825000",
    currency: "USD",
  }),
  calculation_base: parseUsdMoney({ amount_minor: "825000", currency: "USD" }),
  provenance_kind: "statement",
  provenance_source_id: "statement-2026-09",
  evidence_fingerprint: fingerprint,
  close_input_fingerprint: fingerprint,
  terms_fingerprint: fingerprint,
  formula_kind: "hybrid",
  fixed_amount: null,
  minimum_amount: parseUsdMoney({ amount_minor: "50000", currency: "USD" }),
  rate: parseOrdinaryPercentage("10%"),
  intermediate_numerator: "8250000",
  intermediate_denominator: "100",
  fixed_candidate: null,
  minimum_candidate: parseUsdMoney({ amount_minor: "50000", currency: "USD" }),
  percentage_candidate: parseUsdMoney({
    amount_minor: "82500",
    currency: "USD",
  }),
  selected_branch: "percentage",
  final_amount: parseUsdMoney({ amount_minor: "82500", currency: "USD" }),
  currency_policy_version: "usd-v1",
  rate_policy_version: "ordinary-percentage-v1",
  rounding_policy_version: "half-away-from-zero-v1",
  formula_version: "billing-agreement-formula-v1",
  revenue_close_policy_version: "revenue-close-v1",
  close_policy_version: "billing-manual-v1",
  explanation_version: "billing-agreement-explanation-v1",
  close_policy: {
    mode: "manual",
    active: true,
    allowed_account_statuses: ["active"],
    allowed_formula_kinds: ["hybrid"],
    allowed_close_modes: ["accepted_evidence"],
    allowed_provenance_kinds: ["statement"],
    require_zero_anomalies: true,
    minimum_result: parseUsdMoney({ amount_minor: "0", currency: "USD" }),
    maximum_result: null,
    effective_from: "2026-09-01T00:00:00.000Z",
    effective_until: null,
  },
  anomalies: [],
  comparison: {
    status: "unavailable",
    previous_calculation_id: null,
    previous_amount: null,
    delta: null,
    delta_rate: null,
  },
  explanation: {
    kind: "hybrid",
    selected_branch: "percentage",
    final_amount: parseUsdMoney({ amount_minor: "82500", currency: "USD" }),
  },
  preview_fingerprint: fingerprint,
};

describe("Phase 4 billing-close provider contract", () => {
  it("registers every command and bounded support read exactly once", () => {
    expect(billingCloseProviderMethodKeys).toEqual([
      "listBillingAgreements",
      "saveBillingAgreementDraft",
      "submitBillingAgreementVersion",
      "activateBillingAgreementVersion",
      "pauseBillingAgreementVersion",
      "terminateBillingAgreementVersion",
      "listBillingRevenuePeriods",
      "ensureBillingRevenuePeriod",
      "submitBillingRevenueRevision",
      "reviewBillingRevenueRevision",
      "closeBillingRevenuePeriod",
      "listBillingCalculations",
      "getBillingCalculationLineage",
      "previewBillingCalculation",
      "createBillingCalculation",
      "approveBillingCalculation",
      "createBillingAdjustmentCalculation",
    ]);
    expect(new Set(billingCloseProviderMethodKeys).size).toBe(
      billingCloseProviderMethodKeys.length,
    );
  });

  it("exposes semantic read resources without generic command resources", () => {
    expect(billingCloseResourceNames).toEqual([
      "billing_agreements_support_safe",
      "billing_revenue_periods_support_safe",
      "billing_calculations_support_safe",
      "billing_calculation_lineage_support_safe",
    ]);
    expect(billingCloseResourceNames.join(" ")).not.toMatch(
      /activate|approve|close|create|pause|review|submit|terminate/,
    );
  });

  it("closes every lifecycle, formula, review, exception, and adjustment value", () => {
    expect(billingPhase4ContractValues).toEqual({
      agreement_states: [
        "draft",
        "pending_review",
        "active",
        "paused",
        "superseded",
        "terminated",
      ],
      formula_kinds: ["fixed", "percentage", "minimum_support", "hybrid"],
      review_outcomes: ["accept", "reject", "request_correction", "hold"],
      exception_reasons: [
        "MISSING_EVIDENCE",
        "CONFLICTING_EVIDENCE",
        "LATE_EVIDENCE",
        "ANOMALOUS_REVENUE",
        "HELD_EVIDENCE",
        "UNVERIFIED_EVIDENCE",
      ],
      adjustment_treatments: [
        "true_up",
        "no_adjustment",
        "credit_candidate",
        "held",
      ],
    });
    expect(agreementDrafts.map((draft) => draft.formula_kind)).toEqual(
      billingPhase4ContractValues.formula_kinds,
    );
    expect(reviewRequests).toHaveLength(4);
    expect(preview.final_amount.amount_minor).toBe("82500");
    expect(JSON.stringify({ agreementDrafts, preview })).not.toMatch(
      /"(?:amount_minor|numerator|denominator|delta_minor)":-?[0-9]+[,}]/,
    );
  });
});
