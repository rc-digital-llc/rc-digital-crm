import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  RELEASE_CANONICAL_ORIGIN,
  RELEASE_SURFACE_MARKER,
  buildReleaseCanonicalUrl,
} from "../../src/components/atomic-crm/root/releaseSurface";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const readSource = (relativePath: string) =>
  fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");

describe("public production entry surface", () => {
  it("uses the verified public Vercel domain for shared release metadata", () => {
    expect(RELEASE_CANONICAL_ORIGIN).toBe(
      "https://atomic-crm-sigma-one.vercel.app",
    );
    expect(RELEASE_SURFACE_MARKER).toBe("billing-security-phase2");
    expect(buildReleaseCanonicalUrl("/")).toBe(
      "https://atomic-crm-sigma-one.vercel.app/",
    );
    expect(buildReleaseCanonicalUrl("/billing_accounts")).toBe(
      "https://atomic-crm-sigma-one.vercel.app/billing_accounts",
    );
  });

  it("marks both first-owner setup and returning-user login without credentials", () => {
    const metadata = readSource(
      "src/components/atomic-crm/root/ReleaseSurfaceMetadata.tsx",
    );
    const login = readSource("src/components/atomic-crm/login/LoginPage.tsx");
    const signup = readSource("src/components/atomic-crm/login/SignupPage.tsx");

    expect(metadata).toContain('canonical.rel = "canonical"');
    expect(metadata).toContain("document.head.append(canonical)");
    expect(metadata).toContain("canonical.remove()");
    for (const source of [login, signup]) {
      expect(source).toContain("data-surface-version={RELEASE_SURFACE_MARKER}");
      expect(source).toContain('<ReleaseSurfaceMetadata canonicalPath="/" />');
    }
    expect(login).toContain("h-11");
    expect(signup).toContain('className="h-11 w-full"');
    expect(signup).toContain("disabled={isSignUpPending}");
    expect(signup).not.toContain("!isValid");
  });

  it("defines a credential-free five-viewport production contract", () => {
    const contract = JSON.parse(
      readSource("qa/public-entry.surface.production.json"),
    ) as Record<string, unknown>;
    const viewports = contract.viewports as Array<{
      width: number;
      height: number;
    }>;

    expect(contract.expected_serving_origin).toBe(RELEASE_CANONICAL_ORIGIN);
    expect(contract.expected_canonical_origin).toBe(RELEASE_CANONICAL_ORIGIN);
    expect(contract.canonical_policy).toBe("match");
    expect(contract.freshness_markers).toEqual([RELEASE_SURFACE_MARKER]);
    expect(contract.readiness_selector).toBe(
      `[data-surface-version="${RELEASE_SURFACE_MARKER}"]`,
    );
    expect(viewports.map(({ width, height }) => [width, height])).toEqual([
      [320, 568],
      [360, 800],
      [393, 852],
      [430, 932],
      [740, 360],
    ]);
    expect(contract.routes).toEqual([
      { path: "/", expected_canonical_path: "/" },
    ]);
    expect(contract.critical_targets).toEqual([
      {
        selector: 'button[type="submit"]',
        min_width: 44,
        min_height: 44,
        max_viewport_width: 430,
      },
    ]);
    expect(JSON.stringify(contract)).not.toMatch(
      /password|credential|secret|token|cookie|organization_id|account_id|customer_name|contact@/i,
    );
  });
});
