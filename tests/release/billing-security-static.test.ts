import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const readSource = (relativePath: string) =>
  fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
const readJson = (relativePath: string) =>
  JSON.parse(readSource(relativePath)) as Record<string, unknown>;

const globExpression = (pattern: string) => {
  let expression = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === "*" && pattern[index + 1] === "*") {
      expression += ".*";
      index += 1;
    } else if (character === "*") {
      expression += "[^/]*";
    } else {
      expression += character.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
    }
  }
  return new RegExp(`^${expression}$`);
};

describe("billing resource registration", () => {
  it("registers one authorized billing account resource in each application tree", () => {
    const source = readSource("src/components/atomic-crm/root/CRM.tsx");
    const desktop = source.slice(
      source.indexOf("const DesktopAdmin"),
      source.indexOf("const MobileAdmin"),
    );
    const mobile = source.slice(source.indexOf("const MobileAdmin"));

    expect(source).toMatch(
      /import billingAccounts,[\s\S]{0,80}from "\.\.\/billing-accounts"/,
    );
    expect(source).toContain("BillingAccountListMobile");
    expect(desktop.match(/name="billing_accounts"/g)).toHaveLength(1);
    expect(mobile.match(/name="billing_accounts"/g)).toHaveLength(1);
    expect(desktop).toMatch(
      /<Resource name="billing_accounts" \{\.\.\.billingAccounts\} \/>/,
    );
    expect(mobile).toMatch(
      /<Resource[\s\S]{0,180}name="billing_accounts"[\s\S]{0,180}list=\{BillingAccountListMobile\}/,
    );
  });

  it("renders one deterministic non-sensitive freshness marker on both list branches", () => {
    const listSource = readSource(
      "src/components/atomic-crm/billing-accounts/BillingAccountList.tsx",
    );
    const metadataSource = readSource(
      "src/components/atomic-crm/billing-accounts/BillingSurfaceMetadata.tsx",
    );
    const releaseMetadataSource = readSource(
      "src/components/atomic-crm/root/releaseSurface.ts",
    );

    expect(
      releaseMetadataSource.match(/auth-confirmation-redirect-v1/g),
    ).toHaveLength(1);
    expect(metadataSource).toContain("scrollPaddingBottom");
    expect(metadataSource).toContain('"9.5rem"');
    expect(metadataSource).toContain("ReleaseSurfaceMetadata");
    expect(listSource.match(/data-surface-version/g)).toHaveLength(2);
    expect(listSource).toMatch(
      /isPending \? undefined : RELEASE_SURFACE_MARKER/,
    );
    expect(listSource).not.toMatch(
      /export const BillingAccountList = \(\) => \([\s\S]{0,160}data-surface-version/,
    );
    expect(
      `${releaseMetadataSource}\n${metadataSource}\n${listSource}`,
    ).not.toMatch(
      /data-surface-version[\s\S]{0,100}(?:customer_name|organization_id|account_id|commit|sha|token)/i,
    );
  });

  it("keeps menu visibility presentation-only while direct routes stay registered", () => {
    const sidebar = readSource("src/components/admin/app-sidebar.tsx");
    const desktopNavigation = readSource(
      "src/components/atomic-crm/layout/Header.tsx",
    );
    const mobileNavigation = readSource(
      "src/components/atomic-crm/layout/MobileNavigation.tsx",
    );
    const commonAccess = readSource(
      "src/components/atomic-crm/providers/commons/canAccess.ts",
    );

    expect(sidebar).toContain("useCanAccess");
    expect(sidebar).toContain('action: "list"');
    for (const navigation of [desktopNavigation, mobileNavigation]) {
      expect(navigation).toContain('resource="billing_accounts"');
      expect(navigation).toContain('to="/billing_accounts"');
      expect(navigation).toContain("Billing accounts");
    }
    expect(commonAccess).toContain("presentation only");
    expect(commonAccess).toContain("RLS/RPC/Edge remains authoritative");
  });
});

describe("billing surface contracts", () => {
  const contractPaths = {
    source: "qa/billing-accounts.surface.source.json",
    preview: "qa/billing-accounts.surface.preview.json",
    production: "qa/billing-accounts.surface.production.json",
  } as const;
  const deployedMatrix = [
    [320, 568],
    [360, 800],
    [393, 852],
    [430, 932],
    [740, 360],
  ];

  it("uses browser-history routing for deep-linkable billing paths", () => {
    for (const entrypoint of ["src/main.tsx", "demo/main.tsx"]) {
      const source = readSource(entrypoint);

      expect(source).toContain(
        'import { BrowserRouter } from "react-router-dom"',
      );
      expect(source).toMatch(
        /<BrowserRouter>[\s\S]*<App \/>[\s\S]*<\/BrowserRouter>/,
      );
    }
    for (const config of ["vite.config.ts", "vite.demo.config.ts"]) {
      expect(readSource(config)).toContain('base: "/"');
    }
    const defaults = readSource(
      "src/components/atomic-crm/root/defaultConfiguration.ts",
    );
    expect(defaults).toContain('"/logos/logo_atomic_crm_dark.svg"');
    expect(defaults).toContain('"/logos/logo_atomic_crm_light.svg"');
  });

  it("gives the demo administrator the create capability exercised by the surface gate", () => {
    const source = readSource(
      "src/components/atomic-crm/providers/fakerest/dataGenerator/billingAccounts.ts",
    );

    expect(source).toContain('id: "administrator:account.create"');
    expect(source).toContain('capability: "account.create"');
  });

  it("encodes source and independent deployed viewport stages", () => {
    const contracts = Object.fromEntries(
      Object.entries(contractPaths).map(([stage, filename]) => [
        stage,
        readJson(filename),
      ]),
    ) as Record<string, Record<string, unknown>>;
    const dimensions = (contract: Record<string, unknown>) =>
      (contract.viewports as Array<{ width: number; height: number }>).map(
        ({ width, height }) => [width, height],
      );

    expect(dimensions(contracts.source)).toEqual([
      [320, 568],
      [1280, 800],
    ]);
    expect(dimensions(contracts.preview)).toEqual(deployedMatrix);
    expect(dimensions(contracts.production)).toEqual(deployedMatrix);
    expect(contracts.preview.expected_serving_origin).not.toBe(
      contracts.production.expected_serving_origin,
    );
  });

  it("requires exact route, canonical identity, freshness, and rendered safety checks", () => {
    for (const [stage, filename] of Object.entries(contractPaths)) {
      const contract = readJson(filename);
      const serialized = JSON.stringify(contract);
      const routes = contract.routes as Array<Record<string, unknown>>;
      const targets = contract.critical_targets as Array<
        Record<string, unknown>
      >;
      const fixed = contract.fixed_elements as Array<Record<string, unknown>>;

      expect(contract.schema_version).toBe("1.0");
      expect(contract.canonical_policy).toBe("match");
      expect(contract.expected_serving_origin).toMatch(/^https?:\/\//);
      expect(contract.expected_canonical_origin).toBe(
        "https://atomic-crm-sigma-one.vercel.app",
      );
      expect(contract.freshness_markers).toEqual([
        "auth-confirmation-redirect-v1",
      ]);
      expect(routes).toEqual([
        {
          path: "/billing_accounts",
          expected_canonical_path: "/billing_accounts",
        },
        {
          path: "/billing_accounts/create",
          expected_canonical_path: "/billing_accounts/create",
        },
      ]);
      expect(contract.readiness_selector).toBe(
        '[data-surface-version="auth-confirmation-redirect-v1"]',
      );
      expect(contract.min_touch_target_css_px).toBe(44);
      expect(contract.max_console_errors).toBe(0);
      expect(contract.max_page_errors).toBe(0);
      expect(
        targets.some(({ selector }) => String(selector).includes("create")),
      ).toBe(true);
      expect(
        targets.some(({ selector }) =>
          String(selector).includes("Open billing account details"),
        ),
      ).toBe(true);
      expect(fixed).toHaveLength(2);
      expect(contract.forbidden_visible_selectors).toEqual(
        expect.arrayContaining([
          '[role="dialog"][data-state="open"]',
          '[role="alertdialog"]',
        ]),
      );
      expect(serialized).not.toMatch(
        /password|credential|secret|token|cookie|organization_id|account_id|customer_name|contact@/i,
      );
      if (stage !== "source") {
        expect(contract.stability_wait_ms).toBeGreaterThanOrEqual(500);
      }
      if (stage === "preview") {
        expect(contract.expected_serving_origin).toMatch(
          /^https:\/\/atomic-[a-z0-9]+-ryans-projects-51d84217\.vercel\.app$/,
        );
      }
      if (stage === "production") {
        expect(contract.expected_serving_origin).toBe(
          contract.expected_canonical_origin,
        );
      }
    }
  });

  it("runs the exact demo build and shared gate with argv, redaction, and bounded cleanup", () => {
    const source = readSource("scripts/release/run-billing-source-surface.mjs");

    expect(source).toContain("build:demo");
    expect(source).toContain("surface_gate.py");
    expect(source).toContain("127.0.0.1");
    expect(source).toContain("shell: false");
    expect(source).toContain("redactOutput");
    expect(source).toContain("finally");
    expect(source).toContain("SIGTERM");
    expect(source).toContain("SIGKILL");
    expect(source).not.toMatch(/execSync|execFileSync|shell:\s*true/);
  });
});

describe("phase 2 blocking lanes", () => {
  const databaseSqlTests = [
    "supabase/tests/database/00_schema_contracts.sql",
    "supabase/tests/database/10_authorization_rls.sql",
    "supabase/tests/database/20_rpc_trigger.sql",
    "supabase/tests/database/30_billing_tenancy.sql",
    "supabase/tests/database/35_billing_automation.sql",
    "supabase/tests/database/40_billing_evidence.sql",
    "supabase/tests/database/45_billing_account_commands.sql",
    "supabase/tests/database/50_billing_access_commands.sql",
    "supabase/tests/database/55_billing_evidence_presentation.sql",
  ];
  const databaseHttpTests = [
    "tests/release/auth-rls-rpc-trigger.test.ts",
    "tests/release/billing-tenancy.test.ts",
  ];
  const functionTests = [
    "tests/release/edge-webhook-provider.test.ts",
    "tests/release/billing-evidence.test.ts",
  ];
  const fastTests = [
    "tests/release/billing-redaction.test.ts",
    "src/components/atomic-crm/billing-accounts/billingDataProvider.test.ts",
    "src/components/atomic-crm/billing-accounts/billingAccounts.test.ts",
    "tests/release/billing-security-static.test.ts",
  ];

  it("couples every Phase 2 contract to an existing required lane", () => {
    const makefile = readSource("makefile");
    const workflow = readSource(".github/workflows/financial-release-gate.yml");
    const financialTargets = makefile.slice(0, makefile.indexOf("\ninstall:"));

    for (const filename of [
      ...databaseSqlTests,
      ...databaseHttpTests,
      ...functionTests,
      ...fastTests,
    ]) {
      expect(financialTargets, filename).toContain(filename);
    }
    expect(financialTargets).toContain("test-financial-fast:");
    expect(financialTargets).toMatch(
      /test-release-security:[\s\S]*?\$\(MAKE\) test-financial-fast/,
    );

    const requiredNames = [
      "migration-clean",
      "migration-upgrade",
      "database-contracts",
      "edge-provider-contracts",
      "replay-concurrency",
      "release-security",
    ];
    const jobBlocks = workflow.split(/^ {2}(?=[a-z][a-z-]+:)/m);
    const requiredJobs = jobBlocks.filter((block) =>
      /name:\s*financial \/ [a-z-]+\s*$/m.test(block),
    );
    expect(requiredJobs).toHaveLength(6);
    for (const name of requiredNames) {
      const job = requiredJobs.find((block) =>
        block.includes(`name: financial / ${name}`),
      );
      expect(job, name).toBeDefined();
      expect(job).toContain("github.event_name == 'merge_group'");
      expect(job).not.toMatch(/continue-on-error|retry/i);
    }
    expect(financialTargets).not.toMatch(
      /supabase\s+(?:link|db\s+push|functions\s+deploy)|continue-on-error|assertion.{0,20}retry/i,
    );
  });

  it("classifies every Phase 2 authority, provider, UI, and QA path as financial", () => {
    const configuration = readJson(".github/release/financial-paths.json");
    const patterns = configuration.financial_paths as string[];
    const expressions = patterns.map(globExpression);
    const isFinancial = (filename: string) =>
      expressions.some((expression) => expression.test(filename));
    const protectedPaths = [
      "supabase/migrations/20260901000007_billing_evidence_presentation.sql",
      "supabase/functions/_shared/billingAuthorization.ts",
      "supabase/functions/billing_evidence/index.ts",
      "supabase/tests/database/55_billing_evidence_presentation.sql",
      "tests/release/billing-tenancy.test.ts",
      "scripts/release/run-billing-source-surface.mjs",
      "src/components/atomic-crm/billing-accounts/BillingAccountList.tsx",
      "src/components/atomic-crm/providers/commons/canAccess.ts",
      "src/components/atomic-crm/providers/supabase/authProvider.ts",
      "src/components/atomic-crm/providers/fakerest/dataProvider.ts",
      "src/components/atomic-crm/root/CRM.tsx",
      "src/components/atomic-crm/layout/Header.tsx",
      "src/components/atomic-crm/layout/MobileNavigation.tsx",
      "src/components/atomic-crm/types.ts",
      "src/main.tsx",
      "demo/App.tsx",
      "vite.demo.config.ts",
      "qa/billing-accounts.surface.preview.json",
      "vercel.json",
    ];

    for (const filename of protectedPaths) {
      expect(isFinancial(filename), filename).toBe(true);
    }
    expect(isFinancial("README.md")).toBe(false);
  });
});
