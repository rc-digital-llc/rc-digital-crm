---
phase: 01-executable-financial-test-and-release-gate
plan: 09
subsystem: protected-ci
tags: [github-actions, merge-queue, ruleset, signed-commits, single-owner]

requires:
  - phase: 01-03
    provides: Representative migration-upgrade proof
  - phase: 01-04
    provides: Database and authorization contracts
  - phase: 01-05
    provides: Edge and provider contracts
  - phase: 01-06
    provides: Replay and concurrency contracts
  - phase: 01-07
    provides: Non-waivable release-security gate
  - phase: 01-08
    provides: Receipt and private-evidence contracts
provides:
  - Four fast and six financial checks on protected merge-group candidates
  - Live no-bypass main ruleset with merge queue, signed history, and exact contexts
  - Explicit single-owner review through release-bot authorship and one owner approval
  - Authenticated source-to-live ruleset drift verification
affects: [phase-01-release, all-financial-phases, main-branch-governance]

tech-stack:
  added: []
  patterns:
    - Required PR contexts must also materialize unconditionally on merge-group candidates
    - GitHub-signed GraphQL commits repair unsigned development history without weakening signature enforcement
    - Scoped bot authorship preserves one meaningful owner approval in a single-owner organization

key-files:
  created:
    - .github/workflows/financial-release-gate.yml
    - .github/release/main-ruleset.json
    - scripts/release/verify-github-controls.mjs
  modified:
    - .github/workflows/check.yml
    - tests/release/release-policy.test.ts

key-decisions:
  - "Use a scoped release bot as PR author and require one authenticated owner approval; no independent human reviewer is required."
  - "Retain merge queue, ten exact contexts, required signatures, linear history, thread resolution, and zero bypass actors as compensating controls."
  - "Require all four fast jobs and all six financial jobs on merge_group events so the queue cannot deadlock or reuse PR-only proof."

patterns-established:
  - "Merge authority: exact named contexts must pass on both the PR head and a fresh merge-group candidate."
  - "Signed-history repair: compare full tree hashes before replacing unsigned branch history with a GitHub-verified snapshot."

requirements-completed: [REL-03]

duration: 105min
completed: 2026-08-28
---

# Phase 1 Plan 09: Protected Financial CI Summary

**The live `main` ruleset now admits financial changes only through a signed, owner-approved, no-bypass merge queue that reruns four fast and six financial checks on the actual merge candidate**

## Performance

- **Duration:** 105 min including live rollout, queue debugging, signed-history repair, and final merge observation
- **Completed:** 2026-08-28T17:57:04Z
- **Tasks:** 2
- **Core files modified:** 6

## Accomplishments

- Installed four read-only fast checks and six isolated financial jobs with exact stable identities.
- Applied and read back the organization-owned `main-financial-release` ruleset with merge queue, signed/linear history, strict status checks, one owner approval, and no bypass actors.
- Established explicit single-owner governance: `rc-digital-release-bot` authors protected PRs and `Rconman99` supplies the sole human approval.
- Replaced unsigned development history with a GitHub-verified signed snapshot only after proving the signed and reviewed trees had the same Git tree hash.
- Turned the first queue defect into a deterministic regression test, added `merge_group` execution for every fast job, and observed the corrected candidate pass all ten required contexts.
- Merged PR #3 through the queue; candidate and protected `main` commit `03c59d4e0983b91f723929eff3b230bc337ea67f` are identical.

## Task Commits and Live Receipts

1. **Tasks 1-2 signed implementation snapshot** — `6d6201f1fdc4831b5dba6667768b425fbd30252c`
2. **Merge-group fast-check regression and fix** — `255c1f20ada4847a934dec2bd61b88dce5281f68`
3. **Protected merge-group/main commit** — `03c59d4e0983b91f723929eff3b230bc337ea67f`
4. **Fast merge-group Actions run** — `33196583122` (success)
5. **Financial merge-group Actions run** — `33196583084` (success)

The pre-squash unsigned development history remains recoverable at
`backup/phase-01-live-controls-unsigned-20260828`; it is not merge authority.

## Decisions Made

- Accepted the project owner's explicit decision that no independent human reviewer will be added.
- Preserved a meaningful approval by having the narrowly scoped GitHub App author the PR while the sole owner approves it.
- Kept the signed-commit rule instead of weakening live protection when the initial queue attempt rejected unsigned commits.
- Required fast checks on `merge_group` after the live queue proved PR-only triggers leave required contexts permanently absent.

## Deviations from Plan

### Auto-fixed Issues

**1. Required signatures rejected the reviewed development history**

- **Found during:** First queue enqueue
- **Issue:** Fifteen local commits were unsigned, so the signed-history rule rejected the PR before creating a candidate.
- **Fix:** Created a GitHub-signed squash commit through the supported GraphQL flow, verified its tree hash exactly matched the reviewed head, preserved a recovery branch, and repointed only the PR branch.
- **Verification:** GitHub reports `verification.verified: true`; both trees were `2ff5bac418e980245753a47bd5e7206d818339d3`.

**2. Four required fast contexts did not run on merge-group candidates**

- **Found during:** First live merge-group attempt
- **Issue:** `check.yml` subscribed only to `pull_request`, so the merge queue waited forever for four contexts that could not materialize.
- **Fix:** Added a failing policy test, subscribed to `merge_group: checks_requested`, and made all four jobs unconditional for merge-group events.
- **Verification:** The corrected candidate ran and passed `check / lint`, `check / typecheck`, `check / unit`, and `check / build` in Actions run `33196583122`.

---

**Total deviations:** 2 auto-fixed live-control defects
**Impact on plan:** Both fixes strengthened the approved boundary; neither bypassed reviews, signatures, required checks, or the merge queue.

## Issues Encountered

- The generic CLI auto-merge path was disabled for the repository, so the queue-native GraphQL mutation was used with an exact expected head SHA.
- Post-merge `release-build` failed closed because Plan 10 provider/evidence variables and secrets are intentionally absent; this remains Plan 10 work.
- The unrelated non-financial documentation deployment lost authentication inside `gh-pages`; a follow-up regression fix is being prepared separately.

## User Setup Required

None for Plan 09. Plan 10 still requires the declared protected secrets and target variables.

## Next Phase Readiness

- REL-03 is satisfied and Plan 01-09 is complete.
- Plan 01-10 remains blocked on nine scoped environment secrets, provider/frontend target values, and the protected synthetic release chain.
- Phase 02 remains dependency-locked until Plan 01-10 passes.

## Self-Check: PASSED

- Live ruleset readback SHA-256: `a44f0db82c5eb7175da15804a68d45e33d3b09ea4fa9c67f46e40e4a4dcee93f`.
- Signed PR head `255c1f2` passed all four fast and all six financial checks.
- Merge-group `03c59d4` passed all ten exact required contexts with no bypass and became `main`.
- `npm test -- --run tests/release/release-policy.test.ts`: 49/49 passed for the merge-group fix head.
- `node scripts/release/security-gate.mjs coupling`: pass.

---
*Phase: 01-executable-financial-test-and-release-gate*
*Completed: 2026-08-28*
