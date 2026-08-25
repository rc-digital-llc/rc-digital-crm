import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildCanonicalReceipt,
  writeReceipt,
} from "../../scripts/release/build-receipt.mjs";
import { verifyReceipt } from "../../scripts/release/verify-receipt.mjs";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const SHA_C = "c".repeat(64);
const NOW = new Date("2026-08-25T20:00:00.000Z");
const requiredChecks = [
  "check / lint",
  "check / typecheck",
  "check / unit",
  "check / build",
  "financial / migration-clean",
  "financial / migration-upgrade",
  "financial / database-contracts",
  "financial / edge-provider-contracts",
  "financial / replay-concurrency",
  "financial / release-security",
];

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: "1.0.0",
    policy_version: "1.0.0",
    stage: "schema",
    predecessor: null,
    commit_sha: "1".repeat(40),
    artifact_digests: {
      manifest_sha256: SHA_A,
      artifacts: [
        { name: "frontend.tar.zst", sha256: SHA_C },
        { name: "functions.tar.zst", sha256: SHA_B },
      ],
    },
    migration_range: {
      from: null,
      to: "20260825000001",
      hashes: [
        { name: "20260825000001_harden.sql", sha256: SHA_C },
        { name: "20240730075029_initial.sql", sha256: SHA_B },
      ],
    },
    required_checks: requiredChecks
      .map((identity) => ({
        identity,
        result: "success",
        url: `https://github.example/check/${encodeURIComponent(identity)}`,
      }))
      .reverse(),
    report_hashes: { tests: SHA_B, security: SHA_C },
    target_environment: {
      name: "production",
      provider_target: "rc-digital-prod",
    },
    feature_flag_state: { feature: "financial-v1", state: "disabled" },
    approvals: [
      {
        actor: "release-owner",
        role: "release-owner",
        approved_at: "2026-08-25T19:55:00.000Z",
        deployment_id: "deployment-123",
      },
    ],
    timestamps: {
      created_at: "2026-08-25T19:50:00.000Z",
      verified_at: "2026-08-25T19:59:00.000Z",
    },
    exceptions: [],
    rollback_references: ["runbook://financial-rollback#schema"],
    attestation: {
      provider: "github_oidc",
      subject_digest: SHA_A,
      reference: "https://github.example/attestations/123",
    },
    ...overrides,
  };
}

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("canonical release receipt", () => {
  it("normalizes identity arrays and ignores undeclared input fields", () => {
    const first = buildCanonicalReceipt(validInput(), {
      authenticatedOwner: "release-owner",
      now: NOW,
    });
    const second = buildCanonicalReceipt(
      {
        ...validInput(),
        undeclared_payload: "must-not-enter-the-receipt",
        artifact_digests: {
          ...(validInput().artifact_digests as object),
          artifacts: [
            { name: "functions.tar.zst", sha256: SHA_B },
            { name: "frontend.tar.zst", sha256: SHA_C },
          ],
        },
      },
      { authenticatedOwner: "release-owner", now: NOW },
    );

    expect(first.canonicalJson).toBe(second.canonicalJson);
    expect(first.receiptId).toBe(second.receiptId);
    expect(first.canonicalJson).not.toContain("undeclared_payload");
  });

  it("changes the content address when any selected field changes", () => {
    const first = buildCanonicalReceipt(validInput(), {
      authenticatedOwner: "release-owner",
      now: NOW,
    });
    const second = buildCanonicalReceipt(
      validInput({
        target_environment: {
          name: "production",
          provider_target: "rc-digital-prod-2",
        },
      }),
      { authenticatedOwner: "release-owner", now: NOW },
    );

    expect(first.receiptId).not.toBe(second.receiptId);
  });

  it.each([
    "schema_version",
    "policy_version",
    "stage",
    "predecessor",
    "commit_sha",
    "artifact_digests",
    "migration_range",
    "required_checks",
    "report_hashes",
    "target_environment",
    "feature_flag_state",
    "approvals",
    "timestamps",
    "exceptions",
    "rollback_references",
    "attestation",
  ])("rejects a missing %s field", (field) => {
    const input = validInput();
    delete input[field as keyof typeof input];

    expect(() =>
      buildCanonicalReceipt(input, {
        authenticatedOwner: "release-owner",
        now: NOW,
      }),
    ).toThrow(new RegExp(field));
  });

  it("rejects tampering after the receipt ID is generated", () => {
    const built = buildCanonicalReceipt(validInput(), {
      authenticatedOwner: "release-owner",
      now: NOW,
    });
    const tampered = JSON.parse(built.canonicalJson);
    tampered.target_environment.provider_target = "attacker-target";

    expect(() =>
      verifyReceipt(tampered, {
        authenticatedOwner: "release-owner",
        expectedReceiptId: built.receiptId,
        now: NOW,
      }),
    ).toThrow(/digest|tamper/i);
  });

  it("requires the exact predecessor for every stage", () => {
    expect(() =>
      buildCanonicalReceipt(
        validInput({ stage: "functions", predecessor: null }),
        { authenticatedOwner: "release-owner", now: NOW },
      ),
    ).toThrow(/predecessor/i);
    expect(() =>
      buildCanonicalReceipt(
        validInput({
          stage: "enable",
          predecessor: {
            stage: "frontend",
            receipt_id: SHA_B,
            subject_digest: SHA_C,
          },
          feature_flag_state: { feature: "financial-v1", state: "enabled" },
        }),
        { authenticatedOwner: "release-owner", now: NOW },
      ),
    ).toThrow(/dormant/i);

    expect(() =>
      buildCanonicalReceipt(
        validInput({
          stage: "functions",
          predecessor: {
            stage: "schema",
            receipt_id: SHA_B,
            subject_digest: SHA_C,
          },
        }),
        { authenticatedOwner: "release-owner", now: NOW },
      ),
    ).not.toThrow();
  });

  it.each([
    {
      name: "expired",
      exception: { expires_at: "2026-08-25T19:58:00.000Z" },
      pattern: /expired/i,
    },
    {
      name: "overlong",
      exception: { expires_at: "2026-09-02T20:00:00.000Z" },
      pattern: /seven|7 day/i,
    },
    {
      name: "non-overridable",
      exception: { affected_scope: ["authorization"] },
      pattern: /non-overridable/i,
    },
    {
      name: "wrong owner",
      exception: { authenticated_owner: "untrusted-actor" },
      pattern: /authenticated owner/i,
    },
  ])("rejects $name exceptions", ({ exception, pattern }) => {
    const completeException = {
      class: "classified_infrastructure",
      authenticated_owner: "release-owner",
      linked_issue: "https://github.example/issues/123",
      affected_scope: ["unrelated-runner-capacity"],
      rationale: "The unrelated runner pool is degraded.",
      compensating_controls: ["Manual second-runner verification"],
      expires_at: "2026-08-31T20:00:00.000Z",
      policy_version: "1.0.0",
      ...exception,
    };

    expect(() =>
      buildCanonicalReceipt(validInput({ exceptions: [completeException] }), {
        authenticatedOwner: "release-owner",
        now: NOW,
      }),
    ).toThrow(pattern);
  });

  it("accepts a complete allowed exception within seven days", () => {
    const exception = {
      class: "unrelated_nonfinancial",
      authenticated_owner: "release-owner",
      linked_issue: "https://github.example/issues/456",
      affected_scope: ["documentation-link-check"],
      rationale: "The external documentation host is unavailable.",
      compensating_controls: ["Verified cached documentation links"],
      expires_at: "2026-08-31T20:00:00.000Z",
      policy_version: "1.0.0",
    };

    expect(() =>
      buildCanonicalReceipt(validInput({ exceptions: [exception] }), {
        authenticatedOwner: "release-owner",
        now: NOW,
      }),
    ).not.toThrow();
  });

  it("requires every exact blocking check to succeed", () => {
    const missing = validInput();
    missing.required_checks = missing.required_checks.slice(1);
    expect(() =>
      buildCanonicalReceipt(missing, {
        authenticatedOwner: "release-owner",
        now: NOW,
      }),
    ).toThrow(/required check/i);

    const failed = validInput();
    failed.required_checks[0].result = "failure";
    expect(() =>
      buildCanonicalReceipt(failed, {
        authenticatedOwner: "release-owner",
        now: NOW,
      }),
    ).toThrow(/success/i);
  });

  it("writes an immutable content-addressed filename without clobber", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "receipt-test-"));
    temporaryDirectories.push(directory);
    const built = writeReceipt(validInput(), directory, {
      authenticatedOwner: "release-owner",
      now: NOW,
    });

    expect(path.basename(built.path)).toBe(`${built.receiptId}.receipt.json`);
    expect(fs.readFileSync(built.path, "utf8")).toBe(built.canonicalJson);
    expect(() =>
      writeReceipt(validInput(), directory, {
        authenticatedOwner: "release-owner",
        now: NOW,
      }),
    ).toThrow(/exists|immutable/i);
  });
});
