import fs from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { parseUsdMoney } from "../financial/exactMoney";
import type { BillingRevenuePeriodSummary } from "../providers/types";
import type { BillingAgreementVersion } from "../types";
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
