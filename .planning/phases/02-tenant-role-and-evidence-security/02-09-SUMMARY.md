---
phase: 02-tenant-role-and-evidence-security
plan: "09"
subsystem: billing-account-ui
tags: [react-admin, responsive, supabase, rls, export, accessibility]

requires:
  - phase: 02-tenant-role-and-evidence-security
    plan: "08"
    provides: typed billing records, provider parity, and deterministic demo fixtures
provides:
  - responsive billing-account list, create, edit, and detail components
  - exact seven-field CSV projection with reverse-related owner/contact loading
  - caller-bound atomic account, owner, and contact save command
  - reasoned soft lifecycle validation with email, phone, and text preferences
  - stable detail slots for scoped access and evidence panels
affects: [02-access-evidence-ui, 02-surface-gate, 03-money-contract]

tech-stack:
  added: []
  patterns: [explicit export projection, responsive branch composition, server-derived tenant save, reasoned soft lifecycle]

key-files:
  created:
    - src/components/atomic-crm/billing-accounts/BillingAccountList.tsx
    - src/components/atomic-crm/billing-accounts/BillingAccountInputs.tsx
    - src/components/atomic-crm/billing-accounts/BillingAccountCreate.tsx
    - src/components/atomic-crm/billing-accounts/BillingAccountEdit.tsx
    - src/components/atomic-crm/billing-accounts/BillingAccountShow.tsx
    - src/components/atomic-crm/billing-accounts/billingAccountExport.ts
    - src/components/atomic-crm/billing-accounts/billingAccounts.test.ts
    - supabase/migrations/20260901000005_billing_account_commands.sql
    - supabase/tests/database/45_billing_account_commands.sql
  modified:
    - src/components/atomic-crm/billing-accounts/index.tsx
    - src/components/atomic-crm/providers/types.ts
    - src/components/atomic-crm/providers/supabase/dataProvider.ts
    - src/components/atomic-crm/providers/fakerest/dataProvider.ts
    - src/components/atomic-crm/types.ts
    - src/components/atomic-crm/billing-accounts/billingDataProvider.test.ts

key-decisions:
  - "Account forms call one security-definer command that derives the sole eligible organization from authenticated assignments and commits account, owner, and contacts together."
  - "Exports load only the relations needed for display, then construct exactly seven safe business fields without spreading source records."
  - "Desktop and mobile lists/details are distinct compositions with 44px controls and stable loading, empty, denied, missing, and closed presentation states."

patterns-established:
  - "Compound billing forms submit an allowlisted provider request with no organization scope; PostgreSQL re-resolves capability and organization authority."
  - "Billing detail reserves named account-scoped access/evidence slots so later panels extend the hierarchy without introducing downstream money workflows."

requirements-completed: [WORK-01, SEC-03, SEC-07]

duration: 19min
completed: 2026-09-01
---

# Phase 2 Plan 09: Responsive Billing Account CRUD Summary

**Desktop/mobile billing-account administration with atomic server-derived tenancy, reasoned lifecycle, and a strict safe export**

## Performance

- **Duration:** 19 min
- **Started:** 2026-09-01T16:29:00-07:00
- **Completed:** 2026-09-01T16:48:00-07:00
- **Tasks:** 3
- **Files modified:** 15

## Accomplishments

- Added separate desktop table and mobile card list compositions showing customer, status, responsible owner, active-contact summary, and last update with exact loading, empty, filtered-empty, and error states.
- Added a reverse-relation-aware exporter that emits only customer name, billing status, responsible-owner display name, active-contact names/methods, and safe timestamps; IDs, contact details, scope, roles, providers, evidence, capabilities, and audits cannot enter the projection.
- Added grouped create/edit forms for account identity/status, responsible owner, authorized contacts, and explicit access context with 44px controls, inline validation, no hard-delete affordance, and mandatory reasons for on-hold, closed, and ended-contact states.
- Added one authenticated security-definer command that derives organization scope from the caller's active organization-wide assignment, rejects browser organization authority, validates an in-organization owner and at least one active contact, and atomically saves the full boundary.
- Added a responsive account detail hierarchy with identity/status first, owner/contacts second, stable scoped-access/evidence slots, presentation-only edit visibility, and safe loading/denied/missing/closed states.

## Task Commits

Each task was committed atomically:

1. **Task 1: Responsive list states and allowlisted exporter** - `f66bea64` (red test), `8f3e6a04` (feat)
2. **Task 2: Grouped create/edit workflows and soft lifecycle** - `46530262` (red test), `c44cc764` (feat)
3. **Task 3: Responsive account detail shell** - `51636cf9` (red test), `ba9441b2` (feat)

## Files Created/Modified

- `BillingAccountList.tsx` - Desktop table, mobile cards, owner/contact summaries, search/status filters, and explicit states.
- `billingAccountExport.ts` - Relation loading and exact seven-field CSV projection.
- `BillingAccountInputs.tsx` - Grouped account, owner, contact, validation, and access-context inputs.
- `BillingAccountCreate.tsx` / `BillingAccountEdit.tsx` - Atomic provider submission, sticky toolbar, defaults, relation hydration, and stable save errors.
- `BillingAccountShow.tsx` - Responsive semantic detail hierarchy and Plan 10 extension slots.
- `index.tsx` - Complete list/create/edit/show resource configuration plus mobile list export.
- `billingAccounts.test.ts` - List/export/form/detail contract tests.
- `providers/types.ts`, live/demo providers, and domain types - Shared atomic boundary request plus email/phone/text contact preference parity.
- `20260901000005_billing_account_commands.sql` - Caller-bound atomic boundary save command and text-method constraint.
- `45_billing_account_commands.sql` - ACL/search-path, derived scope, atomic effects, text preference, cross-organization owner, forbidden key, and role denial proof.

## Decisions Made

- Kept organization identity out of form state and provider request types; the database derives exactly one eligible organization and fails closed for zero or ambiguous organizations.
- Required owner and contact management capabilities in addition to account create/update, and required the selected owner to hold an active assignment in the derived organization.
- Used an atomic RPC for the compound boundary instead of a chain of browser CRUD calls that could leave an account without its required owner/contact.
- Followed the plan's stricter export rule and omitted email/phone even though the broader UI design allowlist permits them.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added an atomic server command for compound account forms**

- **Found during:** Task 2 provider wiring
- **Issue:** Standard `billing_accounts` CRUD cannot atomically persist the required owner and repeatable contacts, and a create request would otherwise need browser-supplied organization scope.
- **Fix:** Added an authenticated security-definer RPC plus equivalent FakeRest method; it derives organization scope, validates exact keys/capabilities/owner/contact rules, and commits all rows together.
- **Files modified:** migration 00005, pgTAP command test, provider types, live/demo providers, provider contract test
- **Verification:** 244 pgTAP assertions and clean 38-migration schema replay pass.
- **Committed in:** `c44cc764`

**2. [Rule 1 - Bug] Added the approved Text contact preference end to end**

- **Found during:** Task 2 form implementation
- **Issue:** The approved UI contract includes Email, Phone, and Text, but the earlier database/type contract allowed only email, phone, or none.
- **Fix:** Added `text` to the shared type and database constraint, requiring a phone value, with a live command assertion.
- **Files modified:** domain type, migration 00005, pgTAP command test, form input
- **Verification:** Text preference persists in the live disposable database and all provider/type tests pass.
- **Committed in:** `c44cc764`

**3. [Rule 3 - Blocking] Mapped customer search in both providers**

- **Found during:** Task 1 list wiring
- **Issue:** A raw `q` filter would target no `billing_accounts` column and fail instead of searching customer names.
- **Fix:** Added billing-account search lifecycle callbacks to Supabase and FakeRest.
- **Files modified:** live/demo providers, UI contract test
- **Verification:** focused list tests and both production/demo builds pass.
- **Committed in:** `8f3e6a04`

---

**Total deviations:** 3 auto-fixed (1 missing critical boundary, 1 contract mismatch, 1 runtime integration blocker). **Impact on plan:** The additions make the planned form and search surfaces executable without accepting browser tenant authority or broadening financial workflows.

## Issues Encountered

- Production and demo builds retain pre-existing CSS import-order, bundle-size, Browserslist-age, and Node deprecation warnings; both builds exit 0 and Plan 09 introduced no warning-specific configuration changes.

## User Setup Required

None - database proof used disposable loopback Supabase only; the protected dashboard project was not touched.

## Next Phase Readiness

- Plan 10 can replace the stable access/evidence detail slots with capability-aware role, automation, and evidence panels.
- Mobile cache policy can identify all `billing_*` query keys now used by list, detail, owner, contact, access, and evidence surfaces.
- Clean schema receipt: 38 migrations through `20260901000005`, filename hash `e7e86eabce4daeada527fb40bbf416124de4117a36f97ae5d89b8e53618d75bd`.

## Self-Check: PASSED

- `npm test -- --run src/components/atomic-crm/billing-accounts/billingAccounts.test.ts` (13 tests)
- `npm test -- --run src/components/atomic-crm/billing-accounts/billingDataProvider.test.ts` (10 tests)
- `make test-financial-database-sql` (244 assertions)
- `make test-financial-schema-push` (38 migrations)
- `npm run typecheck`
- `npm run lint -- --quiet`
- `npm run build`
- `npm run build:demo`

---
*Phase: 02-tenant-role-and-evidence-security*
*Completed: 2026-09-01*
