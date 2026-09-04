import { spawn } from "node:child_process";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

type Role = "administrator" | "operator" | "reviewer" | "auditor" | "customer";

type Principal = {
  accessToken: string;
  role: Role;
  salesId: number;
  tenant: "alpha" | "bravo";
  userId: string;
};

type ProcessResult = { code: number; stdout: string; stderr: string };
type ExactRecord = Record<string, unknown> & { id: string };
type FinancialState = {
  audit_count: number;
  automation_actions: number;
  automation_amount_minor: string;
  automation_executions: number;
  invoice_count: number;
  invoice_ids: string[];
  sequence_is_called: boolean;
  sequence_last_value: string;
};

const apiUrl = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const repositoryRoot = path.resolve(__dirname, "../..");
const expectedContainer = "supabase_db_atomic-crm-demo";
const principals: Principal[] = [];
const tenants = {
  alpha: {
    accountId: "31000000-0000-0000-0000-000000000200",
    companyId: 310001,
    organizationId: "31000000-0000-0000-0000-000000000100",
  },
  bravo: {
    accountId: "32000000-0000-0000-0000-000000000200",
    companyId: 320001,
    organizationId: "32000000-0000-0000-0000-000000000100",
  },
} as const;
let databaseContainer: string | undefined;
let seeded = false;
let alphaInvoiceIds: string[] = [];
let bravoInvoiceId = "";

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
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 500).unref();
      finish({ code: 124, stdout: "", stderr: "process exceeded timeout" });
    }, timeoutMs);
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
  expect(result.code, result.stderr).toBe(0);
  const matches = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line === expectedContainer);
  expect(matches).toEqual([expectedContainer]);
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

async function restRequest(
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

async function rpcRequest(
  functionName: string,
  token: string | undefined,
  request: unknown,
) {
  return restRequest(`rpc/${functionName}`, token, {
    method: "POST",
    body: JSON.stringify({ p_request: request }),
  });
}

async function createPrincipal(
  tenant: "alpha" | "bravo",
  role: Role,
  alias = role,
) {
  const credential = ["local", "exact", "fixture", "2026!"].join("-");
  const email = `exact-http-${tenant}-${alias}@release.example`;
  const signup = await authRequest("/auth/v1/signup", {
    email,
    password: credential,
    data: { first_name: "Exact", last_name: `${tenant} ${alias}` },
  });
  expect(signup.status).toBe(200);
  const signupBody = (await responseJson(signup)) as Record<string, unknown>;
  const user = signupBody.user as Record<string, unknown>;
  const userId = assertUuid(String(user.id));

  const login = await authRequest("/auth/v1/token?grant_type=password", {
    email,
    password: credential,
  });
  expect(login.status).toBe(200);
  const loginBody = (await responseJson(login)) as Record<string, unknown>;
  const accessToken = String(loginBody.access_token);
  const sales = await restRequest(
    `sales?select=id&user_id=eq.${encodeURIComponent(userId)}`,
    accessToken,
  );
  expect(sales.status).toBe(200);
  const salesRows = (await responseJson(sales)) as Record<string, unknown>[];
  expect(salesRows).toHaveLength(1);
  const principal = {
    accessToken,
    role,
    salesId: assertSalesId(Number(salesRows[0].id)),
    tenant,
    userId,
  };
  principals.push(principal);
  return principal;
}

function principal(tenant: "alpha" | "bravo", role: Role, occurrence = 0) {
  const matches = principals.filter(
    (entry) => entry.tenant === tenant && entry.role === role,
  );
  const match = matches[occurrence];
  if (!match) throw new Error("test principal is unavailable");
  return match;
}

function fixtureSql() {
  const alphaAdmin = principal("alpha", "administrator");
  const alphaOperator = principal("alpha", "operator");
  const alphaDisabled = principal("alpha", "operator", 1);
  const alphaReviewer = principal("alpha", "reviewer");
  const alphaAuditor = principal("alpha", "auditor");
  const alphaCustomer = principal("alpha", "customer");
  const bravoOperator = principal("bravo", "operator");
  return `BEGIN;
    INSERT INTO public.billing_organizations (id, name, status) VALUES
      ('${tenants.alpha.organizationId}', 'Exact HTTP Alpha', 'active'),
      ('${tenants.bravo.organizationId}', 'Exact HTTP Bravo', 'active');
    INSERT INTO public.companies (id, name, sales_id) VALUES
      (${tenants.alpha.companyId}, 'Exact HTTP Alpha Company', ${alphaOperator.salesId}),
      (${tenants.bravo.companyId}, 'Exact HTTP Bravo Company', ${bravoOperator.salesId});
    INSERT INTO public.billing_accounts
      (id, organization_id, company_id, customer_name, billing_status) VALUES
      ('${tenants.alpha.accountId}', '${tenants.alpha.organizationId}', ${tenants.alpha.companyId}, 'Exact HTTP Alpha Account', 'active'),
      ('${tenants.bravo.accountId}', '${tenants.bravo.organizationId}', ${tenants.bravo.companyId}, 'Exact HTTP Bravo Account', 'active');
    INSERT INTO public.billing_role_assignments
      (organization_id, account_id, sales_id, role) VALUES
      ('${tenants.alpha.organizationId}', NULL, ${alphaAdmin.salesId}, 'administrator'),
      ('${tenants.alpha.organizationId}', '${tenants.alpha.accountId}', ${alphaOperator.salesId}, 'operator'),
      ('${tenants.alpha.organizationId}', '${tenants.alpha.accountId}', ${alphaDisabled.salesId}, 'operator'),
      ('${tenants.alpha.organizationId}', '${tenants.alpha.accountId}', ${alphaReviewer.salesId}, 'reviewer'),
      ('${tenants.alpha.organizationId}', NULL, ${alphaAuditor.salesId}, 'auditor'),
      ('${tenants.alpha.organizationId}', '${tenants.alpha.accountId}', ${alphaCustomer.salesId}, 'customer'),
      ('${tenants.bravo.organizationId}', '${tenants.bravo.accountId}', ${bravoOperator.salesId}, 'operator');
    INSERT INTO public.billing_account_owners
      (organization_id, account_id, sales_id) VALUES
      ('${tenants.alpha.organizationId}', '${tenants.alpha.accountId}', ${alphaOperator.salesId}),
      ('${tenants.bravo.organizationId}', '${tenants.bravo.accountId}', ${bravoOperator.salesId});
    UPDATE public.sales SET disabled = true WHERE id = ${alphaDisabled.salesId};
  COMMIT;`;
}

function exactSave(
  accountId: string,
  invoiceNumber: string,
  amountMinor: string,
  submittedPercentage: string,
  numerator: string,
  denominator: string,
) {
  return {
    billing_account_id: accountId,
    invoice_number: invoiceNumber,
    amount: { amount_minor: amountMinor, currency: "USD" },
    tax_rate: {
      kind: "ordinary_percentage",
      numerator,
      denominator,
      submitted_percentage: submittedPercentage,
      rate_policy_version: "ordinary-percentage-v1",
    },
    line_items: [],
    status: "Draft",
  };
}

async function saveInvoice(token: string, request: unknown) {
  const response = await rpcRequest(
    "save_billing_invoice_exact",
    token,
    request,
  );
  expect(response.status, JSON.stringify(await response.clone().json())).toBe(
    200,
  );
  const body = (await responseJson(response)) as { data: ExactRecord };
  expect(body.data.id).toMatch(/^[1-9][0-9]*$/);
  return body.data;
}

async function setupWorld() {
  localApiConfiguration();
  databaseContainer = await resolveDatabaseContainer();
  await createPrincipal("alpha", "administrator");
  await createPrincipal("alpha", "operator");
  await createPrincipal("alpha", "operator", "disabled-operator");
  await createPrincipal("alpha", "reviewer");
  await createPrincipal("alpha", "auditor");
  await createPrincipal("alpha", "customer");
  await createPrincipal("bravo", "operator");
  await psql(fixtureSql());
  seeded = true;

  const alphaOperator = principal("alpha", "operator");
  const bravoOperator = principal("bravo", "operator");
  const alphaRecords = [];
  alphaRecords.push(
    await saveInvoice(
      alphaOperator.accessToken,
      exactSave(
        tenants.alpha.accountId,
        "EXACT-HTTP-MIN",
        "-9223372036854775808",
        "0%",
        "0",
        "1",
      ),
    ),
  );
  alphaRecords.push(
    await saveInvoice(
      alphaOperator.accessToken,
      exactSave(
        tenants.alpha.accountId,
        "EXACT-HTTP-MAX",
        "9223372036854775807",
        "0%",
        "0",
        "1",
      ),
    ),
  );
  alphaRecords.push(
    await saveInvoice(
      alphaOperator.accessToken,
      exactSave(
        tenants.alpha.accountId,
        "EXACT-HTTP-8875",
        "800",
        "8.875%",
        "71",
        "800",
      ),
    ),
  );
  alphaRecords.push(
    await saveInvoice(
      alphaOperator.accessToken,
      exactSave(
        tenants.alpha.accountId,
        "EXACT-HTTP-12500",
        "8",
        "12.500%",
        "1",
        "8",
      ),
    ),
  );
  alphaInvoiceIds = alphaRecords.map((record) => record.id);
  bravoInvoiceId = (
    await saveInvoice(
      bravoOperator.accessToken,
      exactSave(
        tenants.bravo.accountId,
        "EXACT-HTTP-BRAVO",
        "100",
        "0%",
        "0",
        "1",
      ),
    )
  ).id;
}

async function financialState(): Promise<FinancialState> {
  return serviceJson<FinancialState>(`SELECT jsonb_build_object(
    'invoice_count', (
      SELECT count(*) FROM public.invoices
      WHERE billing_account_id IN ('${tenants.alpha.accountId}', '${tenants.bravo.accountId}')
    ),
    'invoice_ids', (
      SELECT coalesce(jsonb_agg(id::text ORDER BY id), '[]'::jsonb)
      FROM public.invoices
      WHERE billing_account_id IN ('${tenants.alpha.accountId}', '${tenants.bravo.accountId}')
    ),
    'audit_count', (
      SELECT count(*) FROM public.billing_audit_events
      WHERE organization_id IN ('${tenants.alpha.organizationId}', '${tenants.bravo.organizationId}')
    ),
    'automation_executions', (
      SELECT count(*) FROM public.billing_automation_executions
      WHERE organization_id IN ('${tenants.alpha.organizationId}', '${tenants.bravo.organizationId}')
    ),
    'automation_actions', (
      SELECT coalesce(sum(actions_consumed), 0) FROM public.billing_automation_grants
      WHERE organization_id IN ('${tenants.alpha.organizationId}', '${tenants.bravo.organizationId}')
    ),
    'automation_amount_minor', (
      SELECT coalesce(sum(total_amount_consumed_minor), 0)::text
      FROM public.billing_automation_grants
      WHERE organization_id IN ('${tenants.alpha.organizationId}', '${tenants.bravo.organizationId}')
    ),
    'sequence_last_value', (SELECT last_value::text FROM public.invoices_id_seq),
    'sequence_is_called', (SELECT is_called FROM public.invoices_id_seq)
  )::text`);
}

function expectSafeFailure(
  response: Response,
  body: unknown,
  expectedCode?: string,
) {
  expect([400, 401, 403, 404, 405]).toContain(response.status);
  expect(body).toEqual(expect.any(Object));
  const serialized = JSON.stringify(body);
  if (expectedCode) expect(serialized).toContain(expectedCode);
  expect(serialized).not.toMatch(
    /auth\.users|request\.jwt|private\.|stack trace|search_path|eyJ[A-Za-z0-9_-]+\./i,
  );
}

async function expectRpcFailure(
  functionName: string,
  token: string,
  request: unknown,
  expectedCode: string,
) {
  const response = await rpcRequest(functionName, token, request);
  const body = await responseJson(response);
  expectSafeFailure(response, body, expectedCode);
  expect(JSON.stringify(body)).not.toContain("MALICIOUS_REFLECTION_MARKER");
}

async function cleanupWorld() {
  if (!databaseContainer || principals.length === 0) return;
  const salesIds = principals
    .map((entry) => assertSalesId(entry.salesId))
    .join(",");
  const userIds = principals
    .map((entry) => `'${assertUuid(entry.userId)}'`)
    .join(",");
  if (seeded) {
    await psql(`BEGIN;
      SET LOCAL session_replication_role = replica;
      DELETE FROM public.billing_audit_events
      WHERE organization_id IN ('${tenants.alpha.organizationId}', '${tenants.bravo.organizationId}');
      DELETE FROM public.invoices
      WHERE billing_account_id IN ('${tenants.alpha.accountId}', '${tenants.bravo.accountId}');
      DELETE FROM public.billing_account_owners
      WHERE account_id IN ('${tenants.alpha.accountId}', '${tenants.bravo.accountId}');
      DELETE FROM public.billing_role_assignments
      WHERE organization_id IN ('${tenants.alpha.organizationId}', '${tenants.bravo.organizationId}');
      DELETE FROM public.billing_accounts
      WHERE id IN ('${tenants.alpha.accountId}', '${tenants.bravo.accountId}');
      DELETE FROM public.billing_organizations
      WHERE id IN ('${tenants.alpha.organizationId}', '${tenants.bravo.organizationId}');
      DELETE FROM public.companies
      WHERE id IN (${tenants.alpha.companyId}, ${tenants.bravo.companyId});
      DELETE FROM public.sales WHERE id IN (${salesIds});
      DELETE FROM auth.users WHERE id IN (${userIds});
    COMMIT;`);
  } else {
    await psql(`BEGIN;
      DELETE FROM public.sales WHERE id IN (${salesIds});
      DELETE FROM auth.users WHERE id IN (${userIds});
    COMMIT;`);
  }
}

afterAll(async () => {
  if (apiUrl && anonKey) {
    await Promise.allSettled(
      principals.map((entry) =>
        fetch(`${apiUrl.replace(/\/$/, "")}/auth/v1/logout?scope=global`, {
          method: "POST",
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${entry.accessToken}`,
          },
        }),
      ),
    );
  }
  await cleanupWorld();
});

describe.runIf(Boolean(process.env.SUPABASE_DB_URL))(
  "exact invoice Auth and PostgREST boundary",
  () => {
    beforeAll(setupWorld, 60_000);

    it("returns caller-bound exact list/get data with pagination and role isolation", async () => {
      for (const role of [
        "administrator",
        "operator",
        "reviewer",
        "auditor",
      ] as const) {
        const response = await rpcRequest(
          "read_billing_invoices_exact",
          principal("alpha", role).accessToken,
          {
            mode: "list",
            page: 1,
            per_page: 2,
            sort: "invoice_number",
            order: "ASC",
            filters: { billing_account_id: tenants.alpha.accountId },
          },
        );
        expect(response.status).toBe(200);
        const body = (await responseJson(response)) as {
          data: ExactRecord[];
          total: number;
        };
        expect(body.total).toBe(4);
        expect(body.data).toHaveLength(2);
        expect(
          body.data.every(
            (record) =>
              record.billing_account_id === tenants.alpha.accountId &&
              typeof record.amount_minor === "string" &&
              typeof record.tax_rate_numerator === "string",
          ),
        ).toBe(true);
      }

      const secondPage = await rpcRequest(
        "read_billing_invoices_exact",
        principal("alpha", "operator").accessToken,
        {
          mode: "list",
          page: 2,
          per_page: 2,
          sort: "id",
          order: "ASC",
          filters: {},
        },
      );
      expect(secondPage.status).toBe(200);
      const secondPageBody = (await responseJson(secondPage)) as {
        data: Record<string, unknown>[];
        total: number;
      };
      expect(secondPageBody.total).toBe(4);
      expect(secondPageBody.data).toHaveLength(2);
      expect(
        secondPageBody.data.every(
          (record) => record.billing_account_id === tenants.alpha.accountId,
        ),
      ).toBe(true);

      const forgedAccountFilter = await rpcRequest(
        "read_billing_invoices_exact",
        principal("alpha", "operator").accessToken,
        {
          mode: "list",
          filters: { billing_account_id: tenants.bravo.accountId },
        },
      );
      expect(forgedAccountFilter.status).toBe(200);
      expect(await responseJson(forgedAccountFilter)).toEqual({
        data: [],
        total: 0,
      });

      for (const denied of [
        principal("alpha", "customer"),
        principal("alpha", "operator", 1),
      ]) {
        const response = await rpcRequest(
          "read_billing_invoices_exact",
          denied.accessToken,
          { mode: "list", filters: {} },
        );
        expect(response.status).toBe(200);
        expect(await responseJson(response)).toEqual({ data: [], total: 0 });
      }

      const crossTenant = await rpcRequest(
        "read_billing_invoices_exact",
        principal("alpha", "operator").accessToken,
        { mode: "get", invoice_id: bravoInvoiceId },
      );
      expect(crossTenant.status).toBe(200);
      expect(await responseJson(crossTenant)).toEqual({ data: null });
      const unknown = await rpcRequest(
        "read_billing_invoices_exact",
        principal("alpha", "operator").accessToken,
        { mode: "get", invoice_id: "9223372036854775807" },
      );
      expect(await responseJson(unknown)).toEqual({ data: null });
    });

    it("preserves signed-bigint strings and fixed-nine compatibility rates", async () => {
      const token = principal("alpha", "operator").accessToken;
      const exactResponse = await rpcRequest(
        "read_billing_invoices_exact",
        token,
        {
          mode: "list",
          page: 1,
          per_page: 100,
          sort: "id",
          order: "ASC",
          filters: {},
        },
      );
      const exact = (await responseJson(exactResponse)) as {
        data: Record<string, unknown>[];
      };
      const byNumber = new Map(
        exact.data.map((record) => [record.invoice_number, record]),
      );
      expect(byNumber.get("EXACT-HTTP-MIN")).toMatchObject({
        amount_minor: "-9223372036854775808",
        total_amount_minor: "-9223372036854775808",
      });
      expect(byNumber.get("EXACT-HTTP-MAX")).toMatchObject({
        amount_minor: "9223372036854775807",
        total_amount_minor: "9223372036854775807",
      });
      expect(byNumber.get("EXACT-HTTP-8875")).toMatchObject({
        tax_rate_numerator: "71",
        tax_rate_denominator: "800",
        submitted_percentage: "8.875%",
      });
      expect(byNumber.get("EXACT-HTTP-12500")).toMatchObject({
        tax_rate_numerator: "1",
        tax_rate_denominator: "8",
        submitted_percentage: "12.500%",
      });
      for (const record of exact.data) {
        expect(record).not.toHaveProperty("financial_version");
      }

      const compatibilityResponse = await rpcRequest(
        "read_billing_invoices_legacy_compat",
        token,
        {
          mode: "list",
          page: 1,
          per_page: 100,
          sort: "id",
          order: "ASC",
          filters: {},
        },
      );
      expect(compatibilityResponse.status).toBe(200);
      const compatibility = (await responseJson(compatibilityResponse)) as {
        data: Record<string, unknown>[];
      };
      const compatibleByNumber = new Map(
        compatibility.data.map((record) => [record.invoice_number, record]),
      );
      expect(compatibleByNumber.get("EXACT-HTTP-MIN")).toMatchObject({
        amount: "-92233720368547758.08",
        total_amount: "-92233720368547758.08",
      });
      expect(compatibleByNumber.get("EXACT-HTTP-MAX")).toMatchObject({
        amount: "92233720368547758.07",
        total_amount: "92233720368547758.07",
      });
      expect(compatibleByNumber.get("EXACT-HTTP-8875")).toMatchObject({
        tax_rate: "8.875000000",
        tax_rate_numerator: "71",
        tax_rate_denominator: "800",
        submitted_percentage: "8.875%",
      });
      expect(compatibleByNumber.get("EXACT-HTTP-12500")).toMatchObject({
        tax_rate: "12.500000000",
        tax_rate_numerator: "1",
        tax_rate_denominator: "8",
        submitted_percentage: "12.500%",
      });
      for (const record of compatibility.data) {
        expect(record.tax_rate).toMatch(/^(?:0|[1-9][0-9]?|100)\.\d{9}$/);
        expect(typeof record.amount).toBe("string");
        expect(typeof record.tax_amount).toBe("string");
        expect(typeof record.total_amount).toBe("string");
        expect(record).not.toHaveProperty("financial_version");
      }
    });

    it("allows exact create/update only through the save RPC", async () => {
      const operator = principal("alpha", "operator");
      const created = await saveInvoice(
        operator.accessToken,
        exactSave(
          tenants.alpha.accountId,
          "EXACT-HTTP-UPDATE",
          "1",
          "0%",
          "0",
          "1",
        ),
      );
      const updated = await saveInvoice(operator.accessToken, {
        ...exactSave(
          tenants.alpha.accountId,
          "EXACT-HTTP-UPDATED",
          "8",
          "12.500%",
          "1",
          "8",
        ),
        id: created.id,
      });
      expect(updated).toMatchObject({
        id: created.id,
        invoice_number: "EXACT-HTTP-UPDATED",
        amount_minor: "8",
        tax_amount_minor: "1",
        total_amount_minor: "9",
      });
      alphaInvoiceIds.push(created.id);
    });

    it("denies direct table access and sequence usage", async () => {
      const token = principal("alpha", "operator").accessToken;
      const directCases: [string, RequestInit][] = [
        ["invoices?select=id", { method: "GET" }],
        [
          "invoices",
          {
            method: "POST",
            headers: { Prefer: "return=representation" },
            body: JSON.stringify({ invoice_number: "DIRECT-DENIED" }),
          },
        ],
        [
          `invoices?id=eq.${alphaInvoiceIds[0]}`,
          {
            method: "PATCH",
            headers: { Prefer: "return=representation" },
            body: JSON.stringify({ invoice_number: "DIRECT-DENIED" }),
          },
        ],
        [
          `invoices?id=eq.${alphaInvoiceIds[0]}`,
          { method: "DELETE", headers: { Prefer: "return=representation" } },
        ],
      ];
      const before = await financialState();
      for (const [pathName, init] of directCases) {
        const response = await restRequest(pathName, token, init);
        expectSafeFailure(response, await responseJson(response));
      }
      expect(await financialState()).toEqual(before);
      expect(
        await serviceJson(`SELECT jsonb_build_object(
          'table_select', has_table_privilege('authenticated', 'public.invoices', 'SELECT'),
          'table_insert', has_table_privilege('authenticated', 'public.invoices', 'INSERT'),
          'table_update', has_table_privilege('authenticated', 'public.invoices', 'UPDATE'),
          'table_delete', has_table_privilege('authenticated', 'public.invoices', 'DELETE'),
          'sequence_usage', has_sequence_privilege('authenticated', 'public.invoices_id_seq', 'USAGE')
        )::text`),
      ).toEqual({
        table_select: false,
        table_insert: false,
        table_update: false,
        table_delete: false,
        sequence_usage: false,
      });
    });

    it("rejects unsafe reads and malformed exact saves with zero effects", async () => {
      const operator = principal("alpha", "operator");
      const before = await financialState();
      const invalidReads = [
        { mode: "list", organization_id: tenants.alpha.organizationId },
        { mode: "list", sales_id: String(operator.salesId) },
        { mode: "list", invoice_id: alphaInvoiceIds[0] },
        { mode: "get", invoice_id: Number(alphaInvoiceIds[0]) },
        { mode: "get", invoice_id: alphaInvoiceIds[0], filters: {} },
        { mode: "list", page: 0 },
        { mode: "list", page: 1_000_001 },
        { mode: "list", per_page: 0 },
        { mode: "list", per_page: 101 },
        { mode: "list", sort: "amount_minor" },
        { mode: "list", order: "SIDEWAYS" },
        { mode: "list", filters: { unknown: "MALICIOUS_REFLECTION_MARKER" } },
        { mode: "list", filters: { status: "Issued" } },
      ];
      for (const request of invalidReads) {
        await expectRpcFailure(
          "read_billing_invoices_exact",
          operator.accessToken,
          request,
          "INVOICE_READ_INVALID_REQUEST",
        );
      }

      const base = exactSave(
        tenants.alpha.accountId,
        "EXACT-HTTP-INVALID",
        "1",
        "0%",
        "0",
        "1",
      );
      const invalidSaves: unknown[] = [
        { ...base, amount: 1 },
        { ...base, amount: { amount_minor: 1, currency: "USD" } },
        { ...base, amount: { amount_minor: "1".repeat(65), currency: "USD" } },
        { ...base, amount: { amount_minor: "+1", currency: "USD" } },
        { ...base, amount: { amount_minor: "1e2", currency: "USD" } },
        { ...base, amount: { amount_minor: "1,00", currency: "USD" } },
        { ...base, amount: { amount_minor: "1", currency: "EUR" } },
        {
          ...base,
          tax_rate: {
            kind: "ordinary_percentage",
            numerator: "1",
            denominator: "8",
            submitted_percentage: "100.1234567890%",
            rate_policy_version: "ordinary-percentage-v1",
          },
        },
        {
          ...base,
          tax_rate: {
            kind: "ordinary_percentage",
            numerator: "1",
            denominator: "7",
            submitted_percentage: "12.500%",
            rate_policy_version: "ordinary-percentage-v1",
          },
        },
        {
          ...base,
          tax_rate: {
            ...base.tax_rate,
            rate_policy_version: "ordinary-percentage-v2",
          },
        },
        {
          ...base,
          amount: { amount_minor: "9223372036854775807", currency: "USD" },
          tax_rate: {
            kind: "ordinary_percentage",
            numerator: "1",
            denominator: "1",
            submitted_percentage: "100%",
            rate_policy_version: "ordinary-percentage-v1",
          },
        },
        { ...base, unknown: "MALICIOUS_REFLECTION_MARKER" },
        { ...base, idempotency_key: "not-phase-three" },
        { ...base, financial_version: "v2" },
        {
          ...base,
          amount: { amount_minor: "2", currency: "USD" },
          line_items: [
            {
              description: "Mismatch",
              quantity_ratio: { numerator: "1", denominator: "1" },
              unit_price: { amount_minor: "1", currency: "USD" },
              extended_amount: { amount_minor: "1", currency: "USD" },
              currency_policy_version: "usd-v1",
              rounding_policy_version: "half-away-from-zero-v1",
            },
          ],
        },
      ];
      for (const request of invalidSaves) {
        await expectRpcFailure(
          "save_billing_invoice_exact",
          operator.accessToken,
          request,
          "INVOICE_SAVE_INVALID_REQUEST",
        );
      }

      await expectRpcFailure(
        "save_billing_invoice_exact",
        principal("alpha", "customer").accessToken,
        base,
        "INVOICE_SAVE_NOT_AUTHORIZED",
      );
      await expectRpcFailure(
        "save_billing_invoice_exact",
        principal("alpha", "operator", 1).accessToken,
        base,
        "INVOICE_SAVE_NOT_AUTHORIZED",
      );
      await expectRpcFailure(
        "save_billing_invoice_exact",
        principal("bravo", "operator").accessToken,
        {
          ...base,
          id: alphaInvoiceIds[0],
          billing_account_id: tenants.bravo.accountId,
        },
        "INVOICE_SAVE_NOT_AUTHORIZED",
      );
      await expectRpcFailure(
        "save_billing_invoice_exact",
        operator.accessToken,
        { ...base, billing_account_id: "33000000-0000-0000-0000-000000000200" },
        "INVOICE_SAVE_NOT_AUTHORIZED",
      );
      expect(await financialState()).toEqual(before);
    });

    it("locks invoice functions to postgres ownership and closed ACLs", async () => {
      const contract = await serviceJson<{
        anon_execute: number;
        authenticated_execute: number;
        locked_functions: number;
      }>(`SELECT jsonb_build_object(
        'locked_functions', (
          SELECT count(*) FROM pg_proc AS procedure_record
          JOIN pg_roles AS owner_role ON owner_role.oid = procedure_record.proowner
          WHERE procedure_record.oid = ANY (ARRAY[
            'public.read_billing_invoices_exact(jsonb)'::regprocedure,
            'public.read_billing_invoices_legacy_compat(jsonb)'::regprocedure,
            'public.save_billing_invoice_exact(jsonb)'::regprocedure
          ])
            AND procedure_record.prosecdef
            AND owner_role.rolname = 'postgres'
            AND coalesce(array_to_string(procedure_record.proconfig, ','), '') IN ('search_path=', 'search_path=""')
        ),
        'authenticated_execute', (
          SELECT count(*) FROM unnest(ARRAY[
            'public.read_billing_invoices_exact(jsonb)'::regprocedure,
            'public.read_billing_invoices_legacy_compat(jsonb)'::regprocedure,
            'public.save_billing_invoice_exact(jsonb)'::regprocedure
          ]) AS function_oid
          WHERE has_function_privilege('authenticated', function_oid, 'EXECUTE')
        ),
        'anon_execute', (
          SELECT count(*) FROM unnest(ARRAY[
            'public.read_billing_invoices_exact(jsonb)'::regprocedure,
            'public.read_billing_invoices_legacy_compat(jsonb)'::regprocedure,
            'public.save_billing_invoice_exact(jsonb)'::regprocedure
          ]) AS function_oid
          WHERE has_function_privilege('anon', function_oid, 'EXECUTE')
        )
      )::text`);
      expect(contract).toEqual({
        locked_functions: 3,
        authenticated_execute: 3,
        anon_execute: 0,
      });

      const anonymous = await rpcRequest(
        "read_billing_invoices_exact",
        undefined,
        { mode: "list", filters: {} },
      );
      expectSafeFailure(anonymous, await responseJson(anonymous));
    });
  },
);
