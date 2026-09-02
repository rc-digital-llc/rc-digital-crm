import type { AuthProvider } from "ra-core";
import { supabaseAuthProvider } from "ra-supabase-core";

import { canAccess } from "../commons/canAccess";
import { supabase } from "./supabase";
import { analytics } from "@/providers/posthog";
import {
  EMPTY_BILLING_CAPABILITY_SUMMARY,
  isBillingPresentationResource,
  registerBillingSecurityInvalidator,
  type BillingCapabilitySummary,
} from "../../billing-accounts/billingAccess";

const baseAuthProvider = supabaseAuthProvider(supabase, {
  getIdentity: async () => {
    const sale = await getSale();

    if (sale == null) {
      throw new Error();
    }

    return {
      id: sale.id,
      fullName: `${sale.first_name} ${sale.last_name}`,
      avatar: sale.avatar?.src,
    };
  },
});

// To speed up checks, we cache the initialization state
// and the current sale in the local storage. They are cleared on logout.
const IS_INITIALIZED_CACHE_KEY = "RaStore.auth.is_initialized";
const CURRENT_SALE_CACHE_KEY = "RaStore.auth.current_sale";

function getLocalStorage(): Storage | null {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  return null;
}

export async function getIsInitialized() {
  const storage = getLocalStorage();
  const cachedValue = storage?.getItem(IS_INITIALIZED_CACHE_KEY);
  if (cachedValue != null) {
    return cachedValue === "true";
  }

  const { data } = await supabase.from("init_state").select("is_initialized");
  const isInitialized = data?.at(0)?.is_initialized > 0;

  if (isInitialized) {
    storage?.setItem(IS_INITIALIZED_CACHE_KEY, "true");
  }

  return isInitialized;
}

const getSale = async () => {
  const storage = getLocalStorage();
  const cachedValue = storage?.getItem(CURRENT_SALE_CACHE_KEY);
  if (cachedValue != null) {
    return JSON.parse(cachedValue);
  }

  const { data: dataSession, error: errorSession } =
    await supabase.auth.getSession();

  // Shouldn't happen after login but just in case
  if (dataSession?.session?.user == null || errorSession) {
    return undefined;
  }

  const { data: dataSale, error: errorSale } = await supabase
    .from("sales")
    .select("id, first_name, last_name, avatar, administrator")
    .match({ user_id: dataSession?.session?.user.id })
    .single();

  // Shouldn't happen either as all users are sales but just in case
  if (dataSale == null || errorSale) {
    return undefined;
  }

  storage?.setItem(CURRENT_SALE_CACHE_KEY, JSON.stringify(dataSale));
  return dataSale;
};

function clearCache() {
  const storage = getLocalStorage();
  storage?.removeItem(IS_INITIALIZED_CACHE_KEY);
  storage?.removeItem(CURRENT_SALE_CACHE_KEY);
}

let billingCapabilityCache: Promise<BillingCapabilitySummary> | null = null;

const normalizeBillingCapabilitySummary = (
  value: unknown,
): BillingCapabilitySummary => {
  if (!value || typeof value !== "object") {
    return EMPTY_BILLING_CAPABILITY_SUMMARY;
  }
  const summary = value as Record<string, unknown>;
  const globalCapabilities = Array.isArray(summary.global_capabilities)
    ? summary.global_capabilities.filter(
        (capability): capability is string => typeof capability === "string",
      )
    : [];
  const accounts = Array.isArray(summary.accounts)
    ? summary.accounts.flatMap((value) => {
        if (!value || typeof value !== "object") return [];
        const account = value as Record<string, unknown>;
        if (
          typeof account.account_id !== "string" ||
          !Array.isArray(account.capabilities)
        ) {
          return [];
        }
        return [
          {
            account_id: account.account_id,
            capabilities: account.capabilities.filter(
              (capability): capability is string =>
                typeof capability === "string",
            ),
          },
        ];
      })
    : [];
  return { global_capabilities: globalCapabilities, accounts };
};

export const clearBillingCapabilityCache = () => {
  billingCapabilityCache = null;
};

export const getBillingCapabilitySummary = async () => {
  if (!billingCapabilityCache) {
    billingCapabilityCache = supabase
      .rpc("get_billing_capability_summary")
      .then(({ data, error }) => {
        if (error) return EMPTY_BILLING_CAPABILITY_SUMMARY;
        return normalizeBillingCapabilitySummary(data);
      });
  }
  return billingCapabilityCache;
};

registerBillingSecurityInvalidator(clearBillingCapabilityCache);

export const authProvider: AuthProvider = {
  ...baseAuthProvider,
  login: async (params) => {
    clearBillingCapabilityCache();
    if (params.ssoDomain) {
      const { error } = await supabase.auth.signInWithSSO({
        domain: params.ssoDomain,
      });
      if (error) {
        throw error;
      }
      return;
    }
    const result = await baseAuthProvider.login(params);
    // Identify user in PostHog after successful login
    try {
      const sale = await getSale();
      if (sale) {
        analytics.identifyUser(String(sale.id), {
          name: `${sale.first_name} ${sale.last_name}`,
          role: sale.administrator ? "admin" : "user",
        });
      }
    } catch {
      // Non-critical: analytics identification failure should not block login
    }
    return result;
  },
  logout: async (params) => {
    clearCache();
    clearBillingCapabilityCache();
    return baseAuthProvider.logout(params);
  },
  checkAuth: async (params) => {
    // Users are on the set-password page, nothing to do
    if (
      window.location.pathname === "/set-password" ||
      window.location.hash.includes("#/set-password")
    ) {
      return;
    }
    // Users are on the forgot-password page, nothing to do
    if (
      window.location.pathname === "/forgot-password" ||
      window.location.hash.includes("#/forgot-password")
    ) {
      return;
    }
    // Users are on the sign-up page, nothing to do
    if (
      window.location.pathname === "/sign-up" ||
      window.location.hash.includes("#/sign-up")
    ) {
      return;
    }

    const isInitialized = await getIsInitialized();

    if (!isInitialized) {
      await supabase.auth.signOut();
      throw {
        redirectTo: "/sign-up",
        message: false,
      };
    }

    return baseAuthProvider.checkAuth(params);
  },
  canAccess: async (params) => {
    const isInitialized = await getIsInitialized();
    if (!isInitialized) return false;

    // Get the current user
    const sale = await getSale();
    if (sale == null) return false;

    // Compute access rights from the sale role
    const role = sale.administrator ? "admin" : "user";
    const billingSummary = isBillingPresentationResource(params.resource)
      ? await getBillingCapabilitySummary()
      : EMPTY_BILLING_CAPABILITY_SUMMARY;
    return canAccess(role, params, billingSummary);
  },
  getAuthorizationDetails(authorizationId: string) {
    return supabase.auth.oauth.getAuthorizationDetails(authorizationId);
  },
  approveAuthorization(authorizationId: string) {
    return supabase.auth.oauth.approveAuthorization(authorizationId);
  },
  denyAuthorization(authorizationId: string) {
    return supabase.auth.oauth.denyAuthorization(authorizationId);
  },
};
