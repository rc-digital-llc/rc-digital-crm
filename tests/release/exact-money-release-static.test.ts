import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const readSource = (relativePath: string) =>
  fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");

const exactFinancialPattern = "src/components/atomic-crm/financial/**";
const exactFinancialPaths = [
  "src/components/atomic-crm/financial/exactMoney.ts",
  "src/components/atomic-crm/financial/exactMoney.test.ts",
  "src/components/atomic-crm/financial/exactFinancialFixtures.ts",
  "tests/release/exact-money-release-static.test.ts",
] as const;
const exactFastTests = [
  "src/components/atomic-crm/financial/exactMoney.test.ts",
  "tests/release/exact-money-release-static.test.ts",
] as const;
const exactFinancialDatabaseTest =
  "supabase/tests/database/60_exact_financial_primitives.sql";
const exactUpgradeTest = "tests/release/migration-upgrade.test.ts";
const exactUpgradePaths = [
  "scripts/release/fingerprint-upgrade.mjs",
  exactUpgradeTest,
  "makefile",
  "tests/release/exact-money-release-static.test.ts",
] as const;
const acceptedUpgradeArtifacts = [
  "supabase/tests/baselines/001-pre-financial/manifest.json",
  "supabase/tests/upgrades/002-billing-tenancy/expected-transformations.json",
  "supabase/migrations/20260901000002_billing_invoice_boundary.sql",
  "supabase/migrations/20260901000003_billing_automation_grants.sql",
  "supabase/migrations/20260901000004_billing_evidence_security.sql",
] as const;
const inheritedFinancialIdentities = [
  "migration-clean",
  "migration-upgrade",
  "database-contracts",
  "edge-provider-contracts",
  "replay-concurrency",
  "release-security",
] as const;
const waveFourPaths = [
  "supabase/migrations/20260902000002_exact_billing_expand.sql",
  "supabase/tests/database/65_exact_billing_conversion.sql",
  "supabase/tests/upgrades/003-exact-money/expected-transformations.json",
  "supabase/tests/database/35_billing_automation.sql",
  "supabase/tests/support/billing-security-fixtures.sql",
  "supabase/tests/database/40_billing_evidence.sql",
  "tests/release/replay-concurrency.test.ts",
  "tests/release/billing-evidence.test.ts",
  "makefile",
  "tests/release/exact-money-release-static.test.ts",
] as const;
const waveFourSqlTests = [
  "supabase/tests/database/35_billing_automation.sql",
  "supabase/tests/database/40_billing_evidence.sql",
  "supabase/tests/database/65_exact_billing_conversion.sql",
] as const;
const waveFivePaths = [
  "src/components/atomic-crm/types.ts",
  "src/components/atomic-crm/providers/types.ts",
  "src/components/atomic-crm/providers/supabase/dataProvider.ts",
  "tests/release/exact-money-boundaries.test.ts",
  "tests/release/billing-tenancy.test.ts",
  "makefile",
  ".github/release/financial-paths.json",
  "tests/release/exact-money-release-static.test.ts",
] as const;
const waveFiveHttpTests = [
  "tests/release/exact-money-boundaries.test.ts",
  "tests/release/billing-tenancy.test.ts",
] as const;
const waveSixPaths = [
  "src/components/atomic-crm/providers/fakerest/dataProvider.ts",
  "src/components/atomic-crm/providers/fakerest/dataGenerator/billingAccounts.ts",
  "src/components/atomic-crm/financial/exactProviderContract.test.ts",
  "src/components/atomic-crm/invoices/invoiceCalculations.ts",
  "src/components/atomic-crm/invoices/invoiceCalculations.test.ts",
  "makefile",
  ".github/release/financial-paths.json",
  "tests/release/exact-money-release-static.test.ts",
] as const;
const waveSixProviderTest =
  "src/components/atomic-crm/financial/exactProviderContract.test.ts";
const waveSixPreviewTest =
  "src/components/atomic-crm/invoices/invoiceCalculations.test.ts";
const phaseThreePlanSummaries = [
  {
    plan: "01",
    path: ".planning/phases/03-exact-money-and-rounding-contract/03-01-SUMMARY.md",
    ownedPaths: [
      "src/components/atomic-crm/financial/exactMoney.ts",
      "src/components/atomic-crm/financial/exactMoney.test.ts",
      "src/components/atomic-crm/financial/exactFinancialFixtures.ts",
    ],
  },
  {
    plan: "02",
    path: ".planning/phases/03-exact-money-and-rounding-contract/03-02-SUMMARY.md",
    ownedPaths: [
      "supabase/migrations/20260902000001_exact_financial_primitives.sql",
      "supabase/tests/database/60_exact_financial_primitives.sql",
    ],
  },
  {
    plan: "03",
    path: ".planning/phases/03-exact-money-and-rounding-contract/03-03-SUMMARY.md",
    ownedPaths: [
      "scripts/release/fingerprint-upgrade.mjs",
      "tests/release/migration-upgrade.test.ts",
    ],
  },
  {
    plan: "04",
    path: ".planning/phases/03-exact-money-and-rounding-contract/03-04-SUMMARY.md",
    ownedPaths: [
      "supabase/migrations/20260902000002_exact_billing_expand.sql",
      "supabase/tests/database/65_exact_billing_conversion.sql",
      "supabase/tests/upgrades/003-exact-money/expected-transformations.json",
      "supabase/tests/database/35_billing_automation.sql",
      "supabase/tests/database/40_billing_evidence.sql",
      "supabase/tests/support/billing-security-fixtures.sql",
      "scripts/release/fingerprint-upgrade.mjs",
      "tests/release/migration-upgrade.test.ts",
      "tests/release/replay-concurrency.test.ts",
      "tests/release/billing-evidence.test.ts",
    ],
  },
  {
    plan: "05",
    path: ".planning/phases/03-exact-money-and-rounding-contract/03-05-SUMMARY.md",
    ownedPaths: [
      "src/components/atomic-crm/types.ts",
      "src/components/atomic-crm/providers/types.ts",
      "src/components/atomic-crm/providers/supabase/dataProvider.ts",
      "tests/release/exact-money-boundaries.test.ts",
      "tests/release/billing-tenancy.test.ts",
    ],
  },
  {
    plan: "06",
    path: ".planning/phases/03-exact-money-and-rounding-contract/03-06-SUMMARY.md",
    ownedPaths: [
      "src/components/atomic-crm/providers/fakerest/dataProvider.ts",
      "src/components/atomic-crm/providers/fakerest/dataGenerator/billingAccounts.ts",
      "src/components/atomic-crm/financial/exactProviderContract.test.ts",
      "src/components/atomic-crm/invoices/invoiceCalculations.ts",
      "src/components/atomic-crm/invoices/invoiceCalculations.test.ts",
    ],
  },
] as const;
const acceptedUpgradeArtifactDigests = {
  "supabase/tests/baselines/001-pre-financial/manifest.json":
    "eb1f2e2cdee134e72f45664a11557dcecce66cec1011cfdfaf99bd5dfd100e93",
  "supabase/tests/upgrades/002-billing-tenancy/expected-transformations.json":
    "dea0df2f23c11c7292e01996fa32e9a0a0e7b6741260de741fee8e76d375211a",
  "supabase/migrations/20260901000002_billing_invoice_boundary.sql":
    "811947e5391aedbbbb452daee5a41302a35d610122845b909b7c53e21ff57817",
  "supabase/migrations/20260901000003_billing_automation_grants.sql":
    "d1c27c260561131037712aab783b90101a7949b41e0528052c9f764666cc92fd",
  "supabase/migrations/20260901000004_billing_evidence_security.sql":
    "740ac8cc9c5955c3e64c837082402f0d7f94e5fe2f145d88489d22b010dc48c0",
} as const;

type PhaseThreeFinalAuditSources = {
  patterns: string[];
  makefile: string;
  financialWorkflow: string;
  releaseBuild: string;
  releasePromote: string;
  workflowSources: Record<string, string>;
  summaries: Record<string, string>;
  sourceAudit: string;
  exactMoneySource: string;
  exactMoneyTest: string;
  primitiveMigration: string;
  primitiveSql: string;
  conversionSql: string;
  providerContract: string;
  providerTypes: string;
  previewTest: string;
  upgradeRunner: string;
  upgradeRunnerTest: string;
  exactMigration: string;
  automationSql: string;
  evidenceSql: string;
  replaySource: string;
  evidenceSource: string;
  providerSource: string;
  fakeRestSource: string;
  fakeRestGenerator: string;
  previewSource: string;
  boundarySource: string;
  tenancySource: string;
  laneRunner: string;
  acceptedArtifacts: Record<string, string>;
};

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

const extractFastTestBlock = (makefile: string) => {
  const match = makefile.match(
    /FINANCIAL_FAST_TESTS := \\\n([\s\S]*?)\n\n\.PHONY/,
  );
  return match?.[1] ?? "";
};

const extractDatabaseSqlTestBlock = (makefile: string) => {
  const match = makefile.match(
    /FINANCIAL_DATABASE_SQL_TESTS := \\\n([\s\S]*?)\n\nFINANCIAL_DATABASE_HTTP_TESTS/,
  );
  return match?.[1] ?? "";
};

const extractDatabaseHttpTestBlock = (makefile: string) => {
  const match = makefile.match(
    /FINANCIAL_DATABASE_HTTP_TESTS := \\\n([\s\S]*?)\n\nFINANCIAL_FUNCTION_TESTS/,
  );
  return match?.[1] ?? "";
};

const extractFunctionDefinition = (source: string, signature: string) => {
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION ${signature}`);
  if (start === -1) return "";
  const end = source.indexOf("\n$function$;", start);
  return end === -1 ? "" : source.slice(start, end + "\n$function$;".length);
};

const extractNamedFunctionDefinition = (source: string, name: string) => {
  const start = source.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
  if (start === -1) return "";
  const end = source.indexOf("\n$function$;", start);
  return end === -1 ? "" : source.slice(start, end + "\n$function$;".length);
};

const databaseCouplingErrors = (makefile: string) => {
  const errors: string[] = [];
  if (
    !extractDatabaseSqlTestBlock(makefile).includes(exactFinancialDatabaseTest)
  ) {
    errors.push(`database-sql-test:${exactFinancialDatabaseTest}`);
  }
  if (
    !/test-financial-database-sql:[^\n]*\n\tnode scripts\/release\/run-supabase-lane\.mjs run --lane database-contracts -- supabase test db \$\(FINANCIAL_DATABASE_SQL_TESTS\) --local/.test(
      makefile,
    )
  ) {
    errors.push("database-sql-runner");
  }
  return errors;
};

const waveFourCouplingErrors = (
  patterns: string[],
  makefile: string,
  exactMigration: string,
  automationSql: string,
  evidenceSql: string,
  replaySource: string,
  evidenceSource: string,
  acceptedEvidenceMigration: string,
) => {
  const errors: string[] = [];
  const expressions = patterns.map(globExpression);
  const databaseBlock = extractDatabaseSqlTestBlock(makefile);
  const functionBlock =
    makefile.match(
      /FINANCIAL_FUNCTION_TESTS := \\\n([\s\S]*?)\n\nFINANCIAL_FAST_TESTS/,
    )?.[1] ?? "";
  const readDefinitions = [
    "public.read_billing_invoices_exact(jsonb)",
    "public.read_billing_invoices_legacy_compat(jsonb)",
  ].map((signature) => extractFunctionDefinition(exactMigration, signature));

  for (const filename of waveFourPaths) {
    if (!expressions.some((expression) => expression.test(filename))) {
      errors.push(`wave4-unclassified:${filename}`);
    }
  }
  for (const filename of waveFourSqlTests) {
    if (!databaseBlock.includes(filename)) {
      errors.push(`wave4-database-test:${filename}`);
    }
  }
  if (!functionBlock.includes("tests/release/billing-evidence.test.ts")) {
    errors.push("wave4-evidence-function-test");
  }
  if (
    !/test-financial-concurrency:[\s\S]*?tests\/release\/replay-concurrency\.test\.ts/.test(
      makefile,
    )
  ) {
    errors.push("wave4-replay-test");
  }
  if (
    !exactMigration.includes(
      "CREATE OR REPLACE FUNCTION public.read_billing_invoices_exact(jsonb)",
    ) ||
    !exactMigration.includes(
      "CREATE OR REPLACE FUNCTION public.read_billing_invoices_legacy_compat(jsonb)",
    ) ||
    !exactMigration.includes(
      "CREATE OR REPLACE FUNCTION public.save_billing_invoice_exact(jsonb)",
    ) ||
    !exactMigration.includes("'invoice.read'") ||
    !exactMigration.includes("'invoice.update'") ||
    readDefinitions.some(
      (definition) =>
        !definition.includes("SECURITY DEFINER") ||
        !definition.includes("SET search_path = ''") ||
        !definition.includes("private.billing_has_capability(") ||
        /\bEXECUTE\s+/i.test(definition),
    ) ||
    !exactMigration.includes(
      "REVOKE ALL ON TABLE public.invoices FROM anon, authenticated;",
    ) ||
    !exactMigration.includes(
      "REVOKE ALL ON SEQUENCE public.invoices_id_seq FROM anon, authenticated;",
    ) ||
    !exactMigration.includes(
      "REVOKE ALL ON FUNCTION public.read_billing_invoices_exact(jsonb) FROM PUBLIC, anon, authenticated, service_role;",
    ) ||
    !exactMigration.includes(
      "GRANT EXECUTE ON FUNCTION public.read_billing_invoices_exact(jsonb) TO authenticated, service_role;",
    ) ||
    !exactMigration.includes(
      "GRANT EXECUTE ON FUNCTION public.read_billing_invoices_legacy_compat(jsonb) TO authenticated, service_role;",
    ) ||
    !exactMigration.includes(
      '\'{"amount_minor":"0","currency":"USD"}\'::jsonb',
    ) ||
    /CREATE(?:\s+OR\s+REPLACE)?\s+VIEW\s+[^;]*invoice/i.test(exactMigration) ||
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+private\.billing_consume_automation_grant\([\s\S]{0,500}?p_amount\s+numeric/i.test(
      exactMigration,
    )
  ) {
    errors.push("wave4-exact-rpc-hardening");
  }
  if (
    !automationSql.includes(
      "private.billing_consume_automation_grant(uuid,uuid,text,text,text,text,jsonb,text,jsonb)",
    ) ||
    !evidenceSql.includes("evidence_conflict_snapshot")
  ) {
    errors.push("wave4-sql-exact-replay-proof");
  }
  if (
    !/'record\.concurrent',\s*'\{"amount_minor":"\$\{amountMinor\}","currency":"USD"\}'::jsonb,\s*'\$\{idempotencyKey\}'/.test(
      replaySource,
    ) ||
    /'record\.concurrent',\s*1\.00/.test(replaySource)
  ) {
    errors.push("wave4-live-replay-exact-money");
  }
  if (
    !evidenceSource.includes("IDEMPOTENCY_KEY_CONFLICT") ||
    !evidenceSource.includes("evidenceConflictSnapshot")
  ) {
    errors.push("wave4-live-evidence-conflict-proof");
  }
  if (
    createHash("sha256").update(acceptedEvidenceMigration).digest("hex") !==
    "740ac8cc9c5955c3e64c837082402f0d7f94e5fe2f145d88489d22b010dc48c0"
  ) {
    errors.push("wave4-accepted-evidence-migration-mutated");
  }
  return errors;
};

const waveFiveCouplingErrors = (
  patterns: string[],
  makefile: string,
  exactMigration: string,
  providerSource: string,
  boundarySource: string,
  tenancySource: string,
) => {
  const errors: string[] = [];
  const expressions = patterns.map(globExpression);
  const httpBlock = extractDatabaseHttpTestBlock(makefile);
  const httpTarget =
    makefile.match(
      /test-financial-database-http:[^\n]*\n((?:\t[^\n]*\n)+)/,
    )?.[1] ?? "";
  const exactProviderBoundary = providerSource.slice(
    providerSource.indexOf("const invoiceReadSortFields"),
    providerSource.indexOf("const baseDataProvider"),
  );
  const readDefinitions = [
    "public.read_billing_invoices_exact(jsonb)",
    "public.read_billing_invoices_legacy_compat(jsonb)",
  ].map((signature) => extractFunctionDefinition(exactMigration, signature));

  for (const filename of waveFivePaths) {
    if (!expressions.some((expression) => expression.test(filename))) {
      errors.push(`wave5-unclassified:${filename}`);
    }
  }
  for (const filename of waveFiveHttpTests) {
    if (!httpBlock.includes(filename)) {
      errors.push(`wave5-http-test:${filename}`);
    }
  }
  if (
    httpTarget.trim() !==
    "node scripts/release/run-supabase-lane.mjs run --lane database-contracts -- npm test -- --run $(FINANCIAL_DATABASE_HTTP_TESTS)"
  ) {
    errors.push("wave5-http-isolated-target");
  }
  if (/\|\|\s*true|continue-on-error|retry/i.test(httpTarget)) {
    errors.push("wave5-http-optional-or-retried");
  }
  if (
    !providerSource.includes("async function listExactBillingInvoices(") ||
    !providerSource.includes("async function getExactBillingInvoice(") ||
    !providerSource.includes("async function saveExactBillingInvoice(") ||
    !providerSource.includes("return listExactBillingInvoices(params);") ||
    !providerSource.includes("return getExactBillingInvoice(params.id);") ||
    !providerSource.includes("const result = await saveExactBillingInvoice(") ||
    !exactProviderBoundary.includes('"read_billing_invoices_exact"') ||
    !exactProviderBoundary.includes('"save_billing_invoice_exact"') ||
    /\.from\(\s*["']invoices["']\s*\)/.test(providerSource) ||
    /baseDataProvider\.(?:getList|getOne|create|update)\(\s*["']invoices["']/.test(
      providerSource,
    )
  ) {
    errors.push("wave5-provider-exact-routing");
  }
  if (
    /\bNumber\s*\(\s*value\.(?:amount|tax_rate|tax_amount|total_amount|line_items)/.test(
      exactProviderBoundary,
    ) ||
    /execute_billing_automation_command[\s\S]{0,300}\b(?:number|Number\s*\()/.test(
      providerSource,
    )
  ) {
    errors.push("wave5-provider-numeric-authority");
  }
  if (
    readDefinitions.some(
      (definition) =>
        !definition.includes("SECURITY DEFINER") ||
        !definition.includes("SET search_path = ''"),
    ) ||
    /CREATE(?:\s+OR\s+REPLACE)?\s+VIEW\s+[^;]*invoice/i.test(exactMigration) ||
    /security_invoker/i.test(exactMigration)
  ) {
    errors.push("wave5-rpc-function-boundary");
  }
  if (
    /GRANT\s+(?:ALL|SELECT|INSERT|UPDATE|DELETE)[^;]*ON(?:\s+TABLE)?\s+public\.invoices[^;]*\b(?:anon|authenticated)\b/i.test(
      exactMigration,
    ) ||
    /GRANT\s+(?:ALL|USAGE|SELECT|UPDATE)[^;]*ON\s+SEQUENCE\s+public\.invoices_id_seq[^;]*\b(?:anon|authenticated)\b/i.test(
      exactMigration,
    )
  ) {
    errors.push("wave5-direct-invoice-grant");
  }
  if (
    !boundarySource.includes(
      "describe.runIf(Boolean(process.env.SUPABASE_DB_URL))",
    ) ||
    !boundarySource.includes("invoiceEffectSnapshot") ||
    !boundarySource.includes("read_billing_invoices_legacy_compat") ||
    !boundarySource.includes('amount_minor: "-9223372036854775808"') ||
    !boundarySource.includes('amount_minor: "9223372036854775807"') ||
    !boundarySource.includes('tax_rate: "8.875000000"') ||
    !boundarySource.includes('tax_rate: "12.500000000"')
  ) {
    errors.push("wave5-live-exact-boundary-proof");
  }
  if (
    !tenancySource.includes('"rpc/read_billing_invoices_exact"') ||
    !tenancySource.includes("expect(registry).toHaveLength(100)") ||
    !tenancySource.includes("expectDeniedInvoiceTableMutation")
  ) {
    errors.push("wave5-inherited-tenancy-proof");
  }

  return errors;
};

const financialWorkflowIdentityErrors = (workflow: string) => {
  const errors: string[] = [];
  const jobBlocks = workflow.split(/^ {2}(?=[a-z][a-z-]+:)/m);
  const requiredJobs = jobBlocks.filter((block) =>
    /name:\s*financial \/ [a-z-]+\s*$/m.test(block),
  );
  if (requiredJobs.length !== 6) {
    errors.push("financial-workflow-identity-count");
  }
  for (const identity of inheritedFinancialIdentities) {
    const job = requiredJobs.find((block) =>
      block.includes(`name: financial / ${identity}`),
    );
    if (
      !job ||
      !job.includes("github.event_name == 'merge_group'") ||
      /continue-on-error|retry/i.test(job)
    ) {
      errors.push(`financial-workflow-identity:${identity}`);
    }
  }
  return errors;
};

const waveSixCouplingErrors = (
  patterns: string[],
  makefile: string,
  fakeRestSource: string,
  fakeRestGenerator: string,
  previewSource: string,
  workflow: string,
) => {
  const errors: string[] = [];
  const expressions = patterns.map(globExpression);
  const httpBlock = extractDatabaseHttpTestBlock(makefile);
  const fastBlock = extractFastTestBlock(makefile);
  const httpTarget =
    makefile.match(
      /test-financial-database-http:[^\n]*\n((?:\t[^\n]*\n)+)/,
    )?.[1] ?? "";
  const fastTarget =
    makefile.match(/test-financial-fast:[^\n]*\n((?:\t[^\n]*\n)+)/)?.[1] ?? "";
  const moneyAuthoritySources = `${fakeRestSource}\n${fakeRestGenerator}\n${previewSource}`;

  for (const filename of waveSixPaths) {
    if (!expressions.some((expression) => expression.test(filename))) {
      errors.push(`wave6-unclassified:${filename}`);
    }
  }
  if (!httpBlock.includes(waveSixProviderTest)) {
    errors.push(`wave6-http-test:${waveSixProviderTest}`);
  }
  if (!fastBlock.includes(waveSixPreviewTest)) {
    errors.push(`wave6-fast-test:${waveSixPreviewTest}`);
  }
  if (
    httpTarget.trim() !==
      "node scripts/release/run-supabase-lane.mjs run --lane database-contracts -- npm test -- --run $(FINANCIAL_DATABASE_HTTP_TESTS)" ||
    /\|\|\s*true|continue-on-error|retry/i.test(httpTarget)
  ) {
    errors.push("wave6-http-optional-or-replaced");
  }
  if (
    fastTarget.trim() !== "npm test -- --run $(FINANCIAL_FAST_TESTS)" ||
    /\|\|\s*true|continue-on-error|retry/i.test(fastTarget)
  ) {
    errors.push("wave6-fast-optional-or-replaced");
  }
  if (
    !fakeRestSource.includes(
      "export function createFakeRestExactInvoiceProvider()",
    ) ||
    !fakeRestSource.includes(
      "const exactInvoiceProvider = createFakeRestExactInvoiceProvider();",
    ) ||
    !fakeRestSource.includes(
      "return exactInvoiceProvider.listExactBillingInvoices(params);",
    ) ||
    !fakeRestSource.includes(
      "return exactInvoiceProvider.getExactBillingInvoice(params.id);",
    ) ||
    !fakeRestSource.includes(
      "const result = await exactInvoiceProvider.saveExactBillingInvoice(",
    ) ||
    !fakeRestGenerator.includes("export const generateExactBillingInvoices") ||
    !fakeRestGenerator.includes('"9223372036854775807"') ||
    !fakeRestGenerator.includes('"-9223372036854775808"') ||
    !fakeRestGenerator.includes('parseOrdinaryPercentageRate("8.875%")')
  ) {
    errors.push("wave6-fakerest-exact-routing");
  }
  if (
    /Math\.round\s*\(|\.toFixed\s*\(|parseFloat\s*\(/.test(
      moneyAuthoritySources,
    ) ||
    /\bNumber\s*\([^)]*(?:amount_minor|tax_rate|tax_amount|total_amount|unit_price|extended_amount)/i.test(
      moneyAuthoritySources,
    ) ||
    /(?:amount_minor|tax_rate|tax_amount|total_amount|unit_price|extended_amount)\??\s*:\s*number\b/i.test(
      moneyAuthoritySources,
    )
  ) {
    errors.push("wave6-numeric-financial-authority");
  }
  if (
    !previewSource.includes("export function calculateInvoicePreview(") ||
    !previewSource.includes("BigInt(amount.amount_minor)") ||
    previewSource.match(/roundExactRatioToUsdMoney\(\{/g)?.length !== 1 ||
    !previewSource.includes("HALF_AWAY_FROM_ZERO_ROUNDING_POLICY_VERSION") ||
    !previewSource.includes("USD_CURRENCY_POLICY_VERSION")
  ) {
    errors.push("wave6-preview-exact-delegation");
  }
  errors.push(...financialWorkflowIdentityErrors(workflow));
  return errors;
};

const upgradeCouplingErrors = (
  patterns: string[],
  makefile: string,
  runner: string,
  runnerTest: string,
) => {
  const errors: string[] = [];
  const expressions = patterns.map(globExpression);
  for (const filename of exactUpgradePaths) {
    if (!expressions.some((expression) => expression.test(filename))) {
      errors.push(`unclassified:${filename}`);
    }
  }

  const target =
    makefile.match(
      /test-financial-migration-upgrade:[^\n]*\n((?:\t[^\n]*\n)+)/,
    )?.[1] ?? "";
  if (
    !target.includes(
      "node scripts/release/run-supabase-lane.mjs run --lane migration-upgrade -- node scripts/release/fingerprint-upgrade.mjs",
    )
  ) {
    errors.push("upgrade-live-runner");
  }
  if (!target.includes(`npm test -- --run ${exactUpgradeTest}`)) {
    errors.push("upgrade-unit-contract");
  }
  if (/\|\|\s*true|continue-on-error|retry/i.test(target)) {
    errors.push("upgrade-target-optional-or-retried");
  }

  for (const filename of acceptedUpgradeArtifacts) {
    if (!runner.includes(`"${filename}"`)) {
      errors.push(`unpinned:${filename}`);
    }
  }
  if (
    !/it\(\s*"pins baseline 001, registry 002, and the three accepted Phase 2 migrations"[\s\S]*?verifyAcceptedUpgradeArtifacts\(\)[\s\S]*?assertAcceptedUpgradeArtifactDigests/.test(
      runnerTest,
    )
  ) {
    errors.push("immutable-history-assertion");
  }
  if (
    !runner.includes('registry.registry_id !== "003-exact-money"') ||
    !runner.includes("exactUpgradeCategoryNames") ||
    !runner.includes("exactUpgradeInvariantNames") ||
    !runnerTest.includes("accepts the complete closed 003 vocabulary in order")
  ) {
    errors.push("exact-003-registry-contract");
  }

  return errors;
};

const couplingErrors = (patterns: string[], makefile: string) => {
  const errors: string[] = [];
  const expressions = patterns.map(globExpression);
  const fastTestBlock = extractFastTestBlock(makefile);

  if (!patterns.includes(exactFinancialPattern)) {
    errors.push("exact-financial-classifier");
  }
  for (const filename of exactFinancialPaths) {
    if (!expressions.some((expression) => expression.test(filename))) {
      errors.push(`unclassified:${filename}`);
    }
  }
  for (const filename of exactFastTests) {
    if (!fastTestBlock.includes(filename)) {
      errors.push(`fast-test:${filename}`);
    }
  }
  if (
    !/test-financial-fast:[^\n]*\n\tnpm test -- --run \$\(FINANCIAL_FAST_TESTS\)/.test(
      makefile,
    ) ||
    /test-financial-fast:[\s\S]*?(?:\|\|\s*true|continue-on-error)/.test(
      makefile.slice(0, makefile.indexOf("\ninstall:")),
    )
  ) {
    errors.push("fast-test-optional");
  }

  return errors;
};

const loadPhaseThreeFinalAuditSources = (): PhaseThreeFinalAuditSources => {
  const workflowDirectory = path.join(repositoryRoot, ".github/workflows");
  const workflowSources = Object.fromEntries(
    fs
      .readdirSync(workflowDirectory)
      .filter((filename) => filename.endsWith(".yml"))
      .sort()
      .map((filename) => [
        filename,
        fs.readFileSync(path.join(workflowDirectory, filename), "utf8"),
      ]),
  );
  const pathConfiguration = JSON.parse(
    readSource(".github/release/financial-paths.json"),
  ) as { financial_paths: string[] };

  return {
    patterns: pathConfiguration.financial_paths,
    makefile: readSource("makefile"),
    financialWorkflow: readSource(
      ".github/workflows/financial-release-gate.yml",
    ),
    releaseBuild: readSource(".github/workflows/release-build.yml"),
    releasePromote: readSource(".github/workflows/release-promote.yml"),
    workflowSources,
    summaries: Object.fromEntries(
      phaseThreePlanSummaries.map(({ plan, path: summaryPath }) => [
        plan,
        readSource(summaryPath),
      ]),
    ),
    sourceAudit: readSource(
      ".planning/phases/03-exact-money-and-rounding-contract/03-SOURCE-AUDIT.md",
    ),
    exactMoneySource: readSource(
      "src/components/atomic-crm/financial/exactMoney.ts",
    ),
    exactMoneyTest: readSource(
      "src/components/atomic-crm/financial/exactMoney.test.ts",
    ),
    primitiveMigration: readSource(
      "supabase/migrations/20260902000001_exact_financial_primitives.sql",
    ),
    primitiveSql: readSource(
      "supabase/tests/database/60_exact_financial_primitives.sql",
    ),
    conversionSql: readSource(
      "supabase/tests/database/65_exact_billing_conversion.sql",
    ),
    providerContract: readSource(
      "src/components/atomic-crm/financial/exactProviderContract.test.ts",
    ),
    providerTypes: readSource("src/components/atomic-crm/providers/types.ts"),
    previewTest: readSource(
      "src/components/atomic-crm/invoices/invoiceCalculations.test.ts",
    ),
    upgradeRunner: readSource("scripts/release/fingerprint-upgrade.mjs"),
    upgradeRunnerTest: readSource(exactUpgradeTest),
    exactMigration: readSource(
      "supabase/migrations/20260902000002_exact_billing_expand.sql",
    ),
    automationSql: readSource(
      "supabase/tests/database/35_billing_automation.sql",
    ),
    evidenceSql: readSource("supabase/tests/database/40_billing_evidence.sql"),
    replaySource: readSource("tests/release/replay-concurrency.test.ts"),
    evidenceSource: readSource("tests/release/billing-evidence.test.ts"),
    providerSource: readSource(
      "src/components/atomic-crm/providers/supabase/dataProvider.ts",
    ),
    fakeRestSource: readSource(
      "src/components/atomic-crm/providers/fakerest/dataProvider.ts",
    ),
    fakeRestGenerator: readSource(
      "src/components/atomic-crm/providers/fakerest/dataGenerator/billingAccounts.ts",
    ),
    previewSource: readSource(
      "src/components/atomic-crm/invoices/invoiceCalculations.ts",
    ),
    boundarySource: readSource("tests/release/exact-money-boundaries.test.ts"),
    tenancySource: readSource("tests/release/billing-tenancy.test.ts"),
    laneRunner: readSource("scripts/release/run-supabase-lane.mjs"),
    acceptedArtifacts: Object.fromEntries(
      Object.keys(acceptedUpgradeArtifactDigests).map((artifactPath) => [
        artifactPath,
        readSource(artifactPath),
      ]),
    ),
  };
};

const countOccurrences = (source: string, marker: string) =>
  source.split(marker).length - 1;

const extractMakeTarget = (makefile: string, target: string) => {
  const escapedTarget = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (
    makefile.match(
      new RegExp(`^${escapedTarget}:[^\\n]*\\n((?:\\t[^\\n]*\\n)+)`, "m"),
    )?.[1] ?? ""
  );
};

const phaseThreeFinalAuditErrors = (
  overrides: Partial<PhaseThreeFinalAuditSources> = {},
) => {
  const sources = { ...loadPhaseThreeFinalAuditSources(), ...overrides };
  const errors: string[] = [];
  const acceptedEvidenceMigration =
    sources.acceptedArtifacts[
      "supabase/migrations/20260901000004_billing_evidence_security.sql"
    ] ?? "";

  errors.push(...couplingErrors(sources.patterns, sources.makefile));
  errors.push(...databaseCouplingErrors(sources.makefile));
  errors.push(
    ...upgradeCouplingErrors(
      sources.patterns,
      sources.makefile,
      sources.upgradeRunner,
      sources.upgradeRunnerTest,
    ),
  );
  errors.push(
    ...waveFourCouplingErrors(
      sources.patterns,
      sources.makefile,
      sources.exactMigration,
      sources.automationSql,
      sources.evidenceSql,
      sources.replaySource,
      sources.evidenceSource,
      acceptedEvidenceMigration,
    ),
  );
  errors.push(
    ...waveFiveCouplingErrors(
      sources.patterns,
      sources.makefile,
      sources.exactMigration,
      sources.providerSource,
      sources.boundarySource,
      sources.tenancySource,
    ),
  );
  errors.push(
    ...waveSixCouplingErrors(
      sources.patterns,
      sources.makefile,
      sources.fakeRestSource,
      sources.fakeRestGenerator,
      sources.previewSource,
      sources.financialWorkflow,
    ),
  );

  const expressions = sources.patterns.map(globExpression);
  for (const { plan, ownedPaths } of phaseThreePlanSummaries) {
    const summary = sources.summaries[plan] ?? "";
    for (const ownedPath of ownedPaths) {
      if (!expressions.some((expression) => expression.test(ownedPath))) {
        errors.push(`final-unclassified:${ownedPath}`);
      }
      if (!summary.includes(`\`${ownedPath}\``)) {
        errors.push(`plan-${plan}-missing-owned-path:${ownedPath}`);
      }
    }
    if (
      !summary.includes("`makefile`") ||
      !summary.includes("`tests/release/exact-money-release-static.test.ts`")
    ) {
      errors.push(`plan-${plan}-missing-same-plan-coupling`);
    }
  }

  for (let decision = 1; decision <= 23; decision += 1) {
    const decisionId = `D-${String(decision).padStart(2, "0")}`;
    if (
      !new RegExp(
        `\\| CONTEXT \\| ${decisionId} \\|[^\\n]*\\| COVERED \\|`,
      ).test(sources.sourceAudit)
    ) {
      errors.push(`final-source-audit:${decisionId}`);
    }
  }
  for (const requirement of ["CALC-01", "CALC-03"]) {
    if (
      !new RegExp(`\\| REQ \\| ${requirement} \\|[^\\n]*\\| COVERED \\|`).test(
        sources.sourceAudit,
      )
    ) {
      errors.push(`final-source-audit:${requirement}`);
    }
  }

  const testMemberships = [
    [
      "src/components/atomic-crm/financial/exactMoney.test.ts",
      extractFastTestBlock(sources.makefile),
    ],
    [
      "tests/release/exact-money-release-static.test.ts",
      extractFastTestBlock(sources.makefile),
    ],
    [exactFinancialDatabaseTest, extractDatabaseSqlTestBlock(sources.makefile)],
    [
      "supabase/tests/database/35_billing_automation.sql",
      extractDatabaseSqlTestBlock(sources.makefile),
    ],
    [
      "supabase/tests/database/40_billing_evidence.sql",
      extractDatabaseSqlTestBlock(sources.makefile),
    ],
    [
      "supabase/tests/database/65_exact_billing_conversion.sql",
      extractDatabaseSqlTestBlock(sources.makefile),
    ],
    [
      "tests/release/exact-money-boundaries.test.ts",
      extractDatabaseHttpTestBlock(sources.makefile),
    ],
    [
      "tests/release/billing-tenancy.test.ts",
      extractDatabaseHttpTestBlock(sources.makefile),
    ],
    [waveSixProviderTest, extractDatabaseHttpTestBlock(sources.makefile)],
    [waveSixPreviewTest, extractFastTestBlock(sources.makefile)],
    [
      "tests/release/billing-evidence.test.ts",
      sources.makefile.match(
        /FINANCIAL_FUNCTION_TESTS := \\\n([\s\S]*?)\n\nFINANCIAL_FAST_TESTS/,
      )?.[1] ?? "",
    ],
    [
      exactUpgradeTest,
      extractMakeTarget(sources.makefile, "test-financial-migration-upgrade"),
    ],
    [
      "tests/release/replay-concurrency.test.ts",
      extractMakeTarget(sources.makefile, "test-financial-concurrency"),
    ],
  ] as const;
  for (const [testPath, targetBlock] of testMemberships) {
    if (countOccurrences(targetBlock, testPath) !== 1) {
      errors.push(`final-target-membership:${testPath}`);
    }
  }
  if (
    countOccurrences(
      sources.laneRunner,
      "supabase/tests/support/billing-security-fixtures.sql",
    ) !== 1
  ) {
    errors.push("final-target-membership:billing-security-fixtures");
  }

  const financialGate = extractMakeTarget(sources.makefile, "financial-gate");
  const financialTargets = {
    "migration-clean": "test-financial-migration-clean",
    "migration-upgrade": "test-financial-migration-upgrade",
    "database-contracts": "test-financial-database-contracts",
    "edge-provider-contracts": "test-financial-functions",
    "replay-concurrency": "test-financial-replay-concurrency",
    "release-security": "test-release-security",
  } as const;
  const workflowJobBlocks = sources.financialWorkflow.split(
    /^ {2}(?=[a-z][a-z-]+:)/m,
  );
  for (const [identity, target] of Object.entries(financialTargets)) {
    if (countOccurrences(financialGate, `$(MAKE) ${target}`) !== 1) {
      errors.push(`final-financial-gate:${target}`);
    }
    const job = workflowJobBlocks.find((block) =>
      block.startsWith(`${identity}:`),
    );
    if (
      !job ||
      !job.includes("needs: classify") ||
      !job.includes("github.event_name == 'merge_group'") ||
      !job.includes("timeout-minutes:") ||
      !job.includes(`make ${target}`)
    ) {
      errors.push(`final-financial-job:${identity}`);
    }
    if (identity !== "release-security") {
      if (
        !job?.includes(
          "supabase/setup-cli@ab058987d8d6c725971f6cf9d0b5c98467e30bd1",
        ) ||
        !job.includes("version: 2.116.0") ||
        !job.includes("if: ${{ always() }}") ||
        !job.includes("supabase stop --no-backup")
      ) {
        errors.push(`final-financial-isolation:${identity}`);
      }
    }
  }
  const financialUses = [
    ...sources.financialWorkflow.matchAll(/^\s*uses:\s*(\S+)/gm),
  ].map((match) => match[1] ?? "");
  if (
    !sources.financialWorkflow.includes(
      "pull_request:\n    types: [opened, reopened, synchronize, ready_for_review]",
    ) ||
    !sources.financialWorkflow.includes(
      "merge_group:\n    types: [checks_requested]",
    ) ||
    !sources.financialWorkflow.includes("permissions:\n  contents: read") ||
    sources.financialWorkflow.includes("pull-requests: write") ||
    financialUses.length === 0 ||
    financialUses.some((use) => !/@[0-9a-f]{40}$/.test(use)) ||
    /continue-on-error|\|\|\s*true|assertion[^\n]*retry/i.test(
      sources.financialWorkflow,
    )
  ) {
    errors.push("final-financial-workflow-hardening");
  }

  const readRpcSignatures = [
    "public.read_billing_invoices_exact(jsonb)",
    "public.read_billing_invoices_legacy_compat(jsonb)",
  ] as const;
  for (const signature of readRpcSignatures) {
    const definition = extractFunctionDefinition(
      sources.exactMigration,
      signature,
    );
    if (
      !definition.includes("SECURITY DEFINER") ||
      !definition.includes("SET search_path = ''") ||
      !definition.includes("FROM public.invoices AS invoice") ||
      !definition.includes("private.billing_has_capability(") ||
      !definition.includes("per_page_value > 100") ||
      !definition.includes(
        "key_name NOT IN ('billing_account_id', 'status', 'invoice_number')",
      ) ||
      /\bEXECUTE\b|\bformat\s*\(/i.test(definition) ||
      !sources.exactMigration.includes(
        `ALTER FUNCTION ${signature} OWNER TO postgres;`,
      ) ||
      !sources.exactMigration.includes(
        `REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC, anon, authenticated, service_role;`,
      ) ||
      !sources.exactMigration.includes(
        `GRANT EXECUTE ON FUNCTION ${signature} TO authenticated, service_role;`,
      )
    ) {
      errors.push(`final-rpc-hardening:${signature}`);
    }
  }
  if (
    /security_invoker/i.test(sources.exactMigration) ||
    /CREATE(?:\s+OR\s+REPLACE)?\s+VIEW\s+[^;]*invoice/i.test(
      sources.exactMigration,
    ) ||
    !sources.exactMigration.includes(
      "REVOKE ALL ON TABLE public.invoices FROM anon, authenticated;",
    ) ||
    !sources.exactMigration.includes(
      "REVOKE ALL ON SEQUENCE public.invoices_id_seq FROM anon, authenticated;",
    ) ||
    /GRANT\s+(?:ALL|SELECT|INSERT|UPDATE|DELETE)[^;]*ON(?:\s+TABLE)?\s+public\.invoices[^;]*\b(?:anon|authenticated)\b/i.test(
      sources.exactMigration,
    )
  ) {
    errors.push("final-invoice-base-access-closure");
  }

  const primitiveIssueDatePreflight = sources.primitiveMigration.indexOf(
    "EXACT_BILLING_LEGACY_ISSUE_DATE_REQUIRED",
  );
  const firstPrimitiveMutation = sources.primitiveMigration.indexOf(
    "CREATE TABLE public.financial_currency_policies",
  );
  const exactIssueDatePreflight = sources.exactMigration.indexOf(
    "EXACT_BILLING_LEGACY_ISSUE_DATE_REQUIRED",
  );
  const firstExactHelper = sources.exactMigration.indexOf(
    "CREATE OR REPLACE FUNCTION private.billing_legacy_decimal_ratio",
  );
  if (
    primitiveIssueDatePreflight < 0 ||
    firstPrimitiveMutation < 0 ||
    primitiveIssueDatePreflight > firstPrimitiveMutation ||
    exactIssueDatePreflight < 0 ||
    firstExactHelper < 0 ||
    exactIssueDatePreflight > firstExactHelper ||
    !sources.exactMigration.includes("ALTER COLUMN issue_date SET NOT NULL,") ||
    !sources.upgradeRunner.includes("pre-Phase-3 NULL issue-date fixture") ||
    !sources.upgradeRunner.includes("legacy NULL issue-date cutover") ||
    !sources.upgradeRunner.includes("DROP SCHEMA IF EXISTS private CASCADE") ||
    !sources.upgradeRunner.includes("currency_policy_table_present") ||
    !sources.upgradeRunner.includes("currency_policy_seed_present") ||
    !sources.upgradeRunner.includes("canonical_integer_function_present") ||
    !sources.upgradeRunner.includes("exact_primitives_migration_recorded") ||
    !sources.upgradeRunner.includes("exact_billing_migration_recorded") ||
    !sources.upgradeRunner.includes("exact_save_rpc_present") ||
    !sources.conversionSql.includes(
      '"issue_date":{"type":"date","udt":"date","nullable":"NO"}',
    )
  ) {
    errors.push("final-legacy-issue-date-closure");
  }

  const canonicalDateHelper = extractNamedFunctionDefinition(
    sources.exactMigration,
    "private.billing_canonical_date",
  );
  const exactSaveDefinition = extractNamedFunctionDefinition(
    sources.exactMigration,
    "public.save_billing_invoice_exact",
  );
  if (
    !canonicalDateHelper.includes("SET search_path = ''") ||
    !canonicalDateHelper.includes("^[0-9]{4}-[0-9]{2}-[0-9]{2}$") ||
    !canonicalDateHelper.includes(
      "pg_catalog.to_char(parsed_date, 'YYYY-MM-DD') <> value_text",
    ) ||
    exactSaveDefinition.match(/private\.billing_canonical_date\(/g)?.length !==
      2 ||
    !sources.exactMigration.includes(
      "ALTER FUNCTION private.billing_canonical_date(jsonb,boolean) OWNER TO postgres;",
    ) ||
    !sources.exactMigration.includes(
      "REVOKE ALL ON FUNCTION private.billing_canonical_date(jsonb,boolean) FROM PUBLIC, anon, authenticated, service_role;",
    ) ||
    !sources.conversionSql.includes("relative issue date today is rejected") ||
    !sources.conversionSql.includes("year-zero issue date is rejected") ||
    !sources.conversionSql.includes("year-zero due date is rejected") ||
    !sources.conversionSql.includes("impossible due date is rejected") ||
    !sources.providerTypes.includes("/^(?!0000)\\d{4}-\\d{2}-\\d{2}$/") ||
    !sources.providerSource.includes("isCanonicalExactBillingInvoiceDate") ||
    !sources.fakeRestSource.includes("isCanonicalExactBillingInvoiceDate") ||
    !sources.boundarySource.includes('issue_date: "today"') ||
    !sources.boundarySource.includes('issue_date: "0000-01-01"') ||
    !sources.boundarySource.includes('due_date: "0000-02-29"') ||
    !sources.providerContract.includes('issue_date: "0000-01-01"') ||
    !sources.providerContract.includes('due_date: "0000-02-29"')
  ) {
    errors.push("final-canonical-invoice-date-boundary");
  }

  const nonDraftSaveGuard =
    'previous !== undefined && previous.status !== "Draft"';
  if (
    !sources.fakeRestSource.includes(nonDraftSaveGuard) ||
    !sources.providerContract.includes(nonDraftSaveGuard) ||
    !sources.fakeRestGenerator.includes('"Sent"') ||
    !sources.fakeRestGenerator.includes('"Paid"') ||
    !sources.providerContract.includes(
      "rejects Sent and Paid rewrites without changing invoice or effect state",
    )
  ) {
    errors.push("final-non-draft-invoice-save-closure");
  }

  const evidenceHelper = extractNamedFunctionDefinition(
    sources.exactMigration,
    "private.billing_finalize_evidence_inspection",
  );
  const evidenceWrapper = extractNamedFunctionDefinition(
    sources.exactMigration,
    "public.finalize_billing_evidence_inspection",
  );
  const automationHelper = extractNamedFunctionDefinition(
    sources.exactMigration,
    "private.billing_consume_automation_grant",
  );
  if (
    !evidenceHelper.includes("SECURITY DEFINER") ||
    !evidenceHelper.includes("SET search_path = ''") ||
    !evidenceHelper.includes("private.billing_consume_automation_grant(") ||
    !evidenceHelper.includes(
      '\'{"amount_minor":"0","currency":"USD"}\'::jsonb',
    ) ||
    !evidenceHelper.includes("'kind', 'evidence.inspection'") ||
    !evidenceHelper.includes("IDEMPOTENCY_KEY_CONFLICT") ||
    !evidenceWrapper.includes("SECURITY DEFINER") ||
    !evidenceWrapper.includes("SET search_path = ''") ||
    !evidenceWrapper.includes(
      "private.billing_finalize_evidence_inspection(",
    ) ||
    !automationHelper.includes("request_fingerprint_value") ||
    !automationHelper.includes("effect_fingerprint_value") ||
    !automationHelper.includes("IF amount_minor_value < 0 THEN") ||
    !sources.exactMigration.includes(
      "DROP FUNCTION private.billing_consume_automation_grant(\n  uuid, uuid, text, text, text, text, numeric, text\n);",
    ) ||
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+private\.billing_consume_automation_grant\([\s\S]{0,500}?p_amount\s+numeric/i.test(
      sources.exactMigration,
    )
  ) {
    errors.push("final-evidence-exact-closure");
  }

  if (
    !sources.exactMoneySource.includes("byteLength > 64") ||
    !sources.exactMoneySource.includes("byteLength > 14") ||
    !sources.exactMoneySource.includes("BigInt(canonical)") ||
    !sources.exactMoneySource.includes("half-away-from-zero-v1") ||
    !sources.exactMoneyTest.includes(
      'it("checks the 64-byte money limit before BigInt construction"',
    ) ||
    !sources.exactMoneyTest.includes(
      'it("checks the 14-byte rate limit before grammar or ratio construction"',
    ) ||
    !sources.primitiveSql.includes("SELECT plan(147);") ||
    !sources.primitiveSql.includes('"-9223372036854775808"') ||
    !sources.primitiveSql.includes('"8.875%"') ||
    !sources.conversionSql.includes("line_items_exact") ||
    !sources.conversionSql.includes("request_fingerprints") ||
    !sources.conversionSql.includes("effect_fingerprints") ||
    !sources.providerContract.includes('"9223372036854775807"') ||
    !sources.previewTest.includes('inputFor("10000", "8.875%")')
  ) {
    errors.push("final-exact-contract-markers");
  }

  for (const [artifactPath, expectedDigest] of Object.entries(
    acceptedUpgradeArtifactDigests,
  )) {
    const artifact = sources.acceptedArtifacts[artifactPath] ?? "";
    if (
      createHash("sha256").update(artifact).digest("hex") !== expectedDigest ||
      !sources.upgradeRunner.includes(`"${expectedDigest}"`)
    ) {
      errors.push(`final-accepted-history:${artifactPath}`);
    }
  }

  const allPinnedActions = [
    sources.releaseBuild,
    sources.releasePromote,
  ].flatMap((workflowSource) =>
    [...workflowSource.matchAll(/^\s*uses:\s*(\S+)/gm)].map(
      (match) => match[1] ?? "",
    ),
  );
  if (
    !sources.releaseBuild.includes("permissions: {}") ||
    !sources.releaseBuild.includes("Checkout exact protected commit") ||
    !sources.releaseBuild.includes("collect-required-checks.mjs") ||
    countOccurrences(sources.releaseBuild, "npm run build") !== 1 ||
    /supabase\s+(?:link|db\s+push|functions\s+deploy)|npx\s+--no-install\s+gh-pages|environment:\s*\n\s*name:\s*production-release/i.test(
      sources.releaseBuild,
    ) ||
    /SUPABASE_(?:ACCESS_TOKEN|DB_PASSWORD|PROJECT_ID)/.test(
      sources.releaseBuild,
    )
  ) {
    errors.push("release-build-production-mutation");
  }
  if (
    allPinnedActions.length === 0 ||
    allPinnedActions.some((use) => !/@[0-9a-f]{40}$/.test(use))
  ) {
    errors.push("release-workflow-unpinned-action");
  }

  const schemaMutationWorkflows = Object.entries(sources.workflowSources)
    .filter(([, workflowSource]) => /\bsupabase db push\b/.test(workflowSource))
    .map(([filename]) => filename)
    .sort();
  if (
    schemaMutationWorkflows.length !== 1 ||
    schemaMutationWorkflows[0] !== "release-promote.yml"
  ) {
    errors.push("schema-mutation-workflow-set");
  }
  if (
    !sources.releasePromote.includes("evidence_id:") ||
    !sources.releasePromote.includes("required: true") ||
    !sources.releasePromote.includes("name: production-release") ||
    !sources.releasePromote.includes(
      'fetch-private-evidence.mjs "${{ inputs.evidence_id }}"',
    ) ||
    !sources.releasePromote.includes("Checkout exact attested commit") ||
    !sources.releasePromote.includes("verify-receipt.mjs") ||
    !sources.releasePromote.includes("verify-promotion-input.mjs") ||
    !sources.releasePromote.includes("if: ${{ inputs.stage == 'schema' }}") ||
    !sources.releasePromote.includes(
      'supabase link --project-ref "$SUPABASE_PROJECT_ID"',
    ) ||
    !sources.releasePromote.includes("supabase db push --dry-run") ||
    !sources.releasePromote.includes("supabase db push") ||
    !sources.releasePromote.includes("supabase migration list --linked") ||
    !sources.releasePromote.includes("verify-promotion-state.mjs") ||
    !sources.releasePromote.includes('readback!=="verified"')
  ) {
    errors.push("release-promote-predecessor-verification");
  }

  return errors;
};

describe("Phase 3 exact-money release coupling", () => {
  const pathConfiguration = JSON.parse(
    readSource(".github/release/financial-paths.json"),
  ) as { financial_paths: string[] };
  const makefile = readSource("makefile");
  const upgradeRunner = readSource("scripts/release/fingerprint-upgrade.mjs");
  const upgradeRunnerTest = readSource(exactUpgradeTest);
  const exactMigration = readSource(
    "supabase/migrations/20260902000002_exact_billing_expand.sql",
  );
  const automationSql = readSource(
    "supabase/tests/database/35_billing_automation.sql",
  );
  const evidenceSql = readSource(
    "supabase/tests/database/40_billing_evidence.sql",
  );
  const replaySource = readSource("tests/release/replay-concurrency.test.ts");
  const evidenceSource = readSource("tests/release/billing-evidence.test.ts");
  const providerSource = readSource(
    "src/components/atomic-crm/providers/supabase/dataProvider.ts",
  );
  const fakeRestSource = readSource(
    "src/components/atomic-crm/providers/fakerest/dataProvider.ts",
  );
  const fakeRestGenerator = readSource(
    "src/components/atomic-crm/providers/fakerest/dataGenerator/billingAccounts.ts",
  );
  const previewSource = readSource(
    "src/components/atomic-crm/invoices/invoiceCalculations.ts",
  );
  const boundarySource = readSource(
    "tests/release/exact-money-boundaries.test.ts",
  );
  const tenancySource = readSource("tests/release/billing-tenancy.test.ts");
  const workflow = readSource(".github/workflows/financial-release-gate.yml");
  const acceptedEvidenceMigration = readSource(
    "supabase/migrations/20260901000004_billing_evidence_security.sql",
  );

  it("classifies every Wave 1 exact-money path and runs both exact tests in the protected fast target", () => {
    expect(couplingErrors(pathConfiguration.financial_paths, makefile)).toEqual(
      [],
    );
  });

  it("detects removal from either the classifier or protected fast target", () => {
    const acceptedPatterns = [
      ...pathConfiguration.financial_paths,
      exactFinancialPattern,
    ];
    const acceptedMakefile = exactFastTests.reduce((source, filename) => {
      if (extractFastTestBlock(source).includes(filename)) {
        return source;
      }
      return source.replace(
        "FINANCIAL_FAST_TESTS := \\\n",
        `FINANCIAL_FAST_TESTS := \\\n\t${filename} \\\n`,
      );
    }, makefile);
    const withoutClassifier = acceptedPatterns.filter(
      (pattern) => pattern !== exactFinancialPattern,
    );
    const withoutUnitTest = acceptedMakefile.replace(
      `\t${exactFastTests[0]} \\\n`,
      "",
    );
    const withoutStaticTest = acceptedMakefile.replace(
      `\t${exactFastTests[1]} \\\n`,
      "",
    );

    expect(couplingErrors(withoutClassifier, acceptedMakefile)).toContain(
      "exact-financial-classifier",
    );
    expect(couplingErrors(acceptedPatterns, withoutUnitTest)).toContain(
      `fast-test:${exactFastTests[0]}`,
    );
    expect(couplingErrors(acceptedPatterns, withoutStaticTest)).toContain(
      `fast-test:${exactFastTests[1]}`,
    );
  });

  it("runs the Wave 2 primitive pgTAP contract through the protected SQL target", () => {
    expect(databaseCouplingErrors(makefile)).toEqual([]);
  });

  it("detects primitive pgTAP omission and a direct unisolated substitute", () => {
    const acceptedMakefile = extractDatabaseSqlTestBlock(makefile).includes(
      exactFinancialDatabaseTest,
    )
      ? makefile
      : makefile.replace(
          "FINANCIAL_DATABASE_SQL_TESTS := \\\n",
          `FINANCIAL_DATABASE_SQL_TESTS := \\\n\t${exactFinancialDatabaseTest} \\\n`,
        );
    const withoutPrimitive = acceptedMakefile
      .replace(`\t${exactFinancialDatabaseTest} \\\n`, "")
      .replace(`\t${exactFinancialDatabaseTest}\n`, "");
    const directUnisolated = acceptedMakefile.replace(
      "\tnode scripts/release/run-supabase-lane.mjs run --lane database-contracts -- supabase test db $(FINANCIAL_DATABASE_SQL_TESTS) --local",
      "\tsupabase test db $(FINANCIAL_DATABASE_SQL_TESTS) --local",
    );

    expect(databaseCouplingErrors(withoutPrimitive)).toContain(
      `database-sql-test:${exactFinancialDatabaseTest}`,
    );
    expect(databaseCouplingErrors(directUnisolated)).toContain(
      "database-sql-runner",
    );
  });

  it("protects the exact upgrade runner, unit contract, and immutable history", () => {
    expect(
      upgradeCouplingErrors(
        pathConfiguration.financial_paths,
        makefile,
        upgradeRunner,
        upgradeRunnerTest,
      ),
    ).toEqual([]);
  });

  it("detects an omitted upgrade unit contract or immutable-history assertion", () => {
    const withoutUnitContract = makefile.replace(
      `\tnpm test -- --run ${exactUpgradeTest}\n`,
      "",
    );
    const withoutHistoryAssertion = upgradeRunnerTest.replace(
      /\n {2}it\(\s*"pins baseline 001, registry 002, and the three accepted Phase 2 migrations"[\s\S]*?\n {2}\}\);(?=\n\n {2}it\()/,
      "",
    );

    expect(
      upgradeCouplingErrors(
        pathConfiguration.financial_paths,
        withoutUnitContract,
        upgradeRunner,
        upgradeRunnerTest,
      ),
    ).toContain("upgrade-unit-contract");
    expect(
      upgradeCouplingErrors(
        pathConfiguration.financial_paths,
        makefile,
        upgradeRunner,
        withoutHistoryAssertion,
      ),
    ).toContain("immutable-history-assertion");
  });

  it("preserves the six inherited merge-group financial identities without a replacement lane", () => {
    expect(financialWorkflowIdentityErrors(workflow)).toEqual([]);
  });

  it("protects every Wave 4 exact billing path and production-shaped replay boundary", () => {
    expect(
      waveFourCouplingErrors(
        pathConfiguration.financial_paths,
        makefile,
        exactMigration,
        automationSql,
        evidenceSql,
        replaySource,
        evidenceSource,
        acceptedEvidenceMigration,
      ),
    ).toEqual([]);
  });

  it("detects Wave 4 membership, exact RPC, replay, and accepted-history regressions", () => {
    const withoutTest65 = makefile.replace(
      "\tsupabase/tests/database/65_exact_billing_conversion.sql\n",
      "",
    );
    const numericReplay = replaySource.replace(
      /'\{"amount_minor":"\$\{amountMinor\}","currency":"USD"\}'::jsonb/,
      "1.00",
    );
    const viewSubstitute = exactMigration.replace(
      "CREATE OR REPLACE FUNCTION public.read_billing_invoices_exact(jsonb)",
      "CREATE VIEW public.read_billing_invoices_exact AS SELECT 1",
    );
    const numericHelper = exactMigration.replace(
      "CREATE OR REPLACE FUNCTION private.billing_consume_automation_grant(\n  p_grant_id uuid,",
      "CREATE OR REPLACE FUNCTION private.billing_consume_automation_grant(\n  p_amount numeric,\n  p_grant_id uuid,",
    );
    const mutatedHistory = `${acceptedEvidenceMigration}\n-- mutation`;

    expect(
      waveFourCouplingErrors(
        pathConfiguration.financial_paths,
        withoutTest65,
        viewSubstitute,
        automationSql,
        evidenceSql,
        numericReplay,
        evidenceSource,
        mutatedHistory,
      ),
    ).toEqual(
      expect.arrayContaining([
        "wave4-database-test:supabase/tests/database/65_exact_billing_conversion.sql",
        "wave4-exact-rpc-hardening",
        "wave4-live-replay-exact-money",
        "wave4-accepted-evidence-migration-mutated",
      ]),
    );
    expect(
      waveFourCouplingErrors(
        pathConfiguration.financial_paths,
        makefile,
        numericHelper,
        automationSql,
        evidenceSql,
        replaySource,
        evidenceSource,
        acceptedEvidenceMigration,
      ),
    ).toContain("wave4-exact-rpc-hardening");
  });

  it("protects every Wave 5 provider and live exact-invoice boundary", () => {
    expect(
      waveFiveCouplingErrors(
        pathConfiguration.financial_paths,
        makefile,
        exactMigration,
        providerSource,
        boundarySource,
        tenancySource,
      ),
    ).toEqual([]);
  });

  it("detects Wave 5 target, view, grant, CRUD, numeric, and workflow regressions", () => {
    const acceptedMakefile = extractDatabaseHttpTestBlock(makefile).includes(
      waveFiveHttpTests[0],
    )
      ? makefile
      : makefile.replace(
          "FINANCIAL_DATABASE_HTTP_TESTS := \\\n",
          `FINANCIAL_DATABASE_HTTP_TESTS := \\\n\t${waveFiveHttpTests[0]} \\\n`,
        );
    const omittedBoundary = acceptedMakefile.replace(
      `\t${waveFiveHttpTests[0]} \\\n`,
      "",
    );
    const viewSubstitute = exactMigration.replace(
      "CREATE OR REPLACE FUNCTION public.read_billing_invoices_exact(jsonb)",
      "CREATE VIEW public.read_billing_invoices_exact WITH (security_invoker = true) AS SELECT 1",
    );
    const directGrant = `${exactMigration}\nGRANT SELECT ON TABLE public.invoices TO authenticated;`;
    const directCrud = `${providerSource}\nsupabase.from("invoices").select("*");`;
    const numericAuthority = providerSource.replace(
      "amount = parseUsdMoney(value.amount);",
      "amount = Number(value.amount);",
    );
    const seventhWorkflow = `${workflow}\n  replacement-lane:\n    name: financial / replacement-lane\n    if: github.event_name == 'merge_group'\n`;

    expect(
      waveFiveCouplingErrors(
        pathConfiguration.financial_paths,
        omittedBoundary,
        viewSubstitute,
        directCrud,
        boundarySource,
        tenancySource,
      ),
    ).toEqual(
      expect.arrayContaining([
        `wave5-http-test:${waveFiveHttpTests[0]}`,
        "wave5-rpc-function-boundary",
        "wave5-provider-exact-routing",
      ]),
    );
    expect(
      waveFiveCouplingErrors(
        pathConfiguration.financial_paths,
        acceptedMakefile,
        directGrant,
        numericAuthority,
        boundarySource,
        tenancySource,
      ),
    ).toEqual(
      expect.arrayContaining([
        "wave5-direct-invoice-grant",
        "wave5-provider-numeric-authority",
      ]),
    );
    expect(financialWorkflowIdentityErrors(seventhWorkflow)).toContain(
      "financial-workflow-identity-count",
    );
  });

  it("protects every Wave 6 FakeRest parity and exact preview path", () => {
    expect(
      waveSixCouplingErrors(
        pathConfiguration.financial_paths,
        makefile,
        fakeRestSource,
        fakeRestGenerator,
        previewSource,
        workflow,
      ),
    ).toEqual([]);
  });

  it("detects Wave 6 omissions, numeric authority, and optional or replacement lanes", () => {
    const acceptedPatterns = [
      ...pathConfiguration.financial_paths,
      "src/components/atomic-crm/invoices/invoiceCalculations.ts",
      "src/components/atomic-crm/invoices/invoiceCalculations.test.ts",
    ];
    const acceptedHttpMakefile = extractDatabaseHttpTestBlock(
      makefile,
    ).includes(waveSixProviderTest)
      ? makefile
      : makefile.replace(
          "FINANCIAL_DATABASE_HTTP_TESTS := \\\n",
          `FINANCIAL_DATABASE_HTTP_TESTS := \\\n\t${waveSixProviderTest} \\\n`,
        );
    const acceptedMakefile = extractFastTestBlock(
      acceptedHttpMakefile,
    ).includes(waveSixPreviewTest)
      ? acceptedHttpMakefile
      : acceptedHttpMakefile.replace(
          "FINANCIAL_FAST_TESTS := \\\n",
          `FINANCIAL_FAST_TESTS := \\\n\t${waveSixPreviewTest} \\\n`,
        );
    const omittedProviderTest = acceptedMakefile
      .replace(`\t${waveSixProviderTest} \\\n`, "")
      .replace(`\t${waveSixProviderTest}\n`, "");
    const omittedPreviewTest = acceptedMakefile
      .replace(`\t${waveSixPreviewTest} \\\n`, "")
      .replace(`\t${waveSixPreviewTest}\n`, "");
    const numericFakeRest = `${fakeRestSource}\nconst amount_minor: number = Number(value.amount_minor);`;
    const floatingPreview = `${previewSource}\nMath.round(parseFloat("887.5"));`;
    const optionalHttp = acceptedMakefile.replace(
      "--run $(FINANCIAL_DATABASE_HTTP_TESTS)",
      "--run $(FINANCIAL_DATABASE_HTTP_TESTS) || true",
    );
    const replacementWorkflow = `${workflow}\n  replacement-lane:\n    name: financial / replacement-lane\n    if: github.event_name == 'merge_group'\n`;

    expect(
      waveSixCouplingErrors(
        acceptedPatterns,
        omittedProviderTest,
        numericFakeRest,
        fakeRestGenerator,
        previewSource,
        workflow,
      ),
    ).toEqual(
      expect.arrayContaining([
        `wave6-http-test:${waveSixProviderTest}`,
        "wave6-numeric-financial-authority",
      ]),
    );
    expect(
      waveSixCouplingErrors(
        acceptedPatterns,
        omittedPreviewTest,
        fakeRestSource,
        fakeRestGenerator,
        floatingPreview,
        workflow,
      ),
    ).toEqual(
      expect.arrayContaining([
        `wave6-fast-test:${waveSixPreviewTest}`,
        "wave6-numeric-financial-authority",
      ]),
    );
    expect(
      waveSixCouplingErrors(
        acceptedPatterns,
        optionalHttp,
        fakeRestSource,
        fakeRestGenerator,
        previewSource,
        replacementWorkflow,
      ),
    ).toEqual(
      expect.arrayContaining([
        "wave6-http-optional-or-replaced",
        "financial-workflow-identity-count",
      ]),
    );
  });

  it("closes the seven-plan exact-money matrix and protected hosted boundary", () => {
    expect(phaseThreeFinalAuditErrors()).toEqual([]);
  });

  it("detects final path, RPC, evidence, history, build, and promotion regressions", () => {
    const accepted = loadPhaseThreeFinalAuditSources();
    const missingPrimitive = accepted.makefile
      .replace(`\t${exactFinancialDatabaseTest} \\\n`, "")
      .replace(`\t${exactFinancialDatabaseTest}\n`, "");
    const weakenedRpc = accepted.exactMigration.replace(
      "CREATE OR REPLACE FUNCTION public.read_billing_invoices_exact(jsonb)\nRETURNS jsonb\nLANGUAGE plpgsql\nSTABLE\nSECURITY DEFINER",
      "CREATE OR REPLACE FUNCTION public.read_billing_invoices_exact(jsonb)\nRETURNS jsonb\nLANGUAGE plpgsql\nSTABLE",
    );
    const numericEvidence = weakenedRpc.replace(
      '\'{"amount_minor":"0","currency":"USD"}\'::jsonb',
      "1.00",
    );
    const nullableIssueDate = numericEvidence.replace(
      "  ALTER COLUMN issue_date SET NOT NULL,\n",
      "",
    );
    const relativeDateBoundary = nullableIssueDate.replace(
      "pg_catalog.to_char(parsed_date, 'YYYY-MM-DD') <> value_text",
      "value_text = ''",
    );
    const missingPlanSixPath =
      "src/components/atomic-crm/financial/exactProviderContract.test.ts";
    const mutatedBuild = `${accepted.releaseBuild}\n  - run: supabase db push\n`;
    const unverifiedPromotion = accepted.releasePromote.replaceAll(
      "verify-promotion-input.mjs",
      "verify-promotion-input-removed.mjs",
    );
    const mutatedEvidencePath =
      "supabase/migrations/20260901000004_billing_evidence_security.sql";

    expect(
      phaseThreeFinalAuditErrors({
        makefile: missingPrimitive,
        exactMigration: relativeDateBoundary,
        summaries: {
          ...accepted.summaries,
          "06": accepted.summaries["06"]!.replaceAll(
            missingPlanSixPath,
            "removed-provider-contract-path",
          ),
        },
        acceptedArtifacts: {
          ...accepted.acceptedArtifacts,
          [mutatedEvidencePath]: `${accepted.acceptedArtifacts[mutatedEvidencePath]}\n-- mutation`,
        },
        releaseBuild: mutatedBuild,
        releasePromote: unverifiedPromotion,
        workflowSources: {
          ...accepted.workflowSources,
          "release-build.yml": mutatedBuild,
          "release-promote.yml": unverifiedPromotion,
        },
      }),
    ).toEqual(
      expect.arrayContaining([
        `final-target-membership:${exactFinancialDatabaseTest}`,
        `plan-06-missing-owned-path:${missingPlanSixPath}`,
        "final-rpc-hardening:public.read_billing_invoices_exact(jsonb)",
        "final-evidence-exact-closure",
        "final-legacy-issue-date-closure",
        "final-canonical-invoice-date-boundary",
        `final-accepted-history:${mutatedEvidencePath}`,
        "release-build-production-mutation",
        "schema-mutation-workflow-set",
        "release-promote-predecessor-verification",
      ]),
    );
  });
});
