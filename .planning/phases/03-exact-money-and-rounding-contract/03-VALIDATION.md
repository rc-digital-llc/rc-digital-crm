---
phase: 3
slug: exact-money-and-rounding-contract
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-09-02
revised: 2026-09-04
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for integer minor units, reduced rates, named
> rounding, additive exact conversion, caller-bound reads, and provider parity.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.4 + pgTAP through isolated Supabase CLI/PostgreSQL 17 lanes |
| **Config files** | `vite.config.ts`, `supabase/config.toml`, `makefile`, `.github/release/release-policy.json` |
| **Quick run command** | `npm test -- --run src/components/atomic-crm/financial/exactMoney.test.ts` |
| **Database command** | `make test-financial-database-contracts` |
| **Upgrade command** | `make test-financial-migration-upgrade && make test-financial-schema-push` |
| **Full phase command** | `make financial-gate && npm run typecheck && npm run lint && npm run build` |

## Sampling Rate

- **After every task commit:** run its focused command plus `git diff --check`.
- **After every wave:** run the affected protected lane; add typecheck for TypeScript.
- **Before PR readiness:** run the full phase command once at the exact head.
- **Before merge:** require exact-head owner approval and fresh merge-group checks.
- **After authorized release:** require build receipt, protected schema promotion,
  and provider post-state readback before claiming the contract live.
- **Retry policy:** no assertion retry; only inherited classified local-stack
  bootstrap retry is permitted.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Automated Command | Status |
|---------|------|------|-------------|------------|-----------------|-------------------|--------|
| 03-01-01 | 01 | 1 | CALC-01 | T-03-01/02/04 | String-only money/rate, 64/14 pre-parse limits, canonical zero, bounded D-10 evidence | `npm test -- --run src/components/atomic-crm/financial/exactMoney.test.ts -t 'money|rate|wire'` | ✅ |
| 03-01-02 | 01 | 1 | CALC-03 | T-03-03/04 | BigInt half-away signed rounding and checked persistence range | `npm test -- --run src/components/atomic-crm/financial/exactMoney.test.ts -t rounding` | ✅ |
| 03-01-03 | 01 | 1 | CALC-01/03 | T-03-09 | First exact source/unit/static paths enter protected fast/classifier contract | `npm test -- --run tests/release/exact-money-release-static.test.ts && make test-financial-fast` | ✅ |
| 03-02-01 | 02 | 2 | CALC-01/03 | T-03-03/04/05 | Immutable catalogs/helpers install with exact ACLs, lengths, and ranges | `make test-financial-schema-push` | ✅ |
| 03-02-02 | 02 | 2 | CALC-01/03 | T-03-01/03/05 | Independent PostgreSQL golden/property/token proof | `node scripts/release/run-supabase-lane.mjs run --lane database-contracts -- supabase test db supabase/tests/database/60_exact_financial_primitives.sql --local` | ✅ |
| 03-02-03 | 02 | 2 | CALC-01/03 | T-03-09 | Test 60 joins protected SQL target in Wave 2 | `npm test -- --run tests/release/exact-money-release-static.test.ts && make test-financial-database-sql` | ✅ |
| 03-03-01 | 03 | 3 | CALC-01/03 | T-03-07/02 | Closed upgrade vocabulary, exact text, immutable 00002/00003/00004 hashes, and tax-rate type/check/derivation/output fingerprints | `npm test -- --run tests/release/migration-upgrade.test.ts -t exact` | ✅ |
| 03-03-02 | 03 | 3 | CALC-01/03 | T-03-09 | Runner Vitest/static checks join protected upgrade contract before cutover | `npm test -- --run tests/release/exact-money-release-static.test.ts && make test-financial-migration-upgrade` | ✅ |
| 03-04-01 | 04 | 4 | CALC-01/03 | T-03-10/13/06/11/14/12 | Atomic cutover revokes table/sequence, installs closed caller-bound read/write RPCs, widens derived `tax_rate` compatibility to `numeric(12,9)`, preserves submitted evidence, and registers exact fingerprints | `make test-financial-migration-upgrade && make test-financial-schema-push && node scripts/release/run-supabase-lane.mjs run --lane database-contracts -- supabase test db supabase/tests/database/65_exact_billing_conversion.sql --local` | ✅ |
| 03-04-02 | 04 | 4 | CALC-01/03 | T-03-11/14 | Tests 35/40/65 and fixtures prove exact success, replay, conflict, ACL, canonical zero, and unchanged evidence/audit/grant/execution state | `node scripts/release/run-supabase-lane.mjs run --lane database-contracts -- supabase test db supabase/tests/database/35_billing_automation.sql supabase/tests/database/40_billing_evidence.sql supabase/tests/database/65_exact_billing_conversion.sql --local` | ✅ |
| 03-04-03 | 04 | 4 | CALC-01/03 | T-03-09/14 | Replay/evidence live callers migrate and every Wave 4 path remains protected | `npm test -- --run tests/release/exact-money-release-static.test.ts && make test-financial-migration-upgrade && make test-financial-database-sql && make test-financial-functions && make test-financial-replay-concurrency` | ✅ |
| 03-05-01 | 05 | 5 | CALC-01 | T-03-10/13/01 | React Admin/Supabase list/get/save use validated exact RPCs; save has no Phase 3 idempotency key/fingerprint | `npm run typecheck` | ✅ |
| 03-05-02 | 05 | 5 | CALC-01/03 | T-03-10/13/01/12 | Live same-tenant success, cross-tenant/direct denial, exact-save success/invalid zero effects, full-range strings, and `8.875000000`/`12.500000000` rate compatibility with evidence preserved | `node scripts/release/run-supabase-lane.mjs run --lane database-contracts -- npm test -- --run tests/release/exact-money-boundaries.test.ts tests/release/billing-tenancy.test.ts` | ✅ |
| 03-05-03 | 05 | 5 | CALC-01/03 | T-03-09 | Supabase source/live tests enter protected HTTP/classifier/static contract | `npm test -- --run tests/release/exact-money-release-static.test.ts && make test-financial-database-http` | ✅ |
| 03-06-01 | 06 | 6 | CALC-01/03 | T-03-01/15 | FakeRest matches closed Supabase requests/results/errors, canonical line items, and exact-save success/invalid zero effects without invoice-save idempotency | `node scripts/release/run-supabase-lane.mjs run --lane database-contracts -- npm test -- --run src/components/atomic-crm/financial/exactProviderContract.test.ts` | ✅ |
| 03-06-02 | 06 | 6 | CALC-01/03 | T-03-02/03 | Preview delegates to named BigInt exact arithmetic and rejects float authority | `npm test -- --run src/components/atomic-crm/invoices/invoiceCalculations.test.ts && npm run typecheck` | ✅ |
| 03-06-03 | 06 | 6 | CALC-01/03 | T-03-09 | Provider parity/preview paths enter protected HTTP/fast/classifier contracts | `npm test -- --run tests/release/exact-money-release-static.test.ts && make test-financial-database-http && make test-financial-fast` | ✅ |
| 03-07-01 | 07 | 7 | CALC-01/03 | T-03-09/10/14 | Final audit proves rolling coupling and Cycle 2 security closure | `npm test -- --run tests/release/exact-money-release-static.test.ts` | ✅ |
| 03-07-02 | 07 | 7 | CALC-01/03 | all | Integrated exact-head financial/type/lint/build proof | `make financial-gate && npm run typecheck && npm run lint && npm run build` | ✅ |

## Wave 0 Requirements

- [x] `src/components/atomic-crm/financial/exactFinancialFixtures.ts`
- [x] `src/components/atomic-crm/financial/exactMoney.test.ts`
- [x] `supabase/tests/database/60_exact_financial_primitives.sql`
- [x] `supabase/tests/database/65_exact_billing_conversion.sql`
- [x] `supabase/tests/upgrades/003-exact-money/expected-transformations.json`
- [x] `tests/release/exact-money-boundaries.test.ts`
- [x] `src/components/atomic-crm/financial/exactProviderContract.test.ts`
- [x] `tests/release/exact-money-release-static.test.ts`

Inherited tests `35_billing_automation.sql`, `40_billing_evidence.sql`,
`billing-tenancy.test.ts`, `billing-evidence.test.ts`, and
`replay-concurrency.test.ts` are updated in Plans 04–05 and must remain in their
existing protected targets.

## Integrated Exact-Head Evidence

The full phase command completed with exit code 0 at implementation head
`1073791c811d186d97693c1dd11da92eb2ee0d9b` in a disposable, single-ref clone
matching the release workflow's exact-checkout history shape.

| Gate | Exact-head result |
|------|-------------------|
| Clean migration and schema-push lanes | 42 migrations through `20260902000002`; fingerprint `addaf10c46705b423ae5c4554808adc32947e6137584789e70574a28cc28980f`; one assertion attempt per lane; cleanup succeeded |
| Upgrade lane | 22 semantic invariants; 34/34 unit assertions; report `5ff71ae04e3684a83c8f6f1d133681881a46137bfadee9b4abc260f54101fe5c`; one assertion attempt; cleanup succeeded |
| Database SQL | 11 files, 457/457 assertions; one assertion attempt; cleanup succeeded |
| Database HTTP/provider | 4 files, 24/24 assertions; one assertion attempt; cleanup succeeded |
| Edge/evidence | 2 files, 10/10 assertions; one assertion attempt; cleanup succeeded |
| Replay/concurrency | fixture 18/18 and live 8/8; one assertion attempt each; cleanup succeeded |
| Protected fast/static suite | 7 files, 140/140 assertions, including final audit 15/15 |
| Dependency gate | 0 critical, 0 high; report `d8ebf36fbbbb1550a5ff8ddd65bba072bd70d55f72054277f0ba15450a27ab46` |
| Secret gates | history 0 and current 0; report `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945` |
| Bundle/coupling gates | 54 files and 6 workflows; reports `2730d2162e9e45a8bb7761bb48996e7fdcd46926dae7beefbcf2c49bd5a8dd61` and `bc28a54a96c1d4f767b4d1fea9cfcca2bab781ff53000efd5b26f60a98b421d1` |
| Type/lint/build | TypeScript passed; ESLint passed with 0 errors and 3 inherited warnings; Vite/PWA build passed with 3,622 modules and 50 precache entries |

The first local all-ref secret scan also traversed four commits reachable only
from the unrelated upstream `origin/main` remote. None is an ancestor of the
implementation head or part of the fork's release history. A policy-identical
HEAD scan and the authoritative single-ref rerun both returned zero findings;
no secret value was inspected, no finding was accepted, and no exception or
gate change was made.

Plan 07 changed only the release-contract test and validation record; no
rendered UI, navigation, responsive behavior, asset, or deployment surface was
modified, so the Frame rendered-surface loop does not apply to this plan.

## Owner-Controlled and Residual Verification

| Behavior | Requirement | Method |
|----------|-------------|--------|
| Exact implementation head is authorized | CALC-01/03 | Owner approval names PR and full head SHA after reviews/checks. |
| Hosted conversion has zero exceptions | CALC-01 | Protected `release-promote` schema run plus content-addressed post-state receipt. |
| Production uses merged exact contract | CALC-01/03 | Default-branch build receipt plus protected schema receipt; merge alone is insufficient. |
| Rendered invoice presentation remains correct if touched | CALC-01 | Full source/preview/production surface loop only when rendered UI changes. |

## Validation Sign-Off

- [x] Every planned task has a targeted non-watch automated command.
- [x] Every plan owns no more than ten unique files; Plan 04 is the maximum at ten.
- [x] C2-H1 is covered by caller-bound SECURITY DEFINER read RPCs plus pgTAP/live HTTP proof; no authenticated invoice base privilege or read view remains.
- [x] C2-H2 is covered by later exact evidence-helper replacement, immutable `20260901000004`, SQL/Edge replay-conflict proof, and existing protected memberships.
- [x] C2-W1/W2 are covered by seven strict sequential plans with upgrade, database, live Supabase, and FakeRest/preview boundaries split.
- [x] Every new money-bearing path/test is coupled to classifier/Make/static protection in its introducing plan; Plan 07 is audit only.
- [x] Full range, 64/14 limits, exact line items, fingerprint/non-negative rules, bounded D-10 audit, and historical immutability are explicit.
- [x] C3-H1 is bounded to exact invoice-save success and invalid-input rejection with unchanged effects; no Phase 3 save key/fingerprint or conflicting-save assertion remains, and Phase 5 `INV-01` retains business idempotency.
- [x] C3-M1 is covered across upgrade, migration, registry, and live RPC proof: checked `tax_rate numeric(12,9)`, exact ratio derivation, fixed-nine-decimal `8.875000000`/`12.500000000`, separately preserved submitted text, and no new financial version.
- [x] Wave 0 files exist and focused commands pass.
- [x] Full phase command is green at the integrated implementation head.
- [ ] Exact-head merge-group checks and owner approval are retained.
- [ ] Protected hosted schema-promotion receipt proves zero conversion exceptions.

**Approval:** local and CI-equivalent Phase 3 validation is complete at the
recorded implementation head. Exact-head PR approval, merge-group checks, the
merged default-branch build receipt, owner-authorized protected schema
promotion, and provider post-state readback remain pending; no production-live
claim is made.
