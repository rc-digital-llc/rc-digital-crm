#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");

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
  const tarPath = outputPath.replace(/\.gz$/, "");
  run("tar", [
    "--sort=name",
    "--mtime=@0",
    "--owner=0",
    "--group=0",
    "--numeric-owner",
    "--format=gnu",
    "-cf",
    tarPath,
    "-C",
    distPath,
    ".",
  ]);
  return gzipTar(tarPath);
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
      ["supabase/config.toml", "supabase/functions"],
      path.join(outputRoot, "functions.tar.gz"),
    ),
    archiveTracked(
      commitSha,
      ["supabase/config.toml", "supabase/migrations"],
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
