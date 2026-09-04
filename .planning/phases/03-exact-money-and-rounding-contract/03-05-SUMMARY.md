---
phase: 03-exact-money-and-rounding-contract
plan: "05"
subsystem: exact-invoice-provider-boundary
tags: [supabase, react-admin, invoices, postgrest, tenancy, exact-money]
requires:
  - phase: 03-exact-money-and-rounding-contract
    plan: "04"
    provides: Caller-bound exact and compatibility invoice RPCs
provides:
  - Branded exact invoice, rate, money, and line-item application contracts
  - React Admin invoice list/get/create/update routing over exact RPCs only
  - Live two-tenant Auth/PostgREST proof for exact and compatibility boundaries
  - Stable malformed-save errors and permanent database HTTP lane coverage
affects: [03-06, 03-07, financial-release-gate]
tech-stack:
  added: []
  patterns: [closed provider translation, full response decoding, RPC-only invoice access]
key-files:
  created:
    - tests/release/exact-money-boundaries.test.ts
    - supabase/migrations/20260903000001_exact_invoice_save_error_contract.sql
  modified:
    - src/components/atomic-crm/types.ts
    - src/components/atomic-crm/providers/types.ts
    - src/components/atomic-crm/providers/supabase/dataProvider.ts
    - tests/release/billing-tenancy.test.ts
    - tests/release/exact-money-release-static.test.ts
    - makefile
key-decisions:
  - "React Admin invoice operations translate into the closed exact RPC contracts; the generic Supabase table provider never handles invoices."
  - "Every exact response is decoded and reconciled before branding, including reduced ratios, submitted percentage evidence, line-item arithmetic, policies, and total equality."
  - "A forward-only wrapper normalizes PostgreSQL invalid-parameter failures without editing the accepted exact-cutover migration."
patterns-established:
  - "Provider trust boundary: validate UI params locally, call one fixed RPC, then validate the complete response before returning an application record"
  - "Live tenant proof: real JWTs establish authority while service-only SQL is limited to fixture setup and unchanged-state observations"
requirements-completed: [CALC-01, CALC-03]
duration: 17 min
completed: 2026-09-04
---

# Phase 3 Plan 05: Exact Invoice Provider Boundary Summary

**React Admin invoice access now uses validated caller-bound RPCs exclusively, with real Auth/PostgREST proof for exact strings, tenant isolation, direct-table denial, and malformed-input atomicity.**

## Performance

- **Duration:** 17 min
- **Started:** 2026-09-04T05:26:00Z
- **Completed:** 2026-09-04T05:42:45Z
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- Added shared exact invoice records composed from branded `UsdMoney`, `OrdinaryPercentageRate`, `ExactRatio`, and canonical exact line items; no authoritative invoice money or rate uses JavaScript numbers.
- Added closed provider request/result types and explicit `listExactBillingInvoices`, `getExactBillingInvoice`, and `saveExactBillingInvoice` methods.
- Routed React Admin invoice `getList`, `getOne`, `create`, and `update` through `read_billing_invoices_exact` and `save_billing_invoice_exact`, while preserving every nonfinancial provider path.
- Added local request guards for bounded pagination, allowlisted filters/sorts, string-only identifiers, exact draft saves, policies, line arithmetic, and overflow; added full response decoding and reconciliation before branding.
- Migrated the inherited two-tenant invoice matrix from direct table reads to the exact read RPC while retaining direct-table operations as explicit negative cases.
- Added a fresh two-tenant live suite using real Auth JWTs to prove role reads, customer/disabled denial, cross-tenant invisibility, authorized create/update, direct table/sequence denial, full signed-bigint strings, fixed-nine compatibility values, malformed-token rejection, and unchanged financial effects.
- Added a forward-only wrapper migration so malformed scalar JSON returns `INVOICE_SAVE_INVALID_REQUEST` instead of leaking an internal PostgreSQL diagnostic.
- Added the exact live suite to `FINANCIAL_DATABASE_HTTP_TESTS` and extended rolling static coverage across the shared types, provider, migrations, and both live tests.

## Task Commits

Each task was committed with RED and GREEN evidence:

1. **Task 1: Replace generic invoice access with validated Supabase RPC methods** - `06cad3c6`, `be8bd375`
2. **Task 2: Prove the live caller, tenant, token, and full-range boundary** - `532af0a0`
3. **Task 3: Protect the live Supabase boundary in Wave 5** - `63280a1a`, `07edb17d`

## Files Created/Modified

- `src/components/atomic-crm/types.ts` - Canonical invoice record and exact line-item types.
- `src/components/atomic-crm/providers/types.ts` - Closed exact list/get/save provider contracts and method registry.
- `src/components/atomic-crm/providers/supabase/dataProvider.ts` - Request translation, response codecs, safe errors, and RPC-only React Admin invoice routing.
- `tests/release/exact-money-boundaries.test.ts` - Real JWT, tenant, exact/compatibility, malformed-token, ACL, and unchanged-effect proof.
- `tests/release/billing-tenancy.test.ts` - Existing tenant matrix migrated to caller-bound exact invoice reads.
- `supabase/migrations/20260903000001_exact_invoice_save_error_contract.sql` - Stable public error wrapper around the accepted exact save implementation.
- `tests/release/exact-money-release-static.test.ts` - Wave 5 membership, no-view, no-direct-grant, and provider-RPC checks.
- `makefile` - Exact boundary suite added to the permanent database HTTP target.

## Decisions Made

- Exact database wire fields are assembled into structured application money/rate objects only after every token and invariant passes the Phase 3 codecs.
- A billing-account filter may narrow results but never establishes tenant authority; the function derives authority from the caller's JWT-bound role state.
- Unknown records and cross-tenant IDs both return no row, avoiding an existence oracle.
- Invoice saves intentionally accept no idempotency key, fingerprint, issuance state, payment behavior, or new financial-version field.

## Deviations from Plan

### Auto-fixed Stable Error Contract

**1. Normalized a malformed scalar JSON error in a forward-only migration**

- **Found during:** Task 2 live malformed-token proof
- **Issue:** The accepted save function called `jsonb_object_keys` on scalar `amount` input before its object-type branch, returning PostgreSQL's internal `cannot call jsonb_object_keys on a scalar` message.
- **Fix:** Moved the accepted implementation to a private, fully revoked function and added a locked public wrapper that converts SQLSTATE `22023` to `INVOICE_SAVE_INVALID_REQUEST`.
- **Files modified:** `supabase/migrations/20260903000001_exact_invoice_save_error_contract.sql`
- **Verification:** The complete malformed-save matrix returns stable errors with invoice, sequence, audit, automation execution, and automation counter state unchanged. Baseline upgrade replay retained report SHA-256 `537dafee2ce0b9c036e8297989b66993bb73c2ea29381f157e6f8d64fd95efd0`.

---

**Total deviations:** 1 auto-fixed boundary correctness issue
**Impact on plan:** Required for the stated safe-error contract; accepted migration history and privilege boundaries remain unchanged.

## Verification

- `npm run typecheck` passes.
- Focused live exact/tenancy run: 2 files, 8 tests passed.
- Permanent database HTTP target: 3 files, 9 tests passed.
- Static exact-money release contract: 8 tests passed.
- Upgrade replay preserved every semantic invariant and the existing report hash.
- Canonical Supabase configuration is restored and `git diff --check` passes.

## User Setup Required

None - all proof used an isolated local Supabase stack and synthetic `release.example` identities.

## Next Phase Readiness

- Plan 03-06 can implement the exact FakeRest mirror and refactor invoice preview/UI calculations against the same branded values.
- The live provider boundary, inherited tenancy matrix, and permanent HTTP membership are now protected prerequisites.

## Self-Check: PASSED

- Both created artifacts and all modified provider/test artifacts exist.
- All five implementation/test commits resolve as commits.
- No generic invoice-table call exists in the authoritative Supabase provider.

---
*Phase: 03-exact-money-and-rounding-contract*
*Completed: 2026-09-04*
