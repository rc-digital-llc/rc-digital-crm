#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");
const pathsFile = path.join(
  repositoryRoot,
  ".github/release/financial-paths.json",
);

function globExpression(pattern) {
  let expression = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === "*" && pattern[index + 1] === "*") {
      expression += ".*";
      index += 1;
    } else if (character === "*") {
      expression += "[^/]*";
    } else {
      expression += character.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
    }
  }
  return new RegExp(`^${expression}$`);
}

export function classifyFinancialPaths(files, patterns) {
  const expressions = patterns.map(globExpression);
  const matched = files
    .filter((filename) => expressions.some((pattern) => pattern.test(filename)))
    .sort();
  return { financial: matched.length > 0, matched };
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function changedFiles(base, head) {
  if (!/^[a-f0-9]{40}$/.test(base) || !/^[a-f0-9]{40}$/.test(head)) {
    throw new Error("classifier requires full base and head commit SHAs");
  }
  const result = spawnSync("git", ["diff", "--name-only", "-z", base, head], {
    cwd: repositoryRoot,
    encoding: "utf8",
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error("financial path git diff failed");
  }
  return result.stdout.split("\0").filter(Boolean);
}

function loadPatterns() {
  const configuration = JSON.parse(fs.readFileSync(pathsFile, "utf8"));
  if (
    configuration.version !== "1.0.0" ||
    !Array.isArray(configuration.financial_paths)
  ) {
    throw new Error("financial path configuration is invalid");
  }
  return configuration.financial_paths;
}

function writeResult(outputPath, result) {
  const output = [
    `financial=${result.financial ? "true" : "false"}`,
    `matched_count=${result.matched.length}`,
  ].join("\n");
  if (outputPath) {
    fs.appendFileSync(outputPath, `${output}\n`, "utf8");
  } else {
    process.stdout.write(`${output}\n`);
  }
}

function selfTest() {
  const patterns = loadPatterns();
  if (
    !classifyFinancialPaths(["supabase/migrations/001.sql"], patterns).financial
  ) {
    throw new Error("migration path was not classified");
  }
  if (classifyFinancialPaths(["README.md"], patterns).financial) {
    throw new Error("unrelated path was classified financial");
  }
  process.stdout.write("financial path classifier self-test: PASS\n");
}

function main() {
  if (process.argv.includes("--self-test")) {
    selfTest();
    return;
  }
  const eventName = argumentValue("--event");
  const patterns = loadPatterns();
  const result =
    eventName === "merge_group"
      ? { financial: true, matched: [] }
      : classifyFinancialPaths(
          changedFiles(argumentValue("--base"), argumentValue("--head")),
          patterns,
        );
  writeResult(argumentValue("--github-output"), result);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "error"}\n`);
  process.exitCode = 1;
}
