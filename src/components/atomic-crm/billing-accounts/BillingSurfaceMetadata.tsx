import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export const BILLING_SECURITY_SURFACE_MARKER = "billing-security-phase2";
export const BILLING_CANONICAL_ORIGIN =
  "https://atomic-crm-ryans-projects-51d84217.vercel.app";

export const BillingSurfaceMetadata = () => {
  const location = useLocation();

  useEffect(() => {
    const previousScrollPaddingBottom =
      document.documentElement.style.scrollPaddingBottom;
    document.documentElement.style.scrollPaddingBottom = "9.5rem";
    const canonical = document.createElement("link");
    canonical.rel = "canonical";
    canonical.href = new URL(location.pathname, BILLING_CANONICAL_ORIGIN).href;
    canonical.dataset.billingCanonical = "true";
    document.head.append(canonical);
    return () => {
      canonical.remove();
      document.documentElement.style.scrollPaddingBottom =
        previousScrollPaddingBottom;
    };
  }, [location.pathname]);

  return null;
};
