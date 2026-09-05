---
phase: 03-exact-money-and-rounding-contract
fixed_at: 2026-09-05T01:16:04Z
review_path: .planning/phases/03-exact-money-and-rounding-contract/03-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Phase 03: Code Review Fix Report

**Fixed at:** 2026-09-05T01:16:04Z  
**Source review:** `.planning/phases/03-exact-money-and-rounding-contract/03-REVIEW.md`  
**Iteration:** 1

**Summary:**

- Findings in scope: 7
- Fixed: 7
- Skipped: 0
- Final source head: `9967cf0beaf141f3826ca99967c89f92a5082985`

## Fixed Issues

### CR-01: The fingerprint backfill makes every historical evidence replay conflict

**Status:** fixed: requires human verification  
**Files modified:** `scripts/release/fingerprint-upgrade.mjs`, `supabase/migrations/20260902000002_exact_billing_expand.sql`, `supabase/tests/database/40_billing_evidence.sql`, `supabase/tests/database/65_exact_billing_conversion.sql`, `supabase/tests/upgrades/003-exact-money/expected-transformations.json`, `tests/release/migration-upgrade.test.ts`  
**Commit:** `e4be4821ab78ddd7c7a2caea3694b9d88b5c38f8`  
**Applied fix:** Classifies legacy evidence executions, reconstructs their exact effect only from a unique historical execution/grant/evidence/audit binding, aborts the migration on ambiguity, and verifies a pre-cutover inspection replays as a duplicate after the Phase 3 cutover.

### CR-02: Exact save can rewrite issued and paid invoices and revert them to Draft

**Status:** fixed: requires human verification  
**Files modified:** `supabase/migrations/20260902000002_exact_billing_expand.sql`, `supabase/tests/database/65_exact_billing_conversion.sql`, `tests/release/exact-money-boundaries.test.ts`  
**Commit:** `468df918f081ba2b07cf6bb76fb1884c2a79b2ab`  
**Applied fix:** Restricts exact saves to stored draft invoices and adds an atomic database trigger that protects issued snapshot fields and prevents transitions back to Draft. Direct SQL and live HTTP tests prove rejected Sent and Paid rewrites leave invoice and audit state unchanged.

### CR-03: Same-tenant administrators are denied their assigned invoice write capability

**Status:** fixed: requires human verification  
**Files modified:** `supabase/migrations/20260902000002_exact_billing_expand.sql`, `tests/release/exact-money-boundaries.test.ts`  
**Commit:** `0b3c6c09dcb0343d326bd9be5973b02f72006aa0`  
**Applied fix:** Separates capability authorization from responsible ownership: same-tenant administrators may create and update invoices when granted the capability, creation derives exactly one current account owner, updates preserve immutable `sales_id`, and missing or ambiguous ownership fails closed.

### WR-01: Evidence replay selects an arbitrary historical principal after rotation

**Status:** fixed: requires human verification  
**Files modified:** `scripts/release/fingerprint-upgrade.mjs`, `supabase/migrations/20260902000002_exact_billing_expand.sql`, `supabase/tests/database/40_billing_evidence.sql`, `supabase/tests/database/65_exact_billing_conversion.sql`, `supabase/tests/upgrades/003-exact-money/expected-transformations.json`, `tests/release/migration-upgrade.test.ts`  
**Commit:** `e4be4821ab78ddd7c7a2caea3694b9d88b5c38f8`  
**Applied fix:** Resolves replay through an active, valid principal using the same tenant, status, and validity predicates as grant consumption. Regression coverage includes a disabled predecessor and an active replacement principal for the same authenticated user.

### WR-02: Accepted page values can overflow PostgreSQL OFFSET and diverge from FakeRest

**Status:** fixed: requires human verification  
**Files modified:** `src/components/atomic-crm/providers/types.ts`, `src/components/atomic-crm/providers/supabase/dataProvider.ts`, `src/components/atomic-crm/providers/fakerest/dataProvider.ts`, `src/components/atomic-crm/financial/exactProviderContract.test.ts`, `supabase/migrations/20260902000002_exact_billing_expand.sql`, `supabase/tests/database/65_exact_billing_conversion.sql`, `tests/release/exact-money-boundaries.test.ts`  
**Commit:** `ab4a346715f2024c2a0c0dac9d9d17cafa618600`  
**Applied fix:** Establishes one maximum accepted page (`1,000,000`) and enforces it consistently in both providers plus exact and legacy SQL reads, before offset evaluation. Tests cover the accepted maximum, the first rejected page, and stable public errors.

### WR-03: FakeRest hard-codes a creation date that the real RPC derives at runtime

**Status:** fixed: requires human verification  
**Files modified:** `src/components/atomic-crm/providers/types.ts`, `src/components/atomic-crm/providers/supabase/dataProvider.ts`, `src/components/atomic-crm/providers/fakerest/dataProvider.ts`, `src/components/atomic-crm/financial/exactProviderContract.test.ts`, `supabase/migrations/20260902000002_exact_billing_expand.sql`, `supabase/tests/database/65_exact_billing_conversion.sql`  
**Commit:** `e85684414a84face948b05c8a12b6d7060f00d76`  
**Applied fix:** Makes `issue_date` explicit and required across the public type, both provider parsers, harness, and SQL boundary; removes all wall-clock and hard-coded fallbacks; and verifies omitted dates fail identically without effects.

### WR-04: The invalid-save matrix can pass when the targeted validators are broken

**Status:** fixed  
**Files modified:** `tests/release/exact-money-boundaries.test.ts`  
**Commits:** `6d501d126db2ef9f4bad42e48ea418782be78b38`, `9967cf0beaf141f3826ca99967c89f92a5082985`  
**Applied fix:** Rebuilds the invalid-save matrix from a proven valid one-minor-unit request, mutates exactly one field per case, and asserts every rejection leaves invoice and audit effects unchanged. Dedicated organization fixtures also isolate exact-boundary effects from the concurrently executed tenancy suite.

## Verification

The complete Phase 03 command `make financial-gate && npm run typecheck && npm run lint && npm run build` passed at `9967cf0beaf141f3826ca99967c89f92a5082985` in an isolated single-ref clone:

- Upgrade tests: 35/35
- Database SQL assertions: 471/471
- Auth/HTTP/provider tests: 26/26
- Edge/evidence tests: 10/10
- Replay/concurrency SQL assertions: 18/18
- Replay/concurrency Vitest assertions: 8/8
- Fast financial/security assertions: 140/140
- Total: 708/708
- Dependency gate: 0 critical, 0 high
- Secret-history and current-tree gates: 0 findings
- Bundle gate: 54 files checked
- Automation-identity coupling gate: 6 workflows checked
- Typecheck, lint, and production build: passed

The lint lane reports three pre-existing Fast Refresh warnings and no errors. The build reports existing CSS import-order, bundle-size, deprecation, and browser-data freshness warnings but exits successfully. A shared-repository all-ref secret scan separately identified four findings only on unrelated, non-ancestor refs; the isolated source-ref gate above confirms the Phase 03 history and current tree are clean.

---

_Fixed: 2026-09-05T01:16:04Z_  
_Fixer: the agent (gsd-code-fixer)_  
_Iteration: 1_
