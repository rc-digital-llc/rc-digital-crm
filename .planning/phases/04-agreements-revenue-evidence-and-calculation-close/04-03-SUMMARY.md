---
phase: 04-agreements-revenue-evidence-and-calculation-close
plan: "03"
subsystem: database
tags: [postgresql, supabase, exact-arithmetic, rls, pgtap, calculations, concurrency]
requires:
  - phase: 04-01
    provides: immutable active agreement versions and exact structured formula terms
  - phase: 04-02
    provides: frozen accepted-evidence and minimum-only revenue close inputs
  - phase: 03-exact-financial-primitives
    provides: canonical USD/rate parsing and named half-away-from-zero rounding
provides:
  - Independent TypeScript and PostgreSQL exact formula kernels with shared golden vectors
  - Immutable typed calculation, snapshot, explanation, event, and close-policy authority
  - Caller-bound preview, idempotent creation, and manual or narrowly granted approval commands
affects: [adjustment-calculations, agreement-ui, monthly-close-ui, invoice-eligibility]
tech-stack:
  added: []
  patterns:
    - Server-built canonical snapshot and explanation hashes over mandatory typed authority
    - Advisory-lock create replay and calculation-row approval serialization
    - Exact automation effect discrimination bound to calculation, preview, policy, and reason
key-files:
  created:
    - src/components/atomic-crm/financial/billingCalculationFixtures.ts
    - src/components/atomic-crm/financial/billingCalculation.test.ts
    - supabase/migrations/20260904000003_billing_calculations.sql
    - supabase/tests/database/80_billing_calculations.sql
    - tests/release/billing-calculation-contract.test.ts
  modified: []
key-decisions:
  - "Calculation authority consumes only an active agreement version and one immutable revenue close snapshot; browser-supplied amounts, branches, and explanations are not accepted."
  - "Approval is an immutable event over a frozen calculation rather than a mutable calculation status; one partial unique index defines the sole approved reference."
  - "Missing previous-period authority is stored as not_available with null deltas, while a zero prior result has its own zero_baseline state."
  - "Automation approval extends the existing exact effect discriminator so the grant is bound to the calculation ID, preview fingerprint, policy, and reason fingerprint in the same transaction."
requirements-completed: [CALC-02, CALC-04, CALC-05, CALC-06, CALC-07]
duration: 34 min
completed: 2026-09-04
---

# Phase 4 Plan 3: Exact Calculation and Approval Authority Summary

**Activated agreement terms and frozen revenue inputs now produce exact, immutable, byte-replayable calculations with safe previews, prior-period comparisons, and one policy-gated approval effect.**

## Performance

- **Duration:** 34 min
- **Started:** 2026-09-04T21:10:00Z
- **Completed:** 2026-09-04T21:44:00Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Added independent BigInt and PostgreSQL exact kernels for fixed, percentage, minimum-support, and hybrid formulas, including deterministic hybrid equality and stable invalid/policy/division/overflow errors.
- Added immutable calculation identities, typed exact snapshots, server-built canonical JSON/hashes, versioned explanations, explicit prior-period comparison states, append-only approval events, and finite manual/auto policy bounds under forced RLS.
- Added caller-bound preview, advisory-lock idempotent create, and serialized approval RPCs that recompute current agreement, evidence, anomaly, comparison, and policy facts before any authority is recorded.
- Proved 12-way simultaneous creation and approval convergence, changed replay conflicts, stale evidence rejection, policy-change conflict, tenant/role denial, manual-default behavior, and exact automation grant consumption against live PostgreSQL.

## Task Commits

Each task was committed atomically:

1. **Task 1: Build independent shared golden vectors and closed exact formula kernel** - `483713c1` (feat)
2. **Task 2: Freeze immutable calculation, policy, and explanation facts** - `4960fea2` (feat)
3. **Task 3: Add preview, idempotent create, and policy-gated approval commands** - `d168393f` (feat)

## Files Created/Modified

- `src/components/atomic-crm/financial/billingCalculationFixtures.ts` - JSON-safe exact formula contract and BigInt verification kernel.
- `src/components/atomic-crm/financial/billingCalculation.test.ts` - Cross-boundary success/error golden vectors and signed rounding checks.
- `supabase/migrations/20260904000003_billing_calculations.sql` - Exact formula, immutable facts, policies, hashes, preview/create/approve commands, and authorization.
- `supabase/tests/database/80_billing_calculations.sql` - Thirty-nine live pgTAP arithmetic, schema, RLS, immutability, privilege, and function-lock assertions.
- `tests/release/billing-calculation-contract.test.ts` - Live authenticated replay, concurrency, comparison, stale-input, tenant, role, and automation contract.

## Decisions Made

- Calculation requests contain only close identity, policy identity, preview fingerprint, and command metadata; exact amount, provenance, branch, candidate, and explanation authority is regenerated server-side.
- The calculation row and its snapshot are coupled by a deferred constraint trigger, while the insert-time snapshot trigger reconciles every tenant/agreement/period/close lineage field and regenerates canonical JSON and hashes.
- Previous-period percentage change remains an exact signed numerator over the absolute prior result; a missing prior result is never substituted with zero, and an actual zero baseline never produces a synthetic percentage.
- Manual approval requires a current human capability and a manual policy. Auto approval additionally requires an active account-scoped finite policy and an exact automation grant consumed transactionally with the approval event.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected calculation role assignment validity fields**

- **Found during:** Task 3 live caller-bound create verification
- **Issue:** The new role lookup initially referenced generic effective-date names instead of the established `valid_from`, `valid_until`, and `disabled_at` assignment fields.
- **Fix:** Matched the Phase 2 assignment schema and retained the active organization/account and disabled-sales checks.
- **Files modified:** `supabase/migrations/20260904000003_billing_calculations.sql`
- **Verification:** Operator create and reviewer approval succeed; wrong-tenant, reviewer preview, customer, and auditor preview calls fail without disclosure.
- **Committed in:** `d168393f`

**2. [Rule 2 - Missing Critical] Bound automation replay to the calculation effect**

- **Found during:** Task 3 live auto-approval verification
- **Issue:** The inherited automation discriminator allowed only general commands and evidence inspection, so a calculation-specific grant could not bind its effect to the exact calculation and preview.
- **Fix:** Added a closed `calculation-approval` discriminator containing only validated calculation ID, preview fingerprint, and reason fingerprint; the existing grant helper now consumes it transactionally.
- **Files modified:** `supabase/migrations/20260904000003_billing_calculations.sql`
- **Verification:** One active scoped grant produces one approval event/execution/action; identical replay returns the same event without another grant effect.
- **Committed in:** `d168393f`

---

**Total deviations:** 2 auto-fixed issues. **Impact on plan:** Both changes enforce the intended caller and exact-effect bindings without expanding the public command surface.

## Issues Encountered

- The full local Supabase stack intermittently failed during ancillary-container prune/start. A clean debug retry applied all migrations through `20260904000003`; database-only and live authenticated receipts then passed. No product code workaround was introduced.

## User Setup Required

None - no hosted schema, credentials, external grants, or deployment state changed.

## Next Phase Readiness

- Approved calculation references and exact comparison snapshots are ready for late-evidence adjustment/credit causation in Plan 04-04.
- The calculation contract is independent of invoice issuance; Phase 5 can consume only the immutable approved reference after the remaining Phase 4 gates complete.

## Self-Check: PASSED

- All five key files exist and all three `04-03` task commits are present.
- `billingCalculation.test.ts`: 18/18 tests pass.
- `80_billing_calculations.sql`: 39/39 live pgTAP assertions pass.
- `billing-calculation-contract.test.ts`: 3/3 tests pass with live PostgreSQL, including 12 concurrent create and 12 concurrent approval calls.
- Clean migration apply reaches `20260904000003`; ESLint, Prettier, TypeScript typecheck, and `git diff --check` pass.

---

_Phase: 04-agreements-revenue-evidence-and-calculation-close_
_Completed: 2026-09-04_
