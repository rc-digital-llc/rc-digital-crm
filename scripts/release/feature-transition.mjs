#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const policy = JSON.parse(
  fs.readFileSync(
    path.join(repositoryRoot, ".github/release/release-policy.json"),
    "utf8",
  ),
);

export function assertFeatureTransition({
  features,
  featureName,
  currentState,
  nextState,
}) {
  const feature = features.find(({ name }) => name === featureName);
  if (!feature)
    throw new Error("financial feature is not registered in policy");
  const expected = nextState === "dormant" ? "disabled" : "dormant";
  if (currentState !== expected) {
    throw new Error(
      `financial feature must be ${expected} before ${nextState}`,
    );
  }
  if (!feature.provider_target || !feature.control_id) {
    throw new Error("financial feature registration is incomplete");
  }
  return { feature: featureName, from: currentState, to: nextState };
}

async function main() {
  try {
    const [nextState, featureName, currentState, outputPath] =
      process.argv.slice(2);
    if (
      !["dormant", "enabled"].includes(nextState) ||
      !featureName ||
      !currentState ||
      !outputPath ||
      process.argv.length !== 6
    ) {
      throw new Error(
        "usage: feature-transition.mjs <dormant|enabled> <feature> <current-state> <output.json>",
      );
    }
    const transition = assertFeatureTransition({
      features: policy.financial_features,
      featureName,
      currentState,
      nextState,
    });
    throw new Error(
      `no Phase 1 live feature-control adapter is registered for ${transition.feature}`,
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
