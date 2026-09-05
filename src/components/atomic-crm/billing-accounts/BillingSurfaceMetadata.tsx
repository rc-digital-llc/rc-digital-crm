import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { ReleaseSurfaceMetadata } from "../root/ReleaseSurfaceMetadata";
import { PHASE4_BILLING_SURFACE_MARKER } from "../root/releaseSurface";

export const BillingSurfaceMetadata = () => {
  const location = useLocation();

  useEffect(() => {
    const previousScrollPaddingBottom =
      document.documentElement.style.scrollPaddingBottom;
    document.documentElement.style.scrollPaddingBottom = "9.5rem";
    return () => {
      document.documentElement.style.scrollPaddingBottom =
        previousScrollPaddingBottom;
    };
  }, [location.pathname]);

  return (
    <>
      <ReleaseSurfaceMetadata canonicalPath={location.pathname} />
      <span
        className="sr-only"
        data-phase4-surface-version={PHASE4_BILLING_SURFACE_MARKER}
      >
        {PHASE4_BILLING_SURFACE_MARKER}
      </span>
    </>
  );
};
