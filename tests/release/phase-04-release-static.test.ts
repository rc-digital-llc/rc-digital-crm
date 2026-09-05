import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readSource(relativePath: string): string {
  return readFileSync(
    new URL(`../../${relativePath}`, import.meta.url),
    "utf8",
  );
}

function readJson(relativePath: string): Record<string, unknown> {
  return JSON.parse(readSource(relativePath)) as Record<string, unknown>;
}

function globExpression(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `^${escaped.replaceAll("**", "::DOUBLE_STAR::").replaceAll("*", "[^/]*").replaceAll("::DOUBLE_STAR::", ".*")}$`,
  );
}

const phase4Migrations = [
  "20260904000001_billing_agreements.sql",
  "20260904000002_billing_revenue_periods.sql",
  "20260904000003_billing_calculations.sql",
  "20260904000004_billing_calculation_close.sql",
  "20260904000005_billing_provider_reads.sql",
  "20260904000006_billing_agreement_history_read.sql",
  "20260904000007_billing_adjustment_support_read.sql",
];

const phase4SqlTests = [
  "supabase/tests/database/70_billing_agreements.sql",
  "supabase/tests/database/75_billing_revenue_periods.sql",
  "supabase/tests/database/80_billing_calculations.sql",
  "supabase/tests/database/85_billing_calculation_close.sql",
  "supabase/tests/database/90_billing_provider_reads.sql",
  "supabase/tests/database/92_billing_agreement_history_read.sql",
  "supabase/tests/database/94_billing_adjustment_support_read.sql",
];

const phase4FastTests = [
  "src/components/atomic-crm/financial/billingCloseProviderContract.test.ts",
  "src/components/atomic-crm/billing-accounts/BillingAgreementPanel.test.tsx",
  "src/components/atomic-crm/billing-accounts/BillingMonthlyClosePanel.test.tsx",
  "tests/release/phase-04-release-static.test.ts",
];

describe("Phase 4 protected release coupling", () => {
  it("registers the complete ordered Phase 4 migration set and exact file hashes", () => {
    const registry = readJson(
      "supabase/tests/upgrades/004-agreement-close/expected-transformations.json",
    ) as {
      registry_id: string;
      sequence: number;
      migrations: string[];
      migration_sha256: Record<string, string>;
    };

    expect(registry).toMatchObject({
      registry_id: "004-agreement-close",
      sequence: 4,
      migrations: phase4Migrations.map((filename) => filename.slice(0, 14)),
    });
    expect(Object.keys(registry.migration_sha256)).toEqual(registry.migrations);
    for (const filename of phase4Migrations) {
      const version = filename.slice(0, 14);
      expect(registry.migration_sha256[version]).toBe(
        createHash("sha256")
          .update(readSource(`supabase/migrations/${filename}`))
          .digest("hex"),
      );
    }
  });

  it("keeps accepted registries 001 through 003 byte-identical", () => {
    const accepted = {
      "supabase/tests/baselines/001-pre-financial/manifest.json":
        "eb1f2e2cdee134e72f45664a11557dcecce66cec1011cfdfaf99bd5dfd100e93",
      "supabase/tests/upgrades/002-billing-tenancy/expected-transformations.json":
        "dea0df2f23c11c7292e01996fa32e9a0a0e7b6741260de741fee8e76d375211a",
      "supabase/tests/upgrades/003-exact-money/expected-transformations.json":
        "7685e1bb8160219dae2c4745dd99adc5aa5fe05afca1f49f92fab08d5b7d4fd6",
    };
    for (const [path, digest] of Object.entries(accepted)) {
      expect(createHash("sha256").update(readSource(path)).digest("hex")).toBe(
        digest,
      );
    }
  });

  it("makes every Phase 4 SQL and browser contract a permanent blocking member", () => {
    const makefile = readSource("makefile");
    for (const path of phase4SqlTests) expect(makefile, path).toContain(path);
    for (const path of phase4FastTests) expect(makefile, path).toContain(path);
    expect(makefile).toContain("tests/release/migration-upgrade.test.ts");
    expect(makefile).toContain("tests/release/replay-concurrency.test.ts");
    expect(makefile).toMatch(
      /financial-gate:[\s\S]*test-financial-migration-clean[\s\S]*test-financial-migration-upgrade[\s\S]*test-financial-database-contracts[\s\S]*test-financial-functions[\s\S]*test-financial-replay-concurrency[\s\S]*test-release-security/,
    );
  });

  it("classifies every Phase 4 implementation, test, and receipt path as financial", () => {
    const configuration = readJson(".github/release/financial-paths.json") as {
      financial_paths: string[];
    };
    const expressions = configuration.financial_paths.map(globExpression);
    const ownedPaths = [
      ...phase4Migrations.map((name) => `supabase/migrations/${name}`),
      ...phase4SqlTests,
      ...phase4FastTests,
      "src/components/atomic-crm/billing-accounts/BillingAgreementForm.tsx",
      "src/components/atomic-crm/billing-accounts/BillingAgreementPanel.tsx",
      "src/components/atomic-crm/billing-accounts/BillingRevenueRevisionForm.tsx",
      "src/components/atomic-crm/billing-accounts/BillingCalculationPreview.tsx",
      "src/components/atomic-crm/billing-accounts/BillingMonthlyClosePanel.tsx",
      "src/components/atomic-crm/providers/supabase/billingCloseProvider.ts",
      "src/components/atomic-crm/providers/fakerest/billingCloseProvider.ts",
      "qa/billing-accounts.surface.source.json",
      "qa/billing-accounts.surface.preview.json",
      "qa/billing-accounts.surface.production.json",
    ];
    for (const path of ownedPaths) {
      expect(
        expressions.some((expression) => expression.test(path)),
        path,
      ).toBe(true);
    }
  });

  it("pins closed authority methods, immutable facts, and explicit decision inputs", () => {
    const migrations = phase4Migrations
      .map((name) => readSource(`supabase/migrations/${name}`))
      .join("\n");
    const publicMethods = [
      "save_billing_agreement_draft",
      "submit_billing_agreement_version",
      "activate_billing_agreement_version",
      "pause_billing_agreement_version",
      "terminate_billing_agreement_version",
      "read_billing_agreements",
      "ensure_billing_revenue_period",
      "submit_billing_revenue_revision",
      "review_billing_revenue_revision",
      "close_billing_revenue_period",
      "preview_billing_calculation",
      "create_billing_calculation",
      "approve_billing_calculation",
      "read_billing_calculation_lineage",
      "create_billing_adjustment_calculation",
      "read_billing_revenue_periods",
      "read_billing_calculations",
    ];
    for (const method of publicMethods) {
      expect(migrations, method).toMatch(
        new RegExp(`CREATE (?:OR REPLACE )?FUNCTION public\\.${method}\\(`),
      );
    }
    expect(migrations).toContain("SECURITY DEFINER\nSET search_path = ''");
    expect(migrations).toContain("request_fingerprint");
    expect(migrations).toContain("evidence_fingerprint");
    expect(migrations).toContain("close_policy_version");
    expect(migrations).toContain("explanation_version");
    expect(migrations).toContain("decision_reason");
    expect(migrations).toContain("billing_agreement_version_protect");
    expect(migrations).toContain("billing_revenue_row_immutable");
    expect(migrations).toContain("billing_calculation_fact_immutable");
    expect(migrations).toContain("billing_adjustment_calculation_freeze");
    expect(migrations).not.toMatch(
      /GRANT (?:INSERT|UPDATE|DELETE).* TO authenticated/i,
    );
  });

  it("keeps calculation authority exact and rejects later-phase UI scope", () => {
    const providers = [
      readSource("src/components/atomic-crm/providers/types.ts"),
      readSource(
        "src/components/atomic-crm/providers/supabase/billingCloseProvider.ts",
      ),
    ].join("\n");
    const ui = [
      readSource(
        "src/components/atomic-crm/billing-accounts/BillingAgreementPanel.tsx",
      ),
      readSource(
        "src/components/atomic-crm/billing-accounts/BillingMonthlyClosePanel.tsx",
      ),
      readSource(
        "src/components/atomic-crm/billing-accounts/BillingCalculationPreview.tsx",
      ),
    ].join("\n");

    expect(providers).toContain("billingCloseProviderMethodKeys");
    expect(providers).not.toMatch(
      /\.from\(["']billing_(?:agreements|revenue|calculations)/,
    );
    expect(ui).not.toMatch(
      /issue invoice|capture payment|customer portal|global close workspace/i,
    );
    expect(ui).not.toMatch(/parseFloat|parseInt|Number\s*\(/);
  });

  it("binds schema push to a disposable loopback target and registry 004", () => {
    const verifier = readSource("scripts/release/verify-migration-chain.mjs");
    expect(verifier).toContain(
      '["db", "push", "--db-url", target.databaseUrl, "--include-all"]',
    );
    expect(verifier).toContain('category.startsWith("agreement_close_")');
    expect(verifier).toContain('registry_id: "004-agreement-close"');
    expect(verifier).toContain("phase4_fingerprints");
    expect(verifier).toContain("schemaPushProjectPattern");
    expect(verifier).toContain("loopbackHosts");
    expect(verifier).not.toMatch(/supabase["',\s]+link/);
  });

  it("keeps source, preview, and production as independent Phase 4 surface stages", () => {
    const contracts = [
      readJson("qa/billing-accounts.surface.source.json"),
      readJson("qa/billing-accounts.surface.preview.json"),
      readJson("qa/billing-accounts.surface.production.json"),
    ];
    expect((contracts[0].viewports as unknown[]).length).toBe(2);
    expect((contracts[1].viewports as unknown[]).length).toBe(5);
    expect((contracts[2].viewports as unknown[]).length).toBe(5);
    for (const contract of contracts) {
      expect(contract.freshness_markers).toEqual([
        "phase-04-agreement-close-v1",
      ]);
      expect(contract.readiness_selector).toBe(
        '[data-phase4-surface-version="phase-04-agreement-close-v1"]',
      );
      expect(contract.min_touch_target_css_px).toBe(44);
      expect(JSON.stringify(contract.routes)).toContain(
        "/billing_accounts/31000000-0000-0000-0000-000000000200/show",
      );
      expect(JSON.stringify(contract.critical_targets)).toContain(
        "data-critical-phase4-agreement-action",
      );
      expect(JSON.stringify(contract.critical_targets)).toContain(
        "data-critical-phase4-revenue-action",
      );
    }
    expect(contracts[0].expected_serving_origin).toBe("http://127.0.0.1:4179");
    expect(contracts[1].expected_serving_origin).not.toBe(
      contracts[2].expected_serving_origin,
    );
  });

  it("records the exact committed implementation head in the source receipt", () => {
    const runner = readSource("scripts/release/run-billing-source-surface.mjs");
    expect(runner).toContain('runBuffered("git", ["rev-parse", "HEAD"])');
    expect(runner).toContain("implementation_head_marker");
    expect(runner).toContain("committed-except-runtime-config");
    expect(runner).toContain("artifacts/surface/phase-04-source.json");
    expect(runner).toContain("artifacts/surface/phase-04-source-screenshots");
    expect(runner).toContain("surface_gate.py");
    expect(runner).not.toMatch(/execSync|execFileSync|shell:\s*true/);
  });
});
