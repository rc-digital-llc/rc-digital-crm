---
phase: 02-tenant-role-and-evidence-security
plan: "06"
subsystem: security
tags: [redaction, edge-functions, deno, logging, errors, vitest]

requires:
  - phase: 01-release-path
    provides: process-output redaction intent and Vitest release-contract harness
provides:
  - dependency-free recursive sensitive-value redaction
  - strict allowlisted structured log context
  - stable billing error response boundary without exception detail
  - negative regression fixtures for sensitive field families
affects: [02-automation, 02-evidence, 02-edge-functions, 04-billing-workflows, 05-provider-commands]

tech-stack:
  added: []
  patterns: [fail-closed recursive redaction, allowlisted operation context, stable public error catalog]

key-files:
  created:
    - supabase/functions/_shared/redaction.ts
    - tests/release/billing-redaction.test.ts
  modified:
    - supabase/functions/_shared/utils.ts

key-decisions:
  - "Arbitrary values are recursively redacted with stable markers; non-plain objects, cycles, and excessive depth fail closed without throwing."
  - "Operational logs admit only operation, code, result, reason code, opaque request ID, and status scalars."
  - "New billing errors use a separate strict helper while the legacy error helper remains source-compatible for unrelated functions."

patterns-established:
  - "Edge emission boundary: createSafeLogContext before structured logging and createBillingErrorResponse for public billing failures."
  - "Sensitive negative fixtures construct synthetic sentinels and assert none survive serialization."

requirements-completed: [SEC-07]

duration: 3min
completed: 2026-09-01
---

# Phase 2 Plan 06: Billing Redaction Boundary Summary

**Recursive fail-closed redaction, allowlisted log context, and stable public billing errors for privileged Edge commands**

## Performance

- **Duration:** 3 min
- **Started:** 2026-09-01T14:23:00-07:00
- **Completed:** 2026-09-01T14:27:00-07:00
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added dependency-free recursive redaction for sensitive keys, nested arrays, primitive secret patterns, bearer/JWT data, URLs, evidence paths, cycles, Error objects, unsupported values, and depth limits.
- Added a strict safe-log context that drops bodies, errors, URLs, identifiers, contacts, and provider fields while retaining only documented scalar diagnostics.
- Added a stable billing error helper that never serializes raw exceptions and preserved the legacy helper's response shape for existing Edge callers.
- Passed all 8 focused contracts, TypeScript typecheck, ESLint, and Prettier checks.

## Task Commits

Each task was committed atomically:

1. **Task 1: Build recursive value and URL redaction from negative fixtures** - `ade57922` (feat)
2. **Task 2: Route shared error and logging helpers through safe context** - `cebd091f` (feat)

## Files Created/Modified

- `supabase/functions/_shared/redaction.ts` - Recursive sanitizer and strict operation-context allowlist.
- `supabase/functions/_shared/utils.ts` - Stable billing error constructor and safe-context re-export.
- `tests/release/billing-redaction.test.ts` - Negative recursive and boundary fixtures for every prohibited data family.

## Decisions Made

- Replaced full URL values rather than preserving paths, because signed capability paths and evidence locations are themselves sensitive.
- Allowed opaque request correlation IDs only through a constrained scalar field; arbitrary record identifiers remain excluded.
- Kept new billing errors separate from the legacy generic helper so unrelated functions do not change behavior during this security phase.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed the committed dependency lockfile in the clean worktree**

- **Found during:** Task 1 red test
- **Issue:** The isolated worktree had no `node_modules`, so Vitest could not start.
- **Fix:** Ran `npm ci --ignore-scripts` from the existing lockfile; no dependency or lockfile changed.
- **Files modified:** None tracked
- **Verification:** Vitest 3.2.4 executed all focused contracts; git shows no package manifest changes.

---

**Total deviations:** 1 auto-fixed (1 blocking local-environment issue)
**Impact on plan:** The change only restored the repository's declared test environment; product scope and dependencies are unchanged.

## Issues Encountered

- The first test command stopped at a missing local Vitest executable. Installing the repository lockfile in the isolated worktree resolved the environment issue.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Automation and evidence Edge commands can now emit safe structured context and stable public errors without broad object serialization.
- The full focused suite passes 8/8 tests; TypeScript, ESLint, and Prettier checks pass.

---
*Phase: 02-tenant-role-and-evidence-security*
*Completed: 2026-09-01*
