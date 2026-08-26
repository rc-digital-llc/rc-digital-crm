#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");
const baselinesRoot = path.join(repositoryRoot, "supabase/tests/baselines");
const cutoff = "20260825000001";
const companionFiles = [
  "schema.sql",
  "migration-history.sql",
  "fixtures.sql",
  "expected-fingerprints.json",
];
const fixtureCategories = [
  "fixed-identities-and-timestamps",
  "two-owners",
  "mutable-invoice-states",
  "null-and-orphan-edges",
  "numeric-boundaries",
  "non-ascii-text",
  "projects-and-analytics",
  "leads-and-attribution",
];
const fingerprintCategories = [
  "row_identity_counts",
  "ownership_foreign_keys",
  "invoice_numeric_text",
  "row_payload_hashes",
  "constraint_definitions",
  "grant_matrix",
  "queryability",
];

function executeProcess(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repositoryRoot,
      env: options.env ?? process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      resolve({ code: 127, stdout: "", stderr: error.message });
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sameArray(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertSafeBaseRef(baseRef) {
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(baseRef) ||
    baseRef.includes("..")
  ) {
    throw new Error("baseline base ref is invalid");
  }
}

function repositoryMigrationVersions() {
  return fs
    .readdirSync(path.join(repositoryRoot, "supabase/migrations"))
    .map((filename) => /^(\d{14})_/.exec(filename))
    .filter(Boolean)
    .map((match) => match[1])
    .filter((version) => version <= cutoff)
    .sort();
}

function assertFixtureSafety(fixtures) {
  for (const category of fixtureCategories) {
    if (!fixtures.includes(`-- fixture-category: ${category}`)) {
      throw new Error(`baseline fixtures omit category: ${category}`);
    }
  }
  const forbiddenPatterns = [
    /(?:api[_-]?key|secret|password|bearer|authorization)\s*[=:]\s*['"][^'"]+/i,
    /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]+\b/i,
    /\b(?:stripe|paypal|gocardless|postmark)[_-][A-Za-z0-9]+\b/i,
  ];
  if (forbiddenPatterns.some((pattern) => pattern.test(fixtures))) {
    throw new Error(
      "baseline fixtures contain credential or provider-like data",
    );
  }
  for (const match of fixtures.matchAll(/['"]([^'"\s]+@[^'"\s]+)['"]/g)) {
    const domain = match[1].split("@").at(-1).toLowerCase();
    if (!domain.endsWith(".example") && !domain.endsWith(".invalid")) {
      throw new Error("baseline fixture email is not on a reserved domain");
    }
  }
  for (const match of fixtures.matchAll(/https?:\/\/([^/'"\s]+)/g)) {
    const host = match[1].toLowerCase().replace(/:\d+$/, "");
    if (!host.endsWith(".example") && host !== "example.invalid") {
      throw new Error("baseline fixture URL is not on a reserved domain");
    }
  }
}

function assertExpectedFingerprints(expected, expectedFileHash, baselineId) {
  if (expected.version !== "1.0.0" || expected.baseline_id !== baselineId) {
    throw new Error("expected fingerprint identity is invalid");
  }
  if (
    !sameArray(
      Object.keys(expected.categories ?? {}).sort(),
      [...fingerprintCategories].sort(),
    )
  ) {
    throw new Error("expected fingerprint categories are incomplete");
  }
  for (const [category, digest] of Object.entries(expected.categories)) {
    if (!/^[0-9a-f]{64}$/.test(digest)) {
      throw new Error(`expected fingerprint ${category} is not SHA-256`);
    }
  }
  const categoriesHash = sha256(
    Buffer.from(JSON.stringify(expected.categories), "utf8"),
  );
  if (expected.categories_sha256 !== categoriesHash) {
    throw new Error("expected fingerprint category hash is invalid");
  }
  if (!/^[0-9a-f]{64}$/.test(expectedFileHash)) {
    throw new Error("expected fingerprint file hash is invalid");
  }
}

async function assertAppendOnly({ baselineDirectory, baseRef, execute }) {
  if (!baseRef) return;
  assertSafeBaseRef(baseRef);
  const relativeDirectory = path.relative(repositoryRoot, baselineDirectory);
  const refExists = await execute(
    "git",
    ["cat-file", "-e", `${baseRef}^{commit}`],
    {
      cwd: repositoryRoot,
    },
  );
  if (refExists.code !== 0) throw new Error("baseline base ref does not exist");
  const baselineExists = await execute(
    "git",
    ["cat-file", "-e", `${baseRef}:${relativeDirectory}/manifest.json`],
    { cwd: repositoryRoot },
  );
  if (baselineExists.code !== 0) return;
  const unchanged = await execute(
    "git",
    ["diff", "--quiet", baseRef, "--", relativeDirectory],
    { cwd: repositoryRoot },
  );
  if (unchanged.code !== 0) {
    throw new Error(
      "accepted baseline is immutable; add a new numbered baseline",
    );
  }
}

export async function verifyBaseline({
  baselineDirectory,
  baseRef,
  execute = executeProcess,
  enforceLocation = true,
}) {
  const absoluteDirectory = path.resolve(baselineDirectory);
  const baselineId = path.basename(absoluteDirectory);
  if (!/^\d{3}-[a-z0-9-]+$/.test(baselineId)) {
    throw new Error("baseline directory name is invalid");
  }
  if (
    enforceLocation &&
    path.dirname(absoluteDirectory) !== path.resolve(baselinesRoot)
  ) {
    throw new Error(
      "baseline directory is outside the repository baseline root",
    );
  }
  const manifest = JSON.parse(
    fs.readFileSync(path.join(absoluteDirectory, "manifest.json"), "utf8"),
  );
  if (
    manifest.version !== "1.0.0" ||
    manifest.baseline_id !== baselineId ||
    manifest.cutoff_migration !== cutoff ||
    manifest.schema_version !== "1.0.0"
  ) {
    throw new Error("baseline manifest identity or cutoff is invalid");
  }
  if (!sameArray(manifest.fixture_categories, fixtureCategories)) {
    throw new Error("baseline fixture categories are incomplete");
  }
  if (!sameArray(manifest.fingerprint_categories, fingerprintCategories)) {
    throw new Error("baseline fingerprint categories are incomplete");
  }
  const versions = repositoryMigrationVersions();
  if (
    manifest.migration_count !== versions.length ||
    !sameArray(manifest.migration_versions, versions)
  ) {
    throw new Error("baseline migration history does not match cutoff");
  }
  if (
    !sameArray(
      Object.keys(manifest.files ?? {}).sort(),
      [...companionFiles].sort(),
    )
  ) {
    throw new Error("baseline manifest file list is incomplete");
  }
  for (const filename of companionFiles) {
    const bytes = fs.readFileSync(path.join(absoluteDirectory, filename));
    if (sha256(bytes) !== manifest.files[filename]) {
      throw new Error(`baseline file hash mismatch: ${filename}`);
    }
  }

  const schemaSql = fs.readFileSync(
    path.join(absoluteDirectory, "schema.sql"),
    "utf8",
  );
  if (
    /(?:COPY|INSERT INTO|CREATE TABLE)\s+"?(?:auth|storage)"?\./i.test(
      schemaSql,
    )
  ) {
    throw new Error("baseline schema contains Auth or Storage data/objects");
  }
  const historySql = fs.readFileSync(
    path.join(absoluteDirectory, "migration-history.sql"),
    "utf8",
  );
  for (const version of versions) {
    if (!historySql.includes(`'${version}'`)) {
      throw new Error(`baseline migration history omits ${version}`);
    }
  }
  assertFixtureSafety(
    fs.readFileSync(path.join(absoluteDirectory, "fixtures.sql"), "utf8"),
  );
  const expectedBytes = fs.readFileSync(
    path.join(absoluteDirectory, "expected-fingerprints.json"),
  );
  assertExpectedFingerprints(
    JSON.parse(expectedBytes.toString("utf8")),
    sha256(expectedBytes),
    baselineId,
  );
  if (manifest.expected_fingerprints_sha256 !== sha256(expectedBytes)) {
    throw new Error("manifest expected fingerprint hash is invalid");
  }
  await assertAppendOnly({
    baselineDirectory: absoluteDirectory,
    baseRef,
    execute,
  });
  return {
    baseline_id: baselineId,
    cutoff_migration: cutoff,
    migration_count: versions.length,
    manifest_sha256: sha256(
      fs.readFileSync(path.join(absoluteDirectory, "manifest.json")),
    ),
  };
}

async function runSelfTest(baselineDirectory) {
  await verifyBaseline({ baselineDirectory });
  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "baseline-verifier-"),
  );
  try {
    const tamperedDirectory = path.join(temporaryRoot, "001-pre-financial");
    fs.cpSync(baselineDirectory, tamperedDirectory, { recursive: true });
    fs.appendFileSync(
      path.join(tamperedDirectory, "fixtures.sql"),
      "\n-- tampered\n",
    );
    let tamperRejected = false;
    try {
      await verifyBaseline({
        baselineDirectory: tamperedDirectory,
        enforceLocation: false,
      });
    } catch (error) {
      tamperRejected = /hash mismatch/i.test(String(error?.message));
    }
    if (!tamperRejected)
      throw new Error("baseline one-byte tamper was accepted");

    const changedExecute = async (_command, args) => {
      if (args[0] === "diff") return { code: 1, stdout: "", stderr: "" };
      return { code: 0, stdout: "", stderr: "" };
    };
    let coEditRejected = false;
    try {
      await verifyBaseline({
        baselineDirectory,
        baseRef: "origin/main",
        execute: changedExecute,
      });
    } catch (error) {
      coEditRejected = /immutable|new numbered/i.test(String(error?.message));
    }
    if (!coEditRejected)
      throw new Error("accepted baseline co-edit was allowed");

    const newDirectoryExecute = async (_command, args) => {
      if (args[0] === "cat-file" && String(args[2]).includes(":")) {
        return { code: 1, stdout: "", stderr: "path absent" };
      }
      return { code: 0, stdout: "", stderr: "" };
    };
    await verifyBaseline({
      baselineDirectory,
      baseRef: "origin/main",
      execute: newDirectoryExecute,
    });
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
  process.stdout.write("baseline verifier self-test: PASS\n");
}

async function main() {
  try {
    const baselineDirectory = process.argv[2];
    if (!baselineDirectory) {
      throw new Error(
        "usage: verify-baseline.mjs <baseline-directory> [--self-test|--base-ref <ref>]",
      );
    }
    if (process.argv[3] === "--self-test" && process.argv.length === 4) {
      await runSelfTest(baselineDirectory);
      return;
    }
    let baseRef;
    if (process.argv[3] === "--base-ref" && process.argv.length === 5) {
      baseRef = process.argv[4];
    } else if (process.argv.length !== 3) {
      throw new Error(
        "usage: verify-baseline.mjs <baseline-directory> [--self-test|--base-ref <ref>]",
      );
    }
    const result = await verifyBaseline({ baselineDirectory, baseRef });
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
