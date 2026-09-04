import fs from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  buildBillingAgreementDraftRequest,
  validateBillingAgreementForm,
  type BillingAgreementFormValues,
} from "./BillingAgreementForm";
import {
  agreementFormulaSummary,
  agreementStateLabel,
  agreementToFormValues,
} from "./BillingAgreementPanel";
import {
  parseOrdinaryPercentage,
  parseUsdMoney,
} from "../financial/exactMoney";
import type { BillingAgreementVersion } from "../types";

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
    ["unsupported month-end cutoff", { cutoff_day: "29" }],
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

const activeAgreement: BillingAgreementVersion = {
  agreement_id: "31000000-0000-4000-8000-000000001200",
  version_id: "31000000-0000-4000-8000-000000002200",
  agreement_family: "primary",
  cadence: "monthly",
  state: "active",
  latest_event: "activated",
  version_number: 3,
  effective_start: "2026-09-01",
  effective_end: "2027-09-01",
  formula_kind: "hybrid",
  fixed_amount: null,
  minimum_amount: parseUsdMoney({ amount_minor: "50000", currency: "USD" }),
  rate: parseOrdinaryPercentage("8.875%"),
  currency_policy_version: "usd-v1",
  rate_policy_version: "ordinary-percentage-v1",
  rounding_policy_version: "half-away-from-zero-v1",
  formula_version: "billing-agreement-formula-v1",
  explanation_version: "billing-agreement-explanation-v1",
  signed_evidence_id: evidenceId,
  signed_evidence_sha256: "a".repeat(64),
  terms_fingerprint: "b".repeat(64),
  self_approved: true,
  lifecycle_events: [
    {
      event_id: "3",
      event_type: "activated",
      actor_id: "31000000-0000-4000-8000-000000000001",
      actor_role: "administrator",
      reason: "Approved synthetic agreement",
      created_at: "2026-09-01T20:00:00.000Z",
    },
  ],
  rules: {
    timezone: "America/Chicago",
    timing_basis: "cash",
    included_amounts: ["service_revenue", "recurring_support"],
    excluded_amounts: ["sales_tax", "refunds"],
    tax_treatment: "exclude",
    refund_chargeback_policy: "next_period_adjustment",
    cutoff_day: 10,
    dispute_policy: "hold_close",
    missing_report_policy: "minimum_only",
    true_up_policy: "credit_candidate",
    evidence_priority: ["api", "statement", "portal"],
  },
};

describe("billing agreement responsive panel contract", () => {
  it("formats exact terms and pre-fills an amendment without making active authority editable", () => {
    expect(agreementStateLabel("pending_review")).toBe("Awaiting review");
    expect(agreementFormulaSummary(activeAgreement)).toBe(
      "The greater of $500.00 or 8.875% of commissionable revenue",
    );
    expect(agreementToFormValues(activeAgreement)).toMatchObject({
      formula_kind: "hybrid",
      minimum_amount_usd: "$500.00",
      percentage: "8.875%",
      signed_evidence_id: evidenceId,
    });
  });

  it("defines every lifecycle, empty, denied, offline, and recovery state", () => {
    const panel = fs.readFileSync(
      new URL("./BillingAgreementPanel.tsx", import.meta.url),
      "utf8",
    );
    const normalized = panel.replace(/\s+/g, " ");

    for (const copy of [
      "Agreement",
      "No agreement is active",
      "Create a draft and attach the signed commercial terms before this account can enter monthly close.",
      "Create agreement draft",
      "Awaiting review",
      "Active",
      "Paused",
      "Superseded",
      "Terminated",
      "Reconnect to view or change agreement, evidence, and calculation details.",
      "You do not have access to agreement details for this account.",
      "Refresh agreement details",
    ]) {
      expect(normalized).toContain(copy);
    }
    expect(panel).toContain("enabled: online");
    expect(panel).toContain('role="alert"');
  });

  it("uses explicit commands, presentation capabilities, and safe evidence fields", () => {
    const panel = fs.readFileSync(
      new URL("./BillingAgreementPanel.tsx", import.meta.url),
      "utf8",
    );

    for (const method of [
      "listBillingAgreements",
      "saveBillingAgreementDraft",
      "submitBillingAgreementVersion",
      "activateBillingAgreementVersion",
      "pauseBillingAgreementVersion",
      "terminateBillingAgreementVersion",
    ]) {
      expect(panel).toContain(method);
    }
    expect(panel).toContain("useCanAccess");
    expect(panel).toContain("signed_evidence_sha256.slice");
    expect(panel).toContain("billing_evidence_support_safe");
    expect(panel).toContain("agreement.lifecycle_events.map");
    expect(panel).toContain("event.actor_role");
    expect(panel).toContain("event.reason");
    expect(panel).toContain("event.created_at");
    expect(panel).not.toMatch(
      /signed_url|object_path|raw contract|contract content/i,
    );
  });

  it("keeps mobile history stacked, ordered, and free of table overflow", () => {
    const panel = fs.readFileSync(
      new URL("./BillingAgreementPanel.tsx", import.meta.url),
      "utf8",
    );
    const headings = [
      "Current agreement",
      "Commissionable revenue definition",
      "Signed source evidence",
      "Lifecycle history",
    ].map((heading) => panel.indexOf(heading));

    expect(headings.every((position) => position >= 0)).toBe(true);
    expect(headings).toEqual([...headings].sort((left, right) => left - right));
    expect(panel).toContain("grid-cols-1");
    expect(panel).toContain("md:grid-cols-[minmax(0,1fr)_320px]");
    expect(panel).not.toMatch(/overflow-x-(?:auto|scroll)|<table|<Table/i);
  });
});
