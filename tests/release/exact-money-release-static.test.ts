import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
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
    "supabase/migrations/20260902000001_exact_financial_primitives.sql",
    "supabase/migrations/20260902000002_exact_billing_expand.sql",
    "supabase/tests/database/35_billing_automation.sql",
    "supabase/tests/database/40_billing_evidence.sql",
    "supabase/tests/database/65_exact_billing_conversion.sql",
    "supabase/tests/support/billing-security-fixtures.sql",
    "tests/release/replay-concurrency.test.ts",
    "tests/release/billing-evidence.test.ts",
    "src/components/atomic-crm/types.ts",
    "src/components/atomic-crm/providers/types.ts",
    "src/components/atomic-crm/providers/supabase/dataProvider.ts",
    "tests/release/exact-money-boundaries.test.ts",
    "tests/release/billing-tenancy.test.ts",
    "supabase/migrations/20260903000001_exact_invoice_save_error_contract.sql",
    "src/components/atomic-crm/providers/fakerest/dataProvider.ts",
    "src/components/atomic-crm/providers/fakerest/dataGenerator/billingAccounts.ts",
    "src/components/atomic-crm/providers/fakerest/dataGenerator/types.ts",
    "src/components/atomic-crm/financial/exactProviderContract.test.ts",
    "src/components/atomic-crm/invoices/invoiceCalculations.ts",
    "src/components/atomic-crm/invoices/invoiceCalculations.test.ts",
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
    expect(sqlTests).toContain(
      "supabase/tests/database/65_exact_billing_conversion.sql",
    );
    expect(financialTargets).toMatch(
      /test-financial-database-sql:[\s\S]*?node scripts\/release\/run-supabase-lane\.mjs run --lane database-contracts -- supabase test db \$\(FINANCIAL_DATABASE_SQL_TESTS\) --local/,
    );
  });

  it("protects every Wave 4 exact billing caller and authority boundary", () => {
    const makefile = readSource("makefile");
    const migration = readSource(
      "supabase/migrations/20260902000002_exact_billing_expand.sql",
    );
    const runner = readSource("scripts/release/fingerprint-upgrade.mjs");
    const acceptedEvidenceMigration = readSource(
      "supabase/migrations/20260901000004_billing_evidence_security.sql",
    );

    for (const path of [
      "supabase/tests/database/35_billing_automation.sql",
      "supabase/tests/database/40_billing_evidence.sql",
      "supabase/tests/database/65_exact_billing_conversion.sql",
    ]) {
      expect(makefile, path).toContain(path);
    }
    expect(makefile).toContain("tests/release/billing-evidence.test.ts");
    expect(makefile).toContain("tests/release/replay-concurrency.test.ts");
    expect(migration).toContain(
      "CREATE FUNCTION public.read_billing_invoices_exact(p_request jsonb)",
    );
    expect(migration).toContain(
      "CREATE FUNCTION public.read_billing_invoices_legacy_compat(p_request jsonb)",
    );
    expect(migration).toContain(
      "CREATE FUNCTION public.save_billing_invoice_exact(p_request jsonb)",
    );
    expect(migration).toContain("SECURITY DEFINER\nSET search_path = ''");
    expect(migration).toContain(
      "REVOKE ALL ON TABLE public.invoices FROM anon, authenticated",
    );
    expect(migration).toContain(
      "REVOKE ALL ON SEQUENCE public.invoices_id_seq FROM anon, authenticated",
    );
    expect(migration).toContain(
      "DROP FUNCTION private.billing_consume_automation_grant(\n  uuid, uuid, text, text, text, text, numeric, text\n)",
    );
    expect(migration).not.toMatch(/CREATE\s+(?:OR\s+REPLACE\s+)?VIEW/i);
    expect(migration).not.toMatch(/\bEXECUTE\s+(?:format|\()/i);
    expect(runner).toContain(
      '"supabase/migrations/20260901000004_billing_evidence_security.sql"',
    );
    expect(
      createHash("sha256").update(acceptedEvidenceMigration).digest("hex"),
    ).toBe("740ac8cc9c5955c3e64c837082402f0d7f94e5fe2f145d88489d22b010dc48c0");
  });

  it("routes the authoritative invoice provider through validated exact RPCs", () => {
    const sharedTypes = readSource("src/components/atomic-crm/types.ts");
    const providerTypes = readSource(
      "src/components/atomic-crm/providers/types.ts",
    );
    const provider = readSource(
      "src/components/atomic-crm/providers/supabase/dataProvider.ts",
    );

    expect(sharedTypes).toContain("export type ExactBillingInvoice");
    expect(sharedTypes).toContain("amount: UsdMoney");
    expect(sharedTypes).toContain("tax_rate: OrdinaryPercentageRate");
    expect(providerTypes).toContain("billingInvoiceProviderMethodKeys");
    for (const method of [
      "listExactBillingInvoices",
      "getExactBillingInvoice",
      "saveExactBillingInvoice",
    ]) {
      expect(providerTypes, method).toContain(method);
      expect(provider, method).toContain(method);
    }
    expect(provider).toContain('supabase.rpc("read_billing_invoices_exact"');
    expect(provider).toContain('supabase.rpc("save_billing_invoice_exact"');
    expect(provider).toContain("parseExactBillingInvoiceResponse");
    expect(provider).not.toMatch(/\.from\(["']invoices["']\)/);
    expect(provider).not.toContain("execute_billing_automation_command");
  });

  it("protects the Wave 5 live invoice boundary in the permanent HTTP lane", () => {
    const makefile = readSource("makefile");
    const financialTargets = makefile.slice(0, makefile.indexOf("\ninstall:"));
    const httpTests = financialTargets.match(
      /FINANCIAL_DATABASE_HTTP_TESTS := \\\n([\s\S]*?)\n\nFINANCIAL_FUNCTION_TESTS/,
    )?.[1];
    const provider = readSource(
      "src/components/atomic-crm/providers/supabase/dataProvider.ts",
    );
    const exactMigration = readSource(
      "supabase/migrations/20260902000002_exact_billing_expand.sql",
    );
    const errorContractMigration = readSource(
      "supabase/migrations/20260903000001_exact_invoice_save_error_contract.sql",
    );

    expect(httpTests).toBeDefined();
    expect(httpTests).toContain("tests/release/billing-tenancy.test.ts");
    expect(httpTests).toContain("tests/release/exact-money-boundaries.test.ts");
    expect(financialTargets).toMatch(
      /test-financial-database-http:[\s\S]*?run-supabase-lane\.mjs run --lane database-contracts -- npm test -- --run \$\(FINANCIAL_DATABASE_HTTP_TESTS\)/,
    );
    expect(provider).not.toMatch(/\.from\(["']invoices["']\)/);
    expect(`${exactMigration}\n${errorContractMigration}`).not.toMatch(
      /CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+[^;]*invoice/i,
    );
    expect(exactMigration).toContain(
      "REVOKE ALL ON TABLE public.invoices FROM anon, authenticated",
    );
    expect(exactMigration).toContain(
      "REVOKE ALL ON SEQUENCE public.invoices_id_seq FROM anon, authenticated",
    );
    expect(`${exactMigration}\n${errorContractMigration}`).not.toMatch(
      /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|ALL)[^;]*public\.invoices[^;]*authenticated/i,
    );
    expect(`${exactMigration}\n${errorContractMigration}`).not.toMatch(
      /GRANT\s+(?:USAGE|ALL)[^;]*public\.invoices_id_seq[^;]*authenticated/i,
    );
    expect(errorContractMigration).toContain(
      "MESSAGE = 'INVOICE_SAVE_INVALID_REQUEST'",
    );
  });

  it("protects Wave 6 provider parity and exact invoice preview", () => {
    const makefile = readSource("makefile");
    const financialTargets = makefile.slice(0, makefile.indexOf("\ninstall:"));
    const httpTests = financialTargets.match(
      /FINANCIAL_DATABASE_HTTP_TESTS := \\\n([\s\S]*?)\n\nFINANCIAL_FUNCTION_TESTS/,
    )?.[1];
    const fastTests = financialTargets.match(
      /FINANCIAL_FAST_TESTS := \\\n([\s\S]*?)\n\n\.PHONY:/,
    )?.[1];
    const fakeProvider = readSource(
      "src/components/atomic-crm/providers/fakerest/dataProvider.ts",
    );
    const generator = readSource(
      "src/components/atomic-crm/providers/fakerest/dataGenerator/billingAccounts.ts",
    );
    const preview = readSource(
      "src/components/atomic-crm/invoices/invoiceCalculations.ts",
    );

    expect(httpTests).toContain(
      "src/components/atomic-crm/financial/exactProviderContract.test.ts",
    );
    expect(fastTests).toContain(
      "src/components/atomic-crm/invoices/invoiceCalculations.test.ts",
    );
    expect(fakeProvider).toContain("createExactFakeInvoiceProvider");
    expect(fakeProvider).not.toMatch(
      /(?:quantity|rate|amount)\s*:\s*(?:Number\(|parseFloat\(|[0-9]+(?:\.[0-9]+)?(?:,|\s*}))/,
    );
    expect(generator).not.toMatch(
      /amount_minor\s*:\s*-?[0-9]+|(?:numerator|denominator)\s*:\s*-?[0-9]+/,
    );
    expect(preview).toContain("multiplyUsdMoneyByRate");
    expect(preview).toContain("multiplyUsdMoneyByExactRatio");
    expect(preview).not.toMatch(
      /Math\.round|\.toFixed\(|parseFloat\(|Number\([^)]*amount_minor|887\.5|:\s*number/,
    );
    expect(financialTargets).toMatch(
      /test-financial-database-http:[\s\S]*?\$\(FINANCIAL_DATABASE_HTTP_TESTS\)/,
    );
    expect(financialTargets).toMatch(
      /test-financial-fast:[\s\S]*?\$\(FINANCIAL_FAST_TESTS\)/,
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
      "supabase/tests/upgrades/003-exact-money/expected-transformations.json",
      "supabase/migrations/20260901000002_billing_invoice_boundary.sql",
      "supabase/migrations/20260901000003_billing_automation_grants.sql",
      "supabase/migrations/20260901000004_billing_evidence_security.sql",
    ];
    for (const path of immutableInputs) {
      expect(runner, path).toContain(path);
    }
    for (const path of [
      "supabase/migrations/20260902000001_exact_financial_primitives.sql",
      "supabase/migrations/20260902000002_exact_billing_expand.sql",
      "supabase/migrations/20260903000001_exact_invoice_save_error_contract.sql",
    ]) {
      expect(runner, path).toContain(path);
    }
    const registry = JSON.parse(
      readSource(
        "supabase/tests/upgrades/003-exact-money/expected-transformations.json",
      ),
    ) as {
      migrations: string[];
      transformations: Record<string, { migration: string }>;
    };
    expect(registry.migrations).toEqual([
      "20260902000001",
      "20260902000002",
      "20260903000001",
    ]);
    expect(registry.transformations.exact_invoice_rpcs.migration).toBe(
      "20260903000001",
    );
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

  it("retains same-plan coupling evidence for every introducing wave", () => {
    const summaryEvidence: Array<[string, string[]]> = [
      [
        "03-01-SUMMARY.md",
        [
          "src/components/atomic-crm/financial/exactMoney.test.ts",
          "tests/release/exact-money-release-static.test.ts",
          "FINANCIAL_FAST_TESTS",
        ],
      ],
      [
        "03-02-SUMMARY.md",
        [
          "supabase/tests/database/60_exact_financial_primitives.sql",
          "makefile",
          "protected database SQL",
        ],
      ],
      [
        "03-03-SUMMARY.md",
        [
          "scripts/release/fingerprint-upgrade.mjs",
          "tests/release/migration-upgrade.test.ts",
          "protected migration-upgrade target",
        ],
      ],
      [
        "03-04-SUMMARY.md",
        [
          "supabase/tests/database/65_exact_billing_conversion.sql",
          "tests/release/billing-evidence.test.ts",
          "tests/release/replay-concurrency.test.ts",
        ],
      ],
      [
        "03-05-SUMMARY.md",
        [
          "tests/release/exact-money-boundaries.test.ts",
          "tests/release/billing-tenancy.test.ts",
          "permanent database HTTP target",
        ],
      ],
      [
        "03-06-SUMMARY.md",
        [
          "src/components/atomic-crm/financial/exactProviderContract.test.ts",
          "src/components/atomic-crm/invoices/invoiceCalculations.test.ts",
          ".github/release/financial-paths.json",
        ],
      ],
    ];

    for (const [summary, markers] of summaryEvidence) {
      const source = readSource(
        `.planning/phases/03-exact-money-and-rounding-contract/${summary}`,
      );
      for (const marker of markers) {
        expect(source, `${summary}: ${marker}`).toContain(marker);
      }
    }
  });

  it("closes caller-bound reads and exact evidence against source regressions", () => {
    const migration = readSource(
      "supabase/migrations/20260902000002_exact_billing_expand.sql",
    );
    const validator = migration.slice(
      migration.indexOf(
        "CREATE FUNCTION private.billing_validate_invoice_read_request",
      ),
      migration.indexOf("CREATE FUNCTION private.billing_invoice_exact_json"),
    );
    const exactRead = migration.slice(
      migration.indexOf(
        "CREATE FUNCTION public.read_billing_invoices_exact(p_request jsonb)",
      ),
      migration.indexOf(
        "CREATE FUNCTION public.read_billing_invoices_legacy_compat",
      ),
    );
    const legacyRead = migration.slice(
      migration.indexOf(
        "CREATE FUNCTION public.read_billing_invoices_legacy_compat",
      ),
      migration.indexOf(
        "CREATE FUNCTION private.billing_parse_optional_relation_id",
      ),
    );
    const evidenceHelper = migration.slice(
      migration.indexOf(
        "CREATE FUNCTION private.billing_finalize_evidence_inspection",
      ),
      migration.indexOf(
        "CREATE FUNCTION public.finalize_billing_evidence_inspection",
      ),
    );

    expect(validator).toContain("SECURITY DEFINER\nSET search_path = ''");
    expect(validator).toContain("page_value > 1000000");
    expect(validator).toContain("per_page_value > 100");
    expect(validator).toContain(
      "sort_value NOT IN ('id', 'created_at', 'updated_at', 'invoice_number', 'issue_date', 'due_date', 'status')",
    );
    for (const readRpc of [exactRead, legacyRead]) {
      expect(readRpc).toContain("SECURITY DEFINER\nSET search_path = ''");
      expect(readRpc).toContain("FROM public.invoices AS invoice");
      expect(readRpc).toContain("private.billing_has_capability(");
      expect(readRpc).toContain("LIMIT per_page_value");
      expect(readRpc).not.toMatch(/\bEXECUTE\b|\bformat\s*\(/i);
    }
    expect(migration).toContain(
      "ALTER FUNCTION public.read_billing_invoices_exact(jsonb) OWNER TO postgres",
    );
    expect(migration).toContain(
      "ALTER FUNCTION public.read_billing_invoices_legacy_compat(jsonb) OWNER TO postgres",
    );
    expect(evidenceHelper).toContain(
      "pg_catalog.jsonb_build_object('amount_minor', '0', 'currency', 'USD')",
    );
    expect(evidenceHelper).toContain("effect_fingerprint");
    expect(migration).toContain(
      "DROP FUNCTION private.billing_consume_automation_grant(\n  uuid, uuid, text, text, text, text, numeric, text\n)",
    );
    expect(migration).not.toMatch(
      /CREATE FUNCTION private\.billing_consume_automation_grant\([\s\S]*?p_amount numeric/,
    );
  });

  it("keeps the six workflows isolated, pinned, and free of production mutation", () => {
    const financial = readSource(
      ".github/workflows/financial-release-gate.yml",
    );
    const build = readSource(".github/workflows/release-build.yml");
    const promote = readSource(".github/workflows/release-promote.yml");
    const jobBlocks = financial
      .split(/^ {2}(?=[a-z][a-z-]+:)/m)
      .filter((block) => /name:\s*financial \/ [a-z-]+\s*$/m.test(block));

    expect(financial).toContain("permissions:\n  contents: read");
    expect(financial).not.toMatch(/permissions:[\s\S]*?contents:\s*write/);
    for (const job of jobBlocks) {
      expect(job).toContain("- run: npm ci");
      expect(job).toMatch(/timeout-minutes: (?:15|20)/);
      expect(job).not.toMatch(/continue-on-error|retry/i);
    }
    for (const job of jobBlocks.filter(
      (block) => !block.includes("financial / release-security"),
    )) {
      expect(job).toContain("version: 2.116.0");
      expect(job).toContain("if: ${{ always() }}");
      expect(job).toContain("supabase stop --no-backup");
    }

    for (const workflow of [financial, build, promote]) {
      const actionRefs = [
        ...workflow.matchAll(/uses:\s*[^@\s]+@([^\s]+)/g),
      ].map((match) => match[1]);
      expect(actionRefs.length).toBeGreaterThan(0);
      expect(
        actionRefs.every((reference) => /^[0-9a-f]{40}$/.test(reference)),
      ).toBe(true);
    }
    expect(`${financial}\n${build}`).not.toMatch(
      /supabase\s+(?:link|db push|functions deploy)/,
    );
    expect(build.match(/run: npm run build/g)).toHaveLength(1);
    expect(promote).toContain("name: production-release");
    expect(promote).toContain("Fetch and verify private predecessor chain");
    expect(promote).toContain(
      "Reverify predecessor immediately before promotion",
    );
    expect(promote).toContain("if: ${{ inputs.stage == 'schema' }}");
    expect(promote).toContain(
      'supabase link --project-ref "$SUPABASE_PROJECT_ID"',
    );
    expect(promote).toContain("supabase db push --dry-run");
    expect(promote).toContain("supabase db push");
    expect(promote).toContain("supabase migration list --linked");
    expect(promote).toContain("Publish and read back linked private receipt");
  });
});
