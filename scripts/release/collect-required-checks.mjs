#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");
const policy = JSON.parse(
  fs.readFileSync(
    path.join(repositoryRoot, ".github/release/release-policy.json"),
    "utf8",
  ),
);

function requiredIdentities() {
  return [...policy.required_checks.fast, ...policy.required_checks.financial];
}

export function selectRequiredChecks(checkRuns) {
  if (!Array.isArray(checkRuns)) {
    throw new Error("GitHub check-runs response is invalid");
  }
  const selected = [];
  for (const identity of requiredIdentities()) {
    const matches = checkRuns
      .filter(({ name }) => name === identity)
      .sort((left, right) => {
        const leftTime = Date.parse(
          left.completed_at ?? left.started_at ?? "1970-01-01T00:00:00Z",
        );
        const rightTime = Date.parse(
          right.completed_at ?? right.started_at ?? "1970-01-01T00:00:00Z",
        );
        return (
          rightTime - leftTime || Number(right.id ?? 0) - Number(left.id ?? 0)
        );
      });
    const run = matches[0];
    if (!run) throw new Error(`required check is missing: ${identity}`);
    if (run.status !== "completed" || run.conclusion !== "success") {
      throw new Error(`required check is not successful: ${identity}`);
    }
    if (run.app?.id !== 15368 || run.app?.slug !== "github-actions") {
      throw new Error(`required check has an untrusted producer: ${identity}`);
    }
    if (
      typeof run.html_url !== "string" ||
      !run.html_url.startsWith("https://")
    ) {
      throw new Error(
        `required check has no authenticated result URL: ${identity}`,
      );
    }
    selected.push({
      identity,
      result: "success",
      url: run.html_url,
    });
  }
  return selected;
}

async function fetchCheckRuns(repository, commitSha, token) {
  const checkRuns = [];
  for (let page = 1; page <= 10; page += 1) {
    const response = await fetch(
      `https://api.github.com/repos/${repository}/commits/${commitSha}/check-runs?per_page=100&page=${page}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );
    if (!response.ok) {
      throw new Error(
        `GitHub check-runs query failed with status ${response.status}`,
      );
    }
    const body = await response.json();
    if (!Array.isArray(body.check_runs)) {
      throw new Error("GitHub check-runs response omitted check_runs");
    }
    checkRuns.push(...body.check_runs);
    if (body.check_runs.length < 100) return checkRuns;
  }
  throw new Error("GitHub check-runs pagination exceeded the bounded limit");
}

async function main() {
  try {
    const [repository, commitSha, outputPath] = process.argv.slice(2);
    if (
      !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? "") ||
      !/^[0-9a-f]{40}$/.test(commitSha ?? "") ||
      !outputPath ||
      process.argv.length !== 5
    ) {
      throw new Error(
        "usage: collect-required-checks.mjs <owner/repository> <commit-sha> <output.json>",
      );
    }
    if (!process.env.GITHUB_TOKEN) {
      throw new Error("GITHUB_TOKEN is required to verify check results");
    }
    const checks = selectRequiredChecks(
      await fetchCheckRuns(repository, commitSha, process.env.GITHUB_TOKEN),
    );
    fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
    fs.writeFileSync(
      outputPath,
      `${JSON.stringify({ commit_sha: commitSha, checks }, null, 2)}\n`,
      "utf8",
    );
    process.stdout.write(`verified ${checks.length} required checks\n`);
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
