# Phase 1: Executable Financial Test and Release Gate - Context

**Gathered:** 2026-08-25
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase establishes executable proof and blocking release controls before
new money-bearing schema, privileged endpoints, provider commands, or financial
automation may ship. It covers clean and representative-upgrade migration
testing, real database/authorization/function/concurrency tests, CI enforcement,
dependency/secret/source-map gates, staged expand-contract promotion, rollback
contracts, and durable release receipts.

This phase does not introduce the Phase 2 tenant/role model, Phase 3 financial
money types, later billing workflows, provider adapters, or live financial
feature enablement. Fixtures and test-only schema may model future boundaries,
but production financial capabilities remain dormant.

</domain>

<decisions>
## Implementation Decisions

### CI Execution Policy

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

### Upgrade Baseline

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

### Release Control

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
- **D-11A (owner override, 2026-08-28):** The project operates without an
  independent human reviewer. Pull requests are opened by the scoped release
  bot and require one authenticated `Rconman99` approval while the no-bypass
  ten-check merge queue remains mandatory. A new push dismisses stale reviews;
  last-push approval is disabled because the sole owner is also the commit
  pusher. Protected promotion and enablement each retain a separate owner
  approval, with environment self-review allowed. The separation-of-duties
  reduction is an accepted, versioned single-owner risk and does not relax
  receipts, stage order, or non-overridable financial checks.
- **D-12:** Frontend and functions roll back to pinned known-good artifacts.
  Database failure normally produces a forward-safe repair while the feature
  remains disabled. Destructive migration reversal or database restoration is
  reserved for an authorized incident procedure with verified backup evidence.

### Exceptions and Release Receipts

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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and acceptance contract

- `.planning/PROJECT.md` — Core value, fail-closed constraints, anti-pattern
  fence, and required delivery order.
- `.planning/REQUIREMENTS.md` — REL-01 through REL-05 and the project-wide
  Definition of Done.
- `.planning/ROADMAP.md` — Phase 1 boundary, goal, dependency, and observable
  success criteria.
- `.planning/AUDIT-CLAUDE-2026-08-20.md` — Independently verified pre-roadmap
  release, migration, security, and dependency gaps.

### Codebase findings

- `.planning/codebase/TESTING.md` — Current Vitest/static-SQL patterns, verified
  commands, and missing live database, function, and browser coverage.
- `.planning/codebase/INTEGRATIONS.md` — Supabase, Edge Function, CI/deployment,
  secret, and external-service boundaries.
- `.planning/codebase/CONCERNS.md` — Known migration, authorization, webhook,
  dependency, source-map, and deployment risks this phase must turn into gates.

### Current release implementation

- `.github/workflows/check.yml` — Existing pull-request lint, Vitest, and build
  jobs that the blocking lanes extend.
- `.github/workflows/deploy.yml` — Existing push-to-main deployment coupling
  that must be separated into build, promotion, and enablement stages.
- `makefile` — Existing local Supabase, migration, function, test, and build
  entry points.
- `package.json` — Current verification scripts and production dependency
  boundary.
- `supabase/config.toml` — Local PostgreSQL 15, Auth, Storage, and Edge Function
  runtime contract used by isolated tests.
- `supabase/migrations/` — Authoritative migration chain and source for the
  clean and representative-upgrade fixtures.
- `supabase/functions/` — Privileged function surface that requires running
  authorization and failure-path tests.
- `src/components/atomic-crm/leads/securityChecklist.test.ts` — Existing
  source-string security checks; useful as advisory coverage but not executable
  authorization proof.
- `vite.config.ts` — Production build and source-map behavior covered by the
  release-security gate.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `makefile` already exposes local Supabase start/reset/migration, function
  serving, unit-test, typecheck, lint, and build commands that can become
  stable developer and CI entry points.
- `supabase/config.toml` pins PostgreSQL 15 and defines the local Auth, Storage,
  and Edge Function surface needed for isolated integration tests.
- `.github/workflows/check.yml` already separates lint, test, and build jobs;
  it can host additional independently required financial lanes rather than
  inventing a second CI platform.
- Existing migration contract tests provide reusable fixture-reading helpers
  and named security invariants, even though their string assertions cannot
  count as live database proof.

### Established Patterns

- Unit and helper tests use Vitest beside application code. Keep those fast
  checks, but place running Supabase/Edge/concurrency tests in a clearly
  separate integration surface with deterministic fixtures.
- Schema changes are migration-only under `supabase/migrations/`; the test
  harness must apply the real ordered chain rather than reconstruct SQL.
- Client-facing Edge Functions use manual bearer-token validation while the
  gateway has `verify_jwt = false`; representative claim and ownership tests
  must exercise the running function plus its database effects.
- Current deployment automatically couples migration push, function deploy,
  frontend build, and GitHub Pages publication on `main`; Phase 1 must break
  that coupling before financial work begins.

### Integration Points

- Extend `.github/workflows/check.yml` and repository scripts/Make targets for
  the local and CI test contract.
- Replace or split the production path in `.github/workflows/deploy.yml` into
  immutable build, protected staged promotion, and separate feature enablement.
- Add fixture/baseline and integration-test assets adjacent to the migration
  and function surfaces they execute, without placing secrets or customer data
  in the repository.
- Gate `package-lock.json`, `vite.config.ts`, migrations, functions, and future
  financial paths with explicit path ownership while retaining the mandatory
  full pre-merge suite.

</code_context>

<specifics>
## Specific Ideas

- Optimize for quick early feedback and strict merge authority: path filters
  may skip expensive early runs, but they never waive the fresh complete
  pre-merge suite.
- Treat the current pre-billing schema as the first immutable upgrade contract;
  later phases add new baselines instead of mutating it.
- A green merge, successful deploy command, or disposable CI log is not release
  proof. Promotion and financial enablement remain distinct recorded actions.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within Phase 1 scope.

</deferred>

---

*Phase: 1-executable-financial-test-and-release-gate*
*Context gathered: 2026-08-25*
