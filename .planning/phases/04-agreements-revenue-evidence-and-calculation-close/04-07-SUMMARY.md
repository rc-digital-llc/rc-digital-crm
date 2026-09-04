---
phase: 04-agreements-revenue-evidence-and-calculation-close
plan: "07"
subsystem: monthly-close-ui
tags: [react, typescript, supabase, revenue-review, calculation-close, exact-money]
requires:
  - phase: 04-06
    provides: account-scoped agreement presentation and lifecycle controls
provides:
  - Responsive evidence-to-exception-to-calculation-to-approval workflow
  - Exact revenue revision validation and immutable review history
  - Exact current/prior calculation comparison with approval and stale guards
  - Durable late-adjustment presentation and caller-scoped support reads
  - Account-detail integration without invoice, payment, or global-workspace scope
affects: [phase-04-release-verification, invoicing, collections]
tech-stack:
  added: []
  patterns:
    - Display strings are parsed to exact values before closed provider commands
    - Calculation output is formatted from server-decoded authority without browser recomputation
    - Account-scoped queries stop offline and capability summaries remain presentation-only
key-files:
  created:
    - src/components/atomic-crm/billing-accounts/BillingMonthlyClosePanel.tsx
    - src/components/atomic-crm/billing-accounts/BillingRevenueRevisionForm.tsx
    - src/components/atomic-crm/billing-accounts/BillingCalculationPreview.tsx
    - src/components/atomic-crm/billing-accounts/BillingMonthlyClosePanel.test.tsx
    - supabase/migrations/20260904000007_billing_adjustment_support_read.sql
    - supabase/tests/database/94_billing_adjustment_support_read.sql
  modified:
    - src/components/atomic-crm/billing-accounts/BillingAccountShow.tsx
    - src/components/atomic-crm/types.ts
    - src/components/atomic-crm/providers/types.ts
    - src/components/atomic-crm/providers/supabase/billingCloseProvider.ts
    - src/components/atomic-crm/providers/fakerest/billingCloseProvider.ts
    - src/components/atomic-crm/financial/billingCloseProviderContract.test.ts
    - src/components/atomic-crm/billing-accounts/billingAccounts.test.ts
key-decisions:
  - "Revenue forms accept exact display strings only, derive commissionable revenue deterministically, and never treat browser numbers or explanation text as authority."
  - "Calculation presentation formats only strictly decoded server results and requires a current immutable fingerprint for approval."
  - "Late adjustments use a forward-only caller-scoped support projection so durable lineage survives refresh without exposing evidence content or storage details."
requirements-completed: [REV-01, REV-02, REV-04, REV-05, REV-06, REV-07, REV-08, REV-09, CALC-02, CALC-04, CALC-05, CALC-06, CALC-07]
duration: 20 min
completed: 2026-09-04
---

# Phase 4 Plan 7: Monthly Revenue and Calculation Close Summary

**Billing-account detail now carries operators through exact revenue evidence review, owned exceptions, explainable calculation comparison, approval, and immutable adjustment lineage on desktop and mobile.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-09-04T23:33:00Z
- **Completed:** 2026-09-04T23:53:00Z
- **Tasks:** 3
- **Files modified:** 13

## Accomplishments

- Added exact gross and excluded revenue input with deterministic commissionable derivation, provenance, attestation, clean-evidence selection, immutable revisions, and complete reviewer causation.
- Added explicit accept, correction, reject, hold, minimum-only, period-close, preview, approve, and late-adjustment commands with pending, stale, offline, capability, and safe-error guards.
- Added exact fixed/minimum and percentage candidates, winning-branch explanation, prior comparison, signed amount and percentage deltas, policy and anomaly context, approval eligibility, and immutable fingerprints.
- Added durable true-up, credit-candidate, and held-adjustment lineage without implying that an invoice, payment, or credit has issued.
- Integrated Monthly close after Agreement and before generic evidence while preserving the account route, one-page-heading hierarchy, stacked mobile sequence, 44px controls, and dialog/sheet accessibility contracts.

## Task Commits

Each task was committed atomically:

1. **Task 1: Build revenue revision, evidence review, and exception workflow** - `136ebe02` (feat)
2. **Task 2: Build exact preview, prior comparison, approval, and adjustment presentation** - `87839178` (feat)
3. **Task 3: Integrate monthly close into account detail and preserve accessibility** - `0c0ce9cd` (feat), `fedb2a57` (fix)

## Files Created/Modified

- `BillingMonthlyClosePanel.tsx` - Period, evidence, exception, close, calculation, approval, and adjustment orchestration.
- `BillingRevenueRevisionForm.tsx` - Exact structured revenue input and provenance/evidence validation.
- `BillingCalculationPreview.tsx` - Exact candidate, winning branch, prior delta, policy, anomaly, and fingerprint presentation.
- `BillingAccountShow.tsx` - Account-scoped placement between Agreement and evidence history.
- Phase 4 provider adapters and types - Strict calculation and adjustment decoding with deterministic FakeRest parity.
- `20260904000007_billing_adjustment_support_read.sql` - Bounded caller-scoped durable adjustment projection.
- UI, provider, and pgTAP tests - State, capability, exactness, malformed-response, responsive, accessibility, and authorization proof.

## Decisions Made

- Gross and excluded values remain display strings until the exact-money parser validates them; excluded revenue cannot exceed gross revenue, and the browser submits no estimated authority.
- Missing prior revenue is explicitly unavailable rather than `$0.00`; a zero baseline remains a separate comparison state.
- Approval is possible only from the current decoded fingerprint and preserves distinct stale and generic recovery messages.
- Late-adjustment reads return only stable IDs, exact string money, reasons, treatment, and hash prefixes available to the caller; evidence content and storage identifiers remain excluded.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Added durable adjustment support reads**

- **Found during:** Task 2 adjustment presentation
- **Issue:** Adjustment creation was supported, but refreshed account state could not list the immutable adjustment lineage required by the UI contract.
- **Fix:** Added a forward-only caller-scoped read projection, strict live decoder, shared domain fields, deterministic FakeRest parity, and dedicated pgTAP coverage.
- **Files modified:** `20260904000007_billing_adjustment_support_read.sql`, `94_billing_adjustment_support_read.sql`, provider adapters, shared types, and contract tests.
- **Verification:** Clean migration replay succeeded; calculation-close pgTAP passed 19/19, provider-read pgTAP 10/10, and adjustment-read pgTAP 7/7.
- **Committed in:** `87839178`

**2. [Rule 1 - Bug] Preserved stale versus generic approval failure categories**

- **Found during:** Plan-level verification
- **Issue:** The approval dialog presented stale-preview copy for every rejected command, obscuring unrelated safe-retry failures.
- **Fix:** Restricted the stale warning to stale server responses and retained the generic support-safe retry message for other failures.
- **Files modified:** `BillingMonthlyClosePanel.tsx`
- **Verification:** Focused monthly-close tests passed 18/18; TypeScript and touched-file ESLint passed.
- **Committed in:** `fedb2a57`

## Verification

- Full Vitest suite: **551 passed, 26 skipped** across 50 files.
- Production build: passed; existing CSS import-order, bundle-size, and stale Browserslist advisories remain non-blocking.
- TypeScript and touched-file ESLint: passed.
- Local pgTAP: **19/19 calculation close**, **10/10 provider read**, and **7/7 adjustment support read** assertions passed.
- Shared Claude skill-suite smoke: **10/10** passed.
- Source contains no new invoice issuance, payment workflow, global close workspace, customer portal, or browser-authoritative calculation path.

## Issues Encountered

No unresolved implementation issue remains. Existing build advisories are unchanged and non-blocking.

## Next Phase Readiness

Ready for Plan 04-08 integrated source and release-lane verification. No hosted schema, deployment, push, PR, merge, or external mutation was performed.
