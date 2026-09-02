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
  "04ac927167db448f5480a718f504be16a64b929bc40eac49770ed4e4592d8ce1";

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
  if (!["history", "current"].includes(mode)) {
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
    throw new Error(
      "Gitleaks exact-fingerprint set differs from reviewed policy",
    );
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
    .sort((left, right) => left.fingerprint.localeCompare(right.fingerprint));
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

export function assertDependencyAudit(audit) {
  const counts = audit?.metadata?.vulnerabilities;
  if (!counts || typeof counts !== "object") {
    throw new Error("dependencies audit omitted vulnerability counts");
  }
  const critical = Number(counts.critical ?? 0);
  const high = Number(counts.high ?? 0);
  const summary = {
    critical,
    high,
    report_sha256: sha256(JSON.stringify({ critical, high })),
  };
  if (critical > 0 || high > 0) {
    throw new Error(
      `dependencies blocked critical=${critical} high=${high} ` +
        `report_sha256=${summary.report_sha256}`,
    );
  }
  return summary;
}

const bundleSecretMarkers = [
  ["supabase_service_role", /\bSUPABASE_SERVICE_ROLE_KEY\b/i],
  ["supabase_access_token", /\bSUPABASE_ACCESS_TOKEN\b/i],
  ["supabase_secret_key", /\bSB_SECRET_KEY\b/i],
  ["postmark_webhook_password", /\bPOSTMARK_WEBHOOK_PASSWORD\s*[:=]/i],
  ["private_key", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/i],
];

function walkRegularFiles(root) {
  const pending = [root];
  const files = [];
  while (pending.length > 0) {
    const current = pending.pop();
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) {
      throw new Error(
        `bundle symlink is forbidden: ${path.relative(root, current)}`,
      );
    }
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(current)) {
        pending.push(path.join(current, entry));
      }
    } else if (stat.isFile()) {
      files.push(current);
    }
  }
  return files.sort();
}

export function scanBundleTree(bundleRoot) {
  if (!fs.existsSync(bundleRoot) || !fs.statSync(bundleRoot).isDirectory()) {
    throw new Error("bundle output directory is missing");
  }
  const files = walkRegularFiles(bundleRoot);
  const sourceMaps = files
    .filter((file) => file.endsWith(".map"))
    .map((file) => path.relative(bundleRoot, file));
  if (sourceMaps.length > 0) {
    throw new Error(
      `bundle blocked source_map paths=${JSON.stringify(sourceMaps)}`,
    );
  }

  const markerFindings = [];
  const digest = createHash("sha256");
  for (const file of files) {
    const relativePath = path.relative(bundleRoot, file);
    const content = fs.readFileSync(file);
    digest.update(relativePath);
    digest.update("\0");
    digest.update(content);
    if (content.includes(0)) continue;
    const textContent = content.toString("utf8");
    for (const [marker, pattern] of bundleSecretMarkers) {
      if (pattern.test(textContent)) {
        markerFindings.push({ marker, path: relativePath });
      }
    }
  }
  if (markerFindings.length > 0) {
    throw new Error(
      `bundle blocked secret_marker identifiers=${JSON.stringify(markerFindings)}`,
    );
  }
  return {
    file_count: files.length,
    report_sha256: digest.digest("hex"),
  };
}

export function assertWorkflowDecoupled(workflowText, workflowPath) {
  const automaticMain =
    /(?:^|\n)\s*(?:on:|["']on["']:)\s*[\s\S]*?\bpush\s*:/m.test(workflowText) &&
    /\bmain\b/.test(workflowText);
  const powers = {
    database_push: /\bsupabase\s+db\s+push\b/.test(workflowText),
    function_deploy: /\bsupabase\s+functions\s+deploy\b/.test(workflowText),
    frontend_build: /\b(?:npm\s+run\s+build(?::[\w-]+)?|make\s+build)\b/.test(
      workflowText,
    ),
    publish:
      /\b(?:gh-pages|ghpages:deploy|vercel\s+deploy|pages\s+deploy)\b/.test(
        workflowText,
      ),
  };
  if (automaticMain && Object.values(powers).every(Boolean)) {
    throw new Error(
      `coupling blocked workflow=${workflowPath} powers=${JSON.stringify(
        Object.keys(powers),
      )}`,
    );
  }
  return { workflow: workflowPath, automatic_main: automaticMain, powers };
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
      throw new Error(
        `tracked snapshot accepts regular files only: ${relativePath}`,
      );
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
        failures.push(
          error instanceof Error ? error.message : "secret scan failed",
        );
      }
    }
    if (failures.length > 0) throw new Error(failures.join("; "));
    return results;
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

export async function runDependencyGate({ execute = executeProcess } = {}) {
  const result = await execute(
    "npm",
    ["audit", "--omit=dev", "--audit-level=high", "--json"],
    { cwd: repositoryRoot, timeoutMs: 120000 },
  );
  let audit;
  try {
    audit = JSON.parse(result.stdout);
  } catch {
    throw new Error("dependencies audit did not return valid JSON");
  }
  const summary = assertDependencyAudit(audit);
  if (result.code !== 0) {
    throw new Error(
      `dependencies audit failed with exit code ${result.code} ` +
        `report_sha256=${summary.report_sha256}`,
    );
  }
  return { mode: "dependencies", status: "pass", ...summary };
}

export async function runBundleGate({ execute = executeProcess } = {}) {
  const build = await execute("npm", ["run", "build"], {
    cwd: repositoryRoot,
    timeoutMs: 300000,
  });
  if (build.code !== 0) {
    throw new Error(
      `bundle production build failed with exit code ${build.code}`,
    );
  }
  const summary = scanBundleTree(path.join(repositoryRoot, "dist"));
  return { mode: "bundle", status: "pass", ...summary };
}

export function runExistingBundleGate() {
  const summary = scanBundleTree(path.join(repositoryRoot, "dist"));
  return { mode: "bundle-existing", status: "pass", ...summary };
}

export function runCouplingGate() {
  const workflowDirectory = path.join(repositoryRoot, ".github/workflows");
  const workflowNames = fs
    .readdirSync(workflowDirectory)
    .filter((name) => /\.ya?ml$/i.test(name))
    .sort();
  const summaries = workflowNames.map((name) =>
    assertWorkflowDecoupled(
      fs.readFileSync(path.join(workflowDirectory, name), "utf8"),
      `.github/workflows/${name}`,
    ),
  );
  return {
    mode: "coupling",
    status: "pass",
    workflow_count: summaries.length,
    report_sha256: sha256(JSON.stringify(summaries)),
  };
}

async function runNamedGate(mode) {
  if (mode === "dependencies") return [await runDependencyGate()];
  if (mode === "secrets") {
    return (await runSecretScans()).map((summary) => ({
      ...summary,
      mode: `secrets-${summary.mode}`,
    }));
  }
  if (mode === "bundle") return [await runBundleGate()];
  if (mode === "bundle-existing") return [runExistingBundleGate()];
  if (mode === "coupling") return [runCouplingGate()];
  throw new Error(
    "usage: security-gate.mjs dependencies|secrets|bundle|bundle-existing|coupling|all",
  );
}

export async function runAllGates() {
  const results = [];
  const failures = [];
  for (const mode of ["dependencies", "secrets", "bundle", "coupling"]) {
    try {
      results.push(...(await runNamedGate(mode)));
    } catch (error) {
      failures.push(
        `${mode}: ${error instanceof Error ? error.message : "gate failed"}`,
      );
    }
  }
  if (failures.length > 0) throw new Error(failures.join("; "));
  return results;
}

async function main() {
  try {
    const mode = process.argv[2];
    const results =
      mode === "all" ? await runAllGates() : await runNamedGate(mode);
    for (const result of results) {
      process.stdout.write(`${JSON.stringify(result)}\n`);
    }
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
