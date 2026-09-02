import { spawn } from "node:child_process";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

type BillingRole =
  | "administrator"
  | "operator"
  | "reviewer"
  | "auditor"
  | "customer";
type TenantName = "alpha" | "bravo";
type BillingResource =
  | "billing_accounts"
  | "billing_account_owners"
  | "billing_contacts"
  | "billing_role_assignments"
  | "billing_audit_events"
  | "invoices";

type Principal = {
  accessToken: string;
  role: BillingRole;
  salesId: number;
  tenant: TenantName;
  userId: string;
};

type TenantFixture = {
  accountId: string;
  organizationId: string;
};

type HumanReadCase = {
  account: string;
  expectedVisibility: boolean;
  operation: "select";
  organization: string;
  principal: `${TenantName}-${BillingRole}`;
  resource: BillingResource;
};

type ProcessResult = {
  code: number;
  stdout: string;
  stderr: string;
};

type AuditSnapshot = {
  count: number;
  last: null | {
    action: string;
    actor_id: string;
    actor_type: string;
    details: Record<string, unknown>;
    reason: string | null;
    result: string;
  };
};

type ProtectedState = {
  accounts: { id: string; status: string }[];
  assignments: { id: string; role: string }[];
  audit_count: number;
  contacts: {
    active: boolean;
    end_reason: string | null;
    effective_until: string | null;
    id: string;
  }[];
};

const apiUrl = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const activePrincipals: Principal[] = [];
const repositoryRoot = path.resolve(__dirname, "../..");
const expectedContainer = "supabase_db_atomic-crm-demo";
let databaseContainer: string | undefined;
const mutationContactId = "21000000-0000-0000-0000-000000000320";
const tenants: Record<TenantName, TenantFixture> = {
  alpha: {
    organizationId: "21000000-0000-0000-0000-000000000100",
    accountId: "21000000-0000-0000-0000-000000000200",
  },
  bravo: {
    organizationId: "22000000-0000-0000-0000-000000000100",
    accountId: "22000000-0000-0000-0000-000000000200",
  },
};
const roles: BillingRole[] = [
  "administrator",
  "operator",
  "reviewer",
  "auditor",
  "customer",
];
const resources: BillingResource[] = [
  "billing_accounts",
  "billing_account_owners",
  "billing_contacts",
  "billing_role_assignments",
  "billing_audit_events",
  "invoices",
];
const sameTenantVisibility: Record<BillingRole, Set<BillingResource>> = {
  administrator: new Set(resources),
  operator: new Set(
    resources.filter((resource) => resource !== "billing_audit_events"),
  ),
  reviewer: new Set(
    resources.filter((resource) => resource !== "billing_audit_events"),
  ),
  auditor: new Set(resources),
  customer: new Set(["billing_accounts", "billing_contacts"]),
};

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
  timeoutMs = 15_000,
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
        stdout: "",
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
  if (!databaseContainer) {
    throw new Error("database container is unavailable");
  }
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
    20_000,
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
    headers: {
      apikey: local.anonKey,
      "Content-Type": "application/json",
    },
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

async function createPrincipal(
  tenant: TenantName,
  role: BillingRole,
): Promise<Principal> {
  const credential = ["local", "billing", "fixture", "2026!"].join("-");
  const email = `billing-http-${tenant}-${role}@release.example`;
  const signup = await authRequest("/auth/v1/signup", {
    email,
    password: credential,
    data: { first_name: "Billing", last_name: `${tenant} ${role}` },
  });
  expect(signup.status).toBe(200);
  const signupBody = (await responseJson(signup)) as Record<string, unknown>;
  const signupUser = signupBody.user as Record<string, unknown>;
  const userId = assertUuid(String(signupUser.id));

  const login = await authRequest("/auth/v1/token?grant_type=password", {
    email,
    password: credential,
  });
  expect(login.status).toBe(200);
  const loginBody = (await responseJson(login)) as Record<string, unknown>;
  const accessToken = loginBody.access_token;
  expect(accessToken).toEqual(expect.any(String));

  const sales = await restRequest(
    `sales?select=id&user_id=eq.${encodeURIComponent(userId)}`,
    String(accessToken),
  );
  expect(sales.status).toBe(200);
  const salesRows = (await responseJson(sales)) as Record<string, unknown>[];
  expect(salesRows).toHaveLength(1);

  const principal = {
    accessToken: String(accessToken),
    role,
    salesId: assertSalesId(Number(salesRows[0].id)),
    tenant,
    userId,
  };
  activePrincipals.push(principal);
  return principal;
}

function fixtureSql(principals: Map<string, Principal>) {
  const assignments = (Object.keys(tenants) as TenantName[]).flatMap((tenant) =>
    roles
      .filter((role) => role !== "customer")
      .map((role) => {
        const principal = principals.get(`${tenant}-${role}`);
        if (!principal) throw new Error("principal registry is incomplete");
        return `('${tenants[tenant].organizationId}', '${tenants[tenant].accountId}', ${assertSalesId(principal.salesId)}, '${role}')`;
      }),
  );
  const alphaOperator = principals.get("alpha-operator");
  const bravoOperator = principals.get("bravo-operator");
  const alphaCustomer = principals.get("alpha-customer");
  const bravoCustomer = principals.get("bravo-customer");
  if (!alphaOperator || !bravoOperator || !alphaCustomer || !bravoCustomer) {
    throw new Error("principal registry is incomplete");
  }

  return `BEGIN;
    INSERT INTO public.billing_role_assignments
      (organization_id, account_id, sales_id, role)
    VALUES ${assignments.join(",\n")};

    INSERT INTO public.billing_contacts
      (id, organization_id, account_id, name, email, preferred_contact_method, auth_user_id)
    VALUES
      ('21000000-0000-0000-0000-000000000310', '${tenants.alpha.organizationId}', '${tenants.alpha.accountId}', 'Alpha HTTP Customer', 'alpha-http-customer@release.example', 'email', '${assertUuid(alphaCustomer.userId)}'),
      ('22000000-0000-0000-0000-000000000310', '${tenants.bravo.organizationId}', '${tenants.bravo.accountId}', 'Bravo HTTP Customer', 'bravo-http-customer@release.example', 'email', '${assertUuid(bravoCustomer.userId)}'),
      ('${mutationContactId}', '${tenants.alpha.organizationId}', '${tenants.alpha.accountId}', 'Mutation Fixture', NULL, 'none', NULL);

    UPDATE public.billing_account_owners
    SET sales_id = CASE organization_id
      WHEN '${tenants.alpha.organizationId}' THEN ${assertSalesId(alphaOperator.salesId)}
      WHEN '${tenants.bravo.organizationId}' THEN ${assertSalesId(bravoOperator.salesId)}
      ELSE sales_id
    END
    WHERE account_id IN ('${tenants.alpha.accountId}', '${tenants.bravo.accountId}')
      AND effective_until IS NULL;

    INSERT INTO public.companies (id, name, sales_id)
    VALUES
      (210001, 'Alpha HTTP Company', ${assertSalesId(alphaOperator.salesId)}),
      (220001, 'Bravo HTTP Company', ${assertSalesId(bravoOperator.salesId)});

    UPDATE public.billing_accounts
    SET company_id = CASE id
      WHEN '${tenants.alpha.accountId}' THEN 210001
      WHEN '${tenants.bravo.accountId}' THEN 220001
      ELSE company_id
    END
    WHERE id IN ('${tenants.alpha.accountId}', '${tenants.bravo.accountId}');

    INSERT INTO public.invoices
      (id, company_id, sales_id, invoice_number, amount, total_amount, status,
       organization_id, billing_account_id)
    VALUES
      (210001, 210001, ${assertSalesId(alphaOperator.salesId)}, 'HTTP-ALPHA', 100.00, 100.00, 'Draft', '${tenants.alpha.organizationId}', '${tenants.alpha.accountId}'),
      (220001, 220001, ${assertSalesId(bravoOperator.salesId)}, 'HTTP-BRAVO', 200.00, 200.00, 'Draft', '${tenants.bravo.organizationId}', '${tenants.bravo.accountId}');
  COMMIT;`;
}

function humanReadRegistry(): HumanReadCase[] {
  return (Object.keys(tenants) as TenantName[]).flatMap((tenant) =>
    roles.flatMap((role) =>
      (Object.keys(tenants) as TenantName[]).flatMap((targetTenant) =>
        resources.map((resource) => ({
          principal: `${tenant}-${role}` as const,
          organization: tenants[targetTenant].organizationId,
          account: tenants[targetTenant].accountId,
          resource,
          operation: "select" as const,
          expectedVisibility:
            tenant === targetTenant && sameTenantVisibility[role].has(resource),
        })),
      ),
    ),
  );
}

async function setupHumanWorld(): Promise<Map<string, Principal>> {
  localApiConfiguration();
  databaseContainer = await resolveDatabaseContainer();
  const principals = new Map<string, Principal>();
  for (const tenant of Object.keys(tenants) as TenantName[]) {
    for (const role of roles) {
      const principal = await createPrincipal(tenant, role);
      principals.set(`${tenant}-${role}`, principal);
    }
  }
  await psql(fixtureSql(principals));
  return principals;
}

function resourceQuery(resource: BillingResource, accountId: string) {
  const key =
    resource === "billing_accounts"
      ? "id"
      : resource === "invoices"
        ? "billing_account_id"
        : "account_id";
  return `${resource}?select=id&${key}=eq.${encodeURIComponent(accountId)}`;
}

function expectSafePublicFailure(response: Response, body: unknown) {
  expect([401, 403, 405]).toContain(response.status);
  expect(body).toEqual(expect.any(Object));
  expect(Object.keys(body as Record<string, unknown>)).toEqual(
    expect.arrayContaining(["message"]),
  );
  expect(JSON.stringify(body)).not.toMatch(
    /auth\.users|request\.jwt|private\.|stack trace|search_path|eyJ[A-Za-z0-9_-]+\./i,
  );
}

async function auditSnapshot(
  action: string,
  subjectId: string,
): Promise<AuditSnapshot> {
  if (!/^[a-z][a-z0-9_.-]+$/.test(action)) {
    throw new Error("test audit action is invalid");
  }
  assertUuid(subjectId);
  return serviceJson<AuditSnapshot>(`SELECT jsonb_build_object(
    'count', count(*),
    'last', (
      SELECT jsonb_build_object(
        'actor_type', event.actor_type,
        'actor_id', event.actor_id,
        'action', event.action,
        'result', event.result,
        'reason', event.reason,
        'details', event.details
      )
      FROM public.billing_audit_events AS event
      WHERE event.action = '${action}'
        AND event.subject_id = '${subjectId}'
      ORDER BY event.id DESC
      LIMIT 1
    )
  )::text
  FROM public.billing_audit_events
  WHERE action = '${action}'
    AND subject_id = '${subjectId}'`);
}

async function protectedState(): Promise<ProtectedState> {
  return serviceJson<ProtectedState>(`SELECT jsonb_build_object(
    'accounts', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', account.id,
        'status', account.billing_status
      ) ORDER BY account.id), '[]'::jsonb)
      FROM public.billing_accounts AS account
      WHERE account.id IN ('${tenants.alpha.accountId}', '${tenants.bravo.accountId}')
    ),
    'contacts', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', contact.id,
        'active', contact.active,
        'effective_until', contact.effective_until,
        'end_reason', contact.end_reason
      ) ORDER BY contact.id), '[]'::jsonb)
      FROM public.billing_contacts AS contact
      WHERE contact.account_id IN ('${tenants.alpha.accountId}', '${tenants.bravo.accountId}')
    ),
    'assignments', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', assignment.id,
        'role', assignment.role
      ) ORDER BY assignment.id), '[]'::jsonb)
      FROM public.billing_role_assignments AS assignment
      WHERE assignment.account_id IN ('${tenants.alpha.accountId}', '${tenants.bravo.accountId}')
    ),
    'audit_count', (SELECT count(*) FROM public.billing_audit_events)
  )::text`);
}

async function expectDeniedMutation(
  response: Response,
  before: ProtectedState,
) {
  const body = await responseJson(response);
  if (response.ok) {
    expect([200, 204]).toContain(response.status);
    expect(body === null || (Array.isArray(body) && body.length === 0)).toBe(
      true,
    );
  } else {
    expectSafePublicFailure(response, body);
  }
  expect(await protectedState()).toEqual(before);
}

async function cleanupHumanWorld() {
  if (!databaseContainer || activePrincipals.length === 0) return;
  const salesIds = activePrincipals
    .map((principal) => assertSalesId(principal.salesId))
    .join(",");
  const userIds = activePrincipals
    .map((principal) => `'${assertUuid(principal.userId)}'`)
    .join(",");
  await psql(`BEGIN;
    DELETE FROM public.invoices WHERE id IN (210001, 220001);
    UPDATE public.billing_accounts
    SET company_id = NULL
    WHERE id IN ('${tenants.alpha.accountId}', '${tenants.bravo.accountId}');
    UPDATE public.billing_account_owners
    SET sales_id = CASE organization_id
      WHEN '${tenants.alpha.organizationId}' THEN (
        SELECT id FROM public.sales WHERE user_id = '21000000-0000-0000-0000-000000000002'
      )
      WHEN '${tenants.bravo.organizationId}' THEN (
        SELECT id FROM public.sales WHERE user_id = '22000000-0000-0000-0000-000000000002'
      )
      ELSE sales_id
    END
    WHERE account_id IN ('${tenants.alpha.accountId}', '${tenants.bravo.accountId}')
      AND effective_until IS NULL;
    DELETE FROM public.companies WHERE id IN (210001, 220001);
    DELETE FROM public.billing_contacts
    WHERE id IN (
      '21000000-0000-0000-0000-000000000310',
      '22000000-0000-0000-0000-000000000310',
      '${mutationContactId}'
    );
    DELETE FROM public.billing_role_assignments WHERE sales_id IN (${salesIds});
    DELETE FROM public.sales WHERE user_id IN (${userIds});
    DELETE FROM auth.users WHERE id IN (${userIds});
  COMMIT;`);
}

afterAll(async () => {
  if (!apiUrl || !anonKey) return;
  await Promise.allSettled(
    activePrincipals.map((principal) =>
      fetch(`${apiUrl.replace(/\/$/, "")}/auth/v1/logout?scope=global`, {
        method: "POST",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${principal.accessToken}`,
        },
      }),
    ),
  );
  await cleanupHumanWorld();
});

describe.runIf(Boolean(process.env.SUPABASE_DB_URL))(
  "billing tenant Auth and HTTP boundary",
  () => {
    let principals: Map<string, Principal>;

    beforeAll(async () => {
      principals = await setupHumanWorld();
    });

    it("human roles obey the complete two-tenant read registry", async () => {
      const registry = humanReadRegistry();
      expect(registry).toHaveLength(120);
      expect(principals.size).toBe(10);

      for (const testCase of registry) {
        const principal = principals.get(testCase.principal);
        expect(principal).toBeDefined();
        const response = await restRequest(
          resourceQuery(testCase.resource, testCase.account),
          principal!.accessToken,
        );
        expect(
          response.status,
          `${testCase.principal} ${testCase.resource} ${testCase.operation}`,
        ).toBe(200);
        const rows = (await responseJson(response)) as Record<
          string,
          unknown
        >[];
        expect(rows.length > 0).toBe(testCase.expectedVisibility);
      }

      for (const resource of resources) {
        const response = await restRequest(
          resourceQuery(resource, tenants.alpha.accountId),
        );
        expectSafePublicFailure(response, await responseJson(response));
      }

      expect(activePrincipals).toHaveLength(10);
      expect(
        new Set(activePrincipals.map((principal) => principal.userId)),
      ).toHaveProperty("size", 10);
      expect(
        new Set(activePrincipals.map((principal) => principal.accessToken)),
      ).toHaveProperty("size", 10);
    });

    it("effects and audit postconditions stay exact for allowed and denied mutations", async () => {
      const requiredCaseClasses = [
        "authorized-account-status",
        "authorized-contact-ending",
        "authorized-role-assignment",
        "cross-tenant",
        "wrong-role",
        "browser-authored-tenant",
        "hard-delete",
      ];
      expect(requiredCaseClasses).toHaveLength(7);
      expect(principals.size).toBe(10);

      const operator = principals.get("alpha-operator")!;
      const administrator = principals.get("alpha-administrator")!;
      const reviewer = principals.get("alpha-reviewer")!;

      const accountAuditBefore = await auditSnapshot(
        "billing_accounts.update",
        tenants.alpha.accountId,
      );
      const accountUpdate = await restRequest(
        `billing_accounts?id=eq.${tenants.alpha.accountId}&select=id,billing_status`,
        operator.accessToken,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({ billing_status: "on_hold" }),
        },
      );
      expect(accountUpdate.status).toBe(200);
      expect(await responseJson(accountUpdate)).toEqual([
        { id: tenants.alpha.accountId, billing_status: "on_hold" },
      ]);
      const accountAuditAfter = await auditSnapshot(
        "billing_accounts.update",
        tenants.alpha.accountId,
      );
      expect(accountAuditAfter.count).toBe(accountAuditBefore.count + 1);
      expect(accountAuditAfter.last).toEqual({
        actor_type: "human",
        actor_id: operator.userId,
        action: "billing_accounts.update",
        result: "succeeded",
        reason: null,
        details: { status: "on_hold" },
      });

      const contactAuditBefore = await auditSnapshot(
        "billing_contacts.update",
        mutationContactId,
      );
      const contactUpdate = await restRequest(
        `billing_contacts?id=eq.${mutationContactId}&select=id,active,end_reason`,
        operator.accessToken,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({
            active: false,
            effective_until: "2030-01-01T00:00:00Z",
            end_reason: "HTTP fixture ended",
          }),
        },
      );
      expect(contactUpdate.status).toBe(200);
      expect(await responseJson(contactUpdate)).toEqual([
        {
          id: mutationContactId,
          active: false,
          end_reason: "HTTP fixture ended",
        },
      ]);
      const contactAuditAfter = await auditSnapshot(
        "billing_contacts.update",
        mutationContactId,
      );
      expect(contactAuditAfter.count).toBe(contactAuditBefore.count + 1);
      expect(contactAuditAfter.last).toEqual({
        actor_type: "human",
        actor_id: operator.userId,
        action: "billing_contacts.update",
        result: "succeeded",
        reason: "HTTP fixture ended",
        details: { status: "false" },
      });

      const assignmentCreate = await restRequest(
        "billing_role_assignments?select=id,role",
        administrator.accessToken,
        {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({
            organization_id: tenants.alpha.organizationId,
            account_id: tenants.alpha.accountId,
            sales_id: operator.salesId,
            role: "reviewer",
          }),
        },
      );
      expect(assignmentCreate.status).toBe(201);
      const assignmentRows = (await responseJson(assignmentCreate)) as {
        id: string;
        role: string;
      }[];
      expect(assignmentRows).toHaveLength(1);
      const assignmentId = assertUuid(assignmentRows[0].id);
      expect(assignmentRows[0].role).toBe("reviewer");
      const assignmentAudit = await auditSnapshot(
        "billing_role_assignments.insert",
        assignmentId,
      );
      expect(assignmentAudit.count).toBe(1);
      expect(assignmentAudit.last).toEqual({
        actor_type: "human",
        actor_id: administrator.userId,
        action: "billing_role_assignments.insert",
        result: "succeeded",
        reason: null,
        details: { role: "reviewer" },
      });

      let beforeDenied = await protectedState();
      await expectDeniedMutation(
        await restRequest(
          `billing_accounts?id=eq.${tenants.bravo.accountId}&select=id`,
          operator.accessToken,
          {
            method: "PATCH",
            headers: { Prefer: "return=representation" },
            body: JSON.stringify({ billing_status: "on_hold" }),
          },
        ),
        beforeDenied,
      );

      beforeDenied = await protectedState();
      await expectDeniedMutation(
        await restRequest(
          `billing_accounts?id=eq.${tenants.alpha.accountId}&select=id`,
          reviewer.accessToken,
          {
            method: "PATCH",
            headers: { Prefer: "return=representation" },
            body: JSON.stringify({ billing_status: "active" }),
          },
        ),
        beforeDenied,
      );

      beforeDenied = await protectedState();
      await expectDeniedMutation(
        await restRequest(
          "billing_accounts?select=id",
          administrator.accessToken,
          {
            method: "POST",
            headers: { Prefer: "return=representation" },
            body: JSON.stringify({
              id: "22000000-0000-0000-0000-000000000299",
              organization_id: tenants.bravo.organizationId,
              customer_name: "Rejected browser scope",
            }),
          },
        ),
        beforeDenied,
      );

      for (const pathName of [
        `billing_accounts?id=eq.${tenants.alpha.accountId}`,
        `billing_contacts?id=eq.${mutationContactId}`,
        `billing_role_assignments?id=eq.${assignmentId}`,
      ]) {
        beforeDenied = await protectedState();
        await expectDeniedMutation(
          await restRequest(pathName, administrator.accessToken, {
            method: "DELETE",
            headers: { Prefer: "return=representation" },
          }),
          beforeDenied,
        );
      }
    });
  },
);
