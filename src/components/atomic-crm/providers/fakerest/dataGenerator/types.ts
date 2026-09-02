import type {
  BillingAccount,
  BillingAccountOwner,
  BillingAutomationGrant,
  BillingAutomationPrincipal,
  BillingContact,
  BillingEvidenceAccessEvent,
  BillingEvidenceMetadata,
  BillingOrganization,
  BillingRole,
  BillingRoleAssignment,
  BillingRoleCapability,
  Company,
  Contact,
  ContactNote,
  Deal,
  DealNote,
  Sale,
  Tag,
  Task,
} from "../../../types";
import type { ConfigurationContextValue } from "../../../root/ConfigurationContext";

export interface Db {
  billing_organizations: BillingOrganization[];
  billing_accounts: BillingAccount[];
  billing_account_owners: BillingAccountOwner[];
  billing_contacts: BillingContact[];
  billing_roles: Array<BillingRole & { id: string }>;
  billing_role_capabilities: Array<BillingRoleCapability & { id: string }>;
  billing_role_assignments: BillingRoleAssignment[];
  billing_automation_principals: BillingAutomationPrincipal[];
  billing_automation_grants: BillingAutomationGrant[];
  billing_evidence_support_safe: BillingEvidenceMetadata[];
  billing_evidence_access_events: BillingEvidenceAccessEvent[];
  companies: Required<Company>[];
  contacts: Required<Contact>[];
  contact_notes: ContactNote[];
  deals: Deal[];
  deal_notes: DealNote[];
  sales: Sale[];
  tags: Tag[];
  tasks: Task[];
  configuration: Array<{ id: number; config: ConfigurationContextValue }>;
}
