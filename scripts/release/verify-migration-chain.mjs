#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");
const migrationsDirectory = path.join(repositoryRoot, "supabase/migrations");
const schemaContractsPath = "supabase/tests/database/00_schema_contracts.sql";

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
  const versions = [];
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*(\d{14})\s*\|/.exec(line);
    if (match) versions.push(match[1]);
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

function repositoryMigrationFilenames() {
  return fs
    .readdirSync(migrationsDirectory)
    .filter((filename) => filename.endsWith(".sql"))
    .sort();
}

async function main() {
  try {
    if (process.argv[2] !== "clean") {
      throw new Error("usage: verify-migration-chain.mjs clean");
    }
    const result = await verifyCleanMigrationChain({
      migrationFilenames: repositoryMigrationFilenames(),
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
