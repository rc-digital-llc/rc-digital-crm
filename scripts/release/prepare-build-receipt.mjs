#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function readJson(filename) {
  return JSON.parse(fs.readFileSync(filename, "utf8"));
}

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function prepareBuildReceiptInput({
  artifactManifestPath,
  checksPath,
  securityReportPath,
  attestationReference,
  outputPath,
  now = new Date(),
}) {
  const artifactManifest = readJson(artifactManifestPath);
  const checks = readJson(checksPath);
  const migrationsManifestPath = path.join(
    path.dirname(artifactManifestPath),
    "migrations.manifest.json",
  );
  const migrationsManifest = readJson(migrationsManifestPath);
  const commitSha = requiredEnvironment("RELEASE_COMMIT_SHA");
  if (
    artifactManifest.commit_sha !== commitSha ||
    checks.commit_sha !== commitSha
  ) {
    throw new Error("release evidence commit identity mismatch");
  }
  if (!Array.isArray(checks.checks) || checks.checks.length === 0) {
    throw new Error("required check evidence is empty");
  }
  const migrationHashes = migrationsManifest.files.map(
    ({ name, sha256: digest }) => ({
      name,
      sha256: digest,
    }),
  );
  const migrationVersions = migrationHashes
    .map(({ name }) => path.basename(name).match(/^(\d+)_/)?.[1])
    .filter(Boolean)
    .sort();
  if (migrationVersions.length === 0) {
    throw new Error("migration manifest has no versioned SQL migration");
  }
  const createdAt = now.toISOString();
  const actor = requiredEnvironment("RELEASE_AUTHENTICATED_OWNER");
  const input = {
    schema_version: "1.0.0",
    policy_version: "1.0.0",
    stage: "build",
    predecessor: null,
    commit_sha: commitSha,
    artifact_digests: {
      manifest_sha256: sha256(fs.readFileSync(artifactManifestPath)),
      artifacts: [
        ...artifactManifest.artifacts,
        {
          name: path.basename(artifactManifestPath),
          sha256: sha256(fs.readFileSync(artifactManifestPath)),
        },
      ],
    },
    migration_range: {
      from: null,
      to: migrationVersions.at(-1),
      hashes: migrationHashes,
    },
    required_checks: checks.checks,
    report_hashes: {
      tests: sha256(fs.readFileSync(checksPath)),
      security: sha256(fs.readFileSync(securityReportPath)),
    },
    target_environment: {
      name: "production",
      provider_target: requiredEnvironment("RELEASE_PROVIDER_TARGET"),
    },
    feature_flag_state: { feature: null, state: "disabled" },
    approvals: [
      {
        actor,
        role: "release-owner",
        approved_at: createdAt,
        deployment_id: requiredEnvironment("GITHUB_RUN_ID"),
      },
    ],
    timestamps: { created_at: createdAt, verified_at: createdAt },
    exceptions: [],
    rollback_references: [
      "docs/runbooks/financial-rollback.md#build-artifacts",
    ],
    attestation: {
      provider: "github_oidc",
      subject_digest: sha256(fs.readFileSync(artifactManifestPath)),
      reference: attestationReference,
    },
  };
  fs.writeFileSync(outputPath, `${JSON.stringify(input, null, 2)}\n`, "utf8");
  return input;
}

async function main() {
  try {
    const [
      artifactManifestPath,
      checksPath,
      securityReportPath,
      attestationReference,
      outputPath,
    ] = process.argv.slice(2);
    if (
      !artifactManifestPath ||
      !checksPath ||
      !securityReportPath ||
      !attestationReference ||
      !outputPath ||
      process.argv.length !== 7
    ) {
      throw new Error(
        "usage: prepare-build-receipt.mjs <artifact-manifest> <checks> <security-report> <attestation-reference> <output.json>",
      );
    }
    prepareBuildReceiptInput({
      artifactManifestPath,
      checksPath,
      securityReportPath,
      attestationReference,
      outputPath,
    });
    process.stdout.write(`${JSON.stringify({ output: outputPath })}\n`);
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
  await main();
}
