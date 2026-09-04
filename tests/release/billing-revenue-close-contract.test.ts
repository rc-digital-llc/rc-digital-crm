import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { describe, expect, it } from "vitest";

type ProcessResult = { code: number; stdout: string; stderr: string };
type RevenueResult = Record<string, boolean | null | number | string>;

const repositoryRoot = path.resolve(__dirname, "../..");
const expectedContainer = "supabase_db_atomic-crm-demo";
const identities = {
  operator: "21000000-0000-0000-0000-000000000002",
  reviewer: "21000000-0000-0000-0000-000000000003",
  bravoOperator: "22000000-0000-0000-0000-000000000002",
} as const;
const alphaAccountId = "21000000-0000-0000-0000-000000000200";
const bravoAccountId = "22000000-0000-0000-0000-000000000200";

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
  timeoutMs = 30_000,
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
    child.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("error", (error) =>
      finish({ code: 127, stdout: "", stderr: redact(error.message) }),
    );
    child.on("close", (code) =>
      finish({ code: code ?? 1, stdout, stderr: redact(stderr) }),
    );
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
  if (result.code !== 0) throw new Error(result.stderr);
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
    throw new Error("revenue test UUID is invalid");
  }
  return value;
}

function assertRpc(value: string) {
  const allowed = new Set([
    "close_billing_revenue_period",
    "ensure_billing_revenue_period",
    "review_billing_revenue_revision",
    "submit_billing_revenue_revision",
  ]);
  if (!allowed.has(value)) throw new Error("revenue RPC name is invalid");
  return value;
}

function sqlJson(value: Record<string, unknown>) {
  return JSON.stringify(value).replaceAll("'", "''");
}

async function invokeRevenue(
  container: string,
  userId: string,
  functionName: string,
  payload: Record<string, unknown>,
) {
  assertUuid(userId);
  assertRpc(functionName);
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
       SELECT public.${functionName}('${sqlJson(payload)}'::jsonb)::text;
       COMMIT;`,
    ],
    45_000,
  );
}

function parseResult(result: ProcessResult) {
  expect(result.code, result.stderr).toBe(0);
  const line = result.stdout
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean)
    .at(-1);
  expect(line).toBeTruthy();
  return JSON.parse(line!) as RevenueResult;
}

async function serviceSql(container: string, sql: string) {
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
  return result.stdout.trim();
}

function expectSupportSafe(value: unknown) {
  expect(JSON.stringify(value)).not.toMatch(
    /object_path|signed[_-]?url|billing-evidence\/|customer_name/i,
  );
}

function submissionPayload(
  periodId: string,
  evidenceId: string,
  commandKey: string,
) {
  return {
    account_id: alphaAccountId,
    period_id: assertUuid(periodId),
    gross_amount: { amount_minor: "1000000", currency: "USD" },
    excluded_amount: { amount_minor: "100000", currency: "USD" },
    commissionable_amount: { amount_minor: "900000", currency: "USD" },
    provenance_kind: "statement",
    provenance_source_id: `source-${commandKey}`,
    attestation: { accurate: true, text: "Source totals reconciled" },
    evidence_ids: [assertUuid(evidenceId)],
    command_key: commandKey,
  };
}

describe("billing revenue close contract harness", () => {
  it("uses an exact repository container lookup", async () => {
    const calls: string[][] = [];
    const fakeRun = async (command: string, args: string[]) => {
      calls.push([command, ...args]);
      return { code: 0, stdout: `${expectedContainer}\n`, stderr: "" };
    };
    await expect(resolveDatabaseContainer(fakeRun)).resolves.toBe(
      expectedContainer,
    );
    expect(calls[0]).toEqual([
      "docker",
      "ps",
      "--filter",
      `name=^/${expectedContainer}$`,
      "--format",
      "{{.Names}}",
    ]);
  });

  it("rejects unsafe RPC and identity input", () => {
    expect(() => assertRpc("arbitrary_sql")).toThrow(/RPC name/);
    expect(() => assertUuid("not-a-uuid")).toThrow(/UUID/);
  });
});

describe.runIf(Boolean(process.env.SUPABASE_DB_URL))(
  "live authenticated revenue close lifecycle",
  () => {
    it("serializes periods and closes accepted or minimum-only inputs exactly once", async () => {
      const container = await resolveDatabaseContainer();
      const runId = randomUUID();
      const suffix = runId.replaceAll("-", "").slice(0, 12);
      const ids = {
        evidence: randomUUID(),
        normalAgreement: randomUUID(),
        normalVersion: randomUUID(),
        minimumAgreement: randomUUID(),
        minimumVersion: randomUUID(),
      };
      Object.values(ids).forEach(assertUuid);

      await serviceSql(
        container,
        `INSERT INTO public.billing_evidence_objects (
           id, organization_id, account_id, sha256, size_bytes, mime_type,
           inspection_status, inspection_principal_id, inspection_grant_id,
           inspection_decided_at, inspection_reason_code, retention_expires_at,
           lifecycle_status, kind, original_filename, uploader_label
         ) VALUES (
           '${ids.evidence}', '21000000-0000-0000-0000-000000000100',
           '${alphaAccountId}', repeat('c', 64), 512, 'application/pdf', 'clean',
           '21000000-0000-0000-0000-000000000400',
           '21000000-0000-0000-0000-000000000502', pg_catalog.now(),
           'SCAN_CLEAN', '2035-01-01T00:00:00Z', 'active',
           'revenue_statement', 'revenue-${suffix}.pdf', 'Contract test'
         );
         INSERT INTO public.billing_agreements (
           id, organization_id, account_id, agreement_family, created_by
         ) VALUES
           ('${ids.normalAgreement}', '21000000-0000-0000-0000-000000000100',
            '${alphaAccountId}', 'close_normal_${suffix}', '${identities.operator}'),
           ('${ids.minimumAgreement}', '21000000-0000-0000-0000-000000000100',
            '${alphaAccountId}', 'close_minimum_${suffix}', '${identities.operator}');
         INSERT INTO public.billing_agreement_versions (
           id, organization_id, account_id, agreement_id, version_number, state,
           effective_start, effective_end, formula_kind, minimum_amount_minor,
           rate_numerator, rate_denominator, submitted_percentage,
           signed_evidence_id, signed_evidence_sha256, terms_fingerprint,
           authored_by, authored_by_role, submitted_by, submitted_by_role,
           submitted_at, approved_by, approved_by_role, approved_at
         ) VALUES
           ('${ids.normalVersion}', '21000000-0000-0000-0000-000000000100',
            '${alphaAccountId}', '${ids.normalAgreement}', 1, 'active',
            '2026-01-01', '2027-01-01', 'hybrid', 125000, 7, 100, '7%',
            '21000000-0000-0000-0000-000000000601', repeat('1', 64),
            encode(extensions.digest('${ids.normalVersion}', 'sha256'), 'hex'),
            '${identities.operator}', 'operator', '${identities.operator}', 'operator', now(),
            '${identities.reviewer}', 'reviewer', now()),
           ('${ids.minimumVersion}', '21000000-0000-0000-0000-000000000100',
            '${alphaAccountId}', '${ids.minimumAgreement}', 1, 'active',
            '2026-01-01', '2027-01-01', 'minimum_support', 125000, NULL, NULL, NULL,
            '21000000-0000-0000-0000-000000000601', repeat('1', 64),
            encode(extensions.digest('${ids.minimumVersion}', 'sha256'), 'hex'),
            '${identities.operator}', 'operator', '${identities.operator}', 'operator', now(),
            '${identities.reviewer}', 'reviewer', now());
         INSERT INTO public.billing_agreement_revenue_rules (
           agreement_version_id, organization_id, account_id, timezone,
           timing_basis, included_amounts, excluded_amounts, tax_treatment,
           refund_chargeback_policy, cutoff_day, dispute_policy,
           missing_report_policy, true_up_policy, evidence_priority
         ) VALUES
           ('${ids.normalVersion}', '21000000-0000-0000-0000-000000000100',
            '${alphaAccountId}', 'America/Los_Angeles', 'cash', '["service_revenue"]',
            '["sales_tax"]', 'exclude', 'deduct_in_period', 5, 'hold_close',
            'minimum_only', 'next_period_adjustment', '["statement"]'),
           ('${ids.minimumVersion}', '21000000-0000-0000-0000-000000000100',
            '${alphaAccountId}', 'America/Los_Angeles', 'cash', '["service_revenue"]',
            '["sales_tax"]', 'exclude', 'deduct_in_period', 5, 'hold_close',
            'minimum_only', 'next_period_adjustment', '["statement"]');`,
      );

      const periodPayload = {
        account_id: alphaAccountId,
        agreement_version_id: ids.normalVersion,
        period_month: "2026-10",
        command_key: `period-race-${suffix}`,
      };
      const periodAttempts = await Promise.all(
        Array.from({ length: 12 }, () =>
          invokeRevenue(
            container,
            identities.operator,
            "ensure_billing_revenue_period",
            periodPayload,
          ),
        ),
      );
      const periodResults = periodAttempts.map(parseResult);
      expect(
        new Set(periodResults.map((result) => result.period_id)).size,
      ).toBe(1);
      expect(periodResults.every((result) => result.result === "created")).toBe(
        true,
      );
      const periodId = String(periodResults[0].period_id);

      const submission = parseResult(
        await invokeRevenue(
          container,
          identities.operator,
          "submit_billing_revenue_revision",
          submissionPayload(periodId, ids.evidence, `submit-${suffix}`),
        ),
      );
      const review = parseResult(
        await invokeRevenue(
          container,
          identities.reviewer,
          "review_billing_revenue_revision",
          {
            account_id: alphaAccountId,
            period_id: periodId,
            submission_id: submission.submission_id,
            outcome: "accept",
            reason_code: "REVENUE_ACCEPTED",
            reason: "Exact source totals accepted",
            exception: null,
            command_key: `review-${suffix}`,
          },
        ),
      );
      expect(review.outcome).toBe("accept");

      const closePayload = {
        account_id: alphaAccountId,
        period_id: periodId,
        close_mode: "accepted_evidence",
        review_event_id: String(review.review_event_id),
        reason: "Freeze the accepted monthly revenue input",
        command_key: `close-race-${suffix}`,
      };
      const operatorDenied = await invokeRevenue(
        container,
        identities.operator,
        "close_billing_revenue_period",
        closePayload,
      );
      expect(operatorDenied.code).not.toBe(0);
      expect(operatorDenied.stderr).toContain("REVENUE_NOT_AUTHORIZED");

      const closeAttempts = await Promise.all(
        Array.from({ length: 12 }, () =>
          invokeRevenue(
            container,
            identities.reviewer,
            "close_billing_revenue_period",
            closePayload,
          ),
        ),
      );
      const closeResults = closeAttempts.map(parseResult);
      expect(
        new Set(closeResults.map((result) => result.close_snapshot_id)).size,
      ).toBe(1);
      expect(closeResults.every((result) => result.result === "closed")).toBe(
        true,
      );
      expectSupportSafe(closeResults);

      const counts = JSON.parse(
        await serviceSql(
          container,
          `SELECT jsonb_build_object(
             'snapshots', (SELECT count(*) FROM public.billing_revenue_close_snapshots
               WHERE period_id = '${periodId}'),
             'close_events', (SELECT count(*) FROM public.billing_revenue_command_events
               WHERE period_id = '${periodId}' AND action = 'period.close')
           )::text`,
        ),
      );
      expect(counts).toEqual({ snapshots: 1, close_events: 1 });

      expect(
        parseResult(
          await invokeRevenue(
            container,
            identities.reviewer,
            "close_billing_revenue_period",
            closePayload,
          ),
        ),
      ).toEqual(closeResults[0]);
      const changedReplay = await invokeRevenue(
        container,
        identities.reviewer,
        "close_billing_revenue_period",
        { ...closePayload, reason: "Changed close reason" },
      );
      expect(changedReplay.code).not.toBe(0);
      expect(changedReplay.stderr).toContain("REVENUE_IDEMPOTENCY_CONFLICT");

      const wrongTenant = await invokeRevenue(
        container,
        identities.bravoOperator,
        "close_billing_revenue_period",
        {
          ...closePayload,
          account_id: bravoAccountId,
          command_key: `cross-${suffix}`,
        },
      );
      expect(wrongTenant.code).not.toBe(0);
      expect(wrongTenant.stderr).toContain("REVENUE_NOT_AUTHORIZED");
      expectSupportSafe(wrongTenant.stderr);

      const stalePeriod = parseResult(
        await invokeRevenue(
          container,
          identities.operator,
          "ensure_billing_revenue_period",
          {
            account_id: alphaAccountId,
            agreement_version_id: ids.normalVersion,
            period_month: "2026-09",
            command_key: `stale-period-${suffix}`,
          },
        ),
      );
      const staleSubmission = parseResult(
        await invokeRevenue(
          container,
          identities.operator,
          "submit_billing_revenue_revision",
          submissionPayload(
            String(stalePeriod.period_id),
            ids.evidence,
            `stale-submit-${suffix}`,
          ),
        ),
      );
      const staleReview = parseResult(
        await invokeRevenue(
          container,
          identities.reviewer,
          "review_billing_revenue_revision",
          {
            account_id: alphaAccountId,
            period_id: stalePeriod.period_id,
            submission_id: staleSubmission.submission_id,
            outcome: "accept",
            reason_code: "REVENUE_ACCEPTED",
            reason: "Evidence was clean when reviewed",
            exception: null,
            command_key: `stale-review-${suffix}`,
          },
        ),
      );
      await serviceSql(
        container,
        `UPDATE public.billing_evidence_objects
         SET hold_started_at = pg_catalog.now(), hold_reason = 'post-review hold'
         WHERE id = '${ids.evidence}'`,
      );
      const staleClose = await invokeRevenue(
        container,
        identities.reviewer,
        "close_billing_revenue_period",
        {
          account_id: alphaAccountId,
          period_id: stalePeriod.period_id,
          close_mode: "accepted_evidence",
          review_event_id: String(staleReview.review_event_id),
          reason: "Attempt close after evidence state changed",
          command_key: `stale-close-${suffix}`,
        },
      );
      expect(staleClose.code).not.toBe(0);
      expect(staleClose.stderr).toContain("REVENUE_CLOSE_EVIDENCE_STALE");
      expect(
        Number(
          await serviceSql(
            container,
            `SELECT count(*) FROM public.billing_revenue_close_snapshots
             WHERE period_id = '${stalePeriod.period_id}'`,
          ),
        ),
      ).toBe(0);

      const minimumPeriod = parseResult(
        await invokeRevenue(
          container,
          identities.operator,
          "ensure_billing_revenue_period",
          {
            account_id: alphaAccountId,
            agreement_version_id: ids.minimumVersion,
            period_month: "2026-01",
            command_key: `minimum-period-${suffix}`,
          },
        ),
      );
      const minimumReview = parseResult(
        await invokeRevenue(
          container,
          identities.reviewer,
          "review_billing_revenue_revision",
          {
            account_id: alphaAccountId,
            period_id: minimumPeriod.period_id,
            submission_id: null,
            outcome: "hold",
            reason_code: "MISSING_EVIDENCE",
            reason: "Evidence is missing; approve contract minimum only",
            exception: {
              kind: "MISSING_EVIDENCE",
              owner_id: identities.operator,
              next_action: "Obtain the missing January source statement",
              due_at: "2030-01-01T00:00:00Z",
              amount_at_risk: null,
            },
            command_key: `minimum-review-${suffix}`,
          },
        ),
      );
      const minimumClose = parseResult(
        await invokeRevenue(
          container,
          identities.reviewer,
          "close_billing_revenue_period",
          {
            account_id: alphaAccountId,
            period_id: minimumPeriod.period_id,
            close_mode: "minimum_only",
            review_event_id: String(minimumReview.review_event_id),
            reason: "Deadline passed; approve the contract minimum only",
            command_key: `minimum-close-${suffix}`,
          },
        ),
      );
      expect(minimumClose).toMatchObject({
        result: "closed",
        close_mode: "minimum_only",
        exception_status: "open",
      });
      expectSupportSafe(minimumClose);

      const futureMinimumPeriod = parseResult(
        await invokeRevenue(
          container,
          identities.operator,
          "ensure_billing_revenue_period",
          {
            account_id: alphaAccountId,
            agreement_version_id: ids.minimumVersion,
            period_month: "2026-12",
            command_key: `future-minimum-period-${suffix}`,
          },
        ),
      );
      const futureMinimumReview = parseResult(
        await invokeRevenue(
          container,
          identities.reviewer,
          "review_billing_revenue_revision",
          {
            account_id: alphaAccountId,
            period_id: futureMinimumPeriod.period_id,
            submission_id: null,
            outcome: "hold",
            reason_code: "MISSING_EVIDENCE",
            reason: "Future evidence is not yet due",
            exception: {
              kind: "MISSING_EVIDENCE",
              owner_id: identities.operator,
              next_action: "Wait for the December source statement",
              due_at: "2030-01-01T00:00:00Z",
              amount_at_risk: null,
            },
            command_key: `future-minimum-review-${suffix}`,
          },
        ),
      );
      const earlyMinimumClose = await invokeRevenue(
        container,
        identities.reviewer,
        "close_billing_revenue_period",
        {
          account_id: alphaAccountId,
          period_id: futureMinimumPeriod.period_id,
          close_mode: "minimum_only",
          review_event_id: String(futureMinimumReview.review_event_id),
          reason: "Attempt minimum close before the reporting deadline",
          command_key: `future-minimum-close-${suffix}`,
        },
      );
      expect(earlyMinimumClose.code).not.toBe(0);
      expect(earlyMinimumClose.stderr).toContain(
        "REVENUE_MINIMUM_DEADLINE_PENDING",
      );
    }, 120_000);
  },
);
