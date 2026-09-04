import { describe, expect, it, vi } from "vitest";

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
import { createSupabaseBillingCloseProvider } from "../providers/supabase/billingCloseProvider";
import { createFakeBillingCloseProvider } from "../providers/fakerest/billingCloseProvider";
import { DEMO_BILLING_CLOSE_SCENARIOS } from "../providers/fakerest/dataGenerator/billingAccounts";
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
  organization_id: "44000000-0000-4000-8000-000000000010",
  account_id: uuid,
  agreement_id: uuid,
  agreement_version_id: uuid,
  period_id: uuid,
  period_start: "2026-09-01",
  period_end: "2026-10-01",
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

const rawAgreement = Object.freeze({
  agreement_id: uuid,
  version_id: "44000000-0000-4000-8000-000000000002",
  agreement_family: "primary",
  cadence: "monthly",
  state: "active",
  latest_event: "activated",
  version_number: 1,
  effective_start: "2026-09-01",
  effective_end: "2027-09-01",
  formula_kind: "hybrid",
  fixed_amount_minor: null,
  minimum_amount_minor: "50000",
  rate_numerator: "1",
  rate_denominator: "10",
  submitted_percentage: "10%",
  currency: "USD",
  currency_policy_version: "usd-v1",
  rate_policy_version: "ordinary-percentage-v1",
  rounding_policy_version: "half-away-from-zero-v1",
  formula_version: "billing-agreement-formula-v1",
  explanation_version: "billing-agreement-explanation-v1",
  signed_evidence_id: "44000000-0000-4000-8000-000000000003",
  signed_evidence_sha256: fingerprint,
  terms_fingerprint: fingerprint,
  self_approved: false,
  lifecycle_events: [
    {
      event_id: "1",
      event_type: "activated",
      actor_id: "44000000-0000-4000-8000-000000000004",
      actor_role: "administrator",
      reason: "Approved synthetic agreement",
      created_at: "2026-09-01T20:00:00.000Z",
    },
  ],
  rules: {
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
  },
});

const rawPreview = Object.freeze({
  preview_version: "billing-calculation-preview-v1",
  organization_id: "44000000-0000-4000-8000-000000000010",
  account_id: uuid,
  agreement_id: rawAgreement.agreement_id,
  agreement_version_id: rawAgreement.version_id,
  period_id: "44000000-0000-4000-8000-000000000011",
  period_start: "2026-09-01",
  period_end: "2026-10-01",
  close_snapshot_id: "44000000-0000-4000-8000-000000000012",
  close_mode: "accepted_evidence",
  close_input_fingerprint: fingerprint,
  terms_fingerprint: fingerprint,
  gross_amount_minor: "825000",
  excluded_amount_minor: "0",
  source_commissionable_amount_minor: "825000",
  calculation_base_minor: "825000",
  provenance_kind: "statement",
  provenance_source_id: "statement-2026-09",
  evidence_fingerprint: fingerprint,
  formula_kind: "hybrid",
  fixed_amount_minor: null,
  minimum_amount_minor: "50000",
  rate_numerator: "1",
  rate_denominator: "10",
  submitted_percentage: "10%",
  intermediate_numerator: "825000",
  intermediate_denominator: "10",
  fixed_candidate_minor: null,
  minimum_candidate_minor: "50000",
  percentage_candidate_minor: "82500",
  selected_branch: "percentage",
  final_amount_minor: "82500",
  currency: "USD",
  currency_policy_version: "usd-v1",
  rate_policy_version: "ordinary-percentage-v1",
  rounding_policy_version: "half-away-from-zero-v1",
  formula_version: "billing-agreement-formula-v1",
  revenue_close_policy_version: "revenue-close-v1",
  close_policy_version: "billing-manual-v1",
  close_policy: {
    mode: "manual",
    active: true,
    organization_id: null,
    account_id: null,
    allowed_account_statuses: ["active"],
    allowed_formula_kinds: ["hybrid"],
    allowed_close_modes: ["accepted_evidence"],
    allowed_provenance_kinds: ["statement"],
    require_zero_anomalies: true,
    minimum_result_minor: "0",
    maximum_result_minor: null,
    effective_from: "2026-01-01T00:00:00+00:00",
    effective_until: null,
  },
  explanation_version: "billing-agreement-explanation-v1",
  anomalies: [],
  comparison_status: "not_available",
  previous_calculation_id: null,
  previous_amount_minor: null,
  delta_minor: null,
  delta_rate_numerator: null,
  delta_rate_denominator: null,
  result: "preview",
  preview_fingerprint: fingerprint,
});

describe("Supabase Phase 4 RPC translation", () => {
  it("uses exact named RPCs and returns frozen decoded agreement records", async () => {
    const rpc = vi.fn(async () => ({
      data: { data: [rawAgreement] },
      error: null,
    }));
    const provider = createSupabaseBillingCloseProvider({ rpc });

    const response = await provider.listBillingAgreements({
      account_id: uuid,
    });

    expect(rpc).toHaveBeenCalledWith("read_billing_agreements", {
      p_request: { account_id: uuid },
    });
    expect(response.data[0]).toMatchObject({
      state: "active",
      minimum_amount: { amount_minor: "50000", currency: "USD" },
      rate: { numerator: "1", denominator: "10" },
    });
    expect(Object.isFrozen(response.data[0])).toBe(true);
  });

  it("rejects numeric lifecycle identifiers in agreement history", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        data: [
          {
            ...rawAgreement,
            lifecycle_events: [
              { ...rawAgreement.lifecycle_events[0], event_id: 1 },
            ],
          },
        ],
      },
      error: null,
    }));
    const provider = createSupabaseBillingCloseProvider({ rpc });

    await expect(
      provider.listBillingAgreements({ account_id: uuid }),
    ).rejects.toThrow("BILLING_CLOSE_INVALID_RESPONSE");
  });

  it("reconciles every exact preview candidate before returning it", async () => {
    const rpc = vi.fn(async () => ({ data: rawPreview, error: null }));
    const provider = createSupabaseBillingCloseProvider({ rpc });

    const response = await provider.previewBillingCalculation({
      account_id: uuid,
      close_snapshot_id: rawPreview.close_snapshot_id,
    });

    expect(rpc).toHaveBeenCalledWith("preview_billing_calculation", {
      p_request: {
        account_id: uuid,
        close_snapshot_id: rawPreview.close_snapshot_id,
      },
    });
    expect(response).toMatchObject({
      selected_branch: "percentage",
      final_amount: { amount_minor: "82500", currency: "USD" },
      comparison: { status: "unavailable" },
    });
  });

  it("uses bounded account-scoped RPCs for support lists", async () => {
    const rpc = vi.fn(async () => ({
      data: { data: [], total: 0 },
      error: null,
    }));
    const provider = createSupabaseBillingCloseProvider({ rpc });

    await expect(
      provider.listBillingRevenuePeriods({
        account_id: uuid,
        page: 1,
        per_page: 25,
      }),
    ).resolves.toEqual({ data: [], total: 0 });
    await expect(
      provider.listBillingCalculations({
        account_id: uuid,
        page: 1,
        per_page: 25,
      }),
    ).resolves.toEqual({ data: [], total: 0 });
    expect(rpc).toHaveBeenNthCalledWith(1, "read_billing_revenue_periods", {
      p_request: { account_id: uuid, page: 1, per_page: 25 },
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "read_billing_calculations", {
      p_request: { account_id: uuid, page: 1, per_page: 25 },
    });
  });

  it("fails closed when a support list carries numeric financial tokens", async () => {
    const rpc = vi.fn(async () => ({
      data: {
        data: [
          {
            id: uuid,
            final_amount: { amount_minor: 82500, currency: "USD" },
          },
        ],
        total: 1,
      },
      error: null,
    }));
    const provider = createSupabaseBillingCloseProvider({ rpc });

    await expect(
      provider.listBillingCalculations({
        account_id: uuid,
        page: 1,
        per_page: 25,
      }),
    ).rejects.toThrow("BILLING_CLOSE_INVALID_RESPONSE");
  });

  it.each([
    ["numeric money", { final_amount_minor: 82500 }],
    ["wrong exact total", { final_amount_minor: "82499" }],
    ["wrong branch", { selected_branch: "minimum" }],
    ["wrong rate", { rate_numerator: "2" }],
    ["unknown policy", { rounding_policy_version: "bankers-v1" }],
    ["cross-account response", { account_id: rawPreview.organization_id }],
    ["unknown response key", { customer_secret: "must-not-pass" }],
  ])("rejects malformed preview output: %s", async (_name, mutation) => {
    const rpc = vi.fn(async () => ({
      data: { ...rawPreview, ...mutation },
      error: null,
    }));
    const provider = createSupabaseBillingCloseProvider({ rpc });

    await expect(
      provider.previewBillingCalculation({
        account_id: uuid,
        close_snapshot_id: rawPreview.close_snapshot_id,
      }),
    ).rejects.toThrow("BILLING_CLOSE_INVALID_RESPONSE");
  });

  it("preserves allowlisted denial codes without reflecting raw server detail", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: {
        message:
          "contract prose and tenant object path: AGREEMENT_NOT_AUTHORIZED",
      },
    }));
    const provider = createSupabaseBillingCloseProvider({ rpc });

    await expect(
      provider.activateBillingAgreementVersion({
        version_id: rawAgreement.version_id,
        reason: "Approved commercial terms",
        command_key: "agreement-activate-0001",
      }),
    ).rejects.toThrow("AGREEMENT_NOT_AUTHORIZED");
  });
});

describe("FakeRest Phase 4 provider parity", () => {
  it("starts each factory from byte-equivalent isolated state", async () => {
    const first = createFakeBillingCloseProvider();
    const second = createFakeBillingCloseProvider();

    expect(first.inspectBillingCloseState()).toEqual(
      second.inspectBillingCloseState(),
    );
    for (const method of billingCloseProviderMethodKeys) {
      expect(first[method]).toBeTypeOf("function");
    }
    await first.saveBillingAgreementDraft(agreementDrafts[0]);
    expect(first.inspectBillingCloseState()).not.toEqual(
      second.inspectBillingCloseState(),
    );
    expect(createFakeBillingCloseProvider().inspectBillingCloseState()).toEqual(
      second.inspectBillingCloseState(),
    );
  });

  it("replays identical agreement commands and conflicts before mutation", async () => {
    const provider = createFakeBillingCloseProvider();
    const draft = {
      ...agreementDrafts[3],
      command_key: "fake-agreement-save-0001",
    };

    const created = await provider.saveBillingAgreementDraft(draft);
    await expect(provider.saveBillingAgreementDraft(draft)).resolves.toEqual(
      created,
    );
    const beforeConflict = provider.inspectBillingCloseState();
    await expect(
      provider.saveBillingAgreementDraft({
        ...draft,
        effective_end: "2027-10-01",
      }),
    ).rejects.toThrow("AGREEMENT_IDEMPOTENCY_CONFLICT");
    expect(provider.inspectBillingCloseState()).toEqual(beforeConflict);
  });

  it("runs exact revenue close, preview, create, approval, and late adjustment", async () => {
    const provider = createFakeBillingCloseProvider();
    const scenario = DEMO_BILLING_CLOSE_SCENARIOS.hybrid;
    const submission = await provider.submitBillingRevenueRevision({
      account_id: scenario.account_id,
      period_id: scenario.period_id,
      gross_amount: parseUsdMoney({
        amount_minor: "825000",
        currency: "USD",
      }),
      excluded_amount: parseUsdMoney({ amount_minor: "0", currency: "USD" }),
      commissionable_amount: parseUsdMoney({
        amount_minor: "825000",
        currency: "USD",
      }),
      provenance_kind: "statement",
      provenance_source_id: "statement-2026-09",
      attestation: { accurate: true, text: "Synthetic demo attestation" },
      evidence_ids: [scenario.evidence_id],
      command_key: "fake-revenue-submit-0001",
    });
    const review = await provider.reviewBillingRevenueRevision({
      account_id: scenario.account_id,
      period_id: scenario.period_id,
      submission_id: submission.submission_id,
      outcome: "accept",
      reason_code: "REVENUE_ACCEPTED",
      reason: "Synthetic evidence accepted",
      exception: null,
      command_key: "fake-revenue-review-0001",
    });
    const close = await provider.closeBillingRevenuePeriod({
      account_id: scenario.account_id,
      period_id: scenario.period_id,
      close_mode: "accepted_evidence",
      review_event_id: review.review_event_id,
      reason: "Close accepted synthetic revenue",
      command_key: "fake-revenue-close-0001",
    });
    const calculated = await provider.previewBillingCalculation({
      account_id: scenario.account_id,
      close_snapshot_id: close.close_snapshot_id,
    });
    expect(calculated.final_amount.amount_minor).toBe("82500");
    const created = await provider.createBillingCalculation({
      account_id: scenario.account_id,
      close_snapshot_id: close.close_snapshot_id,
      preview_fingerprint: calculated.preview_fingerprint,
      command_key: "fake-calculation-create-0001",
    });
    await expect(
      provider.createBillingCalculation({
        account_id: scenario.account_id,
        close_snapshot_id: close.close_snapshot_id,
        preview_fingerprint: fingerprint,
        command_key: "fake-calculation-stale-0001",
      }),
    ).rejects.toThrow("CALCULATION_PREVIEW_STALE");
    await expect(
      provider.approveBillingCalculation({
        account_id: scenario.account_id,
        calculation_id: created.calculation_id,
        mode: "manual",
        close_policy_version: "billing-manual-v1",
        preview_fingerprint: calculated.preview_fingerprint,
        reason: "Approve deterministic demo close",
        command_key: "fake-calculation-approve-0001",
      }),
    ).resolves.toMatchObject({
      result: "approved",
      approved_amount: { amount_minor: "82500", currency: "USD" },
    });
    await expect(
      provider.createBillingAdjustmentCalculation({
        account_id: scenario.account_id,
        original_calculation_id: created.calculation_id,
        late_submission_id: scenario.late_submission_id,
        late_review_event_id: scenario.late_review_event_id,
        reason: "Recognize accepted late evidence",
        command_key: "fake-adjustment-create-0001",
      }),
    ).resolves.toMatchObject({
      original_amount: { amount_minor: "82500", currency: "USD" },
      actual_amount: { amount_minor: "90000", currency: "USD" },
      delta: { amount_minor: "7500", currency: "USD" },
      treatment: "true_up",
      status: "approved",
    });
  });

  it("uses safe denials and blocks anomalous calculations", async () => {
    const denied = createFakeBillingCloseProvider({ capabilities: [] });
    await expect(
      denied.listBillingAgreements({
        account_id: DEMO_BILLING_CLOSE_SCENARIOS.fixed.account_id,
      }),
    ).rejects.toThrow("AGREEMENT_READ_NOT_AUTHORIZED");

    const provider = createFakeBillingCloseProvider();
    const hybrid = DEMO_BILLING_CLOSE_SCENARIOS.hybrid;
    await expect(
      provider.submitBillingRevenueRevision({
        account_id: hybrid.account_id,
        period_id: hybrid.period_id,
        gross_amount: parseUsdMoney({ amount_minor: "1", currency: "USD" }),
        excluded_amount: parseUsdMoney({ amount_minor: "0", currency: "USD" }),
        commissionable_amount: parseUsdMoney({
          amount_minor: "1",
          currency: "USD",
        }),
        provenance_kind: "statement",
        provenance_source_id: "unknown-evidence-demo",
        attestation: { accurate: true, text: "Synthetic demo attestation" },
        evidence_ids: ["44000000-0000-4000-8000-000000000099"],
        command_key: "fake-unknown-evidence-0001",
      }),
    ).rejects.toThrow("REVENUE_EVIDENCE_INVALID");
    const scenario = DEMO_BILLING_CLOSE_SCENARIOS.minimum_exception;
    const previewResult = await provider.previewBillingCalculation({
      account_id: scenario.account_id,
      close_snapshot_id: scenario.close_snapshot_id,
    });
    expect(previewResult.anomalies).toContainEqual({
      code: "OPEN_CLOSE_EXCEPTION",
      status: "fail",
      blocking: true,
    });
    await expect(
      provider.createBillingCalculation({
        account_id: scenario.account_id,
        close_snapshot_id: scenario.close_snapshot_id,
        preview_fingerprint: previewResult.preview_fingerprint,
        command_key: "fake-anomalous-create-0001",
      }),
    ).rejects.toThrow("CALCULATION_POLICY_MISMATCH");
  });
});
