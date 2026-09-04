---
phase: 04-agreements-revenue-evidence-and-calculation-close
plan: "02"
subsystem: database
tags: [postgresql, supabase, rls, pgtap, revenue, evidence, concurrency]
requires:
  - phase: 04-01
    provides: immutable active agreement versions and structured revenue rules
  - phase: 02-tenant-safe-billing-foundation
    provides: caller-bound roles, private evidence objects, and append-only audit
  - phase: 03-exact-financial-primitives
    provides: canonical USD parsing and exact minor-unit representation
provides:
  - Stable server-derived monthly revenue periods and immutable exact revisions
  - Caller-bound review decisions with durable owned exception history
  - Transactional accepted-evidence and contract-permitted minimum-only close snapshots
affects: [calculations, billing-providers, agreement-ui, monthly-close-ui]
tech-stack:
  added: []
  patterns:
    - Period-row serialization with post-lock replay recheck
    - Frozen close-input fingerprints over agreement, evidence, review, exception, and policy facts
key-files:
  created:
    - supabase/migrations/20260904000002_billing_revenue_periods.sql
    - supabase/tests/database/75_billing_revenue_periods.sql
    - tests/release/billing-revenue-close-contract.test.ts
  modified: []
key-decisions:
  - "Revenue corrections append linked revisions; no accepted input or captured evidence hash is overwritten."
  - "Reviewer outcomes are immutable facts, while exception resolution is a narrowly constrained open-to-resolved transition with append-only history."
  - "A minimum-only close freezes no revenue estimate: its money inputs remain null and its missing-evidence exception remains open."
patterns-established:
  - "Revenue command replay: actor plus command key binds the complete payload fingerprint and is rechecked after the period lock."
  - "Close safety: every accepted close rechecks current agreement evidence, submission evidence, fingerprints, review authority, exceptions, and policy before one immutable snapshot is inserted."
requirements-completed: [REV-01, REV-02, REV-04, REV-05, REV-06, REV-07]
duration: 23 min
completed: 2026-09-04
---

# Phase 4 Plan 2: Revenue Evidence and Close Input Summary

**Monthly revenue now moves from one stable period through immutable exact revisions and caller-bound review into one fully rechecked close-input snapshot, without estimates or cross-tenant disclosure.**

## Performance

- **Duration:** 23 min
- **Started:** 2026-09-04T20:47:00Z
- **Completed:** 2026-09-04T21:10:00Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Added server-derived monthly period identities, canonical USD revision submission, monotonic correction lineage, and frozen clean evidence hashes under forced RLS.
- Added explicit accept, reject, request-correction, and hold decisions with reviewer identity, input/evidence fingerprints, stable reason codes, owned exceptions, and append-only resolution history.
- Added transactional accepted-evidence and minimum-only close modes with agreement, deadline, review, evidence, exception, and policy rechecks before one immutable snapshot.
- Proved same-key and concurrent period/close convergence, stale-input denial, cross-tenant denial, early-minimum denial, and retained minimum exception behavior against live PostgreSQL.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create idempotent periods and immutable submission revisions** - `66558146` (feat)
2. **Task 2: Implement review outcomes and durable evidence exceptions** - `a186b449` (feat)
3. **Task 3: Freeze accepted or minimum-only close inputs safely** - `fbaa162e` (feat)
4. **Task 3 verification hardening: Isolate pgTAP fixtures from live race rows** - `f7ae1c66` (test)

## Files Created/Modified

- `supabase/migrations/20260904000002_billing_revenue_periods.sql` - Period, revision, evidence-link, review, exception, replay, and close-snapshot authority.
- `supabase/tests/database/75_billing_revenue_periods.sql` - Forty-seven live pgTAP authorization, immutability, review, exception, and close assertions.
- `tests/release/billing-revenue-close-contract.test.ts` - Authenticated concurrent period/close, replay, stale evidence, minimum deadline, and tenant-safety contract.

## Decisions Made

- Revenue evidence must be a clean, active, unheld account-owned `revenue_statement`; each link captures its SHA-256 and ordinal.
- Exactly one immutable acceptance event may exist per period; changed or second acceptance cannot silently replace prior authority.
- Minimum-only close stores null revenue amounts and a required open exception rather than inventing a zero or estimated revenue figure.
- Periods remain immutable; closed state is represented by the presence of one immutable close snapshot, and later submit/review commands fail closed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Rechecked replay after acquiring the period lock**

- **Found during:** Task 3 concurrent period verification
- **Issue:** Multiple identical callers could all miss the pre-lock replay lookup, then collide on the command-event uniqueness constraint.
- **Fix:** Recheck the same complete request fingerprint after the advisory/row lock in period, submit, review, and close commands.
- **Files modified:** `supabase/migrations/20260904000002_billing_revenue_periods.sql`
- **Verification:** Twelve simultaneous period calls return the same response, and twelve simultaneous close calls return one snapshot/event.
- **Committed in:** `fbaa162e`

**2. [Rule 1 - Bug] Scoped pgTAP aggregate assertions to their deterministic period**

- **Found during:** Plan-level verification after the live concurrency suite
- **Issue:** Persisted live race rows made broad table-count assertions report valid unrelated rows.
- **Fix:** Filtered period, revision, and evidence-link aggregates to the deterministic test agreement and period.
- **Files modified:** `supabase/tests/database/75_billing_revenue_periods.sql`
- **Verification:** pgTAP remains 47/47 both before and after the live authenticated suite populates additional rows.
- **Committed in:** `f7ae1c66`

---

**Total deviations:** 2 auto-fixed bugs. **Impact on plan:** Both strengthen the intended concurrency and test-isolation contract without expanding product scope.

## Issues Encountered

- The full local Supabase stack hit an ancillary-container cleanup/bootstrap failure before assertions. The complete migration applied on a database-only local stack, where pgTAP and authenticated concurrency tests passed.

## User Setup Required

None - no hosted schema, credentials, or external service changes were made.

## Next Phase Readiness

- Immutable active agreement terms and frozen revenue close inputs are ready for exact fixed, percentage, minimum-support, and hybrid calculation snapshots in Plan 04-03.
- The database-only local stack remains available for the adjacent calculation plan and will be stopped after the wave gate.

## Self-Check: PASSED

- All three key files exist and all four `04-02` implementation/verification commits are present.
- `supabase/tests/database/75_billing_revenue_periods.sql`: 47/47 assertions pass.
- `billing-revenue-close-contract.test.ts`: 3/3 tests pass with live Auth/RPC concurrency enabled.
- Clean database-only migration apply reaches `20260904000002`; `git diff --check` passes.
- The migration contains composite account/evidence lineage and the transactional `close_billing_revenue_period(jsonb)` to immutable `billing_revenue_close_snapshots` link.

---

_Phase: 04-agreements-revenue-evidence-and-calculation-close_
_Completed: 2026-09-04_
