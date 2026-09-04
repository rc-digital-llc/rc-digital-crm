import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readSource(path: string): string {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

function globExpression(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `^${escaped.replaceAll("**", "::DOUBLE_STAR::").replaceAll("*", "[^/]*").replaceAll("::DOUBLE_STAR::", ".*")}$`,
  );
}

describe("Phase 3 exact-money release coupling", () => {
  const exactPaths = [
    "src/components/atomic-crm/financial/exactFinancialFixtures.ts",
    "src/components/atomic-crm/financial/exactMoney.ts",
    "src/components/atomic-crm/financial/exactMoney.test.ts",
    "tests/release/exact-money-release-static.test.ts",
    "scripts/release/fingerprint-upgrade.mjs",
    "tests/release/migration-upgrade.test.ts",
    "makefile",
    "supabase/tests/upgrades/003-exact-money/expected-transformations.json",
  ];

  it("classifies every protected exact-money source and test as financial", () => {
    const configuration = JSON.parse(
      readSource(".github/release/financial-paths.json"),
    ) as { financial_paths: string[] };
    const expressions = configuration.financial_paths.map(globExpression);

    expect(configuration.financial_paths).toContain(
      "src/components/atomic-crm/financial/**",
    );
    for (const path of exactPaths) {
      expect(
        expressions.some((expression) => expression.test(path)),
        path,
      ).toBe(true);
    }
  });

  it("makes both exact-money tests explicit protected fast-test members", () => {
    const makefile = readSource("makefile");
    const financialTargets = makefile.slice(0, makefile.indexOf("\ninstall:"));
    const fastTests = financialTargets.match(
      /FINANCIAL_FAST_TESTS := \\\n([\s\S]*?)\n\n\.PHONY:/,
    )?.[1];

    expect(fastTests).toBeDefined();
    expect(fastTests).toContain(
      "src/components/atomic-crm/financial/exactMoney.test.ts",
    );
    expect(fastTests).toContain(
      "tests/release/exact-money-release-static.test.ts",
    );
    expect(financialTargets).toMatch(
      /test-financial-fast:[\s\S]*?npm test -- --run \$\(FINANCIAL_FAST_TESTS\)/,
    );
    expect(financialTargets).toMatch(
      /test-release-security:[\s\S]*?\$\(MAKE\) test-financial-fast/,
    );
  });

  it("makes the exact financial pgTAP contract an explicit protected SQL member", () => {
    const makefile = readSource("makefile");
    const financialTargets = makefile.slice(0, makefile.indexOf("\ninstall:"));
    const sqlTests = financialTargets.match(
      /FINANCIAL_DATABASE_SQL_TESTS := \\\n([\s\S]*?)\n\nFINANCIAL_DATABASE_HTTP_TESTS/,
    )?.[1];

    expect(sqlTests).toBeDefined();
    expect(sqlTests).toContain(
      "supabase/tests/database/60_exact_financial_primitives.sql",
    );
    expect(financialTargets).toMatch(
      /test-financial-database-sql:[\s\S]*?node scripts\/release\/run-supabase-lane\.mjs run --lane database-contracts -- supabase test db \$\(FINANCIAL_DATABASE_SQL_TESTS\) --local/,
    );
  });

  it("protects the closed exact upgrade verifier and immutable history pins", () => {
    const makefile = readSource("makefile");
    const financialTargets = makefile.slice(0, makefile.indexOf("\ninstall:"));
    const runner = readSource("scripts/release/fingerprint-upgrade.mjs");
    const upgradeTarget = financialTargets.match(
      /test-financial-migration-upgrade:[\s\S]*?(?=\n[a-z][a-z-]+:)/,
    )?.[0];

    expect(upgradeTarget).toBeDefined();
    expect(upgradeTarget).toMatch(
      /run-supabase-lane\.mjs run --lane migration-upgrade -- node scripts\/release\/fingerprint-upgrade\.mjs/,
    );
    expect(upgradeTarget).toContain(
      "npm test -- --run tests/release/migration-upgrade.test.ts",
    );
    expect(upgradeTarget).not.toMatch(/\|\|\s*true|continue-on-error|--linked/);

    const immutableInputs = [
      "supabase/tests/baselines/001-pre-financial/manifest.json",
      "supabase/tests/upgrades/002-billing-tenancy/expected-transformations.json",
      "supabase/migrations/20260901000002_billing_invoice_boundary.sql",
      "supabase/migrations/20260901000003_billing_automation_grants.sql",
      "supabase/migrations/20260901000004_billing_evidence_security.sql",
    ];
    for (const path of immutableInputs) {
      expect(runner, path).toContain(path);
    }
    expect(runner).toContain('registry.registry_id !== "003-exact-money"');
    expect(runner).toContain("PHASE3_REQUIRED_TRANSFORMATIONS");
  });

  it("preserves the inherited six unconditional merge-group identities", () => {
    const workflow = readSource(".github/workflows/financial-release-gate.yml");
    const requiredNames = [
      "migration-clean",
      "migration-upgrade",
      "database-contracts",
      "edge-provider-contracts",
      "replay-concurrency",
      "release-security",
    ];
    const jobBlocks = workflow.split(/^ {2}(?=[a-z][a-z-]+:)/m);
    const jobs = jobBlocks.filter((block) =>
      /name:\s*financial \/ [a-z-]+\s*$/m.test(block),
    );

    expect(jobs).toHaveLength(6);
    for (const name of requiredNames) {
      const job = jobs.find((block) =>
        block.includes(`name: financial / ${name}`),
      );
      expect(job, name).toBeDefined();
      expect(job).toContain("github.event_name == 'merge_group'");
      expect(job).not.toMatch(/continue-on-error|retry/i);
    }
  });
});
