#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");
const migrationsDirectory = path.join(repositoryRoot, "supabase/migrations");
const schemaContractsPath = "supabase/tests/database/00_schema_contracts.sql";
const schemaPushProjectPattern = /^rc-digital-schema-push-\d+-[a-f0-9]{8,}$/;
const loopbackHosts = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

function safeDiagnostic(value) {
  return String(value ?? "")
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "[REDACTED_DB_URL]")
    .replace(
      /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
      "[REDACTED_JWT]",
    )
    .replace(/((?:key|token|secret|password)\s*[=:]\s*)\S+/gi, "$1[REDACTED]")
    .trim()
    .slice(-2000);
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
      finish({ code: 124, stdout: "", stderr: "process timed out" });
    }, options.timeoutMs ?? 300000);
  });
}

export function parseMigrationFilenames(filenames) {
  if (!Array.isArray(filenames) || filenames.length === 0) {
    throw new Error("migration filename list is empty");
  }
  const parsed = [];
  let previousVersion;
  for (const filename of filenames) {
    const match = /^(\d{14})_[A-Za-z0-9][A-Za-z0-9_-]*\.sql$/.exec(filename);
    if (!match) throw new Error(`invalid migration filename: ${filename}`);
    const version = match[1];
    if (version === previousVersion) {
      throw new Error(`duplicate migration version: ${version}`);
    }
    if (previousVersion && version < previousVersion) {
      throw new Error(`migration versions are out of order at ${version}`);
    }
    parsed.push({ filename, version });
    previousVersion = version;
  }
  return parsed;
}

export function parseMigrationListOutput(output) {
  const text = String(output).trim();
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed?.migrations)) {
      return parsed.migrations.map((migration) => {
        const local = String(migration.local ?? "");
        const remote = String(migration.remote ?? "");
        if (!/^\d{14}$/.test(local) || local !== remote) {
          throw new Error("local and database migration versions differ");
        }
        return remote;
      });
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "local and database migration versions differ"
    ) {
      throw error;
    }
  }

  const cleanCell = (cell) =>
    cell
      .replace(/\x1b\[[0-?]*[ -\/]*[@-~]/g, "")
      .replace(/`/g, "")
      .trim();
  let localIndex = -1;
  let remoteIndex = -1;
  const versions = [];
  for (const line of text.split(/\r?\n/)) {
    const cells = line.split(/[|│]/).map(cleanCell);
    const normalized = cells.map((cell) => cell.toLowerCase());
    const headerLocalIndex = normalized.indexOf("local");
    const headerRemoteIndex = normalized.indexOf("remote");
    if (headerLocalIndex !== -1 && headerRemoteIndex !== -1) {
      localIndex = headerLocalIndex;
      remoteIndex = headerRemoteIndex;
      continue;
    }
    if (localIndex === -1 || remoteIndex === -1) continue;

    const local = cells[localIndex] ?? "";
    const remote = cells[remoteIndex] ?? "";
    const hasMigrationVersion =
      /^\d{14}$/.test(local) || /^\d{14}$/.test(remote);
    if (!hasMigrationVersion) continue;
    if (!/^\d{14}$/.test(local) || local !== remote) {
      throw new Error("local and database migration versions differ");
    }
    versions.push(remote);
  }
  return versions;
}

function assertMatchingHistory(repositoryMigrations, appliedVersions) {
  const repositoryVersions = repositoryMigrations.map(({ version }) => version);
  if (
    repositoryVersions.length !== appliedVersions.length ||
    repositoryVersions.some(
      (version, index) => version !== appliedVersions[index],
    )
  ) {
    throw new Error(
      `database migration history differs from repository history ` +
        `(repository=${repositoryVersions.length}, database=${appliedVersions.length})`,
    );
  }
}

function historySummary(migrations) {
  const filenames = migrations.map(({ filename }) => filename);
  return {
    first_version: migrations[0].version,
    latest_version: migrations.at(-1).version,
    migration_count: migrations.length,
    filenames_sha256: createHash("sha256")
      .update(filenames.join("\n"))
      .digest("hex"),
  };
}

function assertNoRemoteAuthority(environment, argv) {
  if (environment.SUPABASE_ACCESS_TOKEN) {
    throw new Error("Supabase access token is prohibited in schema-push mode");
  }
  if (environment.SUPABASE_PROJECT_REF || environment.SUPABASE_PROJECT_ID) {
    throw new Error("Supabase project ref is prohibited in schema-push mode");
  }
  if (
    argv.some(
      (argument) =>
        argument === "--linked" ||
        argument.startsWith("--linked=") ||
        argument === "--project-ref" ||
        argument.startsWith("--project-ref=") ||
        argument === "--project-id" ||
        argument.startsWith("--project-id="),
    )
  ) {
    throw new Error(
      "linked mode and project refs are prohibited in schema-push mode",
    );
  }
}

function assertTestScopedProject(projectId) {
  if (!schemaPushProjectPattern.test(String(projectId ?? ""))) {
    throw new Error("schema-push project identifier is not test-scoped");
  }
}

export function assertSafeSchemaPushTarget({
  target,
  environment = {},
  argv = [],
}) {
  assertNoRemoteAuthority(environment, argv);
  assertTestScopedProject(target?.projectId);
  const databaseUrl = String(target?.databaseUrl ?? "");
  if (!databaseUrl) throw new Error("schema-push database URL is required");
  if (/\$(?:\{[^}]+\}|[A-Za-z_][A-Za-z0-9_]*)/.test(databaseUrl)) {
    throw new Error("schema-push database URL contains an unresolved variable");
  }

  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("schema-push database URL is invalid");
  }
  if (!new Set(["postgres:", "postgresql:"]).has(parsed.protocol)) {
    throw new Error("schema-push database URL must use PostgreSQL");
  }
  if (!loopbackHosts.has(parsed.hostname)) {
    throw new Error("schema-push database host must be loopback");
  }
  if (!parsed.port) {
    throw new Error(
      "schema-push database URL must name an explicit local port",
    );
  }
  if (
    environment.SUPABASE_DB_URL &&
    databaseUrl === environment.SUPABASE_DB_URL
  ) {
    throw new Error(
      "schema-push database must differ from the primary local stack",
    );
  }
  return parsed;
}

export async function verifyCleanMigrationChain({
  migrationFilenames,
  execute = executeProcess,
}) {
  const migrations = parseMigrationFilenames(migrationFilenames);

  const reset = await execute("supabase", ["db", "reset", "--local"], {
    cwd: repositoryRoot,
    timeoutMs: 300000,
  });
  if (reset.code !== 0) {
    throw new Error(
      `clean migration reset failed with exit code ${reset.code}`,
    );
  }

  const listed = await execute("supabase", ["migration", "list", "--local"], {
    cwd: repositoryRoot,
    timeoutMs: 60000,
  });
  if (listed.code !== 0) {
    throw new Error(
      `local migration history failed with exit code ${listed.code}`,
    );
  }
  assertMatchingHistory(migrations, parseMigrationListOutput(listed.stdout));

  const contracts = await execute(
    "supabase",
    ["test", "db", schemaContractsPath, "--local"],
    { cwd: repositoryRoot, timeoutMs: 120000 },
  );
  if (contracts.code !== 0) {
    throw new Error(`schema contracts failed with exit code ${contracts.code}`);
  }

  return historySummary(migrations);
}

export async function verifySchemaPushTarget({
  target,
  migrationFilenames,
  environment = {},
  argv = [],
  execute = executeProcess,
}) {
  assertSafeSchemaPushTarget({ target, environment, argv });
  const migrations = parseMigrationFilenames(migrationFilenames);
  const commandEnvironment = {
    ...environment,
    LOCAL_UPGRADE_DB_URL: target.databaseUrl,
  };

  const pushed = await execute(
    "supabase",
    ["db", "push", "--db-url", target.databaseUrl, "--include-all"],
    { cwd: repositoryRoot, env: commandEnvironment, timeoutMs: 300000 },
  );
  if (pushed.code !== 0) {
    const detail = safeDiagnostic(`${pushed.stderr}\n${pushed.stdout}`);
    throw new Error(
      `schema push failed with exit code ${pushed.code}` +
        (detail ? `: ${detail}` : ""),
    );
  }

  const listed = await execute(
    "supabase",
    ["migration", "list", "--db-url", target.databaseUrl],
    { cwd: repositoryRoot, env: commandEnvironment, timeoutMs: 60000 },
  );
  if (listed.code !== 0) {
    throw new Error(
      `schema-push migration history failed with exit code ${listed.code}`,
    );
  }
  assertMatchingHistory(migrations, parseMigrationListOutput(listed.stdout));

  const contracts = await execute(
    "supabase",
    ["test", "db", schemaContractsPath, "--db-url", target.databaseUrl],
    { cwd: repositoryRoot, env: commandEnvironment, timeoutMs: 120000 },
  );
  if (contracts.code !== 0) {
    throw new Error(
      `schema-push contracts failed with exit code ${contracts.code}`,
    );
  }

  return {
    project_id: target.projectId,
    ...historySummary(migrations),
  };
}

function sanitizedLocalEnvironment(environment) {
  const sanitized = { ...environment };
  delete sanitized.SUPABASE_ACCESS_TOKEN;
  delete sanitized.SUPABASE_PROJECT_ID;
  delete sanitized.SUPABASE_PROJECT_REF;
  return sanitized;
}

async function findFreePort(excluded) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen({ host: "127.0.0.1", port: 0 }, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => {
        if (error) reject(error);
        else if (!port || excluded.has(port)) resolve(findFreePort(excluded));
        else resolve(port);
      });
    });
  });
}

async function allocateLocalPorts(count) {
  const ports = new Set();
  while (ports.size < count) ports.add(await findFreePort(ports));
  return [...ports];
}

function replaceRequired(source, search, replacement) {
  if (!source.includes(search)) {
    throw new Error(
      `schema-push config is missing expected setting: ${search}`,
    );
  }
  return source.replace(search, replacement);
}

async function prepareSchemaPushTarget() {
  const projectId = `rc-digital-schema-push-${process.pid}-${randomBytes(5).toString("hex")}`;
  assertTestScopedProject(projectId);
  const workdir = path.join(os.tmpdir(), projectId);
  fs.mkdirSync(path.join(workdir, "supabase", "migrations"), {
    recursive: true,
  });
  fs.cpSync(
    path.join(repositoryRoot, "supabase/signing_keys.json"),
    path.join(workdir, "supabase/signing_keys.json"),
  );
  fs.cpSync(
    path.join(repositoryRoot, "supabase/templates"),
    path.join(workdir, "supabase/templates"),
    { recursive: true },
  );

  const ports = await allocateLocalPorts(8);
  const replacements = [
    ['project_id = "atomic-crm-demo"', `project_id = "${projectId}"`],
    ["port = 54321", `port = ${ports[0]}`],
    ["port = 54322", `port = ${ports[1]}`],
    ["shadow_port = 54320", `shadow_port = ${ports[2]}`],
    ["port = 54329", `port = ${ports[3]}`],
    ["port = 54323", `port = ${ports[4]}`],
    ["port = 54324", `port = ${ports[5]}`],
    ["port = 54327", `port = ${ports[6]}`],
    ["vector_port = 54328", `vector_port = ${ports[7]}`],
  ];
  let config = fs.readFileSync(
    path.join(repositoryRoot, "supabase/config.toml"),
    "utf8",
  );
  config = config.replace(/\n\[functions\.[\s\S]*$/, "\n");
  for (const [search, replacement] of replacements) {
    config = replaceRequired(config, search, replacement);
  }
  fs.writeFileSync(path.join(workdir, "supabase/config.toml"), config, {
    mode: 0o600,
  });
  return { projectId, workdir };
}

async function startSchemaPushTarget({ target, environment, execute }) {
  const commandEnvironment = sanitizedLocalEnvironment(environment);
  const started = await execute(
    "supabase",
    ["start", "--workdir", target.workdir],
    {
      cwd: repositoryRoot,
      env: commandEnvironment,
      timeoutMs: 300000,
    },
  );
  if (started.code !== 0) {
    const detail = safeDiagnostic(`${started.stderr}\n${started.stdout}`);
    throw new Error(
      `disposable schema-push stack failed with exit code ${started.code}` +
        (detail ? `: ${detail}` : ""),
    );
  }
  const status = await execute(
    "supabase",
    ["status", "-o", "json", "--workdir", target.workdir],
    { cwd: repositoryRoot, env: commandEnvironment, timeoutMs: 60000 },
  );
  if (status.code !== 0) {
    throw new Error(
      `disposable schema-push status failed with exit code ${status.code}`,
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(status.stdout);
  } catch {
    throw new Error("disposable schema-push status was not valid JSON");
  }
  let localDatabaseUrl;
  try {
    const url = new URL(parsed.DB_URL);
    url.searchParams.set("sslmode", "disable");
    localDatabaseUrl = url.toString();
  } catch {
    throw new Error(
      "disposable schema-push status omitted a valid database URL",
    );
  }
  const runningTarget = { ...target, databaseUrl: localDatabaseUrl };
  assertSafeSchemaPushTarget({
    target: runningTarget,
    environment,
    argv: [],
  });
  return runningTarget;
}

export async function cleanupSchemaPushTarget({
  target,
  execute = executeProcess,
}) {
  assertTestScopedProject(target?.projectId);
  if (path.basename(String(target?.workdir ?? "")) !== target.projectId) {
    throw new Error(
      "schema-push cleanup workdir does not match the test project",
    );
  }
  return execute(
    "supabase",
    [
      "stop",
      "--project-id",
      target.projectId,
      "--no-backup",
      "--workdir",
      target.workdir,
    ],
    { cwd: repositoryRoot, env: sanitizedLocalEnvironment(process.env) },
  );
}

async function verifyDisposableSchemaPush({
  environment = process.env,
  argv = [],
  execute = executeProcess,
}) {
  assertNoRemoteAuthority(environment, argv);
  if (environment.LOCAL_UPGRADE_DB_URL) {
    throw new Error(
      "externally supplied schema-push database URLs are prohibited",
    );
  }
  const preparedTarget = await prepareSchemaPushTarget();
  let failure;
  let result;
  let cleanup;
  try {
    const runningTarget = await startSchemaPushTarget({
      target: preparedTarget,
      environment,
      execute,
    });
    result = await verifySchemaPushTarget({
      target: runningTarget,
      migrationFilenames: repositoryMigrationFilenames(),
      environment,
      argv,
      execute,
    });
  } catch (error) {
    failure = error;
  } finally {
    cleanup = await cleanupSchemaPushTarget({
      target: preparedTarget,
      execute,
    });
    fs.rmSync(preparedTarget.workdir, { recursive: true, force: true });
  }
  if (failure) throw failure;
  if (cleanup.code !== 0) {
    throw new Error(
      `schema-push cleanup failed with exit code ${cleanup.code}`,
    );
  }
  return result;
}

function repositoryMigrationFilenames() {
  return fs
    .readdirSync(migrationsDirectory)
    .filter((filename) => filename.endsWith(".sql"))
    .sort();
}

async function main() {
  try {
    let result;
    if (process.argv[2] === "clean" && process.argv.length === 3) {
      result = await verifyCleanMigrationChain({
        migrationFilenames: repositoryMigrationFilenames(),
      });
    } else if (process.argv[2] === "schema-push") {
      result = await verifyDisposableSchemaPush({
        argv: process.argv.slice(3),
      });
    } else {
      throw new Error("usage: verify-migration-chain.mjs <clean|schema-push>");
    }
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
