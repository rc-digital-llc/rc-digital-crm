import { describe, expect, it } from "vitest";

import { verifyProductionAuthConfig } from "../../scripts/release/verify-production-auth-config.mjs";

const expected = {
  project_ref: "gtasqgavcrodxusvcsyt",
  site_url: "https://atomic-crm-sigma-one.vercel.app",
  required_redirect_urls: ["https://atomic-crm-sigma-one.vercel.app/**"],
  forbidden_redirect_url_patterns: ["localhost", "127.0.0.1"],
};

const current = {
  site_url: "https://atomic-crm-sigma-one.vercel.app",
  uri_allow_list: "https://atomic-crm-sigma-one.vercel.app/**",
};

describe("production Supabase Auth redirect contract", () => {
  it("accepts the canonical site and required redirect", () => {
    expect(
      verifyProductionAuthConfig({
        expected,
        current,
        projectRef: expected.project_ref,
      }),
    ).toEqual({
      project_ref: expected.project_ref,
      site_url: expected.site_url,
      required_redirects_verified: 1,
    });
  });

  it("rejects the escaped localhost Site URL", () => {
    expect(() =>
      verifyProductionAuthConfig({
        expected,
        current: { ...current, site_url: "http://localhost:3000" },
        projectRef: expected.project_ref,
      }),
    ).toThrow(/site URL/i);
  });

  it("rejects a missing canonical allow-list entry", () => {
    expect(() =>
      verifyProductionAuthConfig({
        expected,
        current: { ...current, uri_allow_list: "" },
        projectRef: expected.project_ref,
      }),
    ).toThrow(/required redirect/i);
  });

  it("rejects localhost anywhere in the production allow list", () => {
    expect(() =>
      verifyProductionAuthConfig({
        expected,
        current: {
          ...current,
          uri_allow_list: `${current.uri_allow_list},http://localhost:5173/**`,
        },
        projectRef: expected.project_ref,
      }),
    ).toThrow(/forbidden redirect/i);
  });

  it("rejects a different Supabase project", () => {
    expect(() =>
      verifyProductionAuthConfig({
        expected,
        current,
        projectRef: "different-project",
      }),
    ).toThrow(/project reference/i);
  });
});
