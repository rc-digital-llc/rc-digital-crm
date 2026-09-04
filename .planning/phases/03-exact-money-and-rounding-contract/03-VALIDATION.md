---
phase: 3
slug: exact-money-and-rounding-contract
status: validated
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
| 03-01-01 | 01 | 1 | CALC-01 | T-03-01/02/04 | String-only money/rate, 64/14 pre-parse limits, canonical zero, bounded D-10 evidence | `npm test -- --run src/components/atomic-crm/financial/exactMoney.test.ts -t 'money|rate|wire'` | ✅ green |
| 03-01-02 | 01 | 1 | CALC-03 | T-03-03/04 | BigInt half-away signed rounding and checked persistence range | `npm test -- --run src/components/atomic-crm/financial/exactMoney.test.ts -t rounding` | ✅ green |
| 03-01-03 | 01 | 1 | CALC-01/03 | T-03-09 | First exact source/unit/static paths enter protected fast/classifier contract | `npm test -- --run tests/release/exact-money-release-static.test.ts && make test-financial-fast` | ✅ green |
| 03-02-01 | 02 | 2 | CALC-01/03 | Immutable catalogs/helpers install with exact ACLs, lengths, and ranges | `make test-financial-schema-push` | ✅ green |
| 03-02-02 | 02 | 2 | CALC-01/03 | Independent PostgreSQL golden/property/token proof | `node scripts/release/run-supabase-lane.mjs run --lane database-contracts -- supabase test db supabase/tests/database/60_exact_financial_primitives.sql --local` | ✅ green |
| 03-02-03 | 02 | 2 | CALC-01/03 | Test 60 joins protected SQL target in Wave 2 | `npm test -- --run tests/release/exact-money-release-static.test.ts && make test-financial-database-sql` | ✅ green |
| 03-03-01 | 03 | 3 | CALC-01/03 | T-03-07/02 | Closed upgrade vocabulary, exact text, immutable 00002/00003/00004 hashes, and tax-rate type/check/derivation/output fingerprints | `npm test -- --run tests/release/migration-upgrade.test.ts -t exact` | ✅ green |
| 03-03-02 | 03 | 3 | CALC-01/03 | T-03-09 | Runner Vitest/static checks join protected upgrade contract before cutover | `npm test -- --run tests/release/exact-money-release-static.test.ts && make test-financial-migration-upgrade` | ✅ green |
| 03-04-01 | 04 | 4 | CALC-01/03 | T-03-10/13/06/11/14/12 | Atomic cutover revokes table/sequence, installs closed caller-bound read/write RPCs, widens derived `tax_rate` compatibility to `numeric(12,9)`, preserves submitted evidence, and registers exact fingerprints | `make test-financial-migration-upgrade && make test-financial-schema-push && node scripts/release/run-supabase-lane.mjs run --lane database-contracts -- supabase test db supabase/tests/database/65_exact_billing_conversion.sql --local` | ✅ green |
| 03-04-02 | 04 | 4 | CALC-01/03 | T-03-11/14 | Tests 35/40/65 and fixtures prove exact success, replay, conflict, ACL, canonical zero, and unchanged evidence/audit/grant/execution state | `node scripts/release/run-supabase-lane.mjs run --lane database-contracts -- supabase test db supabase/tests/database/35_billing_automation.sql supabase/tests/database/40_billing_evidence.sql supabase/tests/database/65_exact_billing_conversion.sql --local` | ✅ green |
| 03-04-03 | 04 | 4 | CALC-01/03 | T-03-09/14 | Replay/evidence live callers migrate and every Wave 4 path remains protected | `npm test -- --run tests/release/exact-money-release-static.test.ts && make test-financial-migration-upgrade && make test-financial-database-sql && make test-financial-functions && make test-financial-replay-concurrency` | ✅ green |
| 03-05-01 | 05 | 5 | CALC-01 | T-03-10/13/01 | React Admin/Supabase list/get/save use validated exact RPCs; save has no Phase 3 idempotency key/fingerprint | `npm run typecheck` | ✅ green |
| 03-05-02 | 05 | 5 | CALC-01/03 | T-03-10/13/01/12 | Live same-tenant success, cross-tenant/direct denial, exact-save success/invalid zero effects, full-range strings, and `8.875000000`/`12.500000000` rate compatibility with evidence preserved | `node scripts/release/run-supabase-lane.mjs run --lane database-contracts -- npm test -- --run tests/release/exact-money-boundaries.test.ts tests/release/billing-tenancy.test.ts` | ✅ green |
| 03-05-03 | 05 | 5 | CALC-01/03 | T-03-09 | Supabase source/live tests enter protected HTTP/classifier/static contract | `npm test -- --run tests/release/exact-money-release-static.test.ts && make test-financial-database-http` | ✅ green |
| 03-06-01 | 06 | 6 | CALC-01/03 | T-03-01/15 | FakeRest matches closed Supabase requests/results/errors, canonical line items, and exact-save success/invalid zero effects without invoice-save idempotency | `node scripts/release/run-supabase-lane.mjs run --lane database-contracts -- npm test -- --run src/components/atomic-crm/financial/exactProviderContract.test.ts` | ✅ green |
| 03-06-02 | 06 | 6 | CALC-01/03 | T-03-02/03 | Preview delegates to named BigInt exact arithmetic and rejects float authority | `npm test -- --run src/components/atomic-crm/invoices/invoiceCalculations.test.ts && npm run typecheck` | ✅ green |
| 03-06-03 | 06 | 6 | CALC-01/03 | T-03-09 | Provider parity/preview paths enter protected HTTP/fast/classifier contracts | `npm test -- --run tests/release/exact-money-release-static.test.ts && make test-financial-database-http && make test-financial-fast` | ✅ green |
| 03-07-01 | 07 | 7 | CALC-01/03 | T-03-09/10/14 | Final audit proves rolling coupling and Cycle 2 security closure | `npm test -- --run tests/release/exact-money-release-static.test.ts` | ✅ green |
| 03-07-02 | 07 | 7 | CALC-01/03 | all | Integrated exact-head financial/type/lint/build proof | `make financial-gate && npm run typecheck && npm run lint && npm run build` | ✅ green |

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
- [x] Full phase command is green at integrated implementation head `4926489a421d1448d4c6fb5055489a273d4ccf87`.
- [ ] Exact-head merge-group checks and owner approval are retained.
- [ ] Protected hosted schema-promotion receipt proves zero conversion exceptions.

**Approval:** automated Phase 3 local validation is complete. Exact-head
merge-group checks, owner approval, the default-branch build, protected hosted
schema promotion, and provider readback remain pending release-stage evidence.

## Final Execution Evidence

The complete no-assertion-retry command passed on Node 22 at implementation
head `4926489a421d1448d4c6fb5055489a273d4ccf87` on 2026-09-04:

- Clean replay and isolated schema push covered 43 migrations, from
  `20240730075029` through `20260903000001`; filename-set SHA-256
  `d91c5166fa08955c9efc6616725c49c107d4dffa66b761770de0f394fcfd72f3`.
- Representative upgrade passed 22 Vitest assertions and produced report
  SHA-256 `d2c5a224d498508d88b56894a448cb0b5df7dc507c1296d36acc42e9ce4fe039`.
- Eleven pgTAP files passed 389 assertions; Auth/HTTP/provider passed 12 tests;
  Edge/functions passed 10; the replay fixture passed 18 assertions; and
  replay/concurrency passed 8 tests.
- Nine fast/static files passed 119 tests, including all 12 final exact-money
  release-audit assertions.
- Dependency enforcement reported zero critical/high advisories; history and
  current-tree secret scans each reported zero findings; the bundle contained
  54 files; and all six protected workflow identities remained decoupled.
- Typecheck, lint, and production build passed. Lint retained three inherited
  Fast Refresh warnings and no errors; build retained inherited CSS-order,
  bundle-size, and Browserslist warnings.

The final local run used temporary alternate loopback Supabase ports because
another local stack occupied the canonical range; the checked-in configuration
was restored afterward. The official npm audit endpoint repeatedly exceeded the
bounded five-minute request window, so the successful final command used the
npm-compatible Yarn registry transport. Its result matched the earlier official
npm response: 10 moderate advisories and zero high or critical advisories. No
repository or CI registry setting changed.

No rendered component, layout, navigation, canonical URL, or deployed asset was
changed in Phase 3, so a rendered surface receipt does not apply. These local
receipts do not prove merge, hosted schema state, provider readback, or
production rollout.
