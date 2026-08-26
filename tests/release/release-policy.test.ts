import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = path.resolve(__dirname, "../..");
const releaseDirectory = path.join(repositoryRoot, ".github/release");

const fastChecks = [
  "check / lint",
  "check / typecheck",
  "check / unit",
  "check / build",
];

const financialChecks = [
  "financial / migration-clean",
  "financial / migration-upgrade",
  "financial / database-contracts",
  "financial / edge-provider-contracts",
  "financial / replay-concurrency",
  "financial / release-security",
];

const nonOverridableFailures = [
  "migration_clean",
  "migration_upgrade",
  "authorization",
  "secret_exposure",
  "production_source_maps",
  "replay_concurrency",
  "provider_contract",
  "critical_high_production_vulnerability",
];

const receiptFields = [
  "schema_version",
  "policy_version",
  "stage",
  "predecessor",
  "commit_sha",
  "artifact_digests",
  "migration_range",
  "required_checks",
  "report_hashes",
  "target_environment",
  "feature_flag_state",
  "approvals",
  "timestamps",
  "exceptions",
  "rollback_references",
  "attestation",
];

function readJson(filename: string): Record<string, unknown> {
  return JSON.parse(
    fs.readFileSync(path.join(releaseDirectory, filename), "utf-8"),
  ) as Record<string, unknown>;
}

function readWorkflow(filename: string): string {
  return fs.readFileSync(
    path.join(repositoryRoot, ".github/workflows", filename),
    "utf8",
  );
}

function actionReferences(workflow: string): string[] {
  return [...workflow.matchAll(/\buses:\s*([^\s#]+)(?:\s*#.*)?$/gm)].map(
    (match) => match[1],
  );
}

function policyErrors(policy: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const checks = policy.required_checks as Record<string, unknown> | undefined;
  const exceptions = policy.exceptions as Record<string, unknown> | undefined;
  const retries = policy.retries as Record<string, unknown> | undefined;
  const evidence = policy.evidence as Record<string, unknown> | undefined;

  if (JSON.stringify(checks?.fast) !== JSON.stringify(fastChecks)) {
    errors.push("required_checks.fast");
  }
  if (JSON.stringify(checks?.financial) !== JSON.stringify(financialChecks)) {
    errors.push("required_checks.financial");
  }
  if (
    JSON.stringify(policy.stage_order) !==
    JSON.stringify([
      "build",
      "schema",
      "functions",
      "frontend",
      "dormant",
      "enable",
    ])
  ) {
    errors.push("stage_order");
  }
  if (
    JSON.stringify(policy.non_overridable_failures) !==
    JSON.stringify(nonOverridableFailures)
  ) {
    errors.push("non_overridable_failures");
  }
  if (exceptions?.max_exception_days !== 7) {
    errors.push("exceptions.max_exception_days");
  }
  if (
    JSON.stringify(exceptions?.allowed_classes) !==
    JSON.stringify(["unrelated_nonfinancial", "classified_infrastructure"])
  ) {
    errors.push("exceptions.allowed_classes");
  }
  if (
    JSON.stringify(exceptions?.required_fields) !==
    JSON.stringify([
      "authenticated_owner",
      "linked_issue",
      "affected_scope",
      "rationale",
      "compensating_controls",
      "expires_at",
    ])
  ) {
    errors.push("exceptions.required_fields");
  }
  if (retries?.assertion !== 0 || retries?.bootstrap !== 1) {
    errors.push("retries");
  }
  if (evidence?.authoritative_visibility !== "PRIVATE") {
    errors.push("evidence.authoritative_visibility");
  }

  return errors;
}

function rulesetErrors(document: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const ruleset = document.ruleset as Record<string, unknown> | undefined;
  const conditions = ruleset?.conditions as Record<string, unknown> | undefined;
  const refName = conditions?.ref_name as Record<string, unknown> | undefined;
  const rules = (ruleset?.rules as Record<string, unknown>[] | undefined) ?? [];
  const required = rules.find((rule) => rule.type === "required_status_checks");
  const requiredParameters = required?.parameters as
    | Record<string, unknown>
    | undefined;
  const requiredStatuses =
    (requiredParameters?.required_status_checks as
      | Record<string, unknown>[]
      | undefined) ?? [];
  const contexts = requiredStatuses.map((status) => status.context).sort();

  if (document.repository !== "Rconman99/atomic-crm") {
    errors.push("repository");
  }
  if (ruleset?.name !== "main-financial-release") errors.push("name");
  if (ruleset?.target !== "branch" || ruleset?.enforcement !== "active") {
    errors.push("enforcement");
  }
  if (
    JSON.stringify(refName?.include) !== JSON.stringify(["refs/heads/main"])
  ) {
    errors.push("main-target");
  }
  if (
    !Array.isArray(ruleset?.bypass_actors) ||
    ruleset.bypass_actors.length !== 0
  ) {
    errors.push("bypass-actors");
  }
  if (
    JSON.stringify(contexts) !==
    JSON.stringify([...fastChecks, ...financialChecks].sort())
  ) {
    errors.push("required-status-checks");
  }
  if (requiredStatuses.some((status) => status.integration_id !== 15368)) {
    errors.push("required-status-app");
  }
  if (!rules.some((rule) => rule.type === "merge_queue")) {
    errors.push("merge-queue");
  }
  if (!rules.some((rule) => rule.type === "pull_request")) {
    errors.push("pull-request");
  }
  if (!rules.some((rule) => rule.type === "required_signatures")) {
    errors.push("signed-commits");
  }
  if (!rules.some((rule) => rule.type === "required_linear_history")) {
    errors.push("linear-history");
  }
  return errors;
}

describe("financial release path ownership", () => {
  const paths = readJson("financial-paths.json");

  it("classifies every release-sensitive path", () => {
    expect(paths.financial_paths).toEqual(
      expect.arrayContaining([
        "supabase/migrations/**",
        "supabase/functions/**",
        "supabase/tests/**",
        "tests/release/**",
        "scripts/release/**",
        "package.json",
        "package-lock.json",
        "vite.config.ts",
        ".github/release/**",
        ".github/workflows/financial-*.yml",
        ".github/workflows/release-*.yml",
      ]),
    );
  });
});

describe("financial release policy", () => {
  const policy = readJson("release-policy.json");

  it("accepts the locked release contract", () => {
    expect(policyErrors(policy)).toEqual([]);
  });

  it("rejects a missing or renamed required lane", () => {
    const candidate = structuredClone(policy);
    const checks = candidate.required_checks as Record<string, unknown>;
    checks.financial = financialChecks.slice(1);
    expect(policyErrors(candidate)).toContain("required_checks.financial");
  });

  it("rejects an unsafe stage order", () => {
    const candidate = structuredClone(policy);
    candidate.stage_order = [
      "build",
      "functions",
      "schema",
      "frontend",
      "dormant",
      "enable",
    ];
    expect(policyErrors(candidate)).toContain("stage_order");
  });

  it("rejects overlong or incomplete exception scope", () => {
    const candidate = structuredClone(policy);
    const exceptions = candidate.exceptions as Record<string, unknown>;
    exceptions.max_exception_days = 8;
    exceptions.required_fields = ["authenticated_owner", "expires_at"];
    expect(policyErrors(candidate)).toEqual(
      expect.arrayContaining([
        "exceptions.max_exception_days",
        "exceptions.required_fields",
      ]),
    );
  });

  it("does not expose any waiver or ignore field", () => {
    expect(JSON.stringify(policy)).not.toMatch(
      /"(?:allow|allowed|ignore|waive|override)_(?:failure|gate|check)s?"/i,
    );
  });
});

describe("release receipt schema", () => {
  const schema = readJson("release-receipt.schema.json");

  it("uses Draft 2020-12 and requires every release receipt field", () => {
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema.required).toEqual(receiptFields);
  });

  it.each(receiptFields)("rejects a receipt missing %s", (field) => {
    const completeReceipt = Object.fromEntries(
      receiptFields.map((requiredField) => [requiredField, true]),
    );
    delete completeReceipt[field];
    const missing = (schema.required as string[]).filter(
      (requiredField) => !(requiredField in completeReceipt),
    );
    expect(missing).toContain(field);
  });

  it("closes security-sensitive objects to undeclared properties", () => {
    const properties = schema.properties as Record<
      string,
      Record<string, unknown>
    >;
    for (const field of [
      "artifact_digests",
      "migration_range",
      "report_hashes",
      "target_environment",
      "feature_flag_state",
      "predecessor",
      "timestamps",
      "attestation",
    ]) {
      expect(properties[field]?.additionalProperties, field).toBe(false);
    }
    for (const field of ["required_checks", "approvals", "exceptions"]) {
      expect(
        (properties[field]?.items as Record<string, unknown>)
          ?.additionalProperties,
        field,
      ).toBe(false);
    }
  });
});

describe("GitHub workflow release contracts", () => {
  it("workflow exposes the four exact read-only fast check identities", () => {
    const workflow = readWorkflow("check.yml");
    expect(workflow).toMatch(/^name:\s*check\s*$/m);
    expect(workflow).toMatch(/permissions:\s*\n\s+contents:\s*read/m);
    for (const suffix of ["lint", "typecheck", "unit", "build"]) {
      expect(workflow).toMatch(
        new RegExp(
          `^\\s{2}${suffix}:\\s*\\n(?:.|\\n)*?^\\s{4}name:\\s*check / ${suffix}\\s*$`,
          "m",
        ),
      );
    }
    expect(workflow).toMatch(/node-version:\s*["']?22["']?/);
    expect(workflow).not.toMatch(/contents:\s*write|checks:\s*write|secrets\./);
    expect(workflow).not.toMatch(
      /supabase\s+(?:link|db\s+push|functions\s+deploy)|gh-pages|vercel\s+deploy/,
    );
  });

  it("workflow exposes six independent financial jobs and exact Make commands", () => {
    const workflow = readWorkflow("financial-release-gate.yml");
    expect(workflow).toMatch(/^name:\s*financial\s*$/m);
    expect(workflow).toMatch(
      /merge_group:\s*\n\s+types:\s*\[checks_requested\]/m,
    );
    expect(workflow).toMatch(/pull_request:/);
    expect(workflow).not.toMatch(/\bmatrix:/);

    const commands: Record<string, string> = {
      "migration-clean": "make test-financial-migration-clean",
      "migration-upgrade": "make test-financial-migration-upgrade",
      "database-contracts": "make test-financial-database-contracts",
      "edge-provider-contracts": "make test-financial-functions",
      "replay-concurrency": "make test-financial-replay-concurrency",
      "release-security": "make test-release-security",
    };
    for (const [suffix, command] of Object.entries(commands)) {
      expect(workflow).toMatch(
        new RegExp(
          `^\\s{2}${suffix}:\\s*\\n(?:.|\\n)*?^\\s{4}name:\\s*financial / ${suffix}\\s*$`,
          "m",
        ),
      );
      expect(workflow).toContain(`run: ${command}`);
    }
  });

  it("workflow makes merge-group financial jobs unconditional on paths", () => {
    const workflow = readWorkflow("financial-release-gate.yml");
    const financialJobBlocks = workflow.split(/^ {2}(?=[a-z][a-z-]+:)/m);
    const jobs = financialJobBlocks.filter((block) =>
      /name:\s*financial \/ (?:migration-clean|migration-upgrade|database-contracts|edge-provider-contracts|replay-concurrency|release-security)\s*$/m.test(
        block,
      ),
    );
    expect(jobs).toHaveLength(6);
    for (const job of jobs) {
      expect(job).toContain("github.event_name == 'merge_group'");
      expect(job).toContain("needs.classify.outputs.financial == 'true'");
      expect(job).not.toMatch(/continue-on-error|retry/i);
    }
  });

  it("workflow pins every action, Node, and local Supabase CLI", () => {
    const workflows = [
      readWorkflow("check.yml"),
      readWorkflow("financial-release-gate.yml"),
    ];
    for (const workflow of workflows) {
      for (const reference of actionReferences(workflow)) {
        expect(reference).toMatch(/^[^@\s]+@[a-f0-9]{40}$/);
      }
      expect(workflow).toMatch(/node-version:\s*["']?22["']?/);
    }
    const financial = workflows[1];
    expect(financial).toContain("version: 2.115.0");
    expect(financial).toMatch(/permissions:\s*\n\s+contents:\s*read/m);
    expect(financial).not.toMatch(
      /contents:\s*write|checks:\s*write|secrets\./,
    );
  });
});

describe("GitHub ruleset release contracts", () => {
  it("ruleset targets main with exact checks, merge queue, and no bypass", () => {
    const document = readJson("main-ruleset.json");
    expect(rulesetErrors(document)).toEqual([]);
  });

  it("ruleset rejects a missing queue, renamed check, or bypass actor", () => {
    const document = readJson("main-ruleset.json");
    const missingQueue = structuredClone(document);
    const queueRules = (missingQueue.ruleset as Record<string, unknown>)
      .rules as Record<string, unknown>[];
    (missingQueue.ruleset as Record<string, unknown>).rules = queueRules.filter(
      (rule) => rule.type !== "merge_queue",
    );
    expect(rulesetErrors(missingQueue)).toContain("merge-queue");

    const renamed = structuredClone(document);
    const renamedRules = (renamed.ruleset as Record<string, unknown>)
      .rules as Record<string, unknown>[];
    const required = renamedRules.find(
      (rule) => rule.type === "required_status_checks",
    )!;
    const statuses = (required.parameters as Record<string, unknown>)
      .required_status_checks as Record<string, unknown>[];
    statuses[0].context = "renamed-check";
    expect(rulesetErrors(renamed)).toContain("required-status-checks");

    const bypass = structuredClone(document);
    (bypass.ruleset as Record<string, unknown>).bypass_actors = [
      { actor_id: 1, actor_type: "RepositoryRole", bypass_mode: "always" },
    ];
    expect(rulesetErrors(bypass)).toContain("bypass-actors");
  });
});
