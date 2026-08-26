import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildCanonicalReceipt,
  writeReceipt,
} from "../../scripts/release/build-receipt.mjs";
import { publishEvidence } from "../../scripts/release/publish-evidence.mjs";
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
    stage: "build",
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
    rollback_references: ["runbook://financial-rollback#build"],
    attestation: {
      provider: "github_oidc",
      subject_digest: SHA_A,
      reference: "https://github.example/attestations/123",
    },
    ...overrides,
  };
}

function validSchemaPredecessor() {
  const build = buildCanonicalReceipt(validInput(), {
    authenticatedOwner: "release-owner",
    now: NOW,
  });
  return buildCanonicalReceipt(
    validInput({
      stage: "schema",
      predecessor: {
        stage: "build",
        receipt_id: build.receiptId,
        subject_digest: build.receipt.attestation.subject_digest,
      },
    }),
    {
      authenticatedOwner: "release-owner",
      now: NOW,
      predecessorReceipt: build.receipt,
    },
  );
}

function withoutPath(input: Record<string, unknown>, fieldPath: string) {
  const clone = structuredClone(input);
  const segments = fieldPath.split(".");
  let cursor: Record<string, unknown> = clone;
  for (const segment of segments.slice(0, -1)) {
    cursor = cursor[segment] as Record<string, unknown>;
  }
  delete cursor[segments.at(-1) as string];
  return clone;
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

  it.each(["../frontend.tar.gz", "nested/frontend.tar.gz", "frontend tar.gz"])(
    "rejects an unsafe artifact name: %s",
    (name) => {
      const input = validInput();
      input.artifact_digests.artifacts[0].name = name;
      expect(() =>
        buildCanonicalReceipt(input, {
          authenticatedOwner: "release-owner",
          now: NOW,
        }),
      ).toThrow(/safe basename/i);
    },
  );

  it.each([
    "../migration.sql",
    "nested/migration.sql",
    "supabase/migrations/../migration.sql",
    "supabase\\migrations\\20260825000001_migration.sql",
  ])("rejects an unsafe migration evidence path: %s", (name) => {
    const input = validInput();
    input.migration_range.hashes[0].name = name;
    expect(() =>
      buildCanonicalReceipt(input, {
        authenticatedOwner: "release-owner",
        now: NOW,
      }),
    ).toThrow(/migration evidence path/i);
  });

  it("rejects duplicate migration evidence paths", () => {
    const duplicate = validInput();
    duplicate.migration_range.hashes.push({
      ...duplicate.migration_range.hashes[0],
    });
    expect(() =>
      buildCanonicalReceipt(duplicate, {
        authenticatedOwner: "release-owner",
        now: NOW,
      }),
    ).toThrow(/duplicates/i);
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

  it.each([
    "artifact_digests.manifest_sha256",
    "artifact_digests.artifacts",
    "artifact_digests.artifacts.0.name",
    "artifact_digests.artifacts.0.sha256",
    "migration_range.from",
    "migration_range.to",
    "migration_range.hashes",
    "migration_range.hashes.0.name",
    "migration_range.hashes.0.sha256",
    "required_checks.0.identity",
    "required_checks.0.result",
    "report_hashes.tests",
    "report_hashes.security",
    "target_environment.name",
    "target_environment.provider_target",
    "feature_flag_state.feature",
    "feature_flag_state.state",
    "approvals.0.actor",
    "approvals.0.role",
    "approvals.0.approved_at",
    "approvals.0.deployment_id",
    "timestamps.created_at",
    "timestamps.verified_at",
    "attestation.provider",
    "attestation.subject_digest",
    "attestation.reference",
  ])("rejects a missing nested D-15 field: %s", (fieldPath) => {
    expect(() =>
      buildCanonicalReceipt(withoutPath(validInput(), fieldPath), {
        authenticatedOwner: "release-owner",
        now: NOW,
      }),
    ).toThrow(/required|wrong type/i);
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
    const predecessor = validSchemaPredecessor();
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
            receipt_id: predecessor.receiptId,
            subject_digest: predecessor.receipt.attestation.subject_digest,
          },
        }),
        {
          authenticatedOwner: "release-owner",
          now: NOW,
          predecessorReceipt: predecessor.receipt,
        },
      ),
    ).not.toThrow();

    expect(() =>
      buildCanonicalReceipt(
        validInput({
          stage: "functions",
          predecessor: {
            stage: "schema",
            receipt_id: predecessor.receiptId,
            subject_digest: predecessor.receipt.attestation.subject_digest,
          },
        }),
        { authenticatedOwner: "release-owner", now: NOW },
      ),
    ).toThrow(/predecessor receipt/i);
  });

  it.each(["stage", "receipt_id", "subject_digest"])(
    "rejects a predecessor missing %s",
    (field) => {
      const predecessor = validSchemaPredecessor();
      const link: Record<string, unknown> = {
        stage: "schema",
        receipt_id: predecessor.receiptId,
        subject_digest: predecessor.receipt.attestation.subject_digest,
      };
      delete link[field];

      expect(() =>
        buildCanonicalReceipt(
          validInput({ stage: "functions", predecessor: link }),
          {
            authenticatedOwner: "release-owner",
            now: NOW,
            predecessorReceipt: predecessor.receipt,
          },
        ),
      ).toThrow(new RegExp(field));
    },
  );

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

  it.each([
    "class",
    "authenticated_owner",
    "linked_issue",
    "affected_scope",
    "rationale",
    "compensating_controls",
    "expires_at",
    "policy_version",
  ])("rejects an exception missing %s", (field) => {
    const exception: Record<string, unknown> = {
      class: "unrelated_nonfinancial",
      authenticated_owner: "release-owner",
      linked_issue: "https://github.example/issues/456",
      affected_scope: ["documentation-link-check"],
      rationale: "The external documentation host is unavailable.",
      compensating_controls: ["Verified cached documentation links"],
      expires_at: "2026-08-31T20:00:00.000Z",
      policy_version: "1.0.0",
    };
    delete exception[field];

    expect(() =>
      buildCanonicalReceipt(validInput({ exceptions: [exception] }), {
        authenticatedOwner: "release-owner",
        now: NOW,
      }),
    ).toThrow(new RegExp(field));
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

function evidenceFiles() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "evidence-test-"));
  temporaryDirectories.push(directory);
  const built = buildCanonicalReceipt(validInput(), {
    authenticatedOwner: "release-owner",
    now: NOW,
  });
  const receiptPath = path.join(directory, `${built.receiptId}.receipt.json`);
  const attestationPath = path.join(directory, "attestation.json");
  const reportPath = path.join(directory, "security-report.json");
  fs.writeFileSync(receiptPath, built.canonicalJson, "utf8");
  fs.writeFileSync(
    attestationPath,
    JSON.stringify({ reference: "github-oidc-attestation-123" }),
    "utf8",
  );
  fs.writeFileSync(
    reportPath,
    JSON.stringify({ summary: "redacted security evidence" }),
    "utf8",
  );
  return { built, receiptPath, attestationPath, reportPath };
}

function privateApi({
  readback,
  existingAssets = [],
}: {
  readback?: string;
  existingAssets?: Array<Record<string, unknown>>;
} = {}) {
  const calls: string[][] = [];
  const assets = [...existingAssets];
  const uploaded = new Map<number, string>();
  let nextAssetId = 100;
  const execute = async (command: string, args: string[]) => {
    calls.push([command, ...args]);
    if (args[0] === "api" && args[1] === "repos/private/evidence") {
      return {
        code: 0,
        stdout: JSON.stringify({
          id: 42,
          visibility: "private",
          default_branch: "main",
        }),
        stderr: "",
      };
    }
    if (args[0] === "api" && args[1]?.includes("/releases/tags/")) {
      return {
        code: 0,
        stdout: JSON.stringify({ id: 84, assets }),
        stderr: "",
      };
    }
    if (args[0] === "release" && args[1] === "upload") {
      const assetArgument = args[3];
      const localPath = assetArgument;
      const name = path.basename(assetArgument);
      const id = nextAssetId++;
      const bytes = fs.readFileSync(localPath, "utf8");
      assets.push({ id, name, size: Buffer.byteLength(bytes) });
      uploaded.set(id, bytes);
      return { code: 0, stdout: "", stderr: "" };
    }
    if (args[0] === "api" && args[1]?.includes("/releases/assets/")) {
      const id = Number(args[1].split("/").at(-1));
      return {
        code: 0,
        stdout: readback ?? uploaded.get(id) ?? "mismatched-existing-bytes",
        stderr: "",
      };
    }
    return { code: 1, stdout: "", stderr: "unexpected fake API call" };
  };
  return { calls, execute };
}

describe("private evidence publisher", () => {
  it.each([
    { repository: undefined, visibility: "private", pattern: /required/i },
    {
      repository: "marmelab/atomic-crm",
      visibility: "private",
      pattern: /source repository/i,
    },
    {
      repository: "Rconman99/atomic-crm",
      visibility: "private",
      pattern: /source repository/i,
    },
    {
      repository: "private/evidence",
      visibility: "public",
      pattern: /private/i,
    },
    {
      repository: "private/evidence",
      visibility: "internal",
      pattern: /private/i,
    },
  ])(
    "rejects $repository with $visibility visibility before upload",
    async ({ repository, visibility, pattern }) => {
      const files = evidenceFiles();
      const calls: string[][] = [];
      const execute = async (command: string, args: string[]) => {
        calls.push([command, ...args]);
        return {
          code: 0,
          stdout: JSON.stringify({ id: 42, visibility }),
          stderr: "",
        };
      };

      await expect(
        publishEvidence({
          repository,
          receiptPath: files.receiptPath,
          attestationPaths: [files.attestationPath],
          reportPaths: [files.reportPath],
          authenticatedOwner: "release-owner",
          now: NOW,
          execute,
        }),
      ).rejects.toThrow(pattern);
      expect(calls.some(([, action]) => action === "release")).toBe(false);
    },
  );

  it("uploads immutable assets privately and verifies authenticated readback", async () => {
    const files = evidenceFiles();
    const api = privateApi();

    const result = await publishEvidence({
      repository: "private/evidence",
      receiptPath: files.receiptPath,
      attestationPaths: [files.attestationPath],
      reportPaths: [files.reportPath],
      authenticatedOwner: "release-owner",
      now: NOW,
      execute: api.execute,
    });

    expect(result).toMatchObject({
      receipt_id: files.built.receiptId,
      destination_id: expect.stringMatching(/^[0-9a-f]{12}$/),
      evidence_url: expect.stringMatching(
        /^https:\/\/api\.github\.com\/repositories\/42\/releases\/assets\/\d+$/,
      ),
      report_hashes: [expect.stringMatching(/^[0-9a-f]{64}$/)],
      readback: "verified",
    });
    expect(JSON.stringify(result)).not.toContain("private/evidence");
    expect(JSON.stringify(result)).not.toContain("redacted security evidence");
    const uploadCalls = api.calls.filter(([, action]) => action === "release");
    expect(uploadCalls).toHaveLength(3);
    expect(uploadCalls.flat()).not.toContain("--clobber");
  });

  it("rejects tampered receipt readback", async () => {
    const files = evidenceFiles();
    const api = privateApi({
      readback: `${files.built.canonicalJson}tampered`,
    });

    await expect(
      publishEvidence({
        repository: "private/evidence",
        receiptPath: files.receiptPath,
        attestationPaths: [files.attestationPath],
        reportPaths: [files.reportPath],
        authenticatedOwner: "release-owner",
        now: NOW,
        execute: api.execute,
      }),
    ).rejects.toThrow(/readback|digest|bytes/i);
  });

  it("rejects a mismatched existing asset without clobber", async () => {
    const files = evidenceFiles();
    const receiptAssetName = `${files.built.receipt.commit_sha}.${files.built.receipt.stage}.${files.built.receiptId}.receipt.json`;
    const api = privateApi({
      existingAssets: [{ id: 77, name: receiptAssetName, size: 10 }],
    });

    await expect(
      publishEvidence({
        repository: "private/evidence",
        receiptPath: files.receiptPath,
        attestationPaths: [files.attestationPath],
        reportPaths: [files.reportPath],
        authenticatedOwner: "release-owner",
        now: NOW,
        execute: api.execute,
      }),
    ).rejects.toThrow(/existing asset|mismatch|immutable/i);
    expect(api.calls.some(([, action]) => action === "release")).toBe(false);
  });
});
