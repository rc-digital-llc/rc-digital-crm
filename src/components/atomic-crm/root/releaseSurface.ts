export const RELEASE_SURFACE_MARKER = "auth-confirmation-redirect-v1";
export const RELEASE_CANONICAL_ORIGIN =
  "https://atomic-crm-sigma-one.vercel.app";

export const buildReleaseCanonicalUrl = (canonicalPath: string) =>
  new URL(canonicalPath, RELEASE_CANONICAL_ORIGIN).href;
