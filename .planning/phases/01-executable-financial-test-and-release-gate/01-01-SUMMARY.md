---
phase: 01-executable-financial-test-and-release-gate
plan: 01
subsystem: release-engineering
tags: [supabase, release-policy, ci, security, receipts]

requires: []
provides:
  - Machine-readable financial path, blocking-check, exception, and staged-release policy
  - Closed JSON Schema for content-addressed release receipts
  - Isolated local Supabase lane runner with bounded bootstrap-only retry and cleanup
  - Stable Make targets for all six financial release lanes
affects: [phase-01-ci, financial-testing, staged-deployment, release-evidence]

tech-stack:
  added: []
  patterns:
    - Dependency-free Node ESM release tooling
    - Exact argv subprocess execution with redacted output
    - Policy-derived lane identities and fail-closed validation

key-files:
  created:
    - .github/release/financial-paths.json
    - .github/release/release-policy.json
    - .github/release/release-receipt.schema.json
    - scripts/release/validate-config.mjs
    - scripts/release/run-supabase-lane.mjs
    - tests/release/release-policy.test.ts
  modified:
    - makefile

key-decisions:
  - "Keep release-policy validation dependency-free so it can run before install-heavy lanes."
  - "Permit one retry only for classified local-stack bootstrap failures; financial assertions run once."
  - "Expose each release lane through explicit argv and stable Make targets shared by local and CI execution."

patterns-established:
  - "Release contract first: policy and receipt shapes are executable fixtures, not workflow prose."
  - "Isolated lane lifecycle: pre-clean, bootstrap, local environment injection, single assertion attempt, final cleanup."

requirements-completed: [REL-03, REL-05]

duration: 8min
completed: 2026-08-25
---

# Phase 1 Plan 01: Release Policy Foundation Summary

**Machine-readable release contracts, a redacting isolated Supabase runner, and one stable command surface for all six blocking financial lanes**

## Performance

- **Duration:** 8 min
- **Started:** 2026-08-25T15:46:53-07:00
- **Completed:** 2026-08-25T15:54:30-07:00
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Encoded the exact fast and financial required-check identities, staged release order, non-overridable failures, bounded exceptions, and private evidence contract.
- Added a closed Draft 2020-12 receipt schema that requires correlation, revision, artifact digest, environment, migration, function, provider, and approval evidence.
- Added an isolated Supabase lane runner that uses exact argv, redacts credentials, bounds child processes, retries only a classified bootstrap failure once, preserves assertion failures, and always cleans up.
- Added discoverable Make targets for the six independent policy lanes and their component checks.

## Task Commits

Each task was committed atomically:

1. **Task 1: Encode financial paths, release policy, and receipt schema** - `dd47585` (failing contract tests), `8b54750` (implementation)
2. **Task 2: Build the isolated Supabase lane runner and config validator** - `7e17c33`
3. **Task 3: Expose stable Make targets for every lane** - `9cf96d6`

## Files Created/Modified

- `.github/release/financial-paths.json` - Classifies financial migration, function, provider, and release-surface changes.
- `.github/release/release-policy.json` - Defines blocking contexts, stage order, exceptions, retry policy, and private evidence authority.
- `.github/release/release-receipt.schema.json` - Validates complete, closed release receipts.
- `scripts/release/validate-config.mjs` - Fails closed on unsafe or incomplete release configuration.
- `scripts/release/run-supabase-lane.mjs` - Owns isolated local-stack lifecycle, local-only environment injection, redaction, and bounded retry.
- `tests/release/release-policy.test.ts` - Exercises valid policy and deliberately unsafe variants.
- `makefile` - Publishes the shared financial-gate command contract.

## Decisions Made

- Used JSON policy and schema files as the authoritative workflow contract so later CI and deployment plans consume the same identities.
- Kept process execution shell-free and local Supabase credentials ephemeral in child-process memory.
- Kept component targets separate while making `financial-gate` stop immediately on the first failed command.

## Deviations from Plan

None - plan executed as written.

## Issues Encountered

- The repository's legacy Make targets legitimately contain `npx` and remote deploy commands. Verification was scoped to the new financial-gate surface so unrelated existing commands did not create a false failure.

## User Setup Required

None - no external service configuration is required for this plan.

## Next Phase Readiness

- Plans 01-02 through 01-07 can implement their live database, function, concurrency, dependency, and secret checks behind the established targets.
- CI, evidence, deployment, and rollback plans can consume the policy identities and receipt schema without redefining them.

---
*Phase: 01-executable-financial-test-and-release-gate*
*Completed: 2026-08-25*
