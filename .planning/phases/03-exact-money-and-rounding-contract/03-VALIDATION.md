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
| 03-01-01 | 01 | 1 | CALC-01 | T-03-01, T-03-02 | Money/rate JSON accepts only typed string components, canonicalizes safely, and rejects number/grammar/range violations | unit/property | `npm test -- --run src/components/atomic-crm/financial/exactMoney.test.ts -t 'money|rate|wire'` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 1 | CALC-03 | T-03-03, T-03-04 | BigInt rational rounding is half away from zero, policy-bound, symmetric, and overflow checked | unit/property | `npm test -- --run src/components/atomic-crm/financial/exactMoney.test.ts -t rounding` | ❌ W0 | ⬜ pending |
| 03-02-01 | 02 | 2 | CALC-01, CALC-03 | T-03-03, T-03-05 | Immutable USD/rate/rounding catalogs and private helpers install with exact ACLs and checked ranges | schema push | `make test-financial-schema-push` | ❌ W0 | ⬜ pending |
| 03-02-02 | 02 | 2 | CALC-01, CALC-03 | T-03-01, T-03-03, T-03-05 | Independent PostgreSQL golden/property cases match the named exact policy and reject malformed JSON/numeric tokens | pgTAP | `make test-financial-database-sql` | ❌ W0 | ⬜ pending |
| 03-03-01 | 03 | 3 | CALC-01, CALC-03 | T-03-06, T-03-07 | Upgrade registry authorizes only exact invoice/automation transforms and preserves accepted baselines | Vitest upgrade contract | `npm test -- --run tests/release/migration-upgrade.test.ts -t exact` | existing extended + ❌ W0 | ⬜ pending |
| 03-03-02 | 03 | 3 | CALC-01, CALC-03 | T-03-06, T-03-07, T-03-08 | Invoice, line-item, and automation numerics backfill exactly or stop with safe row/path reasons; legacy becomes projection-only | clean/upgrade/pgTAP | `make test-financial-migration-upgrade && make test-financial-schema-push && make test-financial-database-sql` | ❌ W0 | ⬜ pending |
| 03-04-01 | 04 | 4 | CALC-01, CALC-03 | T-03-01, T-03-08 | Supabase command/projection boundary uses typed string money/rate objects and removes numeric RPC authority | live HTTP/RPC | `node scripts/release/run-supabase-lane.mjs run --lane database-contracts -- npm test -- --run tests/release/exact-money-boundaries.test.ts` | ❌ W0 | ⬜ pending |
| 03-04-02 | 04 | 4 | CALC-01, CALC-03 | T-03-01, T-03-02 | FakeRest and Supabase adapters plus invoice preview share exact validation, errors, fixtures, and output | provider/live + unit | `node scripts/release/run-supabase-lane.mjs run --lane database-contracts -- npm test -- --run src/components/atomic-crm/financial/exactProviderContract.test.ts src/components/atomic-crm/invoices/invoiceCalculations.test.ts` | ❌ W0 + existing extended | ⬜ pending |
| 03-05-01 | 05 | 5 | CALC-01, CALC-03 | T-03-09 | New exact paths/tests are non-optionally coupled to the existing six blocking financial identities | static release | `npm test -- --run tests/release/exact-money-release-static.test.ts` | ❌ W0 | ⬜ pending |
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
  line-item, automation, projection-only, and immutability contracts.
- [ ] `supabase/tests/upgrades/003-exact-money/expected-transformations.json` —
  append-only Phase 3 upgrade contract.
- [ ] `tests/release/exact-money-boundaries.test.ts` — live HTTP/RPC string-token
  and full-`bigint` round-trip proof.
- [ ] `src/components/atomic-crm/financial/exactProviderContract.test.ts` —
  Supabase/FakeRest parity contract.
- [ ] `tests/release/exact-money-release-static.test.ts` — protected path/lane,
  float anti-pattern, legacy RPC, and migration coupling checks.

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
  mismatches, legacy ambiguity, and provider parity are represented.
- [ ] Wave 0 files exist and focused commands pass.
- [ ] Full phase command is green at the integrated implementation head.
- [ ] Exact-head merge-group checks and owner approval are retained.
- [ ] Protected hosted schema-promotion receipt proves zero conversion exceptions.

**Approval:** validation architecture approved for planning; execution evidence
is pending.
