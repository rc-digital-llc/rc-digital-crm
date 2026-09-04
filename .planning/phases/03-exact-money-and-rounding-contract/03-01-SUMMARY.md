---
phase: 03-exact-money-and-rounding-contract
plan: "01"
subsystem: financial
tags: [typescript, bigint, exact-money, rational-rates, rounding, vitest]

requires:
  - phase: 02-tenant-role-and-evidence-security
    provides: Protected financial release lanes and secured billing boundaries
provides:
  - String-only validated and branded USD minor-unit values
  - Reduced ordinary-percentage rates with retained display evidence
  - Named half-away-from-zero signed rounding with checked persistence range
  - Same-wave classifier and protected fast-test coupling
affects: [03-02, 03-04, 03-05, 03-06, 03-07, calculations, invoices]

tech-stack:
  added: []
  patterns:
    - Dependency-free BigInt arithmetic behind strict string trust boundaries
    - Stable non-reflective financial error codes
    - RED/GREEN behavioral and release-coupling proof

key-files:
  created:
    - src/components/atomic-crm/financial/exactMoney.ts
    - src/components/atomic-crm/financial/exactMoney.test.ts
    - src/components/atomic-crm/financial/exactFinancialFixtures.ts
    - tests/release/exact-money-release-static.test.ts
  modified:
    - makefile
    - .github/release/financial-paths.json
    - registry.json
    - .planning/phases/03-exact-money-and-rounding-contract/03-VALIDATION.md

key-decisions:
  - "Runtime financial objects stay immutable and JSON-safe: authoritative integer components are canonical strings, while BigInt is confined to validated arithmetic."
  - "Ordinary percentage equality compares the reduced canonical ratio and policy, while submitted percentage text remains non-authoritative evidence."
  - "Exact ratios accept wider-than-persistence intermediates, but only the named USD half-away-from-zero boundary may produce checked minor units."

patterns-established:
  - "Exact codec: validate unknown input, enforce byte limit before BigInt, canonicalize, then check persistence range."
  - "Rounding boundary: require explicit currency, currency-policy, exponent, and rounding-policy identities before one signed half-away conversion."
  - "Rolling gate coupling: classify and execute a financial path in the same wave that creates it."

requirements-completed: [CALC-01, CALC-03]

duration: 15 min
completed: 2026-09-04
---

# Phase 3 Plan 01: Exact Money Foundation Summary

**Immutable string-safe USD money and reduced rates with BigInt-only signed half-away rounding and protected release coupling**

## Performance

- **Duration:** 15 min
- **Started:** 2026-09-04T18:11:51Z
- **Completed:** 2026-09-04T18:26:23Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- Added strict money and rate codecs covering signed PostgreSQL `bigint` endpoints, 64/14-byte pre-parse limits, canonical zero, malformed grammar, numeric-token rejection, exact JSON round trips, and one-way USD display formatting.
- Added reduced exact ratios plus explicit `usd-v1` / exponent 2 / `half-away-from-zero-v1` rounding with signed ties, non-ties, endpoints, zero-denominator rejection, policy mismatch rejection, and final overflow checks.
- Added 128 deterministic property cases for reduction idempotence, sign symmetry, equivalent-ratio equality, monotonicity, and JSON stability.
- Added every Wave 1 exact path and both exact tests to the inherited classifier/fast lane without adding or renaming a financial workflow identity.

## Task Commits

Each task was committed atomically with a failing RED contract before GREEN behavior:

1. **Task 1: Specify and implement string-safe money and reduced rates** - `ea4bc039` (test), `511b9e7d` (feat)
2. **Task 2: Implement named signed rounding and property proof** - `3e57cea0` (test), `175df054` (feat)
3. **Task 3: Protect exact-money release paths** - `1f0a6b89` (test), `d2740a65` (chore)

**Plan metadata:** this documentation commit

## Files Created/Modified

- `src/components/atomic-crm/financial/exactMoney.ts` - Sole validated TypeScript money, rate, exact-ratio, rounding, and display authority.
- `src/components/atomic-crm/financial/exactMoney.test.ts` - Golden, malformed, boundary, signed-rounding, property, and JSON proof.
- `src/components/atomic-crm/financial/exactFinancialFixtures.ts` - Shared deterministic, non-sensitive exact vectors.
- `tests/release/exact-money-release-static.test.ts` - Same-wave classifier/fast-target coupling and inherited-identity proof.
- `makefile` - Runs both exact tests in `FINANCIAL_FAST_TESTS`.
- `.github/release/financial-paths.json` - Classifies the exact financial directory.
- `registry.json` - Includes the generated exact-money source and fixture entries required by the repository hook.
- `.planning/phases/03-exact-money-and-rounding-contract/03-VALIDATION.md` - Records the three Wave 1 checks as passing.

## Decisions Made

- Kept runtime/wire objects string-only and immutable, converting to native `BigInt` only after validation and never installing a global JSON shim.
- Validated rate wire values by recomputing their canonical ratio from submitted evidence, so callers cannot hand-enter contradictory numerator/denominator authority.
- Limited public exact-ratio text to 64 bytes as a denial-of-service boundary while retaining ample width for products of signed-`bigint` money and rate components.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Repository integration] Included generated registry metadata**

- **Found during:** Task 1 commit
- **Issue:** The repository pre-commit hook registered the new source and fixture modules even though `registry.json` was not listed in the plan file set.
- **Fix:** Included the deterministic generated entries rather than leaving the worktree dirty or bypassing the hook.
- **Files modified:** `registry.json`
- **Verification:** Re-running `npm run registry:gen` leaves the file unchanged; build and formatting checks pass.
- **Committed in:** `511b9e7d`

---

**Total deviations:** 1 auto-fixed (repository integration)
**Impact on plan:** Required generated metadata only; no product or schema scope was added.

## Issues Encountered

- The isolated worktree initially had no installed packages. `npm ci` restored the locked toolchain; the RED tests then failed for the intended unimplemented behaviors.
- The full suite retains pre-existing unawaited-Vitest warnings, and lint/build retain pre-existing refresh, CSS-import, bundle-size, and Browserslist advisories. All commands exit successfully and no warning originates in the Plan 01 files.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 02 can translate the same fixtures and policy identities into independent PostgreSQL catalogs/helpers and live pgTAP proof.
- CALC-01 and CALC-03 remain phase-level work until Plans 02-07 prove database conversion, providers, invoice preview, integrated gates, and release evidence.
- No schema, provider, rendered UI, deployment, or production state changed in this plan.

---
*Phase: 03-exact-money-and-rounding-contract*
*Completed: 2026-09-04*
