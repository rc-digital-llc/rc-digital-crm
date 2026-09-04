import { spawn } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

type ProcessResult = {
  code: number;
  stdout: string;
  stderr: string;
};

type AgreementResult = {
  agreement_id: string;
  result: string;
  self_approved?: boolean;
  state: string;
  terms_fingerprint: string;
  version_id: string;
  version_number: number;
};

const repositoryRoot = path.resolve(__dirname, "../..");
const expectedContainer = "supabase_db_atomic-crm-demo";
const identities = {
  administrator: "21000000-0000-0000-0000-000000000001",
  operator: "21000000-0000-0000-0000-000000000002",
  reviewer: "21000000-0000-0000-0000-000000000003",
  automation: "21000000-0000-0000-0000-000000000006",
  bravoOperator: "22000000-0000-0000-0000-000000000002",
} as const;
const alphaAccountId = "21000000-0000-0000-0000-000000000200";
const signedEvidenceId = "21000000-0000-0000-0000-000000000601";

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

async function resolveDatabaseContainer(run = runProcess) {
  const result = await run("docker", [
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

function assertUuid(value: string) {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value)) {
    throw new Error("agreement test UUID is invalid");
  }
  return value;
}

function assertSqlFunction(value: string) {
  const allowed = new Set([
    "activate_billing_agreement_version",
    "pause_billing_agreement_version",
    "read_billing_agreements",
    "save_billing_agreement_draft",
    "submit_billing_agreement_version",
  ]);
  if (!allowed.has(value)) throw new Error("agreement RPC name is invalid");
  return value;
}

function sqlJson(value: Record<string, unknown>) {
  return JSON.stringify(value).replaceAll("'", "''");
}

async function invokeAgreement(
  container: string,
  userId: string,
  functionName: string,
  payload: Record<string, unknown>,
  holdMs = 0,
) {
  assertUuid(userId);
  assertSqlFunction(functionName);
  if (!Number.isInteger(holdMs) || holdMs < 0 || holdMs > 2_000) {
    throw new Error("agreement test hold is invalid");
  }
  return runProcess(
    "docker",
    [
      "exec",
      container,
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
      `BEGIN;
       SET LOCAL "request.jwt.claim.sub" = '${userId}';
       SET LOCAL "request.jwt.claims" = '{"sub":"${userId}","role":"authenticated"}';
       SET LOCAL ROLE authenticated;
       SELECT pg_catalog.pg_sleep(${holdMs / 1_000});
       SELECT public.${functionName}('${sqlJson(payload)}'::jsonb)::text;
       COMMIT;`,
    ],
    30_000,
  );
}

function parseJson<T>(result: ProcessResult) {
  expect(result.code, result.stderr).toBe(0);
  const line = result.stdout
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean)
    .at(-1);
  expect(line).toBeTruthy();
  return JSON.parse(line!) as T;
}

function parseAgreement(result: ProcessResult) {
  return parseJson<AgreementResult>(result);
}

async function serviceJson<T>(container: string, sql: string) {
  const result = await runProcess("docker", [
    "exec",
    container,
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
  expect(result.code, result.stderr).toBe(0);
  return JSON.parse(result.stdout.trim()) as T;
}

function agreementPayload(
  commandKey: string,
  agreementFamily: string,
  effectiveStart: string,
  effectiveEnd: string,
  agreementId?: string,
) {
  return {
    account_id: alphaAccountId,
    agreement_family: agreementFamily,
    effective_start: effectiveStart,
    effective_end: effectiveEnd,
    formula_kind: "hybrid",
    fixed_amount: null,
    minimum_amount: { amount_minor: "125000", currency: "USD" },
    percentage: {
      kind: "ordinary_percentage",
      numerator: "7",
      denominator: "100",
      submitted_percentage: "7%",
      rate_policy_version: "ordinary-percentage-v1",
    },
    timezone: "America/Los_Angeles",
    timing_basis: "cash",
    included_amounts: ["service_revenue"],
    excluded_amounts: ["sales_tax"],
    tax_treatment: "exclude",
    refund_chargeback_policy: "deduct_in_period",
    cutoff_day: 5,
    dispute_policy: "hold_close",
    missing_report_policy: "minimum_only",
    true_up_policy: "next_period_adjustment",
    evidence_priority: ["api", "statement", "portal"],
    signed_evidence_id: signedEvidenceId,
    command_key: commandKey,
    ...(agreementId ? { agreement_id: agreementId } : {}),
  };
}

function transitionPayload(
  versionId: string,
  commandKey: string,
  reason: string,
) {
  return {
    version_id: assertUuid(versionId),
    command_key: commandKey,
    reason,
  };
}

function expectSupportSafe(value: unknown) {
  const serialized = JSON.stringify(value);
  expect(serialized).not.toMatch(
    /object_path|signed[_-]?url|contract contents|billing-evidence\//i,
  );
}

describe("billing agreement contract harness", () => {
  it("uses an exact repository container lookup without a shell", async () => {
    const calls: string[][] = [];
    const fakeRun = async (command: string, args: string[]) => {
      calls.push([command, ...args]);
      return { code: 0, stdout: `${expectedContainer}\n`, stderr: "" };
    };
    await expect(resolveDatabaseContainer(fakeRun)).resolves.toBe(
      expectedContainer,
    );
    expect(calls).toEqual([
      [
        "docker",
        "ps",
        "--filter",
        `name=^/${expectedContainer}$`,
        "--format",
        "{{.Names}}",
      ],
    ]);
  });

  it("rejects unsafe RPC and identity inputs before process execution", () => {
    expect(() => assertSqlFunction("arbitrary_sql")).toThrow(/RPC name/);
    expect(() => assertUuid("not-a-uuid")).toThrow(/UUID/);
  });
});

describe.runIf(Boolean(process.env.SUPABASE_DB_URL))(
  "live authenticated billing agreement lifecycle",
  () => {
    it("serializes overlapping activation, preserves replay, and records explicit approval", async () => {
      const container = await resolveDatabaseContainer();
      const firstDraft = parseAgreement(
        await invokeAgreement(
          container,
          identities.operator,
          "save_billing_agreement_draft",
          agreementPayload(
            "agreement-race-draft-a-0001",
            "contract_race",
            "2040-01-01",
            "2041-01-01",
          ),
        ),
      );
      const secondDraft = parseAgreement(
        await invokeAgreement(
          container,
          identities.operator,
          "save_billing_agreement_draft",
          agreementPayload(
            "agreement-race-draft-b-0001",
            "contract_race",
            "2040-06-01",
            "2041-06-01",
            firstDraft.agreement_id,
          ),
        ),
      );

      for (const [draft, suffix] of [
        [firstDraft, "a"],
        [secondDraft, "b"],
      ] as const) {
        const submitted = parseAgreement(
          await invokeAgreement(
            container,
            identities.operator,
            "submit_billing_agreement_version",
            transitionPayload(
              draft.version_id,
              `agreement-race-submit-${suffix}-0001`,
              `Submit race version ${suffix}`,
            ),
          ),
        );
        expect(submitted).toMatchObject({
          result: "submitted",
          state: "submitted",
        });
      }

      const activationPayloads = [
        transitionPayload(
          firstDraft.version_id,
          "agreement-race-activate-a-0001",
          "Approve race version a",
        ),
        transitionPayload(
          secondDraft.version_id,
          "agreement-race-activate-b-0001",
          "Approve race version b",
        ),
      ];
      const activationResults = await Promise.all(
        activationPayloads.map((payload) =>
          invokeAgreement(
            container,
            identities.reviewer,
            "activate_billing_agreement_version",
            payload,
            250,
          ),
        ),
      );
      const winners = activationResults.filter((result) => result.code === 0);
      const losers = activationResults.filter((result) => result.code !== 0);
      expect(winners).toHaveLength(1);
      expect(losers).toHaveLength(1);
      expect(losers[0].stderr).toContain("AGREEMENT_EFFECTIVE_RANGE_CONFLICT");

      const winnerIndex = activationResults.findIndex(
        (result) => result.code === 0,
      );
      const winner = parseAgreement(winners[0]);
      expect(winner).toMatchObject({
        result: "activated",
        state: "active",
        self_approved: false,
      });
      expectSupportSafe(winner);
      expectSupportSafe(losers[0].stderr);

      const state = await serviceJson<{
        activated_audits: number;
        activated_events: number;
        active_versions: number;
      }>(
        container,
        `SELECT pg_catalog.jsonb_build_object(
          'active_versions', count(*) FILTER (WHERE version.state = 'active'),
          'activated_events', (
            SELECT count(*) FROM public.billing_agreement_events AS event
            WHERE event.agreement_id = '${firstDraft.agreement_id}'
              AND event.event_type = 'activated'
          ),
          'activated_audits', (
            SELECT count(*) FROM public.billing_audit_events AS audit
            WHERE audit.action = 'agreement.activated'
              AND audit.subject_id IN ('${firstDraft.version_id}', '${secondDraft.version_id}')
          )
        )::text
        FROM public.billing_agreement_versions AS version
        WHERE version.agreement_id = '${firstDraft.agreement_id}'`,
      );
      expect(state).toEqual({
        active_versions: 1,
        activated_events: 1,
        activated_audits: 1,
      });

      const replay = parseAgreement(
        await invokeAgreement(
          container,
          identities.reviewer,
          "activate_billing_agreement_version",
          activationPayloads[winnerIndex],
        ),
      );
      expect(replay).toEqual(winner);

      const conflict = await invokeAgreement(
        container,
        identities.reviewer,
        "activate_billing_agreement_version",
        { ...activationPayloads[winnerIndex], reason: "Changed replay reason" },
      );
      expect(conflict.code).not.toBe(0);
      expect(conflict.stderr).toContain("AGREEMENT_IDEMPOTENCY_CONFLICT");

      for (const identity of [
        identities.operator,
        identities.bravoOperator,
        identities.automation,
      ]) {
        const denied = await invokeAgreement(
          container,
          identity,
          "activate_billing_agreement_version",
          transitionPayload(
            firstDraft.version_id,
            `agreement-denied-${identity.slice(-4)}-0001`,
            "Unauthorized approval attempt",
          ),
        );
        expect(denied.code).not.toBe(0);
        expect(denied.stderr).toContain("AGREEMENT_NOT_AUTHORIZED");
        expectSupportSafe(denied.stderr);
      }

      const unchangedState = await serviceJson<typeof state>(
        container,
        `SELECT pg_catalog.jsonb_build_object(
          'active_versions', count(*) FILTER (WHERE version.state = 'active'),
          'activated_events', (
            SELECT count(*) FROM public.billing_agreement_events AS event
            WHERE event.agreement_id = '${firstDraft.agreement_id}'
              AND event.event_type = 'activated'
          ),
          'activated_audits', (
            SELECT count(*) FROM public.billing_audit_events AS audit
            WHERE audit.action = 'agreement.activated'
              AND audit.subject_id IN ('${firstDraft.version_id}', '${secondDraft.version_id}')
          )
        )::text
        FROM public.billing_agreement_versions AS version
        WHERE version.agreement_id = '${firstDraft.agreement_id}'`,
      );
      expect(unchangedState).toEqual(state);

      const readResponse = parseJson<{
        data: Array<Record<string, unknown>>;
      }>(
        await invokeAgreement(
          container,
          identities.reviewer,
          "read_billing_agreements",
          { account_id: alphaAccountId },
        ),
      );
      const activeRead = readResponse.data.find(
        (version) => version.version_id === winner.version_id,
      );
      expect(activeRead).toMatchObject({
        currency: "USD",
        minimum_amount_minor: "125000",
        rate_denominator: "100",
        rate_numerator: "7",
      });
      expectSupportSafe(readResponse);

      const selfDraft = parseAgreement(
        await invokeAgreement(
          container,
          identities.administrator,
          "save_billing_agreement_draft",
          agreementPayload(
            "agreement-http-self-draft-0001",
            "http_self_approval",
            "2042-01-01",
            "2043-01-01",
          ),
        ),
      );
      parseAgreement(
        await invokeAgreement(
          container,
          identities.administrator,
          "submit_billing_agreement_version",
          transitionPayload(
            selfDraft.version_id,
            "agreement-http-self-submit-0001",
            "Single-owner submit",
          ),
        ),
      );
      const selfApproved = parseAgreement(
        await invokeAgreement(
          container,
          identities.administrator,
          "activate_billing_agreement_version",
          transitionPayload(
            selfDraft.version_id,
            "agreement-http-self-activate-0001",
            "Accepted single-owner approval",
          ),
        ),
      );
      expect(selfApproved.self_approved).toBe(true);
      expectSupportSafe(selfApproved);
    }, 60_000);
  },
);
