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
  ];

  it("classifies every Wave 1 exact-money source and test as financial", () => {
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
