import type {
  BillingAdjustmentCalculation,
  BillingAccount,
  BillingAccountStatus,
  BillingAgreementFormulaKind,
  BillingAgreementVersion,
  BillingCalculation,
  BillingCalculationAnomaly,
  BillingCalculationComparison,
  BillingCalculationExplanation,
  BillingCalculationSelectedBranch,
  BillingCloseException,
  BillingContactMethod,
  BillingEvidenceAccessPurpose,
  BillingEvidenceInspectionStatus,
  BillingRevenueCloseMode,
  BillingRevenueCloseSnapshot,
  BillingRevenueExceptionReason,
  BillingRevenuePeriod,
  BillingRevenueProvenance,
  BillingRevenueReview,
  BillingRevenueReviewOutcome,
  BillingRevenueSubmission,
  ExactBillingInvoice,
  ExactBillingInvoiceLineItem,
  InvoiceStatus,
} from "../types";
import type {
  CanonicalIntegerText,
  OrdinaryPercentageRate,
  UsdMoney,
} from "../financial/exactMoney";

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

export const billingPhase4ContractValues = Object.freeze({
  agreement_states: Object.freeze([
    "draft",
    "pending_review",
    "active",
    "paused",
    "superseded",
    "terminated",
  ] as const),
  formula_kinds: Object.freeze([
    "fixed",
    "percentage",
    "minimum_support",
    "hybrid",
  ] as const),
  review_outcomes: Object.freeze([
    "accept",
    "reject",
    "request_correction",
    "hold",
  ] as const),
  exception_reasons: Object.freeze([
    "MISSING_EVIDENCE",
    "CONFLICTING_EVIDENCE",
    "LATE_EVIDENCE",
    "ANOMALOUS_REVENUE",
    "HELD_EVIDENCE",
    "UNVERIFIED_EVIDENCE",
  ] as const),
  adjustment_treatments: Object.freeze([
    "true_up",
    "no_adjustment",
    "credit_candidate",
    "held",
  ] as const),
});

type BillingAgreementDraftCommon = Readonly<{
  account_id: string;
  agreement_id?: string;
  version_id?: string;
  agreement_family: string;
  command_key: string;
  effective_start: string;
  effective_end: string;
  signed_evidence_id: string;
  timezone: string;
  timing_basis: "cash" | "accrual";
  included_amounts: readonly string[];
  excluded_amounts: readonly string[];
  tax_treatment: "include" | "exclude";
  refund_chargeback_policy: "deduct_in_period" | "next_period_adjustment";
  cutoff_day: number;
  dispute_policy: "hold_close" | "exclude_disputed";
  missing_report_policy: "hold_close" | "minimum_only";
  true_up_policy: "next_period_adjustment" | "credit_candidate";
  evidence_priority: readonly BillingRevenueProvenance[];
}>;

export type BillingAgreementDraftRequest = BillingAgreementDraftCommon &
  (
    | Readonly<{
        formula_kind: "fixed";
        fixed_amount: UsdMoney;
        minimum_amount: null;
        percentage: null;
      }>
    | Readonly<{
        formula_kind: "percentage";
        fixed_amount: null;
        minimum_amount: null;
        percentage: OrdinaryPercentageRate;
      }>
    | Readonly<{
        formula_kind: "minimum_support";
        fixed_amount: null;
        minimum_amount: UsdMoney;
        percentage: null;
      }>
    | Readonly<{
        formula_kind: "hybrid";
        fixed_amount: null;
        minimum_amount: UsdMoney;
        percentage: OrdinaryPercentageRate;
      }>
  );

export type BillingAgreementCommandResponse = Readonly<{
  result:
    | "created"
    | "updated"
    | "submitted"
    | "activated"
    | "paused"
    | "terminated";
  agreement_id: string;
  version_id: string;
  version_number: number;
  state: "draft" | "pending_review" | "active" | "paused" | "terminated";
  self_approved: boolean;
  terms_fingerprint: string;
}>;

export type BillingAgreementLifecycleRequest = Readonly<{
  version_id: string;
  reason: string;
  command_key: string;
}>;

export type BillingAgreementListRequest = Readonly<{
  account_id: string;
}>;

export type BillingAgreementListResult = Readonly<{
  data: readonly BillingAgreementVersion[];
}>;

export type BillingRevenuePeriodListRequest = Readonly<{
  account_id: string;
  page: number;
  per_page: number;
}>;

export type BillingRevenuePeriodSummary = Readonly<{
  period: BillingRevenuePeriod;
  submissions: readonly BillingRevenueSubmission[];
  reviews: readonly BillingRevenueReview[];
  exceptions: readonly BillingCloseException[];
  close_snapshot: BillingRevenueCloseSnapshot | null;
}>;

export type BillingRevenuePeriodListResult = Readonly<{
  data: readonly BillingRevenuePeriodSummary[];
  total: number;
}>;

export type BillingRevenuePeriodEnsureRequest = Readonly<{
  account_id: string;
  agreement_version_id: string;
  period_month: string;
  command_key: string;
}>;

export type BillingRevenuePeriodEnsureResponse = Readonly<{
  result: "created" | "existing";
  period_id: string;
  agreement_id: string;
  agreement_version_id: string;
  period_start: string;
  period_end: string;
  timezone: string;
  submission_deadline_at: string;
}>;

export type BillingRevenueSubmissionRequest = Readonly<{
  account_id: string;
  period_id: string;
  gross_amount: UsdMoney;
  excluded_amount: UsdMoney;
  commissionable_amount: UsdMoney;
  provenance_kind: BillingRevenueProvenance;
  provenance_source_id: string;
  attestation: Readonly<{ accurate: true; text: string }>;
  evidence_ids: readonly string[];
  command_key: string;
}>;

export type BillingRevenueSubmissionResponse = Readonly<{
  result: "submitted";
  period_id: string;
  submission_id: string;
  revision_number: number;
  previous_submission_id: string | null;
  gross_amount: UsdMoney;
  excluded_amount: UsdMoney;
  commissionable_amount: UsdMoney;
  request_fingerprint: string;
}>;

export type BillingRevenueReviewExceptionRequest = Readonly<{
  kind: BillingRevenueExceptionReason;
  owner_id: string;
  next_action: string;
  due_at: string;
  amount_at_risk: UsdMoney | null;
}>;

export type BillingRevenueReviewRequest =
  | Readonly<{
      account_id: string;
      period_id: string;
      submission_id: string;
      outcome: "accept";
      reason_code: "REVENUE_ACCEPTED";
      reason: string;
      exception: null;
      command_key: string;
    }>
  | Readonly<{
      account_id: string;
      period_id: string;
      submission_id: string | null;
      outcome: Exclude<BillingRevenueReviewOutcome, "accept">;
      reason_code: BillingRevenueExceptionReason;
      reason: string;
      exception: BillingRevenueReviewExceptionRequest;
      command_key: string;
    }>;

export type BillingRevenueReviewResponse = Readonly<{
  result: "reviewed";
  review_event_id: string;
  period_id: string;
  submission_id: string | null;
  outcome: BillingRevenueReviewOutcome;
  reason_code: BillingRevenueExceptionReason | "REVENUE_ACCEPTED";
  input_fingerprint: string;
  evidence_fingerprint: string;
  review_policy_version: "revenue-review-v1";
  exception_id: string | null;
  exception_status: "open" | "resolved" | null;
}>;

export type BillingRevenueCloseRequest = Readonly<{
  account_id: string;
  period_id: string;
  close_mode: BillingRevenueCloseMode;
  review_event_id: string;
  reason: string;
  command_key: string;
}>;

export type BillingRevenueCloseResponse = Readonly<{
  result: "closed";
  close_snapshot_id: string;
  period_id: string;
  close_mode: BillingRevenueCloseMode;
  submission_id: string | null;
  review_event_id: string;
  exception_id: string | null;
  exception_status: "open" | null;
  gross_amount: UsdMoney | null;
  excluded_amount: UsdMoney | null;
  commissionable_amount: UsdMoney | null;
  agreement_fingerprint: string;
  input_fingerprint: string;
  evidence_fingerprint: string;
  close_input_fingerprint: string;
  review_policy_version: "revenue-review-v1";
  close_policy_version: "revenue-close-v1";
}>;

export type BillingCalculationClosePolicy = Readonly<{
  mode: "manual" | "auto";
  active: boolean;
  allowed_account_statuses: readonly BillingAccountStatus[];
  allowed_formula_kinds: readonly BillingAgreementFormulaKind[];
  allowed_close_modes: readonly BillingRevenueCloseMode[];
  allowed_provenance_kinds: readonly (
    | BillingRevenueProvenance
    | "minimum_only"
  )[];
  require_zero_anomalies: boolean;
  minimum_result: UsdMoney;
  maximum_result: UsdMoney | null;
  effective_from: string;
  effective_until: string | null;
}>;

export type BillingCalculationPreviewRequest = Readonly<{
  account_id: string;
  close_snapshot_id: string;
  close_policy_version?: "billing-manual-v1" | "billing-auto-v1";
}>;

export type BillingCalculationPreview = Readonly<{
  result: "preview";
  organization_id: string;
  account_id: string;
  agreement_id: string;
  agreement_version_id: string;
  period_id: string;
  period_start: string;
  period_end: string;
  close_snapshot_id: string;
  close_mode: BillingRevenueCloseMode;
  gross_amount: UsdMoney | null;
  excluded_amount: UsdMoney | null;
  source_commissionable_amount: UsdMoney | null;
  calculation_base: UsdMoney;
  provenance_kind: BillingRevenueProvenance | "minimum_only";
  provenance_source_id: string | null;
  evidence_fingerprint: string;
  close_input_fingerprint: string;
  terms_fingerprint: string;
  formula_kind: BillingAgreementFormulaKind;
  fixed_amount: UsdMoney | null;
  minimum_amount: UsdMoney | null;
  rate: OrdinaryPercentageRate | null;
  intermediate_numerator: CanonicalIntegerText | null;
  intermediate_denominator: CanonicalIntegerText | null;
  fixed_candidate: UsdMoney | null;
  minimum_candidate: UsdMoney | null;
  percentage_candidate: UsdMoney | null;
  selected_branch: BillingCalculationSelectedBranch;
  final_amount: UsdMoney;
  currency_policy_version: "usd-v1";
  rate_policy_version: "ordinary-percentage-v1";
  rounding_policy_version: "half-away-from-zero-v1";
  formula_version: "billing-agreement-formula-v1";
  revenue_close_policy_version: "revenue-close-v1";
  close_policy_version: "billing-manual-v1" | "billing-auto-v1";
  explanation_version: "billing-agreement-explanation-v1";
  close_policy: BillingCalculationClosePolicy;
  anomalies: readonly BillingCalculationAnomaly[];
  comparison: BillingCalculationComparison;
  explanation: BillingCalculationExplanation;
  preview_fingerprint: string;
}>;

export type BillingCalculationCreateRequest = BillingCalculationPreviewRequest &
  Readonly<{
    preview_fingerprint: string;
    command_key: string;
  }>;

export type BillingCalculationCreateResponse = Readonly<{
  result: "created";
  calculation_id: string;
  period_id: string;
  close_snapshot_id: string;
  formula_kind: BillingAgreementFormulaKind;
  selected_branch: BillingCalculationSelectedBranch;
  final_amount: UsdMoney;
  close_policy_version: "billing-manual-v1" | "billing-auto-v1";
  snapshot_hash: string;
  explanation_hash: string;
  comparison: BillingCalculationComparison;
}>;

export type BillingCalculationApproveRequest = Readonly<{
  account_id: string;
  calculation_id: string;
  mode: "manual" | "auto";
  close_policy_version: "billing-manual-v1" | "billing-auto-v1";
  preview_fingerprint: string;
  reason: string;
  command_key: string;
  grant_id?: string;
  provider_reference?: string;
}>;

export type BillingCalculationApproveResponse = Readonly<{
  result: "approved";
  calculation_id: string;
  event_id: string;
  mode: "manual" | "auto";
  close_policy_version: "billing-manual-v1" | "billing-auto-v1";
  preview_fingerprint: string;
  snapshot_hash: string;
  approved_amount: UsdMoney;
}>;

export type BillingCalculationListRequest = Readonly<{
  account_id: string;
  page: number;
  per_page: number;
}>;

export type BillingCalculationListResult = Readonly<{
  data: readonly BillingCalculation[];
  total: number;
}>;

export type BillingCalculationLineageRequest = Readonly<{
  account_id: string;
  calculation_id: string;
}>;

export type BillingCalculationAdjustmentRequest = Readonly<{
  account_id: string;
  original_calculation_id: string;
  late_submission_id: string;
  late_review_event_id: string;
  reason: string;
  command_key: string;
}>;

export type BillingCalculationAdjustmentResponse = BillingAdjustmentCalculation;

export const billingCloseProviderMethodKeys = [
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
] as const;

export const billingCloseResourceNames = [
  "billing_agreements_support_safe",
  "billing_revenue_periods_support_safe",
  "billing_calculations_support_safe",
  "billing_calculation_lineage_support_safe",
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
  ...billingCloseResourceNames,
  "invoices",
] as const;

export type { CrmDataProvider } from "./supabase/dataProvider";
