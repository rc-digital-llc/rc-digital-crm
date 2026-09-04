---
phase: 04-agreements-revenue-evidence-and-calculation-close
plan: "04"
subsystem: database
tags: [postgresql, supabase, lineage, adjustments, rls, pgtap, concurrency]
requires:
  - phase: 04-01
    provides: immutable activated agreement terms and true-up policy authority
  - phase: 04-02
    provides: accepted-evidence and minimum-only close snapshots with durable exceptions
  - phase: 04-03
    provides: exact calculation snapshots and immutable approval events
provides:
  - Complete agreement-to-approved-calculation lineage validation and support-safe read RPC
  - Append-only late-evidence adjustment calculations, links, and held exceptions
  - Exact true-up, no-adjustment, credit-candidate, and held treatment authority
affects: [provider-contracts, agreement-ui, monthly-close-ui, invoice-eligibility]
tech-stack:
  added: []
  patterns:
    - Shared insert-time and approval-time lineage rechecks across separate public commands
    - Dedicated immutable adjustment facts linked to, but never replacing, the original calculation
    - Exact percentage-candidate reconciliation against a frozen hybrid minimum under the original true-up policy
key-files:
  created:
    - supabase/migrations/20260904000004_billing_calculation_close.sql
    - supabase/tests/database/85_billing_calculation_close.sql
    - tests/release/billing-calculation-close.test.ts
  modified:
    - src/components/atomic-crm/financial/billingCalculationFixtures.ts
    - src/components/atomic-crm/financial/billingCalculation.test.ts
    - supabase/tests/database/75_billing_revenue_periods.sql
    - tests/release/billing-revenue-close-contract.test.ts
    - tests/release/billing-calculation-contract.test.ts
key-decisions:
  - "Close, calculation creation, and approval remain separate commands, while shared validators require their immutable IDs, fingerprints, policies, exact values, and actor/grant causation to form one complete chain."
  - "Support lineage is exposed only through a caller-bound allowlisted RPC containing stable IDs, exact values, policy names, and hash prefixes; raw evidence paths, content, filenames, and customer data are excluded."
  - "Late evidence creates a dedicated immutable adjustment calculation and acyclic link; it never reopens the period or changes the original close, calculation, approval, or missing-evidence exception."
  - "For a hybrid minimum-only close, adjustment delta compares the exact late percentage candidate with the frozen minimum; the original agreement true-up policy alone decides whether a negative delta is a credit candidate or a held contract-review exception."
requirements-completed: [REV-08, REV-09, CALC-02, CALC-04, CALC-05, CALC-06, CALC-07]
duration: 29 min
completed: 2026-09-04
---

# Phase 4 Plan 4: Integrated Close Lineage and Late-Evidence Adjustments Summary

**Approved calculations now carry one replayable agreement-to-evidence lineage, and late evidence produces exactly one linked compensating calculation without rewriting historical financial facts or creating invoice effects.**

## Performance

- **Duration:** 29 min
- **Started:** 2026-09-04T21:49:00Z
- **Completed:** 2026-09-04T22:18:00Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- Added shared revenue-close and calculation validators that recheck tenant/account scope, effective dates and timezone, activation evidence, submission/review causation, exception state, frozen hashes, exact formula candidates/results, policy versions, and human or automation approval causation.
- Added an authenticated support-safe lineage RPC that traces an approved calculation through agreement, period, evidence/review, close, exact formula, policy, and approval facts without exposing raw evidence or unrelated tenant data.
- Added immutable adjustment calculations, acyclic original-to-adjustment links, held contract-review exceptions, forced RLS, RPC-only mutation, exact snapshot/explanation hashes, and advisory-lock replay protection.
- Proved all four formula kinds, manual approval, safe lineage reads, positive true-up, zero adjustment, contract-permitted credit candidate, prohibited-negative hold, cross-tenant denial, changed replay conflict, historical hash stability, and 12-way concurrent convergence against live PostgreSQL.
- Proved the Phase 4 command sources and live scenario create no invoice, payment, or ledger effect.

## Task Commits

Each task was committed atomically; the final corrective commit closes the full adjustment-treatment matrix discovered during integrated verification:

1. **Task 1: Enforce complete calculation-close eligibility and lineage** - `dbf66fcb` (feat)
2. **Task 2: Implement append-only late-evidence adjustment calculations** - `1d06a862` (feat)
3. **Task 3: Prove full close and adjustment behavior through authenticated races** - `6643202e` (test)
4. **Integrated correction: Exercise all adjustment treatments** - `cf77b8b4` (fix)

## Files Created/Modified

- `supabase/migrations/20260904000004_billing_calculation_close.sql` - Complete lineage validators/triggers, safe read RPC, immutable adjustment facts/links/exceptions, and idempotent adjustment command.
- `supabase/tests/database/85_billing_calculation_close.sql` - Nineteen schema, security-definer, forced-RLS, exact-type, immutability, and no-invoice contract assertions.
- `tests/release/billing-calculation-close.test.ts` - Live four-formula lineage, all adjustment outcomes, tenant denial, immutable-history, and concurrency proof.
- `src/components/atomic-crm/financial/billingCalculationFixtures.ts` - Independent BigInt adjustment classification and exact golden vectors.
- `src/components/atomic-crm/financial/billingCalculation.test.ts` - Positive, zero, permitted-negative, and prohibited-negative shared adjustment tests.
- `supabase/tests/database/75_billing_revenue_periods.sql` - Explicit activation-event fixture required by complete close lineage.
- `tests/release/billing-revenue-close-contract.test.ts` - Activation causation added to inherited live close fixtures.
- `tests/release/billing-calculation-contract.test.ts` - Valid signed evidence, activation events, evidence links, and server-equivalent close fingerprints added to inherited calculation fixtures.

## Decisions Made

- Shared validators run from triggers on the close snapshot, calculation snapshot, and approval event, so existing transactional RPCs retain distinct responsibilities while no transition can bypass the integrated chain.
- Historical reads validate frozen evidence hashes and captured links rather than depending on a document remaining perpetually unexpired; each creation command still performs the current evidence-state checks at its own boundary.
- Adjustment authority is a separate typed relation rather than a second base-period close or a mutation of `billing_calculations`, making the original/adjustment direction structurally acyclic.
- A hybrid adjustment preserves the exact original max-formula output in its formula snapshot while reconciling the exact late percentage candidate against the minimum already frozen; `true_up_policy` controls only the treatment of the signed delta.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Upgraded inherited direct fixtures to satisfy complete lineage**

- **Found during:** Task 1 regression verification
- **Issue:** Older database and release fixtures directly inserted active agreement/close facts without activation events, submission-evidence links, or exact server-equivalent close fingerprints, which the new complete validator correctly rejected.
- **Fix:** Added explicit activation causation and reconstructed evidence/close fingerprints from the same typed fields as the production commands.
- **Files modified:** `supabase/tests/database/75_billing_revenue_periods.sql`, `tests/release/billing-revenue-close-contract.test.ts`, `tests/release/billing-calculation-contract.test.ts`
- **Verification:** Existing revenue-close and calculation contract suites pass alongside the new lineage triggers.
- **Committed in:** `dbf66fcb`, `6643202e`

**2. [Rule 1 - Bug] Made the complete negative-adjustment path reachable under hybrid true-up policy**

- **Found during:** Task 3 disconfirmation pass
- **Issue:** Comparing the hybrid max result with a frozen minimum can never produce a negative delta, leaving the required credit/held treatment branches unreachable even though their classifier and constraints existed.
- **Fix:** Preserved the exact max-formula result in the snapshot, but defined late reconciliation against the independently exact percentage candidate that the frozen minimum replaced. The immutable agreement `true_up_policy` now gates negative treatment as required.
- **Files modified:** `supabase/migrations/20260904000004_billing_calculation_close.sql`, `tests/release/billing-calculation-close.test.ts`
- **Verification:** Live authenticated scenarios prove positive, zero, permitted-negative credit, and prohibited-negative held outcomes.
- **Committed in:** `cf77b8b4`

---

**Total deviations:** 2 auto-fixed issues. **Impact on plan:** Both fixes close previously invalid or unreachable lineage paths without adding invoice behavior or widening caller authority.

## Issues Encountered

- The local Supabase bootstrap continued to emit its known deprecated-mail configuration warning. Debug starts and clean lane retries applied the full migration chain successfully; no product workaround was added.

## User Setup Required

None - no hosted schema, credentials, provider state, pull request, merge, or deployment was changed.

## Next Phase Readiness

- Plan 04-05 can expose the agreement, revenue close, calculation, lineage, and adjustment RPCs through strict Supabase/FakeRest provider contracts.
- Approved base and adjustment references remain invoice-free and ready for Phase 5 consumption only after the remaining Phase 4 UI and release gates complete.

## Self-Check: PASSED

- All eight key files exist and all four `04-04` implementation/test commits are present.
- Clean migration apply reaches `20260904000004`.
- `75_billing_revenue_periods.sql`, `80_billing_calculations.sql`, and `85_billing_calculation_close.sql`: 105/105 pgTAP assertions pass.
- Exact and authenticated close suites: 30/30 tests pass, including 12 concurrent adjustment commands and every signed treatment.
- ESLint, Prettier, TypeScript typecheck, and `git diff --check` pass.
- Source and live-state assertions confirm no Phase 4 invoice, payment, or ledger mutation.

---

_Phase: 04-agreements-revenue-evidence-and-calculation-close_
_Completed: 2026-09-04_
