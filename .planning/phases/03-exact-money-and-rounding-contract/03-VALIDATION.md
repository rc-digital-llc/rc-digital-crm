---
phase: 3
slug: exact-money-and-rounding-contract
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-02
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for integer minor units, reduced rates, named
> rounding, exact legacy conversion, and string-safe provider boundaries.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.4 + pgTAP through isolated Supabase CLI/PostgreSQL 17 lanes |
| **Config files** | `vite.config.ts`, `supabase/config.toml`, `makefile`, `.github/release/release-policy.json` |
| **Quick run command** | `npm test -- --run src/components/atomic-crm/financial/exactMoney.test.ts` |
| **Database command** | `make test-financial-database-contracts` |
| **Upgrade command** | `make test-financial-migration-upgrade && make test-financial-schema-push` |
| **Full phase command** | `make financial-gate && npm run typecheck && npm run lint && npm run build` |
| **Estimated runtime** | ~15 seconds quick; ~20 minutes full local gate |

## Sampling Rate

- **After every task commit:** run its focused command below plus
  `git diff --check`. Database commands may target only the isolated loopback
  stack created by the release runner.
- **After every wave:** run the affected financial lane; add `npm run typecheck`
  for any TypeScript wave.
- **Before PR readiness:** full phase command is green at the exact head. No UI
  receipt is required unless implementation changes rendered invoice UI.
- **Before merge:** require exact-head owner approval and fresh merge-group checks.
- **After authorized release:** require a successful build receipt and protected
  schema-promotion post-state receipt before claiming the contract is live.
- **Retry policy:** no assertion retry. The inherited classified local-stack
  bootstrap retry is the only permitted infrastructure retry.
- **Maximum focused feedback latency:** 90 seconds; live database tasks may use
  their full bounded lane timeout.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | CALC-01 | T-03-01, T-03-02, T-03-04 | Money/rate JSON accepts only typed string components, enforces 64-byte integer/14-byte percentage limits before parsing, canonicalizes safely, and keeps D-10 submitted text as evidence without financial versioning | unit/property | `npm test -- --run src/components/atomic-crm/financial/exactMoney.test.ts -t 'money|rate|wire'` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 1 | CALC-03 | T-03-03, T-03-04 | BigInt rational rounding is half away from zero, policy-bound, symmetric, and overflow checked | unit/property | `npm test -- --run src/components/atomic-crm/financial/exactMoney.test.ts -t rounding` | ❌ W0 | ⬜ pending |
| 03-01-03 | 01 | 1 | CALC-01, CALC-03 | T-03-09 | First exact source/unit/static paths enter the financial classifier and protected fast list in their creation wave | static + protected fast | `npm test -- --run tests/release/exact-money-release-static.test.ts && make test-financial-fast` | ❌ W0 + existing extended | ⬜ pending |
| 03-02-01 | 02 | 2 | CALC-01, CALC-03 | T-03-03, T-03-04, T-03-05 | Immutable USD/rate/rounding catalogs and private helpers install with exact ACLs, pre-cast length bounds, and checked ranges | schema push | `make test-financial-schema-push` | ❌ W0 | ⬜ pending |
| 03-02-02 | 02 | 2 | CALC-01, CALC-03 | T-03-01, T-03-03, T-03-05 | Independent PostgreSQL golden/property cases match the named exact policy and reject malformed JSON/numeric tokens | explicit isolated pgTAP | `node scripts/release/run-supabase-lane.mjs run --lane database-contracts -- supabase test db supabase/tests/database/60_exact_financial_primitives.sql --local` | ❌ W0 | ⬜ pending |
| 03-02-03 | 02 | 2 | CALC-01, CALC-03 | T-03-09 | Test 60 joins `FINANCIAL_DATABASE_SQL_TESTS` in Wave 2 and is both statically and behaviorally executed | static + pgTAP target | `npm test -- --run tests/release/exact-money-release-static.test.ts && make test-financial-database-sql` | existing extended | ⬜ pending |
| 03-03-01 | 03 | 3 | CALC-01, CALC-03 | T-03-06, T-03-07 | Upgrade registry authorizes only exact transforms and pins accepted baselines plus both Phase 2 migrations byte-identically | Vitest upgrade contract | `npm test -- --run tests/release/migration-upgrade.test.ts -t exact` | existing extended + ❌ W0 | ⬜ pending |
| 03-03-02 | 03 | 3 | CALC-01, CALC-03 | T-03-06–T-03-08, T-03-10–T-03-12 | Later migration closes direct invoice authority, defines exact line items, preserves full-range compatibility, adds canonical automation fingerprints/non-negative checks, and bounds D-10 to submitted text plus existing audit | clean/upgrade/explicit pgTAP | `make test-financial-migration-upgrade && make test-financial-schema-push && node scripts/release/run-supabase-lane.mjs run --lane database-contracts -- supabase test db supabase/tests/database/65_exact_billing_conversion.sql --local` | ❌ W0 | ⬜ pending |
| 03-03-03 | 03 | 3 | CALC-01, CALC-03 | T-03-08–T-03-11 | All four inherited numeric/direct-table callers migrate; exact identical/conflicting replay and negative inputs are proven; test 65 and upgrade Vitest enter permanent protected targets | SQL/HTTP/replay/static | `npm test -- --run tests/release/exact-money-release-static.test.ts && make test-financial-migration-upgrade && make test-financial-database-contracts && make test-financial-replay-concurrency` | existing extended | ⬜ pending |
| 03-04-01 | 04 | 4 | CALC-01, CALC-03 | T-03-01, T-03-08, T-03-10, T-03-12 | Live HTTP denies direct invoice table access, uses exact view/RPC strings, rejects numeric/overlong tokens, and round-trips both signed endpoints through compatibility projection | live HTTP/RPC | `node scripts/release/run-supabase-lane.mjs run --lane database-contracts -- npm test -- --run tests/release/exact-money-boundaries.test.ts` | ❌ W0 | ⬜ pending |
| 03-04-02 | 04 | 4 | CALC-01, CALC-03 | T-03-01, T-03-02 | FakeRest/Supabase and preview share exact named line-item fields, D-10 evidence semantics, validation, errors, fixtures, and output | provider/live + unit | `node scripts/release/run-supabase-lane.mjs run --lane database-contracts -- npm test -- --run src/components/atomic-crm/financial/exactProviderContract.test.ts src/components/atomic-crm/invoices/invoiceCalculations.test.ts` | ❌ W0 + existing extended | ⬜ pending |
| 03-04-03 | 04 | 4 | CALC-01, CALC-03 | T-03-09 | Boundary/provider tests enter protected HTTP and preview/unit tests enter protected fast in Wave 4; all source paths classify as financial | static + permanent targets | `npm test -- --run tests/release/exact-money-release-static.test.ts && make test-financial-database-http && make test-financial-fast` | existing extended | ⬜ pending |
| 03-05-01 | 05 | 5 | CALC-01, CALC-03 | T-03-09 | Final audit proves Plans 01–04 performed same-wave coupling and every exact path/test remains non-optional in the existing six identities | static release audit | `npm test -- --run tests/release/exact-money-release-static.test.ts` | ❌ W0 | ⬜ pending |
| 03-05-02 | 05 | 5 | CALC-01, CALC-03 | T-03-01–T-03-09 | Full financial, type, lint, and build proof passes at the integrated implementation head | integrated | `make financial-gate && npm run typecheck && npm run lint && npm run build` | existing extended | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

## Wave 0 Requirements

- [ ] `src/components/atomic-crm/financial/exactFinancialFixtures.ts` — shared
  golden wire/rate/rounding/boundary vectors.
- [ ] `src/components/atomic-crm/financial/exactMoney.test.ts` — strict grammar,
  canonicalization, exact-rate, rounding, range, and property tests.
- [ ] `supabase/tests/database/60_exact_financial_primitives.sql` — catalog,
  helper, ACL, signed-tie, and malformed-input contracts.
- [ ] `supabase/tests/database/65_exact_billing_conversion.sql` — invoice,
  direct-table denial, named line-item, full-range compatibility, automation
  fingerprint/non-negative, D-10 audit, projection-only, and immutability contracts.
- [ ] `supabase/tests/upgrades/003-exact-money/expected-transformations.json` —
  append-only Phase 3 upgrade contract.
- [ ] `tests/release/exact-money-boundaries.test.ts` — live HTTP/RPC string-token
  direct invoice-table denial, pre-parse length limits, and full-`bigint`
  exact/compatibility round-trip proof.
- [ ] `src/components/atomic-crm/financial/exactProviderContract.test.ts` —
  Supabase/FakeRest parity contract.
- [ ] `tests/release/exact-money-release-static.test.ts` — protected path/lane,
  rolling same-wave Make/classifier membership, float anti-pattern, legacy RPC,
  immutable historical migration, and final coupling checks.

## Owner-Controlled and Residual Verification

| Behavior | Requirement | Method |
|----------|-------------|--------|
| Exact implementation head is authorized | CALC-01, CALC-03 | Owner approval names the PR and full head SHA after all reviews/checks. |
| Hosted conversion has zero exceptions and exact before/after state | CALC-01 | Protected `release-promote` schema run and content-addressed post-state receipt. |
| Production uses the merged exact contract | CALC-01, CALC-03 | Default-branch build receipt plus protected schema receipt; merge alone is insufficient. |
| Rendered invoice presentation remains correct if touched | CALC-01 | Build-gate source/preview/production receipts only if implementation affects rendered UI. |

## Validation Sign-Off

- [x] Every planned task has a targeted non-watch automated command.
- [x] No three consecutive tasks lack automated verification.
- [x] Every missing Wave 0 file is named and assigned to a plan.
- [x] Live PostgreSQL/HTTP behavior—not source strings—is authoritative for
  database and wire acceptance.
- [x] The full `bigint` range, signed ties, malformed numeric tokens, policy
  mismatches, pre-parse length bounds, direct invoice denial, exact line-item
  schema, compatibility capacity, replay fingerprints, non-negative automation,
  legacy ambiguity, and provider parity are represented.
- [x] Each Wave 1–4 plan adds its new money-bearing paths/tests to the protected
  classifier and Make target in the same wave; Plan 05 is the final audit.
- [ ] Wave 0 files exist and focused commands pass.
- [ ] Full phase command is green at the integrated implementation head.
- [ ] Exact-head merge-group checks and owner approval are retained.
- [ ] Protected hosted schema-promotion receipt proves zero conversion exceptions.

**Approval:** validation architecture approved for planning; execution evidence
is pending.
