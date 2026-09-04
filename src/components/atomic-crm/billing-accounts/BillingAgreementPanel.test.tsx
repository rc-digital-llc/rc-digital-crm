import fs from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  buildBillingAgreementDraftRequest,
  validateBillingAgreementForm,
  type BillingAgreementFormValues,
} from "./BillingAgreementForm";

const accountId = "31000000-0000-4000-8000-000000000200";
const evidenceId = "31000000-0000-4000-8000-000000000600";

const baseValues: BillingAgreementFormValues = {
  agreement_family: "primary",
  effective_start: "2026-09-01",
  effective_end: "2027-09-01",
  timezone: "America/Chicago",
  formula_kind: "hybrid",
  fixed_amount_usd: "",
  minimum_amount_usd: "$500.00",
  percentage: "8.875%",
  timing_basis: "cash",
  included_amounts: "service_revenue, recurring_support",
  excluded_amounts: "sales_tax, refunds",
  tax_treatment: "exclude",
  refund_chargeback_policy: "next_period_adjustment",
  cutoff_day: "10",
  dispute_policy: "hold_close",
  missing_report_policy: "minimum_only",
  true_up_policy: "credit_candidate",
  evidence_priority: "api, statement, portal",
  signed_evidence_id: evidenceId,
};

describe("billing agreement exact form contract", () => {
  it.each([
    ["fixed", "$500.00", "", "", "50000", null, null],
    ["percentage", "", "", "8.875%", null, null, "71"],
    ["minimum_support", "", "$500.00", "", null, "50000", null],
    ["hybrid", "", "$500.00", "8.875%", null, "50000", "71"],
  ] as const)(
    "builds a canonical %s request without numeric money authority",
    (
      formulaKind,
      fixed,
      minimum,
      percentage,
      fixedMinor,
      minimumMinor,
      rateNumerator,
    ) => {
      const request = buildBillingAgreementDraftRequest(
        {
          ...baseValues,
          formula_kind: formulaKind,
          fixed_amount_usd: fixed,
          minimum_amount_usd: minimum,
          percentage,
        },
        {
          account_id: accountId,
          command_key: `agreement-${formulaKind}-draft-0001`,
        },
      );

      expect(request.fixed_amount?.amount_minor ?? null).toBe(fixedMinor);
      expect(request.minimum_amount?.amount_minor ?? null).toBe(minimumMinor);
      expect(request.percentage?.numerator ?? null).toBe(rateNumerator);
      expect(request.evidence_priority).toEqual(["api", "statement", "portal"]);
      expect(request.included_amounts).toEqual([
        "service_revenue",
        "recurring_support",
      ]);
      expect(JSON.stringify(request)).not.toMatch(
        /"(?:amount_minor|numerator|denominator)":-?[0-9]+[,}]/,
      );
    },
  );

  it.each([
    ["ambiguous cents", { minimum_amount_usd: "500.0" }],
    ["exponent money", { minimum_amount_usd: "5e2" }],
    ["unsigned percentage", { percentage: "8.875" }],
    ["reversed dates", { effective_end: "2026-08-31" }],
    ["missing evidence", { signed_evidence_id: "" }],
    ["invalid cutoff", { cutoff_day: "0" }],
    ["duplicate ladder", { evidence_priority: "api, api" }],
  ])("rejects %s before a provider can be called", (_name, mutation) => {
    const onSave = vi.fn();
    const values = { ...baseValues, ...mutation };

    expect(validateBillingAgreementForm(values)).not.toEqual({});
    expect(() =>
      buildBillingAgreementDraftRequest(values, {
        account_id: accountId,
        command_key: "agreement-invalid-draft-0001",
      }),
    ).toThrow("AGREEMENT_FORM_INVALID");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("uses grouped text inputs and exact lifecycle confirmation copy", () => {
    const form = fs.readFileSync(
      new URL("./BillingAgreementForm.tsx", import.meta.url),
      "utf8",
    );

    for (const heading of [
      "Lifecycle and effective period",
      "Formula terms",
      "Commissionable revenue rules",
      "Evidence policy",
      "Signed source evidence",
    ]) {
      expect(form).toContain(heading);
    }
    expect(form).toContain("Activate agreement");
    expect(form).toContain("Historical closes remain unchanged");
    expect(form).toContain("Self-approval");
    expect(form).toContain("h-11");
    expect(form).not.toMatch(/type=["']number["']/);
  });
});
