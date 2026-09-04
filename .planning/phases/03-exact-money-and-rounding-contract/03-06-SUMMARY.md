---
phase: 03-exact-money-and-rounding-contract
plan: "06"
subsystem: exact-provider-parity-and-preview
tags: [fakerest, supabase, bigint, invoices, rounding, parity]
requires:
  - phase: 03-exact-money-and-rounding-contract
    plan: "05"
    provides: Validated live exact invoice provider boundary
provides:
  - Deterministic exact FakeRest invoice fixtures and isolated provider factory
  - Live Supabase/FakeRest save/get/list/error parity matrix
  - Exact-only invoice preview over the central named rounding module
  - Protected database HTTP and fast-test memberships for parity and preview
affects: [03-07, financial-release-gate]
tech-stack:
  added: []
  patterns: [fresh in-memory contract fixture, cross-provider observation matrix, exact preview adapter]
key-files:
  created:
    - src/components/atomic-crm/financial/exactProviderContract.test.ts
  modified:
    - src/components/atomic-crm/providers/fakerest/dataProvider.ts
    - src/components/atomic-crm/providers/fakerest/dataGenerator/billingAccounts.ts
    - src/components/atomic-crm/invoices/invoiceCalculations.ts
    - src/components/atomic-crm/invoices/invoiceCalculations.test.ts
    - tests/release/exact-money-release-static.test.ts
    - makefile
    - .github/release/financial-paths.json
key-decisions:
  - "FakeRest exact invoice state is owned by an isolated factory so every parity case can start from deterministic canonical records."
  - "Invoice preview delegates all parsing, ratio multiplication, rounding, and range enforcement to the central exact-money module."
  - "Human preview descriptions remain terminal display strings and are never accepted as financial input."
patterns-established:
  - "Cross-provider parity: execute the same typed request against a real JWT-bound Supabase provider and a fresh FakeRest provider, then compare canonical financial projections"
  - "Exact preview: validate canonical line items, round tax once at the named policy boundary, and add minor-unit integers under the central range codec"
requirements-completed: [CALC-01, CALC-03]
duration: 14 min
completed: 2026-09-04
---

# Phase 3 Plan 06: Exact Provider Parity and Preview Summary

**FakeRest and live Supabase now expose one closed exact invoice contract, and invoice preview uses the same BigInt rational and named half-away-from-zero authority.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-09-04T05:44:30Z
- **Completed:** 2026-09-04T05:58:00Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments

- Added four deterministic FakeRest invoice fixtures covering both signed-bigint endpoints, canonical `8.875% -> 71/800`, preserved `12.500% -> 1/8` evidence, and an exact rational line item.
- Added a fresh `createExactFakeInvoiceProvider` factory with closed list/get/save validation, bounded pagination, allowlisted filters/sorts, caller-context account narrowing, canonical arithmetic, stable error codes, and no legacy numeric aliases.
- Routed FakeRest React Admin invoice list/get/create/update operations through the exact in-memory contract rather than generic table behavior.
- Added a live provider matrix that signs in a real synthetic Supabase operator, provisions an isolated tenant, then observes the same canonical saves, gets, pagination, signed endpoints, malformed inputs, cross-scope behavior, and unchanged effects against Supabase and FakeRest.
- Tightened the live provider's compound list/get methods so unknown top-level keys are rejected rather than discarded during translation.
- Replaced the numeric invoice helper with a narrow adapter over `exactMoney.ts`; exact line items are validated, tax rounds once under `half-away-from-zero-v1`, totals remain minor-unit strings, and display descriptions have no parse-back path.
- Added golden `8.875%`, rational quantity, signed half-tie, canonical-zero, line mismatch, policy mismatch, zero-denominator, and overflow tests.
- Protected provider parity in the database HTTP lane, preview in the fast lane, and all invoice source/test paths in the financial classifier and rolling static contract.

## Task Commits

Each task was committed with RED and GREEN evidence:

1. **Task 1: Match FakeRest to the proven exact Supabase contract** - `11a0ff35`, `875146b2`
2. **Task 2: Replace floating invoice preview with named exact arithmetic** - `ecb29ddf`, `87b45af5`
3. **Task 3: Protect provider parity and preview before final audit** - `b9546258`, `1b95796f`

## Files Created/Modified

- `src/components/atomic-crm/financial/exactProviderContract.test.ts` - Shared real-Supabase/FakeRest behavior matrix.
- `src/components/atomic-crm/providers/fakerest/dataProvider.ts` - Closed exact in-memory provider and React Admin routing.
- `src/components/atomic-crm/providers/fakerest/dataGenerator/billingAccounts.ts` - Canonical exact invoice and line-item fixtures.
- `src/components/atomic-crm/providers/fakerest/dataGenerator/types.ts` - Exact invoices added to the deterministic FakeRest database contract.
- `src/components/atomic-crm/providers/supabase/dataProvider.ts` - Strict compound list/get request-key validation.
- `src/components/atomic-crm/invoices/invoiceCalculations.ts` - Exact-only preview adapter and display descriptions.
- `src/components/atomic-crm/invoices/invoiceCalculations.test.ts` - Golden, signed, policy, mismatch, and overflow proof.
- `tests/release/exact-money-release-static.test.ts` - Wave 6 path, membership, numeric-fixture, and float-regression checks.
- `makefile` - Provider parity and preview added to their permanent targets.
- `.github/release/financial-paths.json` - Invoice implementation/tests classified as financial.

## Decisions Made

- FakeRest uses its established demo account context as authority; a request account can only narrow results and cannot create scope.
- Provider parity compares canonical financial projections while allowing provider-owned IDs and timestamps to differ.
- Empty line-item arrays remain valid for migrated/general invoices; when line items exist, their exact extended sum must equal the invoice amount.
- Submitted percentage text is preserved only in the canonical rate object and a terminal human description; financial equality uses the reduced ratio and named policies.

## Deviations from Plan

### Auto-fixed Shared Contract Completeness

**1. Added exact invoices to the FakeRest database type registry**

- **Found during:** Task 1 deterministic fixture implementation
- **Issue:** The generator's `Db` contract did not include the newly registered `invoices` resource.
- **Fix:** Added `ExactBillingInvoice[]` to `dataGenerator/types.ts` so the generated database and billing resource registry remain statically aligned.
- **Files modified:** `src/components/atomic-crm/providers/fakerest/dataGenerator/types.ts`
- **Verification:** Typecheck passes and the inherited billing provider registry test includes invoices.

**2. Closed unknown-key handling in live compound provider methods**

- **Found during:** Task 1 cross-provider invalid-request matrix
- **Issue:** React Admin translation was closed, but direct calls to the live compound list/get methods selected known fields and silently discarded unknown top-level keys.
- **Fix:** Added exact key/mode validation before live list/get translation, matching FakeRest and the database contract.
- **Files modified:** `src/components/atomic-crm/providers/supabase/dataProvider.ts`
- **Verification:** Both providers return `INVOICE_READ_INVALID_REQUEST` for browser tenant identity or unknown operation keys.

---

**Total deviations:** 2 auto-fixed contract completeness issues
**Impact on plan:** Both fixes were required for the stated shared interface and closed-key parity; neither expanded financial behavior or authority.

## Verification

- Live provider parity focused lane: 3/3 tests passed.
- Permanent database HTTP target: 4 files, 12 tests passed.
- Exact preview and rolling static contract: 2 files, 15 tests passed.
- Permanent fast target: 7 files, 91 tests passed.
- `npm run typecheck` passes.
- Canonical Supabase configuration is restored and `git diff --check` passes.

## User Setup Required

None - the parity suite uses an isolated local Supabase tenant and synthetic `release.example` identity.

## Next Phase Readiness

- Plan 03-07 can audit the complete Phase 3 source, migration, provider, preview, and protected-lane chain at the integrated exact head.
- No floating invoice preview or looser FakeRest invoice path remains.

## Self-Check: PASSED

- The parity artifact and all modified implementation/test artifacts exist.
- All six implementation/test commits resolve as commits.
- Both permanent target runs passed with one assertion attempt and canonical local configuration restored.

---
*Phase: 03-exact-money-and-rounding-contract*
*Completed: 2026-09-04*
