#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalReceiptJson,
  computeReceiptId,
  verifyReceipt,
} from "./verify-receipt.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");
const schema = JSON.parse(
  fs.readFileSync(
    path.join(repositoryRoot, ".github/release/release-receipt.schema.json"),
    "utf8",
  ),
);

function resolveReference(definition) {
  if (!definition?.$ref) return definition;
  return schema.$defs[definition.$ref.slice("#/$defs/".length)];
}

function selectDeclared(value, definition) {
  const resolved = resolveReference(definition);
  if (Array.isArray(value)) {
    return value.map((item) => selectDeclared(item, resolved.items));
  }
  if (value && typeof value === "object" && resolved?.properties) {
    return Object.fromEntries(
      Object.keys(resolved.properties)
        .filter((key) => Object.hasOwn(value, key))
        .map((key) => [
          key,
          selectDeclared(value[key], resolved.properties[key]),
        ]),
    );
  }
  return value;
}

function sortByKeys(values, keys) {
  return [...values].sort((left, right) => {
    const leftIdentity = keys.map((key) => left[key] ?? "").join("\u0000");
    const rightIdentity = keys.map((key) => right[key] ?? "").join("\u0000");
    return leftIdentity.localeCompare(rightIdentity);
  });
}

export function selectAndNormalizeReceipt(input) {
  const receipt = selectDeclared(input, schema);
  if (receipt.artifact_digests?.artifacts) {
    receipt.artifact_digests.artifacts = sortByKeys(
      receipt.artifact_digests.artifacts,
      ["name", "sha256"],
    );
  }
  if (receipt.migration_range?.hashes) {
    receipt.migration_range.hashes = sortByKeys(
      receipt.migration_range.hashes,
      ["name", "sha256"],
    );
  }
  if (receipt.required_checks) {
    receipt.required_checks = sortByKeys(receipt.required_checks, ["identity"]);
  }
  if (receipt.approvals) {
    receipt.approvals = sortByKeys(receipt.approvals, [
      "deployment_id",
      "actor",
      "approved_at",
    ]);
  }
  if (receipt.exceptions) {
    receipt.exceptions = sortByKeys(
      receipt.exceptions.map((exception) => ({
        ...exception,
        affected_scope: [...(exception.affected_scope ?? [])].sort(),
        compensating_controls: [
          ...(exception.compensating_controls ?? []),
        ].sort(),
      })),
      ["linked_issue", "class"],
    );
  }
  if (receipt.rollback_references) {
    receipt.rollback_references = [...receipt.rollback_references].sort();
  }
  return receipt;
}

export function buildCanonicalReceipt(input, options = {}) {
  const receipt = selectAndNormalizeReceipt(input);
  verifyReceipt(receipt, options);
  const canonicalJson = canonicalReceiptJson(receipt);
  const receiptId = computeReceiptId(receipt);
  return { receipt, canonicalJson, receiptId };
}

export function writeReceipt(input, outputDirectory, options = {}) {
  const built = buildCanonicalReceipt(input, options);
  fs.mkdirSync(outputDirectory, { recursive: true });
  const receiptPath = path.join(
    outputDirectory,
    `${built.receiptId}.receipt.json`,
  );
  let descriptor;
  try {
    descriptor = fs.openSync(receiptPath, "wx", 0o600);
    fs.writeFileSync(descriptor, built.canonicalJson, "utf8");
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error(
        "content-addressed receipt already exists and is immutable",
      );
    }
    throw error;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
  return { ...built, path: receiptPath };
}

async function main() {
  try {
    const inputPath = process.argv[2];
    const outputDirectory = process.argv[3];
    const predecessorPath = process.argv[4];
    if (!inputPath || !outputDirectory || process.argv.length > 5) {
      throw new Error(
        "usage: build-receipt.mjs <input.json> <output-directory> [predecessor.receipt.json]",
      );
    }
    const input = JSON.parse(fs.readFileSync(inputPath, "utf8"));
    const built = writeReceipt(input, outputDirectory, {
      authenticatedOwner: process.env.RELEASE_AUTHENTICATED_OWNER,
      predecessorReceipt: predecessorPath
        ? JSON.parse(fs.readFileSync(predecessorPath, "utf8"))
        : undefined,
    });
    process.stdout.write(
      `${JSON.stringify({ receipt_id: built.receiptId, path: built.path })}\n`,
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
