---
phase: 03-exact-money-and-rounding-contract
plan: "05"
subsystem: api
tags: [react-admin, supabase, postgrest, rls, exact-money, vitest]

requires:
  - phase: 03-01
    provides: Branded canonical runtime money, ratio, percentage, and rounding codecs
  - phase: 03-04
    provides: Caller-bound exact and compatibility invoice RPCs with direct table and sequence access revoked
provides:
  - Typed exact invoice records and provider contracts with string-only authoritative financial components
  - React Admin invoice list, get, create, and update routing through validated caller-bound RPCs only
  - Real local Auth, PostgREST, RLS, ACL, range, malformed-input, and unchanged-effect verification
  - Permanent Wave 5 classifier and isolated database HTTP target protection
affects: [03-06, 03-07, invoice-provider, fakerest-parity, financial-release-gate]

tech-stack:
  added: []
  patterns:
    - Validate closed React Admin requests and complete RPC responses before branding or returning exact values
    - Exercise authenticated invoice access only through caller-bound RPCs while retaining explicit direct-table denials
    - Use service-only database reads for setup and effect snapshots inside a disposable loopback Supabase lane

key-files:
  created:
    - tests/release/exact-money-boundaries.test.ts
  modified:
    - src/components/atomic-crm/types.ts
    - src/components/atomic-crm/providers/types.ts
    - src/components/atomic-crm/providers/supabase/dataProvider.ts
    - tests/release/billing-tenancy.test.ts
    - tests/release/exact-money-release-static.test.ts
    - makefile

key-decisions:
  - "React Admin invoice list/get/create/update operations use only the exact read/save RPCs; generic invoice-table CRUD and client-supplied tenant identity are rejected."
  - "Live invoice tenancy proof is a dedicated exact RPC matrix, leaving the inherited non-invoice table/RLS matrix intact and retaining direct invoice-table denials as negative assertions."
  - "The existing financial path patterns already classify every Wave 5 file, so protection required a Make target addition and static proof rather than redundant classifier entries."

patterns-established:
  - "Provider boundary: parse closed request keys, canonicalize branded values, call one named RPC, then validate the full response and financial reconciliation."
  - "Live exact boundary: real role JWTs drive PostgREST while service-only snapshots prove rejected requests leave invoices, audits, automation executions, and sequence state unchanged."

requirements-completed: [CALC-01, CALC-03]

duration: 27 min
completed: 2026-09-04
---

# Phase 3 Plan 05: Live Exact Invoice Boundary Summary

**Typed React Admin invoice operations now cross only caller-bound exact Supabase RPCs, with full-range string preservation, real JWT tenant proof, direct-table denial, and permanent isolated HTTP coverage**

## Performance

- **Duration:** 27 min
- **Started:** 2026-09-04T22:25:10Z
- **Completed:** 2026-09-04T22:51:59Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Replaced generic invoice provider access with typed list/get/save methods that validate closed request shapes, canonical string money and rates, exact line arithmetic, policy identities, and complete RPC responses.
- Proved same-tenant role access, cross-tenant indistinguishability, disabled/wrong-capability denial, direct table and sequence denial, full signed-bigint strings, fixed-decimal compatibility, RPC ownership/ACLs, and zero-effect invalid requests through real local Auth and PostgREST.
- Migrated inherited invoice tenancy coverage from direct table reads to exact RPC list/get calls without weakening the 100-case non-invoice RLS matrix.
- Added mutation-tested Wave 5 static coupling and made the exact boundary an explicit member of the permanent isolated database HTTP target.

## Task Commits

Each task was committed atomically, with RED observed before its GREEN result:

1. **Task 1: Replace generic invoice access with validated Supabase RPC methods** - `8fa36964` (RED test), `6dffc1ab` (GREEN feat)
2. **Task 2: Prove the live caller, tenant, token, and full-range boundary** - `515faaa1` (RED live test), `8f79d95f` (GREEN test migration)
3. **Task 3: Protect the live Supabase boundary in Wave 5** - `06645e1b` (RED static test), `92fffd88` (GREEN chore)

Correctness follow-up: `7ef9a5e4` (RED reconciliation test), `c9ab49ab` (GREEN fix).

**Plan metadata:** this documentation commit

## Files Created/Modified

- `src/components/atomic-crm/types.ts` - Defines exact invoice and line-item records using branded string money, rate, ratio, and policy values.
- `src/components/atomic-crm/providers/types.ts` - Defines closed exact list/get/save provider requests and responses.
- `src/components/atomic-crm/providers/supabase/dataProvider.ts` - Validates and routes invoice operations through exact read/save RPCs without generic table CRUD.
- `tests/release/exact-money-boundaries.test.ts` - Covers provider translation plus real JWT/Auth/PostgREST/RLS/ACL/range/denial behavior.
- `tests/release/billing-tenancy.test.ts` - Preserves the inherited non-invoice matrix and moves invoice list/get authorization to exact RPCs.
- `tests/release/exact-money-release-static.test.ts` - Protects Wave 5 classification, Make membership, RPC/function/grant/provider invariants, and the six inherited workflow identities.
- `makefile` - Runs the exact boundary explicitly in `FINANCIAL_DATABASE_HTTP_TESTS`.

## Decisions Made

- Kept invoice IDs and every authoritative money/rate/ratio component as validated strings across shared types, provider requests, RPC responses, and live assertions; JavaScript numbers remain limited to pagination totals and other nonfinancial control data.
- Reused the existing read/save RPC request shapes exactly, including no invoice-save idempotency key or fingerprint; invoice business idempotency remains Phase 5 scope.
- Relied on the isolated lane to destroy live database fixtures after assertions because billing audit history is append-only; test teardown closes sessions and the runner reports namespace cleanup.
- Did not edit `.github/release/financial-paths.json` because its existing explicit provider entries plus `tests/release/**`, `makefile`, and `.github/release/**` already classify every Wave 5 path, now enforced by mutation-tested static assertions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Rejected unreconciled empty-line saves before the RPC**

- **Found during:** Task 3 pre-coupling contract review
- **Issue:** The provider allowed a nonzero invoice with an empty line-item array to reach Supabase even though the exact save RPC requires the line sum to equal the invoice amount.
- **Fix:** Removed the nonempty-array exception so every save request must reconcile its line total locally.
- **Files modified:** `tests/release/exact-money-boundaries.test.ts`, `src/components/atomic-crm/providers/supabase/dataProvider.ts`
- **Verification:** The focused RED returned `INVOICE_SAVE_INVALID_RESPONSE` after contacting the mock RPC; GREEN returns `INVOICE_SAVE_INVALID_REQUEST`, makes no RPC call, passes 5/5 focused provider assertions, typecheck, and lint.
- **Committed in:** `7ef9a5e4` (RED), `c9ab49ab` (GREEN)

---

**Total deviations:** 1 auto-fixed bug
**Impact on plan:** The fix closes a request-validation parity gap without widening the provider, database, dependency, or product scope.

## Issues Encountered

- The first Task 2 live fixture used a nonreconciling valid-save line array and attempted to delete append-only audit records during teardown. The fixture was corrected before its RED commit, and teardown now delegates database destruction to the required isolated runner.
- A create-shaped one-step overflow reaches PostgreSQL sequence allocation before its trigger rejects the row. The unchanged-sequence assertion therefore exercises the same overflow through an existing authorized invoice update, proving the financial write stays atomic without misstating PostgreSQL sequence transactionality.
- The inherited tenancy fixture still inserted legacy decimal invoice columns and failed with `FINANCIAL_POLICY_MISMATCH`; this was the intended Task 2 RED and was resolved by exact fixture columns plus RPC-based reads.

## TDD Gate Compliance

- Task 1: `8fa36964` captured four provider contract failures; `6dffc1ab` made all four pass with exact typed RPC routing.
- Task 2: `515faaa1` passed all nine new exact live tests while the inherited tenancy suite failed on legacy invoice insertion; `8f79d95f` made both live files pass 12/12.
- Correctness follow-up: `7ef9a5e4` captured local line-reconciliation failure; `c9ab49ab` made the focused provider contract pass 5/5.
- Task 3: `06645e1b` failed only on missing exact-boundary HTTP membership; `92fffd88` made the static contract pass 11/11 and the permanent HTTP target pass 14/14.

## Verification

- `npm run typecheck` - PASS.
- Focused provider contract - PASS; 5/5 assertions, with live cases intentionally skipped outside the isolated runner.
- Focused isolated exact boundary plus billing tenancy - PASS; 12/12 tests, one assertion attempt, cleanup success.
- `npm test -- --run tests/release/exact-money-release-static.test.ts` - PASS; 11/11 rolling and mutation assertions.
- `make test-financial-database-http` - PASS; 14/14 Auth, billing tenancy, and exact-money HTTP assertions, one bootstrap/assertion attempt, cleanup success.
- Targeted ESLint, Prettier, and `git diff --check` - PASS.
- Stub and threat-surface scan - PASS; no runtime placeholders, new endpoints, schema changes, dependencies, or unplanned trust boundaries.

## Known Stubs

None. Empty collections in tests and provider validation are deliberate request, result, or accumulator values and do not flow to unwired UI.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 06 can implement FakeRest/demo parity against the exact shared/provider contract without depending on direct invoice table access.
- Plan 07 can perform the final phase audit with provider, live Auth/PostgREST, tenancy, ACL, static, and protected HTTP evidence already in place.
- No hosted database, linked Supabase project, production system, deployment, dependency definition, or external configuration changed.

## Self-Check: PASSED

All seven implementation/protection files, this summary, and all eight RED/GREEN/correctness commits were verified locally before planning metadata was advanced.

---
*Phase: 03-exact-money-and-rounding-contract*
*Completed: 2026-09-04*
