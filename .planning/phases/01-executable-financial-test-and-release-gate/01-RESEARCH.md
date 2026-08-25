# Phase 1: Executable Financial Test and Release Gate - Research

**Researched:** 2026-08-25
**Domain:** Supabase integration testing, GitHub merge/release controls, and financial release evidence
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### CI Execution Policy

- **D-01:** Every ready-for-review pull request runs fast baseline checks.
  Relevant financial paths trigger the expensive financial lanes immediately,
  but path filters are only an early-feedback optimization: every merge must
  pass a fresh complete financial release suite in a protected pre-merge gate.
- **D-02:** Financial verification is split into independently blocking lanes:
  clean migration, representative upgrade, database authorization/RLS/RPC/
  trigger behavior, Edge Function and webhook contracts, concurrency/replay,
  and release/security policy. One aggregate green label cannot hide a failed
  lane.
- **D-03:** Database and Edge Function tests run against an isolated, pinned
  local Supabase/PostgreSQL/Edge environment created from the repository for
  each CI run. A shared remote project or developer machine is never test
  authority.
- **D-04:** Financial assertion failures never auto-retry to green. One
  recorded retry is allowed only for a classified environment-bootstrap
  failure. Quarantine cannot remove a financial gate without the narrow,
  expiring exception contract below.

#### Upgrade Baseline

- **D-05:** The migration gate tests both a clean database and an immutable
  repository-defined pre-billing baseline representing the committed schema
  before new financial migrations.
- **D-06:** Upgrade data is deterministic, synthetic, and production-like. It
  covers legacy mutable invoices, ownership relationships, null/orphan edge
  cases, boundary values, non-ASCII values, and representative project and
  attribution records. Real customer data and generic production dumps are
  prohibited.
- **D-07:** An accepted baseline is never rewritten. A new versioned baseline
  is added only at an approved schema milestone, and earlier upgrade paths are
  retained for as long as policy requires them.
- **D-08:** Upgrade assertions preserve row identity, counts, ownership,
  financial values, hashes, constraints, grants, and queryability. Destructive
  or ambiguous changes fail. Database rollback defaults to a forward-compatible
  correction with the feature disabled, not a destructive down migration.

#### Release Control

- **D-09:** Pull requests may create isolated previews, and merges may build
  and attest immutable artifacts. A change to `main` alone must not promote
  Supabase or a customer-facing financial release to production.
- **D-10:** Production promotion follows expand-contract order: compatible
  schema expansion, backward-compatible Edge Functions, frontend artifact,
  then a dormant financial feature. Each stage verifies compatibility and
  emits a receipt before the next stage starts.
- **D-11:** A protected production environment requires authenticated
  release-owner approval before promotion. Enabling a financial feature is a
  separate explicit approval after all stage receipts pass.
- **D-12:** Frontend and functions roll back to pinned known-good artifacts.
  Database failure normally produces a forward-safe repair while the feature
  remains disabled. Destructive migration reversal or database restoration is
  reserved for an authorized incident procedure with verified backup evidence.

#### Exceptions and Release Receipts

- **D-13:** The following gates are non-overridable for financial promotion or
  enablement: clean/upgrade migration, authorization/RLS/RPC, secret exposure,
  public production source maps, financial replay/concurrency/provider
  contracts, and unresolved critical/high production dependency
  vulnerabilities.
- **D-14:** Only an unrelated non-financial or classified infrastructure issue
  may receive a temporary exception. It requires an authenticated release
  owner, linked issue, affected scope, rationale, compensating controls, and a
  maximum seven-day expiry that automatically re-blocks.
- **D-15:** Every release receipt uses a versioned machine-readable schema and
  records commit SHA, artifact digests, migration range and hashes, required
  check identities/results, test and security report hashes, target
  environment, feature-flag state, approvals, timestamps, exceptions, and
  rollback references.
- **D-16:** The authoritative receipt is a content-addressed signed or attested
  manifest retained in durable private release evidence and linked from the
  protected deployment record. Disposable CI logs are diagnostics, not proof.

### the agent's Discretion

The user explicitly delegated the detailed choices for all four areas. The
planner may choose exact script names, job names, fixture serialization,
parallel job layout, and the currently supported signing/attestation and
durable storage mechanism, provided D-01 through D-16 remain true. In
particular, implementation convenience may not weaken the fresh full pre-merge
gate, non-overridable financial blockers, seven-day exception expiry, or
content-addressed receipt contract.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within Phase 1 scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REL-01 | Apply the complete migration chain cleanly and upgrade a production-like prior schema without losing or silently rewriting financial facts. | Separate clean-replay and immutable-baseline upgrade lanes; canonical before/after data and schema fingerprints. |
| REL-02 | Execute PostgreSQL, RLS, RPC, trigger, Edge Function, webhook, concurrency, and provider-contract tests under representative authenticated claims. | pgTAP plus HTTP-level Vitest suites against isolated local Auth, PostgREST, PostgreSQL, Storage, and Edge Runtime. |
| REL-03 | Block money-bearing changes unless executable migration, authorization, replay, and failure-path tests pass. | Financial path classification for early PR feedback plus six always-fresh `merge_group` required checks. |
| REL-04 | Deploy schema, functions, frontend, and dormant features as independently verified expand-contract stages with flags, rollback instructions, and immutable receipts. | Build-only main workflow, separately dispatched protected stage promotion, separate enablement, stage receipt chain, and rollback runbook. |
| REL-05 | Block unresolved critical/high production vulnerabilities, public source maps, secret exposure, and unsafe deployment coupling. | `npm audit --omit=dev --audit-level=high`, Gitleaks full-history/diff scans, production bundle map scan, and workflow-policy tests. |
</phase_requirements>

## Summary

Phase 1 should create a repository-owned release contract, not merely add more
unit tests. The existing CI runs lint, Vitest, and a frontend build; the current
deployment workflow pushes migrations, deploys all functions, builds the
frontend, and publishes it after every `main` push. The existing migration and
security tests inspect SQL text rather than running PostgreSQL authorization or
function behavior. [VERIFIED: `.github/workflows/check.yml`,
`.github/workflows/deploy.yml`, `.planning/codebase/TESTING.md`, and
`src/components/atomic-crm/leads/securityChecklist.test.ts`]

Use the existing stack: a pinned Supabase CLI and Docker-provisioned local
stack, pgTAP for database contracts, Vitest/Node `fetch` for HTTP contracts,
Node built-ins for deterministic hashing and policy validation, and GitHub
Actions for merge-queue and protected-environment gates. Supabase officially
supports fresh local database replay, pgTAP tests, and local function serving;
GitHub's `merge_group` event exists specifically so required checks rerun for a
merge-queue candidate. [CITED: https://github.com/supabase/cli/blob/develop/apps/cli/docs/go-cli-reference.md]
[CITED: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows]

The source repository and the configured fork are public, while D-16 requires
private evidence. Release receipts and detailed security reports therefore
must be copied to a separate private GitHub evidence repository (or an
equivalent owner-approved private destination) after its visibility is verified
through the API. The public source repository may retain only schemas,
redacted summaries, and content hashes. [VERIFIED: `gh repo view
marmelab/atomic-crm` and `gh repo view Rconman99/atomic-crm`, 2026-08-25]

**Primary recommendation:** implement six independently required financial
lanes, make `merge_group` the fresh full-suite authority, then replace automatic
production mutation on `main` with attested build, protected stage promotion,
and separately approved feature enablement.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Clean and upgrade migration proof | Database / Storage | CI orchestration | PostgreSQL owns schema/data truth; CI creates disposable authority and collects results. |
| RLS, RPC, and trigger authorization proof | Database / Storage | Auth/PostgREST boundary | Policies and functions enforce access in PostgreSQL; HTTP claims prove the real boundary. |
| Edge Function and webhook contracts | API / Backend | Database / Storage | The running Edge Runtime validates requests and persists effects; browser checks are not authority. |
| Replay and concurrency proof | Database / Storage | API / Backend | Unique/transactional invariants must survive simultaneous and duplicated requests. |
| Required-check and exception policy | CI / Release control | GitHub repository settings | Workflow jobs produce evidence; branch rules make their exact check identities mandatory. |
| Artifact build and attestation | CI / Release control | Private evidence store | CI builds once and hashes/attests; the private store retains authoritative evidence. |
| Schema/function/frontend promotion | Protected deployment environment | Supabase / frontend host | Promotion consumes pinned artifacts only after approval and predecessor receipts. |
| Financial feature enablement | Protected deployment environment | Runtime flag store | Enablement is a distinct owner-approved mutation after all stage receipts exist. |

## Project Constraints (from AGENTS.md)

- Use Node 22, npm, Docker, Supabase CLI, PostgreSQL 15, Vitest, SQL/PLpgSQL,
  and Deno-compatible TypeScript already established by the repository.
  [VERIFIED: `AGENTS.md`, `.nvmrc`, `package.json`, `supabase/config.toml`]
- There is no custom backend server; server-side behavior belongs in Supabase
  PostgreSQL, Auth, Storage, and Edge Functions. [VERIFIED: `.claude/skills/backend-dev/SKILL.md`]
- New tables require RLS and the repository's ownership-trigger convention;
  Edge Functions use shared helpers, CORS followed by authentication, and
  explicit manual JWT verification because `verify_jwt = false`. [VERIFIED:
  `.claude/skills/backend-dev/SKILL.md`, `supabase/config.toml`]
- The financial anti-pattern fence forbids unsecured `SECURITY DEFINER`,
  client-controlled provider identity, pre-durability webhook acknowledgement,
  replay acceptance, and swallowed errors reported as success. [VERIFIED:
  `AGENTS.md` GSD project constraints]
- Preserve unrelated dirty files and stage only exact Phase 1 artifacts.
  [VERIFIED: `.planning/STATE.md` and current `git status --short`]

## Standard Stack

### Core

| Tool | Pinned Target | Purpose | Evidence |
|------|---------------|---------|----------|
| Node.js | 22.x | Repository scripts, Vitest HTTP tests, hashing, JSON Schema/policy validation | [VERIFIED: `.nvmrc`, `AGENTS.md`] |
| Supabase CLI | 2.115.0 | Disposable local stack, migration replay, pgTAP, function serving, and remote promotion | [VERIFIED: official `supabase/cli` release v2.115.0, 2026-08-18] |
| PostgreSQL | 15 | Authoritative migration/RLS/RPC/trigger test engine | [VERIFIED: `supabase/config.toml`] |
| pgTAP through `supabase test db` | Supabase-provisioned | SQL assertions against the running local database | [CITED: https://github.com/supabase/cli/blob/develop/apps/cli/docs/go-cli-reference.md] |
| Vitest | 3.2.4 | Auth/PostgREST/Edge/webhook/provider/replay HTTP integration tests | [VERIFIED: `package.json`, `package-lock.json`] |
| GitHub Actions | hosted runner contract | PR, merge queue, build, protected promotion, and deployment receipts | [CITED: https://docs.github.com/en/actions]

### Supporting

| Tool/action | Pinned Target | Purpose | Evidence |
|-------------|---------------|---------|----------|
| `supabase/setup-cli` | v3.0.0 action pinned to full commit SHA; `version: 2.115.0` | Reproducible Supabase CLI install in CI | [VERIFIED: official action release and README, 2026-08-25] |
| `actions/attest` | v4.2.2 pinned to full commit SHA | GitHub OIDC-backed artifact/manifest attestation | [CITED: https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations] |
| `actions/upload-artifact` | v7.0.1 pinned to full commit SHA | Non-authoritative run diagnostics; never the sole receipt store | [VERIFIED: official action release, 2026-04-10] |
| `actions/dependency-review-action` | v5.0.0 pinned to full commit SHA | PR dependency-delta review, supplementing the full production audit | [VERIFIED: official action release, 2026-05-08] |
| Gitleaks | 8.30.1 / action v3.0.0 pinned to full commit SHA | Redacted current-tree and Git-history secret detection | [VERIFIED: official Gitleaks releases and README, 2026-08-25] |
| npm audit | npm 12 CLI | Blocking critical/high production dependency advisory check | [CITED: https://github.com/npm/cli/blob/latest/docs/lib/content/commands/npm-audit.md] |
| GitHub CLI | runner-provided; local 2.97.0 | Ruleset/environment verification and private evidence release upload | [VERIFIED: local environment audit, 2026-08-25] |

No new npm runtime or development package is required. Use Node built-ins
(`node:crypto`, `node:fs`, `node:test` only where Vitest is not needed), the
existing Vitest install, pgTAP supplied by the local Supabase database, and
reviewed GitHub Actions. [VERIFIED: repository manifest and official Supabase
CLI documentation]

## Package Legitimacy Audit

No new npm/PyPI/crates package is introduced by this phase. Existing package
upgrades performed to clear critical/high advisories remain subject to lockfile
review, `npm ci`, registry integrity metadata, `npm audit`, the complete test
suite, and build verification. GitHub Actions and standalone CLIs must be pinned
to reviewed full commit SHAs or exact releases in workflow files. [VERIFIED:
`package-lock.json`; cited npm audit documentation]

**Packages removed due to slopcheck `[SLOP]` verdict:** none.
**Packages flagged as suspicious `[SUS]`:** none.

## Architecture Patterns

### System Architecture Diagram

```text
ready PR ──> fast lint/type/unit/build
    │
    ├── financial path? ──yes──> six isolated early financial lanes
    │
    └── merge queue candidate (`merge_group`)
                              │
                              └──> six fresh required financial lanes
                                     │
                                     └──all green──> merge

main commit ──> build once ──> digests + attestation + private evidence
                                      │
release owner dispatch/approval ──────┘
    │
    ├── schema expand receipt
    ├── backward-compatible functions receipt
    ├── pinned frontend receipt
    └── dormant feature receipt
              │
separate owner approval ──> enable named feature flag ──> final receipt

any invariant failure ──> stop/demote/disable ──> forward DB repair or
                            pinned function/frontend rollback
```

### Recommended Project Structure

```text
.github/
├── release/
│   ├── financial-paths.json
│   ├── release-policy.json
│   ├── release-receipt.schema.json
│   └── main-ruleset.json
└── workflows/
    ├── check.yml
    ├── financial-release-gate.yml
    ├── release-build.yml
    ├── release-promote.yml
    └── release-enable.yml
docs/runbooks/
├── financial-release.md
└── financial-rollback.md
scripts/release/
├── classify-paths.mjs
├── run-supabase-lane.mjs
├── verify-baseline.mjs
├── fingerprint-upgrade.mjs
├── verify-release-policy.mjs
├── build-receipt.mjs
└── verify-receipt.mjs
supabase/tests/
├── baselines/001-pre-financial/
│   ├── manifest.json
│   ├── schema.sql
│   ├── migration-history.sql
│   └── fixtures.sql
├── database/
└── support/
tests/release/
├── auth-rls-rpc-trigger.test.ts
├── edge-webhook-provider.test.ts
├── replay-concurrency.test.ts
└── release-policy.test.ts
```

### Pattern 1: Fresh merge-queue authority

Run fast baseline jobs on every ready PR. Use a checked-in path classifier to
trigger the same expensive lanes early for financial changes, but run all six
lanes unconditionally on `merge_group: checks_requested`. Configure the main
ruleset to require each named lane, not only a summary job. GitHub documents
that workflows with required PR checks must also subscribe to `merge_group` or
the checks do not run for the queued merge candidate. [CITED:
https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows]

### Pattern 2: One disposable Supabase authority per lane

Every financial job checks out the exact SHA, installs Supabase CLI 2.115.0,
starts a fresh local stack, and stops it in an `always()` cleanup step. A shared
bootstrap wrapper may retry `supabase start` once only when a machine-readable
classification identifies an environment bootstrap error; the wrapper must
never retry a test assertion or migration failure. [CITED:
https://github.com/supabase/setup-cli/blob/main/README.md]
[CITED: https://github.com/supabase/cli/blob/develop/apps/cli/docs/go-cli-reference.md]

### Pattern 3: Clean replay plus immutable upgrade snapshot

The clean lane runs the complete ordered migration chain on a blank local
database. The upgrade lane loads the accepted `001-pre-financial` application
schema, migration-history rows, and synthetic fixtures into a separate fresh
stack, fingerprints canonical query output before migration, applies only
pending migrations, then repeats the fingerprints and contract assertions.
The manifest contains SHA-256 hashes for every baseline file and the accepted
migration cutoff; changing an accepted file fails the baseline-verification
test. [VERIFIED: D-05 through D-08; Node `node:crypto` is in the selected stack]

The current chain contains known clean-replay blockers: lead conversion writes
removed contact columns, and `customer_journeys` references removed
`contacts.email`. Phase execution must first classify whether those historical
migrations were ever accepted remotely. Unaccepted broken files may be
corrected before baseline acceptance; accepted history requires a compatible
baseline/squash or explicit forward-repair strategy without falsifying hashes.
[VERIFIED: `20260306000004_lead_conversion_function.sql`,
`20260306000007_attribution_summary_view.sql`, and
`.planning/codebase/CONCERNS.md`]

### Pattern 4: Claims at both SQL and HTTP boundaries

Use pgTAP for grants, constraints, policies, RPCs, and triggers, including
`SET LOCAL ROLE authenticated` and synthetic `request.jwt.claims`. Also create
synthetic Auth users through the local Auth API, obtain real JWTs, and exercise
PostgREST, RPC, Storage where relevant, and Edge Function URLs through HTTP.
Cross-owner denial, missing/expired claim behavior, failed mutation rollback,
and database side effects are assertions, not log inspection. [CITED:
https://github.com/supabase/cli/blob/develop/apps/cli/docs/go-cli-reference.md]
[VERIFIED: `supabase/functions/_shared/authentication.ts`]

### Pattern 5: Provider contract without premature payment integration

Exercise the existing Postmark webhook as the current external-provider
contract, including unauthorized IP/auth, malformed payload, durable failure,
duplicate `MessageID`, and acknowledged-success behavior. Add a test-ownership
manifest that forces future payment/provider command paths to register HTTP,
failure, replay, and concurrency tests before the path gate can pass. This
builds the release contract without selecting Stripe/GoCardless or adding live
payment behavior in Phase 1. [VERIFIED: Phase boundary, REL-02,
`supabase/functions/postmark/index.ts`]

### Pattern 6: Build once, promote by digest

`main` may create a frontend tarball, function bundle manifest, migration
manifest, SHA-256 digests, and GitHub artifact attestations. Promotion workflows
accept an evidence ID/digest and refuse to rebuild. Each dispatch promotes one
stage only after verifying predecessor receipts, then writes a new schema-valid
receipt to the private evidence repository. GitHub artifact attestations use
OIDC and require `id-token: write`, `contents: read`, and `attestations: write`.
[CITED: https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations]

### Pattern 7: Declarative release policy and expiring exceptions

Keep check identities, non-overridable classes, exception fields, maximum
expiry, stage order, and evidence destination rules in versioned JSON. Validate
both workflow YAML and a supplied exception document with repository scripts.
An exception older than seven days, lacking owner/issue/controls, or touching a
D-13 class returns nonzero. Receipts record the policy version and exception
digest. [VERIFIED: D-13 through D-16]

### Anti-Patterns to Avoid

- **Path filters as merge authority:** a renamed or newly introduced financial
  path can escape; path filters are early feedback only. [VERIFIED: D-01]
- **One aggregate green check:** branch rules must name all six lanes.
  [VERIFIED: D-02]
- **Remote Supabase as test authority:** it is shared, stateful, and cannot
  prove a clean replay. [VERIFIED: D-03]
- **Retrying an assertion:** no financial assertion, migration, replay, or
  policy failure gets a second chance to turn green. [VERIFIED: D-04]
- **Editing an accepted baseline:** add a new numbered baseline and retain the
  old one. [VERIFIED: D-07]
- **Deploy on `main`:** build/attest only; production mutation is protected and
  manually dispatched. [VERIFIED: D-09 through D-11]
- **Public receipt artifact:** this repository is public and cannot be the
  durable private evidence destination. [VERIFIED: repository visibility]
- **Secrets in logs/reports:** run Gitleaks with full redaction and store only a
  hash/redacted summary publicly. [CITED: https://github.com/gitleaks/gitleaks]
- **Destructive down migrations as rollback:** keep the feature disabled and
  ship a forward-safe repair unless an authorized restore incident is active.
  [VERIFIED: D-08 and D-12]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Local Supabase orchestration | Custom Postgres/Auth/Edge docker-compose | Pinned Supabase CLI | It reproduces the repository's configured service boundary. |
| Database assertion protocol | Ad hoc SQL output parsing | `supabase test db` + pgTAP | TAP gives deterministic assertion and exit semantics. |
| Artifact signing identity | Repository-managed signing keys | GitHub OIDC artifact attestations | Avoids long-lived signing secrets in CI. |
| Secret detection | A few regexes in Vitest | Gitleaks redacted history/diff scan | History, encodings, allowlists, and detectors are security-sensitive. |
| Vulnerability advisory resolution | A custom CVE feed | npm audit plus dependency review | The lockfile and registry advisory graph are already authoritative inputs. |
| Deployment approvals | A boolean workflow input | Protected GitHub environments | Approval identity and deployment record must be outside the submitted payload. |
| Receipt canonicalization | Unordered shell-built JSON | Node script + JSON Schema + canonical key ordering + SHA-256 | Stable content hashes require deterministic serialization and schema validation. |

**Key insight:** release authority is the conjunction of repository code,
protected GitHub settings, isolated executable tests, immutable artifact
digests, and private attested receipts. No single workflow log proves it.

## Common Pitfalls

### Pitfall 1: Conditional required checks remain pending

**What goes wrong:** a required job skipped by a path condition never reports a
successful check for the merge candidate.
**How to avoid:** keep fast PR jobs unconditional, run early financial jobs
conditionally only on PRs, and run every named required financial job
unconditionally for `merge_group`.
**Warning sign:** a PR cannot enter/leave the merge queue because an expected
check never started. [CITED: GitHub `merge_group` event documentation]

### Pitfall 2: A baseline is only a seed file

**What goes wrong:** migrations apply but silently change ownership, grants,
numeric values, or row identity.
**How to avoid:** baseline manifest plus schema/history/fixture hashes and
canonical before/after fingerprints for every D-08 property.
**Warning sign:** upgrade tests assert only exit code or row count. [VERIFIED:
D-05 through D-08]

### Pitfall 3: SQL claim simulation hides HTTP defects

**What goes wrong:** pgTAP passes while JWT parsing, gateway headers, Auth user
resolution, or Edge middleware is broken.
**How to avoid:** require both SQL-role tests and real local Auth/JWT HTTP tests.
**Warning sign:** no test obtains a JWT from the local Auth service. [VERIFIED:
REL-02 and `supabase/functions/_shared/authentication.ts`]

### Pitfall 4: Current blockers make the new gate permanently red

**What goes wrong:** the repository enables hard gates without repairing the
known migration chain, critical/high dependency advisories, public source maps,
or tracked environment files.
**How to avoid:** include remediation plans before making the checks required,
then assert the same defects cannot recur.
**Warning sign:** `npm audit --omit=dev --audit-level=high` exits nonzero or
`find dist -name '*.map'` returns a file. [VERIFIED: current audit result and
`vite.config.ts`]

### Pitfall 5: Public CI artifacts are mistaken for private evidence

**What goes wrong:** receipt contents or detailed security reports are exposed
from a public repository, or expire as routine Actions artifacts.
**How to avoid:** validate that `RELEASE_EVIDENCE_REPOSITORY` resolves to a
private repository before upload; keep the public run to redacted summaries and
hashes.
**Warning sign:** authoritative receipt URL points into the public source repo
or a temporary Actions artifact. [VERIFIED: D-16 and repository visibility]

### Pitfall 6: Workflow permissions are broader than the job needs

**What goes wrong:** PR test jobs retain `contents: write`/`checks: write`, or
build jobs can deploy.
**How to avoid:** default to `contents: read`; grant `id-token`/`attestations`
only to attestation jobs and environment secrets only to protected promotion
jobs.
**Warning sign:** a pull-request job can write repository contents or access
production secrets. [VERIFIED: current `.github/workflows/check.yml`; cited
GitHub secure-use documentation]

## Current Risk Inventory

| Risk | Verified state on 2026-08-25 | Planning consequence |
|------|------------------------------|----------------------|
| Migration chain | Known stale-column failures in lead conversion and attribution view migrations | Repair/classify before baseline acceptance; add clean replay test. |
| Authorization proof | Existing tests inspect SQL strings; no running database/function suite | Add pgTAP and HTTP claims suites; static tests remain advisory. |
| Dependency vulnerabilities | 1 critical, 8 high, 12 moderate production findings; all critical/high entries report a fix available | Remediate critical/high before requiring the non-overridable audit gate. |
| Public source maps | `vite.config.ts` sets `build.sourcemap: true` | Disable public production maps and scan built/deployed artifacts. |
| Tracked environment files | `.env.development`, `.env.example`, and `supabase/functions/.env` are tracked | Inspect only with redacted tooling, remove sensitive tracked files, rotate confirmed secrets, and block history/diff recurrence. |
| Unsafe deployment coupling | `main` push runs DB push, functions deploy, build, and GitHub Pages publication | Split build from protected promotion and enablement. |
| Evidence privacy | Source and fork repositories are public | Require a separately verified private evidence repository. |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | Scripts and Vitest | ✓ | local 26.7.0; repository target 22 | Use `.nvmrc`/Actions Node 22 for parity. |
| npm | Install/audit/build | ✓ | 12.0.2 | — |
| Docker Engine | Local Supabase | ✓ | 29.6.2 | GitHub-hosted Ubuntu runner in CI. |
| Supabase CLI | Database/Edge lanes | ✓ | local 2.112.0; selected CI 2.115.0 | `supabase/setup-cli@v3` pinned with exact CLI version. |
| PostgreSQL 15 services | Live database tests | ✓ via Supabase/Docker | 15 configured | Fresh CI stack. |
| GitHub CLI | Rules/evidence automation | ✓ | 2.97.0 | GitHub REST API via `curl` with `GITHUB_TOKEN`. |
| jq | Local diagnostics | ✓ | 1.7.1 | Node JSON parsing in repository scripts. |
| Gitleaks | Secret scan | ✓ | 8.30.1 | Pinned official GitHub Action in CI. |
| Cosign | Direct signing | ✗ | — | GitHub OIDC `actions/attest`; no private signing key required. |
| Private evidence repository | Authoritative receipts | ✗ unconfigured | — | Blocking owner setup before any production promotion. |

**Missing dependencies with no fallback:** a verified private evidence
destination and protected GitHub environment/ruleset configuration are required
before production promotion can pass.

**Missing dependencies with fallback:** local Node and Supabase versions differ
from the selected CI contract; `.nvmrc` and setup actions provide pinned parity.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 3.2.4 + pgTAP through Supabase CLI 2.115.0 |
| Config file | `vite.config.ts`, `supabase/config.toml`; Wave 0 adds release harness/config |
| Quick run command | `npm test -- --run tests/release/release-policy.test.ts` |
| Full suite command | `make financial-gate` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REL-01 | Blank replay and immutable-baseline upgrade preserve schema/data contracts | live DB integration | `make test-financial-migrations` | ❌ Wave 0 |
| REL-02 | Claims, RLS, RPCs, triggers, Edge/webhook/provider behavior, replay, and concurrency execute against local services | pgTAP + HTTP integration | `make test-financial-database test-financial-functions test-financial-concurrency` | ❌ Wave 0 |
| REL-03 | Financial paths and merge candidates cannot bypass the six named checks | workflow contract + CI | `npm test -- --run tests/release/release-policy.test.ts` | ❌ Wave 0 |
| REL-04 | Build/promote/enable stages enforce order, digest reuse, approvals, receipts, and rollback metadata | workflow contract + dry-run scripts | `npm test -- --run tests/release/receipt.test.ts tests/release/release-policy.test.ts` | ❌ Wave 0 |
| REL-05 | High/critical prod advisories, source maps, secrets, or coupled deploys fail | security CLI + bundle/workflow contract | `make test-release-security` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** the task-specific Vitest file, pgTAP file, or script
  `--check` command; never the full Docker suite unless the task changes its
  boundary.
- **Per wave merge:** run all affected lanes; a wave touching shared release
  policy runs `make financial-gate`.
- **Phase gate:** `make financial-gate` and all six GitHub `merge_group` checks
  are green before `$gsd-verify-work`.
- **Financial assertion retry:** zero. A bootstrap-only wrapper may make one
  classified and logged retry before assertions begin.

### Wave 0 Gaps

- [ ] `scripts/release/run-supabase-lane.mjs` — isolated start/status/cleanup,
  bootstrap classification, and one-bootstrap-retry contract.
- [ ] `supabase/tests/baselines/001-pre-financial/*` — immutable schema,
  history, fixtures, manifest, and expected fingerprints.
- [ ] `supabase/tests/database/*.sql` — pgTAP authorization/RPC/trigger tests.
- [ ] `tests/release/auth-rls-rpc-trigger.test.ts` — real Auth/JWT REST/RPC tests.
- [ ] `tests/release/edge-webhook-provider.test.ts` — running function/provider
  success and failure contracts.
- [ ] `tests/release/replay-concurrency.test.ts` — duplicate and simultaneous
  request invariants.
- [ ] `tests/release/release-policy.test.ts` and `tests/release/receipt.test.ts`
  — workflow/policy/receipt contracts.
- [ ] Make targets and package scripts that expose quick and full commands.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | yes | Local Supabase Auth issues representative JWTs; Edge middleware validates them. |
| V3 Session Management | yes | Tests use short-lived local sessions and never persist tokens in artifacts/logs. |
| V4 Access Control | yes | PostgreSQL RLS/grants/RPC ownership and protected environments are authoritative. |
| V5 Input Validation | yes | pgTAP constraints plus request-schema/failure-path assertions. |
| V6 Cryptography | yes | Node SHA-256 and GitHub OIDC attestations; no custom signing crypto. |
| V8 Data Protection | yes | Redacted scan output and private evidence destination. |
| V10 Malicious Code | yes | Dependency review, production audit, secret scan, and pinned actions. |
| V13 API and Web Service | yes | Edge/webhook authentication, method, replay, failure, and acknowledgement tests. |
| V14 Configuration | yes | Least-privilege workflow permissions, protected settings, flags, and source-map gate. |

[CITED: https://github.com/OWASP/ASVS]

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forged JWT/tenant identity | Spoofing / Elevation | Real local Auth claims plus cross-owner denial at RLS/RPC/Edge boundaries. |
| Migration rewrites financial facts | Tampering | Immutable baseline hashes and before/after canonical fingerprints. |
| Duplicate/out-of-order provider events | Tampering / Repudiation | Unique event keys, concurrency/replay tests, durable acknowledgement contract. |
| Secret or report disclosure | Information Disclosure | Full-redaction scanning, no secret values in logs, private evidence repository. |
| Gate bypass through paths/skips/retries | Elevation / Repudiation | Unconditional merge-group suite, named required checks, no assertion retries. |
| Supply-chain compromise | Tampering | Exact CLI versions, action SHAs, npm lock integrity/audit, dependency review. |
| Unauthorized production mutation | Elevation | Separate protected environments for promotion and enablement; least-privilege secrets. |
| Evidence deletion/substitution | Repudiation / Tampering | SHA-256 content address, OIDC attestation, immutable release asset naming, protected deployment link. |

## Open Questions (RESOLVED)

1. **Can the public source repository store authoritative receipts?** —
   RESOLVED: no. Use a separately verified private evidence repository and
   expose only hashes/redacted summaries publicly.
2. **What is the mandatory full-suite trigger?** — RESOLVED: GitHub merge queue
   `merge_group: checks_requested`; path filters remain PR-only early feedback.
3. **What signing mechanism avoids a new long-lived key?** — RESOLVED: GitHub
   OIDC artifact attestations with least-privilege permissions.
4. **Can Phase 1 choose a payment provider to satisfy provider contracts?** —
   RESOLVED: no. Exercise the current Postmark provider boundary and enforce a
   registration contract for future financial provider paths.
5. **How are database failures rolled back?** — RESOLVED: disable/demote the
   feature and apply a forward-safe repair; destructive restore is an incident
   procedure outside routine release automation.

## Assumptions Log

All implementation claims in this research were verified from repository
state, official Supabase/GitHub/npm/Gitleaks documentation, or locked Phase 1
decisions. No training-only `[ASSUMED]` claim remains.

## Sources

### Primary (HIGH confidence)

- `/supabase/cli` Context7 documentation — `start`, `db reset`, `migration up`,
  `test db`, and `functions serve` behavior.
- `/websites/github_en_actions` Context7 documentation — `merge_group`,
  protected environments, and artifact attestations.
- https://github.com/supabase/setup-cli — exact CLI-version setup behavior.
- https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows
  — merge queue workflow trigger contract.
- https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments
  — protected deployment environment behavior.
- https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations
  — attestation permissions and provenance.
- https://github.com/npm/cli/blob/latest/docs/lib/content/commands/npm-audit.md
  — audit threshold and exit-code semantics.
- https://github.com/gitleaks/gitleaks — redaction and Git-history scan modes.
- https://github.com/OWASP/ASVS — application security verification categories.
- Repository sources listed in `01-CONTEXT.md` — current test, migration,
  function, build, CI, and deployment behavior.

### Secondary (MEDIUM confidence)

None required.

### Tertiary (LOW confidence)

None.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — existing tools plus current official releases/docs.
- Architecture: HIGH — locked decisions map directly to supported Supabase and
  GitHub mechanisms.
- Pitfalls: HIGH — most are present and independently verified in the current
  repository.
- Evidence privacy: HIGH — both configured GitHub repositories report public
  visibility; D-16 is explicit.

**Research date:** 2026-08-25
**Valid until:** 2026-09-24 (reconfirm action/CLI releases before execution)

