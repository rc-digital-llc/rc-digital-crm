#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");
const rulesetPath = path.join(
  repositoryRoot,
  ".github/release/main-ruleset.json",
);
const policyPath = path.join(
  repositoryRoot,
  ".github/release/release-policy.json",
);
const environmentsPath = path.join(
  repositoryRoot,
  ".github/release/protected-environments.json",
);
const apiVersion = "2022-11-28";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stable(child)]),
    );
  }
  return value;
}

function selectedParameters(type, parameters = {}) {
  if (type === "required_status_checks") {
    return {
      do_not_enforce_on_create: parameters.do_not_enforce_on_create,
      required_status_checks: [...(parameters.required_status_checks ?? [])]
        .map((status) => ({
          context: status.context,
          integration_id: status.integration_id,
        }))
        .sort((left, right) => left.context.localeCompare(right.context)),
      strict_required_status_checks_policy:
        parameters.strict_required_status_checks_policy,
    };
  }
  if (type === "pull_request") {
    return {
      allowed_merge_methods: [
        ...(parameters.allowed_merge_methods ?? []),
      ].sort(),
      automatic_copilot_code_review_enabled:
        parameters.automatic_copilot_code_review_enabled ?? false,
      dismiss_stale_reviews_on_push: parameters.dismiss_stale_reviews_on_push,
      require_code_owner_review: parameters.require_code_owner_review,
      require_last_push_approval: parameters.require_last_push_approval,
      required_approving_review_count:
        parameters.required_approving_review_count,
      required_review_thread_resolution:
        parameters.required_review_thread_resolution,
    };
  }
  if (type === "merge_queue") {
    return {
      check_response_timeout_minutes: parameters.check_response_timeout_minutes,
      grouping_strategy: parameters.grouping_strategy,
      max_entries_to_build: parameters.max_entries_to_build,
      max_entries_to_merge: parameters.max_entries_to_merge,
      merge_method: parameters.merge_method,
      min_entries_to_merge: parameters.min_entries_to_merge,
      min_entries_to_merge_wait_minutes:
        parameters.min_entries_to_merge_wait_minutes,
    };
  }
  return undefined;
}

export function normalizeRuleset(ruleset) {
  return stable({
    name: ruleset?.name,
    target: ruleset?.target,
    enforcement: ruleset?.enforcement,
    bypass_actors: (ruleset?.bypass_actors ?? []).map((actor) => ({
      actor_id: actor.actor_id,
      actor_type: actor.actor_type,
      bypass_mode: actor.bypass_mode,
    })),
    conditions: {
      ref_name: {
        include: [...(ruleset?.conditions?.ref_name?.include ?? [])].sort(),
        exclude: [...(ruleset?.conditions?.ref_name?.exclude ?? [])].sort(),
      },
    },
    rules: [...(ruleset?.rules ?? [])]
      .map((rule) => {
        const parameters = selectedParameters(rule.type, rule.parameters);
        return parameters
          ? { type: rule.type, parameters }
          : { type: rule.type };
      })
      .sort((left, right) => left.type.localeCompare(right.type)),
  });
}

function loadIntent() {
  const document = JSON.parse(fs.readFileSync(rulesetPath, "utf8"));
  const policy = JSON.parse(fs.readFileSync(policyPath, "utf8"));
  if (
    document.version !== "1.0.0" ||
    typeof document.repository !== "string" ||
    !document.ruleset
  ) {
    throw new Error("main ruleset intent is invalid");
  }
  const expectedChecks = [
    ...policy.required_checks.fast,
    ...policy.required_checks.financial,
  ].sort();
  const normalized = normalizeRuleset(document.ruleset);
  const statusRule = normalized.rules.find(
    (rule) => rule.type === "required_status_checks",
  );
  const actualChecks = (
    statusRule?.parameters?.required_status_checks ?? []
  ).map((status) => status.context);
  if (JSON.stringify(actualChecks) !== JSON.stringify(expectedChecks)) {
    throw new Error("main ruleset checks differ from release policy");
  }
  if (
    statusRule.parameters.required_status_checks.some(
      (status) => status.integration_id !== 15368,
    )
  ) {
    throw new Error("main ruleset checks are not bound to GitHub Actions");
  }
  if (normalized.bypass_actors.length !== 0) {
    throw new Error("main ruleset financial bypass actors are forbidden");
  }
  return document;
}

function loadEnvironmentIntent() {
  const intent = JSON.parse(fs.readFileSync(environmentsPath, "utf8"));
  if (
    intent.version !== "1.0.0" ||
    typeof intent.repository !== "string" ||
    typeof intent.required_reviewer_login !== "string" ||
    !Array.isArray(intent.environments) ||
    intent.environments.length !== 2
  ) {
    throw new Error("protected environment intent is invalid");
  }
  const names = intent.environments.map(({ name }) => name).sort();
  if (
    JSON.stringify(names) !==
    JSON.stringify(["production-financial-enable", "production-release"])
  ) {
    throw new Error("protected environment names are invalid");
  }
  return intent;
}

function environmentErrors(environment, secrets, intent, reviewerLogin) {
  const errors = [];
  const requiredReviewers = environment?.protection_rules?.find(
    ({ type }) => type === "required_reviewers",
  );
  const reviewerPresent = requiredReviewers?.reviewers?.some(
    ({ reviewer }) =>
      reviewer?.type === "User" &&
      reviewer?.login?.toLowerCase() === reviewerLogin.toLowerCase(),
  );
  if (!reviewerPresent)
    errors.push("required release-owner reviewer is missing");
  if (requiredReviewers?.prevent_self_review !== true) {
    errors.push("self-review prevention is not enabled");
  }
  if (environment?.can_admins_bypass !== false) {
    errors.push("administrator protection-rule bypass is enabled");
  }
  if (
    environment?.deployment_branch_policy?.protected_branches !== true ||
    environment?.deployment_branch_policy?.custom_branch_policies !== false
  ) {
    errors.push("environment is not limited to protected branches");
  }
  const secretNames = new Set(
    (secrets?.secrets ?? []).map(({ name }) => String(name)),
  );
  for (const secret of intent.required_secrets) {
    if (!secretNames.has(secret))
      errors.push(`required secret is missing: ${secret}`);
  }
  return errors;
}

export async function checkEnvironmentControls({ api, intent }) {
  const errors = [];
  const reports = [];
  for (const expected of intent.environments) {
    let environment;
    let secrets;
    try {
      environment = await api.request(
        "GET",
        `/repos/${intent.repository}/environments/${expected.name}`,
      );
      secrets = await api.request(
        "GET",
        `/repos/${intent.repository}/environments/${expected.name}/secrets?per_page=100`,
      );
    } catch {
      errors.push(
        `${expected.name}: environment or secret inventory is unavailable`,
      );
      continue;
    }
    const currentErrors = environmentErrors(
      environment,
      secrets,
      expected,
      intent.required_reviewer_login,
    );
    errors.push(...currentErrors.map((error) => `${expected.name}: ${error}`));
    reports.push({
      name: expected.name,
      protection_sha256: sha256(
        JSON.stringify(
          stable({
            protection_rules: environment.protection_rules,
            can_admins_bypass: environment.can_admins_bypass,
            deployment_branch_policy: environment.deployment_branch_policy,
            secret_names: [...(secrets?.secrets ?? [])]
              .map(({ name }) => name)
              .sort(),
          }),
        ),
      ),
    });
  }
  if (errors.length > 0) throw new Error(errors.join("; "));
  return { repository: intent.repository, environments: reports };
}

export function repositoryCapabilityErrors(repository, expectedRepository) {
  const errors = [];
  if (repository?.full_name !== expectedRepository) {
    errors.push("repository identity mismatch");
  }
  if (repository?.default_branch !== "main") {
    errors.push("repository default branch is not main");
  }
  if (repository?.owner?.type !== "Organization") {
    errors.push(
      "merge queue unsupported: repository must be organization-owned",
    );
  }
  return errors;
}

export function compareLiveRuleset(intentRuleset, liveRuleset) {
  if (!liveRuleset) return ["named main ruleset is missing"];
  const expected = JSON.stringify(normalizeRuleset(intentRuleset));
  const actual = JSON.stringify(normalizeRuleset(liveRuleset));
  return expected === actual ? [] : ["named main ruleset differs from intent"];
}

class GhApi {
  async request(method, endpoint, body) {
    const args = [
      "api",
      "--method",
      method,
      endpoint,
      "--header",
      "Accept: application/vnd.github+json",
      "--header",
      `X-GitHub-Api-Version: ${apiVersion}`,
    ];
    if (body !== undefined) args.push("--input", "-");
    const result = spawnSync("gh", args, {
      cwd: repositoryRoot,
      encoding: "utf8",
      input: body === undefined ? undefined : JSON.stringify(body),
      shell: false,
      timeout: 30000,
    });
    if (result.status !== 0) {
      throw new Error(
        `GitHub API ${method} ${endpoint} failed with status ${result.status}`,
      );
    }
    return result.stdout.trim() ? JSON.parse(result.stdout) : null;
  }
}

async function readLiveState(api, intent) {
  const repository = await api.request("GET", `/repos/${intent.repository}`);
  const listed = await api.request(
    "GET",
    `/repos/${intent.repository}/rulesets?includes_parents=false`,
  );
  const matches = listed.filter(
    (candidate) => candidate.name === intent.ruleset.name,
  );
  if (matches.length > 1) {
    throw new Error("multiple named main rulesets exist");
  }
  const liveRuleset = matches[0]
    ? await api.request(
        "GET",
        `/repos/${intent.repository}/rulesets/${matches[0].id}`,
      )
    : undefined;
  return { repository, liveRuleset };
}

export async function checkControls({ api, intent }) {
  const live = await readLiveState(api, intent);
  const errors = [
    ...repositoryCapabilityErrors(live.repository, intent.repository),
    ...compareLiveRuleset(intent.ruleset, live.liveRuleset),
  ];
  if (errors.length > 0) throw new Error(errors.join("; "));
  return {
    repository: intent.repository,
    ruleset: intent.ruleset.name,
    report_sha256: sha256(JSON.stringify(normalizeRuleset(live.liveRuleset))),
  };
}

export async function applyControls({ api, intent }) {
  const repository = await api.request("GET", `/repos/${intent.repository}`);
  const capabilityErrors = repositoryCapabilityErrors(
    repository,
    intent.repository,
  );
  if (capabilityErrors.length > 0) {
    throw new Error(capabilityErrors.join("; "));
  }
  if (repository?.permissions?.admin !== true) {
    throw new Error("GitHub ruleset apply requires repository admin authority");
  }

  const listed = await api.request(
    "GET",
    `/repos/${intent.repository}/rulesets?includes_parents=false`,
  );
  const matches = listed.filter(
    (candidate) => candidate.name === intent.ruleset.name,
  );
  if (matches.length > 1) {
    throw new Error("multiple named main rulesets exist");
  }
  const before = matches[0]
    ? await api.request(
        "GET",
        `/repos/${intent.repository}/rulesets/${matches[0].id}`,
      )
    : undefined;
  process.stdout.write(
    `${JSON.stringify({
      operation: matches[0] ? "update" : "create",
      ruleset: intent.ruleset.name,
      before_sha256: before
        ? sha256(JSON.stringify(normalizeRuleset(before)))
        : null,
      after_sha256: sha256(JSON.stringify(normalizeRuleset(intent.ruleset))),
    })}\n`,
  );

  const applied = matches[0]
    ? await api.request(
        "PUT",
        `/repos/${intent.repository}/rulesets/${matches[0].id}`,
        intent.ruleset,
      )
    : await api.request(
        "POST",
        `/repos/${intent.repository}/rulesets`,
        intent.ruleset,
      );
  const readback = await api.request(
    "GET",
    `/repos/${intent.repository}/rulesets/${applied.id}`,
  );
  const errors = compareLiveRuleset(intent.ruleset, readback);
  if (errors.length > 0) {
    throw new Error(`GitHub ruleset readback failed: ${errors.join("; ")}`);
  }
  return {
    repository: intent.repository,
    ruleset_id: applied.id,
    report_sha256: sha256(JSON.stringify(normalizeRuleset(readback))),
  };
}

class FakeApi {
  constructor({ repository, ruleset, admin = true }) {
    this.repository = {
      full_name: "rc-digital-llc/rc-digital-crm",
      default_branch: "main",
      owner: { type: "Organization" },
      permissions: { admin },
      ...repository,
    };
    this.ruleset = ruleset;
    this.mutations = 0;
  }

  async request(method, endpoint, body) {
    if (endpoint === "/repos/rc-digital-llc/rc-digital-crm") {
      return this.repository;
    }
    if (endpoint.includes("/rulesets?")) {
      return this.ruleset ? [{ id: 42, name: this.ruleset.name }] : [];
    }
    if (method === "GET" && endpoint.endsWith("/rulesets/42")) {
      return { id: 42, ...this.ruleset };
    }
    if (["POST", "PUT"].includes(method)) {
      this.mutations += 1;
      this.ruleset = structuredClone(body);
      return { id: 42, ...this.ruleset };
    }
    throw new Error(`unexpected fake API call: ${method} ${endpoint}`);
  }
}

async function selfTest() {
  const intent = loadIntent();
  await checkControls({
    api: new FakeApi({ ruleset: structuredClone(intent.ruleset) }),
    intent,
  });

  await expectFailure(
    checkControls({ api: new FakeApi({}), intent }),
    /missing/,
  );

  const renamed = structuredClone(intent.ruleset);
  renamed.rules.find(
    (rule) => rule.type === "required_status_checks",
  ).parameters.required_status_checks[0].context = "renamed";
  await expectFailure(
    checkControls({ api: new FakeApi({ ruleset: renamed }), intent }),
    /differs/,
  );

  const noQueue = structuredClone(intent.ruleset);
  noQueue.rules = noQueue.rules.filter((rule) => rule.type !== "merge_queue");
  await expectFailure(
    checkControls({ api: new FakeApi({ ruleset: noQueue }), intent }),
    /differs/,
  );

  const serverElidedDefaults = structuredClone(intent.ruleset);
  delete serverElidedDefaults.rules.find(
    (rule) => rule.type === "pull_request",
  ).parameters.automatic_copilot_code_review_enabled;
  if (compareLiveRuleset(intent.ruleset, serverElidedDefaults).length > 0) {
    throw new Error("server-elided false defaults caused ruleset drift");
  }

  const unauthorized = new FakeApi({ admin: false });
  await expectFailure(
    applyControls({ api: unauthorized, intent }),
    /admin authority/,
  );
  if (unauthorized.mutations !== 0) {
    throw new Error("unauthorized fake apply mutated state");
  }

  const drift = structuredClone(intent.ruleset);
  drift.enforcement = "disabled";
  await expectFailure(
    checkControls({ api: new FakeApi({ ruleset: drift }), intent }),
    /differs/,
  );

  const exactApply = new FakeApi({});
  await applyControls({ api: exactApply, intent });
  if (exactApply.mutations !== 1) {
    throw new Error("exact fake apply did not mutate once");
  }
  await checkControls({ api: exactApply, intent });
  const environmentIntent = loadEnvironmentIntent();
  const environmentsByName = Object.fromEntries(
    environmentIntent.environments.map((environment) => [
      environment.name,
      {
        name: environment.name,
        protection_rules: [
          {
            type: "required_reviewers",
            prevent_self_review: true,
            reviewers: [
              {
                type: "User",
                reviewer: {
                  type: "User",
                  login: environmentIntent.required_reviewer_login,
                },
              },
            ],
          },
        ],
        can_admins_bypass: false,
        deployment_branch_policy: {
          protected_branches: true,
          custom_branch_policies: false,
        },
        secrets: environment.required_secrets.map((name) => ({ name })),
      },
    ]),
  );
  const environmentApi = {
    async request(_method, endpoint) {
      const name = environmentIntent.environments.find(({ name: candidate }) =>
        endpoint.includes(`/environments/${candidate}`),
      )?.name;
      if (!name) throw new Error("unexpected fake environment request");
      if (endpoint.includes("/secrets")) {
        return { secrets: environmentsByName[name].secrets };
      }
      return environmentsByName[name];
    },
  };
  await checkEnvironmentControls({
    api: environmentApi,
    intent: environmentIntent,
  });
  process.stdout.write("GitHub controls self-test: PASS\n");
}

async function expectFailure(promise, pattern) {
  try {
    await promise;
  } catch (error) {
    if (pattern.test(error instanceof Error ? error.message : String(error))) {
      return;
    }
    throw error;
  }
  throw new Error("expected fake GitHub controls failure");
}

async function main() {
  const mode = process.argv[2] ?? "--check";
  if (mode === "--self-test") {
    await selfTest();
    return;
  }
  const api = new GhApi();
  if (mode === "--check-environments") {
    const result = await checkEnvironmentControls({
      api,
      intent: loadEnvironmentIntent(),
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  const intent = loadIntent();
  const result =
    mode === "--check"
      ? await checkControls({ api, intent })
      : mode === "--apply"
        ? await applyControls({ api, intent })
        : (() => {
            throw new Error(
              "usage: verify-github-controls.mjs --check|--check-environments|--apply|--self-test",
            );
          })();
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

try {
  await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "error"}\n`);
  process.exitCode = 1;
}
