import { spawn } from "node:child_process";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { ExactBillingInvoice } from "../types";
import type {
  ExactBillingInvoiceGetRequest,
  ExactBillingInvoiceListRequest,
  ExactBillingInvoiceListResult,
  ExactBillingInvoiceSaveRequest,
} from "../providers/types";
import type { createExactFakeInvoiceProvider as createExactFakeInvoiceProviderExport } from "../providers/fakerest/dataProvider";
import type { dataProvider as liveDataProviderExport } from "../providers/supabase/dataProvider";
import type { supabase as liveSupabaseExport } from "../providers/supabase/supabase";
import {
  DEMO_BILLING_ACCOUNT_ID,
  generateExactBillingInvoices,
} from "../providers/fakerest/dataGenerator/billingAccounts";
import {
  multiplyUsdMoneyByExactRatio,
  parseExactRatio,
  parseOrdinaryPercentage,
  parseUsdMoney,
  USD_HALF_AWAY_ROUNDING_POLICY,
} from "./exactMoney";

let createExactFakeInvoiceProvider: typeof createExactFakeInvoiceProviderExport;
let liveProvider: typeof liveDataProviderExport;
let liveSupabase: typeof liveSupabaseExport;

type ProcessResult = { code: number; stdout: string; stderr: string };
type ExactTestProvider = {
  listExactBillingInvoices(
    request: ExactBillingInvoiceListRequest,
  ): Promise<ExactBillingInvoiceListResult>;
  getExactBillingInvoice(
    request: ExactBillingInvoiceGetRequest,
  ): Promise<ExactBillingInvoice>;
  saveExactBillingInvoice(
    request: ExactBillingInvoiceSaveRequest,
  ): Promise<ExactBillingInvoice>;
};

const repositoryRoot = path.resolve(__dirname, "../../../..");
const expectedContainer = "supabase_db_atomic-crm-demo";
const parityOrganizationId = "34000000-0000-0000-0000-000000000100";
const parityAccountId = "34000000-0000-0000-0000-000000000200";
const parityCompanyId = 340001;
let databaseContainer: string | undefined;
let parityUserId = "";
let paritySalesId = 0;
let paritySeeded = false;
let fakeProvider: ExactTestProvider;

function runProcess(
  command: string,
  args: string[],
  timeoutMs = 20_000,
): Promise<ProcessResult> {
  return new Promise((resolve) => {
    let settled = false;
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const finish = (result: ProcessResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      finish({ code: 124, stdout: "", stderr: "process exceeded timeout" });
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      finish({ code: 127, stdout: "", stderr: error.message });
    });
    child.on("close", (code) => {
      finish({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function psql(sql: string) {
  if (!databaseContainer) throw new Error("database container is unavailable");
  const result = await runProcess(
    "docker",
    [
      "exec",
      databaseContainer,
      "psql",
      "-X",
      "-qAt",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      sql,
    ],
    30_000,
  );
  if (result.code !== 0) {
    throw new Error("service-only exact provider fixture query failed");
  }
  return result.stdout.trim();
}

async function setupLiveProvider() {
  const apiUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  expect(apiUrl).toBeTruthy();
  expect(anonKey).toBeTruthy();
  const parsed = new URL(apiUrl!);
  expect(["127.0.0.1", "localhost"]).toContain(parsed.hostname);
  vi.stubEnv("VITE_SUPABASE_URL", parsed.toString().replace(/\/$/, ""));
  vi.stubEnv("VITE_SB_PUBLISHABLE_KEY", anonKey!);

  const containerResult = await runProcess("docker", [
    "ps",
    "--filter",
    `name=^/${expectedContainer}$`,
    "--format",
    "{{.Names}}",
  ]);
  expect(containerResult.code).toBe(0);
  expect(containerResult.stdout.trim()).toBe(expectedContainer);
  databaseContainer = expectedContainer;

  ({ dataProvider: liveProvider } = await import(
    "../providers/supabase/dataProvider"
  ));
  ({ supabase: liveSupabase } = await import("../providers/supabase/supabase"));
  const credential = ["local", "provider", "parity", "2026!"].join("-");
  const { data: signup, error: signupError } = await liveSupabase.auth.signUp({
    email: "exact-provider-parity@release.example",
    password: credential,
    options: { data: { first_name: "Exact", last_name: "Parity" } },
  });
  expect(signupError).toBeNull();
  expect(signup.user?.id).toMatch(
    /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/,
  );
  parityUserId = signup.user!.id;
  const { data: sales, error: salesError } = await liveSupabase
    .from("sales")
    .select("id")
    .eq("user_id", parityUserId);
  expect(salesError).toBeNull();
  expect(sales).toHaveLength(1);
  paritySalesId = Number(sales![0].id);
  expect(Number.isSafeInteger(paritySalesId)).toBe(true);

  await psql(`BEGIN;
    INSERT INTO public.billing_organizations (id, name, status)
    VALUES ('${parityOrganizationId}', 'Exact Provider Parity', 'active');
    INSERT INTO public.companies (id, name, sales_id)
    VALUES (${parityCompanyId}, 'Exact Provider Parity Company', ${paritySalesId});
    INSERT INTO public.billing_accounts
      (id, organization_id, company_id, customer_name, billing_status)
    VALUES ('${parityAccountId}', '${parityOrganizationId}', ${parityCompanyId}, 'Exact Provider Parity Account', 'active');
    INSERT INTO public.billing_role_assignments
      (organization_id, account_id, sales_id, role)
    VALUES ('${parityOrganizationId}', '${parityAccountId}', ${paritySalesId}, 'operator');
    INSERT INTO public.billing_account_owners
      (organization_id, account_id, sales_id)
    VALUES ('${parityOrganizationId}', '${parityAccountId}', ${paritySalesId});
  COMMIT;`);
  paritySeeded = true;
  fakeProvider = createExactFakeInvoiceProvider({
    accountId: parityAccountId,
    companyId: String(parityCompanyId),
    records: [],
  });
}

async function cleanupLiveProvider() {
  if (!databaseContainer || !parityUserId) return;
  if (paritySeeded) {
    await psql(`BEGIN;
      SET LOCAL session_replication_role = replica;
      DELETE FROM public.billing_audit_events WHERE organization_id = '${parityOrganizationId}';
      DELETE FROM public.invoices WHERE billing_account_id = '${parityAccountId}';
      DELETE FROM public.billing_account_owners WHERE account_id = '${parityAccountId}';
      DELETE FROM public.billing_role_assignments WHERE organization_id = '${parityOrganizationId}';
      DELETE FROM public.billing_accounts WHERE id = '${parityAccountId}';
      DELETE FROM public.billing_organizations WHERE id = '${parityOrganizationId}';
      DELETE FROM public.companies WHERE id = ${parityCompanyId};
      DELETE FROM public.sales WHERE user_id = '${parityUserId}';
      DELETE FROM auth.users WHERE id = '${parityUserId}';
    COMMIT;`);
  }
}

function exactSave(
  invoiceNumber: string,
  amountMinor: string,
  submittedPercentage: string,
  withLineItem = false,
): ExactBillingInvoiceSaveRequest {
  const amount = parseUsdMoney({ amount_minor: amountMinor, currency: "USD" });
  const taxRate = parseOrdinaryPercentage(submittedPercentage);
  const quantityRatio = parseExactRatio({ numerator: "2", denominator: "1" });
  const unitPrice = parseUsdMoney({ amount_minor: "400", currency: "USD" });
  return {
    billing_account_id: parityAccountId,
    invoice_number: invoiceNumber,
    amount,
    tax_rate: taxRate,
    line_items: withLineItem
      ? [
          {
            description: "Two exact units",
            quantity_ratio: quantityRatio,
            unit_price: unitPrice,
            extended_amount: multiplyUsdMoneyByExactRatio(
              unitPrice,
              quantityRatio,
              USD_HALF_AWAY_ROUNDING_POLICY,
            ),
            currency_policy_version: "usd-v1",
            rounding_policy_version: "half-away-from-zero-v1",
          },
        ]
      : [],
    status: "Draft",
    issue_date: "2026-09-01",
  };
}

function financialProjection(record: ExactBillingInvoice) {
  return {
    billing_account_id: record.billing_account_id,
    company_id: record.company_id,
    invoice_number: record.invoice_number,
    amount: record.amount,
    tax_rate: record.tax_rate,
    tax_amount: record.tax_amount,
    total_amount: record.total_amount,
    line_items: record.line_items,
    status: record.status,
    issue_date: record.issue_date,
  };
}

async function errorCode(operation: () => Promise<unknown>) {
  try {
    await operation();
  } catch (error) {
    return error instanceof Error ? error.message : "NON_ERROR_REJECTION";
  }
  return "NO_ERROR";
}

async function liveAuditCount() {
  return Number(
    await psql(
      `SELECT count(*) FROM public.billing_audit_events WHERE organization_id = '${parityOrganizationId}'`,
    ),
  );
}

beforeAll(async () => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      get length() {
        return values.size;
      },
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value),
    } satisfies Storage,
  });
  ({ createExactFakeInvoiceProvider } = await import(
    "../providers/fakerest/dataProvider"
  ));
  if (process.env.SUPABASE_DB_URL) await setupLiveProvider();
});

afterAll(async () => {
  if (liveSupabase) await liveSupabase.auth.signOut({ scope: "global" });
  await cleanupLiveProvider();
});

describe("exact invoice provider parity", () => {
  it("starts FakeRest from canonical deterministic exact records", async () => {
    const provider = createExactFakeInvoiceProvider({
      accountId: DEMO_BILLING_ACCOUNT_ID,
      records: generateExactBillingInvoices(),
    });

    const result = await provider.listExactBillingInvoices({
      mode: "list",
      page: 1,
      per_page: 2,
      sort: "invoice_number",
      order: "ASC",
      filters: { billing_account_id: DEMO_BILLING_ACCOUNT_ID },
    });

    expect(result.total).toBe(4);
    expect(result.data).toHaveLength(2);
    expect(JSON.stringify(result.data)).not.toMatch(
      /"(?:amount_minor|numerator|denominator)":-?[0-9]/,
    );
  });

  it.runIf(Boolean(process.env.SUPABASE_DB_URL))(
    "matches live Supabase save/get/list canonical records and pagination",
    async () => {
      const providers: ExactTestProvider[] = [liveProvider, fakeProvider];
      const saved = await Promise.all(
        providers.map((provider) =>
          provider.saveExactBillingInvoice(
            exactSave("PARITY-8875", "800", "8.875%", true),
          ),
        ),
      );
      expect(saved.map(financialProjection)).toEqual([
        financialProjection(saved[0]),
        financialProjection(saved[0]),
      ]);
      expect(saved[0]).toMatchObject({
        amount: { amount_minor: "800", currency: "USD" },
        tax_rate: {
          numerator: "71",
          denominator: "800",
          submitted_percentage: "8.875%",
        },
        tax_amount: { amount_minor: "71", currency: "USD" },
        total_amount: { amount_minor: "871", currency: "USD" },
      });

      const fetched = await Promise.all(
        providers.map((provider, index) =>
          provider.getExactBillingInvoice({
            mode: "get",
            invoice_id: saved[index].id,
          }),
        ),
      );
      expect(fetched.map(financialProjection)).toEqual(
        saved.map(financialProjection),
      );

      await Promise.all(
        providers.map((provider) =>
          provider.saveExactBillingInvoice(
            exactSave("PARITY-MAX", "9223372036854775807", "0%"),
          ),
        ),
      );
      await Promise.all(
        providers.map((provider) =>
          provider.saveExactBillingInvoice(
            exactSave("PARITY-MIN", "-9223372036854775808", "0%"),
          ),
        ),
      );
      const pages = await Promise.all(
        providers.map((provider) =>
          provider.listExactBillingInvoices({
            mode: "list",
            page: 2,
            per_page: 1,
            sort: "invoice_number",
            order: "ASC",
            filters: { billing_account_id: parityAccountId },
          }),
        ),
      );
      expect(pages.map((page) => page.total)).toEqual([3, 3]);
      expect(pages.map((page) => page.data[0].invoice_number)).toEqual([
        "PARITY-MAX",
        "PARITY-MAX",
      ]);
      expect(pages.map((page) => page.data[0].amount.amount_minor)).toEqual([
        "9223372036854775807",
        "9223372036854775807",
      ]);
    },
  );

  it.runIf(Boolean(process.env.SUPABASE_DB_URL))(
    "matches safe error codes and preserves effects for invalid inputs",
    async () => {
      const providers: ExactTestProvider[] = [liveProvider, fakeProvider];
      const beforeLists = await Promise.all(
        providers.map((provider) =>
          provider.listExactBillingInvoices({
            mode: "list",
            page: 1,
            per_page: 100,
            sort: "id",
            order: "ASC",
            filters: {},
          }),
        ),
      );
      const beforeAudit = await liveAuditCount();
      const validBase = exactSave("PARITY-INVALID", "1", "0%");
      const invalidSaves = [
        {
          ...validBase,
          amount: { amount_minor: 1, currency: "USD" },
        },
        {
          ...validBase,
          amount: { amount_minor: "1".repeat(65), currency: "USD" },
        },
        {
          ...validBase,
          amount: { amount_minor: "1", currency: "EUR" },
        },
        {
          ...validBase,
          tax_rate: {
            kind: "ordinary_percentage",
            numerator: "1",
            denominator: "8",
            submitted_percentage: "100.1234567890%",
            rate_policy_version: "ordinary-percentage-v1",
          },
        },
        {
          ...validBase,
          tax_rate: {
            ...validBase.tax_rate,
            rate_policy_version: "ordinary-percentage-v2",
          },
        },
        {
          billing_account_id: parityAccountId,
          invoice_number: "PARITY-LEGACY",
          amount: 1,
          tax_rate: 0,
          line_items: [{ quantity: 1, rate: 1, amount: 1 }],
          status: "Draft",
        },
      ];
      for (const provider of providers) {
        for (const invalidSave of invalidSaves) {
          expect(
            await errorCode(() =>
              provider.saveExactBillingInvoice(
                invalidSave as unknown as ExactBillingInvoiceSaveRequest,
              ),
            ),
          ).toBe("INVOICE_SAVE_INVALID_REQUEST");
        }
        expect(
          await errorCode(() =>
            provider.saveExactBillingInvoice({
              ...exactSave("PARITY-UNKNOWN", "1", "0%"),
              idempotency_key: "not-phase-three",
            } as ExactBillingInvoiceSaveRequest),
          ),
        ).toBe("INVOICE_SAVE_INVALID_REQUEST");
        expect(
          await errorCode(() =>
            provider.listExactBillingInvoices({
              mode: "list",
              page: 1,
              per_page: 25,
              sort: "id",
              order: "ASC",
              filters: {},
              organization_id: parityOrganizationId,
            } as ExactBillingInvoiceListRequest),
          ),
        ).toBe("INVOICE_READ_INVALID_REQUEST");
        expect(
          await errorCode(() =>
            provider.saveExactBillingInvoice({
              ...exactSave("PARITY-CROSS", "1", "0%"),
              billing_account_id: "35000000-0000-0000-0000-000000000200",
            }),
          ),
        ).toBe("INVOICE_SAVE_NOT_AUTHORIZED");
      }

      const crossScope = await Promise.all(
        providers.map((provider) =>
          provider.listExactBillingInvoices({
            mode: "list",
            page: 1,
            per_page: 25,
            sort: "id",
            order: "ASC",
            filters: {
              billing_account_id: "35000000-0000-0000-0000-000000000200",
            },
          }),
        ),
      );
      expect(crossScope).toEqual([
        { data: [], total: 0 },
        { data: [], total: 0 },
      ]);
      const afterLists = await Promise.all(
        providers.map((provider) =>
          provider.listExactBillingInvoices({
            mode: "list",
            page: 1,
            per_page: 100,
            sort: "id",
            order: "ASC",
            filters: {},
          }),
        ),
      );
      expect(afterLists.map((result) => result.total)).toEqual(
        beforeLists.map((result) => result.total),
      );
      expect(await liveAuditCount()).toBe(beforeAudit);
    },
  );
});
