---
phase: 04-agreements-revenue-evidence-and-calculation-close
plan: "06"
subsystem: agreement-ui
tags: [react, typescript, supabase, agreements, exact-money, responsive-ui]
requires:
  - phase: 04-05
    provides: strict agreement provider commands, safe reads, capabilities, and deterministic FakeRest parity
provides:
  - Responsive billing-account agreement drafting and lifecycle controls
  - Exact fixed, percentage, minimum-support, and hybrid agreement form requests
  - Immutable lifecycle history with actor, role, reason, time, and self-approval context
  - String-safe caller-scoped agreement history support read
  - Offline-safe and capability-gated agreement presentation
affects: [monthly-close-ui, calculation-ui, release-verification]
tech-stack:
  added: []
  patterns:
    - Active agreement authority is read-only in the browser; amendments create new drafts
    - Section-local queries stop offline and refresh after server denial or lifecycle mutation
    - Agreement history crosses the browser boundary through an exact support-safe codec
key-files:
  created:
    - src/components/atomic-crm/billing-accounts/BillingAgreementPanel.tsx
    - src/components/atomic-crm/billing-accounts/BillingAgreementForm.tsx
    - supabase/migrations/20260904000006_billing_agreement_history_read.sql
    - supabase/tests/database/92_billing_agreement_history_read.sql
  modified:
    - src/components/atomic-crm/billing-accounts/BillingAccountShow.tsx
    - src/components/atomic-crm/billing-accounts/BillingAgreementPanel.test.tsx
    - src/components/atomic-crm/billing-accounts/billingAccounts.test.ts
    - src/components/atomic-crm/types.ts
    - src/components/atomic-crm/providers/supabase/billingCloseProvider.ts
    - src/components/atomic-crm/providers/fakerest/billingCloseProvider.ts
    - src/components/atomic-crm/financial/billingCloseProviderContract.test.ts
key-decisions:
  - "Agreement lifecycle history uses a forward-only caller-scoped support read that exposes actor, role, reason, timestamp, and string event IDs while excluding evidence storage details and raw contract content."
  - "Draft and amendment forms accept display strings only and produce closed exact provider requests; active versions remain immutable and amendments always create a new draft."
  - "Agreement data is section-local, excluded from offline presentation, and capability-gated only for presentation while every explicit provider command remains server-authorized."
requirements-completed: [AGR-01, AGR-02, AGR-03, AGR-04, AGR-05]
duration: 22 min
completed: 2026-09-04
---

# Phase 4 Plan 6: Responsive Agreement Workflow Summary

**Billing-account detail now supports exact agreement drafting, review, activation, amendment, pause, termination, and immutable lifecycle inspection across desktop and mobile without exposing contract storage authority.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-09-04T23:05:00Z
- **Completed:** 2026-09-04T23:27:00Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments

- Added a structured agreement form for all four closed formula kinds with exact USD and ordinary-percentage parsing, effective-period and timezone rules, commissionable-revenue definitions, evidence priority, and signed-source evidence.
- Added reasoned lifecycle confirmations for submit, activate, pause, and terminate, including effective terms, evidence hash context, self-approval visibility, pending states, and safe errors.
- Added a responsive agreement summary with current terms, status text, policy details, safe evidence context, immutable versions, and complete event causation in stacked mobile-safe cards.
- Integrated the agreement section into billing-account detail after scoped access and before generic evidence while preserving the existing desktop grid, mobile shell, one-page-heading contract, and no-new-route boundary.
- Added a forward-only authenticated agreement-history read and strict Supabase/FakeRest codecs so event IDs remain strings and actor, role, reason, and timestamp cross only the safe allowlisted boundary.

## Task Commits

Each task was committed atomically:

1. **Task 1: Build structured exact agreement form and lifecycle confirmations** - `3a6937bb` (feat)
2. **Task 2: Build responsive agreement summary, evidence, and immutable history** - `72bbfae9` (feat)
3. **Task 3: Integrate the agreement section into billing-account detail** - `91896487` (feat)

## Files Created/Modified

- `BillingAgreementForm.tsx` - Exact, grouped draft/amend fields and reasoned lifecycle confirmations.
- `BillingAgreementPanel.tsx` - Responsive current agreement, rules, evidence, actions, and immutable event history.
- `BillingAccountShow.tsx` - Account-scoped agreement placement between access and evidence.
- `billingCloseProvider.ts` adapters and `types.ts` - Strict lifecycle event types, live decoding, and deterministic demo parity.
- `20260904000006_billing_agreement_history_read.sql` - Caller-scoped support-safe lifecycle history projection.
- Agreement/provider/SQL tests - Exact form, status, responsive, capability, safe-field, string-ID, and pgTAP security proof.

## Decisions Made

- The browser never edits an active agreement. Amend copies display-safe terms into a fresh draft request and preserves the active version unchanged.
- Agreement queries stop when offline and render only the reconnect state; lifecycle actions refetch after success and after stale, conflict, or authorization failures.
- Lifecycle history required one additional support-safe read projection because the earlier agreement list exposed only the latest event and self-approval flag, not the approved actor/reason/timestamp history contract.
- Billing cutoff day is restricted to 1 through 28 in the form so client validation matches the database invariant for every month.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Added complete safe lifecycle history projection**

- **Found during:** Task 2 history implementation
- **Issue:** The completed provider read exposed only the latest lifecycle event, while the approved UI contract requires every event's actor, role, reason, and timestamp.
- **Fix:** Added a forward-only caller-scoped SQL projection, strict event codec, shared domain type, FakeRest parity, and dedicated pgTAP assertions.
- **Files modified:** `supabase/migrations/20260904000006_billing_agreement_history_read.sql`, `supabase/tests/database/92_billing_agreement_history_read.sql`, provider adapters, types, and tests.
- **Verification:** Clean migration replay succeeded; agreement pgTAP passed 45/45, provider-read pgTAP 10/10, and history-read pgTAP 6/6.
- **Committed in:** `72bbfae9`

**2. [Rule 1 - Bug] Matched the client cutoff rule to the database invariant**

- **Found during:** Task 2 boundary review
- **Issue:** The form accepted days 29 through 31 although the agreement rules table permits only 1 through 28.
- **Fix:** Narrowed validation and added a regression case for day 29.
- **Files modified:** `BillingAgreementForm.tsx`, `BillingAgreementPanel.test.tsx`
- **Verification:** Focused agreement/provider suite passed 37/37.
- **Committed in:** `72bbfae9`

**3. [Rule 1 - Bug] Enforced string-only lifecycle event identifiers**

- **Found during:** Task 2 malformed-response testing
- **Issue:** The legacy positive-ID helper normalized safe JSON numbers, weakening the new string-only lifecycle wire contract.
- **Fix:** Applied a strict string check only to lifecycle event IDs while preserving older endpoint compatibility.
- **Files modified:** Supabase provider adapter and provider contract tests.
- **Verification:** The failing malformed-response test turned green and the full test suite passed.
- **Committed in:** `72bbfae9`

## Verification

- Full Vitest suite: **532 passed, 26 skipped** across 49 files.
- Production build: passed; existing CSS import-order, bundle-size, and stale Browserslist advisories remain non-blocking.
- TypeScript and touched-file ESLint: passed.
- Local pgTAP: **45/45 agreement**, **10/10 provider read**, and **6/6 history read** assertions passed.
- Shared Claude skill-suite smoke: **10/10** passed.
- The integrated source-rendered surface receipt remains intentionally scheduled for Plan 08 after both Phase 4 UI panels are present.

## Issues Encountered

No unresolved implementation issue remains. Existing Vitest unawaited-assertion warnings in the legacy FakeRest adapter suite and existing build advisories are unchanged and non-blocking.

## Next Phase Readiness

Ready for Plan 04-07 monthly revenue close and calculation UI. No hosted schema, deployment, or external mutation was performed.
