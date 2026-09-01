#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");

const SUPABASE_CONFIG_SUPPORT_PATHS = [
  "supabase/config.toml",
  "supabase/signing_keys.json",
  "supabase/templates",
];

export const FUNCTION_ARTIFACT_SOURCES = Object.freeze([
  ...SUPABASE_CONFIG_SUPPORT_PATHS,
  "supabase/functions",
]);

export const MIGRATION_ARTIFACT_SOURCES = Object.freeze([
  ...SUPABASE_CONFIG_SUPPORT_PATHS,
  "supabase/migrations",
]);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function run(command, args, { encoding = "utf8" } = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding,
    shell: false,
    maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`${command} failed while preparing release artifacts`);
  }
  return result.stdout;
}

function writeJson(filename, value) {
  fs.writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function trackedManifest(commitSha, prefix) {
  const names = run("git", [
    "ls-tree",
    "-r",
    "--name-only",
    "-z",
    commitSha,
    "--",
    prefix,
  ])
    .split("\0")
    .filter(Boolean)
    .sort();
  if (names.length === 0) {
    throw new Error(`release source set is empty: ${prefix}`);
  }
  return names.map((name) => ({
    name,
    sha256: sha256(
      run("git", ["show", `${commitSha}:${name}`], { encoding: null }),
    ),
  }));
}

function gzipTar(tarPath) {
  run("gzip", ["-n", "-9", "-f", tarPath]);
  return `${tarPath}.gz`;
}

function archiveTracked(commitSha, prefixes, outputPath) {
  const tarPath = outputPath.replace(/\.gz$/, "");
  run("git", [
    "archive",
    "--format=tar",
    "--output",
    tarPath,
    commitSha,
    ...prefixes,
  ]);
  return gzipTar(tarPath);
}

function archiveFrontend(outputPath) {
  const distPath = path.join(repositoryRoot, "dist");
  if (!fs.existsSync(distPath) || !fs.statSync(distPath).isDirectory()) {
    throw new Error("production frontend build is missing");
  }
  const files = [];
  const pending = [distPath];
  while (pending.length > 0) {
    const current = pending.pop();
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) {
      throw new Error("frontend artifact contains a symbolic link");
    }
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(current)) {
        pending.push(path.join(current, entry));
      }
    } else if (stat.isFile()) {
      files.push(current);
    }
  }
  files.sort((left, right) =>
    path.relative(distPath, left).localeCompare(path.relative(distPath, right)),
  );
  if (files.length === 0) throw new Error("production frontend build is empty");

  const records = [];
  for (const filename of files) {
    const relativeName = path
      .relative(distPath, filename)
      .split(path.sep)
      .join("/");
    const content = fs.readFileSync(filename);
    const header = ustarHeader(relativeName, content.length);
    records.push(header, content);
    const padding = (512 - (content.length % 512)) % 512;
    if (padding) records.push(Buffer.alloc(padding));
  }
  records.push(Buffer.alloc(1024));
  fs.writeFileSync(
    outputPath,
    gzipSync(Buffer.concat(records), { level: 9, mtime: 0 }),
    { mode: 0o600 },
  );
  return outputPath;
}

function writeAscii(buffer, offset, length, value) {
  const bytes = Buffer.from(value, "ascii");
  if (bytes.length > length) throw new Error("USTAR field exceeds its limit");
  bytes.copy(buffer, offset);
}

function writeOctal(buffer, offset, length, value) {
  const octal = value.toString(8).padStart(length - 1, "0");
  if (octal.length >= length)
    throw new Error("USTAR numeric field is too large");
  writeAscii(buffer, offset, length, `${octal}\0`);
}

function splitUstarName(name) {
  if (Buffer.byteLength(name) <= 100) return { name, prefix: "" };
  const separators = [...name.matchAll(/\//g)].map(({ index }) => index);
  for (const index of separators.reverse()) {
    const prefix = name.slice(0, index);
    const basename = name.slice(index + 1);
    if (
      Buffer.byteLength(prefix) <= 155 &&
      Buffer.byteLength(basename) <= 100
    ) {
      return { name: basename, prefix };
    }
  }
  throw new Error(`frontend artifact path exceeds USTAR limits: ${name}`);
}

function ustarHeader(relativeName, size) {
  const header = Buffer.alloc(512);
  const split = splitUstarName(relativeName);
  writeAscii(header, 0, 100, split.name);
  writeOctal(header, 100, 8, 0o644);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  writeAscii(header, 156, 1, "0");
  writeAscii(header, 257, 6, "ustar\0");
  writeAscii(header, 263, 2, "00");
  writeAscii(header, 345, 155, split.prefix);
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  writeAscii(header, 148, 8, `${checksum.toString(8).padStart(6, "0")}\0 `);
  return header;
}

export function prepareBuildEvidence(commitSha, outputDirectory) {
  if (!/^[0-9a-f]{40}$/.test(commitSha)) {
    throw new Error("release commit must be a full SHA");
  }
  const head = run("git", ["rev-parse", "HEAD"]).trim();
  if (head !== commitSha)
    throw new Error("checked-out commit does not match release SHA");

  const outputRoot = path.resolve(outputDirectory);
  fs.mkdirSync(outputRoot, { recursive: true });
  const functionsManifestPath = path.join(
    outputRoot,
    "functions.manifest.json",
  );
  const migrationsManifestPath = path.join(
    outputRoot,
    "migrations.manifest.json",
  );
  writeJson(functionsManifestPath, {
    version: "1.0.0",
    commit_sha: commitSha,
    files: trackedManifest(commitSha, "supabase/functions"),
  });
  const migrationFiles = trackedManifest(
    commitSha,
    "supabase/migrations",
  ).filter(({ name }) => name.endsWith(".sql"));
  if (migrationFiles.length === 0)
    throw new Error("migration source set is empty");
  writeJson(migrationsManifestPath, {
    version: "1.0.0",
    commit_sha: commitSha,
    files: migrationFiles,
  });

  const artifactPaths = [
    archiveFrontend(path.join(outputRoot, "frontend.tar.gz")),
    archiveTracked(
      commitSha,
      FUNCTION_ARTIFACT_SOURCES,
      path.join(outputRoot, "functions.tar.gz"),
    ),
    archiveTracked(
      commitSha,
      MIGRATION_ARTIFACT_SOURCES,
      path.join(outputRoot, "migrations.tar.gz"),
    ),
    functionsManifestPath,
    migrationsManifestPath,
  ];
  const artifacts = artifactPaths
    .map((artifactPath) => ({
      name: path.basename(artifactPath),
      sha256: sha256(fs.readFileSync(artifactPath)),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
  const manifestPath = path.join(outputRoot, "release-artifacts.manifest.json");
  writeJson(manifestPath, {
    version: "1.0.0",
    commit_sha: commitSha,
    artifacts,
  });
  const manifestDigest = sha256(fs.readFileSync(manifestPath));
  const checksums = [
    ...artifacts,
    { name: path.basename(manifestPath), sha256: manifestDigest },
  ]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(({ name, sha256: digest }) => `${digest}  ${name}`)
    .join("\n");
  const checksumsPath = path.join(outputRoot, "SHA256SUMS");
  fs.writeFileSync(checksumsPath, `${checksums}\n`, "utf8");
  return { manifestPath, manifestDigest, checksumsPath, artifactPaths };
}

async function main() {
  try {
    const [commitSha, outputDirectory] = process.argv.slice(2);
    if (!commitSha || !outputDirectory || process.argv.length !== 4) {
      throw new Error(
        "usage: prepare-build-evidence.mjs <commit-sha> <output-directory>",
      );
    }
    const result = prepareBuildEvidence(commitSha, outputDirectory);
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
