import type {
  BillingAccount,
  BillingAccountStatus,
  BillingContactMethod,
  BillingEvidenceAccessPurpose,
  BillingEvidenceInspectionStatus,
  ExactBillingInvoice,
  ExactBillingInvoiceLineItem,
  InvoiceStatus,
} from "../types";
import type { OrdinaryPercentageRate, UsdMoney } from "../financial/exactMoney";

export type BillingAccessRoleSummary = Readonly<{
  assignment_id: string;
  role: string;
  description: string;
  subject_display_name: string;
  scope_label: string;
  effective_from: string;
  effective_until: string | null;
  status: "active" | "ended";
  reason: string | null;
}>;

export type BillingAccessGrantSummary = Readonly<{
  grant_id: string;
  command_name: string;
  policy_version: string;
  action_kind: string;
  provider_label: string;
  limit_summary: string;
  status: "active" | "disabled" | "exhausted";
}>;

export type BillingAccessAutomationSummary = Readonly<{
  principal_id: string;
  name: string;
  status: "active" | "disabled";
  valid_from: string;
  valid_until: string | null;
  disabled_reason: string | null;
  grants: BillingAccessGrantSummary[];
}>;

export type BillingAccountAccessSummary = Readonly<{
  roles: BillingAccessRoleSummary[];
  automation: BillingAccessAutomationSummary[];
}>;

export const billingAccessProviderMethodKeys = [
  "getBillingAccountAccessSummary",
  "assignBillingRole",
  "endBillingRoleAssignment",
  "disableBillingAutomationPrincipal",
] as const;

export type BillingAccountBoundaryContactInput = Readonly<{
  id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  preferred_contact_method: BillingContactMethod;
  auth_user_id: string | null;
  active: boolean;
  end_reason: string | null;
}>;

export type BillingAccountBoundaryRequest = Readonly<{
  account_id: string | null;
  customer_name: string;
  billing_status: BillingAccountStatus;
  responsible_owner_sales_id: number;
  billing_contacts: BillingAccountBoundaryContactInput[];
  lifecycle_reason: string | null;
}>;

export type BillingAccountBoundaryResponse = BillingAccount;

export const billingAccountProviderMethodKeys = [
  "saveBillingAccountBoundary",
] as const;

export type BillingEvidenceKind =
  | "contract"
  | "revenue_statement"
  | "receipt"
  | "dispute"
  | "other";

export type BillingEvidenceUploadRequest = Readonly<{
  account_id: string;
  kind: BillingEvidenceKind;
  original_filename: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  purpose: "operator_upload" | "customer_submission";
}>;

export type BillingEvidenceInspectionRequest = Readonly<{
  evidence_id: string;
  decision: Extract<BillingEvidenceInspectionStatus, "clean" | "rejected">;
  reason_code: string;
  idempotency_key: string;
}>;

export type BillingEvidenceDownloadRequest = Readonly<{
  evidence_id: string;
  purpose: Exclude<BillingEvidenceAccessPurpose, "invalid">;
}>;

export type BillingEvidenceDeniedResponse = Readonly<{
  result: "denied";
  reason_code: string;
}>;

export type BillingEvidenceCapabilityResponse = Readonly<{
  result: "ready";
  evidence_id: string;
  url: string;
  expires_at: string;
}>;

export type BillingEvidenceUploadResponse =
  | BillingEvidenceCapabilityResponse
  | BillingEvidenceDeniedResponse;

export type BillingEvidenceInspectionResponse =
  | Readonly<{
      result: "applied";
      reason_code: "INSPECTION_RECORDED";
      evidence_id: string;
      decision: Extract<BillingEvidenceInspectionStatus, "clean" | "rejected">;
    }>
  | Readonly<{
      result: "duplicate";
      reason_code: "DUPLICATE_COMMAND";
    }>
  | BillingEvidenceDeniedResponse;

export type BillingEvidenceDownloadResponse =
  | BillingEvidenceCapabilityResponse
  | BillingEvidenceDeniedResponse;

export const billingEvidenceProviderMethodKeys = [
  "beginBillingEvidenceUpload",
  "finalizeBillingEvidenceInspection",
  "createBillingEvidenceDownload",
] as const;

export type ExactBillingInvoiceListFilters = Readonly<{
  billing_account_id?: string;
  invoice_number?: string;
  status?: InvoiceStatus;
}>;

export type ExactBillingInvoiceListRequest = Readonly<{
  mode: "list";
  page: number;
  per_page: number;
  sort:
    | "id"
    | "created_at"
    | "updated_at"
    | "invoice_number"
    | "issue_date"
    | "due_date"
    | "status";
  order: "ASC" | "DESC";
  filters: ExactBillingInvoiceListFilters;
}>;

export type ExactBillingInvoiceGetRequest = Readonly<{
  mode: "get";
  invoice_id: string;
}>;

export type ExactBillingInvoiceSaveRequest = Readonly<{
  id?: string;
  billing_account_id: string;
  invoice_number: string;
  description?: string | null;
  amount: UsdMoney;
  tax_rate: OrdinaryPercentageRate;
  line_items: ExactBillingInvoiceLineItem[];
  status: "Draft";
  project_id?: string | null;
  deal_id?: string | null;
  issue_date?: string;
  due_date?: string | null;
  payment_method?: string | null;
  payment_reference?: string | null;
  notes?: string | null;
  terms?: string | null;
}>;

export type ExactBillingInvoiceListResult = Readonly<{
  data: ExactBillingInvoice[];
  total: number;
}>;

export const billingInvoiceProviderMethodKeys = [
  "listExactBillingInvoices",
  "getExactBillingInvoice",
  "saveExactBillingInvoice",
] as const;

export const billingResourceNames = [
  "billing_organizations",
  "billing_accounts",
  "billing_account_owners",
  "billing_contacts",
  "billing_roles",
  "billing_role_capabilities",
  "billing_role_assignments",
  "billing_automation_principals",
  "billing_automation_grants",
  "billing_evidence_support_safe",
  "billing_evidence_access_events",
  "invoices",
] as const;

export type { CrmDataProvider } from "./supabase/dataProvider";
