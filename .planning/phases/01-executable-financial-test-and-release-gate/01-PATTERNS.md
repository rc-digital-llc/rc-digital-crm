# Phase 1: Executable Financial Test and Release Gate - Pattern Map

**Mapped:** 2026-08-25
**Files analyzed:** 53 new/modified/deleted files
**Analogs found:** 43 / 53

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `.github/release/financial-paths.json` | config | transform | `package.json` | format-match |
| `.github/release/release-policy.json` | config | transform | `package.json` | format-match |
| `.github/release/release-receipt.schema.json` | schema/config | transform | no repository JSON Schema | no analog |
| `.github/release/main-ruleset.json` | config | request-response | no repository ruleset export | no analog |
| `.github/workflows/check.yml` | CI config | event-driven | current `.github/workflows/check.yml` | exact |
| `.github/workflows/deploy.yml` | CI config | event-driven | current `.github/workflows/deploy.yml` | exact, unsafe behavior to replace |
| `.github/workflows/financial-release-gate.yml` | CI config | event-driven | `.github/workflows/check.yml` | role-match |
| `.github/workflows/release-build.yml` | CI config | batch | `.github/workflows/deploy.yml` build steps | role-match |
| `.github/workflows/release-promote.yml` | CI config | event-driven | `.github/workflows/deploy.yml` Supabase commands | partial; protection/staging has no analog |
| `.github/workflows/release-enable.yml` | CI config | event-driven | `.github/workflows/deploy.yml` Supabase commands | partial; separate enablement has no analog |
| `scripts/release/validate-config.mjs` | utility | transform | `scripts/generate-registry.mjs` | role-match |
| `scripts/release/run-supabase-lane.mjs` | orchestrator | batch/process | `scripts/supabase-remote-init.mjs` | role-match, local/fail-closed behavior differs |
| `scripts/release/verify-migration-chain.mjs` | utility | batch | `scripts/generate-registry.mjs` | role-match |
| `scripts/release/verify-baseline.mjs` | utility | file-I/O/transform | `scripts/generate-registry.mjs` | role-match |
| `scripts/release/fingerprint-upgrade.mjs` | utility | request-response/transform | `scripts/supabase-remote-init.mjs` | partial |
| `scripts/release/security-gate.mjs` | utility | batch | `scripts/generate-registry.mjs` | role-match |
| `scripts/release/build-receipt.mjs` | utility | transform/file-I/O | `scripts/generate-registry.mjs` | role-match |
| `scripts/release/verify-receipt.mjs` | utility | transform/file-I/O | `scripts/generate-registry.mjs` | role-match |
| `scripts/release/publish-evidence.mjs` | service utility | request-response/file-I/O | `scripts/supabase-remote-init.mjs` | role-match |
| `scripts/release/verify-github-controls.mjs` | service utility | request-response | `scripts/supabase-remote-init.mjs` | role-match |
| `makefile` | command config | batch | current `makefile` | exact |
| `package.json` | package/config | batch | current `package.json` | exact |
| `package-lock.json` | generated lock | package resolution | current `package-lock.json` | exact |
| `vite.config.ts` | build config | transform | current `vite.config.ts` | exact |
| `.gitignore` | security config | file filter | current `.gitignore` | exact |
| `.gitleaks.toml` | security config | file/history scan | no repository Gitleaks config | no analog |
| `.env.development` (delete/untrack) | secret-bearing config | file-I/O | `.env.example` | boundary-match |
| `supabase/functions/.env` (delete/untrack) | secret-bearing config | file-I/O | `.env.example` | boundary-match |
| `supabase/functions/postmark/index.ts` | Edge Function/provider handler | request-response/event-driven | current `supabase/functions/postmark/index.ts` | exact; propagate existing error response |
| `supabase/migrations/20260306000007_attribution_summary_view.sql` | migration/view | batch/read model | same file plus earlier view migrations | exact |
| `supabase/migrations/20260825000001_harden_lead_conversion.sql` | migration/RPC | transactional CRUD | `20260306000004_lead_conversion_function.sql` | exact role; security repairs required |
| `supabase/tests/baselines/001-pre-financial/manifest.json` | immutable fixture manifest | file-I/O/transform | no baseline manifest | no analog |
| `supabase/tests/baselines/001-pre-financial/schema.sql` | schema snapshot | batch | `supabase/migrations/*.sql` | partial |
| `supabase/tests/baselines/001-pre-financial/migration-history.sql` | migration fixture | batch | `supabase/migrations/*.sql` | partial |
| `supabase/tests/baselines/001-pre-financial/fixtures.sql` | test fixture | CRUD/batch | no SQL seed fixture | no analog |
| `supabase/tests/baselines/001-pre-financial/expected-fingerprints.json` | assertion fixture | transform | no fingerprint fixture | no analog |
| `supabase/tests/database/00_schema_contracts.sql` | pgTAP test | batch | TypeScript migration contract tests | partial |
| `supabase/tests/database/10_authorization_rls.sql` | pgTAP test | request-response | `securityChecklist.test.ts` | intent-match only |
| `supabase/tests/database/20_rpc_trigger.sql` | pgTAP test | transactional CRUD | `leadConversion.test.ts`, `attributionTriggers.test.ts` | intent-match only |
| `supabase/tests/support/auth-fixtures.sql` | test fixture | CRUD | no SQL auth fixture | no analog |
| `supabase/tests/support/replay-concurrency.sql` | test fixture | transactional/event-driven | attribution trigger migration | partial |
| `supabase/tests/fixtures/functions.env` | synthetic test config | request-response | `supabase/functions/.env` | format-match; must contain synthetic values only |
| `tests/release/fixtures/postmark-inbound.json` | provider fixture | event-driven | inline payload in `supabase/functions/postmark/index.ts` | exact content analog |
| `tests/release/fixtures/provider-contract.json` | provider contract | event-driven | Postmark handler contract | partial |
| `tests/release/release-policy.test.ts` | Vitest contract test | file-I/O/transform | `securityChecklist.test.ts` | exact test role |
| `tests/release/migration-clean.test.ts` | Vitest integration contract | batch | `leadConversion.test.ts` | partial; must execute rather than inspect strings |
| `tests/release/auth-rls-rpc-trigger.test.ts` | Vitest integration test | request-response | provider tests + Auth middleware | partial |
| `tests/release/edge-webhook-provider.test.ts` | Vitest integration test | request-response/event-driven | Postmark handler and provider specs | partial |
| `tests/release/replay-concurrency.test.ts` | Vitest integration test | event-driven/concurrent | no concurrent test | no analog |
| `tests/release/security-gate.test.ts` | Vitest contract test | file-I/O/transform | `securityChecklist.test.ts` | exact test role |
| `tests/release/receipt.test.ts` | Vitest contract test | transform/file-I/O | domain pure-function tests | role-match |
| `docs/runbooks/financial-release.md` | runbook | sequential procedure | `.github/CONTRIBUTING.md` | prose convention only |
| `docs/runbooks/financial-rollback.md` | runbook | sequential procedure | `.github/CONTRIBUTING.md` | prose convention only |

## Pattern Assignments

### Repository-owned Node scripts

**Applies to:** every `scripts/release/*.mjs` file.

**Analog:** `scripts/generate-registry.mjs`

**Imports and path pattern** (lines 1-10):

```javascript
#!/usr/bin/env node

import { globSync } from "glob";
import fs from "node:fs";
import path from "node:path";

const registryPath = "registry.json";
const basePath = "src";
```

**Deterministic JSON write pattern** (lines 57-75):

```javascript
const newRegistryContent = {
  ...registryContent,
  items: registryContent.items.map((item) => {
    // deterministic transform
  }),
};

fs.writeFileSync(
  registryPath,
  JSON.stringify(newRegistryContent, null, 2),
  "utf-8",
);
```

Copy the ESM style, Node built-in imports, explicit UTF-8 reads/writes, and
two-space JSON serialization. Release scripts must add explicit nonzero exits,
stderr-only redacted errors, schema/policy version checks, stable lexical key
ordering before hashing, and no `console.log` because `AGENTS.md` permits only
`console.warn`/`console.error` in linted JavaScript/TypeScript sources.

### CLI/API orchestration scripts

**Applies to:** `run-supabase-lane.mjs`, `fingerprint-upgrade.mjs`,
`publish-evidence.mjs`, and `verify-github-controls.mjs`.

**Analog:** `scripts/supabase-remote-init.mjs`

**Process execution pattern** (lines 61-80):

```javascript
const { stdout } = await execa(
  "npx",
  ["supabase", "projects", "create", "--output", "json"],
  {
    stdin: "pipe",
    stdout: "pipe",
  },
);
```

**Structured output validation pattern** (lines 84-95):

```javascript
try {
  const matchJSON = stdout.match(new RegExp("{.*}", "s"));
  if (!matchJSON) {
    throw new Error("Invalid JSON output");
  }
  return JSON.parse(matchJSON[0]);
} catch (e) {
  console.error("Failed to create project");
  console.error(e);
  throw e;
}
```

Use the explicit argv-array and structured-output approach, but do not copy the
unbounded retry recursion at lines 191-215 or the use of `npx supabase`. New
release scripts call the pinned `supabase` binary directly, bound every wait,
classify bootstrap errors, redact stderr, and allow exactly one bootstrap retry.

### GitHub check workflows

**Applies to:** `.github/workflows/check.yml` and
`.github/workflows/financial-release-gate.yml`.

**Analog:** current `.github/workflows/check.yml`

**Reusable shape** (lines 1-21 and 48-67):

```yaml
name: ✅ Check
on:
    pull_request:
        types:
            - opened
            - reopened
            - synchronize
            - ready_for_review

concurrency:
    group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
    cancel-in-progress: true

jobs:
    test:
        runs-on: ubuntu-latest
        timeout-minutes: 10
        steps:
            - uses: actions/checkout@v4
            - uses: actions/setup-node@v4
            - run: npm ci
            - run: make test-ci
```

Preserve separate named jobs, timeouts, `npm ci`, and Make entry points. Replace
major-tag action references with reviewed full commit SHAs, reduce default
permissions to `contents: read`, add Node 22 parity, and add
`merge_group: { types: [checks_requested] }` to the full financial workflow.
The six lane job names are API contracts because the ruleset requires them.

### Build and deployment workflows

**Applies to:** `release-build.yml`, `release-promote.yml`,
`release-enable.yml`, and the edited `deploy.yml`.

**Analog:** current `.github/workflows/deploy.yml`

**Existing Supabase command pattern** (lines 132-158):

```yaml
- name: ⚙️ Setup supabase
  uses: supabase/setup-cli@v1
- name: 🔗 Supabase Link
  run: npx supabase link --project-ref $SUPABASE_PROJECT_ID
- name: 📡 Push supabase migrations
  run: npx supabase db push
- name: 📡 Deploy supabase functions
  run: npx supabase functions deploy
```

Reuse the supported Supabase commands only inside protected, separately
dispatched promotion jobs. Do not copy the current `main` push trigger, combined
schema/function/frontend job, broad write permissions, missing-secret warnings,
or rebuild-before-deploy behavior. Missing protected secrets must fail; stage
jobs consume the build digest and predecessor receipt rather than `npm run build`.

### Make command surface

**Applies to:** `makefile`.

**Analog:** current `makefile` lines 9-20 and 54-67.

```make
start-supabase: ## start supabase locally
	npx supabase start

supabase-reset-database: ## reset (and clear!) the database
	npx supabase db reset

test-ci:
	CI=1 npm test

typecheck:
	npm run typecheck
```

Follow the discoverable `target: ## description` convention and keep stable
Make entry points. New financial targets call the pinned `supabase` binary
through `scripts/release/run-supabase-lane.mjs`, never an unpinned `npx`
download, and make destructive scope explicit in target names/help.

### Vitest file-contract tests

**Applies to:** `release-policy.test.ts`, `migration-clean.test.ts`,
`security-gate.test.ts`, and `receipt.test.ts`.

**Analog:** `src/components/atomic-crm/leads/securityChecklist.test.ts`

**Imports/helper pattern** (lines 1-9):

```typescript
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

function readMigration(filename: string): string {
  return fs.readFileSync(path.join(migrationsDir, filename), "utf-8");
}
```

Copy explicit Vitest imports, Node built-in file access, co-located helper
functions, and behavior-named assertions. Unlike the analog's SQL substring
checks, migration/auth tests must invoke the live lane and assert returned
records/statuses/side effects. Source tests remain appropriate for workflow
shape, exact check identities, forbidden triggers, source-map flags, and receipt
schema fields.

### Migration/RPC repair

**Applies to:** `20260306000007_attribution_summary_view.sql` and
`20260825000001_harden_lead_conversion.sql`.

**Analogs:**

- `20260306000007_attribution_summary_view.sql:1-66` for
  `CREATE OR REPLACE VIEW ... WITH (security_invoker=on)` and grouped read-model
  structure.
- `20260306000004_lead_conversion_function.sql:1-55` for the existing RPC
  signature, transaction body, result shape, and known stale-column/security
  defects.
- `.claude/skills/backend-dev/SKILL.md` and `AGENTS.md` for the required secure
  replacement: caller ownership binding, locked `search_path`, schema-qualified
  objects, narrow grants, correct JSONB contact fields, and real cross-owner
  denial tests.

Do not copy the existing unqualified `SECURITY DEFINER` declaration, arbitrary
lead lookup, or removed `contacts.email`/`phone_1_number` writes. Preserve the
public RPC signature/result only where existing frontend callers depend on it.

### Database, RLS, RPC, and trigger tests

**Applies to:** `supabase/tests/database/*.sql` and
`supabase/tests/support/*.sql`.

**Intent analogs:**

- `securityChecklist.test.ts:11-109` names RLS, `security_invoker`, and
  privileged-function properties.
- `leadConversion.test.ts:12-69` enumerates RPC inputs, rejection cases,
  mutations, and output effects.
- `attributionTriggers.test.ts:11-79` enumerates trigger and view behavior.

Translate those named contracts into pgTAP against real database objects.
Test support objects must live under a dedicated test schema, be loaded only by
the lane wrapper, never appear in `supabase/migrations/`, and be dropped during
cleanup.

### Authenticated HTTP integration

**Applies to:** `auth-rls-rpc-trigger.test.ts` and
`edge-webhook-provider.test.ts`.

**Auth analog:** `supabase/functions/_shared/authentication.ts:13-80`

```typescript
const authHeader = req.headers.get("authorization");
const [bearer, token] = authHeader.split(" ");
const { data, error: authError } = await localClient.auth.getUser();
if (!data?.user || authError) {
  return createErrorResponse(401, "Unauthorized");
}
```

**Error response analog:** `supabase/functions/_shared/utils.ts:3-11`

```typescript
export function createErrorResponse(status: number, message: string) {
  return new Response(JSON.stringify({ status, message }), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
    status,
  });
}
```

Tests obtain JWTs from local Auth and send actual `Authorization: Bearer`
headers. Assert HTTP status, redacted response shape, and database effects for
same-owner, cross-owner, missing-token, invalid-token, and rollback cases.

### Webhook/provider fixture and contract

**Applies to:** Postmark/provider fixtures and
`edge-webhook-provider.test.ts`.

**Analog:** `supabase/functions/postmark/index.ts:26-124` and the sample payload
at lines 126-214.

```typescript
response = checkRequestTypeAndHeaders(req);
if (response) return response;

const json = await req.json();
response = checkBody(json);
if (response) return response;

return new Response("OK");
```

Use the checked-in sample shape only after replacing all values with synthetic
ones. Cover missing/unauthorized forwarded IP, non-POST method, incorrect Basic
auth, malformed body, downstream failure, duplicate provider event ID, and
success acknowledgement. The current handler's ignored `addNoteToContact`
response and unused `MessageID` are unsafe precedents; tests must expose them as
current non-financial limitations and the path-ownership policy must require
durability/replay tests for every future financial provider handler.

### Build/source-map configuration

**Applies to:** `vite.config.ts`, `security-gate.mjs`, and
`security-gate.test.ts`.

**Analog:** `vite.config.ts:53-59`

```typescript
esbuild: {
  keepNames: true,
},
build: {
  sourcemap: true,
},
```

Keep the existing Vite config structure but set production source maps to
`false` (or an explicitly private upload mode that leaves no `.map` in the
published artifact). The security gate must scan the built tree as the final
authority; a config assertion alone is insufficient.

## Shared Patterns

### Least-privilege and manual JWT validation

**Source:** `supabase/functions/_shared/authentication.ts`,
`.claude/skills/backend-dev/SKILL.md`, `supabase/config.toml`.

**Apply to:** database HTTP tests, Edge tests, promotion workflows, and any RPC
repair. Browser visibility is never authorization. Workflows default to
`contents: read`; only attestation jobs receive OIDC/attestation write, and only
protected promotion jobs receive production environment secrets.

### Fail-closed error handling

**Source:** `supabase/functions/_shared/utils.ts` plus D-04/D-13.

**Apply to:** every release script and workflow. Throw or exit nonzero on an
invalid schema, missing receipt, failed predecessor check, public evidence
destination, missing secret, expired exception, or non-overridable failure.
Never turn a swallowed response or warning-only deployment skip into success.

### Deterministic synthetic fixtures

**Source:** D-05 through D-08 and the sample Postmark payload.

**Apply to:** baseline SQL, Auth fixtures, provider payloads, and concurrency
support. Fixed IDs/timestamps/currency strings and canonical ordering are
required. Never read production dumps or customer values.

### Exact action/tool pinning

**Source:** RESEARCH.md Standard Stack.

**Apply to:** all workflows. Pin GitHub Actions to reviewed full commit SHAs
with an adjacent release comment, Supabase CLI to 2.115.0, and Node to 22.

## No Analog Found

| File/Concern | Role | Data Flow | Required Research Pattern |
|--------------|------|-----------|---------------------------|
| `release-receipt.schema.json` | JSON Schema | transform | D-15 field list and RESEARCH.md canonical receipt guidance. |
| `main-ruleset.json` | repository control export | request-response | GitHub ruleset/merge queue official API and exact six check identities. |
| Baseline manifest/history/fingerprint files | immutable test baseline | file-I/O/batch | D-05 through D-08 and RESEARCH.md Pattern 3. |
| pgTAP SQL tests | live DB tests | batch/request-response | Supabase `test db` official docs and RESEARCH.md Validation Architecture. |
| Replay/concurrency suite | concurrent integration test | event-driven | RESEARCH.md Pattern 5 and D-04/D-13. |
| Private evidence publication | release evidence service | request-response/file-I/O | RESEARCH.md Pattern 6; reject public repository visibility. |
| Protected environment/ruleset verification | repository control service | request-response | GitHub protected environment and merge queue official docs. |

## Metadata

**Analog search scope:** `.github/workflows/`, `scripts/`, `makefile`,
`package.json`, `vite.config.ts`, `supabase/migrations/`,
`supabase/functions/`, and existing Vitest migration/security tests.

**Files scanned:** 18 primary analog/config files plus migration/function/test
inventories.

**Pattern extraction date:** 2026-08-25
