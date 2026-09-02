import { useEffect } from "react";

import { buildReleaseCanonicalUrl } from "./releaseSurface";

export const ReleaseSurfaceMetadata = ({
  canonicalPath,
}: {
  canonicalPath: string;
}) => {
  useEffect(() => {
    const canonical = document.createElement("link");
    canonical.rel = "canonical";
    canonical.href = buildReleaseCanonicalUrl(canonicalPath);
    canonical.dataset.releaseCanonical = "true";
    document.head.append(canonical);

    return () => canonical.remove();
  }, [canonicalPath]);

  return null;
};
