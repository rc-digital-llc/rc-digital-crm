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
  billing_accounts: [{ ...account }],
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
  ],
  billing_evidence_access_events: [{ ...accessEvent }],
  invoices: generateExactBillingInvoices(),
});
