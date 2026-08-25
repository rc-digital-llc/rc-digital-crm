import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(__dirname, "../..");
const releaseDirectory = path.join(repositoryRoot, ".github/release");

const fastChecks = [
  "check / lint",
  "check / typecheck",
  "check / unit",
  "check / build",
];

const financialChecks = [
  "financial / migration-clean",
  "financial / migration-upgrade",
  "financial / database-contracts",
  "financial / edge-provider-contracts",
  "financial / replay-concurrency",
  "financial / release-security",
];

const nonOverridableFailures = [
  "migration_clean",
  "migration_upgrade",
  "authorization",
  "secret_exposure",
  "production_source_maps",
  "replay_concurrency",
  "provider_contract",
  "critical_high_production_vulnerability",
];

const receiptFields = [
  "schema_version",
  "commit_sha",
  "artifact_digests",
  "migration_range",
  "required_checks",
  "report_hashes",
  "target_environment",
  "feature_flag_state",
  "approvals",
  "timestamps",
  "exceptions",
  "rollback_references",
  "attestation",
];

function readJson(filename: string): Record<string, unknown> {
  return JSON.parse(
    fs.readFileSync(path.join(releaseDirectory, filename), "utf-8"),
  ) as Record<string, unknown>;
}

function policyErrors(policy: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const checks = policy.required_checks as Record<string, unknown> | undefined;
  const exceptions = policy.exceptions as Record<string, unknown> | undefined;
  const retries = policy.retries as Record<string, unknown> | undefined;
  const evidence = policy.evidence as Record<string, unknown> | undefined;

  if (JSON.stringify(checks?.fast) !== JSON.stringify(fastChecks)) {
    errors.push("required_checks.fast");
  }
  if (JSON.stringify(checks?.financial) !== JSON.stringify(financialChecks)) {
    errors.push("required_checks.financial");
  }
  if (
    JSON.stringify(policy.stage_order) !==
    JSON.stringify(["schema", "functions", "frontend", "dormant", "enable"])
  ) {
    errors.push("stage_order");
  }
  if (
    JSON.stringify(policy.non_overridable_failures) !==
    JSON.stringify(nonOverridableFailures)
  ) {
    errors.push("non_overridable_failures");
  }
  if (exceptions?.max_exception_days !== 7) {
    errors.push("exceptions.max_exception_days");
  }
  if (
    JSON.stringify(exceptions?.allowed_classes) !==
    JSON.stringify(["unrelated_nonfinancial", "classified_infrastructure"])
  ) {
    errors.push("exceptions.allowed_classes");
  }
  if (
    JSON.stringify(exceptions?.required_fields) !==
    JSON.stringify([
      "authenticated_owner",
      "linked_issue",
      "affected_scope",
      "rationale",
      "compensating_controls",
      "expires_at",
    ])
  ) {
    errors.push("exceptions.required_fields");
  }
  if (retries?.assertion !== 0 || retries?.bootstrap !== 1) {
    errors.push("retries");
  }
  if (evidence?.authoritative_visibility !== "PRIVATE") {
    errors.push("evidence.authoritative_visibility");
  }

  return errors;
}

describe("financial release path ownership", () => {
  const paths = readJson("financial-paths.json");

  it("classifies every release-sensitive path", () => {
    expect(paths.financial_paths).toEqual(
      expect.arrayContaining([
        "supabase/migrations/**",
        "supabase/functions/**",
        "supabase/tests/**",
        "tests/release/**",
        "scripts/release/**",
        "package.json",
        "package-lock.json",
        "vite.config.ts",
        ".github/release/**",
        ".github/workflows/financial-*.yml",
        ".github/workflows/release-*.yml",
      ]),
    );
  });
});

describe("financial release policy", () => {
  const policy = readJson("release-policy.json");

  it("accepts the locked release contract", () => {
    expect(policyErrors(policy)).toEqual([]);
  });

  it("rejects a missing or renamed required lane", () => {
    const candidate = structuredClone(policy);
    const checks = candidate.required_checks as Record<string, unknown>;
    checks.financial = financialChecks.slice(1);
    expect(policyErrors(candidate)).toContain("required_checks.financial");
  });

  it("rejects an unsafe stage order", () => {
    const candidate = structuredClone(policy);
    candidate.stage_order = [
      "functions",
      "schema",
      "frontend",
      "dormant",
      "enable",
    ];
    expect(policyErrors(candidate)).toContain("stage_order");
  });

  it("rejects overlong or incomplete exception scope", () => {
    const candidate = structuredClone(policy);
    const exceptions = candidate.exceptions as Record<string, unknown>;
    exceptions.max_exception_days = 8;
    exceptions.required_fields = ["authenticated_owner", "expires_at"];
    expect(policyErrors(candidate)).toEqual(
      expect.arrayContaining([
        "exceptions.max_exception_days",
        "exceptions.required_fields",
      ]),
    );
  });

  it("does not expose any waiver or ignore field", () => {
    expect(JSON.stringify(policy)).not.toMatch(
      /"(?:allow|allowed|ignore|waive|override)_(?:failure|gate|check)s?"/i,
    );
  });
});

describe("release receipt schema", () => {
  const schema = readJson("release-receipt.schema.json");

  it("uses Draft 2020-12 and requires every release receipt field", () => {
    expect(schema.$schema).toBe(
      "https://json-schema.org/draft/2020-12/schema",
    );
    expect(schema.required).toEqual(receiptFields);
  });

  it.each(receiptFields)("rejects a receipt missing %s", (field) => {
    const completeReceipt = Object.fromEntries(
      receiptFields.map((requiredField) => [requiredField, true]),
    );
    delete completeReceipt[field];
    const missing = (schema.required as string[]).filter(
      (requiredField) => !(requiredField in completeReceipt),
    );
    expect(missing).toContain(field);
  });

  it("closes security-sensitive objects to undeclared properties", () => {
    const properties = schema.properties as Record<
      string,
      Record<string, unknown>
    >;
    for (const field of [
      "artifact_digests",
      "migration_range",
      "report_hashes",
      "target_environment",
      "feature_flag_state",
      "timestamps",
      "attestation",
    ]) {
      expect(properties[field]?.additionalProperties, field).toBe(false);
    }
    for (const field of ["required_checks", "approvals", "exceptions"]) {
      expect(
        (properties[field]?.items as Record<string, unknown>)
          ?.additionalProperties,
        field,
      ).toBe(false);
    }
  });
});
