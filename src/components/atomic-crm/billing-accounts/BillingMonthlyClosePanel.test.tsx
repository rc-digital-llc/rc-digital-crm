import fs from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { parseExactRatio, parseUsdMoney } from "../financial/exactMoney";
import type { BillingRevenuePeriodSummary } from "../providers/types";
import type {
  BillingAgreementVersion,
  BillingCalculationComparison,
} from "../types";
import {
  calculationBranchLabel,
  formatCalculationComparison,
  formatExactDeltaRate,
} from "./BillingCalculationPreview";
import {
  buildBillingRevenueRevisionRequest,
  validateBillingRevenueRevisionForm,
  type BillingRevenueRevisionFormValues,
} from "./BillingRevenueRevisionForm";
import {
  canApproveMinimumClose,
  revenuePeriodStatusLabel,
  submissionStatusLabel,
} from "./BillingMonthlyClosePanel";

const accountId = "31000000-0000-4000-8000-000000000200";
const periodId = "31000000-0000-4000-8000-000000004200";
const evidenceId = "31000000-0000-4000-8000-000000000600";

const baseValues: BillingRevenueRevisionFormValues = {
  gross_amount_usd: "$8,250.00",
  excluded_amount_usd: "$250.00",
  provenance_kind: "statement",
  provenance_source_id: "statement-2026-09",
  attestation_accurate: true,
  attestation_text: "I verified this statement against the source record.",
  evidence_ids: [evidenceId],
};

const periodSummary: BillingRevenuePeriodSummary = {
  period: {
    id: periodId,
    organization_id: "31000000-0000-4000-8000-000000000100",
    account_id: accountId,
    agreement_id: "31000000-0000-4000-8000-000000001200",
    agreement_version_id: "31000000-0000-4000-8000-000000002200",
    period_start: "2026-09-01",
    period_end: "2026-10-01",
    timezone: "America/Chicago",
    submission_deadline_at: "2026-10-10T05:00:00.000Z",
    state: "open",
    created_at: "2026-09-01T20:00:00.000Z",
  },
  submissions: [],
  reviews: [],
  exceptions: [],
  close_snapshot: null,
};

const agreement = {
  state: "active",
  rules: { missing_report_policy: "minimum_only" },
} as BillingAgreementVersion;

describe("billing revenue revision form", () => {
  it("builds one exact string-safe revision request", () => {
    const request = buildBillingRevenueRevisionRequest(baseValues, {
      account_id: accountId,
      period_id: periodId,
      command_key: "revenue-revision-0001",
    });

    expect(request).toMatchObject({
      gross_amount: parseUsdMoney({
        amount_minor: "825000",
        currency: "USD",
      }),
      excluded_amount: parseUsdMoney({
        amount_minor: "25000",
        currency: "USD",
      }),
      commissionable_amount: parseUsdMoney({
        amount_minor: "800000",
        currency: "USD",
      }),
      provenance_kind: "statement",
      evidence_ids: [evidenceId],
      attestation: {
        accurate: true,
        text: baseValues.attestation_text,
      },
    });
    expect(JSON.stringify(request)).not.toMatch(
      /"(?:amount_minor|numerator|denominator)":-?[0-9]+[,}]/,
    );
  });

  it.each([
    ["ambiguous gross", { gross_amount_usd: "8250.0" }],
    ["numeric authority", { gross_amount_usd: 8250 as unknown as string }],
    ["excluded above gross", { excluded_amount_usd: "$9,000.00" }],
    ["missing provenance", { provenance_source_id: "" }],
    ["missing attestation", { attestation_text: "" }],
    ["unchecked attestation", { attestation_accurate: false }],
    ["missing evidence", { evidence_ids: [] }],
  ])("rejects %s before provider submission", (_name, mutation) => {
    const onSave = vi.fn();
    const values = { ...baseValues, ...mutation };

    expect(validateBillingRevenueRevisionForm(values)).not.toEqual({});
    expect(() =>
      buildBillingRevenueRevisionRequest(values, {
        account_id: accountId,
        period_id: periodId,
        command_key: "revenue-invalid-0001",
      }),
    ).toThrow("REVENUE_FORM_INVALID");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("uses grouped text inputs, clean evidence selection, and no number input", () => {
    const source = fs.readFileSync(
      new URL("./BillingRevenueRevisionForm.tsx", import.meta.url),
      "utf8",
    );

    for (const copy of [
      "Exact revenue amounts",
      "Source provenance",
      "Clean source evidence",
      "Revenue attestation",
      "Gross revenue",
      "Excluded revenue",
      "Commissionable revenue",
    ]) {
      expect(source).toContain(copy);
    }
    expect(source).toContain('inspection_status === "clean"');
    expect(source).toContain("h-11");
    expect(source).not.toMatch(/type=["']number["']/);
  });
});

describe("monthly revenue review workflow", () => {
  it("derives literal period and submission states from immutable history", () => {
    expect(revenuePeriodStatusLabel(periodSummary)).toBe("Needs evidence");
    expect(
      revenuePeriodStatusLabel({
        ...periodSummary,
        submissions: [
          {
            id: "31000000-0000-4000-8000-000000007200",
          } as BillingRevenuePeriodSummary["submissions"][number],
        ],
      }),
    ).toBe("Under review");
    expect(submissionStatusLabel(undefined)).toBe("Submitted");
    expect(submissionStatusLabel("request_correction")).toBe(
      "Correction requested",
    );
  });

  it("permits minimum-only close only after deadline and an open exception", () => {
    const held = {
      ...periodSummary,
      reviews: [
        {
          id: "1",
          outcome: "hold",
        } as BillingRevenuePeriodSummary["reviews"][number],
      ],
      exceptions: [
        {
          id: "31000000-0000-4000-8000-000000008200",
          status: "open",
        } as BillingRevenuePeriodSummary["exceptions"][number],
      ],
    };

    expect(
      canApproveMinimumClose(held, agreement, "2026-10-11T00:00:00Z"),
    ).toBe(true);
    expect(
      canApproveMinimumClose(held, agreement, "2026-10-09T00:00:00Z"),
    ).toBe(false);
    expect(
      canApproveMinimumClose(
        held,
        {
          ...agreement,
          rules: { ...agreement.rules, missing_report_policy: "hold_close" },
        },
        "2026-10-11T00:00:00Z",
      ),
    ).toBe(false);
  });

  it("defines safe states and every explicit revenue command", () => {
    const source = fs.readFileSync(
      new URL("./BillingMonthlyClosePanel.tsx", import.meta.url),
      "utf8",
    );
    const normalized = source.replace(/\s+/g, " ");

    for (const copy of [
      "Monthly close",
      "No revenue period for this month",
      "Create the period from the active agreement to begin evidence review.",
      "Create revenue period",
      "Revenue evidence is unresolved",
      "Assign the exception and obtain verifiable evidence. The system will not estimate revenue.",
      "Approve minimum-only close?",
      "This keeps the evidence exception open. Accepted late evidence will create a linked true-up or credit calculation without changing this close.",
      "Reconnect to view or change agreement, evidence, and calculation details.",
      "The action could not be completed. Refresh the account and review the reason before trying again.",
    ]) {
      expect(normalized).toContain(copy);
    }
    for (const method of [
      "listBillingRevenuePeriods",
      "ensureBillingRevenuePeriod",
      "submitBillingRevenueRevision",
      "reviewBillingRevenueRevision",
      "closeBillingRevenuePeriod",
    ]) {
      expect(source).toContain(method);
    }
    expect(source).toContain("enabled: online");
    expect(source).toContain("useCanAccess");
    expect(source).not.toMatch(/overflow-x-(?:auto|scroll)|<table|<Table/i);
  });
});

describe("exact calculation preview and adjustment presentation", () => {
  const comparison = (
    amount: string,
    previous: string,
  ): BillingCalculationComparison => ({
    status: "available",
    previous_calculation_id: "31000000-0000-4000-8000-000000009200",
    previous_amount: parseUsdMoney({
      amount_minor: previous,
      currency: "USD",
    }),
    delta: parseUsdMoney({ amount_minor: amount, currency: "USD" }),
    delta_rate: parseExactRatio({ numerator: amount, denominator: previous }),
  });

  it("formats signed exact amount and percentage comparisons without inventing a missing prior", () => {
    expect(formatCalculationComparison(comparison("7500", "75000"))).toBe(
      "+$75.00 increase",
    );
    expect(formatCalculationComparison(comparison("-2500", "50000"))).toBe(
      "-$25.00 decrease",
    );
    expect(formatCalculationComparison(comparison("0", "50000"))).toBe(
      "$0.00 no change",
    );
    expect(
      formatCalculationComparison({
        status: "unavailable",
        previous_calculation_id: null,
        previous_amount: null,
        delta: null,
        delta_rate: null,
      }),
    ).toBe("Prior period unavailable");
    expect(
      formatExactDeltaRate(
        parseExactRatio({ numerator: "1", denominator: "8" }),
      ),
    ).toBe("+12.50%");
  });

  it("uses literal winning-branch labels for every closed formula branch", () => {
    expect(calculationBranchLabel("fixed")).toBe("Fixed amount selected");
    expect(calculationBranchLabel("percentage")).toBe(
      "Percentage candidate selected",
    );
    expect(calculationBranchLabel("minimum")).toBe(
      "Minimum candidate selected",
    );
    expect(calculationBranchLabel("minimum_equal")).toBe(
      "Minimum and percentage are equal; minimum selected",
    );
  });

  it("renders exact candidates, policies, blockers, approval context, and durable adjustments", () => {
    const preview = fs.readFileSync(
      new URL("./BillingCalculationPreview.tsx", import.meta.url),
      "utf8",
    );
    const panel = fs.readFileSync(
      new URL("./BillingMonthlyClosePanel.tsx", import.meta.url),
      "utf8",
    );
    const combined = `${preview}\n${panel}`;
    const normalized = combined.replace(/\s+/g, " ");

    for (const copy of [
      "Exact calculation preview",
      "Fixed candidate",
      "Minimum candidate",
      "Percentage candidate",
      "Winning branch",
      "Prior-period comparison",
      "Policy and provenance",
      "Automatic approval eligible",
      "Manual approval required",
      "Anomaly checks",
      "Needs approval",
      "Auto-approved",
      "Adjustment pending",
      "True-up",
      "Credit candidate",
      "Held for contract review",
      "Original result",
      "Actual result",
      "Signed delta",
      "This preview is no longer current. Refresh the period and review the new calculation before approving.",
      "Approve calculation",
    ]) {
      expect(normalized).toContain(copy);
    }
    for (const method of [
      "listBillingCalculations",
      "previewBillingCalculation",
      "createBillingCalculation",
      "approveBillingCalculation",
      "getBillingCalculationLineage",
      "createBillingAdjustmentCalculation",
    ]) {
      expect(panel).toContain(method);
    }
    expect(combined).toContain("tabular-nums");
    expect(combined).toContain("disabled={Boolean(pendingAction)}");
    expect(combined).not.toMatch(
      /paid|invoice issued|credit issued|reconciled/i,
    );
  });
});
