export type BillingCapabilitySummary = Readonly<{
  global_capabilities: string[];
  accounts: Array<
    Readonly<{
      account_id: string;
      capabilities: string[];
    }>
  >;
}>;

export type BillingAccessParams = Readonly<{
  resource: string;
  action: string;
  record?: Record<string, unknown>;
}>;

export const EMPTY_BILLING_CAPABILITY_SUMMARY: BillingCapabilitySummary = {
  global_capabilities: [],
  accounts: [],
};

const billingResourceCapabilities: Record<
  string,
  Record<string, string | string[] | false>
> = {
  billing_accounts: {
    list: "account.read",
    show: "account.read",
    create: "account.create",
    edit: "account.update",
    update: "account.update",
    delete: false,
  },
  billing_contacts: {
    list: "contact.read",
    show: "contact.read",
    create: "contact.manage",
    edit: "contact.manage",
    update: "contact.manage",
    delete: false,
  },
  billing_role_assignments: {
    list: "role.read",
    show: "role.read",
    create: "role.manage",
    edit: "role.manage",
    update: "role.manage",
    delete: false,
  },
  billing_automation_principals: {
    list: "automation.read",
    show: "automation.read",
    create: "automation.manage",
    edit: "automation.manage",
    update: "automation.manage",
    delete: false,
  },
  billing_automation_grants: {
    list: "automation.read",
    show: "automation.read",
    create: "automation.manage",
    edit: "automation.manage",
    update: "automation.manage",
    delete: false,
  },
  billing_evidence_support_safe: {
    list: "evidence.read",
    show: "evidence.read",
    access: "evidence.access",
    review: "evidence.review",
    create: "evidence.upload",
    delete: false,
  },
  billing_evidence_access_events: {
    list: ["evidence.review", "audit.read"],
    show: ["evidence.review", "audit.read"],
    delete: false,
  },
  billing_audit_events: {
    list: "audit.read",
    show: "audit.read",
    delete: false,
  },
};

export const isBillingPresentationResource = (resource: string) =>
  Object.hasOwn(billingResourceCapabilities, resource) ||
  resource.startsWith("billing_");

const accountIdFrom = (record: Record<string, unknown> | undefined) => {
  const value = record?.account_id ?? record?.id;
  return typeof value === "string" ? value : null;
};

export const canAccessBillingPresentation = (
  summary: BillingCapabilitySummary,
  params: BillingAccessParams,
) => {
  const capability =
    billingResourceCapabilities[params.resource]?.[params.action];
  if (capability === false || capability === undefined) return false;
  const capabilities = Array.isArray(capability) ? capability : [capability];
  if (
    capabilities.some((candidate) =>
      summary.global_capabilities.includes(candidate),
    )
  )
    return true;

  const accountId = accountIdFrom(params.record);
  if (accountId) {
    return Boolean(
      summary.accounts
        .find((account) => account.account_id === accountId)
        ?.capabilities.some((candidate) => capabilities.includes(candidate)),
    );
  }

  return summary.accounts.some((account) =>
    account.capabilities.some((candidate) => capabilities.includes(candidate)),
  );
};

type BillingSecurityInvalidator = () => void | Promise<void>;
const billingSecurityInvalidators = new Set<BillingSecurityInvalidator>();

export const registerBillingSecurityInvalidator = (
  invalidator: BillingSecurityInvalidator,
) => {
  billingSecurityInvalidators.add(invalidator);
  return () => billingSecurityInvalidators.delete(invalidator);
};

export const invalidateBillingSecurityState = async () => {
  await Promise.all(
    [...billingSecurityInvalidators].map((invalidator) => invalidator()),
  );
};

const containsSensitiveBillingToken = (value: unknown): boolean => {
  if (typeof value === "string") {
    const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, "");
    return normalized.startsWith("billing");
  }
  if (Array.isArray(value)) return value.some(containsSensitiveBillingToken);
  if (value && typeof value === "object") {
    return Object.entries(value).some(
      ([key, nested]) =>
        containsSensitiveBillingToken(key) ||
        containsSensitiveBillingToken(nested),
    );
  }
  return false;
};

export const isSensitiveBillingQueryKey = (queryKey: unknown) =>
  containsSensitiveBillingToken(queryKey);

export const shouldPersistBillingQuery = (query: { queryKey: unknown }) =>
  !isSensitiveBillingQueryKey(query.queryKey);
