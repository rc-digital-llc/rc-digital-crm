import { RELEASE_CANONICAL_ORIGIN } from "../../root/releaseSurface";

const LOCAL_AUTH_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

export const resolveEmailRedirectOrigin = (currentOrigin?: string) => {
  if (!currentOrigin) return RELEASE_CANONICAL_ORIGIN;

  try {
    const url = new URL(currentOrigin);
    return LOCAL_AUTH_HOSTNAMES.has(url.hostname)
      ? url.origin
      : RELEASE_CANONICAL_ORIGIN;
  } catch {
    return RELEASE_CANONICAL_ORIGIN;
  }
};

export const getEmailRedirectTo = () =>
  resolveEmailRedirectOrigin(
    typeof window === "undefined" ? undefined : window.location.origin,
  );
