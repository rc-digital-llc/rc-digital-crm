#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function verifyPromotionState({ evidence, stage, sourceText }) {
  if (evidence.stage !== stage) throw new Error("post-state stage mismatch");
  if (!sourceText.trim())
    throw new Error("provider post-state evidence is empty");
  if (stage === "schema") {
    const build = JSON.parse(
      fs.readFileSync(evidence.build_receipt_path, "utf8"),
    );
    if (!sourceText.includes(build.migration_range.to)) {
      throw new Error("provider state omits the expected migration head");
    }
  } else if (stage === "functions") {
    const manifest = JSON.parse(
      fs.readFileSync(evidence.artifacts["functions.manifest.json"], "utf8"),
    );
    const functionNames = new Set(
      manifest.files
        .map(({ name }) => /^supabase\/functions\/([^/]+)\//.exec(name)?.[1])
        .filter((name) => name && !name.startsWith("_")),
    );
    if (
      functionNames.size === 0 ||
      [...functionNames].some((name) => !sourceText.includes(name))
    ) {
      throw new Error("provider state omits an expected function");
    }
  } else if (stage === "frontend") {
    if (!/^[0-9a-f]{40}\s+refs\/heads\/[A-Za-z0-9._/-]+$/m.test(sourceText)) {
      throw new Error("frontend provider state has no immutable branch head");
    }
  } else if (stage === "dormant") {
    const state = JSON.parse(sourceText);
    if (state.to !== "dormant") {
      throw new Error("feature provider state is not dormant");
    }
  } else {
    throw new Error("unsupported post-state stage");
  }
  return {
    stage,
    commit_sha: evidence.commit_sha,
    provider_target: process.env.RELEASE_PROVIDER_TARGET,
    verified_at: new Date().toISOString(),
    source_sha256: sha256(Buffer.from(sourceText)),
  };
}

async function main() {
  try {
    const [resultPath, stage, sourcePath, outputPath] = process.argv.slice(2);
    if (
      !resultPath ||
      !stage ||
      !sourcePath ||
      !outputPath ||
      process.argv.length !== 6
    ) {
      throw new Error(
        "usage: verify-promotion-state.mjs <fetch-result.json> <stage> <provider-state> <output.json>",
      );
    }
    const result = verifyPromotionState({
      evidence: JSON.parse(fs.readFileSync(resultPath, "utf8")),
      stage,
      sourceText: fs.readFileSync(sourcePath, "utf8"),
    });
    fs.writeFileSync(
      outputPath,
      `${JSON.stringify(result, null, 2)}\n`,
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
