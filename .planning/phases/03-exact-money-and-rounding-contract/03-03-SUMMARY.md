---
phase: 03-exact-money-and-rounding-contract
plan: "03"
subsystem: database
tags: [postgresql, supabase, upgrade-verifier, exact-money, sha256, vitest]

requires:
  - phase: 03-01
    provides: Canonical string-only minor units, reduced rate ratios, and named rounding contracts
  - phase: 03-02
    provides: Immutable PostgreSQL policies and exact database primitives through migration 20260902000001
provides:
  - Closed 003 exact-money upgrade category and semantic-invariant vocabulary
  - Exact semantic rejection for lossy money, rates, evidence, RPC, ACL, and constraint states
  - Runtime SHA-256 proof that accepted baseline, registry, and Phase 2 migrations remain immutable
  - Protected migration-upgrade target running both the live verifier and its focused unit contract
affects: [03-04, 03-07, database-cutover, upgrade-registry, financial-release-gate]

tech-stack:
  added: []
  patterns:
    - Closed upgrade registries with ordered non-overlapping transformation ownership
    - String-only exact financial snapshots validated before canonical hashing
    - Accepted migration history pinned by runtime SHA-256 digests
    - Same-target live and synthetic verification before database cutover

key-files:
  created: []
  modified:
    - scripts/release/fingerprint-upgrade.mjs
    - tests/release/migration-upgrade.test.ts
    - tests/release/exact-money-release-static.test.ts
    - makefile
    - .github/release/financial-paths.json

key-decisions:
  - "Registry 003 may transform only the closed exact invoice, automation, evidence, RPC, ACL, constraint, identity, and compatibility categories; unknown, missing, overlapping, stale, or reordered entries fail closed."
  - "Exact upgrade semantics remain dormant until registry 003 exists, while accepted baseline and Phase 2 artifacts are verified on every run by pinned SHA-256 digest."
  - "Legacy tax_rate remains non-authoritative: canonical reduced ratios drive the value, compatibility output is fixed to nine decimal places, and submitted percentage text remains separate evidence."
  - "The protected migration-upgrade target must execute the live isolated fingerprint verifier and the complete focused Vitest contract, and makefile changes are classified as financial."

patterns-established:
  - "Conditional future-schema query: absent Plan 04 relations or columns fingerprint as canonical empty arrays without weakening the closed registry vocabulary."
  - "Immutable-history gate: verify accepted bytes before loading or comparing an upgrade baseline."
  - "Upgrade protection: a single inherited Make target runs live PostgreSQL proof followed by synthetic rejection coverage, with neither step optional."

requirements-completed: [CALC-01, CALC-03]

duration: 25 min
completed: 2026-09-04
---

# Phase 3 Plan 03: Closed Exact-Money Upgrade Verifier Summary

**Closed 003 upgrade authorization with string-exact semantic validation, immutable accepted-history digests, and mandatory live-plus-unit protected execution**

## Performance

- **Duration:** 25 min
- **Started:** 2026-09-04T20:49:32Z
- **Completed:** 2026-09-04T21:14:01Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Reserved the complete ordered 003 vocabulary for exact invoice values and line items, automation state and request/effect fingerprints, evidence finalization, caller-bound RPCs, ACLs, constraints, counts/IDs, and money compatibility.
- Added fail-closed semantic validation for string-only minor units, reduced ratios, non-negative automation, canonical fingerprints, replacement evidence helpers, least-privilege RPC/table ACLs, exact PostgreSQL types, fixed-nine compatibility output, and separately preserved `12.500%` evidence.
- Pinned baseline 001, registry 002, and the three accepted Phase 2 migrations to their exact SHA-256 digests without modifying any accepted artifact.
- Protected the inherited migration-upgrade target with both the live isolated fingerprint runner and all 34 focused Vitest checks, plus rolling static proof of target and financial-path membership.

## Task Commits

Each task was committed atomically with its failing RED contract before GREEN behavior:

1. **Task 1: Define the closed exact-upgrade vocabulary and immutable-history proof** - `cb7ad4b9` (test), `c14fc6ca` (feat)
2. **Task 2: Protect the upgraded runner before database cutover** - `85ba75bc` (test), `97f29da6` (chore)

**Plan metadata:** this documentation commit

## Files Created/Modified

- `scripts/release/fingerprint-upgrade.mjs` - Defines exact category queries, 003 registry rules, semantic validators, compatibility invariants, and accepted-artifact digest verification.
- `tests/release/migration-upgrade.test.ts` - Exercises complete and malformed 003 registries, exact semantic rejection families, numeric-coercion bans, and immutable-history tampering.
- `tests/release/exact-money-release-static.test.ts` - Rejects missing live/unit target commands, classifier omissions, removed history assertions, optional execution, and lost 003 vocabulary markers.
- `makefile` - Runs the focused upgrade Vitest contract after the live isolated fingerprint verifier in the existing protected target.
- `.github/release/financial-paths.json` - Classifies `makefile` so changes to the protected recipe cannot skip financial checks.

## Decisions Made

- Kept future exact queries dormant until the 003 registry is checked in by Plan 04. Before cutover, their deterministic empty-array fingerprints reserve the vocabulary without guessing migration hashes.
- Verified accepted artifacts before baseline use so a coordinated edit to historical bytes and expectations cannot silently redefine accepted history.
- Treated `tax_rate numeric(12,9)` as compatibility output only: it must derive exactly from the canonical reduced ratio, remain within 0 through 100, serialize at fixed-nine scale, and retain submitted text independently.
- Reused the existing migration-upgrade lane and its one-attempt assertion policy; the added Vitest command is a second mandatory recipe line, not a new lane or retry path.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Preserved the accepted pre-upgrade tax-rate fingerprint**

- **Found during:** Task 1 GREEN live upgrade verification
- **Issue:** Applying post-cutover tax-rate normalization unconditionally changed the accepted baseline `invoice_numeric_text` fingerprint before registry 003 existed.
- **Fix:** Scoped normalization to rows exposing the future exact schema while preserving original pre-cutover text and payload serialization.
- **Files modified:** `scripts/release/fingerprint-upgrade.mjs`
- **Verification:** The live upgrade verifier returned the accepted `invoice_numeric_text` before/after digest `62617c1e748843367ba8db4f4e95c2f2a6c8d0697d9cd476b69f712cc517a155` and exited 0.
- **Committed in:** `c14fc6ca`

**2. [Rule 2 - Missing Critical] Classified protected Makefile changes as financial**

- **Found during:** Task 2 RED static contract
- **Issue:** The plan required all four owned files to remain on the protected financial surface, but `makefile` was not matched by the existing path configuration.
- **Fix:** Added the exact `makefile` path to `.github/release/financial-paths.json`; no unrelated path was broadened.
- **Files modified:** `.github/release/financial-paths.json`
- **Verification:** Seven rolling static tests and the classifier self-test pass; removing the entry produces `unclassified:makefile`.
- **Committed in:** `97f29da6`

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical functionality)
**Impact on plan:** Both changes were required to preserve accepted history and meet the plan's protected-surface acceptance criteria; no lane, remote path, database schema, or product behavior was added.

## Issues Encountered

- The shared canonical local Supabase namespace was contended: one bootstrap reused stale schema state and another connection was terminated externally. After bounded failures, verification used a disposable worktree-only project name and alternate loopback ports. The full assertion and cleanup passed, and `supabase/config.toml` was restored byte-for-byte before commits.
- This worktree had no installed dependency tree. Tests reused a checkout with an identical package-lock SHA through a temporary ignored `node_modules` symlink; no dependency was installed or changed, and the symlink was removed before summary creation.

## TDD Gate Compliance

- Task 1 recorded failing registry, semantic, coercion, and history assertions in `cb7ad4b9` before the runner implementation in `c14fc6ca` made all 34 tests pass.
- Task 2 recorded a static failure for the absent Vitest recipe and unclassified Makefile in `85ba75bc` before target/classifier wiring in `97f29da6` made all seven static tests pass.

## Verification

- `npm test -- --run tests/release/migration-upgrade.test.ts -t exact` - PASS; 15/15 exact tests.
- `npm test -- --run tests/release/migration-upgrade.test.ts` - PASS; 34/34 tests.
- `npm test -- --run tests/release/exact-money-release-static.test.ts` - PASS; 7/7 tests.
- `make test-financial-migration-upgrade` - PASS in a disposable isolated local namespace; one live assertion attempt followed by 34/34 Vitest tests, with successful cleanup.
- `node scripts/release/classify-financial-paths.mjs --self-test` - PASS.
- Accepted-history SHA-256 values - PASS: baseline `eb1f2e2c...`, registry `dea0df2f...`, migrations `811947e5...`, `d1c27c26...`, and `740ac8cc...`.
- `node --check scripts/release/fingerprint-upgrade.mjs` and `git diff --check` - PASS.

## Known Stubs

None. Empty exact-category arrays are deliberate pre-003 fingerprints, and local empty error accumulators are verification machinery rather than product-data placeholders.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 04 can add migration `20260902000002` and registry 003 only after its deterministic output satisfies this closed category, invariant, compatibility, ACL, and immutable-history contract.
- Accepted Phase 2 history remains byte-identical, and unrelated deal/project/analytics transformations remain unauthorized.
- No hosted database, production service, deployment, dependency set, linked Supabase project, or external configuration changed.

## Self-Check: PASSED

All five modified implementation/protection files, the summary, and all four task commits were verified locally before the planning metadata update.

---
*Phase: 03-exact-money-and-rounding-contract*
*Completed: 2026-09-04*
