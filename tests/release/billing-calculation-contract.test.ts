import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { describe, expect, it } from "vitest";

type ProcessResult = { code: number; stdout: string; stderr: string };
type CalculationResult = Record<string, unknown>;

const repositoryRoot = path.resolve(__dirname, "../..");
const expectedContainer = "supabase_db_atomic-crm-demo";
const identities = {
  administrator: "21000000-0000-0000-0000-000000000001",
  operator: "21000000-0000-0000-0000-000000000002",
  reviewer: "21000000-0000-0000-0000-000000000003",
  auditor: "21000000-0000-0000-0000-000000000004",
  customer: "21000000-0000-0000-0000-000000000005",
  automation: "21000000-0000-0000-0000-000000000006",
  bravoOperator: "22000000-0000-0000-0000-000000000002",
} as const;
const alphaOrganizationId = "21000000-0000-0000-0000-000000000100";
const alphaAccountId = "21000000-0000-0000-0000-000000000200";

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
  timeoutMs = 45_000,
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
    throw new Error("calculation test UUID is invalid");
  }
  return value;
}

function assertRpc(value: string) {
  const allowed = new Set([
    "approve_billing_calculation",
    "create_billing_calculation",
    "preview_billing_calculation",
  ]);
  if (!allowed.has(value)) throw new Error("calculation RPC name is invalid");
  return value;
}

function sqlJson(value: Record<string, unknown>) {
  return JSON.stringify(value).replaceAll("'", "''");
}

async function invokeCalculation(
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
    60_000,
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
  return JSON.parse(line!) as CalculationResult;
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

function expectFailure(result: ProcessResult, code: string) {
  expect(result.code).not.toBe(0);
  expect(result.stderr).toContain(code);
  expect(result.stderr).not.toMatch(
    /object_path|customer_name|auth\.users|request\.jwt|stack trace|eyJ[A-Za-z0-9_-]+\./i,
  );
}

function calculationFixtureSql(
  suffix: string,
  agreementId: string,
  versionId: string,
  evidenceId: string,
  periodIds: string[],
  submissionIds: string[],
  closeIds: string[],
) {
  const months = ["2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01"];
  const gross = ["1000000", "2000000", "2500000", "3000000"];
  const excluded = ["100000", "100000", "100000", "100000"];
  const closeFingerprintCharacter = ["a", "b", "c", "d"];
  const tuples = periodIds
    .map(
      (periodId, index) =>
        `('${periodId}', '${alphaOrganizationId}', '${alphaAccountId}',
          '${agreementId}', '${versionId}', '${months[index]}',
          ('${months[index]}'::date + interval '1 month')::date,
          'America/Los_Angeles', '2030-01-01T00:00:00Z',
          '${identities.operator}', 'operator')`,
    )
    .join(",\n");
  const submissions = submissionIds
    .map(
      (submissionId, index) =>
        `('${submissionId}', '${alphaOrganizationId}', '${alphaAccountId}',
          '${periodIds[index]}', 1, ${gross[index]}, ${excluded[index]},
          ${BigInt(gross[index]) - BigInt(excluded[index])}, 'statement',
          'fixture-${suffix}-${index}', '${identities.operator}', 'operator',
          true, 'Exact fixture attestation', repeat('${index + 2}', 64))`,
    )
    .join(",\n");
  const reviews = periodIds
    .map(
      (periodId, index) =>
        `('${alphaOrganizationId}', '${alphaAccountId}', '${periodId}',
          '${submissionIds[index]}', 'accept', 'REVENUE_ACCEPTED',
          '${identities.reviewer}', 'reviewer', 'Exact fixture accepted',
          repeat('${index + 2}', 64), repeat('${index + 6}', 64),
          repeat('${index + 2}', 64))`,
    )
    .join(",\n");
  const closes = closeIds
    .map(
      (closeId, index) =>
        `('${closeId}', '${alphaOrganizationId}', '${alphaAccountId}',
          '${periodIds[index]}', '${agreementId}', '${versionId}',
          'accepted_evidence', '${submissionIds[index]}',
          (SELECT id FROM public.billing_revenue_review_events
           WHERE period_id = '${periodIds[index]}' AND outcome = 'accept'),
          ${gross[index]}, ${excluded[index]},
          ${BigInt(gross[index]) - BigInt(excluded[index])}, 'statement',
          'fixture-${suffix}-${index}',
          '[{"evidence_id":"${evidenceId}","captured_sha256":"${"1".repeat(64)}","ordinal":1}]',
          repeat('a', 64), repeat('${index + 2}', 64), repeat('${index + 6}', 64),
          repeat('${closeFingerprintCharacter[index]}', 64),
          'revenue-review-v1', 'revenue-close-v1',
          '${identities.reviewer}', 'reviewer', 'Freeze exact fixture',
          repeat('${index + 2}', 64))`,
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
      repeat('1', 64), 512, 'application/pdf', 'clean',
      '21000000-0000-0000-0000-000000000400',
      '21000000-0000-0000-0000-000000000502', pg_catalog.now(),
      'SCAN_CLEAN', '2035-01-01T00:00:00Z', 'active',
      'revenue_statement', 'calculation-${suffix}.pdf', 'Calculation fixture'
    );
    INSERT INTO public.billing_agreements (
      id, organization_id, account_id, agreement_family, created_by
    ) VALUES (
      '${agreementId}', '${alphaOrganizationId}', '${alphaAccountId}',
      'calculation_${suffix}', '${identities.operator}'
    );
    INSERT INTO public.billing_agreement_versions (
      id, organization_id, account_id, agreement_id, version_number, state,
      effective_start, effective_end, formula_kind, minimum_amount_minor,
      rate_numerator, rate_denominator, submitted_percentage,
      signed_evidence_id, signed_evidence_sha256, terms_fingerprint,
      authored_by, authored_by_role, submitted_by, submitted_by_role,
      submitted_at, approved_by, approved_by_role, approved_at
    ) VALUES (
      '${versionId}', '${alphaOrganizationId}', '${alphaAccountId}',
      '${agreementId}', 1, 'active', '2026-01-01', '2027-01-01',
      'hybrid', 125000, 7, 100, '7%', '${evidenceId}', repeat('1', 64),
      repeat('a', 64), '${identities.operator}', 'operator',
      '${identities.operator}', 'operator', now(), '${identities.reviewer}',
      'reviewer', now()
    );
    INSERT INTO public.billing_agreement_revenue_rules (
      agreement_version_id, organization_id, account_id, timezone,
      timing_basis, included_amounts, excluded_amounts, tax_treatment,
      refund_chargeback_policy, cutoff_day, dispute_policy,
      missing_report_policy, true_up_policy, evidence_priority
    ) VALUES (
      '${versionId}', '${alphaOrganizationId}', '${alphaAccountId}',
      'America/Los_Angeles', 'cash', '["service_revenue"]', '["sales_tax"]',
      'exclude', 'deduct_in_period', 5, 'hold_close', 'minimum_only',
      'next_period_adjustment', '["statement"]'
    );
    INSERT INTO public.billing_revenue_periods (
      id, organization_id, account_id, agreement_id, agreement_version_id,
      period_start, period_end, timezone, submission_deadline_at,
      created_by, created_by_role
    ) VALUES ${tuples};
    INSERT INTO public.billing_revenue_submissions (
      id, organization_id, account_id, period_id, revision_number,
      gross_amount_minor, excluded_amount_minor, commissionable_amount_minor,
      provenance_kind, provenance_source_id, submitter_id, submitter_role,
      attested_accurate, attestation_text, request_fingerprint
    ) VALUES ${submissions};
    INSERT INTO public.billing_revenue_review_events (
      organization_id, account_id, period_id, submission_id, outcome,
      reason_code, reviewer_id, reviewer_role, reason, input_fingerprint,
      evidence_fingerprint, request_fingerprint
    ) VALUES ${reviews};
    INSERT INTO public.billing_revenue_close_snapshots (
      id, organization_id, account_id, period_id, agreement_id,
      agreement_version_id, close_mode, submission_id, review_event_id,
      gross_amount_minor, excluded_amount_minor, commissionable_amount_minor,
      provenance_kind, provenance_source_id, evidence_snapshot,
      agreement_fingerprint, input_fingerprint, evidence_fingerprint,
      close_input_fingerprint, review_policy_version, close_policy_version,
      closed_by, closed_by_role, decision_reason, request_fingerprint
    ) VALUES ${closes};`;
}

describe("billing calculation contract harness", () => {
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
  "live exact calculation lifecycle",
  () => {
    it("previews, creates, compares, and manually approves exactly once", async () => {
      const container = await resolveDatabaseContainer();
      const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
      const agreementId = randomUUID();
      const versionId = randomUUID();
      const evidenceId = randomUUID();
      const periodIds = Array.from({ length: 4 }, () => randomUUID());
      const submissionIds = Array.from({ length: 4 }, () => randomUUID());
      const closeIds = Array.from({ length: 4 }, () => randomUUID());
      [
        ...periodIds,
        ...submissionIds,
        ...closeIds,
        agreementId,
        versionId,
        evidenceId,
      ].forEach(assertUuid);
      await serviceSql(
        container,
        calculationFixtureSql(
          suffix,
          agreementId,
          versionId,
          evidenceId,
          periodIds,
          submissionIds,
          closeIds,
        ),
      );

      const previewRequest = (closeSnapshotId: string) => ({
        account_id: alphaAccountId,
        close_snapshot_id: closeSnapshotId,
        close_policy_version: "billing-manual-v1",
      });
      const countFacts = () =>
        serviceSql(
          container,
          `SELECT jsonb_build_object(
             'calculations', count(DISTINCT calculation.id),
             'events', count(DISTINCT event.id)
           )::text
           FROM public.billing_calculations AS calculation
           LEFT JOIN public.billing_calculation_events AS event
             ON event.calculation_id = calculation.id
           WHERE calculation.agreement_id = '${agreementId}'`,
        );

      const beforePreview = await countFacts();
      const priorPreview = parseResult(
        await invokeCalculation(
          container,
          identities.operator,
          "preview_billing_calculation",
          previewRequest(closeIds[0]),
        ),
      );
      expect(priorPreview).toMatchObject({
        result: "preview",
        selected_branch: "minimum",
        final_amount_minor: "125000",
        comparison_status: "not_available",
        previous_calculation_id: null,
        delta_minor: null,
        anomalies: [],
      });
      expect(await countFacts()).toBe(beforePreview);

      const priorCreateRequest = {
        ...previewRequest(closeIds[0]),
        preview_fingerprint: priorPreview.preview_fingerprint,
        command_key: `calc-prior-${suffix}`,
      };
      const priorCalculation = parseResult(
        await invokeCalculation(
          container,
          identities.operator,
          "create_billing_calculation",
          priorCreateRequest,
        ),
      );
      expect(priorCalculation).toMatchObject({
        result: "created",
        final_amount_minor: "125000",
      });
      const priorApproval = parseResult(
        await invokeCalculation(
          container,
          identities.reviewer,
          "approve_billing_calculation",
          {
            account_id: alphaAccountId,
            calculation_id: priorCalculation.calculation_id,
            preview_fingerprint: priorPreview.preview_fingerprint,
            close_policy_version: "billing-manual-v1",
            mode: "manual",
            reason: "Approve prior exact calculation",
            command_key: `approve-prior-${suffix}`,
          },
        ),
      );
      expect(priorApproval).toMatchObject({
        result: "approved",
        mode: "manual",
      });

      const currentPreview = parseResult(
        await invokeCalculation(
          container,
          identities.operator,
          "preview_billing_calculation",
          previewRequest(closeIds[1]),
        ),
      );
      expect(currentPreview).toMatchObject({
        result: "preview",
        selected_branch: "percentage",
        final_amount_minor: "133000",
        comparison_status: "available",
        previous_calculation_id: priorCalculation.calculation_id,
        delta_minor: "8000",
        delta_rate_numerator: "8000",
        delta_rate_denominator: "125000",
        anomalies: [],
      });
      const createRequest = {
        ...previewRequest(closeIds[1]),
        preview_fingerprint: currentPreview.preview_fingerprint,
        command_key: `calc-current-${suffix}`,
      };
      const concurrentCreates = await Promise.all(
        Array.from({ length: 12 }, () =>
          invokeCalculation(
            container,
            identities.operator,
            "create_billing_calculation",
            createRequest,
          ),
        ),
      );
      const createResults = concurrentCreates.map(parseResult);
      expect(new Set(createResults.map((row) => row.calculation_id)).size).toBe(
        1,
      );
      expect(new Set(createResults.map((row) => row.snapshot_hash)).size).toBe(
        1,
      );
      const currentCalculationId = String(createResults[0].calculation_id);
      expectFailure(
        await invokeCalculation(
          container,
          identities.operator,
          "create_billing_calculation",
          { ...createRequest, preview_fingerprint: "f".repeat(64) },
        ),
        "CALCULATION_IDEMPOTENCY_CONFLICT",
      );

      const approveRequest = {
        account_id: alphaAccountId,
        calculation_id: currentCalculationId,
        preview_fingerprint: currentPreview.preview_fingerprint,
        close_policy_version: "billing-manual-v1",
        mode: "manual",
        reason: "Approve exact monthly calculation",
        command_key: `approve-current-${suffix}`,
      };
      const concurrentApprovals = await Promise.all(
        Array.from({ length: 12 }, () =>
          invokeCalculation(
            container,
            identities.reviewer,
            "approve_billing_calculation",
            approveRequest,
          ),
        ),
      );
      const approvalResults = concurrentApprovals.map(parseResult);
      expect(approvalResults.every((row) => row.result === "approved")).toBe(
        true,
      );
      expect(new Set(approvalResults.map((row) => row.event_id)).size).toBe(1);
      expectFailure(
        await invokeCalculation(
          container,
          identities.reviewer,
          "approve_billing_calculation",
          { ...approveRequest, reason: "Changed approval reason" },
        ),
        "CALCULATION_IDEMPOTENCY_CONFLICT",
      );

      const counts = JSON.parse(await countFacts()) as {
        calculations: number;
        events: number;
      };
      expect(counts).toEqual({ calculations: 2, events: 4 });

      const stalePreview = parseResult(
        await invokeCalculation(
          container,
          identities.operator,
          "preview_billing_calculation",
          previewRequest(closeIds[2]),
        ),
      );
      await serviceSql(
        container,
        `UPDATE public.billing_evidence_objects
         SET hold_started_at = pg_catalog.now(), hold_reason = 'calculation stale test'
         WHERE id = '${evidenceId}'`,
      );
      expectFailure(
        await invokeCalculation(
          container,
          identities.operator,
          "create_billing_calculation",
          {
            ...previewRequest(closeIds[2]),
            preview_fingerprint: stalePreview.preview_fingerprint,
            command_key: `calc-stale-${suffix}`,
          },
        ),
        "CALCULATION_PREVIEW_STALE",
      );
      await serviceSql(
        container,
        `UPDATE public.billing_evidence_objects
         SET hold_released_at = pg_catalog.now(),
             hold_release_reason = 'calculation stale test complete'
         WHERE id = '${evidenceId}'`,
      );

      for (const [identity, expected] of [
        [identities.bravoOperator, "CALCULATION_NOT_AUTHORIZED"],
        [identities.reviewer, "CALCULATION_NOT_AUTHORIZED"],
        [identities.customer, "CALCULATION_NOT_AUTHORIZED"],
        [identities.auditor, "CALCULATION_NOT_AUTHORIZED"],
      ] as const) {
        expectFailure(
          await invokeCalculation(
            container,
            identity,
            "preview_billing_calculation",
            previewRequest(closeIds[3]),
          ),
          expected,
        );
      }

      const autoPreview = parseResult(
        await invokeCalculation(
          container,
          identities.operator,
          "preview_billing_calculation",
          previewRequest(closeIds[3]),
        ),
      );
      const autoCalculation = parseResult(
        await invokeCalculation(
          container,
          identities.operator,
          "create_billing_calculation",
          {
            ...previewRequest(closeIds[3]),
            preview_fingerprint: autoPreview.preview_fingerprint,
            command_key: `calc-auto-${suffix}`,
          },
        ),
      );
      expectFailure(
        await invokeCalculation(
          container,
          identities.reviewer,
          "approve_billing_calculation",
          {
            account_id: alphaAccountId,
            calculation_id: autoCalculation.calculation_id,
            preview_fingerprint: autoPreview.preview_fingerprint,
            close_policy_version: "billing-manual-v1",
            mode: "auto",
            reason: "Human must not masquerade as automation",
            command_key: `auto-denied-${suffix}`,
            grant_id: randomUUID(),
            provider_reference: "calculation-fixture",
          },
        ),
        "CALCULATION_AUTO_NOT_AUTHORIZED",
      );

      const autoPolicy = `calculation-auto-${suffix}`;
      const grantId = randomUUID();
      await serviceSql(
        container,
        `INSERT INTO public.billing_close_policies (
           policy_version, organization_id, account_id, policy_mode, active,
           allowed_account_statuses, allowed_formula_kinds, allowed_close_modes,
           allowed_provenance_kinds, require_zero_anomalies,
           minimum_result_minor, maximum_result_minor, created_by
         ) VALUES (
           '${autoPolicy}', '${alphaOrganizationId}', '${alphaAccountId}',
           'auto', true, '["active"]', '["hybrid"]', '["accepted_evidence"]',
           '["statement"]', true, 0, 500000, '${identities.administrator}'
         );
         INSERT INTO public.billing_automation_grants (
           id, organization_id, account_id, principal_id, command_name,
           provider_reference, policy_version, action_kind, max_actions,
           max_amount_minor
         ) VALUES (
           '${grantId}', '${alphaOrganizationId}', '${alphaAccountId}',
           '21000000-0000-0000-0000-000000000400', 'calculation.approve',
           'calculation-fixture', '${autoPolicy}', 'calculation.approval', 1, 0
         )`,
      );
      const changedPolicyPreview = parseResult(
        await invokeCalculation(
          container,
          identities.operator,
          "preview_billing_calculation",
          { ...previewRequest(closeIds[3]), close_policy_version: autoPolicy },
        ),
      );
      expectFailure(
        await invokeCalculation(
          container,
          identities.operator,
          "create_billing_calculation",
          {
            ...previewRequest(closeIds[3]),
            close_policy_version: autoPolicy,
            preview_fingerprint: changedPolicyPreview.preview_fingerprint,
            command_key: `calc-policy-conflict-${suffix}`,
          },
        ),
        "CALCULATION_BUSINESS_KEY_CONFLICT",
      );
      const autoPolicyPreview = parseResult(
        await invokeCalculation(
          container,
          identities.operator,
          "preview_billing_calculation",
          { ...previewRequest(closeIds[2]), close_policy_version: autoPolicy },
        ),
      );
      const autoPolicyCalculation = parseResult(
        await invokeCalculation(
          container,
          identities.operator,
          "create_billing_calculation",
          {
            ...previewRequest(closeIds[2]),
            close_policy_version: autoPolicy,
            preview_fingerprint: autoPolicyPreview.preview_fingerprint,
            command_key: `calc-auto-policy-${suffix}`,
          },
        ),
      );
      const automatedApproval = parseResult(
        await invokeCalculation(
          container,
          identities.automation,
          "approve_billing_calculation",
          {
            account_id: alphaAccountId,
            calculation_id: autoPolicyCalculation.calculation_id,
            preview_fingerprint: autoPolicyPreview.preview_fingerprint,
            close_policy_version: autoPolicy,
            mode: "auto",
            reason: "Approve under exact active automation policy",
            command_key: `auto-approve-${suffix}`,
            grant_id: grantId,
            provider_reference: "calculation-fixture",
          },
        ),
      );
      expect(automatedApproval).toMatchObject({
        result: "approved",
        mode: "auto",
        close_policy_version: autoPolicy,
      });
      expect(
        parseResult(
          await invokeCalculation(
            container,
            identities.automation,
            "approve_billing_calculation",
            {
              account_id: alphaAccountId,
              calculation_id: autoPolicyCalculation.calculation_id,
              preview_fingerprint: autoPolicyPreview.preview_fingerprint,
              close_policy_version: autoPolicy,
              mode: "auto",
              reason: "Approve under exact active automation policy",
              command_key: `auto-approve-${suffix}`,
              grant_id: grantId,
              provider_reference: "calculation-fixture",
            },
          ),
        ),
      ).toEqual(automatedApproval);
      expect(
        JSON.parse(
          await serviceSql(
            container,
            `SELECT jsonb_build_object(
               'actions', actions_consumed,
               'executions', (SELECT count(*)
                 FROM public.billing_automation_executions
                 WHERE grant_id = '${grantId}'),
               'approvals', (SELECT count(*)
                 FROM public.billing_calculation_events
                 WHERE calculation_id = '${autoPolicyCalculation.calculation_id}'
                   AND event_type = 'approved')
             )::text
             FROM public.billing_automation_grants WHERE id = '${grantId}'`,
          ),
        ),
      ).toEqual({ actions: 1, executions: 1, approvals: 1 });
    }, 180_000);
  },
);
