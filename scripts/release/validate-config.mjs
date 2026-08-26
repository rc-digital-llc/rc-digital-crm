#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");
const releaseDirectory = path.join(repositoryRoot, ".github/release");

const expected = Object.freeze({
  fastChecks: [
    "check / lint",
    "check / typecheck",
    "check / unit",
    "check / build",
  ],
  financialChecks: [
    "financial / migration-clean",
    "financial / migration-upgrade",
    "financial / database-contracts",
    "financial / edge-provider-contracts",
    "financial / replay-concurrency",
    "financial / release-security",
  ],
  stages: ["build", "schema", "functions", "frontend", "dormant", "enable"],
  nonOverridable: [
    "migration_clean",
    "migration_upgrade",
    "authorization",
    "secret_exposure",
    "production_source_maps",
    "replay_concurrency",
    "provider_contract",
    "critical_high_production_vulnerability",
  ],
  exceptionClasses: ["unrelated_nonfinancial", "classified_infrastructure"],
  exceptionFields: [
    "authenticated_owner",
    "linked_issue",
    "affected_scope",
    "rationale",
    "compensating_controls",
    "expires_at",
  ],
  receiptFields: [
    "schema_version",
    "policy_version",
    "stage",
    "predecessor",
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
  ],
  paths: [
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
  ],
});

function readJson(filename) {
  const absolutePath = path.join(releaseDirectory, filename);
  try {
    return JSON.parse(fs.readFileSync(absolutePath, "utf-8"));
  } catch {
    throw new Error(`invalid release configuration: ${filename}`);
  }
}

function sameArray(actual, wanted) {
  return JSON.stringify(actual) === JSON.stringify(wanted);
}

function hasDuplicates(values) {
  return Array.isArray(values) && new Set(values).size !== values.length;
}

export function validateReleaseConfiguration({ paths, policy, schema }) {
  const errors = [];
  const add = (condition, field) => {
    if (!condition) errors.push(field);
  };

  add(paths?.version === "1.0.0", "financial-paths.version");
  add(
    sameArray(paths?.financial_paths, expected.paths),
    "financial-paths.financial_paths",
  );
  add(
    !hasDuplicates(paths?.financial_paths),
    "financial-paths.financial_paths.duplicates",
  );

  add(policy?.version === "1.0.0", "release-policy.version");
  add(
    policy?.receipt_schema_version === "1.0.0",
    "release-policy.receipt_schema_version",
  );
  add(
    sameArray(policy?.required_checks?.fast, expected.fastChecks),
    "release-policy.required_checks.fast",
  );
  add(
    sameArray(policy?.required_checks?.financial, expected.financialChecks),
    "release-policy.required_checks.financial",
  );
  add(
    !hasDuplicates(policy?.required_checks?.financial),
    "release-policy.required_checks.financial.duplicates",
  );
  add(
    sameArray(policy?.stage_order, expected.stages),
    "release-policy.stage_order",
  );
  add(
    sameArray(policy?.non_overridable_failures, expected.nonOverridable),
    "release-policy.non_overridable_failures",
  );
  add(
    sameArray(policy?.exceptions?.allowed_classes, expected.exceptionClasses),
    "release-policy.exceptions.allowed_classes",
  );
  add(
    sameArray(policy?.exceptions?.required_fields, expected.exceptionFields),
    "release-policy.exceptions.required_fields",
  );
  add(
    policy?.exceptions?.max_exception_days === 7,
    "release-policy.exceptions.max_exception_days",
  );
  add(
    policy?.exceptions?.expired_action === "block",
    "release-policy.exceptions.expired_action",
  );
  add(policy?.retries?.assertion === 0, "release-policy.retries.assertion");
  add(policy?.retries?.bootstrap === 1, "release-policy.retries.bootstrap");
  add(
    policy?.evidence?.authoritative_visibility === "PRIVATE",
    "release-policy.evidence.authoritative_visibility",
  );

  add(
    schema?.$schema === "https://json-schema.org/draft/2020-12/schema",
    "release-receipt.$schema",
  );
  add(schema?.type === "object", "release-receipt.type");
  add(
    schema?.additionalProperties === false,
    "release-receipt.additionalProperties",
  );
  add(
    sameArray(schema?.required, expected.receiptFields),
    "release-receipt.required",
  );

  return errors;
}

function loadCommittedConfiguration() {
  return {
    paths: readJson("financial-paths.json"),
    policy: readJson("release-policy.json"),
    schema: readJson("release-receipt.schema.json"),
  };
}

function runSelfTest() {
  const committed = loadCommittedConfiguration();
  const validErrors = validateReleaseConfiguration(committed);
  if (validErrors.length > 0) throw new Error("valid configuration rejected");

  const missingLane = structuredClone(committed);
  missingLane.policy.required_checks.financial.pop();
  if (
    !validateReleaseConfiguration(missingLane).includes(
      "release-policy.required_checks.financial",
    )
  ) {
    throw new Error("missing lane accepted");
  }

  const longException = structuredClone(committed);
  longException.policy.exceptions.max_exception_days = 8;
  if (
    !validateReleaseConfiguration(longException).includes(
      "release-policy.exceptions.max_exception_days",
    )
  ) {
    throw new Error("overlong exception accepted");
  }
}

function main() {
  const mode = process.argv[2] ?? "--check";
  try {
    if (mode === "--self-test") {
      runSelfTest();
      process.stdout.write("release configuration self-test: PASS\n");
      return;
    }
    if (mode !== "--check") {
      throw new Error("usage: validate-config.mjs [--check|--self-test]");
    }
    const errors = validateReleaseConfiguration(loadCommittedConfiguration());
    if (errors.length > 0) {
      process.stderr.write(
        `release configuration invalid: ${errors.join(", ")}\n`,
      );
      process.exitCode = 1;
      return;
    }
    process.stdout.write("release configuration: PASS\n");
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : "error"}\n`,
    );
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
