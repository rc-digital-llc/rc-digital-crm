---
phase: 03-exact-money-and-rounding-contract
plan: "02"
subsystem: database
tags: [postgresql, supabase, pgtap, exact-money, rational-rates, rounding, rls]

requires:
  - phase: 03-01
    provides: String-only USD minor units, reduced ordinary-percentage rates, named half-away rounding, and independent fixtures
provides:
  - Immutable versioned currency, rate, and rounding policy catalogs
  - Hardened exact PostgreSQL parsers, ratio reducers, and signed rounding helpers
  - Independent 147-assertion pgTAP proof with golden, property, boundary, and ACL coverage
  - Same-wave protected SQL target coupling for the PostgreSQL primitive contract
affects: [03-03, 03-04, 03-05, 03-06, 03-07, calculations, invoices, billing]

tech-stack:
  added: []
  patterns:
    - Checked bigint persistence with wider exact numeric intermediates
    - Immutable server-owned reference catalogs behind forced RLS
    - String-only JSON financial boundaries with stable non-reflective errors
    - Private empty-search-path helpers behind least-privilege public wrappers

key-files:
  created:
    - supabase/migrations/20260902000001_exact_financial_primitives.sql
    - supabase/tests/database/60_exact_financial_primitives.sql
  modified:
    - makefile
    - tests/release/exact-money-release-static.test.ts

key-decisions:
  - "Financial policy catalogs are global server-owned reference data: authenticated callers may read them, browser roles cannot mutate them, forced RLS applies, and tenant sales_id ownership is explicitly inapplicable."
  - "PostgreSQL numeric is restricted to wider exact intermediates; canonical components and rounded outputs must fit checked signed bigint and cross public JSON boundaries as strings."
  - "Exact public wrappers require explicit currency, exponent, rate-policy, and rounding-policy identities, while private helpers retain empty search paths and no browser execution authority."

patterns-established:
  - "Database exact codec: require JSON string tokens, enforce ASCII byte limits before casts, canonicalize, then check signed-bigint persistence bounds."
  - "Policy-bound rounding: validate immutable identities before one signed half-away-from-zero conversion at the explicit minor-unit boundary."
  - "Independent parity proof: translate runtime fixtures into live PostgreSQL golden/property assertions without importing TypeScript implementation logic."

requirements-completed: [CALC-01, CALC-03]

duration: 32 min
completed: 2026-09-04
---

# Phase 3 Plan 02: Exact PostgreSQL Financial Primitives Summary

**Immutable PostgreSQL policy catalogs and string-safe exact helpers with 147 live parity assertions and non-optional protected SQL execution**

## Performance

- **Duration:** 32 min
- **Started:** 2026-09-04T20:12:15Z
- **Completed:** 2026-09-04T20:44:15Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Added exact `usd-v1`, `ordinary-percentage-v1`, and `half-away-from-zero-v1` catalogs with checked canonical components, forced RLS, immutable seeded rows, and no browser DML authority.
- Added hardened parsers, reduction, and signed-rounding boundaries that reject numeric JSON tokens, enforce 64/14-byte limits before casts, keep denominators positive, and return checked bigint-compatible strings.
- Proved TypeScript parity independently in PostgreSQL with 147 catalog, ACL, parser, golden, boundary, overflow, and deterministic property assertions.
- Wired the new pgTAP contract into the inherited isolated SQL target; the complete lane passed 10 files and 409 assertions.

## Task Commits

Each task was committed atomically, with failing RED contracts before GREEN behavior where implementation was required:

1. **Task 1: Install immutable policies and hardened exact helpers** - `7a9b04cc` (test), `5a920ad3` (feat)
2. **Task 2: Prove PostgreSQL rate and signed rounding parity independently** - `64a46747` (test)
3. **Task 3: Add the primitive pgTAP file to the protected SQL target** - `207f6ac5` (test), `eae66676` (chore)

**Plan metadata:** this documentation commit

## Files Created/Modified

- `supabase/migrations/20260902000001_exact_financial_primitives.sql` - Immutable policy catalogs plus hardened private helpers and narrow public exact-value wrappers.
- `supabase/tests/database/60_exact_financial_primitives.sql` - 147 live pgTAP assertions for catalogs, ACLs, parsing, rate reduction, signed rounding, bounds, and algebraic properties.
- `makefile` - Executes test 60 explicitly inside `FINANCIAL_DATABASE_SQL_TESTS`.
- `tests/release/exact-money-release-static.test.ts` - Rejects omission of test 60 and direct unisolated SQL execution.

## Decisions Made

- Modeled the three policy catalogs as global reference data rather than tenant-owned rows, because their version identities must be stable across every account and replay.
- Kept wider `numeric` values internal to exact arithmetic and emitted canonical strings only after signed-bigint range checks, matching the Plan 01 runtime/wire contract.
- Granted authenticated and service callers only the intended public wrappers; private implementation functions remain non-executable by browser roles and all privileged functions use fully qualified objects with an empty search path.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Another isolated checkout already owned canonical local Supabase port 54322. The schema-push gate used a disposable worktree-local outer stack on alternate loopback ports while leaving the checked-in canonical config and the verifier's own disposable target unchanged. Both stacks cleaned up successfully and all temporary files were removed before commits.
- This worktree initially had no `node_modules`. The static test reused an installed tree from a checkout with the identical package-lock fingerprint through a temporary symlink; no dependency was installed or changed, and the symlink was removed after verification.
- The completed pgTAP proof initially declared 146 planned assertions while executing 147. Correcting the declaration produced the required exact plan and a 147/147 focused pass.

## TDD Gate Compliance

- Task 1 recorded a failing pgTAP RED commit before the migration GREEN commit.
- Task 2 was proof-only: its new independent assertions passed against Task 1's completed helper surface and required no production-code change.
- Task 3 recorded a failing static coupling RED commit before Makefile wiring made the protected target GREEN.

## Verification

- `make test-financial-schema-push` - PASS; 41 migrations through `20260902000001`, ordered-chain SHA-256 `fa50cc7fce01f3e1945d2439022408abee25a7a98c247a0d072582ff23676afd`.
- Focused test 60 through the isolated database runner - PASS; 147/147 assertions.
- `make test-financial-database-sql` - PASS; 10 files, 409 assertions.
- `npm test -- --run tests/release/exact-money-release-static.test.ts` - PASS; 5/5 tests.
- `git diff --check` - PASS.

## Known Stubs

None. The empty arrays in the static analyzer are local error accumulators, and the empty search-path string asserted by pgTAP is the required hardened function configuration.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Later Phase 3 plans can consume one immutable database vocabulary for USD, ordinary percentages, exact ratios, and named signed rounding.
- The public boundary is independently proven against unsafe token types, excessive input, unsupported policy identities, invalid denominators, signed endpoints, and overflow.
- No hosted database, production service, deployment, dependency set, or external configuration changed.

## Self-Check: PASSED

All four plan files and all five task commits were verified locally before the planning metadata update.

---
*Phase: 03-exact-money-and-rounding-contract*
*Completed: 2026-09-04*
