---
phase: 03-exact-money-and-rounding-contract
fixed_at: 2026-09-05T02:05:47Z
review_path: .planning/phases/03-exact-money-and-rounding-contract/03-REVIEW.md
iteration: 2
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 03: Code Review Fix Report

**Fixed at:** 2026-09-05T02:05:47Z  
**Source review:** `.planning/phases/03-exact-money-and-rounding-contract/03-REVIEW.md`  
**Iteration:** 2

**Summary:**

- Findings in scope: 3
- Fixed: 3
- Skipped: 0
- Reviewed source head: `e6a22796c6c5137df1bad77978f2f4ce9d57a889`
- Final source head: `f11490c43f37fbe9fec6d48e75f6137e846a227e`

## Fixed Issues

### CR-01: Nullable legacy invoice issue dates survive migration and poison exact reads

**Status:** fixed: requires human verification  
**Files modified:** `scripts/release/fingerprint-upgrade.mjs`, `supabase/migrations/20260902000002_exact_billing_expand.sql`, `supabase/tests/database/65_exact_billing_conversion.sql`, `supabase/tests/upgrades/003-exact-money/expected-transformations.json`, `tests/release/migration-upgrade.test.ts`, `tests/release/exact-money-release-static.test.ts`  
**Commit:** `ddb155aa924345d654091d01c2d1c207cf8c434d`  
**Applied fix:** Adds a fail-closed `EXACT_BILLING_LEGACY_ISSUE_DATE_REQUIRED` check immediately after the migration transaction begins, before any schema or data mutation, and enforces `invoices.issue_date NOT NULL` only after the check succeeds. The staged upgrade runner now injects a pre-Phase-3 NULL issue-date fixture, proves the classified abort occurs with no exact column, save RPC, or migration record partially created, restores the captured historical date without guessing or imputing one, and then completes the normal upgrade. SQL, semantic-fingerprint, and static tests lock the invariant and exact/compatibility read behavior.

### WR-01: Exact SQL save accepts relative and noncanonical invoice dates

**Status:** fixed: requires human verification  
**Files modified:** `supabase/migrations/20260902000002_exact_billing_expand.sql`, `supabase/tests/database/65_exact_billing_conversion.sql`, `tests/release/exact-money-boundaries.test.ts`, `src/components/atomic-crm/financial/exactProviderContract.test.ts`, `tests/release/exact-money-release-static.test.ts`  
**Commit:** `00d0a9158b6b3b7e5ff178f8402fba62d139bdea`  
**Applied fix:** Adds a private, privilege-locked canonical date parser at the SQL boundary. Required `issue_date` and non-null `due_date` must be real, round-tripping `YYYY-MM-DD` strings; guarded casts collapse malformed, relative, locale-formatted, and impossible dates to the stable public `INVOICE_SAVE_INVALID_REQUEST` error. Direct SQL, live PostgREST, and both provider contracts reject `today`, `tomorrow`, locale formats, and impossible dates without effects, while accepting valid canonical and leap dates.

### WR-02: FakeRest and the Supabase harness permit non-Draft invoice rewrites

**Status:** fixed: requires human verification  
**Files modified:** `src/components/atomic-crm/providers/fakerest/dataGenerator/billingAccounts.ts`, `src/components/atomic-crm/providers/fakerest/dataProvider.ts`, `src/components/atomic-crm/financial/exactProviderContract.test.ts`, `tests/release/exact-money-release-static.test.ts`  
**Commit:** `f11490c43f37fbe9fec6d48e75f6137e846a227e`  
**Applied fix:** Gives the shared fixtures explicit Draft, Sent, and Paid states and makes both FakeRest and the Supabase RPC harness reject any update whose stored invoice is not Draft before calculation or mutation. The shared dual-provider contract proves Sent and Paid saves return the stable response error and leave the complete invoice plus invoice/audit effect counts unchanged.

## Verification

The complete Phase 03 financial, security, compiler, lint, and production-build gate passed at `f11490c43f37fbe9fec6d48e75f6137e846a227e`:

- Clean migration-chain proof: 42/42 migrations, first attempt
- Schema-push proof: 42/42 migrations, first attempt
- Staged upgrade: one expected classified NULL-fixture abort, one successful assertion attempt, 23/23 semantic invariants
- Upgrade verifier: 37/37
- Database SQL assertions: 482/482
- Auth, PostgREST, and provider assertions: 28/28
- Edge and evidence function assertions: 10/10
- Replay/concurrency SQL assertions: 18/18
- Replay/concurrency Vitest assertions: 8/8
- Fast financial/security assertions: 140/140
- Total executable assertions/tests: 723/723
- Dependency gate: 0 critical, 0 high
- Immutable single-ref secret history and current-tree gates: 0 findings
- Workflow coupling gate: 6 workflows checked
- Built-bundle gate: 54 files checked
- Typecheck, lint, and production build: passed

Focused verification also passed: CR-01 static/upgrade tests 52/52 and SQL 45/45; WR-01 SQL 56/56, live PostgREST 13/13, and focused TypeScript 30 passed with 8 intentionally environment-skipped; WR-02 shared provider/static tests 27/27.

Lint retained three pre-existing Fast Refresh warnings and no errors. The build retained existing CSS import-order, bundle-size, deprecation, and browser-data freshness warnings but exited successfully. The repository-wide all-ref secret scan remains blocked by four legacy-history fingerprints outside this exact source ref; no exception, allowlist, or gate weakening was introduced, and the immutable depth-one final-ref scan is clean.

---

_Fixed: 2026-09-05T02:05:47Z_  
_Fixer: the agent (gsd-code-fixer)_  
_Iteration: 2_
