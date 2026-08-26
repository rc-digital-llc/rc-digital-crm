#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

function walkFiles(root) {
  const pending = [root];
  const files = [];
  while (pending.length > 0) {
    const current = pending.pop();
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) {
      throw new Error("frontend readback contains a symbolic link");
    }
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(current)) {
        if (current === root && entry === ".git") continue;
        pending.push(path.join(current, entry));
      }
    } else if (stat.isFile()) {
      files.push(current);
    }
  }
  return files.sort((left, right) => {
    const leftName = path.relative(root, left);
    const rightName = path.relative(root, right);
    return leftName < rightName ? -1 : leftName > rightName ? 1 : 0;
  });
}

export function hashFrontendTree(root) {
  const resolvedRoot = path.resolve(root);
  if (
    !fs.existsSync(resolvedRoot) ||
    !fs.statSync(resolvedRoot).isDirectory()
  ) {
    throw new Error("frontend tree is missing");
  }
  const files = walkFiles(resolvedRoot);
  if (files.length === 0) throw new Error("frontend tree is empty");
  const digest = createHash("sha256");
  for (const filename of files) {
    const relativeName = path
      .relative(resolvedRoot, filename)
      .split(path.sep)
      .join("/");
    digest.update(relativeName);
    digest.update("\0");
    digest.update(
      createHash("sha256").update(fs.readFileSync(filename)).digest(),
    );
  }
  return { file_count: files.length, tree_sha256: digest.digest("hex") };
}

export function verifyFrontendReadback(sourceRoot, readbackRoot) {
  const source = hashFrontendTree(sourceRoot);
  const readback = hashFrontendTree(readbackRoot);
  if (
    source.file_count !== readback.file_count ||
    source.tree_sha256 !== readback.tree_sha256
  ) {
    throw new Error("frontend readback tree differs from the pinned artifact");
  }
  const result = spawnSync("git", ["-C", readbackRoot, "rev-parse", "HEAD"], {
    encoding: "utf8",
    shell: false,
    timeout: 30000,
  });
  const remoteHead = result.stdout?.trim();
  if (result.status !== 0 || !/^[0-9a-f]{40}$/.test(remoteHead)) {
    throw new Error("frontend readback has no immutable remote head");
  }
  return {
    remote_head: remoteHead,
    artifact_tree_sha256: source.tree_sha256,
    readback_tree_sha256: readback.tree_sha256,
    file_count: source.file_count,
  };
}

async function main() {
  try {
    const [sourceRoot, readbackRoot, outputPath] = process.argv.slice(2);
    if (
      !sourceRoot ||
      !readbackRoot ||
      !outputPath ||
      process.argv.length !== 5
    ) {
      throw new Error(
        "usage: verify-frontend-readback.mjs <artifact-directory> <readback-directory> <output.json>",
      );
    }
    const report = verifyFrontendReadback(sourceRoot, readbackRoot);
    fs.writeFileSync(
      outputPath,
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8",
    );
    process.stdout.write(`${JSON.stringify({ output: outputPath })}\n`);
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
