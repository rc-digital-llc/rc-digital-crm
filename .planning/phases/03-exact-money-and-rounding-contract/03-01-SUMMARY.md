---
phase: 03-exact-money-and-rounding-contract
plan: "01"
subsystem: financial-primitives
tags: [typescript, bigint, money, rational-rates, rounding, release-gate]
requires:
  - phase: 02-tenant-role-and-evidence-security
    provides: Six protected financial lanes and exact path-classification contracts
provides:
  - String-only branded USD money and reduced ordinary-percentage codecs
  - Explicit half-away-from-zero-v1 bigint rounding at the persistence boundary
  - Same-wave financial path and focused-test release coupling
affects: [03-02, 03-05, 03-06, financial-release-gate]
tech-stack:
  added: []
  patterns: [canonical exact codec, named rounding policy, string-only financial wire values]
key-files:
  created:
    - src/components/atomic-crm/financial/exactMoney.ts
    - src/components/atomic-crm/financial/exactMoney.test.ts
    - src/components/atomic-crm/financial/exactFinancialFixtures.ts
    - tests/release/exact-money-release-static.test.ts
  modified:
    - makefile
    - .github/release/financial-paths.json
key-decisions: []
patterns-established:
  - "Canonical exact codec: validate unknown wire tokens before constructing bigint-backed authority"
  - "Named persistence boundary: round only with explicit USD and half-away-from-zero policy identities"
requirements-completed: [CALC-01, CALC-03]
duration: 6 min
completed: 2026-09-04
---

# Phase 3 Plan 01: Exact Financial Primitives Summary

**String-only USD money, reduced percentage ratios, and signed half-away-from-zero rounding are now enforced by the inherited financial release gate.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-09-04T03:51:25Z
- **Completed:** 2026-09-04T03:57:17Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Added immutable branded money, ratio, rate, and rounding-policy types that reject JavaScript numeric authority.
- Proved signed bigint boundaries, strict 64/14-byte limits, canonical zero, exact percentage reduction, deterministic property invariants, and string-only JSON round trips.
- Classified the new financial directory and made both new test files explicit members of the existing protected fast lane without changing its six required identities.

## Task Commits

Each task was committed atomically with its RED and GREEN evidence:

1. **Task 1: Specify the string-safe money and reduced-rate contract** - `03ec2941`, `468d3727`
2. **Task 2: Implement named signed rounding and deterministic property proof** - `d3475f0d`, `699d91e7`
3. **Task 3: Protect the first exact-money paths in the wave that creates them** - `459338b5`, `e112d435`

## Files Created/Modified

- `src/components/atomic-crm/financial/exactMoney.ts` - Sole validated exact-money, ratio, rate, formatting, and rounding entry point.
- `src/components/atomic-crm/financial/exactMoney.test.ts` - Golden, malformed-input, boundary, property, and round-trip proof.
- `src/components/atomic-crm/financial/exactFinancialFixtures.ts` - Shared deterministic non-sensitive financial vectors.
- `tests/release/exact-money-release-static.test.ts` - Rolling release-path and protected-target coupling contract.
- `makefile` - Runs both exact-money tests in `FINANCIAL_FAST_TESTS`.
- `.github/release/financial-paths.json` - Classifies the new financial source directory.

## Decisions Made

None - followed the approved Phase 3 contract as specified.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The machine default was Node 26; verification used an isolated official Node 22.23.2 runtime to preserve project and CI parity.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The TypeScript golden semantics and fixtures are ready for the independent PostgreSQL implementation in Plan 03-02.
- No blockers remain from Wave 1.

## Self-Check: PASSED

- All four created key files exist.
- Six `03-01` task commits are present.
- 28 exact-money tests, 3 coupling tests, all 79 protected fast tests, and TypeScript checking pass under Node 22.
- `git diff --check` passes.

---
*Phase: 03-exact-money-and-rounding-contract*
*Completed: 2026-09-04*
