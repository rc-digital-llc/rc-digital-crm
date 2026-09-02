---
phase: 02-tenant-role-and-evidence-security
plan: "01"
subsystem: database
tags: [postgresql, supabase, rls, rbac, audit, pgtap]

requires:
  - phase: 01-release-path
    provides: isolated Supabase migration and database-contract release lanes
provides:
  - explicit billing organization, account, owner, and contact model
  - caller-bound five-role capability kernel with forced RLS
  - append-only allowlisted billing security audit events
  - deterministic two-organization pgTAP role-isolation proof
affects: [02-billing-boundary, 02-auth-tenancy, 02-automation, 02-evidence, 02-operator-ui]

tech-stack:
  added: []
  patterns: [private security-definer capability helpers, forced RLS, effective-dated role assignment, immutable audit ledger]

key-files:
  created:
    - supabase/migrations/20260901000001_billing_tenant_roles.sql
    - supabase/tests/support/billing-security-fixtures.sql
    - supabase/tests/database/30_billing_tenancy.sql
  modified:
    - scripts/release/run-supabase-lane.mjs

key-decisions:
  - "Tenant authority is derived from auth.uid() through active assignments or customer contact bindings, never from browser-supplied tenant IDs."
  - "Human roles are normalized, independently assignable, and combined as a capability union while the catalog remains migration-managed."
  - "Billing lifecycle is non-destructive and security mutations append only allowlisted role/status audit details."

patterns-established:
  - "Billing authorization: call private.billing_has_capability from forced-RLS policies with schema-qualified objects and an empty search_path."
  - "Billing test fixtures: preload deterministic support SQL into the isolated database container before running transactional pgTAP files."

requirements-completed: [WORK-01, SEC-01, SEC-03, SEC-06]

duration: 10min
completed: 2026-09-01
---

# Phase 2 Plan 01: Tenant, Role, and Audit Kernel Summary

**Caller-bound billing accounts and five normalized human roles enforced by forced PostgreSQL RLS with append-only audit evidence**

## Performance

- **Duration:** 10 min
- **Started:** 2026-09-01T14:10:00-07:00
- **Completed:** 2026-09-01T14:20:00-07:00
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added explicit billing organizations, accounts, responsible owners, authorized contacts, normalized roles/capabilities, effective assignments, and immutable audit events.
- Enforced account and organization isolation from the authenticated caller through private, empty-search-path helpers and forced RLS on every billing relation.
- Proved all five roles across two organizations with 42 billing assertions inside the 117-assertion database-contract lane.
- Preserved non-destructive lifecycle and verified denied cross-tenant, hard-delete, and audit-tampering operations leave protected rows unchanged.

## Task Commits

Each task was committed atomically:

1. **Task 1: Install the tenant, account, role, and audit kernel** - `f6fcfdc6` (feat)
2. **Task 2: Prove catalog hardening, role separation, and exact audit effects** - `430f8358` (test)
3. **Task 2 follow-up: Tighten capability immutability and exact audit counts** - `32b5e0b8` (test)

## Files Created/Modified

- `supabase/migrations/20260901000001_billing_tenant_roles.sql` - Billing tenant model, capability helpers, forced RLS, grants, and immutable audit triggers.
- `supabase/tests/support/billing-security-fixtures.sql` - Reserved synthetic principals for five roles in each of two organizations.
- `supabase/tests/database/30_billing_tenancy.sql` - Exact role, cross-tenant, catalog, and audit pgTAP contracts.
- `scripts/release/run-supabase-lane.mjs` - Deterministically loads both database support fixtures into the isolated test container.

## Decisions Made

- Kept capability vocabulary in normalized migration-owned tables. Authenticated callers receive read-only catalog access; future migrations can extend the vocabulary without disabling a database trigger.
- Treated responsible ownership as account business data, separate from tenant authority.
- Stored only allowlisted role/status metadata in generic audit events so contact or credential payloads cannot leak into the ledger.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Loaded the billing fixture through the isolated-lane bootstrap**

- **Found during:** Task 2 (database role contracts)
- **Issue:** Supabase executes pgTAP inside a container where a host-relative `\\ir` support path is unavailable.
- **Fix:** Expanded the existing database fixture loader to copy and execute both deterministic fixture files before assertions.
- **Files modified:** `scripts/release/run-supabase-lane.mjs`, `supabase/tests/database/30_billing_tenancy.sql`
- **Verification:** Lane self-test passed; the database-contract lane passed all 117 assertions.
- **Committed in:** `430f8358`

**2. [Rule 3 - Process] Used the authorized clean feature worktree for sequential execution**

- **Found during:** Plan execution setup
- **Issue:** The generic parallel-executor guard expects agent-named worktree branches, while this user-created clean worktree uses `codex/phase-02-security` and execution is sequential.
- **Fix:** Kept all atomic commits on the authorized clean feature branch and did not touch the user's dirty primary checkout.
- **Files modified:** None
- **Verification:** Task commits are isolated and the primary checkout remains untouched.

---

**Total deviations:** 2 auto-fixed (1 blocking infrastructure issue, 1 execution-environment process adaptation)
**Impact on plan:** Both changes were necessary to produce executable proof safely; product scope did not expand.

## Issues Encountered

- The first database-contract run could not resolve a host-relative fixture include inside the Supabase test container. Explicit isolated-lane fixture loading resolved it without weakening test isolation.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The authoritative human tenant and role boundary is ready for invoice RPCs, real Auth tenancy, automation identities, evidence storage, and operator UI.
- Clean migration-chain receipt: 34 migrations through `20260901000001`, hash `bb2cc47b6e9a1dee3565c1d7b64b08331909b4c5900f125b38bb0b013a502d7b`.
- Database-contract receipt: 4 files and 117 assertions passed.

---
*Phase: 02-tenant-role-and-evidence-security*
*Completed: 2026-09-01*
