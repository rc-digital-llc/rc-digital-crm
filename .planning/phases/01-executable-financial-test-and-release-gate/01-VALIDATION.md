---
phase: 1
slug: executable-financial-test-and-release-gate
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-08-25
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for executable financial release assurance.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.4 + pgTAP through Supabase CLI 2.115.0 |
| **Config file** | `vite.config.ts`, `supabase/config.toml`, `.github/release/release-policy.json` |
| **Quick run command** | `npm test -- --run tests/release/release-policy.test.ts` |
| **Full suite command** | `make financial-gate` |
| **Estimated runtime** | Quick: under 30 seconds; full isolated suite: under 15 minutes |

---

## Sampling Rate

- **After every task commit:** Run the task-specific targeted command from the
  map below. Live-database tasks may reuse only the disposable stack created by
  that task; they never use a developer or shared remote database.
- **After every plan wave:** Run every lane affected by that wave. Wave 4 and
  Wave 5 run `make financial-gate`.
- **Before `$gsd-verify-work`:** `make financial-gate` and all six required
  `merge_group` checks must be green for the exact commit SHA.
- **Max feedback latency:** 30 seconds for source/policy/unit checks; 15 minutes
  for the independently timed live Supabase lanes.
- **Retry policy:** zero assertion retries. The stack bootstrap may retry once
  only after emitting a classified bootstrap-failure record and before any
  assertion begins.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | REL-03, REL-05 | T-01-01, T-01-02 | Release policy rejects missing lanes, forbidden overrides, and invalid path ownership | unit/contract | `npm test -- --run tests/release/release-policy.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 1 | REL-01, REL-02 | T-01-03 | Supabase lane wrapper creates and cleans isolated stacks and retries bootstrap only | script self-test | `node scripts/release/run-supabase-lane.mjs --self-test` | ❌ W0 | ⬜ pending |
| 01-01-03 | 01 | 1 | REL-01–05 | T-01-02 | Stable Make targets expose each independent lane and the full gate | source/CLI | `make financial-gate-help` | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 2 | REL-01, REL-02 | T-01-04, T-01-05 | Clean replay reaches the latest migration and privileged RPC behavior is caller-bound | live DB | `make test-financial-migration-clean` | ❌ W0 | ⬜ pending |
| 01-02-02 | 02 | 2 | REL-01 | T-01-04 | Known stale-column defects are covered by executable regression assertions | pgTAP | `supabase test db supabase/tests/database/00_schema_contracts.sql --local` | ❌ W0 | ⬜ pending |
| 01-02-03 | 02 | 2 | REL-01 | T-01-04 | Schema push succeeds against a second disposable local database, never production | live DB push | `make test-financial-schema-push` | ❌ W0 | ⬜ pending |
| 01-03-01 | 03 | 3 | REL-01 | T-01-06 | Accepted baseline files and migration cutoff match immutable SHA-256 manifest entries | unit/contract | `node scripts/release/verify-baseline.mjs supabase/tests/baselines/001-pre-financial` | ❌ W0 | ⬜ pending |
| 01-03-02 | 03 | 3 | REL-01 | T-01-04, T-01-06 | Upgrade preserves identities, counts, ownership, money values, hashes, grants, constraints, and queries | live DB | `make test-financial-migration-upgrade` | ❌ W0 | ⬜ pending |
| 01-04-01 | 04 | 3 | REL-02, REL-03 | T-01-05 | pgTAP proves representative claim allow/deny behavior for RLS, grants, RPCs, and triggers | pgTAP | `make test-financial-database-sql` | ❌ W0 | ⬜ pending |
| 01-04-02 | 04 | 3 | REL-02, REL-03 | T-01-05 | Real local Auth JWTs prove same-owner access and cross-owner denial over HTTP | HTTP integration | `make test-financial-database-http` | ❌ W0 | ⬜ pending |
| 01-05-01 | 05 | 3 | REL-02, REL-03 | T-01-07, T-01-08 | Synthetic provider fixtures contain no customer data or secrets and cover success/failure inputs | fixture contract | `npm test -- --run tests/release/edge-webhook-provider.test.ts -t fixtures` | ❌ W0 | ⬜ pending |
| 01-05-02 | 05 | 3 | REL-02, REL-03 | T-01-07, T-01-08 | Running Edge endpoints reject invalid auth/method/body and preserve failure semantics | HTTP integration | `make test-financial-functions` | ❌ W0 | ⬜ pending |
| 01-06-01 | 06 | 3 | REL-02, REL-03 | T-01-09 | Test-only support schema exposes deterministic unique/idempotency and locking invariants | live DB setup | `make test-financial-concurrency-fixture` | ❌ W0 | ⬜ pending |
| 01-06-02 | 06 | 3 | REL-02, REL-03 | T-01-09 | Duplicate, replayed, simultaneous, and reordered operations stop safely without double effects | concurrency integration | `make test-financial-concurrency` | ❌ W0 | ⬜ pending |
| 01-07-01 | 07 | 1 | REL-05 | T-01-10 | Production dependency graph contains no unresolved critical/high advisory | audit + regression | `npm audit --omit=dev --audit-level=high && npm test -- --run` | ✅ audit / ✅ existing suite | ⬜ pending |
| 01-07-02 | 07 | 1 | REL-05 | T-01-11 | Git history/current tree are scanned with full redaction and tracked secret files cannot recur | security CLI | `make test-release-secrets` | ❌ W0 | ⬜ pending |
| 01-07-03 | 07 | 1 | REL-05 | T-01-12 | Production build publishes no `.map` files or embedded secret markers | build/security | `make test-release-bundle` | ❌ W0 | ⬜ pending |
| 01-08-01 | 08 | 2 | REL-04, REL-05 | T-01-13 | Receipt builder emits canonical schema-valid JSON containing every D-15 field and digest | unit/contract | `npm test -- --run tests/release/receipt.test.ts` | ❌ W0 | ⬜ pending |
| 01-08-02 | 08 | 2 | REL-04 | T-01-13, T-01-14 | Evidence publisher rejects public destinations and verifies uploaded private asset digest/attestation | script self-test | `node scripts/release/publish-evidence.mjs --self-test` | ❌ W0 | ⬜ pending |
| 01-09-01 | 09 | 4 | REL-03, REL-05 | T-01-01, T-01-02 | PR and merge queue workflows expose six independent immutable check identities | workflow contract | `npm test -- --run tests/release/release-policy.test.ts -t workflow` | ❌ W0 | ⬜ pending |
| 01-09-02 | 09 | 4 | REL-03 | T-01-01 | Main ruleset requires every merge-group financial check and forbids bypass | API/source contract | `node scripts/release/verify-github-controls.mjs --check` | ❌ W0 | ⬜ pending |
| 01-10-01 | 10 | 5 | REL-04, REL-05 | T-01-14, T-01-15 | Main builds/attests only and cannot mutate production | workflow contract | `npm test -- --run tests/release/release-policy.test.ts -t build` | ❌ W0 | ⬜ pending |
| 01-10-02 | 10 | 5 | REL-04 | T-01-15, T-01-16 | Protected promotion enforces schema→functions→frontend→dormant order and predecessor receipts | workflow contract | `npm test -- --run tests/release/release-policy.test.ts -t promotion` | ❌ W0 | ⬜ pending |
| 01-10-03 | 10 | 5 | REL-04, REL-05 | T-01-15, T-01-16 | Enablement is separately approved; rollback uses pinned artifacts/forward repair and produces receipt | workflow + runbook contract | `npm test -- --run tests/release/release-policy.test.ts -t 'enablement|rollback'` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `.github/release/financial-paths.json` — financial and privileged path ownership.
- [ ] `.github/release/release-policy.json` — exact checks, stages, exception rules, and private-evidence contract.
- [ ] `.github/release/release-receipt.schema.json` — D-15 receipt schema.
- [ ] `scripts/release/run-supabase-lane.mjs` — isolated stack lifecycle and bootstrap classification.
- [ ] `scripts/release/verify-baseline.mjs` and `fingerprint-upgrade.mjs` — immutable baseline and D-08 proof.
- [ ] `supabase/tests/database/*.sql` and `supabase/tests/support/*.sql` — pgTAP/live DB coverage.
- [ ] `tests/release/*.test.ts` — migration, claims, Edge/provider, concurrency, policy, receipt, and security coverage.
- [ ] `makefile` financial lane targets — stable local/CI entry points.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Release-owner identity approves production promotion | REL-04 | GitHub environment review is intentionally outside repository-controlled workflow inputs | Dispatch a dry-run promotion to the protected environment; verify the job remains waiting until an authorized release owner approves and the deployment record names that reviewer. |
| A different release-owner approval gates feature enablement | REL-04 | Separation of the approval boundary must be observed in GitHub's protected deployment record | After dry-run stage receipts pass, dispatch enablement; verify it creates a separate pending review and cannot reuse promotion approval. |
| Private evidence readback remains private | REL-04, REL-05 | Repository visibility/access policy is external state | Upload a synthetic receipt, verify its digest through an authenticated API readback, and verify an unauthenticated request cannot retrieve the asset. |

These checks validate owner-controlled external protection. All repository code,
test behavior, receipt contents, stage order, and gate logic remain automated.

---

## Validation Sign-Off

- [x] Every planned task has a targeted automated command.
- [x] Sampling continuity has no three consecutive implementation tasks without automated verification.
- [x] Wave 0 names every missing harness/fixture/test path.
- [x] No watch-mode flags appear in verification commands.
- [x] Fast checks target under 30 seconds; live financial lanes are independently timed and capped at 15 minutes.
- [x] `nyquist_compliant: true` is set in frontmatter.

**Approval:** planning contract approved 2026-08-25; execution results pending

