---
phase: 03-exact-money-and-rounding-contract
plan: "02"
subsystem: financial-database-primitives
tags: [postgresql, pgtap, bigint, rational-rates, rounding, rls, release-gate]
requires:
  - phase: 03-exact-money-and-rounding-contract
    plan: "01"
    provides: String-only TypeScript money/rate semantics and named rounding fixtures
provides:
  - Immutable versioned USD, ordinary-percentage, and half-away rounding catalogs
  - Hardened exact PostgreSQL parsing, normalization, and signed rounding helpers
  - Protected live pgTAP parity, ACL, boundary, and generated-property proof
affects: [03-03, 03-04, 03-05, 03-06, financial-release-gate]
tech-stack:
  added: []
  patterns: [global force-RLS policy catalog, exact numeric intermediate, narrow security-definer wrapper]
key-files:
  created:
    - supabase/migrations/20260902000001_exact_financial_primitives.sql
    - supabase/tests/database/60_exact_financial_primitives.sql
  modified:
    - makefile
    - tests/release/exact-money-release-static.test.ts
    - scripts/release/run-supabase-lane.mjs
key-decisions:
  - "Global financial policy rows have no tenant sales_id and expose no direct browser or service-role table privilege."
  - "Only three string-oriented public wrappers can invoke the seven private exact-financial helpers."
patterns-established:
  - "Exact PostgreSQL boundary: validate JSON token type and byte length before any numeric or bigint cast"
  - "Self-isolating schema push: the release lane delegates stack ownership to the verifier's disposable random-port target"
requirements-completed: [CALC-01, CALC-03]
duration: 15 min
completed: 2026-09-04
---

# Phase 3 Plan 02: Exact PostgreSQL Primitives Summary

**PostgreSQL now independently enforces the same string-only USD, reduced-rate, signed-bigint, and named half-away rounding contract as the TypeScript runtime.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-09-04T04:04:13Z
- **Completed:** 2026-09-04T04:18:39Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Installed immutable global policy catalogs for `usd-v1`, `ordinary-percentage-v1`, and `half-away-from-zero-v1` with forced RLS, mutation triggers, and no direct browser/service DML.
- Added seven locked private helpers and three narrow authenticated wrappers that validate string JSON tokens and 64/14-byte bounds before exact casts, normalize ratios, and check signed-bigint persistence limits.
- Proved 62 independent exact-financial assertions plus the full 324-assertion protected database suite, including signed endpoints, overflow, malformed tokens, policy mismatch, generated reduction properties, sign symmetry, and monotonic rounding.
- Kept the schema-push release lane usable alongside other local Supabase projects by allowing its already-isolated verifier to own the disposable random-port stack directly.

## Task Commits

Each task was committed with its contract and implementation evidence:

1. **Task 1: Install immutable policies and hardened exact helpers** - `6e7d9778`, `6952aabf`
2. **Task 2: Prove PostgreSQL rate and signed rounding parity independently** - `2bb540e5`
3. **Task 3: Add the primitive pgTAP file to the protected SQL target** - `043debc7`, `70459f2d`
4. **Blocking gate repair: Avoid a redundant primary stack around the self-isolating schema-push verifier** - `1148a56a`, `19d5c206`

## Files Created/Modified

- `supabase/migrations/20260902000001_exact_financial_primitives.sql` - Immutable catalogs, strict exact helpers, public wrappers, ownership, and ACLs.
- `supabase/tests/database/60_exact_financial_primitives.sql` - Live catalog, ACL, parser, rate, rounding, range, and generated-property proof.
- `makefile` - Makes test 60 an explicit protected database SQL member.
- `tests/release/exact-money-release-static.test.ts` - Fails if the new pgTAP contract is removed from the protected target or bypasses the inherited isolated runner.
- `scripts/release/run-supabase-lane.mjs` - Recognizes only the exact self-isolating schema-push verifier command and avoids booting a redundant primary stack.

## Decisions Made

- Financial policy catalogs are server-owned global reference data; tenant `sales_id` ownership is intentionally inapplicable.
- PostgreSQL `numeric` is used only for exact intermediate arithmetic; public wire values remain strings and persistence-bound values remain checked signed `bigint`.
- Browser callers receive no catalog DML or private-helper execution. Only the three explicit public wrappers are granted to authenticated and service roles.

## Deviations from Plan

### Auto-fixed Blocking Infrastructure

**1. Removed the redundant primary-stack bootstrap for the schema-push verifier**

- **Found during:** Task 1 blocking verification
- **Issue:** Another local Supabase project legitimately occupied ports 54321-54324, while `test-financial-schema-push` unnecessarily tried to boot this repo's primary stack before its verifier created a separate random-port disposable target.
- **Fix:** Added an exact command-shape check so only `migration-clean -> verify-migration-chain.mjs schema-push` skips the outer stack. All other lanes retain their existing bootstrap, fixture, retry, redaction, and cleanup behavior.
- **Verification:** Added a failing self-test first; the self-test and exact `make test-financial-schema-push` command then passed without stopping the unrelated project.
- **Commits:** `1148a56a`, `19d5c206`

---

**Total deviations:** 1 auto-fixed blocking infrastructure issue
**Impact on plan:** Required to execute the plan's mandatory Make gate safely; no production or remote state was touched.

## Issues Encountered

- An unrelated `customer-build-platform` Supabase stack occupied the default local ports. Focused database runs used temporary alternate loopback ports, restored before every commit; the schema-push wrapper was then repaired as described above.
- PostgreSQL `power(numeric, integer)` rendered the constructed percentage scale in decimal form. Live pgTAP caught the mismatch, and scale construction now uses exact digit text before normalization.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The immutable PostgreSQL exact kernel and protected live proof are ready for Plan 03-03's closed upgrade verifier.
- No Wave 2 blockers remain.

## Self-Check: PASSED

- Both created key files exist and the repository Supabase config is restored exactly.
- All seven implementation/test commits are present.
- `make test-financial-schema-push` passes with 41 migrations against a disposable random-port loopback project.
- `make test-financial-database-sql` passes 324 assertions across all 10 pgTAP files.
- The focused exact-financial file passes all 62 assertions, the rolling static test passes all 4 checks, and `git diff --check` passes.

---
*Phase: 03-exact-money-and-rounding-contract*
*Completed: 2026-09-04*
