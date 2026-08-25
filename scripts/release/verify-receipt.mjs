#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");
const schema = JSON.parse(
  fs.readFileSync(
    path.join(repositoryRoot, ".github/release/release-receipt.schema.json"),
    "utf8",
  ),
);
const policy = JSON.parse(
  fs.readFileSync(
    path.join(repositoryRoot, ".github/release/release-policy.json"),
    "utf8",
  ),
);

function resolveReference(reference) {
  if (!reference.startsWith("#/$defs/")) {
    throw new Error(`unsupported receipt schema reference: ${reference}`);
  }
  const definition = schema.$defs[reference.slice("#/$defs/".length)];
  if (!definition)
    throw new Error(`unknown receipt schema reference: ${reference}`);
  return definition;
}

function valueType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function validateFormat(value, format) {
  if (format === "date-time") return Number.isFinite(Date.parse(value));
  if (format === "uri") {
    try {
      const parsed = new URL(value);
      return Boolean(parsed.protocol);
    } catch {
      return false;
    }
  }
  return true;
}

function validateSchemaValue(value, definition, location, errors) {
  if (definition.$ref) {
    validateSchemaValue(
      value,
      resolveReference(definition.$ref),
      location,
      errors,
    );
    return;
  }
  if (Object.hasOwn(definition, "const") && value !== definition.const) {
    errors.push(`${location} must equal ${definition.const}`);
    return;
  }
  if (definition.enum && !definition.enum.includes(value)) {
    errors.push(`${location} is not an allowed value`);
    return;
  }
  if (definition.type) {
    const expected = Array.isArray(definition.type)
      ? definition.type
      : [definition.type];
    if (!expected.includes(valueType(value))) {
      errors.push(`${location} has the wrong type`);
      return;
    }
  }
  if (typeof value === "string") {
    if (definition.minLength && value.length < definition.minLength) {
      errors.push(`${location} is empty`);
    }
    if (definition.pattern && !new RegExp(definition.pattern).test(value)) {
      errors.push(`${location} has an invalid format`);
    }
    if (definition.format && !validateFormat(value, definition.format)) {
      errors.push(`${location} has an invalid ${definition.format} format`);
    }
  }
  if (Array.isArray(value)) {
    if (definition.minItems && value.length < definition.minItems) {
      errors.push(
        `${location} requires at least ${definition.minItems} item(s)`,
      );
    }
    if (definition.items) {
      value.forEach((item, index) =>
        validateSchemaValue(
          item,
          definition.items,
          `${location}[${index}]`,
          errors,
        ),
      );
    }
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const required of definition.required ?? []) {
      if (!Object.hasOwn(value, required)) {
        errors.push(`${location}.${required} is required`);
      }
    }
    if (definition.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(definition.properties ?? {}, key)) {
          errors.push(`${location}.${key} is not schema-declared`);
        }
      }
    }
    for (const [key, childDefinition] of Object.entries(
      definition.properties ?? {},
    )) {
      if (Object.hasOwn(value, key)) {
        validateSchemaValue(
          value[key],
          childDefinition,
          `${location}.${key}`,
          errors,
        );
      }
    }
  }
}

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

export function canonicalReceiptJson(receipt) {
  return `${JSON.stringify(canonicalize(receipt))}\n`;
}

export function computeReceiptId(receipt) {
  return createHash("sha256")
    .update(canonicalReceiptJson(receipt), "utf8")
    .digest("hex");
}

function assertExactSuccessfulChecks(receipt) {
  const expected = [
    ...policy.required_checks.fast,
    ...policy.required_checks.financial,
  ].sort();
  const received = receipt.required_checks
    .map(({ identity }) => identity)
    .sort();
  if (
    received.length !== expected.length ||
    received.some((identity, index) => identity !== expected[index])
  ) {
    throw new Error("receipt required check identities do not match policy");
  }
  if (new Set(received).size !== received.length) {
    throw new Error("receipt required check identities contain duplicates");
  }
  if (receipt.required_checks.some(({ result }) => result !== "success")) {
    throw new Error("every required check must report success");
  }
}

function assertStageChain(receipt, predecessorReceipt) {
  const stageIndex = policy.stage_order.indexOf(receipt.stage);
  if (stageIndex === -1) throw new Error("receipt stage is not in policy");
  if (stageIndex === 0) {
    if (receipt.predecessor !== null) {
      throw new Error("schema stage cannot name a predecessor");
    }
  } else {
    const expectedStage = policy.stage_order[stageIndex - 1];
    if (!receipt.predecessor || receipt.predecessor.stage !== expectedStage) {
      throw new Error(
        `${receipt.stage} stage requires ${expectedStage} predecessor`,
      );
    }
    if (!predecessorReceipt) {
      throw new Error(
        `${receipt.stage} stage requires its predecessor receipt`,
      );
    }
    const predecessorErrors = [];
    validateSchemaValue(
      predecessorReceipt,
      schema,
      "predecessor_receipt",
      predecessorErrors,
    );
    if (predecessorErrors.length > 0) {
      throw new Error(predecessorErrors.join("; "));
    }
    if (predecessorReceipt.stage !== expectedStage) {
      throw new Error(`predecessor receipt is not the ${expectedStage} stage`);
    }
    if (
      computeReceiptId(predecessorReceipt) !== receipt.predecessor.receipt_id
    ) {
      throw new Error(
        "predecessor receipt digest does not match stage linkage",
      );
    }
    if (
      predecessorReceipt.attestation.subject_digest !==
      receipt.predecessor.subject_digest
    ) {
      throw new Error(
        "predecessor subject digest does not match stage linkage",
      );
    }
    if (
      predecessorReceipt.commit_sha !== receipt.commit_sha ||
      predecessorReceipt.target_environment.name !==
        receipt.target_environment.name ||
      predecessorReceipt.target_environment.provider_target !==
        receipt.target_environment.provider_target
    ) {
      throw new Error("predecessor receipt release identity does not match");
    }
  }
  if (
    receipt.stage === "dormant" &&
    receipt.feature_flag_state.state !== "dormant"
  ) {
    throw new Error("dormant stage requires a dormant feature flag");
  }
  if (
    receipt.stage === "enable" &&
    receipt.feature_flag_state.state !== "enabled"
  ) {
    throw new Error("enable stage requires an enabled feature flag");
  }
  if (
    receipt.stage !== "enable" &&
    receipt.feature_flag_state.state === "enabled"
  ) {
    throw new Error("feature flag cannot be enabled before the enable stage");
  }
}

function assertApprovalsAndExceptions(receipt, authenticatedOwner, now) {
  if (!authenticatedOwner) {
    throw new Error("authenticated release owner evidence is required");
  }
  const releaseOwnerApproval = receipt.approvals.find(
    (approval) =>
      approval.role === "release-owner" &&
      approval.actor === authenticatedOwner,
  );
  if (!releaseOwnerApproval) {
    throw new Error("receipt lacks the authenticated release owner approval");
  }

  const verifiedAt = Date.parse(receipt.timestamps.verified_at);
  if (Date.parse(releaseOwnerApproval.approved_at) > verifiedAt) {
    throw new Error("release approval occurs after receipt verification");
  }
  const maxExpiry =
    now.getTime() + policy.exceptions.max_exception_days * 86400000;
  for (const exception of receipt.exceptions) {
    if (!policy.exceptions.allowed_classes.includes(exception.class)) {
      throw new Error("exception class is not allowed by policy");
    }
    if (exception.policy_version !== policy.version) {
      throw new Error("exception policy version is not current");
    }
    if (exception.authenticated_owner !== authenticatedOwner) {
      throw new Error(
        "exception authenticated owner does not match approval evidence",
      );
    }
    if (
      exception.affected_scope.some((scope) =>
        policy.non_overridable_failures.includes(scope),
      )
    ) {
      throw new Error("exception affects a non-overridable failure class");
    }
    const expiresAt = Date.parse(exception.expires_at);
    if (expiresAt <= now.getTime()) throw new Error("exception is expired");
    if (expiresAt > maxExpiry) {
      throw new Error("exception expiry exceeds the seven day policy limit");
    }
  }
}

export function verifyReceipt(
  receipt,
  {
    authenticatedOwner,
    expectedReceiptId,
    now = new Date(),
    predecessorReceipt,
    sourceText,
  } = {},
) {
  const errors = [];
  validateSchemaValue(receipt, schema, "receipt", errors);
  if (errors.length > 0) throw new Error(errors.join("; "));
  if (receipt.policy_version !== policy.version) {
    throw new Error("receipt policy version is not current");
  }
  if (receipt.schema_version !== policy.receipt_schema_version) {
    throw new Error("receipt schema version is not current");
  }
  if (
    receipt.attestation.subject_digest !==
    receipt.artifact_digests.manifest_sha256
  ) {
    throw new Error(
      "attestation subject digest does not match artifact manifest",
    );
  }
  if (
    Date.parse(receipt.timestamps.created_at) >
    Date.parse(receipt.timestamps.verified_at)
  ) {
    throw new Error("receipt timestamps are out of order");
  }
  assertExactSuccessfulChecks(receipt);
  assertStageChain(receipt, predecessorReceipt);
  assertApprovalsAndExceptions(receipt, authenticatedOwner, now);

  const canonicalJson = canonicalReceiptJson(receipt);
  if (sourceText !== undefined && sourceText !== canonicalJson) {
    throw new Error("receipt bytes are not canonical");
  }
  const receiptId = createHash("sha256")
    .update(canonicalJson, "utf8")
    .digest("hex");
  if (expectedReceiptId && receiptId !== expectedReceiptId) {
    throw new Error("receipt digest mismatch; content may be tampered");
  }
  return { receiptId, canonicalJson };
}

async function main() {
  try {
    const receiptPath = process.argv[2];
    const predecessorPath = process.argv[3];
    if (!receiptPath || process.argv.length > 4) {
      throw new Error(
        "usage: verify-receipt.mjs <sha256.receipt.json> [predecessor.receipt.json]",
      );
    }
    const sourceText = fs.readFileSync(receiptPath, "utf8");
    const receipt = JSON.parse(sourceText);
    const filenameMatch = /^([0-9a-f]{64})\.receipt\.json$/.exec(
      path.basename(receiptPath),
    );
    if (!filenameMatch)
      throw new Error("receipt filename is not content-addressed");
    const result = verifyReceipt(receipt, {
      authenticatedOwner: process.env.RELEASE_AUTHENTICATED_OWNER,
      expectedReceiptId: filenameMatch[1],
      predecessorReceipt: predecessorPath
        ? JSON.parse(fs.readFileSync(predecessorPath, "utf8"))
        : undefined,
      sourceText,
    });
    process.stdout.write(
      `${JSON.stringify({ receipt_id: result.receiptId })}\n`,
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
