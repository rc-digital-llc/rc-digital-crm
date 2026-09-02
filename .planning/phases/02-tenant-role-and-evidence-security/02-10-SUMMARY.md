---
phase: 02-tenant-role-and-evidence-security
plan: "10"
subsystem: billing-access-evidence-ui
tags: [react-admin, supabase, rls, evidence, query-cache, least-privilege]

requires:
  - phase: 02-tenant-role-and-evidence-security
    plan: "07"
    provides: caller-bound evidence commands and private Storage capability boundary
  - phase: 02-tenant-role-and-evidence-security
    plan: "09"
    provides: responsive billing-account detail hierarchy and extension slots
provides:
  - capability-aware human-role and automation access panels
  - allowlisted account access summaries plus reasoned role/automation commands
  - quarantine-first evidence metadata, upload, access, and history presentation
  - transient signed-capability lifecycle with logout/role-change cleanup
  - billing-sensitive query dehydration exclusion and memory/storage purge
affects: [02-surface-gate, 02-protected-lane-coupling, 03-money-contract]

tech-stack:
  added: []
  patterns: [presentation-only capability adapter, allowlisted security summary, transient bearer capability, sensitive-query predicate]

key-files:
  created:
    - src/components/atomic-crm/billing-accounts/BillingAccountAccessPanels.tsx
    - src/components/atomic-crm/billing-accounts/BillingAccountEvidencePanel.tsx
    - src/components/atomic-crm/billing-accounts/billingAccess.ts
    - supabase/migrations/20260901000006_billing_access_commands.sql
    - supabase/migrations/20260901000007_billing_evidence_presentation.sql
    - supabase/tests/database/50_billing_access_commands.sql
    - supabase/tests/database/55_billing_evidence_presentation.sql
  modified:
    - src/components/atomic-crm/root/CRM.tsx
    - src/components/atomic-crm/providers/supabase/authProvider.ts
    - src/components/atomic-crm/providers/fakerest/authProvider.ts
    - src/components/atomic-crm/providers/supabase/dataProvider.ts
    - src/components/atomic-crm/providers/fakerest/dataProvider.ts
    - supabase/functions/billing_evidence/index.ts

key-decisions:
  - "Browser capability summaries control presentation only; every read and mutation is reauthorized by RLS, RPC, or Edge code."
  - "Billing account, access, automation, evidence, audit, and capability query keys never enter the mobile persisted cache and are purged from memory/storage on auth or role transitions."
  - "Evidence bearer capabilities live only in component memory, are never rendered or cached, and clear after use, expiry, close, unmount, logout, or authorization change."

patterns-established:
  - "Security panels consume allowlisted server summaries that omit tenant authority, Auth identities, raw provider references, and credentials."
  - "Evidence presentation metadata is derived at the service boundary while server-generated object identity and Storage paths remain private."

requirements-completed: [WORK-01, SEC-03, SEC-04, SEC-05, SEC-07]

duration: 21min
completed: 2026-09-01
---

# Phase 2 Plan 10: Scoped Access, Evidence, and Cache Safety Summary

**Capability-aware role/automation administration and quarantine-first evidence access with zero persisted billing security queries**

## Performance

- **Duration:** 21 min
- **Started:** 2026-09-01T16:53:14-07:00
- **Completed:** 2026-09-01T17:14:39-07:00
- **Tasks:** 2
- **Files modified:** 22

## Accomplishments

- Added readable human role cards with scope, description, effective interval, active/ended state, reasoned assign/end actions, multi-role visibility, and a protected last-organization-administrator invariant.
- Added automation cards that separate machine principals from human roles, expose only masked/allowlisted grant descriptions, and support reasoned disable while keeping identity/provider provisioning inside the protected server workflow.
- Added normalized live/demo capability summaries for presentation decisions without moving authorization into the browser.
- Added evidence cards for filename, kind, size, uploader label, quarantine/clean/rejected/expired/held state, retention, timestamps, and safe access history.
- Added operator upload and explicit-purpose open actions that use server-mediated capabilities held only in transient component memory and cleared across every lifecycle/auth boundary.
- Added a recursive billing query-key policy, stable desktop/mobile QueryClients, dehydrate exclusion, and auth/role transition purge of memory plus persisted storage.

## Task Commits

1. **Task 1: Scoped human/automation access panels** - `70c8d9b6` (red test), `ba1bb444` (feature)
2. **Task 2: Evidence panel and sensitive-cache exclusion** - `d55aef2b` (red test), `cae61bf2` (feature)

## Decisions Made

- Capability RPCs return exact effective capability unions and readable access summaries only; no organization IDs, sales IDs, Auth IDs, raw provider references, or credentials cross the presentation boundary.
- Automation creation remains a protected provisioning workflow because the browser may not accept or invent machine identity/provider authority; the UI explains that boundary while supporting safe inspection and disable.
- The account evidence view appends kind, safe original filename, and server-derived uploader label, while raw bucket, object path, hash, token, and provider payload remain unavailable.
- Clearing the entire persisted mobile client on auth/role transition is intentionally stricter than selectively rewriting a stored cache and prevents stale inaccessible data from surviving identity changes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added safe evidence presentation metadata at the service boundary**

- **Found during:** Task 2 evidence card implementation
- **Issue:** The approved UI contract requires filename, kind, and uploader label, but the safe evidence view contained none of them and the Edge upload parser discarded filename/kind after validation.
- **Fix:** Added constrained columns, an allowlisted security-invoker projection, a metadata-complete service-only upload entry point, and live pgTAP proof; uploader display is derived from the server-bound actor.
- **Verification:** 262 pgTAP assertions and 10 live Edge/provider tests pass.
- **Committed in:** `cae61bf2`

**2. [Rule 2 - Missing Critical] Purged desktop memory as well as mobile persistence**

- **Found during:** Task 2 auth-transition wiring
- **Issue:** The plan explicitly forbids stale billing authorization/evidence data after logout or role change; a mobile-only invalidator would leave the desktop in-memory QueryClient dependent on framework behavior.
- **Fix:** Added a shared stable QueryClient invalidator for both trees and a second mobile persister invalidator.
- **Verification:** Focused cache source contracts, typecheck, and lint pass.
- **Committed in:** `cae61bf2`

---

**Total deviations:** 2 auto-fixed missing critical boundaries. **Impact on plan:** Both changes close privacy requirements without broadening browser authority or external dependencies.

## Issues Encountered

- The first evidence presentation pgTAP run correctly exposed the fixture's full uploader display label; the assertion was corrected to the server-derived fixture value and the complete database lane then passed.

## User Setup Required

None - all database, Auth, Storage, and Edge execution used disposable loopback Supabase; the user's dashboard project was not mutated.

## Next Phase Readiness

- Plan 11 can register the completed resource in desktop/mobile trees and render the deterministic source surface.
- Clean schema receipt: 40 migrations through `20260901000007`, filename hash `dde34caa08f0ef794a7aeff525ab17d60505cf6fa9fece32f1c4ebf782622c92`.

## Self-Check: PASSED

- `npm test -- --run src/components/atomic-crm/billing-accounts/billingAccounts.test.ts -t "panels|access|cache"` (8 focused tests)
- `npm test -- --run src/components/atomic-crm/billing-accounts/billingAccounts.test.ts src/components/atomic-crm/billing-accounts/billingDataProvider.test.ts` (30 tests)
- `make test-financial-database-sql` (262 assertions)
- `make test-financial-functions` (10 live Edge/provider tests)
- `make test-financial-schema-push` (40 migrations)
- `npm run typecheck`
- `npm run lint -- --quiet`

---
*Phase: 02-tenant-role-and-evidence-security*
*Completed: 2026-09-01*
