#!/usr/bin/env node

import assert from "node:assert/strict";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const sourcePort = 4179;
const sourceBaseUrl = `http://127.0.0.1:${sourcePort}`;
const maximumCapturedOutput = 1024 * 1024;
const allowedRuntimeDirtyPaths = new Set([".planning/config.json"]);
const isAllowedRuntimePath = (relativePath) =>
  allowedRuntimeDirtyPaths.has(relativePath) ||
  relativePath === "artifacts/surface/phase-04-source.json" ||
  relativePath.startsWith("artifacts/surface/phase-04-source-screenshots/");

export const redactOutput = (value) =>
  String(value)
    .replace(
      /\b(authorization\s*:\s*(?:bearer|basic)\s+)[^\s"']+/gi,
      "$1[REDACTED]",
    )
    .replace(
      /([?&](?:access_token|token|key|secret|password)=)[^&\s"']+/gi,
      "$1[REDACTED]",
    )
    .replace(/https?:\/\/[^/@\s]+@/gi, "https://[REDACTED]@")
    .replace(
      /\b((?:password|secret|token|api[_-]?key)\s*[=:]\s*)[^\s,"']+/gi,
      "$1[REDACTED]",
    );

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const appendBounded = (current, chunk) =>
  `${current}${chunk}`.slice(-maximumCapturedOutput);

const deterministicDemoEnvironment = () => ({
  ...Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith("VITE_")),
  ),
  VITE_SUPABASE_URL: "https://demo.example.org",
  VITE_SB_PUBLISHABLE_KEY: "https://demo.example.org",
});

const runBuffered = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      env: deterministicDemoEnvironment(),
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout = appendBounded(stdout, chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr = appendBounded(stderr, chunk);
    });
    child.once("error", reject);
    child.once("close", (code, signal) =>
      resolve({ code: code ?? 1, signal, stdout, stderr }),
    );
  });

const waitForReady = async (server, timeoutMilliseconds = 30_000) => {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error("demo source server exited before readiness");
    }
    try {
      const response = await fetch(`${sourceBaseUrl}/billing_accounts`, {
        redirect: "manual",
      });
      if (response.status === 200) return;
    } catch {
      // The bounded readiness loop retries connection startup only.
    }
    await delay(250);
  }
  throw new Error("demo source server readiness timed out");
};

const terminateChild = async (child) => {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([once(child, "exit"), delay(3_000)]);
  if (child.exitCode === null) {
    child.kill("SIGKILL");
    await Promise.race([once(child, "exit"), delay(2_000)]);
  }
};

export const parseRunArguments = (argv) => {
  const values = new Map();
  const allowed = new Set([
    "--stage",
    "--contract",
    "--receipt",
    "--screenshots",
  ]);
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index];
    const value = argv[index + 1];
    if (!allowed.has(option) || !value || value.startsWith("--")) {
      throw new Error(`invalid or incomplete option: ${option ?? "missing"}`);
    }
    if (values.has(option)) throw new Error(`repeated option: ${option}`);
    values.set(option, value);
  }
  for (const option of allowed) {
    if (!values.has(option))
      throw new Error(`missing required option: ${option}`);
  }
  if (values.get("--stage") !== "source") {
    throw new Error("the local source runner accepts only --stage source");
  }
  return {
    stage: values.get("--stage"),
    contract: path.resolve(repositoryRoot, values.get("--contract")),
    receipt: path.resolve(repositoryRoot, values.get("--receipt")),
    screenshots: path.resolve(repositoryRoot, values.get("--screenshots")),
  };
};

const gateArguments = (options) => {
  const buildGateRoot =
    process.env.BUILD_GATE_ROOT ??
    path.join(os.homedir(), ".agents", "skills", "build-gate");
  return [
    path.join(buildGateRoot, "scripts", "surface_gate.py"),
    "--base-url",
    sourceBaseUrl,
    "--contract",
    options.contract,
    "--stage",
    options.stage,
    "--receipt",
    options.receipt,
    "--screenshots",
    options.screenshots,
    "--json",
  ];
};

const resolveImplementationHead = async () => {
  const head = await runBuffered("git", ["rev-parse", "HEAD"]);
  if (head.code !== 0 || !/^[0-9a-f]{40}\n?$/.test(head.stdout)) {
    throw new Error(
      "source surface could not resolve an exact implementation head",
    );
  }
  const dirty = await runBuffered("git", [
    "status",
    "--porcelain",
    "--untracked-files=all",
  ]);
  if (dirty.code !== 0) {
    throw new Error("source surface could not verify the implementation tree");
  }
  const unexpected = dirty.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.slice(3))
    .filter((relativePath) => !isAllowedRuntimePath(relativePath));
  if (unexpected.length > 0) {
    throw new Error(
      `source surface requires committed implementation files: ${unexpected[0]}`,
    );
  }
  return head.stdout.trim();
};

const appendImplementationProvenance = (receiptPath, implementationHead) => {
  const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
  receipt.implementation_head = implementationHead;
  receipt.implementation_head_marker = `phase-04-agreement-close@${implementationHead}`;
  receipt.implementation_tree = "committed-except-runtime-config";
  fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, {
    mode: 0o600,
  });
};

const runSource = async (options) => {
  const implementationHead = await resolveImplementationHead();
  const build = await runBuffered("npm", ["run", "build:demo"]);
  if (build.code !== 0) {
    process.stderr.write(redactOutput(build.stderr || build.stdout));
    throw new Error(`demo source build failed with exit code ${build.code}`);
  }

  let server;
  let serverOutput = "";
  try {
    server = spawn(
      "npm",
      [
        "run",
        "preview",
        "--",
        "--host",
        "127.0.0.1",
        "--port",
        String(sourcePort),
        "--strictPort",
      ],
      {
        cwd: repositoryRoot,
        env: deterministicDemoEnvironment(),
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    server.stdout.on("data", (chunk) => {
      serverOutput = appendBounded(serverOutput, chunk);
    });
    server.stderr.on("data", (chunk) => {
      serverOutput = appendBounded(serverOutput, chunk);
    });
    await waitForReady(server);

    const gate = await runBuffered("python3", gateArguments(options));
    if (gate.stdout) process.stdout.write(redactOutput(gate.stdout));
    if (gate.stderr) process.stderr.write(redactOutput(gate.stderr));
    if (gate.code === 0) {
      appendImplementationProvenance(options.receipt, implementationHead);
    }
    return gate.code;
  } catch (error) {
    if (serverOutput) process.stderr.write(redactOutput(serverOutput));
    throw error;
  } finally {
    await terminateChild(server);
  }
};

const runSelfTest = () => {
  const redacted = redactOutput(
    "Authorization: Bearer example-value token=example-value https://user:pass@example.test",
  );
  assert.doesNotMatch(redacted, /example-value|user:pass/);
  const parsed = parseRunArguments([
    "--stage",
    "source",
    "--contract",
    "qa/billing-accounts.surface.source.json",
    "--receipt",
    ".planning/evidence/02/source/receipt.json",
    "--screenshots",
    ".planning/evidence/02/source/screenshots",
  ]);
  assert.equal(parsed.stage, "source");
  assert.match(gateArguments(parsed)[0], /surface_gate\.py$/);
  assert.throws(
    () => parseRunArguments(["--stage", "preview"]),
    /invalid|missing|source/,
  );
  process.stdout.write(
    `${JSON.stringify({ self_test: "pass", base_url: sourceBaseUrl })}\n`,
  );
};

const main = async () => {
  if (process.argv.length === 3 && process.argv[2] === "--self-test") {
    runSelfTest();
    return 0;
  }
  if (process.argv.length === 2) {
    return runSource({
      stage: "source",
      contract: path.resolve(
        repositoryRoot,
        "qa/billing-accounts.surface.source.json",
      ),
      receipt: path.resolve(
        repositoryRoot,
        "artifacts/surface/phase-04-source.json",
      ),
      screenshots: path.resolve(
        repositoryRoot,
        "artifacts/surface/phase-04-source-screenshots",
      ),
    });
  }
  if (process.argv[2] !== "run") {
    throw new Error(
      "usage: run-billing-source-surface.mjs --self-test | run --stage source --contract <path> --receipt <path> --screenshots <path>",
    );
  }
  return runSource(parseRunArguments(process.argv.slice(3)));
};

try {
  process.exitCode = await main();
} catch (error) {
  process.stderr.write(`FAIL: ${redactOutput(error?.message ?? error)}\n`);
  process.exitCode = 2;
}
