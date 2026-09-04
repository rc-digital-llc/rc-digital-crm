import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  calculateBillingFormula,
  type BillingFormulaInput,
} from "../../src/components/atomic-crm/financial/billingCalculationFixtures";

type ProcessResult = { code: number; stdout: string; stderr: string };
type RpcResult = Record<string, unknown>;

const repositoryRoot = path.resolve(__dirname, "../..");
const expectedContainer = "supabase_db_atomic-crm-demo";
const alphaOrganizationId = "21000000-0000-0000-0000-000000000100";
const alphaAccountId = "21000000-0000-0000-0000-000000000200";
const bravoAccountId = "22000000-0000-0000-0000-000000000200";
const contractEvidenceId = "21000000-0000-0000-0000-000000000601";
const identities = {
  operator: "21000000-0000-0000-0000-000000000002",
  reviewer: "21000000-0000-0000-0000-000000000003",
  bravoOperator: "22000000-0000-0000-0000-000000000002",
} as const;

const rpcNames = new Set([
  "approve_billing_calculation",
  "close_billing_revenue_period",
  "create_billing_adjustment_calculation",
  "create_billing_calculation",
  "ensure_billing_revenue_period",
  "preview_billing_calculation",
  "read_billing_calculation_lineage",
  "review_billing_revenue_revision",
  "submit_billing_revenue_revision",
]);

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
  timeoutMs = 60_000,
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
      finish({ code: 124, stdout: "", stderr: "process exceeded timeout" });
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
    throw new Error("close test UUID is invalid");
  }
  return value;
}

function assertRpc(value: string) {
  if (!rpcNames.has(value)) throw new Error("close test RPC name is invalid");
  return value;
}

function sqlJson(value: Record<string, unknown>) {
  return JSON.stringify(value).replaceAll("'", "''");
}

async function invokeRpc(
  container: string,
  userId: string,
  functionName: string,
  request: Record<string, unknown>,
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
       SELECT public.${functionName}('${sqlJson(request)}'::jsonb)::text;
       COMMIT;`,
    ],
    90_000,
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
  return JSON.parse(line!) as RpcResult;
}

function expectFailure(result: ProcessResult, code: string) {
  expect(result.code).not.toBe(0);
  expect(result.stderr).toContain(code);
  expect(result.stderr).not.toMatch(
    /object_path|customer_name|auth\.users|request\.jwt|eyJ[A-Za-z0-9_-]+\./i,
  );
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
    /object_path|storage_path|raw_content|original_filename|customer_name|signed[_-]?url/i,
  );
}

const money = (amountMinor: string) => ({
  amount_minor: amountMinor,
  currency: "USD",
});
const rate = (numerator: string, denominator: string, percent: string) => ({
  kind: "ordinary_percentage",
  numerator,
  denominator,
  submitted_percentage: percent,
  rate_policy_version: "ordinary-percentage-v1",
});

type FormulaCase = Readonly<{
  name: "fixed" | "percentage" | "minimum_support" | "hybrid";
  agreementId: string;
  versionId: string;
  fixed: string | null;
  minimum: string | null;
  numerator: string | null;
  denominator: string | null;
  percent: string | null;
  expected: string;
}>;

function agreementFixtureSql(
  suffix: string,
  evidenceId: string,
  cases: FormulaCase[],
) {
  const agreements = cases
    .map(
      (entry) =>
        `('${entry.agreementId}', '${alphaOrganizationId}', '${alphaAccountId}',
          'close_${entry.name}_${suffix}', '${identities.operator}')`,
    )
    .join(",\n");
  const versions = cases
    .map(
      (entry) =>
        `('${entry.versionId}', '${alphaOrganizationId}', '${alphaAccountId}',
          '${entry.agreementId}', 1, 'active', '2026-01-01', '2027-01-01',
          '${entry.name}', ${entry.fixed ?? "NULL"}, ${entry.minimum ?? "NULL"},
          ${entry.numerator ?? "NULL"}, ${entry.denominator ?? "NULL"},
          ${entry.percent ? `'${entry.percent}'` : "NULL"}, '${contractEvidenceId}',
          repeat('1', 64), encode(extensions.digest('${entry.versionId}', 'sha256'), 'hex'),
          '${identities.operator}', 'operator', '${identities.operator}', 'operator',
          pg_catalog.now(), '${identities.reviewer}', 'reviewer', pg_catalog.now())`,
    )
    .join(",\n");
  const rules = cases
    .map(
      (entry) =>
        `('${entry.versionId}', '${alphaOrganizationId}', '${alphaAccountId}',
          'America/Los_Angeles', 'cash', '["service_revenue"]', '["sales_tax"]',
          'exclude', 'deduct_in_period', 5, 'hold_close', 'minimum_only',
          'next_period_adjustment', '["statement"]')`,
    )
    .join(",\n");
  const events = cases
    .map(
      (entry, index) =>
        `('${alphaOrganizationId}', '${alphaAccountId}', '${entry.agreementId}',
          '${entry.versionId}', 'activated', '${identities.reviewer}', 'reviewer',
          'Activated exact ${entry.name} fixture', 'close-activate-${suffix}-${index}',
          encode(extensions.digest('${entry.versionId}', 'sha256'), 'hex'),
          repeat('1', 64), jsonb_build_object(
            'result', 'activated', 'agreement_version_id', '${entry.versionId}'))`,
    )
    .join(",\n");
  return `
    INSERT INTO public.billing_evidence_objects (
      id, organization_id, account_id, sha256, size_bytes, mime_type,
      inspection_status, inspection_principal_id, inspection_grant_id,
      inspection_decided_at, inspection_reason_code, retention_expires_at,
      lifecycle_status, kind, original_filename, uploader_label
    ) VALUES (
      '${evidenceId}', '${alphaOrganizationId}', '${alphaAccountId}',
      repeat('e', 64), 512, 'application/pdf', 'clean',
      '21000000-0000-0000-0000-000000000400',
      '21000000-0000-0000-0000-000000000502', pg_catalog.now(),
      'SCAN_CLEAN', '2035-01-01T00:00:00Z', 'active',
      'revenue_statement', 'close-${suffix}.pdf', 'Close test fixture'
    );
    INSERT INTO public.billing_agreements (
      id, organization_id, account_id, agreement_family, created_by
    ) VALUES ${agreements};
    INSERT INTO public.billing_agreement_versions (
      id, organization_id, account_id, agreement_id, version_number, state,
      effective_start, effective_end, formula_kind, fixed_amount_minor,
      minimum_amount_minor, rate_numerator, rate_denominator,
      submitted_percentage, signed_evidence_id, signed_evidence_sha256,
      terms_fingerprint, authored_by, authored_by_role, submitted_by,
      submitted_by_role, submitted_at, approved_by, approved_by_role, approved_at
    ) VALUES ${versions};
    INSERT INTO public.billing_agreement_revenue_rules (
      agreement_version_id, organization_id, account_id, timezone, timing_basis,
      included_amounts, excluded_amounts, tax_treatment,
      refund_chargeback_policy, cutoff_day, dispute_policy,
      missing_report_policy, true_up_policy, evidence_priority
    ) VALUES ${rules};
    INSERT INTO public.billing_agreement_events (
      organization_id, account_id, agreement_id, agreement_version_id,
      event_type, actor_id, actor_role, reason, command_key,
      request_fingerprint, evidence_sha256, response_snapshot
    ) VALUES ${events};`;
}

function formulaInput(entry: FormulaCase): BillingFormulaInput {
  return {
    formula_kind: entry.name,
    commissionable_amount: money("900000"),
    fixed_amount: entry.fixed === null ? null : money(entry.fixed),
    minimum_amount: entry.minimum === null ? null : money(entry.minimum),
    rate:
      entry.numerator === null
        ? null
        : rate(entry.numerator, entry.denominator!, entry.percent!),
    currency_policy_version: "usd-v1",
    rounding_policy_version: "half-away-from-zero-v1",
    formula_version: "billing-agreement-formula-v1",
  };
}

describe("billing calculation close harness", () => {
  it("uses exact container and RPC allowlists", async () => {
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
    expect(() => assertRpc("arbitrary_sql")).toThrow(/RPC name/);
    expect(() => assertUuid("not-a-uuid")).toThrow(/UUID/);
  });
});

describe.runIf(Boolean(process.env.SUPABASE_DB_URL))(
  "authenticated complete calculation close",
  () => {
    it("replays four formulas and appends one concurrent late-evidence true-up", async () => {
      const container = await resolveDatabaseContainer();
      const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
      const evidenceId = randomUUID();
      const cases: FormulaCase[] = [
        {
          name: "fixed",
          agreementId: randomUUID(),
          versionId: randomUUID(),
          fixed: "50000",
          minimum: null,
          numerator: null,
          denominator: null,
          percent: null,
          expected: "50000",
        },
        {
          name: "percentage",
          agreementId: randomUUID(),
          versionId: randomUUID(),
          fixed: null,
          minimum: null,
          numerator: "1",
          denominator: "10",
          percent: "10%",
          expected: "90000",
        },
        {
          name: "minimum_support",
          agreementId: randomUUID(),
          versionId: randomUUID(),
          fixed: null,
          minimum: "125000",
          numerator: null,
          denominator: null,
          percent: null,
          expected: "125000",
        },
        {
          name: "hybrid",
          agreementId: randomUUID(),
          versionId: randomUUID(),
          fixed: null,
          minimum: "125000",
          numerator: "1",
          denominator: "10",
          percent: "10%",
          expected: "125000",
        },
      ];
      [
        evidenceId,
        ...cases.flatMap((entry) => [entry.agreementId, entry.versionId]),
      ].forEach(assertUuid);
      await serviceSql(
        container,
        agreementFixtureSql(suffix, evidenceId, cases),
      );

      const calculations: Record<string, RpcResult> = {};
      for (const [index, entry] of cases.entries()) {
        const period = parseResult(
          await invokeRpc(
            container,
            identities.operator,
            "ensure_billing_revenue_period",
            {
              account_id: alphaAccountId,
              agreement_version_id: entry.versionId,
              period_month: "2026-10",
              command_key: `full-period-${suffix}-${index}`,
            },
          ),
        );
        const submission = parseResult(
          await invokeRpc(
            container,
            identities.operator,
            "submit_billing_revenue_revision",
            {
              account_id: alphaAccountId,
              period_id: period.period_id,
              gross_amount: money("1000000"),
              excluded_amount: money("100000"),
              commissionable_amount: money("900000"),
              provenance_kind: "statement",
              provenance_source_id: `full-source-${suffix}-${index}`,
              attestation: { accurate: true, text: "Exact fixture totals" },
              evidence_ids: [evidenceId],
              command_key: `full-submit-${suffix}-${index}`,
            },
          ),
        );
        const review = parseResult(
          await invokeRpc(
            container,
            identities.reviewer,
            "review_billing_revenue_revision",
            {
              account_id: alphaAccountId,
              period_id: period.period_id,
              submission_id: submission.submission_id,
              outcome: "accept",
              reason_code: "REVENUE_ACCEPTED",
              reason: "Accepted exact formula fixture",
              exception: null,
              command_key: `full-review-${suffix}-${index}`,
            },
          ),
        );
        const close = parseResult(
          await invokeRpc(
            container,
            identities.reviewer,
            "close_billing_revenue_period",
            {
              account_id: alphaAccountId,
              period_id: period.period_id,
              close_mode: "accepted_evidence",
              review_event_id: String(review.review_event_id),
              reason: "Freeze complete calculation lineage",
              command_key: `full-close-${suffix}-${index}`,
            },
          ),
        );
        const previewRequest = {
          account_id: alphaAccountId,
          close_snapshot_id: close.close_snapshot_id,
          close_policy_version: "billing-manual-v1",
        };
        const preview = parseResult(
          await invokeRpc(
            container,
            identities.operator,
            "preview_billing_calculation",
            previewRequest,
          ),
        );
        const typescriptResult = calculateBillingFormula(formulaInput(entry));
        expect(typescriptResult.final_amount_minor).toBe(entry.expected);
        expect(preview).toMatchObject({
          final_amount_minor: typescriptResult.final_amount_minor,
          selected_branch: typescriptResult.selected_branch,
          formula_kind: entry.name,
          anomalies: [],
        });
        const calculation = parseResult(
          await invokeRpc(
            container,
            identities.operator,
            "create_billing_calculation",
            {
              ...previewRequest,
              preview_fingerprint: preview.preview_fingerprint,
              command_key: `full-calculate-${suffix}-${index}`,
            },
          ),
        );
        const approval = parseResult(
          await invokeRpc(
            container,
            identities.reviewer,
            "approve_billing_calculation",
            {
              account_id: alphaAccountId,
              calculation_id: calculation.calculation_id,
              preview_fingerprint: preview.preview_fingerprint,
              close_policy_version: "billing-manual-v1",
              mode: "manual",
              reason: "Approve complete exact lineage",
              command_key: `full-approve-${suffix}-${index}`,
            },
          ),
        );
        expect(approval).toMatchObject({ result: "approved" });
        const lineage = parseResult(
          await invokeRpc(
            container,
            identities.reviewer,
            "read_billing_calculation_lineage",
            {
              account_id: alphaAccountId,
              calculation_id: calculation.calculation_id,
            },
          ),
        );
        expect(lineage).toMatchObject({
          calculation: {
            id: calculation.calculation_id,
            formula_kind: entry.name,
            result_amount_minor: entry.expected,
          },
          approval: { mode: "manual", actor_type: "human" },
        });
        expectSupportSafe(lineage);
        calculations[entry.name] = {
          ...calculation,
          period_id: period.period_id,
          close_snapshot_id: close.close_snapshot_id,
        };
      }

      const hybrid = cases.find((entry) => entry.name === "hybrid")!;
      const minimumPeriod = parseResult(
        await invokeRpc(
          container,
          identities.operator,
          "ensure_billing_revenue_period",
          {
            account_id: alphaAccountId,
            agreement_version_id: hybrid.versionId,
            period_month: "2026-01",
            command_key: `late-period-${suffix}`,
          },
        ),
      );
      const minimumReview = parseResult(
        await invokeRpc(
          container,
          identities.reviewer,
          "review_billing_revenue_revision",
          {
            account_id: alphaAccountId,
            period_id: minimumPeriod.period_id,
            submission_id: null,
            outcome: "hold",
            reason_code: "MISSING_EVIDENCE",
            reason: "Missing evidence; preserve minimum exception",
            exception: {
              kind: "MISSING_EVIDENCE",
              owner_id: identities.operator,
              next_action: "Obtain the late source statement",
              due_at: "2030-01-01T00:00:00Z",
              amount_at_risk: null,
            },
            command_key: `late-review-missing-${suffix}`,
          },
        ),
      );
      const minimumClose = parseResult(
        await invokeRpc(
          container,
          identities.reviewer,
          "close_billing_revenue_period",
          {
            account_id: alphaAccountId,
            period_id: minimumPeriod.period_id,
            close_mode: "minimum_only",
            review_event_id: String(minimumReview.review_event_id),
            reason: "Close at contract minimum after deadline",
            command_key: `late-close-minimum-${suffix}`,
          },
        ),
      );
      const minimumPreviewRequest = {
        account_id: alphaAccountId,
        close_snapshot_id: minimumClose.close_snapshot_id,
        close_policy_version: "billing-manual-v1",
      };
      const minimumPreview = parseResult(
        await invokeRpc(
          container,
          identities.operator,
          "preview_billing_calculation",
          minimumPreviewRequest,
        ),
      );
      const minimumCalculation = parseResult(
        await invokeRpc(
          container,
          identities.operator,
          "create_billing_calculation",
          {
            ...minimumPreviewRequest,
            preview_fingerprint: minimumPreview.preview_fingerprint,
            command_key: `late-calculate-minimum-${suffix}`,
          },
        ),
      );
      parseResult(
        await invokeRpc(
          container,
          identities.reviewer,
          "approve_billing_calculation",
          {
            account_id: alphaAccountId,
            calculation_id: minimumCalculation.calculation_id,
            preview_fingerprint: minimumPreview.preview_fingerprint,
            close_policy_version: "billing-manual-v1",
            mode: "manual",
            reason: "Approve minimum while evidence exception stays open",
            command_key: `late-approve-minimum-${suffix}`,
          },
        ),
      );

      const lateSubmissionId = randomUUID();
      await serviceSql(
        container,
        `INSERT INTO public.billing_revenue_submissions (
           id, organization_id, account_id, period_id, revision_number,
           gross_amount_minor, excluded_amount_minor, commissionable_amount_minor,
           provenance_kind, provenance_source_id, submitter_id, submitter_role,
           attested_accurate, attestation_text, request_fingerprint, submitted_at
         ) VALUES (
           '${lateSubmissionId}', '${alphaOrganizationId}', '${alphaAccountId}',
           '${minimumPeriod.period_id}', 1, 2100000, 100000, 2000000,
           'statement', 'late-source-${suffix}', '${identities.operator}', 'operator',
           true, 'Late exact evidence attestation', repeat('d', 64),
           pg_catalog.now() + interval '1 second'
         );
         INSERT INTO public.billing_revenue_submission_evidence (
           submission_id, evidence_id, organization_id, account_id,
           evidence_ordinal, captured_sha256
         ) VALUES (
           '${lateSubmissionId}', '${evidenceId}', '${alphaOrganizationId}',
           '${alphaAccountId}', 1, repeat('e', 64)
         );
         INSERT INTO public.billing_revenue_review_events (
           organization_id, account_id, period_id, submission_id, outcome,
           reason_code, reviewer_id, reviewer_role, reason, input_fingerprint,
           evidence_fingerprint, request_fingerprint, created_at
         ) VALUES (
           '${alphaOrganizationId}', '${alphaAccountId}',
           '${minimumPeriod.period_id}', '${lateSubmissionId}', 'accept',
           'REVENUE_ACCEPTED', '${identities.reviewer}', 'reviewer',
           'Accepted late evidence for compensating calculation', repeat('d', 64),
           private.billing_revenue_evidence_fingerprint('${lateSubmissionId}'),
           repeat('f', 64), pg_catalog.now() + interval '2 seconds'
         );`,
      );
      const lateReviewId = await serviceSql(
        container,
        `SELECT id FROM public.billing_revenue_review_events
         WHERE submission_id = '${lateSubmissionId}' AND outcome = 'accept'`,
      );
      const originalHashes = await serviceSql(
        container,
        `SELECT concat_ws(':', calculation.request_fingerprint,
           calculation.close_input_fingerprint, snapshot.snapshot_hash,
           snapshot.explanation_hash, approval.request_fingerprint)
         FROM public.billing_calculations AS calculation
         JOIN public.billing_calculation_snapshots AS snapshot
           ON snapshot.calculation_id = calculation.id
         JOIN public.billing_calculation_events AS approval
           ON approval.calculation_id = calculation.id
           AND approval.event_type = 'approved'
         WHERE calculation.id = '${minimumCalculation.calculation_id}'`,
      );
      const adjustmentRequest = {
        account_id: alphaAccountId,
        original_calculation_id: minimumCalculation.calculation_id,
        late_submission_id: lateSubmissionId,
        late_review_event_id: lateReviewId,
        reason: "Create exact late-evidence true-up",
        command_key: `late-adjust-${suffix}`,
      };
      const concurrentAdjustments = await Promise.all(
        Array.from({ length: 12 }, () =>
          invokeRpc(
            container,
            identities.reviewer,
            "create_billing_adjustment_calculation",
            adjustmentRequest,
          ),
        ),
      );
      const adjustmentResults = concurrentAdjustments.map(parseResult);
      expect(
        new Set(adjustmentResults.map((row) => row.adjustment_calculation_id))
          .size,
      ).toBe(1);
      expect(adjustmentResults[0]).toMatchObject({
        result: "approved",
        original_amount_minor: "125000",
        actual_amount_minor: "200000",
        delta_minor: "75000",
        treatment: "true_up",
      });

      const effectCounts = JSON.parse(
        await serviceSql(
          container,
          `SELECT jsonb_build_object(
             'adjustments', (SELECT count(*) FROM public.billing_adjustment_calculations
               WHERE original_calculation_id = '${minimumCalculation.calculation_id}'),
             'links', (SELECT count(*) FROM public.billing_calculation_links
               WHERE original_calculation_id = '${minimumCalculation.calculation_id}'),
             'base_closes', (SELECT count(*) FROM public.billing_revenue_close_snapshots
               WHERE period_id = '${minimumPeriod.period_id}'),
             'open_missing', (SELECT count(*) FROM public.billing_close_exceptions
               WHERE period_id = '${minimumPeriod.period_id}'
                 AND reason_code = 'MISSING_EVIDENCE' AND status = 'open'),
             'invoices', (SELECT count(*) FROM public.invoices
               WHERE billing_account_id = '${alphaAccountId}')
           )::text`,
        ),
      );
      expect(effectCounts).toMatchObject({
        adjustments: 1,
        links: 1,
        base_closes: 1,
        open_missing: 1,
      });
      expect(
        await serviceSql(
          container,
          `SELECT concat_ws(':', calculation.request_fingerprint,
           calculation.close_input_fingerprint, snapshot.snapshot_hash,
           snapshot.explanation_hash, approval.request_fingerprint)
         FROM public.billing_calculations AS calculation
         JOIN public.billing_calculation_snapshots AS snapshot
           ON snapshot.calculation_id = calculation.id
         JOIN public.billing_calculation_events AS approval
           ON approval.calculation_id = calculation.id
           AND approval.event_type = 'approved'
         WHERE calculation.id = '${minimumCalculation.calculation_id}'`,
        ),
      ).toBe(originalHashes);

      expectFailure(
        await invokeRpc(
          container,
          identities.reviewer,
          "create_billing_adjustment_calculation",
          { ...adjustmentRequest, reason: "Changed adjustment reason" },
        ),
        "CALCULATION_ADJUSTMENT_IDEMPOTENCY_CONFLICT",
      );
      expectFailure(
        await invokeRpc(
          container,
          identities.bravoOperator,
          "create_billing_adjustment_calculation",
          {
            ...adjustmentRequest,
            account_id: bravoAccountId,
            command_key: `late-cross-tenant-${suffix}`,
          },
        ),
        "CALCULATION_NOT_AUTHORIZED",
      );
      expectFailure(
        await invokeRpc(
          container,
          identities.bravoOperator,
          "read_billing_calculation_lineage",
          {
            account_id: bravoAccountId,
            calculation_id: minimumCalculation.calculation_id,
          },
        ),
        "CALCULATION_NOT_AUTHORIZED",
      );
      expect(
        await serviceSql(
          container,
          `SELECT concat_ws(':',
             (SELECT count(*) FROM public.billing_adjustment_calculations
               WHERE original_calculation_id = '${minimumCalculation.calculation_id}'),
             (SELECT count(*) FROM public.billing_calculation_links
               WHERE original_calculation_id = '${minimumCalculation.calculation_id}'),
             (SELECT count(*) FROM public.billing_revenue_close_snapshots
               WHERE period_id = '${minimumPeriod.period_id}'))`,
        ),
      ).toBe("1:1:1");
      expectSupportSafe(calculations);
    }, 240_000);
  },
);
