---
phase: 02-tenant-role-and-evidence-security
plan: "08"
subsystem: providers
tags: [typescript, supabase, fakerest, billing, evidence, parity]

requires:
  - phase: 02-tenant-role-and-evidence-security
    plan: "01"
    provides: caller-bound billing account, role, and capability contracts
  - phase: 02-tenant-role-and-evidence-security
    plan: "05"
    provides: safe evidence metadata and decision-before-capability boundary
provides:
  - typed billing resources and explicit evidence command requests without browser tenant authority
  - Supabase billing-evidence Edge adapter with stable command discriminants and errors
  - deterministic FakeRest billing fixtures and equivalent synthetic command behavior
  - provider contract, parity, and sensitive-fixture regression coverage
affects: [05-provider-operations, 08-customer-portal, 10-collections]

tech-stack:
  added: []
  patterns: [explicit compound commands, provider-neutral billing contract, reserved-example fixtures, synthetic short-lived capabilities]

key-files:
  created:
    - src/components/atomic-crm/providers/fakerest/dataGenerator/billingAccounts.ts
    - src/components/atomic-crm/billing-accounts/billingDataProvider.test.ts
  modified:
    - src/components/atomic-crm/types.ts
    - src/components/atomic-crm/providers/types.ts
    - src/components/atomic-crm/providers/supabase/dataProvider.ts
    - src/components/atomic-crm/providers/fakerest/dataProvider.ts
    - src/components/atomic-crm/providers/fakerest/dataGenerator/types.ts
    - src/components/atomic-crm/providers/fakerest/dataGenerator/index.ts
    - supabase/migrations/20260901000004_billing_evidence_security.sql
    - supabase/tests/database/40_billing_evidence.sql

key-decisions:
  - "Browser evidence requests identify only account, evidence, purpose, and allowlisted file facts; organization, path, provider authority, and signed data stay server-owned."
  - "Live and demo providers share explicit resource and method registries so parity is executable rather than inferred from similar TypeScript shapes."
  - "FakeRest capabilities use a non-network demo URI with a deterministic 60-second validity shape and never resemble a production signed URL."

patterns-established:
  - "Compound financial operations are named CrmDataProvider methods backed by discriminated Edge commands, not hidden generic CRUD mutations."
  - "Demo billing fixtures are deterministic reserved-example records with no object paths, provider references, tokens, or realistic customer data."

requirements-completed: [WORK-01, SEC-03, SEC-07]

duration: 17min
completed: 2026-09-01
---

# Phase 2 Plan 08: Billing Provider Parity Summary

**One safe typed billing contract across Supabase and FakeRest, including explicit quarantine, inspection, and short-lived evidence capability commands**

## Performance

- **Duration:** 17 min
- **Started:** 2026-09-01T15:22:00-07:00
- **Completed:** 2026-09-01T15:39:00-07:00
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- Added explicit account, owner, contact, role, assignment, automation, safe evidence, and access-event types without introducing `any`.
- Added live provider methods for upload initialization, inspection finalization, and download capability creation using allowlisted request fields and stable `billing_evidence` command discriminants.
- Added deterministic reserved-example FakeRest resources and equivalent state transitions, including a visibly synthetic capability whose issuance and expiry are exactly 60 seconds apart.
- Proved live/demo resource and method parity, safe request shapes, quarantine-to-clean behavior, lifecycle denials, and the absence of paths, provider secrets, signed tokens, or public URLs in demo fixtures.
- Narrowed authenticated evidence reads to safe column grants after the provider boundary exposed a table-level path-disclosure risk.

## Task Commits

Each task was committed atomically:

1. **Task 1: Define billing records and live provider commands** - `f2d204fd` (red test), `86f4429c` (feat)
2. **Task 2: Implement deterministic FakeRest parity without secrets or cycles** - `d48939cb` (feat)

## Files Created/Modified

- `src/components/atomic-crm/types.ts` - Explicit billing domain records and safe evidence metadata.
- `src/components/atomic-crm/providers/types.ts` - Shared resource/method registries and typed evidence command contracts.
- `src/components/atomic-crm/providers/supabase/dataProvider.ts` - Live Edge-function billing command adapter.
- `src/components/atomic-crm/providers/fakerest/dataProvider.ts` - Deterministic demo implementations of the same commands.
- `src/components/atomic-crm/providers/fakerest/dataGenerator/billingAccounts.ts` - Reserved-example billing fixtures.
- `src/components/atomic-crm/providers/fakerest/dataGenerator/types.ts` - Billing fixture resource typing.
- `src/components/atomic-crm/providers/fakerest/dataGenerator/index.ts` - Billing fixture registration.
- `src/components/atomic-crm/billing-accounts/billingDataProvider.test.ts` - Contract, parity, lifecycle, and sensitive-data tests.
- `supabase/migrations/20260901000004_billing_evidence_security.sql` - Safe authenticated column grants for evidence metadata.
- `supabase/tests/database/40_billing_evidence.sql` - Regression assertions for safe-view access and protected path/hash columns.

## Decisions Made

- Kept organization derivation, object paths, provider references, and capability material out of all browser request types.
- Used shared runtime key registries in addition to TypeScript interfaces so live/demo drift fails an executable test.
- Modeled demo capabilities as `demo://` values with deterministic timestamps, making them useful for UI behavior without resembling deployable credentials.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Removed table-wide authenticated evidence reads**

- **Found during:** Task 1 (live provider contract review)
- **Issue:** The evidence table grant allowed authenticated callers to select server-owned object paths and byte hashes even though the safe view intentionally omitted them.
- **Fix:** Replaced table-wide authenticated `SELECT` with explicit safe-column grants while retaining the security-invoker support view.
- **Files modified:** `supabase/migrations/20260901000004_billing_evidence_security.sql`, `supabase/tests/database/40_billing_evidence.sql`
- **Verification:** All 230 database assertions and the clean 37-migration schema push pass.
- **Committed in:** `86f4429c`

---

**Total deviations:** 1 auto-fixed missing security control. **Impact on plan:** The fix closes a direct metadata-disclosure path without changing product scope.

## Issues Encountered

- Plan 07 had not yet executed, so its approved plan contract supplied the future Edge command names and discriminants in place of a missing summary.
- The repository's normal incremental typecheck passes; a forced non-incremental TypeScript run still reports unrelated pre-existing baseline errors, including the existing `_is_initialized_cache` provider typing issue. No new Plan 08 file errors were introduced.
- The full unit run retains pre-existing unawaited-expect warnings in `supabaseAdapter.spec.ts`; all tests pass.

## User Setup Required

None - all database execution used disposable loopback Supabase projects and the protected dashboard project was not touched.

## Next Phase Readiness

- Plan 07 can implement the `billing_evidence` Edge commands behind the exact live adapter contract.
- Plan 09 can consume the provider-neutral records and commands without receiving organization, path, or provider authority from browser state.
- Clean schema receipt: 37 migrations through `20260901000004`, hash `ebd15f781a1accbe1de58d6c3cfd2cdfb0c45515d808b2070faed340dbaaacbf`.

## Self-Check: PASSED

- `npm test -- --run src/components/atomic-crm/billing-accounts/billingDataProvider.test.ts`
- `npm run typecheck`
- `npm run lint -- --quiet`
- `npm run build`
- `npm run build:demo`
- `npm test -- --run` (378 passed, 10 skipped)
- `make test-financial-database-sql` (230 assertions)
- `make test-financial-schema-push` (37 migrations)

---
*Phase: 02-tenant-role-and-evidence-security*
*Completed: 2026-09-01*
