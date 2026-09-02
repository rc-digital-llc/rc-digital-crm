export const RELEASE_SURFACE_MARKER = "billing-security-phase2";
export const RELEASE_CANONICAL_ORIGIN =
  "https://atomic-crm-sigma-one.vercel.app";

export const buildReleaseCanonicalUrl = (canonicalPath: string) =>
  new URL(canonicalPath, RELEASE_CANONICAL_ORIGIN).href;
