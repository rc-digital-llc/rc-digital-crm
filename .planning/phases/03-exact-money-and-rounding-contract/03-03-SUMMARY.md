---
phase: 03-exact-money-and-rounding-contract
plan: "03"
subsystem: financial-upgrade-verifier
tags: [upgrade, fingerprints, sha256, registry, exact-money, release-gate]
requires:
  - phase: 03-exact-money-and-rounding-contract
    plan: "02"
    provides: Immutable PostgreSQL exact-financial primitives and protected pgTAP proof
provides:
  - Closed sequence-003 exact-money transformation and invariant vocabulary
  - Immutable SHA-256 pins for accepted baseline, registry, and Phase 2 migrations
  - Registry-controlled local migration application and string-only semantic validation
  - Protected live and Vitest upgrade verification in one required target
affects: [03-04, financial-release-gate]
tech-stack:
  added: []
  patterns: [append-only transform registry, registry-controlled upgrade application, canonical fingerprint text]
key-files:
  created: []
  modified:
    - scripts/release/fingerprint-upgrade.mjs
    - tests/release/migration-upgrade.test.ts
    - makefile
    - tests/release/exact-money-release-static.test.ts
    - .github/release/financial-paths.json
key-decisions:
  - "Registry sequence 003 is reserved for the exact two-migration cutover and a fixed transformation/invariant allowlist."
  - "The representative upgrade runner applies only migrations named by accepted baseline transformations and ordered registries."
patterns-established:
  - "Immutable upgrade history: hard-pin accepted inputs independently of the manifests they validate"
  - "Pre-cutover verifier: define and test the registry schema before creating the deterministic registry file"
requirements-completed: [CALC-01, CALC-03]
duration: 12 min
completed: 2026-09-04
---

# Phase 3 Plan 03: Closed Exact Upgrade Verifier Summary

**The upgrade lane can now authorize only the future exact billing cutover, while preserving accepted Phase 2 history and financial text without JavaScript numeric coercion.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-09-04T04:24:39Z
- **Completed:** 2026-09-04T04:36:48Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Reserved `003-exact-money` for exactly migrations `20260902000001` and `20260902000002`, eleven required transformations, and eight semantic invariants.
- Added eight exact-focused fingerprint categories covering canonical invoice values, line items, automation, evidence replacement, RPCs, ACLs, tax compatibility, and unchanged unrelated CRM payloads without editing accepted baseline files.
- Hard-pinned the baseline 001 manifest, registry 002, and accepted Phase 2 migrations 00002/00003/00004; mutation tests fail closed.
- Added exact semantic validation for string-only components, reduced ratios, fixed-nine-decimal tax compatibility, locked RPCs, least privilege, canonical automation fingerprints, and unchanged unrelated data.
- Made the protected migration-upgrade target run both the live representative upgrade and its complete 22-test Vitest contract.

## Task Commits

Each task was committed with RED and GREEN evidence:

1. **Task 1: Define the closed exact-upgrade vocabulary and immutable-history proof** - `5484517c`, `03260e48`
2. **Task 2: Protect the upgraded runner before database cutover** - `e948aefc`, `e5d79524`

## Files Created/Modified

- `scripts/release/fingerprint-upgrade.mjs` - Exact category queries, immutable pins, sequence-003 validator, registry-controlled migration applier, and semantic snapshot checks.
- `tests/release/migration-upgrade.test.ts` - Synthetic accepted/rejected registries, coercion, tax-rate, and immutable-history proof.
- `makefile` - Executes the focused verifier tests after the live upgrade proof.
- `tests/release/exact-money-release-static.test.ts` - Requires both upgrade commands, the closed vocabulary, history pins, and file classification.
- `.github/release/financial-paths.json` - Classifies `makefile` so changes to the protected command surface cannot skip financial checks.

## Decisions Made

- A sequence-003 registry may advance only the four broad fingerprints necessarily affected by the cutover plus seven exact-specific categories. Other repeated or unrelated transforms remain rejected.
- Before registry 003 exists, the live upgrade lane applies only baseline-authorized migration 20260825000002 and registry-002 migrations. The unregistered Phase 3 migrations are not silently accepted.
- Exact baseline fingerprints live as hardcoded verifier constants so accepted baseline 001 and registry 002 remain byte-identical.

## Deviations from Plan

### Auto-fixed Missing Protection

**1. Classified `makefile` as a financial path**

- **Found during:** Task 2 RED coupling test
- **Issue:** Three of the four Plan 03 files were already classified, but the protected Make command surface itself was not.
- **Fix:** Added the literal `makefile` path to the existing financial classifier and asserted it through the rolling test.
- **Files modified:** `.github/release/financial-paths.json`, `tests/release/exact-money-release-static.test.ts`
- **Verification:** The rolling static test passes all five checks.

---

**Total deviations:** 1 auto-fixed missing protection
**Impact on plan:** Required to satisfy the plan's explicit all-four-files classification criterion; no lane or policy identity changed.

## Issues Encountered

- The first registry-controlled live run omitted baseline-authorized migration `20260825000002`, producing the expected grant fingerprint mismatch. The applier now includes migrations authorized by the PG17 expectation before ordered registry migrations.
- The unrelated local Supabase stack still owns the default ports, so the live migration-upgrade receipt used temporary alternate loopback ports that were restored before commit.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 03-04 can implement the exact cutover and create registry 003 only after deterministic before/after hashes are known.
- Accepted baseline and Phase 2 artifacts remain byte-identical, and no registry 003 file has been guessed or pre-created.

## Self-Check: PASSED

- All four Plan 03 task commits are present.
- The focused upgrade suite passes all 22 tests, including seven exact-named contracts.
- The protected upgrade target passes its live registry-002 upgrade and the full Vitest suite.
- Rolling static coupling passes all five checks, canonical Supabase config is restored, and `git diff --check` passes.

---
*Phase: 03-exact-money-and-rounding-contract*
*Completed: 2026-09-04*
