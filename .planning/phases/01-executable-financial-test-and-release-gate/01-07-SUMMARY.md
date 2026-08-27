---
phase: 01-executable-financial-test-and-release-gate
plan: 07
subsystem: release-security
tags: [dependencies, gitleaks, source-maps, release-gate, redaction]

requires:
  - phase: 01-01
    provides: Release policy, stable commands, and exact required check identities
provides:
  - Zero unresolved critical or high production dependency advisories
  - Fully redacted current-tree and Git-history secret scanning
  - Hash-pinned exact classification for reproducible local-only Supabase keys
  - Fail-closed public source-map, bundle-marker, and release-workflow coupling checks
affects: [phase-01-ci, protected-deployment, all-financial-phases]

tech-stack:
  added: []
  patterns:
    - Value-blind reproduction before classifying a historical credential finding
    - Exact Gitleaks fingerprints protected by a committed policy-set hash
    - One non-waivable release-security command for dependency, secret, bundle, and coupling checks

key-files:
  created:
    - .gitleaks.toml
    - scripts/release/security-gate.mjs
    - tests/release/security-gate.test.ts
  modified:
    - package.json
    - package-lock.json
    - vite.config.ts
    - .gitignore
    - .gitleaksignore

key-decisions:
  - "Classify a historical key as local-only only after a value-blind exact comparison reproduces it from the isolated local Supabase stack."
  - "Permit only the two exact commit/file/rule/line fingerprints and hash-pin the complete ignore set so broadening it fails closed."
  - "Keep every release-security class non-waivable and emit only rule, path, commit, counts, and report digests."

patterns-established:
  - "Historical-secret classification: reproduce without printing values, bind the result to exact fingerprints, and test that any additional ignore entry fails."
  - "Release-security authority: dependency, history/tree secret, bundle, and workflow-coupling sub-gates must all pass the same blocking command."

requirements-completed: [REL-05]

duration: 20min
completed: 2026-08-27
---

# Phase 1 Plan 07: Release Security Gate Summary

**The release-security gate now blocks vulnerable production dependencies, unclassified secrets, public source maps, bundle markers, and workflow bypasses while narrowly classifying only a value-blind-reproduced local Supabase key**

## Performance

- **Duration:** 20 min final close-out; implementation was committed in the preceding execution session
- **Started:** 2026-08-27T16:01:00Z
- **Completed:** 2026-08-27T16:21:47Z
- **Tasks:** 3
- **Files modified:** 13

## Accomplishments

- Cleared all critical and high production dependency advisories without audit-force or registry substitution.
- Removed tracked development environment files and enforced exact ignore rules for future local secret-bearing files.
- Added fully redacted Gitleaks scans for the current tree and complete Git history, with stable report SHA-256 output and negative leak tests.
- Proved without disclosing either value that the two historical findings equal the isolated `atomic-crm-demo` local stack outputs, then limited classification to their exact fingerprints.
- Disabled production source maps and added recursive bundle checks for map files and secret-like markers.
- Added release-workflow coupling checks so all security classes remain unconditional and non-waivable.

## Task Commits

Each task was committed atomically:

1. **Task 1: Clear critical/high production dependency advisories** - `4b5f74f`
2. **Task 2: Remove tracked secrets and enforce redacted history/tree scans** - `ce97f3f` (failing contracts), `65c692d` (implementation), `d1738f2` (local-only classification)
3. **Task 3: Remove public source maps and complete the release-security gate** - `a6356f3` (failing contracts), `1a304ba` (implementation), `0caa43e` (test-lane isolation)

## Files Created/Modified

- `package.json` and `package-lock.json` - Replace vulnerable production dependency paths and expose the release-security commands.
- `.gitignore` - Names the removed local secret-bearing environment files exactly.
- `.gitleaks.toml` - Defines redacted secret-scanning policy without broad path exclusions.
- `.gitleaksignore` - Classifies only exact reproducible local-stack fingerprints with value-blind proof notes.
- `scripts/release/security-gate.mjs` - Runs dependency, history/tree secret, bundle, and workflow-coupling gates and validates the hash-pinned ignore set.
- `tests/release/security-gate.test.ts` - Covers leakage redaction, synthetic findings, broad allowlists, ignore-set expansion, source maps, bundle markers, and workflow bypasses.
- `vite.config.ts` - Disables production source maps.
- `tests/release/auth-rls-rpc-trigger.test.ts`, `tests/release/edge-webhook-provider.test.ts`, and `tests/release/replay-concurrency.test.ts` - Keep live financial harnesses out of the ordinary unit-test process while retaining their dedicated blocking lanes.

## Decisions Made

- Used a value-blind equality comparison between the historical finding and outputs from a freshly started isolated local Supabase stack; no credential value was printed, stored, or committed.
- Treated reproducibility as necessary but not sufficient: only the two observed commit/file/rule/line fingerprints are classified, and the complete allowed set is protected by an expected SHA-256.
- Kept the gate unable to consume a waiver or rotation override. A future non-reproducible finding remains blocking until the underlying provider credential is rotated and the policy is deliberately updated.

## Deviations from Plan

### Auto-fixed Issues

**1. The historical findings were initially treated as a hosted credential**

- **Found during:** Task 2 final acceptance
- **Issue:** The redacted scanner could not distinguish a real provider secret from the deterministic local key generated for the committed `atomic-crm-demo` development stack.
- **Fix:** Reproduced the local stack outputs, compared them to the historical finding without revealing values, and added only the two exact fingerprints to the hash-pinned classification set.
- **Verification:** `make test-release-secrets` reports zero findings for both history and the current tree; adding any third fingerprint fails policy validation.
- **Committed in:** `d1738f2`

**2. Live financial Vitest harnesses ran inside the ordinary unit process**

- **Found during:** Task 3 full release-security regression
- **Issue:** The generic unit suite imported live-service harnesses intended for their dedicated database/provider/concurrency lanes.
- **Fix:** Scoped those files to their dedicated opt-in lane variables without weakening any blocking financial check.
- **Verification:** Ordinary tests and every dedicated financial lane execute independently.
- **Committed in:** `0caa43e`

---

**Total deviations:** 2 auto-fixed blocking execution defects
**Impact on plan:** Both fixes preserve the approved acceptance boundary: real secrets stay blocking, deterministic local fixtures are classified narrowly, and live financial tests remain mandatory in their independent lanes.

## Issues Encountered

- A stale zero-byte `.git/index.lock` remained after an interrupted Git process. No process owned it; the exact stale lock was removed before the final atomic commit.

## User Setup Required

None. The classified historical values belong to the isolated local Supabase stack, so no hosted provider credential exists to rotate for these findings.

## Next Phase Readiness

- Plan 01-09 can now prove the live `release-security` context on PR #2 and proceed to its independent-review and merge-group acceptance check.
- Plan 01-10 remains correctly blocked on owner-selected scoped environment credentials, provider/frontend targets, an independent reviewer, and the protected synthetic release chain.
- Phase 02 remains dependency-locked until Plans 01-09 and 01-10 pass.

## Self-Check: PASSED

- `make test-release-secrets`: history and current-tree scans pass with zero findings; report SHA-256 `4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945`.
- `make test-release-security`: dependencies, secrets, bundle, and coupling pass.
- Required source files and every task commit listed above exist.

---
*Phase: 01-executable-financial-test-and-release-gate*
*Completed: 2026-08-27*
