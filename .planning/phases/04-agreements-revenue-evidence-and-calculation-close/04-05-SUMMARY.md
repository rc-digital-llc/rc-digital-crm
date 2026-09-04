---
phase: 04-agreements-revenue-evidence-and-calculation-close
plan: "05"
subsystem: application-provider
tags: [typescript, supabase, fakerest, exact-money, authorization, cache-safety]
requires:
  - phase: 04-01
    provides: immutable agreement commands and caller-safe agreement reads
  - phase: 04-02
    provides: revenue periods, evidence reviews, exceptions, and close snapshots
  - phase: 04-03
    provides: exact calculation preview, creation, and approval commands
  - phase: 04-04
    provides: support-safe lineage and late-evidence adjustments
provides:
  - Closed string-safe Phase 4 domain and provider contracts
  - Strict Supabase adapters for all seventeen named reads and commands
  - Bounded caller-scoped revenue-period and calculation support RPCs
  - Isolated deterministic FakeRest close state machine with exact parity
  - Phase 4 presentation capability and offline-cache exclusions
affects: [agreement-ui, monthly-close-ui, calculation-ui, release-verification]
tech-stack:
  added: []
  patterns:
    - Named provider methods are the only application mutation path for Phase 4 authority
    - Unknown RPC success payloads fail before reaching application state
    - FakeRest command receipts check replay conflicts before any state effect
    - Every synthetic money, rate, candidate, comparison, and adjustment uses canonical strings and BigInt helpers
key-files:
  created:
    - src/components/atomic-crm/providers/supabase/billingCloseProvider.ts
    - src/components/atomic-crm/providers/fakerest/billingCloseProvider.ts
    - supabase/migrations/20260904000005_billing_provider_reads.sql
    - supabase/tests/database/90_billing_provider_reads.sql
  modified:
    - src/components/atomic-crm/types.ts
    - src/components/atomic-crm/providers/types.ts
    - src/components/atomic-crm/providers/supabase/dataProvider.ts
    - src/components/atomic-crm/providers/fakerest/dataProvider.ts
    - src/components/atomic-crm/providers/fakerest/dataGenerator/billingAccounts.ts
    - src/components/atomic-crm/providers/fakerest/dataGenerator/types.ts
    - src/components/atomic-crm/financial/billingCloseProviderContract.test.ts
    - src/components/atomic-crm/billing-accounts/billingAccess.ts
    - src/components/atomic-crm/billing-accounts/billingAccounts.test.ts
key-decisions:
  - "Phase 4 authority is exposed only through seventeen explicit typed methods; raw and semantic support resources reject generic create, update, and delete operations."
  - "Two forward-only caller-scoped list RPCs serialize every nested financial integer as text and omit paths, signed URLs, raw content, and unrelated tenant data."
  - "The Supabase adapter accepts only exact response keys, IDs, policies, hashes, lineages, and recomputed formula relationships; stable allowlisted domain codes are the only server detail preserved."
  - "FakeRest owns fresh deterministic state per factory and models capabilities, evidence validity, immutable revisions, replays, conflicts, stale inputs, anomalies, approval lineage, and compensating adjustments without network or randomness."
requirements-completed: [AGR-01, AGR-02, AGR-03, AGR-04, AGR-05, REV-01, REV-02, REV-04, REV-05, REV-06, REV-07, REV-08, REV-09, CALC-02, CALC-04, CALC-05, CALC-06, CALC-07]
duration: 44 min
completed: 2026-09-04
---

# Phase 4 Plan 5: Provider Contracts and Deterministic Parity Summary

**The complete agreement-to-adjustment close domain now crosses the application boundary through strict named methods, with malformed live responses rejected and deterministic FakeRest behavior matching the same exact contract.**

## Performance

- **Duration:** 44 min
- **Started:** 2026-09-04T22:20:00Z
- **Completed:** 2026-09-04T23:04:00Z
- **Tasks:** 3
- **Files modified:** 13

## Accomplishments

- Added read-only Phase 4 types and a closed registry of seventeen explicit agreement, revenue, calculation, lineage, and adjustment provider methods plus four semantic support-safe resources.
- Added strict Supabase request validation, exact RPC routing, response-key and policy allowlists, tenant/account lineage checks, formula and comparison recomputation, recursive numeric-financial-token rejection, frozen return values, and safe stable error normalization.
- Added bounded PostgreSQL support reads for revenue periods and calculations with authenticated-only execution, locked search paths, server-derived caller scope, and text serialization for nested financial integers.
- Added a deterministic FakeRest kernel with four synthetic formula scenarios, factory-owned state, capability denials, clean-evidence requirements, immutable revisions, conflict-before-effect receipts, close policy anomalies, calculation approval lineage, and late-evidence adjustment treatment.
- Blocked generic Phase 4 mutations in both providers, mapped named presentation capabilities, and proved every new billing support query remains excluded from offline persistence.

## Task Commits

Each task was committed atomically:

1. **Task 1: Define strict Phase 4 domain and provider contracts** - `aee2b0c7` (feat)
2. **Task 2: Implement strict Supabase RPC translation and reconciliation** - `1570b234` (feat)
3. **Task 3: Implement isolated FakeRest parity and capability/cache controls** - `75ebcd83` (feat)

## Files Created/Modified

- `src/components/atomic-crm/providers/supabase/billingCloseProvider.ts` - Closed RPC codecs, safe errors, and exact reconciliation for all Phase 4 methods.
- `src/components/atomic-crm/providers/fakerest/billingCloseProvider.ts` - Deterministic isolated state machine implementing the same provider contract.
- `supabase/migrations/20260904000005_billing_provider_reads.sql` - Caller-scoped bounded support reads for revenue periods and calculations.
- `supabase/tests/database/90_billing_provider_reads.sql` - Ownership, grants, search-path, bounds, scope, safe-field, and string-serialization assertions.
- `src/components/atomic-crm/types.ts` and `providers/types.ts` - Exact read-only domain, request/response, method, and semantic-resource contracts.
- `src/components/atomic-crm/providers/supabase/dataProvider.ts` and `fakerest/dataProvider.ts` - Named method integration and generic mutation rejection.
- `src/components/atomic-crm/providers/fakerest/dataGenerator/billingAccounts.ts` and `types.ts` - Fixed, percentage, minimum-exception, and hybrid synthetic data.
- `src/components/atomic-crm/financial/billingCloseProviderContract.test.ts` - Shared malformed-response and deterministic parity coverage.
- `src/components/atomic-crm/billing-accounts/billingAccess.ts` and `billingAccounts.test.ts` - Named capability mappings, generic mutation denial, and persistence exclusions.

## Decisions Made

- Support list RPCs were added as a forward-only migration because the completed database plans exposed safe agreement and single-lineage reads but did not yet provide bounded string-safe revenue-period or calculation lists required by the application contract.
- The live adapter recomputes exact candidate, branch, result, delta, and policy relationships rather than treating a structurally valid JSON response as trustworthy.
- Stable allowlisted domain codes cross the provider boundary; raw Supabase messages and tenant details do not.
- FakeRest fingerprints are deterministic synthetic hashes used only for demo parity. They never become production or cryptographic authority.
- Support-safe semantic resources are readable surfaces only. Both raw authority tables and semantic resources reject generic mutation operations.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Added bounded support-list RPCs**

- **Found during:** Task 2 adapter implementation
- **Issue:** Existing Phase 4 migrations provided an agreement list and calculation lineage read but no bounded caller-scoped revenue-period or calculation list with guaranteed string financial tokens.
- **Fix:** Added `read_billing_revenue_periods(jsonb)` and `read_billing_calculations(jsonb)` in a forward-only migration, with authenticated-only grants and dedicated pgTAP coverage.
- **Files modified:** `supabase/migrations/20260904000005_billing_provider_reads.sql`, `supabase/tests/database/90_billing_provider_reads.sql`
- **Verification:** Clean migration application succeeded and `90_billing_provider_reads.sql` passed 10/10 assertions.
- **Committed in:** `1570b234`

**2. [Rule 1 - Bug] Closed generic mutation access for semantic support resources**

- **Found during:** Task 3 integration review
- **Issue:** Raw authority tables were guarded, but the newly registered support-safe resource names could still reach generic create/update/delete methods in provider plumbing.
- **Fix:** Added all four semantic resources to both providers' Phase 4 mutation-denial sets and mapped generic presentation mutations to `false`.
- **Files modified:** `src/components/atomic-crm/providers/supabase/dataProvider.ts`, `src/components/atomic-crm/providers/fakerest/dataProvider.ts`, `src/components/atomic-crm/billing-accounts/billingAccess.ts`
- **Verification:** Typecheck, provider tests, capability tests, and the full repository suite pass.
- **Committed in:** `75ebcd83`

---

**Total deviations:** 2 auto-fixed issues. **Impact on plan:** Both changes were required to preserve least privilege and deliver the bounded read contract; neither widens mutation authority or adds invoice behavior.

## Issues Encountered

- The SQL formatter has no configured parser for migration files, so SQL correctness was verified through clean migration application, pgTAP, and `git diff --check`; TypeScript files passed the configured Prettier and ESLint gates.

## User Setup Required

None - no hosted database, credentials, provider state, pull request, merge, or deployment was changed.

## Next Phase Readiness

- Plan 04-06 can build the agreement and revenue-close operator surfaces against one production/demo provider contract.
- Exact branded values, safe errors, capability gates, and deterministic scenarios are ready for UI state and responsive interaction tests.
- Phase 4 remains invoice-free; invoice issuance authority stays deferred to Phase 5.

## Self-Check: PASSED

- All three task commits and all thirteen key files are present.
- Provider/capability plan verification: 40/40 tests pass.
- Full repository verification: 514/514 executed tests pass, with 26 intentionally skipped.
- New database support-read pgTAP: 10/10 assertions pass after clean migration application.
- TypeScript typecheck, targeted ESLint, configured Prettier for TypeScript, and `git diff --check` pass.
- Shared skill-suite smoke: 10/10 checks pass.
- Static search finds no `Math`, `parseFloat`, `parseInt`, or `Number` financial authority in the FakeRest close kernel.

---

_Phase: 04-agreements-revenue-evidence-and-calculation-close_
_Completed: 2026-09-04_
