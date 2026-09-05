import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

type TenantName = "alpha" | "bravo";
type PrincipalRole = "operator" | "reviewer" | "customer" | "automation";
type Principal = {
  accessToken: string;
  role: PrincipalRole;
  salesId: number;
  tenant: TenantName;
  userId: string;
};
type ProcessResult = { code: number; stdout: string; stderr: string };
type UploadCapability = {
  content: string;
  evidenceId: string;
  expiresAt: string;
  url: string;
};

const repositoryRoot = path.resolve(__dirname, "../..");
const projectId = fs
  .readFileSync(path.join(repositoryRoot, "supabase/config.toml"), "utf8")
  .match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];
if (!projectId) {
  throw new Error("supabase project_id is unavailable");
}
const expectedContainer = `supabase_db_${projectId}`;
const apiUrl = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const activePrincipals: Principal[] = [];
const principals = new Map<string, Principal>();
const tenants = {
  alpha: {
    organizationId: "21000000-0000-0000-0000-000000000100",
    accountId: "21000000-0000-0000-0000-000000000200",
  },
  bravo: {
    organizationId: "22000000-0000-0000-0000-000000000100",
    accountId: "22000000-0000-0000-0000-000000000200",
  },
} as const;
const automationPrincipalId = "23000000-0000-0000-0000-000000000400";
const automationGrantId = "23000000-0000-0000-0000-000000000500";
let databaseContainer: string | undefined;
let uploadedCapability: UploadCapability | undefined;

function localConfiguration() {
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
  if (!databaseContainer) throw new Error("database container is unavailable");
  const result = await runProcess("docker", [
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
  ]);
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
  const local = localConfiguration();
  return fetch(`${local.apiUrl}${pathName}`, {
    method: "POST",
    headers: { apikey: local.anonKey, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function restRequest(pathName: string, token: string) {
  const local = localConfiguration();
  return fetch(`${local.apiUrl}/rest/v1/${pathName}`, {
    headers: {
      apikey: local.anonKey,
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
}

async function createPrincipal(
  tenant: TenantName,
  role: PrincipalRole,
): Promise<Principal> {
  const credential = ["local", "evidence", "fixture", "2026!"].join("-");
  const email = `evidence-http-${tenant}-${role}@release.example`;
  const signup = await authRequest("/auth/v1/signup", {
    email,
    password: credential,
    data: { first_name: "Evidence", last_name: `${tenant} ${role}` },
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
  const sales = await restRequest(
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
  activePrincipals.push(principal);
  principals.set(`${tenant}-${role}`, principal);
  return principal;
}

async function setupPrincipals() {
  databaseContainer = await resolveDatabaseContainer();
  const alphaOperator = await createPrincipal("alpha", "operator");
  const alphaReviewer = await createPrincipal("alpha", "reviewer");
  const alphaCustomer = await createPrincipal("alpha", "customer");
  const alphaAutomation = await createPrincipal("alpha", "automation");
  const bravoOperator = await createPrincipal("bravo", "operator");

  await psql(`BEGIN;
    DELETE FROM public.sales WHERE user_id = '${alphaAutomation.userId}';
    INSERT INTO public.billing_role_assignments
      (organization_id, account_id, sales_id, role)
    VALUES
      ('${tenants.alpha.organizationId}', '${tenants.alpha.accountId}', ${alphaOperator.salesId}, 'operator'),
      ('${tenants.alpha.organizationId}', '${tenants.alpha.accountId}', ${alphaReviewer.salesId}, 'reviewer'),
      ('${tenants.bravo.organizationId}', '${tenants.bravo.accountId}', ${bravoOperator.salesId}, 'operator');
    INSERT INTO public.billing_contacts
      (id, organization_id, account_id, name, email, preferred_contact_method, auth_user_id)
    VALUES (
      '23000000-0000-0000-0000-000000000300',
      '${tenants.alpha.organizationId}', '${tenants.alpha.accountId}',
      'Evidence HTTP Customer', 'evidence-http-customer@release.example',
      'email', '${alphaCustomer.userId}'
    );
    INSERT INTO public.billing_automation_principals
      (id, organization_id, auth_user_id, name)
    VALUES (
      '${automationPrincipalId}', '${tenants.alpha.organizationId}',
      '${alphaAutomation.userId}', 'Evidence HTTP Scanner'
    );
    INSERT INTO public.billing_automation_grants
      (id, organization_id, account_id, principal_id, command_name,
       provider_reference, policy_version, action_kind, currency, max_actions)
    VALUES (
      '${automationGrantId}', '${tenants.alpha.organizationId}',
      '${tenants.alpha.accountId}', '${automationPrincipalId}',
      'evidence.inspect', 'scanner-http-fixture', 'scanner-http-v1',
      'evidence.inspection', 'USD', 2
    );
  COMMIT;`);
}

async function invokeEvidence(
  token: string | undefined,
  body?: Record<string, unknown>,
  method = "POST",
) {
  const local = localConfiguration();
  return fetch(`${local.apiUrl}/functions/v1/billing_evidence`, {
    method,
    headers: {
      apikey: local.anonKey,
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: method === "POST" && body ? JSON.stringify(body) : undefined,
  });
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function evidenceCount() {
  return Number(
    await psql("SELECT count(*) FROM public.billing_evidence_objects"),
  );
}

async function uploadBody(content: string) {
  return {
    command: "upload",
    account_id: tenants.alpha.accountId,
    kind: "receipt",
    original_filename: "synthetic-receipt.pdf",
    mime_type: "application/pdf",
    size_bytes: new TextEncoder().encode(content).byteLength,
    sha256: await sha256Hex(content),
    purpose: "operator_upload",
  };
}

async function createUploadedEvidence(
  label: string,
): Promise<UploadCapability> {
  const operator = principals.get("alpha-operator");
  if (!operator) throw new Error("operator principal is unavailable");
  const content = `synthetic-${label}-pdf-content`;
  const response = await invokeEvidence(
    operator.accessToken,
    await uploadBody(content),
  );
  expect(response.status).toBe(200);
  const body = (await responseJson(response)) as Record<string, unknown>;
  expect(body.result).toBe("ready");
  const evidenceId = assertUuid(String(body.evidence_id));
  const url = String(body.url);
  const signedUrl = new URL(url);
  expect(signedUrl.searchParams.has("token")).toBe(true);
  const upload = await fetch(signedUrl, {
    method: "PUT",
    headers: {
      apikey: anonKey!,
      "Content-Type": "application/pdf",
      "x-upsert": "false",
    },
    body: content,
  });
  expect(upload.ok).toBe(true);
  return { content, evidenceId, expiresAt: String(body.expires_at), url };
}

async function evidenceState(evidenceId: string) {
  assertUuid(evidenceId);
  return serviceJson<Record<string, unknown>>(`SELECT jsonb_build_object(
    'inspection_status', inspection_status,
    'inspection_reason_code', inspection_reason_code,
    'inspection_principal_id', inspection_principal_id,
    'inspection_grant_id', inspection_grant_id,
    'lifecycle_status', lifecycle_status
  )::text
  FROM public.billing_evidence_objects
  WHERE id = '${evidenceId}'`);
}

async function evidenceConflictSnapshot(
  evidenceIds: string[],
  idempotencyKey: string,
) {
  if (evidenceIds.length === 0) {
    throw new Error("evidence conflict snapshot requires evidence");
  }
  const ids = evidenceIds.map(assertUuid);
  if (!/^[a-z0-9][a-z0-9-]{7,127}$/.test(idempotencyKey)) {
    throw new Error("evidence conflict key is invalid");
  }
  return serviceJson<Record<string, unknown>>(`SELECT jsonb_build_object(
    'evidence', (
      SELECT jsonb_agg(to_jsonb(evidence) ORDER BY evidence.id)
      FROM public.billing_evidence_objects AS evidence
      WHERE evidence.id IN (${ids.map((id) => `'${id}'`).join(",")})
    ),
    'grant', (
      SELECT to_jsonb(grant_row)
      FROM public.billing_automation_grants AS grant_row
      WHERE grant_row.id = '${automationGrantId}'
    ),
    'executions', (
      SELECT jsonb_agg(to_jsonb(execution) ORDER BY execution.id)
      FROM public.billing_automation_executions AS execution
      WHERE execution.principal_id = '${automationPrincipalId}'
    ),
    'audit', (
      SELECT jsonb_agg(to_jsonb(audit) ORDER BY audit.id)
      FROM public.billing_audit_events AS audit
      WHERE audit.actor_id = '${automationPrincipalId}'
    ),
    'key_execution_count', (
      SELECT count(*)
      FROM public.billing_automation_executions
      WHERE idempotency_key = '${idempotencyKey}'
    )
  )::text`);
}

async function countWhere(table: string, predicate: string) {
  if (
    ![
      "billing_automation_executions",
      "billing_evidence_access_events",
      "billing_audit_events",
    ].includes(table)
  ) {
    throw new Error("test count table is invalid");
  }
  return Number(
    await psql(`SELECT count(*) FROM public.${table} WHERE ${predicate}`),
  );
}

function decodeCapabilityExpiry(url: URL) {
  const token = url.searchParams.get("token");
  if (!token) throw new Error("signed capability token is unavailable");
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("signed capability shape is invalid");
  const payload = JSON.parse(
    Buffer.from(parts[1], "base64url").toString("utf8"),
  ) as Record<string, unknown>;
  if (!Number.isSafeInteger(payload.exp)) {
    throw new Error("signed capability expiry is invalid");
  }
  return Number(payload.exp) * 1000;
}

function tamperToken(url: URL) {
  const copy = new URL(url);
  const token = copy.searchParams.get("token");
  if (!token) throw new Error("signed capability token is unavailable");
  const parts = token.split(".");
  if (parts.length !== 3 || parts[2].length === 0) {
    throw new Error("signed capability shape is invalid");
  }
  const first = parts[2][0];
  parts[2] = `${first === "a" ? "b" : "a"}${parts[2].slice(1)}`;
  copy.searchParams.set("token", parts.join("."));
  return copy;
}

function tamperPath(url: URL) {
  const copy = new URL(url);
  const last = copy.pathname.at(-1);
  copy.pathname = `${copy.pathname.slice(0, -1)}${last === "a" ? "b" : "a"}`;
  return copy;
}

function expectSafeError(response: Response, body: unknown) {
  expect([400, 401, 403, 404, 405, 409, 500, 503]).toContain(response.status);
  expect(body).toEqual(expect.any(Object));
  expect(Object.keys(body as Record<string, unknown>)).toEqual(
    expect.arrayContaining(["message"]),
  );
  expect(JSON.stringify(body)).not.toMatch(
    /auth\.users|request\.jwt|private\.|search_path|stack trace|eyJ[A-Za-z0-9_-]+\./i,
  );
}

beforeAll(async () => {
  localConfiguration();
  await setupPrincipals();
});

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
});

describe.runIf(Boolean(process.env.SUPABASE_DB_URL))(
  "billing evidence Edge and Storage boundary",
  () => {
    it("upload creates one quarantined row and server-owned signed capability", async () => {
      const operator = principals.get("alpha-operator")!;
      const reviewer = principals.get("alpha-reviewer")!;
      const customer = principals.get("alpha-customer")!;
      const bravoOperator = principals.get("bravo-operator")!;
      const validBody = await uploadBody("synthetic-pdf-content");
      const before = await evidenceCount();

      const method = await invokeEvidence(
        operator.accessToken,
        undefined,
        "GET",
      );
      expect(method.status).toBe(405);
      expectSafeError(method, await responseJson(method));

      for (const token of [
        undefined,
        ["invalid", "jwt", "signature"].join("."),
      ]) {
        const response = await invokeEvidence(token, validBody);
        expect(response.status).toBe(401);
        expectSafeError(response, await responseJson(response));
      }

      const invalidCases: Array<{
        body: Record<string, unknown>;
        principal: Principal;
        status: number;
      }> = [
        {
          principal: operator,
          status: 400,
          body: { ...validBody, object_path: "caller/selected/path" },
        },
        {
          principal: operator,
          status: 400,
          body: { ...validBody, mime_type: "application/x-executable" },
        },
        {
          principal: operator,
          status: 400,
          body: { ...validBody, size_bytes: 10 * 1024 * 1024 + 1 },
        },
        ...[
          "nested/receipt.pdf",
          "nested\\receipt.pdf",
          "receipt\u0000.pdf",
        ].map((original_filename) => ({
          principal: operator,
          status: 400,
          body: { ...validBody, original_filename },
        })),
        {
          principal: reviewer,
          status: 200,
          body: validBody,
        },
        {
          principal: operator,
          status: 200,
          body: { ...validBody, account_id: tenants.bravo.accountId },
        },
        {
          principal: customer,
          status: 200,
          body: { ...validBody, purpose: "customer_submission" },
        },
        {
          principal: bravoOperator,
          status: 200,
          body: { ...validBody, account_id: tenants.alpha.accountId },
        },
      ];
      for (const testCase of invalidCases) {
        const response = await invokeEvidence(
          testCase.principal.accessToken,
          testCase.body,
        );
        expect(response.status).toBe(testCase.status);
        const body = (await responseJson(response)) as Record<string, unknown>;
        if (response.status === 200) {
          expect(body.result).toBe("denied");
          expect(body.reason_code).toEqual(expect.any(String));
        } else {
          expectSafeError(response, body);
        }
      }
      expect(await evidenceCount()).toBe(before);

      const response = await invokeEvidence(operator.accessToken, validBody);
      expect(response.status).toBe(200);
      const body = (await responseJson(response)) as Record<string, unknown>;
      expect(Object.keys(body).sort()).toEqual([
        "evidence_id",
        "expires_at",
        "result",
        "url",
      ]);
      expect(body.result).toBe("ready");
      const evidenceId = assertUuid(String(body.evidence_id));
      expect(typeof body.url).toBe("string");
      expect(typeof body.expires_at).toBe("string");
      const signedUrl = new URL(String(body.url));
      expect(["127.0.0.1", "localhost"]).toContain(signedUrl.hostname);
      expect(signedUrl.searchParams.has("token")).toBe(true);
      expect(signedUrl.pathname.includes("synthetic-receipt.pdf")).toBe(false);

      const metadata = await serviceJson<Record<string, unknown>>(
        `SELECT jsonb_build_object(
          'organization_id', organization_id,
          'account_id', account_id,
          'object_path', object_path,
          'status', inspection_status,
          'mime_type', mime_type,
          'size_bytes', size_bytes,
          'sha256', sha256
        )::text
        FROM public.billing_evidence_objects
        WHERE id = '${evidenceId}'`,
      );
      expect(metadata.organization_id).toBe(tenants.alpha.organizationId);
      expect(metadata.account_id).toBe(tenants.alpha.accountId);
      expect(metadata.status).toBe("quarantined");
      expect(metadata.mime_type).toBe(validBody.mime_type);
      expect(metadata.size_bytes).toBe(validBody.size_bytes);
      expect(metadata.sha256).toBe(validBody.sha256);
      expect(String(metadata.object_path).endsWith(`/${evidenceId}`)).toBe(
        true,
      );
      expect(
        String(metadata.object_path).includes("synthetic-receipt.pdf"),
      ).toBe(false);
      expect(await evidenceCount()).toBe(before + 1);

      const upload = await fetch(signedUrl, {
        method: "PUT",
        headers: {
          apikey: anonKey!,
          "Content-Type": "application/pdf",
          "x-upsert": "false",
        },
        body: "synthetic-pdf-content",
      });
      expect(upload.ok).toBe(true);
      uploadedCapability = {
        content: "synthetic-pdf-content",
        evidenceId,
        expiresAt: String(body.expires_at),
        url: signedUrl.toString(),
      };
    });

    it("inspection and download reject cross-tenant replay and capability tamper", async () => {
      const requiredCases = [
        "exact-scanner-clean",
        "exact-scanner-reject",
        "idempotent-replay",
        "clean-download-60-seconds",
        "quarantine-reject-expiry-hold",
        "cross-tenant",
        "direct-bucket",
        "path-tamper",
        "token-tamper",
      ];
      expect(requiredCases).toHaveLength(9);
      expect(principals.size).toBe(5);
      const cleanUpload =
        uploadedCapability ?? (await createUploadedEvidence("clean"));
      const rejectedUpload = await createUploadedEvidence("rejected");
      const operator = principals.get("alpha-operator")!;
      const automation = principals.get("alpha-automation")!;
      const bravoOperator = principals.get("bravo-operator")!;

      const cleanBefore = await evidenceState(cleanUpload.evidenceId);
      const deniedHuman = await invokeEvidence(operator.accessToken, {
        command: "inspection",
        evidence_id: cleanUpload.evidenceId,
        decision: "clean",
        reason_code: "SCAN_CLEAN",
        idempotency_key: "human-inspection-denied-0001",
      });
      expect(deniedHuman.status).toBe(200);
      expect(await responseJson(deniedHuman)).toEqual({
        result: "denied",
        reason_code: "INSPECTION_NOT_AUTHORIZED",
      });
      expect(await evidenceState(cleanUpload.evidenceId)).toEqual(cleanBefore);

      const deniedCrossTenant = await invokeEvidence(automation.accessToken, {
        command: "inspection",
        evidence_id: "22000000-0000-0000-0000-000000000606",
        decision: "clean",
        reason_code: "SCAN_CLEAN",
        idempotency_key: "cross-inspection-denied-0001",
      });
      expect(deniedCrossTenant.status).toBe(200);
      expect(await responseJson(deniedCrossTenant)).toEqual({
        result: "denied",
        reason_code: "INSPECTION_NOT_AUTHORIZED",
      });

      const cleanIdempotencyKey = "edge-inspection-clean-0001";
      const cleanInspection = await invokeEvidence(automation.accessToken, {
        command: "inspection",
        evidence_id: cleanUpload.evidenceId,
        decision: "clean",
        reason_code: "SCAN_CLEAN",
        idempotency_key: cleanIdempotencyKey,
      });
      expect(cleanInspection.status).toBe(200);
      expect(await responseJson(cleanInspection)).toEqual({
        result: "applied",
        reason_code: "INSPECTION_RECORDED",
        evidence_id: cleanUpload.evidenceId,
        decision: "clean",
      });
      expect(await evidenceState(cleanUpload.evidenceId)).toEqual({
        inspection_status: "clean",
        inspection_reason_code: "SCAN_CLEAN",
        inspection_principal_id: automationPrincipalId,
        inspection_grant_id: automationGrantId,
        lifecycle_status: "active",
      });

      const replay = await invokeEvidence(automation.accessToken, {
        command: "inspection",
        evidence_id: cleanUpload.evidenceId,
        decision: "clean",
        reason_code: "SCAN_CLEAN",
        idempotency_key: cleanIdempotencyKey,
      });
      expect(replay.status).toBe(200);
      expect(await responseJson(replay)).toEqual({
        result: "duplicate",
        reason_code: "DUPLICATE_COMMAND",
      });
      expect(
        await countWhere(
          "billing_automation_executions",
          `idempotency_key = '${cleanIdempotencyKey}'`,
        ),
      ).toBe(1);
      expect(
        await countWhere(
          "billing_audit_events",
          `action = 'evidence.inspection'
           AND subject_id = '${cleanUpload.evidenceId}'
           AND result = 'succeeded'`,
        ),
      ).toBe(1);

      const conflictBefore = await evidenceConflictSnapshot(
        [cleanUpload.evidenceId, rejectedUpload.evidenceId],
        cleanIdempotencyKey,
      );
      const conflictingReplay = await invokeEvidence(automation.accessToken, {
        command: "inspection",
        evidence_id: cleanUpload.evidenceId,
        decision: "rejected",
        reason_code: "SCAN_REJECTED",
        idempotency_key: cleanIdempotencyKey,
      });
      expect(conflictingReplay.status).toBe(200);
      expect(await responseJson(conflictingReplay)).toEqual({
        result: "denied",
        reason_code: "IDEMPOTENCY_KEY_CONFLICT",
      });
      expect(
        await evidenceConflictSnapshot(
          [cleanUpload.evidenceId, rejectedUpload.evidenceId],
          cleanIdempotencyKey,
        ),
      ).toEqual(conflictBefore);

      const rejectedInspection = await invokeEvidence(automation.accessToken, {
        command: "inspection",
        evidence_id: rejectedUpload.evidenceId,
        decision: "rejected",
        reason_code: "SCAN_REJECTED",
        idempotency_key: "edge-inspection-rejected-0001",
      });
      expect(rejectedInspection.status).toBe(200);
      expect(await responseJson(rejectedInspection)).toEqual({
        result: "applied",
        reason_code: "INSPECTION_RECORDED",
        evidence_id: rejectedUpload.evidenceId,
        decision: "rejected",
      });

      const exhaustedReplay = await invokeEvidence(automation.accessToken, {
        command: "inspection",
        evidence_id: cleanUpload.evidenceId,
        decision: "clean",
        reason_code: "SCAN_CLEAN",
        idempotency_key: cleanIdempotencyKey,
      });
      expect(exhaustedReplay.status).toBe(200);
      expect(await responseJson(exhaustedReplay)).toEqual({
        result: "duplicate",
        reason_code: "DUPLICATE_COMMAND",
      });

      const accessBefore = await countWhere(
        "billing_evidence_access_events",
        "id > 0",
      );
      const requestStartedAt = Date.now();
      const download = await invokeEvidence(operator.accessToken, {
        command: "download",
        evidence_id: cleanUpload.evidenceId,
        purpose: "download",
      });
      expect(download.status).toBe(200);
      expect(download.headers.get("cache-control")).toContain("no-store");
      const downloadBody = (await responseJson(download)) as Record<
        string,
        unknown
      >;
      expect(Object.keys(downloadBody).sort()).toEqual([
        "evidence_id",
        "expires_at",
        "result",
        "url",
      ]);
      expect(downloadBody.result).toBe("ready");
      expect(downloadBody.evidence_id).toBe(cleanUpload.evidenceId);
      const downloadUrl = new URL(String(downloadBody.url));
      const responseExpiresAt = new Date(
        String(downloadBody.expires_at),
      ).getTime();
      expect(responseExpiresAt - requestStartedAt).toBeGreaterThanOrEqual(
        55_000,
      );
      expect(responseExpiresAt - requestStartedAt).toBeLessThanOrEqual(61_000);
      const tokenExpiresAt = decodeCapabilityExpiry(downloadUrl);
      expect(tokenExpiresAt - requestStartedAt).toBeGreaterThanOrEqual(55_000);
      expect(tokenExpiresAt - requestStartedAt).toBeLessThanOrEqual(61_000);

      const bytes = await fetch(downloadUrl);
      expect(bytes.status).toBe(200);
      expect(await bytes.text()).toBe(cleanUpload.content);

      const directUrl = new URL(downloadUrl);
      directUrl.pathname = directUrl.pathname.replace(
        "/object/sign/",
        "/object/",
      );
      directUrl.search = "";
      expect((await fetch(directUrl)).ok).toBe(false);
      expect((await fetch(tamperPath(downloadUrl))).ok).toBe(false);
      expect((await fetch(tamperToken(downloadUrl))).ok).toBe(false);

      const deniedDownloads: Array<{
        evidenceId: string;
        principal: Principal;
        reasonCode: string;
      }> = [
        {
          principal: bravoOperator,
          evidenceId: cleanUpload.evidenceId,
          reasonCode: "ACCESS_NOT_AUTHORIZED",
        },
        {
          principal: operator,
          evidenceId: "21000000-0000-0000-0000-000000000606",
          reasonCode: "EVIDENCE_QUARANTINED",
        },
        {
          principal: operator,
          evidenceId: rejectedUpload.evidenceId,
          reasonCode: "EVIDENCE_REJECTED",
        },
        {
          principal: operator,
          evidenceId: "21000000-0000-0000-0000-000000000603",
          reasonCode: "EVIDENCE_EXPIRED",
        },
        {
          principal: operator,
          evidenceId: "21000000-0000-0000-0000-000000000604",
          reasonCode: "EVIDENCE_HELD",
        },
        {
          principal: operator,
          evidenceId: "21000000-0000-0000-0000-000000000605",
          reasonCode: "EVIDENCE_NOT_ACTIVE",
        },
      ];
      for (const testCase of deniedDownloads) {
        const response = await invokeEvidence(testCase.principal.accessToken, {
          command: "download",
          evidence_id: testCase.evidenceId,
          purpose: "download",
        });
        expect(response.status).toBe(200);
        expect(await responseJson(response)).toEqual({
          result: "denied",
          reason_code: testCase.reasonCode,
        });
      }

      expect(await countWhere("billing_evidence_access_events", "id > 0")).toBe(
        accessBefore + 1 + deniedDownloads.length,
      );
    });
  },
);
