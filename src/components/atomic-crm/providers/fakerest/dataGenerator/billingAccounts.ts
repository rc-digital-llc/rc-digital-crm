import type {
  BillingAccount,
  BillingAccountOwner,
  BillingContact,
  BillingEvidenceAccessEvent,
  BillingEvidenceMetadata,
  BillingInvoice,
  BillingOrganization,
  BillingRole,
  BillingRoleAssignment,
  BillingRoleCapability,
} from "../../../types";
import {
  HALF_AWAY_FROM_ZERO_ROUNDING_POLICY_VERSION,
  USD_CURRENCY_POLICY_VERSION,
  parseOrdinaryPercentageRate,
  parseUsdMoney,
  reduceExactRatio,
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
export const DEMO_EXACT_INVOICE_ID = "310001";

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
    id: "administrator:invoice.read",
    role: "administrator",
    capability: "invoice.read",
  },
  {
    id: "administrator:invoice.create",
    role: "administrator",
    capability: "invoice.create",
  },
  {
    id: "administrator:invoice.update",
    role: "administrator",
    capability: "invoice.update",
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

const zeroRate = parseOrdinaryPercentageRate("0%");
const rate8875 = parseOrdinaryPercentageRate("8.875%");

function exactLineItem(amountMinor: string) {
  return Object.freeze({
    quantity_ratio: reduceExactRatio({ numerator: "1", denominator: "1" }),
    unit_price: parseUsdMoney({
      amount_minor: amountMinor,
      currency: "USD",
    }),
    extended_amount: parseUsdMoney({
      amount_minor: amountMinor,
      currency: "USD",
    }),
    currency_policy_version: USD_CURRENCY_POLICY_VERSION,
    rounding_policy_version: HALF_AWAY_FROM_ZERO_ROUNDING_POLICY_VERSION,
  });
}

function exactInvoice(
  id: string,
  invoiceNumber: string,
  amountMinor: string,
  taxAmountMinor: string,
  totalAmountMinor: string,
  taxRate: BillingInvoice["tax_rate"],
  status: BillingInvoice["status"],
): BillingInvoice {
  return Object.freeze({
    id,
    organization_id: DEMO_BILLING_ORGANIZATION_ID,
    billing_account_id: DEMO_BILLING_ACCOUNT_ID,
    company_id: "1",
    sales_id: "1",
    invoice_number: invoiceNumber,
    description: "Deterministic exact invoice fixture",
    amount: parseUsdMoney({ amount_minor: amountMinor, currency: "USD" }),
    currency_policy_version: USD_CURRENCY_POLICY_VERSION,
    tax_rate: taxRate,
    tax_amount: parseUsdMoney({
      amount_minor: taxAmountMinor,
      currency: "USD",
    }),
    total_amount: parseUsdMoney({
      amount_minor: totalAmountMinor,
      currency: "USD",
    }),
    rounding_policy_version: HALF_AWAY_FROM_ZERO_ROUNDING_POLICY_VERSION,
    line_items: Object.freeze([exactLineItem(amountMinor)]),
    status,
    issue_date: "2026-09-04",
    terms: "Payment due within 30 days of invoice date.",
    created_at: DEMO_EVIDENCE_NOW,
    updated_at: DEMO_EVIDENCE_NOW,
  });
}

export const generateExactBillingInvoices = (): BillingInvoice[] => [
  exactInvoice(
    DEMO_EXACT_INVOICE_ID,
    "DEMO-EXACT-8875",
    "10000",
    "888",
    "10888",
    rate8875,
    "Draft",
  ),
  exactInvoice(
    "310002",
    "DEMO-EXACT-MAX",
    "9223372036854775807",
    "0",
    "9223372036854775807",
    zeroRate,
    "Sent",
  ),
  exactInvoice(
    "310003",
    "DEMO-EXACT-MIN",
    "-9223372036854775808",
    "0",
    "-9223372036854775808",
    zeroRate,
    "Paid",
  ),
];

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
});
