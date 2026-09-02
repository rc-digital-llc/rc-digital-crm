---
phase: 02-tenant-role-and-evidence-security
plan: "04"
subsystem: database
tags: [supabase, postgres, automation, authorization, concurrency, audit]

requires:
  - phase: 02-tenant-role-and-evidence-security
    plan: "01"
    provides: billing tenant, human-role, capability, and append-only audit kernel
  - phase: 01-executable-financial-test-and-release-gate
    plan: "06"
    provides: real multi-session PostgreSQL replay and concurrency harness
provides:
  - first-class organization-bound automation principals
  - exact account/command/provider/policy/action grants with amount and action limits
  - transactional protected effect, consumption, receipt, and audit kernel
  - live tuple-mismatch, rollback, replay, and simultaneous last-unit proofs
affects: [05-provider-commands, 06-financial-state-machine, 08-customer-portal, 10-collections]

tech-stack:
  added: []
  patterns: [effect-level authorization, caller rebinding, row-locked quota consumption, idempotent execution receipts]

key-files:
  created:
    - supabase/migrations/20260901000003_billing_automation_grants.sql
    - supabase/tests/database/35_billing_automation.sql
  modified:
    - supabase/tests/support/billing-security-fixtures.sql
    - scripts/release/run-supabase-lane.mjs
    - tests/release/replay-concurrency.test.ts

key-decisions:
  - "Automation authority is an exact grant tuple consumed inside the same transaction as its synthetic protected effect, execution receipt, and audit event."
  - "Automation identities cannot hold human billing roles or receive generic table access; their sole authenticated surface is the effect-level command function."
  - "True simultaneous last-unit proof runs through parallel Docker/psql sessions because the local pgTAP role cannot authenticate independent dblink sessions."

patterns-established:
  - "Machine caller authorization: re-resolve auth.uid(), lock the principal and exact grant, then validate status, validity, limits, and idempotency before any effect."
  - "Concurrent limits: serialize at the principal/grant boundary and persist one unique execution receipt so same-key races converge to one apply plus duplicates."

requirements-completed: [SEC-02, SEC-04, SEC-06]

duration: 17min
completed: 2026-09-01
---

# Phase 2 Plan 04: Automation Grants Summary

**Caller-bound automation grants with transactional quota consumption, immutable receipts, and a passing 32-session last-unit race**

## Performance

- **Duration:** 17 min
- **Started:** 2026-09-01T14:45:00-07:00
- **Completed:** 2026-09-01T15:02:00-07:00
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added organization-bound automation principals and exact grants covering account, command, provider reference, policy version, action kind, validity, amount, and action limits.
- Exposed one authenticated effect-level command surface that derives its caller from `auth.uid()`, denies human-role overlap, and grants no direct protected-table authority.
- Made grant validation, quota consumption, synthetic nonfinancial effect, unique execution receipt, and allowlisted audit append one rollback-safe transaction.
- Passed 165 live database assertions and a 32-process race that produced exactly one applied command, 31 duplicates, one receipt, one audit, and exact exhausted counters.

## Task Commits

Each task was committed atomically:

1. **Task 1: Install first-class automation principals and exact grants** - `5b12f6fb` (feat)
2. **Task 2: Prove fail-closed tuple matching, consumption, replay, and locking** - `98c53ac6` (test)

## Files Created/Modified

- `supabase/migrations/20260901000003_billing_automation_grants.sql` - Principal/grant schema, overlap protection, immutable executions, and transactional command kernel.
- `supabase/tests/database/35_billing_automation.sql` - Catalog, mismatch, expiry, status, limit, replay, rollback, audit, and immutability contracts.
- `supabase/tests/support/billing-security-fixtures.sql` - Two-tenant automation identities and bounded grant fixtures.
- `scripts/release/run-supabase-lane.mjs` - Billing fixture loading for the isolated replay/concurrency lane.
- `tests/release/replay-concurrency.test.ts` - Real 32-session final-unit race and exact post-race assertions.

## Decisions Made

- Bound every automation permission to the complete grant tuple instead of accepting a generic service identity or caller-supplied tenant authority.
- Locked the automation principal before idempotency and grant consumption so commands across grants for one machine identity cannot race past quotas or duplicate a key.
- Returned only a synthetic nonfinancial receipt; live provider commands and money movement remain outside this phase.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Made the shared immutable-scope trigger safe across two table shapes**

- **Found during:** Task 2 (live allowed-command contract)
- **Issue:** Direct `OLD`/`NEW` field references were resolved for both trigger tables, causing a missing-field error even inside the table-name branch.
- **Fix:** Converted trigger records to JSONB and compared only the table-appropriate immutable keys.
- **Files modified:** `supabase/migrations/20260901000003_billing_automation_grants.sql`
- **Verification:** Clean schema push and all 165 live database assertions pass.
- **Committed in:** `98c53ac6`

**2. [Rule 3 - Blocking] Moved simultaneous proof to the existing external-session harness**

- **Found during:** Task 2 (concurrent last-unit proof)
- **Issue:** The local Supabase pgTAP execution role cannot authenticate separate `dblink` sessions, so an in-file test could not create genuine independent transactions.
- **Fix:** Added the same assertion to the established Docker/psql replay-concurrency lane and loaded the billing fixtures before that lane executes.
- **Files modified:** `scripts/release/run-supabase-lane.mjs`, `tests/release/replay-concurrency.test.ts`
- **Verification:** `make test-financial-replay-concurrency` passes with 32 parallel PostgreSQL processes.
- **Committed in:** `98c53ac6`

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking test-environment constraint). **Impact on plan:** Both fixes were required for correct live proof; the authorization scope and synthetic-only command boundary did not expand.

## Issues Encountered

- The first concurrent implementation used `dblink`, which the isolated local test role correctly could not authenticate. The established external multi-session lane now provides the stronger concurrency evidence.

## User Setup Required

None - all execution used disposable loopback Supabase projects and the protected dashboard project was not touched.

## Next Phase Readiness

- Provider adapters can consume a narrow, caller-bound authorization result without gaining generic service-role access.
- Evidence and command plans can reference immutable execution IDs and allowlisted audit events.
- Clean schema receipt: 36 migrations through `20260901000003`, hash `9c78a6010f58064ef46178ec16688356c2af6546398ce60a6a306030ada7c215`.

## Self-Check: PASSED

- `make test-financial-schema-push`
- `make test-financial-database-sql`
- `make test-financial-replay-concurrency`
- `npm run lint -- --quiet`
- `npm run typecheck`

---
*Phase: 02-tenant-role-and-evidence-security*
*Completed: 2026-09-01*
