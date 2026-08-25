#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");
const expectedIgnoreEntriesHash =
  "6689e4a4903edb95758676fa7ddf8d5aca72a477fb62850753388dd689512487";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

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
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      finish({ code: 127, stdout: "", stderr: error.message });
    });
    child.on("close", (code) => {
      finish({ code: code ?? 1, stdout, stderr });
    });
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 1000).unref();
      finish({ code: 124, stdout: "", stderr: "scanner timed out" });
    }, options.timeoutMs ?? 180000);
  });
}

export function buildGitleaksArgs({
  mode,
  target,
  reportPath,
  configPath,
  ignorePath,
}) {
  if (!['history', 'current'].includes(mode)) {
    throw new Error(`unsupported Gitleaks mode: ${mode}`);
  }
  return [
    mode === "history" ? "git" : "dir",
    "--redact=100",
    "--no-banner",
    "--no-color",
    "--log-level",
    "error",
    "--config",
    configPath,
    "--gitleaks-ignore-path",
    ignorePath,
    "--report-format",
    "json",
    "--report-path",
    reportPath,
    target,
  ];
}

export function validateGitleaksConfig(configText) {
  if (/\[\[?\s*allowlists?\b/i.test(configText)) {
    throw new Error(
      "Gitleaks allowlists are forbidden; use reviewed exact fingerprints only",
    );
  }
  if (!/\[extend\][\s\S]*useDefault\s*=\s*true/i.test(configText)) {
    throw new Error("Gitleaks configuration must extend the default rules");
  }
}

export function validateGitleaksIgnore(ignoreText) {
  const entries = ignoreText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .sort();
  for (const entry of entries) {
    if (!/^(?:[a-f0-9]{40}:)?[^:\n]+:[a-z0-9-]+:\d+$/.test(entry)) {
      throw new Error("Gitleaks ignore file contains a non-fingerprint entry");
    }
  }
  if (sha256(entries.join("\n")) !== expectedIgnoreEntriesHash) {
    throw new Error("Gitleaks exact-fingerprint set differs from reviewed policy");
  }
  return entries;
}

export function summarizeFindings(findings) {
  const redactedFindings = findings
    .map((finding) => ({
      rule_id: String(finding.RuleID ?? "unknown"),
      file: String(finding.File ?? "unknown"),
      commit: String(finding.Commit ?? ""),
      fingerprint: String(finding.Fingerprint ?? "unknown"),
    }))
    .sort((left, right) =>
      left.fingerprint.localeCompare(right.fingerprint),
    );
  return {
    finding_count: redactedFindings.length,
    findings: redactedFindings,
    report_sha256: sha256(JSON.stringify(redactedFindings)),
  };
}

export function assertSecretScanResult({ mode, exitCode, findings }) {
  const summary = summarizeFindings(findings);
  if (findings.length > 0) {
    const rotationId = sha256(
      `${mode}\n${summary.report_sha256}\n${summary.findings
        .map((finding) => finding.fingerprint)
        .join("\n")}`,
    );
    throw new Error(
      `${mode} secret scan blocked findings=${summary.finding_count} ` +
        `report_sha256=${summary.report_sha256} rotation_required=${rotationId} ` +
        `identifiers=${JSON.stringify(summary.findings)}`,
    );
  }
  if (exitCode !== 0) {
    throw new Error(`${mode} secret scanner failed with exit code ${exitCode}`);
  }
  return summary;
}

function readFindings(reportPath) {
  if (!fs.existsSync(reportPath) || fs.statSync(reportPath).size === 0) {
    return [];
  }
  const parsed = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  if (!Array.isArray(parsed)) {
    throw new Error("Gitleaks report must be a JSON array");
  }
  return parsed;
}

async function createTrackedSnapshot(snapshotRoot, execute) {
  const listed = await execute("git", ["ls-files", "-z", "--cached"], {
    cwd: repositoryRoot,
    timeoutMs: 30000,
  });
  if (listed.code !== 0) {
    throw new Error("could not enumerate the tracked current tree");
  }
  const files = listed.stdout.split("\0").filter(Boolean);
  for (const relativePath of files) {
    const source = path.resolve(repositoryRoot, relativePath);
    const destination = path.resolve(snapshotRoot, relativePath);
    if (
      !source.startsWith(`${repositoryRoot}${path.sep}`) ||
      !destination.startsWith(`${snapshotRoot}${path.sep}`)
    ) {
      throw new Error("tracked snapshot path escaped its root");
    }
    if (!fs.existsSync(source)) continue;
    const stat = fs.lstatSync(source);
    if (!stat.isFile()) {
      throw new Error(`tracked snapshot accepts regular files only: ${relativePath}`);
    }
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
  }
}

export async function runSecretScans({ execute = executeProcess } = {}) {
  const configPath = path.join(repositoryRoot, ".gitleaks.toml");
  const ignorePath = path.join(repositoryRoot, ".gitleaksignore");
  validateGitleaksConfig(fs.readFileSync(configPath, "utf8"));
  validateGitleaksIgnore(fs.readFileSync(ignorePath, "utf8"));

  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "rc-digital-release-secrets-"),
  );
  const snapshotRoot = path.join(temporaryRoot, "tracked-current-tree");
  fs.mkdirSync(snapshotRoot);
  try {
    await createTrackedSnapshot(snapshotRoot, execute);
    const scans = [
      { mode: "history", target: repositoryRoot, cwd: repositoryRoot },
      { mode: "current", target: ".", cwd: snapshotRoot },
    ];
    const results = [];
    const failures = [];
    for (const scan of scans) {
      const reportPath = path.join(temporaryRoot, `${scan.mode}.json`);
      const result = await execute(
        "gitleaks",
        buildGitleaksArgs({
          ...scan,
          reportPath,
          configPath,
          ignorePath,
        }),
        { cwd: scan.cwd, timeoutMs: 180000 },
      );
      const findings = readFindings(reportPath);
      try {
        const summary = assertSecretScanResult({
          mode: scan.mode,
          exitCode: result.code,
          findings,
        });
        results.push({ mode: scan.mode, status: "pass", ...summary });
      } catch (error) {
        failures.push(error instanceof Error ? error.message : "secret scan failed");
      }
    }
    if (failures.length > 0) throw new Error(failures.join("; "));
    return results;
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

async function main() {
  try {
    const mode = process.argv[2];
    if (mode !== "secrets") {
      throw new Error(
        "usage: security-gate.mjs secrets (additional release modes are added by Plan 01-07 Task 3)",
      );
    }
    const results = await runSecretScans();
    for (const result of results) {
      process.stdout.write(`${JSON.stringify(result)}\n`);
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "error"}\n`);
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
