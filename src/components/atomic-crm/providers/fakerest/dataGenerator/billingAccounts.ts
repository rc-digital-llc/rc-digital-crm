import type {
  BillingAccount,
  BillingAccountOwner,
  BillingContact,
  BillingEvidenceAccessEvent,
  BillingEvidenceMetadata,
  BillingOrganization,
  BillingRole,
  BillingRoleAssignment,
  BillingRoleCapability,
  ExactBillingInvoice,
  ExactBillingInvoiceLineItem,
} from "../../../types";
import {
  multiplyUsdMoneyByExactRatio,
  multiplyUsdMoneyByRate,
  parseCanonicalIntegerText,
  parseExactRatio,
  parseOrdinaryPercentage,
  parseUsdMoney,
  USD_HALF_AWAY_ROUNDING_POLICY,
} from "../../../financial/exactMoney";
import type { Db } from "./types";

export const DEMO_BILLING_ORGANIZATION_ID =
  "31000000-0000-0000-0000-000000000100";
export const DEMO_BILLING_ACCOUNT_ID = "31000000-0000-0000-0000-000000000200";
export const DEMO_CLEAN_EVIDENCE_ID = "31000000-0000-0000-0000-000000000600";
export const DEMO_QUARANTINED_EVIDENCE_ID =
  "31000000-0000-0000-0000-000000000601";
export const DEMO_EVIDENCE_NOW = "2026-09-01T20:00:00.000Z";
export const DEMO_EVIDENCE_EXPIRES_AT = "2026-09-01T20:01:00.000Z";

export type DemoBillingCloseScenario = Readonly<{
  account_id: string;
  organization_id: string;
  agreement_id: string;
  agreement_version_id: string;
  evidence_id: string;
  period_id: string;
  close_snapshot_id: string;
  formula_kind: "fixed" | "percentage" | "minimum_support" | "hybrid";
  fixed_amount_minor: string | null;
  minimum_amount_minor: string | null;
  rate_numerator: string | null;
  rate_denominator: string | null;
  submitted_percentage: string | null;
  commissionable_amount_minor: string;
  missing_report_policy: "hold_close" | "minimum_only";
  true_up_policy: "next_period_adjustment" | "credit_candidate";
  open_exception: boolean;
  late_submission_id: string;
  late_review_event_id: string;
  late_commissionable_amount_minor: string;
}>;

export const DEMO_BILLING_CLOSE_SCENARIOS = Object.freeze({
  fixed: Object.freeze({
    account_id: "31000000-0000-4000-8000-000000000210",
    organization_id: DEMO_BILLING_ORGANIZATION_ID,
    agreement_id: "31000000-0000-4000-8000-000000001210",
    agreement_version_id: "31000000-0000-4000-8000-000000002210",
    evidence_id: "31000000-0000-4000-8000-000000003210",
    period_id: "31000000-0000-4000-8000-000000004210",
    close_snapshot_id: "31000000-0000-4000-8000-000000005210",
    formula_kind: "fixed",
    fixed_amount_minor: "50000",
    minimum_amount_minor: null,
    rate_numerator: null,
    rate_denominator: null,
    submitted_percentage: null,
    commissionable_amount_minor: "825000",
    missing_report_policy: "hold_close",
    true_up_policy: "next_period_adjustment",
    open_exception: false,
    late_submission_id: "31000000-0000-4000-8000-000000006210",
    late_review_event_id: "7210",
    late_commissionable_amount_minor: "850000",
  }),
  percentage: Object.freeze({
    account_id: "31000000-0000-4000-8000-000000000220",
    organization_id: DEMO_BILLING_ORGANIZATION_ID,
    agreement_id: "31000000-0000-4000-8000-000000001220",
    agreement_version_id: "31000000-0000-4000-8000-000000002220",
    evidence_id: "31000000-0000-4000-8000-000000003220",
    period_id: "31000000-0000-4000-8000-000000004220",
    close_snapshot_id: "31000000-0000-4000-8000-000000005220",
    formula_kind: "percentage",
    fixed_amount_minor: null,
    minimum_amount_minor: null,
    rate_numerator: "1",
    rate_denominator: "10",
    submitted_percentage: "10%",
    commissionable_amount_minor: "825000",
    missing_report_policy: "hold_close",
    true_up_policy: "next_period_adjustment",
    open_exception: false,
    late_submission_id: "31000000-0000-4000-8000-000000006220",
    late_review_event_id: "7220",
    late_commissionable_amount_minor: "900000",
  }),
  minimum_exception: Object.freeze({
    account_id: "31000000-0000-4000-8000-000000000230",
    organization_id: DEMO_BILLING_ORGANIZATION_ID,
    agreement_id: "31000000-0000-4000-8000-000000001230",
    agreement_version_id: "31000000-0000-4000-8000-000000002230",
    evidence_id: "31000000-0000-4000-8000-000000003230",
    period_id: "31000000-0000-4000-8000-000000004230",
    close_snapshot_id: "31000000-0000-4000-8000-000000005230",
    formula_kind: "minimum_support",
    fixed_amount_minor: null,
    minimum_amount_minor: "50000",
    rate_numerator: null,
    rate_denominator: null,
    submitted_percentage: null,
    commissionable_amount_minor: "0",
    missing_report_policy: "minimum_only",
    true_up_policy: "credit_candidate",
    open_exception: true,
    late_submission_id: "31000000-0000-4000-8000-000000006230",
    late_review_event_id: "7230",
    late_commissionable_amount_minor: "0",
  }),
  hybrid: Object.freeze({
    account_id: DEMO_BILLING_ACCOUNT_ID,
    organization_id: DEMO_BILLING_ORGANIZATION_ID,
    agreement_id: "31000000-0000-4000-8000-000000001200",
    agreement_version_id: "31000000-0000-4000-8000-000000002200",
    evidence_id: DEMO_CLEAN_EVIDENCE_ID,
    period_id: "31000000-0000-4000-8000-000000004200",
    close_snapshot_id: "31000000-0000-4000-8000-000000005200",
    formula_kind: "hybrid",
    fixed_amount_minor: null,
    minimum_amount_minor: "50000",
    rate_numerator: "1",
    rate_denominator: "10",
    submitted_percentage: "10%",
    commissionable_amount_minor: "825000",
    missing_report_policy: "minimum_only",
    true_up_policy: "credit_candidate",
    open_exception: false,
    late_submission_id: "31000000-0000-4000-8000-000000006200",
    late_review_event_id: "7200",
    late_commissionable_amount_minor: "900000",
  }),
} satisfies Record<string, DemoBillingCloseScenario>);

type BillingData = Pick<
  Db,
  | "billing_organizations"
  | "billing_accounts"
  | "billing_account_owners"
  | "billing_contacts"
  | "billing_roles"
  | "billing_role_capabilities"
  | "billing_role_assignments"
  | "billing_automation_principals"
  | "billing_automation_grants"
  | "billing_evidence_support_safe"
  | "billing_evidence_access_events"
  | "billing_agreements_support_safe"
  | "billing_revenue_periods_support_safe"
  | "billing_calculations_support_safe"
  | "billing_calculation_lineage_support_safe"
  | "invoices"
>;

const organization: BillingOrganization = {
  id: DEMO_BILLING_ORGANIZATION_ID,
  name: "Example Billing Organization",
  status: "active",
  created_at: DEMO_EVIDENCE_NOW,
  updated_at: DEMO_EVIDENCE_NOW,
  ended_at: null,
  end_reason: null,
};

const account: BillingAccount = {
  id: DEMO_BILLING_ACCOUNT_ID,
  organization_id: organization.id,
  company_id: 0,
  customer_name: "Example Customer One",
  billing_status: "active",
  created_at: DEMO_EVIDENCE_NOW,
  updated_at: DEMO_EVIDENCE_NOW,
  ended_at: null,
  end_reason: null,
};

const closeScenarioAccounts: BillingAccount[] = Object.entries(
  DEMO_BILLING_CLOSE_SCENARIOS,
).map(([name, scenario]) =>
  scenario.account_id === account.id
    ? { ...account }
    : {
        id: scenario.account_id,
        organization_id: scenario.organization_id,
        company_id: null,
        customer_name: `Synthetic ${name.replace("_", " ")} billing scenario`,
        billing_status: "active",
        created_at: DEMO_EVIDENCE_NOW,
        updated_at: DEMO_EVIDENCE_NOW,
        ended_at: null,
        end_reason: null,
      },
);

const owner: BillingAccountOwner = {
  id: "31000000-0000-0000-0000-000000000250",
  organization_id: organization.id,
  account_id: account.id,
  sales_id: 0,
  effective_from: DEMO_EVIDENCE_NOW,
  effective_until: null,
  end_reason: null,
  created_at: DEMO_EVIDENCE_NOW,
};

const contact: BillingContact = {
  id: "31000000-0000-0000-0000-000000000300",
  organization_id: organization.id,
  account_id: account.id,
  name: "Example Billing Contact",
  email: "billing-contact@example.com",
  phone: null,
  preferred_contact_method: "email",
  auth_user_id: null,
  active: true,
  effective_from: DEMO_EVIDENCE_NOW,
  effective_until: null,
  end_reason: null,
  created_at: DEMO_EVIDENCE_NOW,
  updated_at: DEMO_EVIDENCE_NOW,
};

const roles: Array<BillingRole & { id: string }> = [
  {
    id: "administrator",
    role: "administrator",
    description: "Manage example billing accounts and scoped access",
    human_assignable: true,
  },
  {
    id: "operator",
    role: "operator",
    description: "Operate example billing records",
    human_assignable: true,
  },
  {
    id: "reviewer",
    role: "reviewer",
    description: "Review example billing evidence",
    human_assignable: true,
  },
  {
    id: "auditor",
    role: "auditor",
    description: "Read example billing audit evidence",
    human_assignable: true,
  },
  {
    id: "customer",
    role: "customer",
    description: "Restricted example customer access",
    human_assignable: true,
  },
];

const capabilities: Array<BillingRoleCapability & { id: string }> = [
  {
    id: "administrator:account.read",
    role: "administrator",
    capability: "account.read",
  },
  {
    id: "administrator:account.create",
    role: "administrator",
    capability: "account.create",
  },
  {
    id: "operator:evidence.access",
    role: "operator",
    capability: "evidence.access",
  },
  {
    id: "reviewer:evidence.review",
    role: "reviewer",
    capability: "evidence.review",
  },
  {
    id: "auditor:audit.read",
    role: "auditor",
    capability: "audit.read",
  },
  {
    id: "customer:evidence.access",
    role: "customer",
    capability: "evidence.access",
  },
];

const assignment: BillingRoleAssignment = {
  id: "31000000-0000-0000-0000-000000000350",
  organization_id: organization.id,
  account_id: account.id,
  sales_id: 0,
  role: "administrator",
  valid_from: DEMO_EVIDENCE_NOW,
  valid_until: null,
  disabled_at: null,
  disabled_reason: null,
  created_at: DEMO_EVIDENCE_NOW,
  updated_at: DEMO_EVIDENCE_NOW,
};

const cleanEvidence: BillingEvidenceMetadata = {
  id: DEMO_CLEAN_EVIDENCE_ID,
  organization_id: organization.id,
  account_id: account.id,
  kind: "contract",
  original_filename: "RC-Digital-service-agreement.pdf",
  uploader_label: "Jane Doe",
  mime_type: "application/pdf",
  size_bytes: 1024,
  inspection_status: "clean",
  inspection_reason_code: "DEMO_SCAN_CLEAN",
  retention_expires_at: "2030-01-01T00:00:00.000Z",
  is_held: false,
  lifecycle_status: "active",
  end_reason: null,
  created_at: DEMO_EVIDENCE_NOW,
  updated_at: DEMO_EVIDENCE_NOW,
};

const quarantinedEvidence: BillingEvidenceMetadata = {
  ...cleanEvidence,
  id: DEMO_QUARANTINED_EVIDENCE_ID,
  inspection_status: "quarantined",
  inspection_reason_code: null,
};

const closeScenarioEvidence: BillingEvidenceMetadata[] = Object.entries(
  DEMO_BILLING_CLOSE_SCENARIOS,
)
  .filter(([, scenario]) => scenario.evidence_id !== cleanEvidence.id)
  .map(([name, scenario]) => ({
    ...cleanEvidence,
    id: scenario.evidence_id,
    account_id: scenario.account_id,
    original_filename: `synthetic-${name.replace("_", "-")}-agreement.pdf`,
  }));

const accessEvent: BillingEvidenceAccessEvent = {
  id: 1,
  evidence_id: cleanEvidence.id,
  organization_id: organization.id,
  account_id: account.id,
  actor_type: "human",
  actor_id: "31000000-0000-0000-0000-000000000001",
  purpose: "review",
  result: "allowed",
  reason_code: "ACCESS_ALLOWED",
  capability_expires_at: DEMO_EVIDENCE_EXPIRES_AT,
  created_at: DEMO_EVIDENCE_NOW,
};

function exactLineItem(
  description: string,
  quantityNumerator: string,
  quantityDenominator: string,
  unitAmountMinor: string,
): ExactBillingInvoiceLineItem {
  const quantityRatio = parseExactRatio({
    numerator: quantityNumerator,
    denominator: quantityDenominator,
  });
  const unitPrice = parseUsdMoney({
    amount_minor: unitAmountMinor,
    currency: "USD",
  });
  return Object.freeze({
    description,
    quantity_ratio: quantityRatio,
    unit_price: unitPrice,
    extended_amount: multiplyUsdMoneyByExactRatio(
      unitPrice,
      quantityRatio,
      USD_HALF_AWAY_ROUNDING_POLICY,
    ),
    currency_policy_version: "usd-v1",
    rounding_policy_version: "half-away-from-zero-v1",
  });
}

function exactInvoice(
  id: string,
  invoiceNumber: string,
  amountMinor: string,
  submittedPercentage: string,
  lineItems: ExactBillingInvoiceLineItem[] = [],
): ExactBillingInvoice {
  const amount = parseUsdMoney({ amount_minor: amountMinor, currency: "USD" });
  const taxRate = parseOrdinaryPercentage(submittedPercentage);
  const taxAmount = multiplyUsdMoneyByRate(
    amount,
    taxRate,
    USD_HALF_AWAY_ROUNDING_POLICY,
  );
  const totalAmount = parseUsdMoney({
    amount_minor: parseCanonicalIntegerText(
      (BigInt(amount.amount_minor) + BigInt(taxAmount.amount_minor)).toString(),
    ),
    currency: "USD",
  });
  return Object.freeze({
    id,
    created_at: DEMO_EVIDENCE_NOW,
    updated_at: DEMO_EVIDENCE_NOW,
    billing_account_id: DEMO_BILLING_ACCOUNT_ID,
    company_id: "1",
    project_id: null,
    deal_id: null,
    invoice_number: invoiceNumber,
    description: null,
    amount,
    currency_policy_version: "usd-v1",
    tax_rate: taxRate,
    tax_amount: taxAmount,
    total_amount: totalAmount,
    rounding_policy_version: "half-away-from-zero-v1",
    line_items: lineItems,
    status: "Draft",
    issue_date: "2026-09-01",
    due_date: null,
    paid_date: null,
    payment_method: null,
    payment_reference: null,
    notes: null,
    terms: "Payment due within 30 days of invoice date.",
  });
}

const exactInvoices = [
  exactInvoice("3100001", "DEMO-EXACT-MIN", "-9223372036854775808", "0%"),
  exactInvoice("3100002", "DEMO-EXACT-MAX", "9223372036854775807", "0%"),
  exactInvoice("3100003", "DEMO-EXACT-8875", "800", "8.875%", [
    exactLineItem("Two exact units", "2", "1", "400"),
  ]),
  exactInvoice("3100004", "DEMO-EXACT-12500", "8", "12.500%"),
];

function cloneExactInvoice(invoice: ExactBillingInvoice): ExactBillingInvoice {
  return Object.freeze({
    ...invoice,
    amount: Object.freeze({ ...invoice.amount }),
    tax_rate: Object.freeze({ ...invoice.tax_rate }),
    tax_amount: Object.freeze({ ...invoice.tax_amount }),
    total_amount: Object.freeze({ ...invoice.total_amount }),
    line_items: invoice.line_items.map((item) =>
      Object.freeze({
        ...item,
        quantity_ratio: parseExactRatio({
          numerator: item.quantity_ratio.numerator,
          denominator: item.quantity_ratio.denominator,
        }),
        unit_price: Object.freeze({ ...item.unit_price }),
        extended_amount: Object.freeze({ ...item.extended_amount }),
      }),
    ),
  });
}

export const generateExactBillingInvoices = (): ExactBillingInvoice[] =>
  exactInvoices.map(cloneExactInvoice);

export const generateBillingAccounts = (): BillingData => ({
  billing_organizations: [{ ...organization }],
  billing_accounts: closeScenarioAccounts.map((scenarioAccount) => ({
    ...scenarioAccount,
  })),
  billing_account_owners: [{ ...owner }],
  billing_contacts: [{ ...contact }],
  billing_roles: roles.map((role) => ({ ...role })),
  billing_role_capabilities: capabilities.map((capability) => ({
    ...capability,
  })),
  billing_role_assignments: [{ ...assignment }],
  billing_automation_principals: [],
  billing_automation_grants: [],
  billing_evidence_support_safe: [
    { ...cleanEvidence },
    { ...quarantinedEvidence },
    ...closeScenarioEvidence.map((evidence) => ({ ...evidence })),
  ],
  billing_evidence_access_events: [{ ...accessEvent }],
  billing_agreements_support_safe: Object.values(
    DEMO_BILLING_CLOSE_SCENARIOS,
  ).map((scenario) => ({
    id: scenario.agreement_version_id,
    account_id: scenario.account_id,
    agreement_id: scenario.agreement_id,
    formula_kind: scenario.formula_kind,
    state: "active",
  })),
  billing_revenue_periods_support_safe: Object.values(
    DEMO_BILLING_CLOSE_SCENARIOS,
  ).map((scenario) => ({
    id: scenario.period_id,
    account_id: scenario.account_id,
    state: scenario === DEMO_BILLING_CLOSE_SCENARIOS.hybrid ? "open" : "closed",
  })),
  billing_calculations_support_safe: [],
  billing_calculation_lineage_support_safe: [],
  invoices: generateExactBillingInvoices(),
});
