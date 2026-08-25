#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildCanonicalReceipt } from "./build-receipt.mjs";
import { verifyReceipt } from "./verify-receipt.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");
const sourceRepositories = new Set([
  "marmelab/atomic-crm",
  "rconman99/atomic-crm",
]);

function executeProcess(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repositoryRoot,
      env: options.env ?? process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };
    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("error", (error) => {
      finish({ code: 127, stdout: "", stderr: error.message });
    });
    child.on("close", (code) => {
      finish({
        code: code ?? 1,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 1000).unref();
      finish({ code: 124, stdout: "", stderr: "GitHub command timed out" });
    }, options.timeoutMs ?? 120000);
  });
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseJsonResult(result, description) {
  if (result.code !== 0) {
    throw new Error(`${description} failed with exit code ${result.code}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw new Error(`${description} did not return valid JSON`);
  }
}

function validateRepositoryName(repository) {
  if (!repository) throw new Error("RELEASE_EVIDENCE_REPOSITORY is required");
  if (/\$(?:\{[^}]+\}|[A-Za-z_][A-Za-z0-9_]*)/.test(repository)) {
    throw new Error("evidence repository contains an unresolved variable");
  }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error("evidence repository must use owner/name form");
  }
  if (sourceRepositories.has(repository.toLowerCase())) {
    throw new Error("a public source repository cannot store release evidence");
  }
}

async function fetchRepository(repository, execute) {
  const result = await execute("gh", ["api", `repos/${repository}`], {
    cwd: repositoryRoot,
    timeoutMs: 60000,
  });
  const response = parseJsonResult(
    result,
    "evidence repository visibility check",
  );
  if (String(response.visibility).toUpperCase() !== "PRIVATE") {
    throw new Error("authoritative evidence repository must be PRIVATE");
  }
  if (!Number.isSafeInteger(response.id)) {
    throw new Error(
      "evidence repository response omitted its numeric identity",
    );
  }
  return response;
}

async function fetchRelease(repository, tag, execute) {
  return execute("gh", ["api", `repos/${repository}/releases/tags/${tag}`], {
    cwd: repositoryRoot,
    timeoutMs: 60000,
  });
}

async function ensureRelease(repository, tag, execute) {
  let result = await fetchRelease(repository, tag, execute);
  if (result.code !== 0) {
    if (!/404|not found/i.test(`${result.stderr}\n${result.stdout}`)) {
      throw new Error(
        `evidence release lookup failed with exit code ${result.code}`,
      );
    }
    const created = await execute(
      "gh",
      [
        "release",
        "create",
        tag,
        "--repo",
        repository,
        "--title",
        `Release evidence ${tag.slice("evidence-".length, 20)}`,
        "--notes",
        "Immutable private release evidence. Public workflow logs are diagnostic only.",
      ],
      { cwd: repositoryRoot, timeoutMs: 60000 },
    );
    if (created.code !== 0) {
      throw new Error(
        `evidence release creation failed with exit code ${created.code}`,
      );
    }
    result = await fetchRelease(repository, tag, execute);
  }
  const release = parseJsonResult(result, "evidence release lookup");
  if (!Number.isSafeInteger(release.id) || !Array.isArray(release.assets)) {
    throw new Error("evidence release response is incomplete");
  }
  return release;
}

function contentAddressedAsset({ localPath, name, kind }) {
  if (!localPath || !fs.statSync(localPath).isFile()) {
    throw new Error(`${kind} evidence file is required`);
  }
  const bytes = fs.readFileSync(localPath);
  return { localPath, name, kind, bytes, sha256: sha256(bytes) };
}

function extensionFor(localPath) {
  const extension = path.extname(localPath).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(extension) ? extension : ".bin";
}

function buildAssets(
  receiptPath,
  attestationPaths,
  reportPaths,
  receipt,
  receiptId,
) {
  if (!attestationPaths?.length) {
    throw new Error("at least one attestation evidence file is required");
  }
  if (!reportPaths?.length) {
    throw new Error("at least one redacted report evidence file is required");
  }
  const prefix = `${receipt.commit_sha}.${receipt.stage}`;
  const receiptAsset = contentAddressedAsset({
    localPath: receiptPath,
    name: `${prefix}.${receiptId}.receipt.json`,
    kind: "receipt",
  });
  const attestations = attestationPaths.map((localPath) => {
    const bytes = fs.readFileSync(localPath);
    const digest = sha256(bytes);
    return contentAddressedAsset({
      localPath,
      name: `${prefix}.${digest}.attestation${extensionFor(localPath)}`,
      kind: "attestation",
    });
  });
  const reports = reportPaths.map((localPath) => {
    const bytes = fs.readFileSync(localPath);
    const digest = sha256(bytes);
    return contentAddressedAsset({
      localPath,
      name: `${prefix}.${digest}.report${extensionFor(localPath)}`,
      kind: "report",
    });
  });
  const assets = [receiptAsset, ...attestations, ...reports];
  if (new Set(assets.map(({ name }) => name)).size !== assets.length) {
    throw new Error("evidence asset names are not unique");
  }
  return assets;
}

async function downloadAsset(repository, assetId, execute) {
  const result = await execute(
    "gh",
    [
      "api",
      `repos/${repository}/releases/assets/${assetId}`,
      "-H",
      "Accept: application/octet-stream",
    ],
    { cwd: repositoryRoot, timeoutMs: 60000 },
  );
  if (result.code !== 0) {
    throw new Error(
      `authenticated evidence readback failed with exit code ${result.code}`,
    );
  }
  return Buffer.from(result.stdout, "utf8");
}

async function assertExistingAssetsImmutable(
  repository,
  release,
  assets,
  execute,
) {
  for (const localAsset of assets) {
    const existing = release.assets.find(
      ({ name }) => name === localAsset.name,
    );
    if (!existing) continue;
    const readback = await downloadAsset(repository, existing.id, execute);
    if (sha256(readback) !== localAsset.sha256) {
      throw new Error(
        `existing asset mismatch for immutable ${localAsset.kind} evidence`,
      );
    }
  }
}

async function uploadMissingAssets(repository, tag, release, assets, execute) {
  for (const asset of assets) {
    if (release.assets.some(({ name }) => name === asset.name)) continue;
    const result = await execute(
      "gh",
      ["release", "upload", tag, asset.uploadPath, "--repo", repository],
      { cwd: repositoryRoot, timeoutMs: 120000 },
    );
    if (result.code !== 0) {
      throw new Error(
        `private evidence upload failed with exit code ${result.code}`,
      );
    }
  }
}

function stageAssetsForUpload(assets) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "release-assets-"));
  for (const asset of assets) {
    asset.uploadPath = path.join(directory, asset.name);
    fs.copyFileSync(
      asset.localPath,
      asset.uploadPath,
      fs.constants.COPYFILE_EXCL,
    );
  }
  return directory;
}

export async function publishEvidence({
  repository,
  receiptPath,
  predecessorReceipt,
  attestationPaths,
  reportPaths,
  authenticatedOwner,
  now = new Date(),
  execute = executeProcess,
}) {
  validateRepositoryName(repository);
  const repositoryInfo = await fetchRepository(repository, execute);

  const receiptBytes = fs.readFileSync(receiptPath);
  const sourceText = receiptBytes.toString("utf8");
  const receipt = JSON.parse(sourceText);
  const filenameMatch = /^([0-9a-f]{64})\.receipt\.json$/.exec(
    path.basename(receiptPath),
  );
  if (!filenameMatch)
    throw new Error("receipt filename is not content-addressed");
  const verified = verifyReceipt(receipt, {
    authenticatedOwner,
    expectedReceiptId: filenameMatch[1],
    now,
    predecessorReceipt,
    sourceText,
  });
  const assets = buildAssets(
    receiptPath,
    attestationPaths,
    reportPaths,
    receipt,
    verified.receiptId,
  );
  const tag = `evidence-${receipt.commit_sha}`;
  let release = await ensureRelease(repository, tag, execute);
  await assertExistingAssetsImmutable(repository, release, assets, execute);
  const uploadDirectory = stageAssetsForUpload(assets);
  try {
    await uploadMissingAssets(repository, tag, release, assets, execute);
    release = parseJsonResult(
      await fetchRelease(repository, tag, execute),
      "evidence release readback lookup",
    );
  } finally {
    fs.rmSync(uploadDirectory, { recursive: true, force: true });
  }
  const receiptAsset = assets.find(({ kind }) => kind === "receipt");
  const uploadedReceipt = release.assets.find(
    ({ name }) => name === receiptAsset.name,
  );
  if (!uploadedReceipt) throw new Error("uploaded receipt asset is missing");
  const readback = await downloadAsset(repository, uploadedReceipt.id, execute);
  if (
    !readback.equals(receiptBytes) ||
    sha256(readback) !== verified.receiptId
  ) {
    throw new Error("authenticated receipt readback bytes or digest mismatch");
  }

  return {
    receipt_id: verified.receiptId,
    destination_id: sha256(Buffer.from(repository.toLowerCase())).slice(0, 12),
    report_hashes: assets
      .filter(({ kind }) => kind === "report")
      .map(({ sha256: digest }) => digest)
      .sort(),
    evidence_url: `https://api.github.com/repositories/${repositoryInfo.id}/releases/assets/${uploadedReceipt.id}`,
    readback: "verified",
  };
}

function selfTestReceipt(now) {
  const hashA = "a".repeat(64);
  const checks = [
    "check / lint",
    "check / typecheck",
    "check / unit",
    "check / build",
    "financial / migration-clean",
    "financial / migration-upgrade",
    "financial / database-contracts",
    "financial / edge-provider-contracts",
    "financial / replay-concurrency",
    "financial / release-security",
  ].map((identity) => ({ identity, result: "success" }));
  return buildCanonicalReceipt(
    {
      schema_version: "1.0.0",
      policy_version: "1.0.0",
      stage: "schema",
      predecessor: null,
      commit_sha: "1".repeat(40),
      artifact_digests: {
        manifest_sha256: hashA,
        artifacts: [{ name: "artifact", sha256: hashA }],
      },
      migration_range: {
        from: null,
        to: "20260825000001",
        hashes: [{ name: "migration", sha256: hashA }],
      },
      required_checks: checks,
      report_hashes: { tests: hashA, security: hashA },
      target_environment: { name: "test", provider_target: "self-test" },
      feature_flag_state: { feature: null, state: "disabled" },
      approvals: [
        {
          actor: "self-test-owner",
          role: "release-owner",
          approved_at: "2026-08-25T19:55:00.000Z",
          deployment_id: "self-test-deployment",
        },
      ],
      timestamps: {
        created_at: "2026-08-25T19:50:00.000Z",
        verified_at: "2026-08-25T19:59:00.000Z",
      },
      exceptions: [],
      rollback_references: ["runbook://self-test"],
      attestation: {
        provider: "github_oidc",
        subject_digest: hashA,
        reference: "self-test-attestation",
      },
    },
    { authenticatedOwner: "self-test-owner", now },
  );
}

async function runSelfTest() {
  const now = new Date("2026-08-25T20:00:00.000Z");
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "evidence-self-test-"),
  );
  try {
    const built = selfTestReceipt(now);
    const receiptPath = path.join(directory, `${built.receiptId}.receipt.json`);
    const attestationPath = path.join(directory, "attestation.json");
    const reportPath = path.join(directory, "report.json");
    fs.writeFileSync(receiptPath, built.canonicalJson, "utf8");
    fs.writeFileSync(attestationPath, '{"attestation":"synthetic"}\n', "utf8");
    fs.writeFileSync(reportPath, '{"report":"redacted"}\n', "utf8");

    const assets = [];
    const bytesById = new Map();
    let nextId = 100;
    let uploadCount = 0;
    const execute = async (_command, args) => {
      if (args[0] === "api" && args[1] === "repos/private/self-test") {
        return {
          code: 0,
          stdout: JSON.stringify({ id: 42, visibility: "PRIVATE" }),
          stderr: "",
        };
      }
      if (args[0] === "api" && args[1] === "repos/public/self-test") {
        return {
          code: 0,
          stdout: JSON.stringify({ id: 43, visibility: "PUBLIC" }),
          stderr: "",
        };
      }
      if (args[0] === "api" && args[1].includes("/releases/tags/")) {
        return {
          code: 0,
          stdout: JSON.stringify({ id: 84, assets }),
          stderr: "",
        };
      }
      if (args[0] === "release" && args[1] === "upload") {
        uploadCount += 1;
        const localPath = args[3];
        const name = path.basename(localPath);
        const id = nextId++;
        const bytes = fs.readFileSync(localPath, "utf8");
        assets.push({ id, name });
        bytesById.set(id, bytes);
        return { code: 0, stdout: "", stderr: "" };
      }
      if (args[0] === "api" && args[1].includes("/releases/assets/")) {
        const id = Number(args[1].split("/").at(-1));
        return { code: 0, stdout: bytesById.get(id), stderr: "" };
      }
      return { code: 1, stdout: "", stderr: "unexpected self-test call" };
    };
    const result = await publishEvidence({
      repository: "private/self-test",
      receiptPath,
      attestationPaths: [attestationPath],
      reportPaths: [reportPath],
      authenticatedOwner: "self-test-owner",
      now,
      execute,
    });
    if (
      result.receipt_id !== built.receiptId ||
      result.readback !== "verified"
    ) {
      throw new Error("private evidence self-test verification failed");
    }
    const firstUploadCount = uploadCount;
    await publishEvidence({
      repository: "private/self-test",
      receiptPath,
      attestationPaths: [attestationPath],
      reportPaths: [reportPath],
      authenticatedOwner: "self-test-owner",
      now,
      execute,
    });
    if (uploadCount !== firstUploadCount) {
      throw new Error("private evidence self-test found a clobber path");
    }

    let privacyRejected = false;
    try {
      await publishEvidence({
        repository: "public/self-test",
        receiptPath,
        attestationPaths: [attestationPath],
        reportPaths: [reportPath],
        authenticatedOwner: "self-test-owner",
        now,
        execute,
      });
    } catch (error) {
      privacyRejected = /private/i.test(String(error?.message));
    }
    if (!privacyRejected || uploadCount !== firstUploadCount) {
      throw new Error("private evidence self-test privacy guard failed");
    }

    const receiptAsset = assets.find(({ name }) =>
      name.endsWith(".receipt.json"),
    );
    bytesById.set(receiptAsset.id, "tampered");
    let tamperRejected = false;
    try {
      await publishEvidence({
        repository: "private/self-test",
        receiptPath,
        attestationPaths: [attestationPath],
        reportPaths: [reportPath],
        authenticatedOwner: "self-test-owner",
        now,
        execute,
      });
    } catch (error) {
      tamperRejected = /mismatch/i.test(String(error?.message));
    }
    if (!tamperRejected || uploadCount !== firstUploadCount) {
      throw new Error("private evidence self-test tamper guard failed");
    }
    process.stdout.write("private evidence publisher self-test: PASS\n");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

async function main() {
  try {
    if (process.argv[2] === "--self-test" && process.argv.length === 3) {
      await runSelfTest();
      return;
    }
    const receiptPath = process.argv[2];
    const attestationPath = process.argv[3];
    const reportPaths = process.argv.slice(4);
    if (!receiptPath || !attestationPath || reportPaths.length === 0) {
      throw new Error(
        "usage: publish-evidence.mjs <receipt> <attestation> <redacted-report...>",
      );
    }
    const predecessorReceipt = process.env.RELEASE_PREDECESSOR_RECEIPT
      ? JSON.parse(
          fs.readFileSync(process.env.RELEASE_PREDECESSOR_RECEIPT, "utf8"),
        )
      : undefined;
    const result = await publishEvidence({
      repository: process.env.RELEASE_EVIDENCE_REPOSITORY,
      receiptPath,
      predecessorReceipt,
      attestationPaths: [attestationPath],
      reportPaths,
      authenticatedOwner: process.env.RELEASE_AUTHENTICATED_OWNER,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
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
