#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    shell: false,
    timeout: 60000,
  });
  if (result.status !== 0) {
    throw new Error(`${command} failed during promotion input verification`);
  }
  return result.stdout;
}

function assertArchiveEntries(archivePath) {
  const listing = run("tar", ["-tvzf", archivePath]);
  const names = run("tar", ["-tzf", archivePath]).split("\n").filter(Boolean);
  if (names.length === 0) {
    throw new Error("promotion artifact archive is empty");
  }
  if (
    names.some(
      (name) =>
        path.isAbsolute(name) ||
        name.split("/").includes("..") ||
        name.includes("\\"),
    )
  ) {
    throw new Error("promotion artifact archive contains an unsafe path");
  }
  if (listing.split("\n").some((line) => /^[lh]/.test(line))) {
    throw new Error("promotion artifact archive contains a link");
  }
}

export function verifyPromotionInput(resultPath, stage, outputDirectory) {
  const evidence = JSON.parse(fs.readFileSync(resultPath, "utf8"));
  if (evidence.stage !== stage) {
    throw new Error("promotion stage evidence mismatch");
  }
  const head = run("git", ["rev-parse", "HEAD"]).trim();
  if (head !== evidence.commit_sha) {
    throw new Error("promotion checkout is not the attested commit");
  }
  const artifactName = {
    schema: "migrations.tar.gz",
    functions: "functions.tar.gz",
    frontend: "frontend.tar.gz",
  }[stage];
  const outputRoot = path.resolve(outputDirectory);
  fs.mkdirSync(outputRoot, { recursive: true });
  if (artifactName) {
    const archivePath = evidence.artifacts[artifactName];
    if (!archivePath || !fs.statSync(archivePath).isFile()) {
      throw new Error(`verified ${artifactName} is missing`);
    }
    assertArchiveEntries(archivePath);
    run("tar", ["-xzf", archivePath, "-C", outputRoot]);
  } else if (stage !== "dormant") {
    throw new Error("unsupported promotion stage");
  }
  const result = {
    stage,
    commit_sha: evidence.commit_sha,
    manifest_sha256: evidence.manifest_sha256,
    workspace: outputRoot,
  };
  const verificationPath = `${outputRoot}.input.json`;
  fs.writeFileSync(
    verificationPath,
    `${JSON.stringify(result, null, 2)}\n`,
    "utf8",
  );
  return { ...result, verification_path: verificationPath };
}

async function main() {
  try {
    const [resultPath, stage, outputDirectory] = process.argv.slice(2);
    if (
      !resultPath ||
      !stage ||
      !outputDirectory ||
      process.argv.length !== 5
    ) {
      throw new Error(
        "usage: verify-promotion-input.mjs <fetch-result.json> <stage> <output-directory>",
      );
    }
    process.stdout.write(
      `${JSON.stringify(verifyPromotionInput(resultPath, stage, outputDirectory))}\n`,
    );
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
