---
phase: 02-tenant-role-and-evidence-security
plan: "03"
subsystem: testing
tags: [supabase, auth, jwt, postgrest, rls, audit, tenancy]

requires:
  - phase: 02-tenant-role-and-evidence-security
    plan: "01"
    provides: caller-bound human role, account, and append-only audit kernel
  - phase: 02-tenant-role-and-evidence-security
    plan: "02"
    provides: invoice billing-account ownership and capability RLS
provides:
  - ten real local Auth principals spanning five roles and two organizations
  - 120-case PostgREST read matrix across six protected billing resources
  - exact authorized mutation and audit-event postconditions
  - zero-effect cross-tenant, wrong-role, forged-scope, and hard-delete proof
affects: [02-edge-evidence, 02-account-ui, 05-provider-operations, 08-customer-portal]

tech-stack:
  added: []
  patterns: [real local JWT acceptance, data-driven tenancy matrix, service-only postconditions, token-redacted process execution]

key-files:
  created:
    - tests/release/billing-tenancy.test.ts
  modified:
    - supabase/migrations/20260901000001_billing_tenant_roles.sql

key-decisions:
  - "HTTP acceptance creates real local Auth users and binds their server-created sales identities through a service-only setup boundary; tests never mint or mock JWT claims."
  - "Denied mutations are authoritative only when the complete protected account/contact/assignment/audit snapshot remains exact, regardless of whether PostgREST returns an empty success or a safe denial."
  - "The generic billing audit trigger derives organization/account UUID identities from JSON text only in the matching table branch so bigint invoice IDs remain valid subjects."

patterns-established:
  - "D-16 human registry: principal, organization, account, resource, operation, expected visibility, and result are explicit for every role/tenant combination."
  - "HTTP test diagnostics name only role, tenant alias, resource, and operation; JWTs, contact values, and protected row payloads remain out of output."

requirements-completed: [WORK-01, SEC-02, SEC-03, SEC-06]

duration: 15min
completed: 2026-09-01
---

# Phase 2 Plan 03: Real Auth Tenancy Summary

**Real local Supabase JWTs prove five-role two-tenant visibility, exact allowed audits, and zero-effect denied mutations across PostgREST**

## Performance

- **Duration:** 15 min
- **Started:** 2026-09-01T15:40:00-07:00
- **Completed:** 2026-09-01T15:55:00-07:00
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Created ten distinct local Auth sessions covering administrator, operator, reviewer, auditor, and customer roles in each of two organizations, then bound their server-created sales identities without logging tokens or contacts.
- Executed 120 named read cases across accounts, owners, contacts, assignments, audit events, and invoices; same-account capabilities differ by role and every cross-tenant read returns zero protected rows.
- Proved authorized account status, contact ending, and role assignment operations each change the intended row and append exactly one allowlisted audit event for the verified actor.
- Proved cross-tenant, reviewer mutation, browser-authored tenant, account delete, contact delete, and assignment delete attempts leave the entire protected state and audit count unchanged.
- Cleaned up every created session and Auth user through the isolated test boundary.

## Task Commits

Each task was committed atomically:

1. **Task 1: Exercise the real human role and two-tenant read matrix** - `cf414d93` (red test), `64cd68a8` (test/fix)
2. **Task 2: Prove mutation denials and exact audit/effect postconditions** - `bf7e5b20` (red test), `5eeb7335` (test)

## Files Created/Modified

- `tests/release/billing-tenancy.test.ts` - Local guard, real Auth lifecycle, two-tenant fixture binding, 120-case read registry, exact mutation/audit assertions, denial snapshots, and cleanup.
- `supabase/migrations/20260901000001_billing_tenant_roles.sql` - Table-safe UUID derivation in the shared billing audit trigger.

## Decisions Made

- Used the isolated database container only to establish/inspect fixtures and postconditions; every authorization result still comes from a real Bearer JWT crossing PostgREST.
- Compared complete safe protected-state snapshots after denials because an empty PostgREST response alone does not prove the database remained unchanged.
- Kept HTTP assertions on IDs, statuses, roles, and allowlisted audit fields so assertion failures cannot print JWTs, contact values, evidence paths, or provider material.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Made the shared billing audit trigger compatible with bigint invoice IDs**

- **Found during:** Task 1 (real invoice fixture insertion)
- **Issue:** `billing_audit_change` referenced typed `NEW.id` inside UUID `CASE` branches. PostgreSQL resolved the trigger record's invoice ID as bigint before branch evaluation, so invoice inserts failed with a UUID/bigint type mismatch.
- **Fix:** Derived organization/account UUID identities from `row_data` text only inside the matching organization/account table branch; invoice subjects continue to use their text ID without a UUID cast.
- **Files modified:** `supabase/migrations/20260901000001_billing_tenant_roles.sql`
- **Verification:** Both live HTTP tests, all 230 PostgreSQL assertions, and the clean 37-migration schema push pass.
- **Committed in:** `64cd68a8`

---

**Total deviations:** 1 auto-fixed trigger bug. **Impact on plan:** The fix makes the planned generic audit path work for inherited invoices without changing authorization or product scope.

## Issues Encountered

- The first live setup exposed the cross-table trigger type mismatch; the real HTTP fixture served as the regression proof after correction.
- The initial invoice matrix query used the generic `account_id` filter instead of the inherited `billing_account_id` column; the registry adapter was corrected and rerun cleanly.

## User Setup Required

None - all Auth, HTTP, and PostgreSQL execution used disposable loopback Supabase projects; the protected dashboard project was not touched.

## Next Phase Readiness

- Evidence Edge commands can now rely on externally proven human JWT/account capabilities and safe denial postconditions.
- The billing account UI can consume the same role distinctions knowing browser visibility is backed by RLS rather than presentation state.
- Clean schema receipt: 37 migrations through `20260901000004`, hash `ebd15f781a1accbe1de58d6c3cfd2cdfb0c45515d808b2070faed340dbaaacbf`.

## Self-Check: PASSED

- `node scripts/release/run-supabase-lane.mjs run --lane database-contracts -- npm test -- --run tests/release/billing-tenancy.test.ts -t human`
- `node scripts/release/run-supabase-lane.mjs run --lane database-contracts -- npm test -- --run tests/release/billing-tenancy.test.ts -t effects`
- `node scripts/release/run-supabase-lane.mjs run --lane database-contracts -- npm test -- --run tests/release/billing-tenancy.test.ts` (2 passed)
- `npm run typecheck`
- `npm run lint -- --quiet`
- `make test-financial-database-sql` (230 assertions)
- `make test-financial-schema-push` (37 migrations)

---
*Phase: 02-tenant-role-and-evidence-security*
*Completed: 2026-09-01*
