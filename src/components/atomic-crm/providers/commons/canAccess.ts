import {
  canAccessBillingPresentation,
  EMPTY_BILLING_CAPABILITY_SUMMARY,
  isBillingPresentationResource,
  type BillingCapabilitySummary,
} from "../../billing-accounts/billingAccess";

// FIXME: This should be exported from the ra-core package
type CanAccessParams<
  RecordType extends Record<string, any> = Record<string, any>,
> = {
  action: string;
  resource: string;
  record?: RecordType;
};

export const canAccess = <
  RecordType extends Record<string, any> = Record<string, any>,
>(
  role: string,
  params: CanAccessParams<RecordType>,
  billingSummary: BillingCapabilitySummary = EMPTY_BILLING_CAPABILITY_SUMMARY,
) => {
  if (isBillingPresentationResource(params.resource)) {
    // Browser checks are presentation only. RLS/RPC/Edge remains authoritative.
    return canAccessBillingPresentation(billingSummary, params);
  }

  if (role === "admin") {
    return true;
  }

  // Non admins can't access the sales resource
  if (params.resource === "sales") {
    return false;
  }

  // Non admins can't access the configuration resource
  if (params.resource === "configuration") {
    return false;
  }

  return true;
};
