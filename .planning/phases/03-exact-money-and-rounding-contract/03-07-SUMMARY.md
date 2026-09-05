---
phase: 03-exact-money-and-rounding-contract
plan: "07"
subsystem: release-assurance
tags: [exact-money, postgres, supabase, vitest, security-gate, release-contract]

requires:
  - phase: 03-01-through-03-06
    provides: Exact codecs, PostgreSQL primitives, migration cutover, caller-bound RPCs, provider parity, preview arithmetic, and same-plan release coupling
  - phase: 01-release-proof
    provides: Six blocking financial workflow identities and content-addressed build-to-promotion receipts
provides:
  - Mutation-backed final audit of every Phase 3 source, test, target, workflow, RPC, migration, and anti-floating-point invariant
  - Exact-head integrated financial, security, type, lint, and build evidence for CALC-01 and CALC-03
  - Explicit separation between local/CI readiness and owner-authorized hosted schema promotion/readback
affects: [phase-04, phase-05, financial-release-gate, schema-promotion, CALC-01, CALC-03]

tech-stack:
  added: []
  patterns:
    - Audit completed same-plan coupling through deterministic source mutations without adding another workflow identity
    - Record exact-head counts and fingerprints while keeping merged-build, promotion, and provider-readback evidence distinct

key-files:
  created:
    - .planning/phases/03-exact-money-and-rounding-contract/03-07-SUMMARY.md
  modified:
    - tests/release/exact-money-release-static.test.ts
    - .planning/phases/03-exact-money-and-rounding-contract/03-VALIDATION.md

key-decisions:
  - "Preserve the six existing blocking financial workflow identities; Plan 07 audits their complete coupling instead of adding an optional seventh check."
  - "Keep protected schema promotion separately owner-authorized after the merged default-branch build receipt; local and CI-equivalent validation never constitutes production proof."
  - "Use the exact-ref single-branch checkout as authoritative release history and do not accept, ignore, or expose findings from unrelated upstream-only remote refs."

patterns-established:
  - "Final coupling audit: enumerate each prior plan's owned paths, require classification and exact target membership, then mutation-test every failure class."
  - "Evidence boundary: pin implementation head, counts, and report digests while leaving owner approval, merge-group, build, promotion, and readback visibly pending."

requirements-completed: [CALC-01, CALC-03]

duration: 28 min
completed: 2026-09-04
---

# Phase 3 Plan 07: Final Exact-Money Release Contract Summary

**A mutation-backed final audit now closes every Phase 3 money, rounding, RPC, migration, provider, and release-path invariant at one exact head, with production schema promotion still separately owner-gated**

## Performance

- **Duration:** 28 min
- **Started:** 2026-09-04T23:28:27Z
- **Completed:** 2026-09-04T23:56:28Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added a deterministic final audit that enumerates Plans 01–06, proves every money-bearing source/test is classified and in its introducing plan's permanent target, and rejects missing or duplicated coupling.
- Closed the Cycle 2 security matrix around caller-bound invoice RPCs, base-table/sequence revocation, exact evidence helpers, canonical fingerprints, immutable accepted migrations, and the absence of float/numeric authority.
- Preserved all six blocking workflow identities and proved that only the protected, receipt-bound promotion workflow can mutate production schema.
- Completed the full financial gate, security gate, typecheck, lint, and production build at exact implementation head `1073791c811d186d97693c1dd11da92eb2ee0d9b`.
- Recorded every local count/fingerprint without marking pending PR approval, merge-group, merged-build, owner-authorized schema promotion, or provider readback as complete.

## Task Commits

Each task was committed atomically, with RED observed before Task 1's GREEN result:

1. **Task 1: Audit rolling same-plan coupling and Cycle 2 security closure** - `999b94ac` (RED test), `1073791c` (GREEN test)
2. **Task 2: Run integrated proof and record the hosted release boundary** - `2314804b` (docs)

**Plan metadata:** this documentation/state commit

## Files Created/Modified

- `tests/release/exact-money-release-static.test.ts` - Enumerates all seven plan waves and mutation-tests source/target/workflow/RPC/evidence/history/build/promotion coupling.
- `.planning/phases/03-exact-money-and-rounding-contract/03-VALIDATION.md` - Records exact-head counts, fingerprints, security receipts, no-rendered-surface rationale, and pending hosted boundaries.
- `.planning/phases/03-exact-money-and-rounding-contract/03-07-SUMMARY.md` - Captures task commits, verification evidence, deviation handling, and next-step gates.

## Decisions Made

- Kept the existing six protected financial jobs unchanged; the final audit is part of the already-blocking static/fast contract rather than a new workflow identity.
- Kept local/CI proof separate from release authority: merge-group and owner approval remain pending, and production cannot be claimed before a merged build receipt, protected promotion, and provider post-state readback.
- Treated a single-ref exact checkout as the authoritative release-history shape. Unrelated upstream remote history was neither accepted nor excluded through a new policy exception.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Isolated the release secret scan from unrelated upstream remote history**
- **Found during:** Task 2 (integrated proof)
- **Issue:** The shared development worktree carried an extra upstream `origin/main` ref, so the all-ref scanner traversed four commits that were not ancestors of the implementation head and are not part of the fork's release history.
- **Fix:** Verified all four commits were upstream-only, ran a policy-identical HEAD scan with zero findings, then reran the unchanged full command in a disposable `--single-branch --no-local` clone at the exact implementation SHA, matching the workflow checkout shape.
- **Files modified:** None; no accepted finding, ignore rule, exception, or security-gate code was added.
- **Verification:** Both exact-head history and current scans returned zero findings, and the complete CI-equivalent command exited 0.
- **Committed in:** Not applicable (environment-only isolation); the evidence record is in `2314804b`.

---

**Total deviations:** 1 auto-fixed (1 blocking environment issue)
**Impact on plan:** The correction restored deterministic CI-equivalent history scope without weakening the security policy or changing production behavior.

## Issues Encountered

- ESLint completed with zero errors and three inherited React Fast Refresh warnings.
- The production build completed with inherited CSS import ordering, chunk-size, Node deprecation, and stale Browserslist-data warnings; none was introduced by this test/documentation-only plan.

## TDD Gate Compliance

- RED commit `999b94ac` added the final audit invocation before its helper existed and failed 1 of 14 assertions as expected.
- GREEN commit `1073791c` implemented the closed audit plus mutation regressions; the focused suite passed 15/15.

## Verification

- Clean migration and schema-push lanes - PASS; 42 migrations through `20260902000002`, fingerprint `addaf10c46705b423ae5c4554808adc32947e6137584789e70574a28cc28980f`, one assertion attempt, cleanup success.
- Upgrade lane - PASS; 22 semantic invariants and 34/34 unit assertions, report `5ff71ae04e3684a83c8f6f1d133681881a46137bfadee9b4abc260f54101fe5c`, one assertion attempt, cleanup success.
- Database SQL - PASS; 11 files and 457/457 assertions.
- Database HTTP/provider - PASS; 4 files and 24/24 assertions.
- Edge/evidence - PASS; 2 files and 10/10 assertions.
- Replay/concurrency - PASS; fixture 18/18 and live 8/8 assertions.
- Protected fast/static - PASS; 7 files and 140/140 assertions, including the final audit at 15/15.
- Security gate - PASS; dependency critical/high counts 0/0, history/current secret counts 0/0, 54 bundle files, and 6 workflow identities.
- `npm run typecheck`, `npm run lint`, and `npm run build` - PASS; lint had 0 errors and the build transformed 3,622 modules with 50 PWA precache entries.
- `git diff --check` - PASS.

## Known Stubs

None. Empty strings, arrays, and nullable values in the static test are deliberate parser/error-accumulator or source-mutation states and do not feed rendered UI.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- CALC-01 and CALC-03 are locally and CI-ready proven at the recorded implementation head.
- Exact-head owner approval and merge-group checks remain required before merge.
- A merged default-branch build receipt must precede separately owner-authorized protected schema promotion and provider post-state readback before any production-live claim.
- No rendered UI, responsive behavior, navigation, asset, or deployment surface changed, so no Frame surface-loop receipt applies to Plan 07.

## Self-Check: PASSED

Both modified task files, this summary, and all three task commits were verified locally; commit order preserves the Task 1 RED/GREEN gate and `git diff --check` is clean.

---
*Phase: 03-exact-money-and-rounding-contract*
*Completed: 2026-09-04*
