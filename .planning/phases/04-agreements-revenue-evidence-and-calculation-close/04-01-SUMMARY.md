---
phase: 04-agreements-revenue-evidence-and-calculation-close
plan: "01"
subsystem: database
tags: [postgresql, supabase, rls, pgtap, agreements, exact-money]
requires:
  - phase: 02-tenant-safe-billing-foundation
    provides: caller-bound tenant roles, private evidence, and immutable audit events
  - phase: 03-exact-financial-primitives
    provides: exact USD money, reduced percentage rates, and pinned rounding policies
provides:
  - Immutable account-scoped billing agreement identities and structured versions
  - Replay-safe human draft, submit, activate, pause, terminate, and read commands
  - Database-level non-overlap, signed-evidence, authorization, and concurrency proof
affects: [revenue-periods, calculations, billing-providers, billing-ui]
tech-stack:
  added: [btree_gist]
  patterns:
    - Immutable activated financial versions with append-only lifecycle events
    - Caller-bound JSON RPCs with complete request fingerprints
key-files:
  created:
    - supabase/migrations/20260904000001_billing_agreements.sql
    - supabase/tests/database/70_billing_agreements.sql
    - tests/release/billing-agreement-contract.test.ts
  modified:
    - supabase/tests/support/billing-security-fixtures.sql
key-decisions:
  - "Agreement activation uses an account/agreement advisory lock plus a GiST exclusion constraint; accepted active ranges are never truncated."
  - "Pause and terminate are append-only lifecycle events, preserving the activated structured version as immutable evidence."
  - "Agreement commands authorize only human role assignments; accepted same-person approval is explicitly persisted as self_approved."
patterns-established:
  - "Agreement command replay: actor plus command key binds a canonical full-payload SHA-256 and returns the original response only on exact equality."
  - "Agreement evidence anchor: a clean, active, unheld contract object is re-read and its SHA-256 is frozen at draft and activation."
requirements-completed: [AGR-01, AGR-02, AGR-03, AGR-04, AGR-05]
duration: 22 min
completed: 2026-09-04
---

# Phase 4 Plan 1: Immutable Agreement Authority Summary

**Exact USD agreement versions now move through caller-bound human lifecycle commands with signed-evidence anchoring, immutable activation, and race-safe non-overlap.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-09-04T20:22:00Z
- **Completed:** 2026-09-04T20:44:42Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Added stable agreement identities, exact structured terms, complete revenue rules, and append-only lifecycle evidence under forced RLS.
- Added human-only draft, review, activation, pause, terminate, and account-scoped read RPCs with stable replay behavior and safe errors.
- Proved all four formula classes, monthly boundaries, contract evidence, role denials, self-approval marking, and one-winner overlapping activation.

## Task Commits

Each task was committed atomically:

1. **Task 1: Define immutable agreement and revenue-rule facts** - `92d68e81` (feat)
2. **Task 2: Implement caller-bound agreement lifecycle commands** - `7b7dcbb1` (feat)
3. **Task 3: Prove agreement authorization and activation concurrency** - `a2c60e14` (test)

## Files Created/Modified

- `supabase/migrations/20260904000001_billing_agreements.sql` - Agreement schema, constraints, RLS, lifecycle commands, and safe reads.
- `supabase/tests/database/70_billing_agreements.sql` - Forty-five live pgTAP agreement assertions.
- `tests/release/billing-agreement-contract.test.ts` - Authenticated two-session activation, replay, denial, and response-safety contract.
- `supabase/tests/support/billing-security-fixtures.sql` - Clean deterministic signed-contract fixture metadata.

## Decisions Made

- Activated term rows remain unchanged forever; operational pause and termination are separate immutable events.
- Human capabilities are split into `agreement.read`, `agreement.manage`, and `agreement.approve`; no automation principal can approve terms.
- Every active interval has a fixed monthly-aligned end, allowing successor versions without silently rewriting prior evidence.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected SQL special-form qualification and operator precedence**

- **Found during:** Tasks 1 and 2
- **Issue:** PostgreSQL rejected schema-qualified `EXTRACT`, and JSON extraction bound incorrectly inside an advisory-lock expression.
- **Fix:** Used the SQL `extract(...)` special form and parenthesized the JSON scalar before concatenation.
- **Files modified:** `supabase/migrations/20260904000001_billing_agreements.sql`
- **Verification:** Disposable 44-migration schema push and live pgTAP pass.
- **Committed in:** `7b7dcbb1`

**2. [Rule 1 - Bug] Replaced broad row-JSON comparison in the activation trigger**

- **Found during:** Task 2
- **Issue:** The submitted-to-active transition was rejected despite changing only approval fields.
- **Fix:** Compared the immutable column tuple explicitly while allowing only the approved lifecycle fields.
- **Files modified:** `supabase/migrations/20260904000001_billing_agreements.sql`
- **Verification:** Reviewer activation, active immutability, and concurrent activation tests pass.
- **Committed in:** `7b7dcbb1`

---

**Total deviations:** 2 auto-fixed bugs. **Impact on plan:** Both fixes were required for the intended PostgreSQL contract; scope and architecture did not change.

## Issues Encountered

- The full local Supabase stack twice timed out during cold ancillary-service health checks. The database contract was verified with a database-only local stack, while the independent schema-push harness verified the complete migration chain.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Agreement version, rule, event, and safe-read contracts are ready for monthly revenue periods and calculations.
- Hosted schema and release environments remain untouched; Phase 4 continues locally.

## Self-Check: PASSED

- All key files exist and all three `04-01` task commits are present.
- `supabase/tests/database/70_billing_agreements.sql`: 45/45 assertions pass.
- `billing-agreement-contract.test.ts`: 3/3 tests pass with live concurrency enabled.
- Disposable migration chain applies through `20260904000001` and `git diff --check` passes.

---

_Phase: 04-agreements-revenue-evidence-and-calculation-close_
_Completed: 2026-09-04_
