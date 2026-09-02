import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { ReleaseSurfaceMetadata } from "../root/ReleaseSurfaceMetadata";

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

  return <ReleaseSurfaceMetadata canonicalPath={location.pathname} />;
};
