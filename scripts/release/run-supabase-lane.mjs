#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");
const policyPath = path.join(
  repositoryRoot,
  ".github/release/release-policy.json",
);
const supabaseConfigPath = path.join(repositoryRoot, "supabase/config.toml");
const databaseFixturePath = path.join(
  repositoryRoot,
  "supabase/tests/support/auth-fixtures.sql",
);
const functionFixturePath = path.join(
  repositoryRoot,
  "supabase/tests/fixtures/functions.env",
);

const retryableBootstrapPatterns = [
  /docker (?:daemon|engine).*not running/i,
  /cannot connect to the docker daemon/i,
  /address already in use/i,
  /port is already allocated/i,
  /container .*unhealthy/i,
  /health(?:check| check).*fail/i,
  /connection refused/i,
];

const localKeys = new Map([
  ["API_URL", "SUPABASE_URL"],
  ["ANON_KEY", "SUPABASE_ANON_KEY"],
  ["DB_URL", "SUPABASE_DB_URL"],
  ["STUDIO_URL", "SUPABASE_STUDIO_URL"],
  ["INBUCKET_URL", "SUPABASE_INBUCKET_URL"],
]);

function isoNow() {
  return new Date().toISOString();
}

export function redactText(value, secrets = []) {
  let redacted = String(value ?? "");
  for (const secret of secrets.filter(Boolean)) {
    redacted = redacted.split(String(secret)).join("[REDACTED]");
  }
  return redacted
    .replace(
      /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
      "[REDACTED_JWT]",
    )
    .replace(/((?:key|token|secret|password)\s*[=:]\s*)\S+/gi, "$1[REDACTED]");
}

export function classifyBootstrapFailure(result) {
  const detail = `${result?.stderr ?? ""}\n${result?.stdout ?? ""}`;
  return retryableBootstrapPatterns.some((pattern) => pattern.test(detail))
    ? "classified_environment_bootstrap"
    : "unclassified_bootstrap";
}

function executeProcess(command, args, options = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };
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
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 1000).unref();
      finish({
        code: 124,
        stdout,
        stderr: `${stderr}\nprocess exceeded ${options.timeoutMs ?? 300000}ms`,
      });
    }, options.timeoutMs ?? 300000);
    child.on("error", (error) => {
      finish({ code: 127, stdout, stderr: error.message });
    });
    child.on("close", (code) => {
      finish({ code: code ?? 1, stdout, stderr });
    });
  });
}

function startFunctionRuntime() {
  const child = spawn(
    "supabase",
    ["functions", "serve", "--env-file", functionFixturePath],
    {
      cwd: repositoryRoot,
      env: process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  let settled = false;
  const ready = new Promise((resolve) => {
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };
    const inspect = (chunk) => {
      output += chunk.toString();
      if (/Serving functions on http:\/\/127\.0\.0\.1:/i.test(output)) {
        finish({ code: 0, stdout: "", stderr: "" });
      }
    };
    child.stdout.on("data", inspect);
    child.stderr.on("data", inspect);
    child.on("error", () => {
      finish({ code: 127, stdout: "", stderr: "function runtime failed" });
    });
    child.on("close", (code) => {
      finish({
        code: code ?? 1,
        stdout: "",
        stderr: "function runtime exited before readiness",
      });
    });
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      finish({
        code: 124,
        stdout: "",
        stderr: "function runtime readiness timed out",
      });
    }, 60000);
  });
  return { child, ready };
}

function stopFunctionRuntime(runtime) {
  if (!runtime || runtime.child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      runtime.child.kill("SIGKILL");
      resolve();
    }, 5000);
    runtime.child.once("close", () => {
      clearTimeout(timeout);
      resolve();
    });
    runtime.child.kill("SIGTERM");
  });
}

function loadLaneNames() {
  const policy = JSON.parse(fs.readFileSync(policyPath, "utf-8"));
  return policy.required_checks.financial.map((identity) =>
    identity.replace(/^financial \/ /, ""),
  );
}

function localProjectId() {
  const config = fs.readFileSync(supabaseConfigPath, "utf8");
  const match = /^project_id\s*=\s*"([A-Za-z0-9_-]+)"/m.exec(config);
  if (!match) throw new Error("local Supabase project identifier is missing");
  return match[1];
}

async function loadDatabaseContractFixtures(execute) {
  const projectId = localProjectId();
  const container = `supabase_db_${projectId}`;
  const containerPath = "/tmp/rc-auth-fixtures.sql";
  const copied = await execute(
    "docker",
    ["cp", databaseFixturePath, `${container}:${containerPath}`],
    { cwd: repositoryRoot, timeoutMs: 60000 },
  );
  if (copied.code !== 0) return copied;
  return execute(
    "docker",
    [
      "exec",
      container,
      "psql",
      "-X",
      "-q",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "--file",
      containerPath,
    ],
    { cwd: repositoryRoot, timeoutMs: 120000 },
  );
}

function assertSafeCommand(command) {
  if (!Array.isArray(command) || command.length === 0) {
    throw new Error("a command argv is required after --");
  }
  if (/\s/.test(command[0])) {
    throw new Error("command executable must be a single argv value");
  }
  if (["sh", "bash", "zsh", "fish"].includes(path.basename(command[0]))) {
    throw new Error("shell interpreters are not accepted as lane commands");
  }
}

function parseStatus(stdout) {
  let status;
  try {
    status = JSON.parse(stdout);
  } catch {
    throw new Error("local Supabase status was not valid JSON");
  }
  const environment = {};
  const secrets = [];
  for (const [source, target] of localKeys) {
    const value = status[source];
    if (typeof value === "string" && value.length > 0) {
      environment[target] = value;
      if (source.includes("KEY") || source.includes("URL")) secrets.push(value);
    }
  }
  if (!environment.SUPABASE_URL || !environment.SUPABASE_DB_URL) {
    throw new Error("local Supabase status omitted required local URLs");
  }
  return { environment, secrets };
}

async function stopStack(execute) {
  return execute("supabase", ["stop", "--no-backup"], {
    cwd: repositoryRoot,
  });
}

async function bootstrap(execute, attempt) {
  const startedAt = isoNow();
  const start = await execute("supabase", ["start"], { cwd: repositoryRoot });
  if (start.code !== 0) {
    return {
      ok: false,
      attempt,
      startedAt,
      finishedAt: isoNow(),
      classification: classifyBootstrapFailure(start),
      result: start,
    };
  }
  const status = await execute("supabase", ["status", "-o", "json"], {
    cwd: repositoryRoot,
  });
  if (status.code !== 0) {
    return {
      ok: false,
      attempt,
      startedAt,
      finishedAt: isoNow(),
      classification: classifyBootstrapFailure(status),
      result: status,
    };
  }
  try {
    return {
      ok: true,
      attempt,
      startedAt,
      finishedAt: isoNow(),
      ...parseStatus(status.stdout),
    };
  } catch (error) {
    return {
      ok: false,
      attempt,
      startedAt,
      finishedAt: isoNow(),
      classification: "unclassified_bootstrap",
      result: { code: 1, stdout: "", stderr: error.message },
    };
  }
}

export async function runLane({ lane, command, execute = executeProcess }) {
  assertSafeCommand(command);
  if (!loadLaneNames().includes(lane)) {
    throw new Error(`unknown financial lane: ${lane}`);
  }

  const bootstrapAttempts = [];
  let result = { code: 1, stdout: "", stderr: "lane did not execute" };
  let secrets = [];
  let cleanupResult;
  let assertionAttempts = 0;
  let functionRuntime;
  try {
    await stopStack(execute);
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const boot = await bootstrap(execute, attempt);
      bootstrapAttempts.push({
        attempt: boot.attempt,
        started_at: boot.startedAt,
        finished_at: boot.finishedAt,
        classification: boot.ok ? "success" : boot.classification,
      });
      if (boot.ok) {
        secrets = boot.secrets;
        if (lane === "database-contracts") {
          const fixtures = await loadDatabaseContractFixtures(execute);
          if (fixtures.code !== 0) {
            result = fixtures;
            break;
          }
        }
        if (lane === "edge-provider-contracts") {
          functionRuntime = startFunctionRuntime();
          const runtimeReady = await functionRuntime.ready;
          if (runtimeReady.code !== 0) {
            result = runtimeReady;
            break;
          }
        }
        assertionAttempts = 1;
        result = await execute(command[0], command.slice(1), {
          cwd: repositoryRoot,
          env: { ...process.env, ...boot.environment },
        });
        break;
      }
      if (
        boot.classification !== "classified_environment_bootstrap" ||
        attempt === 2
      ) {
        result = boot.result;
        break;
      }
      await stopStack(execute);
    }
  } finally {
    await stopFunctionRuntime(functionRuntime);
    cleanupResult = await stopStack(execute);
  }

  const metadata = {
    lane,
    assertion_attempts: assertionAttempts,
    bootstrap_attempts: bootstrapAttempts,
    cleanup: cleanupResult?.code === 0 ? "success" : "failure",
  };
  process.stdout.write(`${JSON.stringify(metadata)}\n`);
  if (result.stdout) process.stdout.write(redactText(result.stdout, secrets));
  if (result.stderr) process.stderr.write(redactText(result.stderr, secrets));

  if (cleanupResult?.code !== 0 && result.code === 0) {
    return cleanupResult.code || 1;
  }
  return result.code;
}

async function runSelfTest() {
  const calls = [];
  let startCount = 0;
  const fakeExecute = async (command, args) => {
    calls.push([command, ...args]);
    if (command === "supabase" && args[0] === "start") {
      startCount += 1;
      if (startCount === 1) {
        return { code: 1, stdout: "", stderr: "container db is unhealthy" };
      }
      return { code: 0, stdout: "started", stderr: "" };
    }
    if (command === "supabase" && args[0] === "status") {
      return {
        code: 0,
        stdout: JSON.stringify({
          API_URL: "http://127.0.0.1:54321",
          DB_URL: "postgresql://postgres:local@127.0.0.1:54322/postgres",
          ANON_KEY: "synthetic-local-key",
        }),
        stderr: "",
      };
    }
    if (command === "fixture-command") {
      return { code: 19, stdout: "argv-ok", stderr: "assertion failed" };
    }
    return { code: 0, stdout: "", stderr: "" };
  };

  const code = await runLane({
    lane: "migration-clean",
    command: ["fixture-command", "--exact-argv"],
    execute: fakeExecute,
  });
  const starts = calls.filter(
    ([command, action]) => command === "supabase" && action === "start",
  );
  const assertions = calls.filter(([command]) => command === "fixture-command");
  const stops = calls.filter(
    ([command, action]) => command === "supabase" && action === "stop",
  );
  if (code !== 19) throw new Error("assertion exit code was not preserved");
  if (starts.length !== 2) throw new Error("bootstrap retry bound failed");
  if (assertions.length !== 1) throw new Error("assertion was retried");
  if (stops.length < 2) throw new Error("cleanup was not guaranteed");
  if (redactText("token=abc eyJaa.bb.cc", ["abc"]).includes("abc")) {
    throw new Error("redaction failed");
  }
  process.stdout.write("supabase lane self-test: PASS\n");
}

async function main() {
  try {
    if (process.argv[2] === "--self-test") {
      await runSelfTest();
      return;
    }
    if (process.argv[2] !== "run" || process.argv[3] !== "--lane") {
      throw new Error(
        "usage: run-supabase-lane.mjs run --lane <name> -- <command argv...>",
      );
    }
    const separator = process.argv.indexOf("--", 5);
    if (separator === -1) throw new Error("missing -- command separator");
    const exitCode = await runLane({
      lane: process.argv[4],
      command: process.argv.slice(separator + 1),
    });
    process.exitCode = exitCode;
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
