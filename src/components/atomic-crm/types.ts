import type { Identifier, RaRecord } from "ra-core";
import type { ComponentType } from "react";

import type {
  CanonicalIntegerText,
  ExactRatio,
  OrdinaryPercentageRate,
  UsdMoney,
} from "./financial/exactMoney";

import type {
  COMPANY_CREATED,
  CONTACT_CREATED,
  CONTACT_NOTE_CREATED,
  DEAL_CREATED,
  DEAL_NOTE_CREATED,
} from "./consts";

export type SignUpData = {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
};

export type SalesFormData = {
  avatar?: string;
  email: string;
  password?: string;
  first_name: string;
  last_name: string;
  administrator: boolean;
  disabled: boolean;
};

export type Sale = {
  first_name: string;
  last_name: string;
  administrator: boolean;
  avatar?: RAFile;
  disabled?: boolean;
  user_id: string;

  /**
   * This is a copy of the user's email, to make it easier to handle by react admin
   * DO NOT UPDATE this field directly, it should be updated by the backend
   */
  email: string;

  /**
   * This is used by the fake rest provider to store the password
   * DO NOT USE this field in your code besides the fake rest provider
   * @deprecated
   */
  password?: string;
} & Pick<RaRecord, "id">;

export type Company = {
  name: string;
  logo: RAFile;
  sector: string;
  size: 1 | 10 | 50 | 250 | 500;
  linkedin_url: string;
  website: string;
  phone_number: string;
  address: string;
  zipcode: string;
  city: string;
  state_abbr: string;
  sales_id?: Identifier | null;
  created_at: string;
  description: string;
  revenue: string;
  tax_identifier: string;
  country: string;
  context_links?: string[];
  nb_contacts?: number;
  nb_deals?: number;
} & Pick<RaRecord, "id">;

export type EmailAndType = {
  email: string;
  type: "Work" | "Home" | "Other";
};

export type PhoneNumberAndType = {
  number: string;
  type: "Work" | "Home" | "Other";
};

export type Contact = {
  first_name: string;
  last_name: string;
  title: string;
  company_id?: Identifier | null;
  email_jsonb: EmailAndType[];
  avatar?: Partial<RAFile>;
  linkedin_url?: string | null;
  first_seen: string;
  last_seen: string;
  has_newsletter: boolean;
  tags: Identifier[];
  gender: string;
  sales_id?: Identifier | null;
  status: string;
  background: string;
  phone_jsonb: PhoneNumberAndType[];
  nb_tasks?: number;
  company_name?: string;
} & Pick<RaRecord, "id">;

export type ContactNote = {
  contact_id: Identifier;
  text: string;
  date: string;
  sales_id: Identifier;
  status: string;
  attachments?: AttachmentNote[];
} & Pick<RaRecord, "id">;

export type Deal = {
  name: string;
  company_id: Identifier;
  contact_ids: Identifier[];
  category: string;
  stage: string;
  description: string;
  amount: number;
  created_at: string;
  updated_at: string;
  archived_at?: string;
  expected_closing_date: string;
  sales_id: Identifier;
  index: number;
} & Pick<RaRecord, "id">;

export type DealNote = {
  deal_id: Identifier;
  text: string;
  date: string;
  sales_id: Identifier;
  attachments?: AttachmentNote[];

  // This is defined for compatibility with `ContactNote`
  status?: undefined;
} & Pick<RaRecord, "id">;

export type Tag = {
  id: number;
  name: string;
  color: string;
};

export type Task = {
  contact_id: Identifier;
  type: string;
  text: string;
  due_date: string;
  done_date?: string | null;
  sales_id?: Identifier;
} & Pick<RaRecord, "id">;

export type ActivityCompanyCreated = {
  type: typeof COMPANY_CREATED;
  company_id: Identifier;
  company: Company;
  sales_id: Identifier;
  date: string;
} & Pick<RaRecord, "id">;

export type ActivityContactCreated = {
  type: typeof CONTACT_CREATED;
  company_id: Identifier;
  sales_id?: Identifier;
  contact: Contact;
  date: string;
} & Pick<RaRecord, "id">;

export type ActivityContactNoteCreated = {
  type: typeof CONTACT_NOTE_CREATED;
  sales_id?: Identifier;
  contactNote: ContactNote;
  date: string;
} & Pick<RaRecord, "id">;

export type ActivityDealCreated = {
  type: typeof DEAL_CREATED;
  company_id: Identifier;
  sales_id?: Identifier;
  deal: Deal;
  date: string;
};

export type ActivityDealNoteCreated = {
  type: typeof DEAL_NOTE_CREATED;
  sales_id?: Identifier;
  dealNote: DealNote;
  date: string;
};

export type Activity = RaRecord &
  (
    | ActivityCompanyCreated
    | ActivityContactCreated
    | ActivityContactNoteCreated
    | ActivityDealCreated
    | ActivityDealNoteCreated
  );

export interface RAFile {
  src: string;
  title: string;
  path?: string;
  rawFile: File;
  type?: string;
}

export type AttachmentNote = RAFile;

export interface LabeledValue {
  value: string;
  label: string;
}

export type Lead = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  company_name: string;
  job_title: string;
  linkedin_url: string;
  source: string;
  source_detail: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_term: string;
  utm_content: string;
  landing_page_url: string;
  referrer_url: string;
  lead_score: number;
  status: string;
  qualification_notes: string;
  sales_id: Identifier;
  assigned_at: string;
  converted_at: string;
  converted_contact_id: Identifier;
  converted_deal_id: Identifier;
  tags: Identifier[];
  notes: string;
  custom_fields: Record<string, any>;
  created_at: string;
  updated_at: string;
} & Pick<RaRecord, "id">;

export type LeadActivity = {
  lead_id: Identifier;
  sales_id: Identifier;
  activity_type: string;
  description: string;
  metadata: Record<string, any>;
  score_delta: number;
  created_at: string;
} & Pick<RaRecord, "id">;

export type Touchpoint = {
  lead_id: Identifier | null;
  contact_id: Identifier | null;
  deal_id: Identifier | null;
  anonymous_id: string | null;
  touchpoint_type: string;
  channel: string;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
  page_url: string | null;
  page_title: string | null;
  referrer_url: string | null;
  is_first_touch: boolean;
  is_last_touch: boolean;
  is_lead_creation_touch: boolean;
  is_deal_creation_touch: boolean;
  metadata: Record<string, any>;
  sales_id: Identifier | null;
  created_at: string;
} & Pick<RaRecord, "id">;

export type ChannelAttribution = {
  channel: string;
  source: string | null;
  leads_generated: number;
  contacts_touched: number;
  deals_influenced: number;
  first_touch_leads: number;
  last_touch_deals: number;
  first_touch_revenue: number;
  last_touch_revenue: number;
  total_touchpoints: number;
};

export type LeadSourcePerformance = {
  source: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  total_leads: number;
  qualified_leads: number;
  converted_leads: number;
  conversion_rate: number;
  avg_lead_score: number;
  avg_days_to_convert: number | null;
};

export type CustomerJourney = {
  person_name: string;
  email: string;
  lead_id: Identifier;
  contact_id: Identifier | null;
  deal_id: Identifier | null;
  lead_source: string;
  lead_created: string;
  converted_at: string | null;
  deal_created: string | null;
  deal_stage: string | null;
  deal_amount: number | null;
  total_touchpoints: number;
  first_touch_date: string | null;
  last_touch_date: string | null;
  days_in_funnel: number;
};

export type DealStage = LabeledValue;

export interface NoteStatus extends LabeledValue {
  color: string;
}

export interface ContactGender {
  value: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

export type BillingOrganizationStatus = "active" | "disabled";
export type BillingAccountStatus = "active" | "on_hold" | "closed";
export type BillingRoleName =
  | "administrator"
  | "operator"
  | "reviewer"
  | "auditor"
  | "customer";
export type BillingContactMethod = "email" | "phone" | "text" | "none";
export type BillingAutomationStatus = "active" | "disabled" | "exhausted";
export type BillingEvidenceInspectionStatus =
  | "quarantined"
  | "clean"
  | "rejected";
export type BillingEvidenceLifecycleStatus = "active" | "disabled" | "expired";
export type BillingEvidenceAccessPurpose =
  | "download"
  | "review"
  | "audit"
  | "invalid";

export type BillingOrganization = {
  id: string;
  name: string;
  status: BillingOrganizationStatus;
  created_at: string;
  updated_at: string;
  ended_at: string | null;
  end_reason: string | null;
};

export type BillingAccount = {
  id: string;
  organization_id: string;
  company_id: Identifier | null;
  customer_name: string;
  billing_status: BillingAccountStatus;
  created_at: string;
  updated_at: string;
  ended_at: string | null;
  end_reason: string | null;
};

export type BillingAccountOwner = {
  id: string;
  organization_id: string;
  account_id: string;
  sales_id: Identifier;
  effective_from: string;
  effective_until: string | null;
  end_reason: string | null;
  created_at: string;
};

export type BillingContact = {
  id: string;
  organization_id: string;
  account_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  preferred_contact_method: BillingContactMethod;
  auth_user_id: string | null;
  active: boolean;
  effective_from: string;
  effective_until: string | null;
  end_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type BillingRole = {
  role: BillingRoleName;
  description: string;
  human_assignable: boolean;
};

export type BillingRoleCapability = {
  role: BillingRoleName;
  capability: string;
};

export type BillingRoleAssignment = {
  id: string;
  organization_id: string;
  account_id: string | null;
  sales_id: Identifier;
  role: BillingRoleName;
  valid_from: string;
  valid_until: string | null;
  disabled_at: string | null;
  disabled_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type BillingAutomationPrincipal = {
  id: string;
  organization_id: string;
  auth_user_id: string;
  name: string;
  status: Exclude<BillingAutomationStatus, "exhausted">;
  valid_from: string;
  valid_until: string | null;
  disabled_at: string | null;
  disabled_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type BillingAutomationGrant = {
  id: string;
  organization_id: string;
  account_id: string;
  principal_id: string;
  command_name: string;
  provider_reference: string;
  policy_version: string;
  action_kind: string;
  max_amount: string | null;
  max_actions: number | null;
  total_amount_consumed: string;
  actions_consumed: number;
  valid_from: string;
  valid_until: string | null;
  status: BillingAutomationStatus;
  disabled_at: string | null;
  disabled_reason: string | null;
  created_at: string;
  updated_at: string;
};

/** Safe `billing_evidence_support_safe` projection. Raw paths and hashes are server-only. */
export type BillingEvidenceMetadata = {
  id: string;
  organization_id: string;
  account_id: string;
  kind: "contract" | "revenue_statement" | "receipt" | "dispute" | "other";
  original_filename: string;
  uploader_label: string;
  mime_type: string;
  size_bytes: number;
  inspection_status: BillingEvidenceInspectionStatus;
  inspection_reason_code: string | null;
  retention_expires_at: string;
  is_held: boolean;
  lifecycle_status: BillingEvidenceLifecycleStatus;
  end_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type BillingEvidenceAccessEvent = {
  id: Identifier;
  evidence_id: string;
  organization_id: string;
  account_id: string;
  actor_type: "human" | "customer";
  actor_id: string;
  purpose: BillingEvidenceAccessPurpose;
  result: "allowed" | "denied";
  reason_code: string;
  capability_expires_at: string | null;
  created_at: string;
};

export type BillingAgreementFormulaKind =
  | "fixed"
  | "percentage"
  | "minimum_support"
  | "hybrid";
export type BillingAgreementLifecycleState =
  | "draft"
  | "pending_review"
  | "active"
  | "paused"
  | "superseded"
  | "terminated";
export type BillingAgreementEventType =
  | "draft_saved"
  | "submitted"
  | "activated"
  | "paused"
  | "terminated";
export type BillingRevenueProvenance = "api" | "statement" | "portal";
export type BillingRevenueReviewOutcome =
  | "accept"
  | "reject"
  | "request_correction"
  | "hold";
export type BillingRevenueExceptionReason =
  | "MISSING_EVIDENCE"
  | "CONFLICTING_EVIDENCE"
  | "LATE_EVIDENCE"
  | "ANOMALOUS_REVENUE"
  | "HELD_EVIDENCE"
  | "UNVERIFIED_EVIDENCE";
export type BillingRevenueCloseMode = "accepted_evidence" | "minimum_only";
export type BillingCalculationSelectedBranch =
  | "fixed"
  | "percentage"
  | "minimum"
  | "minimum_equal";
export type BillingAdjustmentTreatment =
  | "true_up"
  | "no_adjustment"
  | "credit_candidate"
  | "held";

export type BillingAgreementRevenueRules = Readonly<{
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

export type BillingAgreementVersion = Readonly<{
  agreement_id: string;
  version_id: string;
  agreement_family: string;
  cadence: "monthly";
  state: BillingAgreementLifecycleState;
  latest_event: BillingAgreementEventType;
  version_number: number;
  effective_start: string;
  effective_end: string;
  formula_kind: BillingAgreementFormulaKind;
  fixed_amount: UsdMoney | null;
  minimum_amount: UsdMoney | null;
  rate: OrdinaryPercentageRate | null;
  currency_policy_version: "usd-v1";
  rate_policy_version: "ordinary-percentage-v1";
  rounding_policy_version: "half-away-from-zero-v1";
  formula_version: "billing-agreement-formula-v1";
  explanation_version: "billing-agreement-explanation-v1";
  signed_evidence_id: string;
  signed_evidence_sha256: string;
  terms_fingerprint: string;
  self_approved: boolean;
  rules: BillingAgreementRevenueRules;
}>;

export type BillingRevenuePeriod = Readonly<{
  id: string;
  organization_id: string;
  account_id: string;
  agreement_id: string;
  agreement_version_id: string;
  period_start: string;
  period_end: string;
  timezone: string;
  submission_deadline_at: string;
  state: "open" | "closed";
  created_at: string;
}>;

export type BillingRevenueEvidenceLink = Readonly<{
  evidence_id: string;
  captured_sha256: string;
  ordinal: number;
}>;

export type BillingRevenueSubmission = Readonly<{
  id: string;
  organization_id: string;
  account_id: string;
  period_id: string;
  revision_number: number;
  previous_submission_id: string | null;
  gross_amount: UsdMoney;
  excluded_amount: UsdMoney;
  commissionable_amount: UsdMoney;
  provenance_kind: BillingRevenueProvenance;
  provenance_source_id: string;
  submitter_id: string;
  submitter_role: BillingRoleName;
  attestation_text: string;
  request_fingerprint: string;
  submitted_at: string;
  evidence: readonly BillingRevenueEvidenceLink[];
}>;

export type BillingRevenueReview = Readonly<{
  id: string;
  period_id: string;
  submission_id: string | null;
  outcome: BillingRevenueReviewOutcome;
  reason_code: BillingRevenueExceptionReason | "REVENUE_ACCEPTED";
  reviewer_id: string;
  reviewer_role: BillingRoleName;
  reason: string;
  input_fingerprint: string;
  evidence_fingerprint: string;
  review_policy_version: "revenue-review-v1";
  created_at: string;
}>;

export type BillingCloseException = Readonly<{
  id: string;
  period_id: string;
  submission_id: string | null;
  reason_code: BillingRevenueExceptionReason;
  amount_at_risk: UsdMoney | null;
  owner_id: string;
  next_action: string;
  due_at: string;
  status: "open" | "resolved";
  caused_by_review_event_id: string;
  opened_at: string;
  resolved_at: string | null;
  resolution_reason: string | null;
}>;

export type BillingRevenueCloseSnapshot = Readonly<{
  id: string;
  period_id: string;
  agreement_id: string;
  agreement_version_id: string;
  close_mode: BillingRevenueCloseMode;
  submission_id: string | null;
  review_event_id: string;
  exception_id: string | null;
  gross_amount: UsdMoney | null;
  excluded_amount: UsdMoney | null;
  commissionable_amount: UsdMoney | null;
  provenance_kind: BillingRevenueProvenance | null;
  provenance_source_id: string | null;
  evidence: readonly BillingRevenueEvidenceLink[];
  agreement_fingerprint: string;
  input_fingerprint: string;
  evidence_fingerprint: string;
  close_input_fingerprint: string;
  review_policy_version: "revenue-review-v1";
  close_policy_version: "revenue-close-v1";
  closed_at: string;
}>;

export type BillingCalculationAnomaly = Readonly<{
  code: string;
  status: "pass" | "fail";
  blocking: boolean;
}>;

export type BillingCalculationComparison = Readonly<{
  status: "available" | "unavailable";
  previous_calculation_id: string | null;
  previous_amount: UsdMoney | null;
  delta: UsdMoney | null;
  delta_rate: ExactRatio | null;
}>;

export type BillingCalculationExplanation = Readonly<{
  kind: BillingAgreementFormulaKind | "late_evidence_adjustment";
  selected_branch?: BillingCalculationSelectedBranch;
  final_amount?: UsdMoney;
  original_amount?: UsdMoney;
  actual_amount?: UsdMoney;
  delta?: UsdMoney;
  treatment?: BillingAdjustmentTreatment;
}>;

export type BillingCalculation = Readonly<{
  id: string;
  account_id: string;
  agreement_id: string;
  agreement_version_id: string;
  period_id: string;
  close_snapshot_id: string;
  formula_kind: BillingAgreementFormulaKind;
  selected_branch: BillingCalculationSelectedBranch;
  final_amount: UsdMoney;
  close_policy_version: "billing-manual-v1" | "billing-auto-v1";
  snapshot_hash: string;
  explanation_hash: string;
  comparison: BillingCalculationComparison;
  status: "created" | "approved";
}>;

export type BillingCalculationEvent = Readonly<{
  id: string;
  calculation_id: string;
  event_type: "created" | "approved";
  actor_type: "human" | "automation";
  actor_id: string;
  actor_role: string;
  approval_mode: "manual" | "auto" | null;
  reason: string;
  preview_fingerprint: string;
  close_policy_version: "billing-manual-v1" | "billing-auto-v1";
  created_at: string;
}>;

export type BillingCalculationLineage = Readonly<{
  calculation: Readonly<{
    id: string;
    formula_kind: BillingAgreementFormulaKind;
    selected_branch: BillingCalculationSelectedBranch;
    result: UsdMoney;
    snapshot_hash_prefix: string;
    explanation_hash_prefix: string;
  }>;
  agreement: Readonly<{
    id: string;
    version_id: string;
    signed_evidence_id: string;
    terms_hash_prefix: string;
    effective_start: string;
    effective_end: string;
  }>;
  period: Readonly<{
    id: string;
    period_start: string;
    period_end: string;
    timezone: string;
  }>;
  evidence_review: Readonly<{
    submission_id: string | null;
    review_event_id: string;
    outcome: BillingRevenueReviewOutcome;
    exception_id: string | null;
    evidence: readonly Readonly<{
      evidence_id: string;
      sha256_prefix: string;
      ordinal: number;
    }>[];
    evidence_hash_prefix: string;
  }>;
  close: Readonly<{
    id: string;
    mode: BillingRevenueCloseMode;
    input_hash_prefix: string;
  }>;
  formula: Readonly<{
    calculation_base: UsdMoney;
    intermediate_numerator: CanonicalIntegerText;
    intermediate_denominator: CanonicalIntegerText;
    fixed_candidate: UsdMoney | null;
    minimum_candidate: UsdMoney | null;
    percentage_candidate: UsdMoney | null;
  }>;
  policies: Readonly<{
    currency: "usd-v1";
    rate: "ordinary-percentage-v1";
    rounding: "half-away-from-zero-v1";
    formula: "billing-agreement-formula-v1";
    revenue_close: "revenue-close-v1";
    calculation_close: "billing-manual-v1" | "billing-auto-v1";
    explanation: "billing-agreement-explanation-v1";
  }>;
  approval: Readonly<{
    event_id: string;
    mode: "manual" | "auto";
    actor_type: "human" | "automation";
  }>;
}>;

export type BillingAdjustmentCalculation = Readonly<{
  id: string;
  original_calculation_id: string;
  late_submission_id: string;
  original_amount: UsdMoney;
  actual_amount: UsdMoney;
  delta: UsdMoney;
  treatment: BillingAdjustmentTreatment;
  status: "approved" | "no_adjustment" | "held";
  snapshot_hash: string;
  relationship_hash: string;
}>;

export type BillingCalculationLink = Readonly<{
  original_calculation_id: string;
  adjustment_calculation_id: string;
  late_submission_id: string;
  late_review_event_id: string;
  link_type: "late_evidence";
  delta: UsdMoney;
  treatment: BillingAdjustmentTreatment;
  relationship_hash: string;
}>;

export type InvoiceStatus =
  | "Draft"
  | "Sent"
  | "Viewed"
  | "Paid"
  | "Overdue"
  | "Cancelled";

export type ExactBillingInvoiceLineItem = Readonly<{
  description: string;
  quantity_ratio: ExactRatio;
  unit_price: UsdMoney;
  extended_amount: UsdMoney;
  currency_policy_version: "usd-v1";
  rounding_policy_version: "half-away-from-zero-v1";
}>;

/** Canonical invoice record returned by the caller-bound exact RPC. */
export type ExactBillingInvoice = Readonly<{
  id: string;
  created_at: string;
  updated_at: string;
  billing_account_id: string;
  company_id: string;
  project_id: string | null;
  deal_id: string | null;
  invoice_number: string;
  description: string | null;
  amount: UsdMoney;
  currency_policy_version: "usd-v1";
  tax_rate: OrdinaryPercentageRate;
  tax_amount: UsdMoney;
  total_amount: UsdMoney;
  rounding_policy_version: "half-away-from-zero-v1";
  line_items: ExactBillingInvoiceLineItem[];
  status: InvoiceStatus;
  issue_date: string;
  due_date: string | null;
  paid_date: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  notes: string | null;
  terms: string | null;
}>;
