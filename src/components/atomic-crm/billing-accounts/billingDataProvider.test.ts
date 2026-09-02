import fs from "node:fs";

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import generateData from "../providers/fakerest/dataGenerator";
import {
  DEMO_BILLING_ACCOUNT_ID,
  DEMO_CLEAN_EVIDENCE_ID,
  DEMO_EVIDENCE_EXPIRES_AT,
  DEMO_EVIDENCE_NOW,
  DEMO_QUARANTINED_EVIDENCE_ID,
} from "../providers/fakerest/dataGenerator/billingAccounts";
import type {
  BillingAccount,
  BillingContact,
  BillingEvidenceMetadata,
  BillingRoleAssignment,
} from "../types";
import type {
  BillingEvidenceDownloadRequest,
  BillingEvidenceInspectionRequest,
  BillingEvidenceUploadRequest,
  CrmDataProvider,
} from "../providers/types";

import {
  billingAccountProviderMethodKeys,
  billingEvidenceProviderMethodKeys,
  billingResourceNames,
} from "../providers/types";

const mocks = vi.hoisted(() => {
  const invoke = vi.fn();
  const noop = vi.fn();
  const baseDataProvider = {
    create: noop,
    delete: noop,
    deleteMany: noop,
    getList: noop,
    getMany: noop,
    getManyReference: noop,
    getOne: noop,
    update: noop,
    updateMany: noop,
  };
  return { baseDataProvider, invoke };
});

vi.mock("ra-supabase-core", () => ({
  supabaseAuthProvider: () => ({
    checkAuth: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  }),
  supabaseDataProvider: () => mocks.baseDataProvider,
}));

vi.mock("../providers/supabase/supabase", () => ({
  supabase: {
    auth: { signUp: vi.fn() },
    functions: { invoke: mocks.invoke },
    storage: { from: vi.fn() },
  },
}));

let liveProvider: CrmDataProvider;
let fakeProvider: CrmDataProvider;

const memoryStorage = (() => {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  } satisfies Storage;
})();

beforeAll(async () => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: memoryStorage,
  });
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("VITE_SB_PUBLISHABLE_KEY", "test-publishable-key");
  ({ dataProvider: liveProvider } = await import(
    "../providers/supabase/dataProvider"
  ));
  ({ dataProvider: fakeProvider } = await import(
    "../providers/fakerest/dataProvider"
  ));
});

describe("billing provider parity", () => {
  it("exposes the atomic billing account boundary command in both providers", () => {
    expect(
      billingAccountProviderMethodKeys.filter(
        (key) => typeof liveProvider[key] === "function",
      ),
    ).toEqual(billingAccountProviderMethodKeys);
    expect(
      billingAccountProviderMethodKeys.filter(
        (key) => typeof fakeProvider[key] === "function",
      ),
    ).toEqual(billingAccountProviderMethodKeys);
  });

  it("exposes the same explicit billing command methods in both providers", () => {
    expect(
      billingEvidenceProviderMethodKeys.filter(
        (key) => typeof liveProvider[key] === "function",
      ),
    ).toEqual(billingEvidenceProviderMethodKeys);
    expect(
      billingEvidenceProviderMethodKeys.filter(
        (key) => typeof fakeProvider[key] === "function",
      ),
    ).toEqual(billingEvidenceProviderMethodKeys);
  });

  it("registers every shared billing resource in the FakeRest database", () => {
    const data = generateData();
    expect(
      billingResourceNames.filter((resource) => Array.isArray(data[resource])),
    ).toEqual(billingResourceNames);
  });

  it("generates deterministic reserved-example billing fixtures without authority material", () => {
    const selectBillingData = (data: ReturnType<typeof generateData>) => ({
      billing_organizations: data.billing_organizations,
      billing_accounts: data.billing_accounts,
      billing_account_owners: data.billing_account_owners,
      billing_contacts: data.billing_contacts,
      billing_role_assignments: data.billing_role_assignments,
      billing_automation_principals: data.billing_automation_principals,
      billing_automation_grants: data.billing_automation_grants,
      billing_evidence_support_safe: data.billing_evidence_support_safe,
      billing_evidence_access_events: data.billing_evidence_access_events,
    });
    const first = selectBillingData(generateData());
    const second = selectBillingData(generateData());
    const serialized = JSON.stringify(first);

    expect(first).toEqual(second);
    expect(first.billing_contacts[0]?.email).toMatch(/@example\.com$/);
    expect(first.billing_automation_principals).toEqual([]);
    expect(first.billing_automation_grants).toEqual([]);
    expect(serialized).not.toMatch(
      /object_path|provider_reference|provider_secret|signed_token|https?:\/\//i,
    );
  });

  it("keeps generator modules independent from the data provider", () => {
    const generatorFiles = [
      "../providers/fakerest/dataGenerator/billingAccounts.ts",
      "../providers/fakerest/dataGenerator/types.ts",
      "../providers/fakerest/dataGenerator/index.ts",
      "../providers/fakerest/dataGenerator/finalize.ts",
    ];

    for (const relativePath of generatorFiles) {
      const source = fs.readFileSync(
        new URL(relativePath, import.meta.url),
        "utf8",
      );
      expect(source).not.toMatch(/from\s+["'][^"']*dataProvider["']/);
    }
  });

  it("mirrors quarantine, inspection, and short-lived capability outcomes", async () => {
    await expect(
      fakeProvider.createBillingEvidenceDownload({
        evidence_id: DEMO_QUARANTINED_EVIDENCE_ID,
        purpose: "review",
      }),
    ).resolves.toEqual({
      result: "denied",
      reason_code: "EVIDENCE_QUARANTINED",
    });

    const cleanDownload = await fakeProvider.createBillingEvidenceDownload({
      evidence_id: DEMO_CLEAN_EVIDENCE_ID,
      purpose: "review",
    });
    expect(cleanDownload).toMatchObject({
      result: "ready",
      evidence_id: DEMO_CLEAN_EVIDENCE_ID,
      expires_at: DEMO_EVIDENCE_EXPIRES_AT,
    });
    expect(cleanDownload.result === "ready" ? cleanDownload.url : "").toMatch(
      /^demo:\/\/billing-evidence\/download\//,
    );
    expect(
      Date.parse(DEMO_EVIDENCE_EXPIRES_AT) - Date.parse(DEMO_EVIDENCE_NOW),
    ).toBe(60_000);

    const upload = await fakeProvider.beginBillingEvidenceUpload({
      account_id: DEMO_BILLING_ACCOUNT_ID,
      kind: "revenue_statement",
      original_filename: "example-statement.pdf",
      mime_type: "application/pdf",
      size_bytes: 2048,
      sha256: "c".repeat(64),
      purpose: "operator_upload",
    });
    expect(upload.result).toBe("ready");
    if (upload.result !== "ready") throw new Error("demo upload was denied");
    expect(upload.url).toMatch(/^demo:\/\/billing-evidence\/upload\//);
    expect(upload.url).not.toMatch(/^https?:/);

    const { data: uploadedEvidence } =
      await fakeProvider.getOne<BillingEvidenceMetadata>(
        "billing_evidence_support_safe",
        { id: upload.evidence_id },
      );
    expect(uploadedEvidence).toMatchObject({
      account_id: DEMO_BILLING_ACCOUNT_ID,
      inspection_status: "quarantined",
      lifecycle_status: "active",
    });
    expect(uploadedEvidence).not.toHaveProperty("object_path");
    expect(uploadedEvidence).not.toHaveProperty("sha256");

    await expect(
      fakeProvider.finalizeBillingEvidenceInspection({
        evidence_id: upload.evidence_id,
        decision: "clean",
        reason_code: "DEMO_SCAN_CLEAN",
        idempotency_key: "demo-inspection-0001",
      }),
    ).resolves.toMatchObject({
      result: "applied",
      evidence_id: upload.evidence_id,
      decision: "clean",
    });
    await expect(
      fakeProvider.createBillingEvidenceDownload({
        evidence_id: upload.evidence_id,
        purpose: "download",
      }),
    ).resolves.toMatchObject({
      result: "ready",
      evidence_id: upload.evidence_id,
      expires_at: DEMO_EVIDENCE_EXPIRES_AT,
    });
  });
});

beforeEach(() => {
  mocks.invoke.mockReset();
});

describe("billing provider contracts", () => {
  it("types account, contact, access, and evidence records without browser authority", () => {
    const account = {
      id: "billing-account-example-001",
      organization_id: "billing-organization-example-001",
      company_id: null,
      customer_name: "Example Customer One",
      billing_status: "active",
      created_at: "2026-09-01T20:00:00.000Z",
      updated_at: "2026-09-01T20:00:00.000Z",
      ended_at: null,
      end_reason: null,
    } satisfies BillingAccount;
    const contact = {
      id: "billing-contact-example-001",
      organization_id: account.organization_id,
      account_id: account.id,
      name: "Example Billing Contact",
      email: "billing-contact@example.com",
      phone: null,
      preferred_contact_method: "email",
      auth_user_id: null,
      active: true,
      effective_from: "2026-09-01T20:00:00.000Z",
      effective_until: null,
      end_reason: null,
      created_at: "2026-09-01T20:00:00.000Z",
      updated_at: "2026-09-01T20:00:00.000Z",
    } satisfies BillingContact;
    const assignment = {
      id: "billing-assignment-example-001",
      organization_id: account.organization_id,
      account_id: account.id,
      sales_id: 1,
      role: "operator",
      valid_from: "2026-09-01T20:00:00.000Z",
      valid_until: null,
      disabled_at: null,
      disabled_reason: null,
      created_at: "2026-09-01T20:00:00.000Z",
      updated_at: "2026-09-01T20:00:00.000Z",
    } satisfies BillingRoleAssignment;
    const evidence = {
      id: "billing-evidence-example-001",
      organization_id: account.organization_id,
      account_id: account.id,
      kind: "contract",
      original_filename: "service-agreement.pdf",
      uploader_label: "RC Digital Owner",
      mime_type: "application/pdf",
      size_bytes: 1024,
      inspection_status: "quarantined",
      inspection_reason_code: null,
      retention_expires_at: "2030-01-01T00:00:00.000Z",
      is_held: false,
      lifecycle_status: "active",
      end_reason: null,
      created_at: "2026-09-01T20:00:00.000Z",
      updated_at: "2026-09-01T20:00:00.000Z",
    } satisfies BillingEvidenceMetadata;

    expect({ account, contact, assignment, evidence }).toMatchObject({
      evidence: { inspection_status: "quarantined", is_held: false },
    });
    expect(evidence).not.toHaveProperty("object_path");
    expect(evidence).not.toHaveProperty("sha256");
  });

  it("keeps authority fields out of every browser evidence request type", () => {
    type ForbiddenRequestKey =
      | "organization_id"
      | "object_path"
      | "provider_reference"
      | "provider_secret"
      | "signed_token"
      | "details";
    type UploadLeak = Extract<
      keyof BillingEvidenceUploadRequest,
      ForbiddenRequestKey
    >;
    type InspectionLeak = Extract<
      keyof BillingEvidenceInspectionRequest,
      ForbiddenRequestKey
    >;
    type DownloadLeak = Extract<
      keyof BillingEvidenceDownloadRequest,
      ForbiddenRequestKey
    >;
    const noLeaks: [
      UploadLeak extends never ? true : false,
      InspectionLeak extends never ? true : false,
      DownloadLeak extends never ? true : false,
    ] = [true, true, true];

    expect(noLeaks).toEqual([true, true, true]);
  });

  it("sends only allowlisted upload fields to the billing evidence command", async () => {
    const request = {
      account_id: "billing-account-example-001",
      kind: "revenue_statement",
      original_filename: "statement-example.pdf",
      mime_type: "application/pdf",
      size_bytes: 1024,
      sha256: "a".repeat(64),
      purpose: "operator_upload",
    } satisfies BillingEvidenceUploadRequest;
    const response = {
      result: "ready",
      evidence_id: "billing-evidence-example-001",
      url: "https://storage.example.invalid/upload/example",
      expires_at: "2026-09-01T20:01:00.000Z",
    } as const;
    mocks.invoke.mockResolvedValueOnce({ data: response, error: null });

    await expect(
      liveProvider.beginBillingEvidenceUpload(request),
    ).resolves.toEqual(response);
    expect(mocks.invoke).toHaveBeenCalledWith("billing_evidence", {
      method: "POST",
      body: { command: "upload", ...request },
    });
  });

  it("maps inspection and download through explicit command discriminants", async () => {
    const inspection = {
      evidence_id: "billing-evidence-example-001",
      decision: "clean",
      reason_code: "SCAN_CLEAN",
      idempotency_key: "inspection-example-0001",
    } satisfies BillingEvidenceInspectionRequest;
    const download = {
      evidence_id: "billing-evidence-example-001",
      purpose: "review",
    } satisfies BillingEvidenceDownloadRequest;
    mocks.invoke
      .mockResolvedValueOnce({
        data: {
          result: "applied",
          reason_code: "INSPECTION_RECORDED",
          evidence_id: inspection.evidence_id,
          decision: inspection.decision,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          result: "ready",
          evidence_id: download.evidence_id,
          url: "https://storage.example.invalid/download/example",
          expires_at: "2026-09-01T20:01:00.000Z",
        },
        error: null,
      });

    await liveProvider.finalizeBillingEvidenceInspection(inspection);
    await liveProvider.createBillingEvidenceDownload(download);

    expect(mocks.invoke.mock.calls).toEqual([
      [
        "billing_evidence",
        { method: "POST", body: { command: "inspection", ...inspection } },
      ],
      [
        "billing_evidence",
        { method: "POST", body: { command: "download", ...download } },
      ],
    ]);
  });
});
