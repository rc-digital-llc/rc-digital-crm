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

export function assertRegisteredFeature(features, featureName) {
  const feature = features.find(({ name }) => name === featureName);
  if (!feature) {
    throw new Error("financial feature is not registered in policy");
  }
  if (!feature.provider_target || !feature.control_id) {
    throw new Error("financial feature registration is incomplete");
  }
  return feature;
}

export function assertEnablementEligibility({
  features,
  featureName,
  dormantReceipt,
  invariants,
  now = new Date(),
}) {
  const feature = assertRegisteredFeature(features, featureName);
  if (
    dormantReceipt.stage !== "dormant" ||
    dormantReceipt.feature_flag_state?.feature !== featureName ||
    dormantReceipt.feature_flag_state?.state !== "dormant"
  ) {
    throw new Error("enablement requires the matching dormant receipt");
  }
  if (
    feature.provider_target !==
    dormantReceipt.target_environment.provider_target
  ) {
    throw new Error("feature provider target differs from the receipt target");
  }
  const capturedAt = Date.parse(invariants.captured_at);
  if (
    !Number.isFinite(capturedAt) ||
    capturedAt > now.getTime() ||
    now.getTime() - capturedAt > 5 * 60 * 1000
  ) {
    throw new Error(
      "enablement invariants are missing, future-dated, or stale",
    );
  }
  const expected = {
    held: false,
    disputed: false,
    kill_switch_active: false,
    required_checks_current: true,
    financial_invariants_pass: true,
  };
  for (const [name, value] of Object.entries(expected)) {
    if (invariants[name] !== value) {
      throw new Error(`enablement invariant failed: ${name}`);
    }
  }
  return { feature, captured_at: invariants.captured_at };
}

async function main() {
  try {
    if (process.argv[2] === "--registry" && process.argv.length === 4) {
      const feature = assertRegisteredFeature(
        policy.financial_features,
        process.argv[3],
      );
      process.stdout.write(`${JSON.stringify({ feature: feature.name })}\n`);
      return;
    }
    const [resultPath, featureName, invariantsPath] = process.argv.slice(2);
    if (
      !resultPath ||
      !featureName ||
      !invariantsPath ||
      process.argv.length !== 5
    ) {
      throw new Error(
        "usage: verify-financial-enable.mjs --registry <feature> | <fetch-result.json> <feature> <invariants.json>",
      );
    }
    const evidence = JSON.parse(fs.readFileSync(resultPath, "utf8"));
    const dormantReceipt = JSON.parse(
      fs.readFileSync(evidence.predecessor_receipt_path, "utf8"),
    );
    const result = assertEnablementEligibility({
      features: policy.financial_features,
      featureName,
      dormantReceipt,
      invariants: JSON.parse(fs.readFileSync(invariantsPath, "utf8")),
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
