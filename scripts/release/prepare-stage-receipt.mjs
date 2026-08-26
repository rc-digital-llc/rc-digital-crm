#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { computeReceiptId } from "./verify-receipt.mjs";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function prepareStageReceiptInput({
  predecessorPath,
  stage,
  postStatePath,
  attestationReference,
  outputPath,
  now = new Date(),
}) {
  const predecessor = JSON.parse(fs.readFileSync(predecessorPath, "utf8"));
  const timestamp = now.toISOString();
  const actor = requiredEnvironment("RELEASE_AUTHENTICATED_OWNER");
  const feature = process.env.RELEASE_FEATURE || null;
  const input = {
    ...predecessor,
    stage,
    predecessor: {
      stage: predecessor.stage,
      receipt_id: computeReceiptId(predecessor),
      subject_digest: predecessor.attestation.subject_digest,
    },
    feature_flag_state:
      stage === "dormant"
        ? { feature, state: "dormant" }
        : predecessor.feature_flag_state,
    approvals: [
      {
        actor,
        role: "release-owner",
        approved_at: timestamp,
        deployment_id: requiredEnvironment("GITHUB_RUN_ID"),
      },
    ],
    timestamps: { created_at: timestamp, verified_at: timestamp },
    exceptions: [],
    rollback_references: [
      `docs/runbooks/financial-rollback.md#${stage}-rollback`,
    ],
    report_hashes: {
      ...predecessor.report_hashes,
      tests: sha256(fs.readFileSync(postStatePath)),
    },
    attestation: {
      provider: "github_oidc",
      subject_digest: predecessor.artifact_digests.manifest_sha256,
      reference: attestationReference,
    },
  };
  fs.writeFileSync(outputPath, `${JSON.stringify(input, null, 2)}\n`, "utf8");
  return input;
}

async function main() {
  try {
    const [
      predecessorPath,
      stage,
      postStatePath,
      attestationReference,
      outputPath,
    ] = process.argv.slice(2);
    if (
      !predecessorPath ||
      !["schema", "functions", "frontend", "dormant", "enable"].includes(
        stage,
      ) ||
      !postStatePath ||
      !attestationReference ||
      !outputPath ||
      process.argv.length !== 7
    ) {
      throw new Error(
        "usage: prepare-stage-receipt.mjs <predecessor-receipt> <stage> <post-state> <attestation-reference> <output.json>",
      );
    }
    prepareStageReceiptInput({
      predecessorPath,
      stage,
      postStatePath,
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
