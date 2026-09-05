---
phase: 03-exact-money-and-rounding-contract
plan: "06"
subsystem: api
tags: [fakerest, supabase, exact-money, bigint, react-admin, vitest]

requires:
  - phase: 03-01
    provides: Branded canonical money, ratio, percentage-rate, and named rounding helpers
  - phase: 03-05
    provides: Validated caller-bound Supabase exact invoice provider and live Auth/PostgREST boundary proof
provides:
  - One shared behavioral parity matrix for FakeRest and Supabase exact invoice providers
  - Deterministic full-range FakeRest invoice fixtures and exact invoice CRUD routing
  - BigInt/rational invoice preview with one explicit named minor-unit rounding boundary
  - Permanent Wave 6 HTTP, fast, classifier, and mutation-tested static protection
affects: [03-07, invoice-preview, fakerest-parity, financial-release-gate]

tech-stack:
  added: []
  patterns:
    - Run the same closed request/result/error/effect matrix against fresh provider harnesses
    - Treat line-item extended amounts as exact authority and round tax once through the central named helper
    - Couple each money-bearing path to an explicit protected target in the plan that introduces it

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
  - "FakeRest exact invoice state is created per harness from deterministic fixtures, while the application provider delegates every generic invoice list/get/create/update operation to the same exact methods."
  - "Invoice preview accepts only canonical exact line items plus explicit USD and half-away-from-zero policy identities, sums with BigInt, and calls the shared rounding boundary exactly once."
  - "Provider parity belongs to the isolated database HTTP target and preview arithmetic belongs to the fast target; explicit invoice-calculation classifier entries avoid broadening unrelated invoice UI scope."

patterns-established:
  - "Provider parity: one matrix owns valid, malformed, range, scope, pagination, canonical serialization, and unchanged-effect assertions for both implementations."
  - "Preview adapter: validate exact inputs, sum authoritative extended minor units, round once through exactMoney, and emit display-only text after authoritative objects are complete."

requirements-completed: [CALC-01, CALC-03]

duration: 22 min
completed: 2026-09-04
---

# Phase 3 Plan 06: Provider Parity and Exact Invoice Preview Summary

**FakeRest and Supabase now satisfy one exact invoice contract, while invoice preview uses canonical BigInt/rational values, one named rounding boundary, and permanent HTTP/fast release protection**

## Performance

- **Duration:** 22 min
- **Started:** 2026-09-04T22:58:36Z
- **Completed:** 2026-09-04T23:20:31Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- Added a shared ten-case provider matrix that proves FakeRest and the Supabase provider accept, reject, paginate, serialize, scope, and preserve effects under the same exact invoice behavior.
- Replaced demo invoice fallthrough with fresh exact-provider state, deterministic 8.875% and signed-bigint endpoint fixtures, closed request validation, canonical response construction, and exact generic invoice routing.
- Replaced the old number-based invoice calculator with an exact adapter that validates line items and named policy identities, sums minor units with BigInt, rounds tax exactly once, and keeps description text non-authoritative.
- Protected provider parity in the isolated database HTTP target and preview behavior in the fast target, with narrow classifier entries and mutation tests against omissions, float authority, optional lanes, and replacement workflow identities.

## Task Commits

Each task was committed atomically, with RED observed before its GREEN result:

1. **Task 1: Make FakeRest obey the exact provider contract** - `2acaa294` (RED test), `d6cf7191` (GREEN feat)
2. **Task 2: Replace invoice preview with exact BigInt/rational delegation** - `48118860` (RED test), `ea77f9e8` (GREEN feat)
3. **Task 3: Protect provider parity and preview before final audit** - `2de83b6a` (RED static test), `e08daae9` (GREEN chore)

**Plan metadata:** this documentation commit

## Files Created/Modified

- `src/components/atomic-crm/financial/exactProviderContract.test.ts` - Runs one exact list/get/save/error/effect matrix against fresh FakeRest and mocked Supabase provider harnesses.
- `src/components/atomic-crm/providers/fakerest/dataProvider.ts` - Validates exact invoice requests and responses, preserves caller scope, and routes all FakeRest invoice CRUD through exact methods.
- `src/components/atomic-crm/providers/fakerest/dataGenerator/billingAccounts.ts` - Generates deterministic exact invoice fixtures for the 8.875% golden case and both signed persistence endpoints.
- `src/components/atomic-crm/invoices/invoiceCalculations.ts` - Provides the exact-only preview adapter over central codecs and the named rounding helper.
- `src/components/atomic-crm/invoices/invoiceCalculations.test.ts` - Covers golden output, signed ties, canonical zero, exact ratios, mismatches, denominator failure, overflow, endpoints, and display-only evidence.
- `tests/release/exact-money-release-static.test.ts` - Protects every Wave 6 path, target membership, exact FakeRest routing, exact preview delegation, numeric-authority bans, and inherited workflow identities.
- `makefile` - Adds provider parity to `FINANCIAL_DATABASE_HTTP_TESTS` and invoice preview to `FINANCIAL_FAST_TESTS` exactly once.
- `.github/release/financial-paths.json` - Classifies only the exact invoice calculation source and test paths newly made money-bearing by this plan.

## Decisions Made

- Kept FakeRest invoice state local to each provider factory so parity cases receive deterministic isolation and invalid writes can be proven to leave invoice/audit counts unchanged.
- Preserved the existing Plan 05 request shapes exactly: invoice saves have no idempotency key or fingerprint, tenant identity remains provider-derived, and D-10 submitted percentage text remains evidence rather than authority.
- Made authoritative preview output typed USD money objects only; the human description is produced after calculation and is never parsed back into a financial value.
- Used explicit classifier entries for `invoiceCalculations.ts` and its test instead of a broad `invoices/**` pattern, keeping financial gate scope narrow.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The first GREEN run of the Wave 6 mutation test added duplicate target members to an already-updated Make fixture, so removing one copy did not simulate omission. The fixture was made state-aware and now removes both terminal and continued list forms; the rolling contract passes 13/13 and still detects each intended mutation.

## TDD Gate Compliance

- Task 1: `2acaa294` failed all parity cases because exact FakeRest fixtures/provider methods did not exist; `d6cf7191` made the shared ten-case matrix pass for both provider harnesses.
- Task 2: `48118860` failed on the missing exact preview export; `ea77f9e8` made all eleven golden, signed, policy, range, and evidence assertions pass.
- Task 3: `2de83b6a` passed 12/13 rolling assertions and failed only on the two missing classifier paths plus the two missing target memberships; `e08daae9` made all thirteen assertions and both permanent targets pass.

## Verification

- `make test-financial-database-http` - PASS; 4 files and 24 tests, including all 10 parity cases, with one isolated local bootstrap/assertion attempt and successful cleanup.
- `make test-financial-fast` - PASS; 7 files and 138 tests, including 11 exact preview and 13 rolling static assertions.
- Focused exact provider parity - PASS; 10/10 across both provider harnesses.
- Focused exact invoice preview - PASS; 11/11 with both signed endpoints, half ties, overflow, policy, and denominator cases.
- `npm run typecheck` and targeted ESLint/Prettier - PASS; only the inherited ESLint ignore-file migration warning was emitted.
- Numeric-authority scan - PASS; no `Math.round`, `toFixed`, `parseFloat`, financial `Number(...)`, or authoritative financial `number` signature is present, and preview calls `roundExactRatioToUsdMoney` exactly once.
- Target/classifier uniqueness and `git diff --check` - PASS.
- Stub and threat-surface scan - PASS; no runtime placeholder, new endpoint, schema change, dependency, or unplanned trust boundary was introduced.

## Known Stubs

None. Empty collections and nullable values in the provider/test harnesses are deliberate exact request, result, accumulator, or optional-field states and do not represent unwired UI.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 07 can perform the final exact-money audit with runtime codecs, PostgreSQL primitives, exact persistence/RPCs, Supabase/FakeRest provider parity, preview arithmetic, and permanent release coupling in place.
- No rendered UI file changed, so no UI surface receipt is required for this plan.
- No hosted database, linked Supabase project, production system, workflow identity, deployment, dependency definition, or external configuration changed.

## Self-Check: PASSED

All eight implementation/protection files, this summary, and all six RED/GREEN task commits were verified locally before planning metadata was advanced.

---
*Phase: 03-exact-money-and-rounding-contract*
*Completed: 2026-09-04*
