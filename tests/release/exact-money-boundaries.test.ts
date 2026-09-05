import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { EXACT_BILLING_INVOICE_MAX_PAGE } from "../../src/components/atomic-crm/providers/types";
import type { CrmDataProvider } from "../../src/components/atomic-crm/providers/types";

const mocks = vi.hoisted(() => {
  const rpc = vi.fn();
  const baseDataProvider = {
    create: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    getList: vi.fn(),
    getMany: vi.fn(),
    getManyReference: vi.fn(),
    getOne: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  };
  return { baseDataProvider, rpc };
});

vi.mock("ra-supabase-core", () => ({
  supabaseAuthProvider: () => ({
    checkAuth: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
  }),
  supabaseDataProvider: () => mocks.baseDataProvider,
}));

vi.mock("../../src/components/atomic-crm/providers/supabase/supabase", () => ({
  supabase: {
    auth: { signUp: vi.fn() },
    functions: { invoke: vi.fn() },
    rpc: mocks.rpc,
    storage: { from: vi.fn() },
  },
}));

type ExactInvoiceProvider = CrmDataProvider & {
  getExactBillingInvoice(invoiceId: string): Promise<{ data: unknown }>;
  listExactBillingInvoices(params: {
    filter?: Record<string, unknown>;
    pagination?: { page: number; perPage: number };
    sort?: { field: string; order: string };
  }): Promise<{ data: unknown[]; total: number }>;
  saveExactBillingInvoice(request: Record<string, unknown>): Promise<unknown>;
};

const accountId = "21000000-0000-0000-0000-000000000200";
const organizationId = "21000000-0000-0000-0000-000000000100";
const exactRate = {
  kind: "ordinary_percentage",
  numerator: "1",
  denominator: "8",
  submitted_percentage: "12.500%",
  rate_policy_version: "ordinary-percentage-v1",
} as const;
const exactLineItem = {
  quantity_ratio: { numerator: "1", denominator: "1" },
  unit_price: { amount_minor: "1000", currency: "USD" },
  extended_amount: { amount_minor: "1000", currency: "USD" },
  currency_policy_version: "usd-v1",
  rounding_policy_version: "half-away-from-zero-v1",
} as const;
const exactInvoice = {
  id: "210001",
  organization_id: organizationId,
  billing_account_id: accountId,
  company_id: "210001",
  sales_id: "1",
  invoice_number: "EXACT-PROVIDER-001",
  description: "Exact provider fixture",
  amount: { amount_minor: "1000", currency: "USD" },
  currency_policy_version: "usd-v1",
  tax_rate: exactRate,
  tax_amount: { amount_minor: "125", currency: "USD" },
  total_amount: { amount_minor: "1125", currency: "USD" },
  rounding_policy_version: "half-away-from-zero-v1",
  line_items: [exactLineItem],
  status: "Draft",
  issue_date: "2026-09-04",
  terms: "Payment due within 30 days of invoice date.",
  created_at: "2026-09-04T20:00:00+00:00",
  updated_at: "2026-09-04T20:00:00+00:00",
} as const;
const exactSaveRequest = {
  billing_account_id: accountId,
  invoice_number: "EXACT-PROVIDER-001",
  description: "Exact provider fixture",
  amount: { amount_minor: "1000", currency: "USD" },
  currency_policy_version: "usd-v1",
  tax_rate: exactRate,
  rounding_policy_version: "half-away-from-zero-v1",
  line_items: [exactLineItem],
  status: "Draft",
  issue_date: "2026-09-04",
} as const;

let provider: ExactInvoiceProvider;

beforeAll(async () => {
  vi.stubEnv("VITE_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("VITE_SB_PUBLISHABLE_KEY", "test-publishable-key");
  ({ dataProvider: provider } = (await import(
    "../../src/components/atomic-crm/providers/supabase/dataProvider"
  )) as { dataProvider: ExactInvoiceProvider });
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Supabase exact invoice provider contract", () => {
  it("maps React Admin list pagination, sorting, and filters to one closed exact RPC", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { data: [exactInvoice], total: 1 },
      error: null,
    });

    await expect(
      provider.getList("invoices", {
        pagination: { page: 2, perPage: 25 },
        sort: { field: "total_amount_minor", order: "ASC" },
        filter: { billing_account_id: accountId, status: "Draft" },
      }),
    ).resolves.toEqual({ data: [exactInvoice], total: 1 });
    expect(mocks.rpc).toHaveBeenCalledWith("read_billing_invoices_exact", {
      mode: "list",
      page: 2,
      per_page: 25,
      sort: "total_amount_minor",
      order: "ASC",
      filters: { billing_account_id: accountId, status: "Draft" },
    });
    expect(mocks.baseDataProvider.getList).not.toHaveBeenCalled();
  });

  it("routes get and save operations through exact RPCs without save identity fields", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: { data: exactInvoice }, error: null })
      .mockResolvedValueOnce({
        data: { result: "saved", data: exactInvoice },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { result: "saved", data: exactInvoice },
        error: null,
      });

    await expect(
      provider.getOne("invoices", { id: "210001" }),
    ).resolves.toEqual({ data: exactInvoice });
    await expect(
      provider.create("invoices", { data: exactSaveRequest }),
    ).resolves.toEqual({ data: exactInvoice });
    await expect(
      provider.update("invoices", {
        id: "210001",
        data: exactSaveRequest,
        previousData: exactInvoice,
      }),
    ).resolves.toEqual({ data: exactInvoice });

    expect(mocks.rpc.mock.calls).toEqual([
      ["read_billing_invoices_exact", { mode: "get", invoice_id: "210001" }],
      ["save_billing_invoice_exact", exactSaveRequest],
      ["save_billing_invoice_exact", { ...exactSaveRequest, id: "210001" }],
    ]);
    expect(JSON.stringify(mocks.rpc.mock.calls)).not.toMatch(
      /idempotency|fingerprint/,
    );
    expect(mocks.baseDataProvider.getOne).not.toHaveBeenCalled();
    expect(mocks.baseDataProvider.create).not.toHaveBeenCalled();
    expect(mocks.baseDataProvider.update).not.toHaveBeenCalled();
  });

  it("rejects unsafe React Admin request keys before making an RPC call", async () => {
    await expect(
      provider.getList("invoices", {
        pagination: { page: 1, perPage: 50 },
        sort: { field: "created_at", order: "DESC" },
        filter: { organization_id: organizationId },
      }),
    ).rejects.toThrow("INVOICE_READ_INVALID_REQUEST");
    await expect(
      provider.getList("invoices", {
        pagination: { page: 0, perPage: 101 },
        sort: { field: "amount", order: "SIDEWAYS" },
        filter: {},
      }),
    ).rejects.toThrow("INVOICE_READ_INVALID_REQUEST");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects invoice saves whose line total does not equal the amount", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "server should not be reached" },
    });

    await expect(
      provider.saveExactBillingInvoice({
        ...exactSaveRequest,
        line_items: [],
      }),
    ).rejects.toThrow("INVOICE_SAVE_INVALID_REQUEST");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects year-zero invoice dates before making an RPC call", async () => {
    for (const request of [
      { ...exactSaveRequest, issue_date: "0000-01-01" },
      { ...exactSaveRequest, due_date: "0000-02-29" },
    ]) {
      await expect(provider.saveExactBillingInvoice(request)).rejects.toThrow(
        "INVOICE_SAVE_INVALID_REQUEST",
      );
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("validates every exact response before returning branded financial values", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: {
        data: [
          {
            ...exactInvoice,
            amount: { amount_minor: 9_007_199_254_740_992, currency: "USD" },
          },
        ],
        total: 1,
      },
      error: null,
    });

    await expect(
      provider.listExactBillingInvoices({
        pagination: { page: 1, perPage: 50 },
        sort: { field: "created_at", order: "DESC" },
        filter: {},
      }),
    ).rejects.toThrow("INVOICE_READ_INVALID_RESPONSE");
  });
});

type BillingRole =
  | "administrator"
  | "operator"
  | "reviewer"
  | "auditor"
  | "customer"
  | "disabled-operator";
type TenantName = "alpha" | "bravo";
type Principal = {
  accessToken: string;
  role: BillingRole;
  salesId: number;
  tenant: TenantName;
  userId: string;
};
type ProcessResult = { code: number; stdout: string; stderr: string };
type InvoiceEffectSnapshot = {
  audit_count: number;
  automation_executions: number;
  invoice_count: number;
  sequence: { is_called: boolean; last_value: string };
};

const repositoryRoot = path.resolve(__dirname, "../..");
const projectId = fs
  .readFileSync(path.join(repositoryRoot, "supabase/config.toml"), "utf8")
  .match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
if (!projectId) throw new Error("supabase project_id is unavailable");
const expectedContainer = `supabase_db_${projectId}`;
const apiUrl = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const livePrincipals: Principal[] = [];
const liveAccounts = {
  alpha: {
    organizationId: "21500000-0000-0000-0000-000000000100",
    accountId: "21500000-0000-0000-0000-000000000250",
    companyId: 215051,
  },
  bravo: {
    organizationId: "22500000-0000-0000-0000-000000000100",
    accountId: "22500000-0000-0000-0000-000000000250",
    companyId: 225051,
  },
} as const;
const liveInvoiceIds = {
  rate8875: "975001",
  rate12500: "975002",
  minimum: "975003",
  maximum: "975004",
} as const;
let databaseContainer: string | undefined;

function localApiConfiguration() {
  expect(apiUrl).toBeTruthy();
  expect(anonKey).toBeTruthy();
  const parsed = new URL(apiUrl!);
  expect(["127.0.0.1", "localhost"]).toContain(parsed.hostname);
  return { apiUrl: parsed.toString().replace(/\/$/, ""), anonKey: anonKey! };
}

function redact(value: string) {
  return value
    .replace(
      /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
      "[REDACTED_JWT]",
    )
    .replace(/postgresql:\/\/[^\s]+/g, "[REDACTED_DATABASE_URL]")
    .replace(/((?:key|token|secret|password)\s*[=:]\s*)\S+/gi, "$1[REDACTED]");
}

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
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      finish({ code: 127, stdout: "", stderr: redact(error.message) });
    });
    child.on("close", (code) => {
      finish({ code: code ?? 1, stdout, stderr: redact(stderr) });
    });
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 500).unref();
      finish({
        code: 124,
        stdout,
        stderr: `process exceeded ${timeoutMs}ms`,
      });
    }, timeoutMs);
  });
}

async function resolveDatabaseContainer() {
  const result = await runProcess("docker", [
    "ps",
    "--filter",
    `name=^/${expectedContainer}$`,
    "--format",
    "{{.Names}}",
  ]);
  if (result.code !== 0) {
    throw new Error(`database container discovery failed: ${result.stderr}`);
  }
  const matches = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line === expectedContainer);
  if (matches.length !== 1) {
    throw new Error(
      `expected one repository database container, found ${matches.length}`,
    );
  }
  return matches[0];
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
    throw new Error(`service-only database query failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

async function serviceJson<T>(sql: string): Promise<T> {
  const output = await psql(sql);
  if (!output) throw new Error("service-only database query returned no data");
  return JSON.parse(output) as T;
}

function assertUuid(value: string) {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value)) {
    throw new Error("test UUID is invalid");
  }
  return value;
}

function assertSalesId(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("test sales identity is invalid");
  }
  return value;
}

async function responseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  return text.length === 0 ? null : JSON.parse(text);
}

async function authRequest(pathName: string, body: Record<string, unknown>) {
  const local = localApiConfiguration();
  return fetch(`${local.apiUrl}${pathName}`, {
    method: "POST",
    headers: { apikey: local.anonKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function liveRestRequest(
  pathName: string,
  token?: string,
  init: RequestInit = {},
) {
  const local = localApiConfiguration();
  return fetch(`${local.apiUrl}/rest/v1/${pathName}`, {
    ...init,
    headers: {
      apikey: local.anonKey,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
}

async function rpcRequest(functionName: string, token: string, body: unknown) {
  return liveRestRequest(`rpc/${functionName}`, token, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

async function createPrincipal(
  tenant: TenantName,
  role: BillingRole,
): Promise<Principal> {
  const credential = ["local", "exact", "fixture", "2026!"].join("-");
  const email = `exact-http-${tenant}-${role}@release.example`;
  const signup = await authRequest("/auth/v1/signup", {
    email,
    password: credential,
    data: { first_name: "Exact", last_name: `${tenant} ${role}` },
  });
  expect(signup.status).toBe(200);
  const signupBody = (await responseJson(signup)) as Record<string, unknown>;
  const userId = assertUuid(
    String((signupBody.user as Record<string, unknown>).id),
  );
  const login = await authRequest("/auth/v1/token?grant_type=password", {
    email,
    password: credential,
  });
  expect(login.status).toBe(200);
  const loginBody = (await responseJson(login)) as Record<string, unknown>;
  const accessToken = String(loginBody.access_token);
  expect(accessToken.length > 0).toBe(true);
  const sales = await liveRestRequest(
    `sales?select=id&user_id=eq.${encodeURIComponent(userId)}`,
    accessToken,
  );
  expect(sales.status).toBe(200);
  const rows = (await responseJson(sales)) as Record<string, unknown>[];
  expect(rows).toHaveLength(1);
  const principal = {
    accessToken,
    role,
    salesId: assertSalesId(Number(rows[0].id)),
    tenant,
    userId,
  };
  livePrincipals.push(principal);
  return principal;
}

function exactLineItemsSql(amountMinor: string) {
  return `jsonb_build_array(jsonb_build_object(
    'quantity_ratio', jsonb_build_object('numerator','1','denominator','1'),
    'unit_price', jsonb_build_object('amount_minor','${amountMinor}','currency','USD'),
    'extended_amount', jsonb_build_object('amount_minor','${amountMinor}','currency','USD'),
    'currency_policy_version','usd-v1',
    'rounding_policy_version','half-away-from-zero-v1'
  ))`;
}

async function setupLiveBoundary(): Promise<Map<string, Principal>> {
  localApiConfiguration();
  databaseContainer = await resolveDatabaseContainer();
  const principals = new Map<string, Principal>();
  const cases: readonly [TenantName, BillingRole][] = [
    ["alpha", "administrator"],
    ["alpha", "operator"],
    ["alpha", "reviewer"],
    ["alpha", "auditor"],
    ["alpha", "customer"],
    ["alpha", "disabled-operator"],
    ["bravo", "administrator"],
  ];
  for (const [tenant, role] of cases) {
    principals.set(`${tenant}-${role}`, await createPrincipal(tenant, role));
  }
  const alphaOperator = principals.get("alpha-operator")!;
  const bravoAdministrator = principals.get("bravo-administrator")!;
  const assignments = [
    [principals.get("alpha-administrator")!, "administrator"],
    [alphaOperator, "operator"],
    [principals.get("alpha-reviewer")!, "reviewer"],
    [principals.get("alpha-auditor")!, "auditor"],
    [principals.get("alpha-disabled-operator")!, "operator"],
  ] as const;

  await psql(`BEGIN;
    INSERT INTO public.billing_organizations (id, name, status) VALUES
      ('${liveAccounts.alpha.organizationId}', 'Exact Alpha Organization', 'active'),
      ('${liveAccounts.bravo.organizationId}', 'Exact Bravo Organization', 'active');
    INSERT INTO public.companies (id, name, sales_id) VALUES
      (${liveAccounts.alpha.companyId}, 'Exact Alpha Company', ${alphaOperator.salesId}),
      (${liveAccounts.bravo.companyId}, 'Exact Bravo Company', ${bravoAdministrator.salesId});
    INSERT INTO public.billing_accounts
      (id, organization_id, company_id, customer_name, billing_status)
    VALUES
      ('${liveAccounts.alpha.accountId}', '${liveAccounts.alpha.organizationId}', ${liveAccounts.alpha.companyId}, 'Exact Alpha Account', 'active'),
      ('${liveAccounts.bravo.accountId}', '${liveAccounts.bravo.organizationId}', ${liveAccounts.bravo.companyId}, 'Exact Bravo Account', 'active');
    INSERT INTO public.billing_account_owners
      (organization_id, account_id, sales_id)
    VALUES
      ('${liveAccounts.alpha.organizationId}', '${liveAccounts.alpha.accountId}', ${alphaOperator.salesId}),
      ('${liveAccounts.bravo.organizationId}', '${liveAccounts.bravo.accountId}', ${bravoAdministrator.salesId});
    INSERT INTO public.billing_role_assignments
      (organization_id, account_id, sales_id, role)
    VALUES
      ${assignments
        .map(([principal, role]) => {
          const accountIdValue =
            role === "administrator"
              ? "NULL"
              : `'${liveAccounts.alpha.accountId}'`;
          return `('${liveAccounts.alpha.organizationId}', ${accountIdValue}, ${principal.salesId}, '${role}')`;
        })
        .concat(
          `('${liveAccounts.bravo.organizationId}', '${liveAccounts.bravo.accountId}', ${bravoAdministrator.salesId}, 'administrator')`,
        )
        .join(",\n")};
    UPDATE public.sales
    SET disabled = true
    WHERE id = ${principals.get("alpha-disabled-operator")!.salesId};
    INSERT INTO public.invoices (
      id, company_id, sales_id, organization_id, billing_account_id,
      invoice_number, description, amount_minor, currency,
      currency_policy_version, tax_rate_kind, tax_rate_numerator,
      tax_rate_denominator, submitted_percentage, rate_policy_version,
      tax_amount_minor, total_amount_minor, rounding_policy_version,
      line_items_exact, line_items_legacy_evidence, status, issue_date
    ) VALUES
      (${liveInvoiceIds.rate8875}, ${liveAccounts.alpha.companyId}, ${alphaOperator.salesId}, '${liveAccounts.alpha.organizationId}', '${liveAccounts.alpha.accountId}',
       'EXACT-LIVE-8875', '8.875 percent fixture', 10000, 'USD', 'usd-v1',
       'ordinary_percentage', 71, 800, '8.875%', 'ordinary-percentage-v1',
       0, 10000, 'half-away-from-zero-v1', ${exactLineItemsSql("10000")}, '[]'::jsonb, 'Draft', '2026-09-04'),
      (${liveInvoiceIds.rate12500}, ${liveAccounts.alpha.companyId}, ${alphaOperator.salesId}, '${liveAccounts.alpha.organizationId}', '${liveAccounts.alpha.accountId}',
       'EXACT-LIVE-12500', '12.500 percent fixture', 10000, 'USD', 'usd-v1',
       'ordinary_percentage', 1, 8, '12.500%', 'ordinary-percentage-v1',
       0, 10000, 'half-away-from-zero-v1', ${exactLineItemsSql("10000")}, '[]'::jsonb, 'Draft', '2026-09-04'),
      (${liveInvoiceIds.minimum}, ${liveAccounts.alpha.companyId}, ${alphaOperator.salesId}, '${liveAccounts.alpha.organizationId}', '${liveAccounts.alpha.accountId}',
       'EXACT-LIVE-MIN', 'Signed minimum fixture', '-9223372036854775808', 'USD', 'usd-v1',
       'ordinary_percentage', 0, 1, '0%', 'ordinary-percentage-v1',
       0, '-9223372036854775808', 'half-away-from-zero-v1', '[]'::jsonb, '[]'::jsonb, 'Draft', '2026-09-04'),
      (${liveInvoiceIds.maximum}, ${liveAccounts.alpha.companyId}, ${alphaOperator.salesId}, '${liveAccounts.alpha.organizationId}', '${liveAccounts.alpha.accountId}',
       'EXACT-LIVE-MAX', 'Signed maximum fixture', '9223372036854775807', 'USD', 'usd-v1',
       'ordinary_percentage', 0, 1, '0%', 'ordinary-percentage-v1',
       0, '9223372036854775807', 'half-away-from-zero-v1', '[]'::jsonb, '[]'::jsonb, 'Draft', '2026-09-04');
  COMMIT;`);
  return principals;
}

async function invoiceEffectSnapshot(): Promise<InvoiceEffectSnapshot> {
  return serviceJson<InvoiceEffectSnapshot>(`SELECT jsonb_build_object(
    'invoice_count', (
      SELECT count(*) FROM public.invoices
      WHERE billing_account_id = '${liveAccounts.alpha.accountId}'
    ),
    'audit_count', (
      SELECT count(*) FROM public.billing_audit_events
      WHERE account_id = '${liveAccounts.alpha.accountId}'
    ),
    'automation_executions', (
      SELECT count(*) FROM public.billing_automation_executions
      WHERE account_id = '${liveAccounts.alpha.accountId}'
    ),
    'sequence', (
      SELECT jsonb_build_object(
        'last_value', last_value::text,
        'is_called', is_called
      ) FROM public.invoices_id_seq
    )
  )::text`);
}

async function immutableInvoiceSnapshot(invoiceId: string) {
  if (!/^[1-9][0-9]{0,18}$/.test(invoiceId)) {
    throw new Error("test invoice identity is invalid");
  }
  return serviceJson<{
    audit: Array<Record<string, unknown>>;
    invoice: Record<string, unknown>;
  }>(`SELECT jsonb_build_object(
    'invoice', (
      SELECT to_jsonb(invoice)
      FROM public.invoices AS invoice
      WHERE invoice.id = ${invoiceId}::bigint
    ),
    'audit', (
      SELECT COALESCE(jsonb_agg(to_jsonb(audit) ORDER BY audit.id), '[]'::jsonb)
      FROM public.billing_audit_events AS audit
      WHERE audit.subject_type = 'invoices'
        AND audit.subject_id = '${invoiceId}'
    )
  )::text`);
}

function expectStableRpcFailure(
  response: Response,
  body: unknown,
  code: string,
) {
  expect(response.ok).toBe(false);
  expect(body).toMatchObject({ message: code });
  expect(JSON.stringify(body)).not.toMatch(
    /auth\.users|request\.jwt|private\.|stack trace|search_path|eyJ[A-Za-z0-9_-]+\./i,
  );
}

async function expectRejectedWithoutEffects(
  functionName: string,
  token: string,
  request: unknown,
  code: string,
) {
  const before = await invoiceEffectSnapshot();
  const response = await rpcRequest(functionName, token, request);
  const body = await responseJson(response);
  expectStableRpcFailure(response, body, code);
  expect(await invoiceEffectSnapshot()).toEqual(before);
}

afterAll(async () => {
  if (!apiUrl || !anonKey) return;
  // The isolated lane destroys its database after the assertion process. Only
  // sessions are closed here because billing audit history is append-only.
  await Promise.allSettled(
    livePrincipals.map(({ accessToken }) =>
      fetch(`${apiUrl.replace(/\/$/, "")}/auth/v1/logout?scope=global`, {
        method: "POST",
        headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
      }),
    ),
  );
});

describe.runIf(Boolean(process.env.SUPABASE_DB_URL))(
  "exact invoice Auth, PostgREST, and RLS boundary",
  () => {
    let principals: Map<string, Principal>;

    beforeAll(async () => {
      principals = await setupLiveBoundary();
    });

    it("keeps exact invoice RPC ownership, search paths, and ACLs locked", async () => {
      const contracts = await serviceJson<
        Array<{
          anon_execute: boolean;
          authenticated_execute: boolean;
          definer: boolean;
          name: string;
          owner: string;
          public_execute: boolean;
          search_path_locked: boolean;
          service_execute: boolean;
        }>
      >(`SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'name', procedure.proname,
          'owner', pg_catalog.pg_get_userbyid(procedure.proowner),
          'definer', procedure.prosecdef,
          'search_path_locked', COALESCE(
            pg_catalog.array_to_string(procedure.proconfig, ','),
            ''
          ) IN ('search_path=', 'search_path=""'),
          'authenticated_execute', pg_catalog.has_function_privilege(
            'authenticated', procedure.oid, 'EXECUTE'
          ),
          'service_execute', pg_catalog.has_function_privilege(
            'service_role', procedure.oid, 'EXECUTE'
          ),
          'anon_execute', pg_catalog.has_function_privilege(
            'anon', procedure.oid, 'EXECUTE'
          ),
          'public_execute', EXISTS (
            SELECT 1
            FROM pg_catalog.aclexplode(COALESCE(
              procedure.proacl,
              pg_catalog.acldefault('f', procedure.proowner)
            )) AS privilege
            WHERE privilege.grantee = 0
              AND privilege.privilege_type = 'EXECUTE'
          )
        ) ORDER BY procedure.proname), '[]'::jsonb)::text
        FROM pg_catalog.pg_proc AS procedure
        JOIN pg_catalog.pg_namespace AS namespace
          ON namespace.oid = procedure.pronamespace
        WHERE namespace.nspname = 'public'
          AND procedure.proname IN (
            'read_billing_invoices_exact',
            'read_billing_invoices_legacy_compat',
            'save_billing_invoice_exact'
          )`);
      expect(contracts).toEqual([
        {
          name: "read_billing_invoices_exact",
          owner: "postgres",
          definer: true,
          search_path_locked: true,
          authenticated_execute: true,
          service_execute: true,
          anon_execute: false,
          public_execute: false,
        },
        {
          name: "read_billing_invoices_legacy_compat",
          owner: "postgres",
          definer: true,
          search_path_locked: true,
          authenticated_execute: true,
          service_execute: true,
          anon_execute: false,
          public_execute: false,
        },
        {
          name: "save_billing_invoice_exact",
          owner: "postgres",
          definer: true,
          search_path_locked: true,
          authenticated_execute: true,
          service_execute: true,
          anon_execute: false,
          public_execute: false,
        },
      ]);
    });

    it("returns only caller-authorized exact list and get rows", async () => {
      for (const role of [
        "administrator",
        "operator",
        "reviewer",
        "auditor",
      ] as const) {
        const principal = principals.get(`alpha-${role}`)!;
        const list = await rpcRequest(
          "read_billing_invoices_exact",
          principal.accessToken,
          {
            mode: "list",
            page: 1,
            per_page: 10,
            sort: "invoice_number",
            order: "ASC",
            filters: { billing_account_id: liveAccounts.alpha.accountId },
          },
        );
        expect(list.status, role).toBe(200);
        const body = (await responseJson(list)) as {
          data: Record<string, unknown>[];
          total: number;
        };
        expect(body.total).toBe(4);
        expect(body.data).toHaveLength(4);
        expect(
          body.data.every(
            (invoice) =>
              invoice.organization_id === liveAccounts.alpha.organizationId &&
              invoice.billing_account_id === liveAccounts.alpha.accountId,
          ),
        ).toBe(true);

        const get = await rpcRequest(
          "read_billing_invoices_exact",
          principal.accessToken,
          { mode: "get", invoice_id: liveInvoiceIds.rate8875 },
        );
        expect(get.status, role).toBe(200);
        expect(await responseJson(get)).toMatchObject({
          data: {
            id: liveInvoiceIds.rate8875,
            invoice_number: "EXACT-LIVE-8875",
          },
        });
      }

      for (const deniedPrincipal of [
        principals.get("alpha-customer")!,
        principals.get("alpha-disabled-operator")!,
      ]) {
        const response = await rpcRequest(
          "read_billing_invoices_exact",
          deniedPrincipal.accessToken,
          {
            mode: "list",
            page: 1,
            per_page: 10,
            sort: "id",
            order: "ASC",
            filters: { billing_account_id: liveAccounts.alpha.accountId },
          },
        );
        expect(response.status).toBe(200);
        expect(await responseJson(response)).toEqual({ data: [], total: 0 });
      }

      const bravo = principals.get("bravo-administrator")!;
      const crossTenant = await rpcRequest(
        "read_billing_invoices_exact",
        bravo.accessToken,
        { mode: "get", invoice_id: liveInvoiceIds.rate8875 },
      );
      const unknown = await rpcRequest(
        "read_billing_invoices_exact",
        bravo.accessToken,
        { mode: "get", invoice_id: "9223372036854775807" },
      );
      expect(crossTenant.status).toBe(200);
      expect(unknown.status).toBe(200);
      expect(await responseJson(crossTenant)).toEqual({ data: null });
      expect(await responseJson(unknown)).toEqual({ data: null });
    });

    it("preserves full-range and compatibility values as exact strings", async () => {
      const operator = principals.get("alpha-operator")!;
      const exact = await rpcRequest(
        "read_billing_invoices_exact",
        operator.accessToken,
        {
          mode: "list",
          page: 1,
          per_page: 10,
          sort: "invoice_number",
          order: "ASC",
          filters: { billing_account_id: liveAccounts.alpha.accountId },
        },
      );
      expect(exact.status).toBe(200);
      const exactBody = (await responseJson(exact)) as {
        data: Array<Record<string, unknown>>;
      };
      const byNumber = new Map(
        exactBody.data.map((row) => [String(row.invoice_number), row]),
      );
      expect(byNumber.get("EXACT-LIVE-MIN")).toMatchObject({
        amount: { amount_minor: "-9223372036854775808", currency: "USD" },
        total_amount: {
          amount_minor: "-9223372036854775808",
          currency: "USD",
        },
      });
      expect(byNumber.get("EXACT-LIVE-MAX")).toMatchObject({
        amount: { amount_minor: "9223372036854775807", currency: "USD" },
        total_amount: {
          amount_minor: "9223372036854775807",
          currency: "USD",
        },
      });
      expect(byNumber.get("EXACT-LIVE-8875")).toMatchObject({
        tax_rate: {
          numerator: "71",
          denominator: "800",
          submitted_percentage: "8.875%",
        },
      });
      expect(byNumber.get("EXACT-LIVE-12500")).toMatchObject({
        tax_rate: {
          numerator: "1",
          denominator: "8",
          submitted_percentage: "12.500%",
        },
      });
      expect(JSON.stringify(exactBody)).not.toMatch(
        /"(?:amount_minor|numerator|denominator)":-?[0-9]+(?:[,}])/,
      );

      const compatibility = await rpcRequest(
        "read_billing_invoices_legacy_compat",
        operator.accessToken,
        {
          mode: "list",
          page: 1,
          per_page: 10,
          sort: "invoice_number",
          order: "ASC",
          filters: { billing_account_id: liveAccounts.alpha.accountId },
        },
      );
      expect(compatibility.status).toBe(200);
      const compatibilityBody = (await responseJson(compatibility)) as {
        data: Array<Record<string, unknown>>;
      };
      const compatibilityByNumber = new Map(
        compatibilityBody.data.map((row) => [String(row.invoice_number), row]),
      );
      expect(compatibilityByNumber.get("EXACT-LIVE-MIN")).toMatchObject({
        amount: "-92233720368547758.08",
        total_amount: "-92233720368547758.08",
      });
      expect(compatibilityByNumber.get("EXACT-LIVE-MAX")).toMatchObject({
        amount: "92233720368547758.07",
        total_amount: "92233720368547758.07",
      });
      expect(compatibilityByNumber.get("EXACT-LIVE-8875")).toMatchObject({
        tax_rate: "8.875000000",
        submitted_percentage: "8.875%",
      });
      expect(compatibilityByNumber.get("EXACT-LIVE-12500")).toMatchObject({
        tax_rate: "12.500000000",
        submitted_percentage: "12.500%",
      });
      expect(JSON.stringify(compatibilityBody)).not.toMatch(
        /"(?:amount|tax_amount|total_amount|tax_rate)":-?[0-9]+(?:\.[0-9]+)?[,}]/,
      );
      expect(compatibilityBody.data[0]).not.toHaveProperty("financial_version");
    });

    it("allows exact save only for create and update capabilities", async () => {
      const operator = principals.get("alpha-operator")!;
      const saveRequest = {
        billing_account_id: liveAccounts.alpha.accountId,
        invoice_number: "EXACT-LIVE-SAVE",
        amount: { amount_minor: "888", currency: "USD" },
        currency_policy_version: "usd-v1",
        tax_rate: {
          kind: "ordinary_percentage",
          numerator: "0",
          denominator: "1",
          submitted_percentage: "0%",
          rate_policy_version: "ordinary-percentage-v1",
        },
        rounding_policy_version: "half-away-from-zero-v1",
        line_items: [
          {
            quantity_ratio: { numerator: "1", denominator: "1" },
            unit_price: { amount_minor: "888", currency: "USD" },
            extended_amount: { amount_minor: "888", currency: "USD" },
            currency_policy_version: "usd-v1",
            rounding_policy_version: "half-away-from-zero-v1",
          },
        ],
        status: "Draft",
        issue_date: "2026-09-04",
      };
      const created = await rpcRequest(
        "save_billing_invoice_exact",
        operator.accessToken,
        saveRequest,
      );
      expect(created.status).toBe(200);
      const createdBody = (await responseJson(created)) as {
        result: string;
        data: {
          id: string;
          amount: { amount_minor: string };
          sales_id: string;
        };
      };
      expect(createdBody).toMatchObject({
        result: "saved",
        data: { amount: { amount_minor: "888" } },
      });
      const updated = await rpcRequest(
        "save_billing_invoice_exact",
        operator.accessToken,
        {
          ...saveRequest,
          id: createdBody.data.id,
          invoice_number: "EXACT-LIVE-SAVE-UPDATED",
        },
      );
      expect(updated.status).toBe(200);
      expect(await responseJson(updated)).toMatchObject({
        result: "saved",
        data: {
          id: createdBody.data.id,
          invoice_number: "EXACT-LIVE-SAVE-UPDATED",
        },
      });

      const leapDate = await rpcRequest(
        "save_billing_invoice_exact",
        operator.accessToken,
        {
          ...saveRequest,
          invoice_number: "EXACT-LIVE-LEAP-DATE",
          issue_date: "2024-02-29",
          due_date: "2028-02-29",
        },
      );
      expect(leapDate.status).toBe(200);
      expect(await responseJson(leapDate)).toMatchObject({
        result: "saved",
        data: {
          issue_date: "2024-02-29",
          due_date: "2028-02-29",
        },
      });

      const administrator = principals.get("alpha-administrator")!;
      const administratorCreated = await rpcRequest(
        "save_billing_invoice_exact",
        administrator.accessToken,
        {
          ...saveRequest,
          invoice_number: "EXACT-LIVE-ADMIN-SAVE",
        },
      );
      expect(administratorCreated.status).toBe(200);
      const administratorCreatedBody = (await responseJson(
        administratorCreated,
      )) as {
        result: string;
        data: { id: string; invoice_number: string; sales_id: string };
      };
      expect(administratorCreatedBody).toMatchObject({
        result: "saved",
        data: {
          invoice_number: "EXACT-LIVE-ADMIN-SAVE",
          sales_id: String(operator.salesId),
        },
      });
      const administratorUpdated = await rpcRequest(
        "save_billing_invoice_exact",
        administrator.accessToken,
        {
          ...saveRequest,
          id: administratorCreatedBody.data.id,
          invoice_number: "EXACT-LIVE-ADMIN-SAVE-UPDATED",
        },
      );
      expect(administratorUpdated.status).toBe(200);
      expect(await responseJson(administratorUpdated)).toMatchObject({
        result: "saved",
        data: {
          id: administratorCreatedBody.data.id,
          invoice_number: "EXACT-LIVE-ADMIN-SAVE-UPDATED",
          sales_id: String(operator.salesId),
        },
      });

      await expectRejectedWithoutEffects(
        "save_billing_invoice_exact",
        principals.get("alpha-reviewer")!.accessToken,
        saveRequest,
        "INVOICE_SAVE_INVALID_REQUEST",
      );
      await expectRejectedWithoutEffects(
        "save_billing_invoice_exact",
        principals.get("bravo-administrator")!.accessToken,
        saveRequest,
        "INVOICE_SAVE_INVALID_REQUEST",
      );
    });

    it("keeps sent and paid invoice snapshots immutable after rejected saves", async () => {
      const operator = principals.get("alpha-operator")!;
      const saveRequest = {
        billing_account_id: liveAccounts.alpha.accountId,
        invoice_number: "EXACT-LIVE-IMMUTABLE",
        description: "Issued snapshot fixture",
        amount: { amount_minor: "321", currency: "USD" },
        currency_policy_version: "usd-v1",
        tax_rate: {
          kind: "ordinary_percentage",
          numerator: "0",
          denominator: "1",
          submitted_percentage: "0%",
          rate_policy_version: "ordinary-percentage-v1",
        },
        rounding_policy_version: "half-away-from-zero-v1",
        line_items: [
          {
            quantity_ratio: { numerator: "1", denominator: "1" },
            unit_price: { amount_minor: "321", currency: "USD" },
            extended_amount: { amount_minor: "321", currency: "USD" },
            currency_policy_version: "usd-v1",
            rounding_policy_version: "half-away-from-zero-v1",
          },
        ],
        status: "Draft",
        issue_date: "2026-09-04",
      };
      const created = await rpcRequest(
        "save_billing_invoice_exact",
        operator.accessToken,
        saveRequest,
      );
      expect(created.status).toBe(200);
      const createdBody = (await responseJson(created)) as {
        data: { id: string };
      };
      const invoiceId = createdBody.data.id;

      for (const status of ["Sent", "Paid"] as const) {
        await psql(`UPDATE public.invoices
          SET status = '${status}'
          WHERE id = ${invoiceId}::bigint`);
        const before = await immutableInvoiceSnapshot(invoiceId);
        expect(before.invoice.status).toBe(status);

        const response = await rpcRequest(
          "save_billing_invoice_exact",
          operator.accessToken,
          {
            ...saveRequest,
            id: invoiceId,
            invoice_number: `EXACT-LIVE-${status.toUpperCase()}-REWRITE`,
          },
        );
        const body = await responseJson(response);
        expectStableRpcFailure(response, body, "INVOICE_SAVE_INVALID_REQUEST");
        expect(await immutableInvoiceSnapshot(invoiceId)).toEqual(before);
      }
    });

    it("keeps exact and legacy invoice pagination on one bounded contract", async () => {
      const operator = principals.get("alpha-operator")!;
      const request = {
        mode: "list",
        page: EXACT_BILLING_INVOICE_MAX_PAGE,
        per_page: 100,
        sort: "id",
        order: "ASC",
        filters: {},
      };
      const exact = await rpcRequest(
        "read_billing_invoices_exact",
        operator.accessToken,
        request,
      );
      const legacy = await rpcRequest(
        "read_billing_invoices_legacy_compat",
        operator.accessToken,
        request,
      );
      expect(exact.status).toBe(200);
      expect(legacy.status).toBe(200);
      const exactBody = (await responseJson(exact)) as {
        data: unknown[];
        total: number;
      };
      const legacyBody = (await responseJson(legacy)) as {
        data: unknown[];
        total: number;
      };
      expect(exactBody.data).toEqual([]);
      expect(legacyBody.data).toEqual([]);
      expect(exactBody.total).toBeGreaterThan(0);
      expect(legacyBody.total).toBe(exactBody.total);

      const rejected = {
        ...request,
        page: EXACT_BILLING_INVOICE_MAX_PAGE + 1,
      };
      for (const functionName of [
        "read_billing_invoices_exact",
        "read_billing_invoices_legacy_compat",
      ]) {
        await expectRejectedWithoutEffects(
          functionName,
          operator.accessToken,
          rejected,
          "INVOICE_READ_INVALID_REQUEST",
        );
      }
    });

    it("rejects malformed, oversized, policy, scope, and pagination requests without effects", async () => {
      const operator = principals.get("alpha-operator")!;
      const validSaveBase = {
        billing_account_id: liveAccounts.alpha.accountId,
        invoice_number: "EXACT-LIVE-VALID-CONTROL",
        amount: { amount_minor: "1", currency: "USD" },
        currency_policy_version: "usd-v1",
        tax_rate: {
          kind: "ordinary_percentage",
          numerator: "0",
          denominator: "1",
          submitted_percentage: "0%",
          rate_policy_version: "ordinary-percentage-v1",
        },
        rounding_policy_version: "half-away-from-zero-v1",
        line_items: [
          {
            quantity_ratio: { numerator: "1", denominator: "1" },
            unit_price: { amount_minor: "1", currency: "USD" },
            extended_amount: { amount_minor: "1", currency: "USD" },
            currency_policy_version: "usd-v1",
            rounding_policy_version: "half-away-from-zero-v1",
          },
        ],
        issue_date: "2026-09-04",
      };
      const control = await rpcRequest(
        "save_billing_invoice_exact",
        operator.accessToken,
        validSaveBase,
      );
      expect(control.status).toBe(200);
      expect(await responseJson(control)).toMatchObject({
        result: "saved",
        data: {
          invoice_number: "EXACT-LIVE-VALID-CONTROL",
          amount: { amount_minor: "1", currency: "USD" },
        },
      });

      const invalidSaveBase = {
        ...validSaveBase,
        invoice_number: "EXACT-LIVE-INVALID",
      };
      const missingIssueDate: Record<string, unknown> = {
        ...invalidSaveBase,
      };
      delete missingIssueDate.issue_date;
      const invalidSaves = [
        missingIssueDate,
        { ...invalidSaveBase, issue_date: "today" },
        { ...invalidSaveBase, issue_date: "tomorrow" },
        { ...invalidSaveBase, issue_date: "09/04/2026" },
        { ...invalidSaveBase, issue_date: "2026-02-30" },
        { ...invalidSaveBase, issue_date: "0000-01-01" },
        { ...invalidSaveBase, due_date: "today" },
        { ...invalidSaveBase, due_date: "tomorrow" },
        { ...invalidSaveBase, due_date: "09/04/2026" },
        { ...invalidSaveBase, due_date: "2026-02-30" },
        { ...invalidSaveBase, due_date: "0000-02-29" },
        { ...invalidSaveBase, amount: { amount_minor: 1, currency: "USD" } },
        {
          ...invalidSaveBase,
          amount: { amount_minor: "9".repeat(65), currency: "USD" },
        },
        {
          ...invalidSaveBase,
          amount: { amount_minor: "+1", currency: "USD" },
        },
        {
          ...invalidSaveBase,
          amount: { amount_minor: "1e3", currency: "USD" },
        },
        {
          ...invalidSaveBase,
          amount: { amount_minor: "1,000", currency: "USD" },
        },
        {
          ...invalidSaveBase,
          amount: { amount_minor: "1", currency: "EUR" },
        },
        {
          ...invalidSaveBase,
          currency_policy_version: "usd-v2",
        },
        {
          ...invalidSaveBase,
          tax_rate: {
            ...invalidSaveBase.tax_rate,
            submitted_percentage: "100.0000000000%",
          },
        },
        {
          ...invalidSaveBase,
          amount: {
            amount_minor: "9223372036854775808",
            currency: "USD",
          },
        },
        {
          ...invalidSaveBase,
          id: liveInvoiceIds.rate8875,
          amount: {
            amount_minor: "9223372036854775807",
            currency: "USD",
          },
          tax_rate: {
            kind: "ordinary_percentage",
            numerator: "1",
            denominator: "1",
            submitted_percentage: "100%",
            rate_policy_version: "ordinary-percentage-v1",
          },
          line_items: [
            {
              quantity_ratio: { numerator: "1", denominator: "1" },
              unit_price: {
                amount_minor: "9223372036854775807",
                currency: "USD",
              },
              extended_amount: {
                amount_minor: "9223372036854775807",
                currency: "USD",
              },
              currency_policy_version: "usd-v1",
              rounding_policy_version: "half-away-from-zero-v1",
            },
          ],
        },
        { ...invalidSaveBase, organization_id: organizationId },
        { ...invalidSaveBase, sales_id: String(operator.salesId) },
        { ...invalidSaveBase, idempotency_key: "phase-five-only" },
      ];
      for (const invalidRequest of invalidSaves) {
        await expectRejectedWithoutEffects(
          "save_billing_invoice_exact",
          operator.accessToken,
          invalidRequest,
          "INVOICE_SAVE_INVALID_REQUEST",
        );
      }

      const invalidReads = [
        {
          mode: "list",
          page: 0,
          per_page: 10,
          sort: "id",
          order: "ASC",
          filters: {},
        },
        {
          mode: "list",
          page: 1,
          per_page: 0,
          sort: "id",
          order: "ASC",
          filters: {},
        },
        {
          mode: "list",
          page: 1,
          per_page: 101,
          sort: "id",
          order: "ASC",
          filters: {},
        },
        {
          mode: "list",
          page: 1,
          per_page: 10,
          sort: "amount",
          order: "ASC",
          filters: {},
        },
        {
          mode: "list",
          page: 1,
          per_page: 10,
          sort: "id",
          order: "SIDEWAYS",
          filters: {},
        },
        {
          mode: "list",
          page: 1,
          per_page: 10,
          sort: "id",
          order: "ASC",
          filters: { organization_id: organizationId },
        },
        {
          mode: "list",
          page: 1,
          per_page: 10,
          sort: "id",
          order: "ASC",
          filters: { sales_id: String(operator.salesId) },
        },
        { mode: "get", invoice_id: Number(liveInvoiceIds.rate8875) },
        { mode: "get", invoice_id: liveInvoiceIds.rate8875, filters: {} },
        { mode: "unknown" },
      ];
      for (const invalidRequest of invalidReads) {
        await expectRejectedWithoutEffects(
          "read_billing_invoices_exact",
          operator.accessToken,
          invalidRequest,
          "INVOICE_READ_INVALID_REQUEST",
        );
      }
    });

    it("keeps invoice table and sequence REST surfaces denied for authenticated callers", async () => {
      const operator = principals.get("alpha-operator")!;
      const directCases: Array<[string, RequestInit]> = [
        ["invoices?select=id", {}],
        [
          "invoices",
          {
            method: "POST",
            body: JSON.stringify({ invoice_number: "DIRECT-DENIED" }),
          },
        ],
        [
          `invoices?id=eq.${liveInvoiceIds.rate8875}`,
          {
            method: "PATCH",
            body: JSON.stringify({ invoice_number: "DIRECT-DENIED" }),
          },
        ],
        [`invoices?id=eq.${liveInvoiceIds.rate8875}`, { method: "DELETE" }],
        ["invoices_id_seq?select=*", {}],
      ];
      for (const [pathName, init] of directCases) {
        const before = await invoiceEffectSnapshot();
        const response = await liveRestRequest(
          pathName,
          operator.accessToken,
          init,
        );
        expect([401, 403, 404]).toContain(response.status);
        const body = await responseJson(response);
        expect(JSON.stringify(body)).not.toMatch(
          /auth\.users|request\.jwt|private\.|stack trace|search_path|eyJ[A-Za-z0-9_-]+\./i,
        );
        expect(await invoiceEffectSnapshot()).toEqual(before);
      }
    });
  },
);
