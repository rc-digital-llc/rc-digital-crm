#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { verifyReceipt } from "./verify-receipt.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");
const policy = JSON.parse(
  fs.readFileSync(
    path.join(repositoryRoot, ".github/release/release-policy.json"),
    "utf8",
  ),
);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function ghApi(endpoint, { binary = false } = {}) {
  const result = spawnSync(
    "gh",
    [
      "api",
      endpoint,
      "-H",
      binary
        ? "Accept: application/octet-stream"
        : "Accept: application/vnd.github+json",
      "-H",
      "X-GitHub-Api-Version: 2022-11-28",
    ],
    {
      cwd: repositoryRoot,
      encoding: binary ? null : "utf8",
      shell: false,
      maxBuffer: 64 * 1024 * 1024,
      timeout: 60000,
    },
  );
  if (result.status !== 0) {
    throw new Error(
      `private evidence API request failed with status ${result.status}`,
    );
  }
  if (binary) return result.stdout;
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error("private evidence API response was not JSON");
  }
}

function requireRepository() {
  const repository = process.env.RELEASE_EVIDENCE_REPOSITORY;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? "")) {
    throw new Error(
      "RELEASE_EVIDENCE_REPOSITORY is required in owner/name form",
    );
  }
  const info = ghApi(`repos/${repository}`);
  if (String(info.visibility).toUpperCase() !== "PRIVATE") {
    throw new Error("authoritative evidence repository must be PRIVATE");
  }
  return repository;
}

function listReleases(repository) {
  const releases = [];
  for (let page = 1; page <= 10; page += 1) {
    const batch = ghApi(
      `repos/${repository}/releases?per_page=100&page=${page}`,
    );
    if (!Array.isArray(batch)) {
      throw new Error("evidence release list is invalid");
    }
    releases.push(...batch);
    if (batch.length < 100) return releases;
  }
  throw new Error("evidence release pagination exceeded the bounded limit");
}

function listAssets(repository, releaseId) {
  const assets = [];
  for (let page = 1; page <= 10; page += 1) {
    const batch = ghApi(
      `repos/${repository}/releases/${releaseId}/assets?per_page=100&page=${page}`,
    );
    if (!Array.isArray(batch)) {
      throw new Error("evidence asset list is invalid");
    }
    assets.push(...batch);
    if (batch.length < 100) return assets;
  }
  throw new Error("evidence asset pagination exceeded the bounded limit");
}

function download(repository, asset, outputPath) {
  const bytes = ghApi(`repos/${repository}/releases/assets/${asset.id}`, {
    binary: true,
  });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, bytes, { mode: 0o600 });
  return bytes;
}

function findUniqueAsset(assets, predicate, description) {
  const matches = assets.filter(predicate);
  if (matches.length !== 1) {
    throw new Error(`${description} must resolve to exactly one private asset`);
  }
  return matches[0];
}

function verifyArtifactAttestation(artifactPath) {
  const sourceRepository = process.env.GITHUB_REPOSITORY;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(sourceRepository ?? "")) {
    throw new Error(
      "GITHUB_REPOSITORY is required for attestation verification",
    );
  }
  const result = spawnSync(
    "gh",
    ["attestation", "verify", artifactPath, "--repo", sourceRepository],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      shell: false,
      timeout: 60000,
    },
  );
  if (result.status !== 0) {
    throw new Error(
      `GitHub attestation verification failed for ${path.basename(artifactPath)}`,
    );
  }
}

export function expectedPredecessorStage(stage) {
  const index = policy.stage_order.indexOf(stage);
  if (index <= 0) throw new Error("promotion stage is invalid");
  return policy.stage_order[index - 1];
}

async function main() {
  try {
    const [evidenceId, outputDirectory, nextStage] = process.argv.slice(2);
    if (
      !/^[0-9a-f]{64}$/.test(evidenceId ?? "") ||
      !outputDirectory ||
      !["schema", "functions", "frontend", "dormant", "enable"].includes(
        nextStage,
      ) ||
      process.argv.length !== 5
    ) {
      throw new Error(
        "usage: fetch-private-evidence.mjs <predecessor-receipt-id> <output-directory> <schema|functions|frontend|dormant|enable>",
      );
    }
    const authenticatedOwner = process.env.RELEASE_AUTHENTICATED_OWNER;
    if (!authenticatedOwner) {
      throw new Error("RELEASE_AUTHENTICATED_OWNER is required");
    }
    const repository = requireRepository();
    let evidenceRelease;
    let releaseAssets;
    for (const release of listReleases(repository)) {
      const assets = listAssets(repository, release.id);
      if (
        assets.some(({ name }) => name.endsWith(`.${evidenceId}.receipt.json`))
      ) {
        evidenceRelease = release;
        releaseAssets = assets;
        break;
      }
    }
    if (!evidenceRelease || !releaseAssets) {
      throw new Error("predecessor receipt is not present in private evidence");
    }
    const outputRoot = path.resolve(outputDirectory);
    const receiptDirectory = path.join(outputRoot, "receipts");
    const receipts = [];
    let currentId = evidenceId;
    while (currentId) {
      const asset = findUniqueAsset(
        releaseAssets,
        ({ name }) => name.endsWith(`.${currentId}.receipt.json`),
        `receipt ${currentId}`,
      );
      const receiptPath = path.join(
        receiptDirectory,
        `${currentId}.receipt.json`,
      );
      const bytes = download(repository, asset, receiptPath);
      if (sha256(bytes) !== currentId) {
        throw new Error("receipt readback digest mismatch");
      }
      const receipt = JSON.parse(bytes.toString("utf8"));
      receipts.push({ id: currentId, receipt, path: receiptPath });
      currentId = receipt.predecessor?.receipt_id ?? null;
      if (receipts.length > policy.stage_order.length) {
        throw new Error("receipt chain exceeds policy stage count");
      }
    }
    receipts.reverse();
    for (let index = 0; index < receipts.length; index += 1) {
      const current = receipts[index];
      verifyReceipt(current.receipt, {
        authenticatedOwner,
        expectedReceiptId: current.id,
        predecessorReceipt: receipts[index - 1]?.receipt,
        sourceText: fs.readFileSync(current.path, "utf8"),
      });
    }
    const predecessor = receipts.at(-1);
    if (predecessor.receipt.stage !== expectedPredecessorStage(nextStage)) {
      throw new Error(`${nextStage} promotion has the wrong predecessor stage`);
    }
    const build = receipts[0];
    if (build.receipt.stage !== "build") {
      throw new Error("receipt chain has no build root");
    }
    if (evidenceRelease.tag_name !== `evidence-${build.receipt.commit_sha}`) {
      throw new Error("evidence release tag differs from receipt commit");
    }
    const artifactDirectory = path.join(outputRoot, "artifacts");
    const artifactPaths = {};
    for (const artifact of build.receipt.artifact_digests.artifacts) {
      const asset = findUniqueAsset(
        releaseAssets,
        ({ name }) => name.includes(`.${artifact.sha256}.artifact`),
        `artifact ${artifact.name}`,
      );
      const artifactPath = path.join(artifactDirectory, artifact.name);
      const bytes = download(repository, asset, artifactPath);
      if (sha256(bytes) !== artifact.sha256) {
        throw new Error(`artifact digest mismatch: ${artifact.name}`);
      }
      verifyArtifactAttestation(artifactPath);
      artifactPaths[artifact.name] = artifactPath;
    }
    const result = {
      evidence_id: evidenceId,
      commit_sha: build.receipt.commit_sha,
      manifest_sha256: build.receipt.artifact_digests.manifest_sha256,
      build_receipt_path: build.path,
      predecessor_receipt_path: predecessor.path,
      prior_receipt_path: receipts.at(-2)?.path ?? null,
      stage: nextStage,
      artifacts: artifactPaths,
    };
    const resultPath = path.join(outputRoot, "fetch-result.json");
    fs.mkdirSync(outputRoot, { recursive: true });
    fs.writeFileSync(
      resultPath,
      `${JSON.stringify(result, null, 2)}\n`,
      "utf8",
    );
    process.stdout.write(
      `${JSON.stringify({ ...result, result_path: resultPath })}\n`,
    );
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
