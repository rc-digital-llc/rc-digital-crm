---
phase: 03-exact-money-and-rounding-contract
plan: "04"
subsystem: exact-billing-authority
tags: [postgresql, invoices, automation, evidence, rpcs, idempotency, exact-money]
requires:
  - phase: 03-exact-money-and-rounding-contract
    plan: "03"
    provides: Closed sequence-003 upgrade registry vocabulary and semantic verifier
provides:
  - Atomic legacy-to-exact invoice, line-item, automation, and evidence conversion
  - Caller-bound exact and compatibility invoice reads plus exact-only draft saves
  - Canonical automation request/effect fingerprints with conflict-atomic replay
  - Deterministic sequence-003 upgrade fingerprints and protected live contracts
affects: [03-05, 03-06, financial-release-gate]
tech-stack:
  added: []
  patterns: [exact authority with derived compatibility, closed SECURITY DEFINER RPC, command-owned effect discriminator]
key-files:
  created:
    - supabase/migrations/20260902000002_exact_billing_expand.sql
    - supabase/tests/database/65_exact_billing_conversion.sql
    - supabase/tests/upgrades/003-exact-money/expected-transformations.json
  modified:
    - scripts/release/fingerprint-upgrade.mjs
    - supabase/tests/database/35_billing_automation.sql
    - supabase/tests/database/40_billing_evidence.sql
    - supabase/tests/support/billing-security-fixtures.sql
    - tests/release/replay-concurrency.test.ts
    - tests/release/billing-evidence.test.ts
    - tests/release/exact-money-release-static.test.ts
    - makefile
key-decisions:
  - "Invoice legacy money and tax columns remain derived compatibility projections; exact minor units, reduced rate ratios, policies, and canonical line items are the sole authority."
  - "Automation replay equality binds both the complete request fingerprint and a command-owned effect discriminator; conflicts return before audit, counters, execution, or evidence mutation."
  - "Authenticated invoice access is RPC-only: base-table and sequence privileges remain revoked even though the functions run as a locked definer."
patterns-established:
  - "Exact cutover: validate and stage the entire legacy inventory before any authoritative data update"
  - "Caller-bound definer read: closed request keys, fixed query branches, capability predicate on count and data paths"
  - "Compatibility preservation: compare widened numeric values semantically while fingerprinting the intentional representation change"
requirements-completed: [CALC-01, CALC-03]
duration: 43 min
completed: 2026-09-04
---

# Phase 3 Plan 04: Exact Billing Authority Summary

**Invoices, automation grants/effects, and evidence inspection now share one exact string-safe PostgreSQL authority, with direct browser table access removed and deterministic upgrade proof.**

## Performance

- **Duration:** 43 min
- **Started:** 2026-09-04T04:38:40Z
- **Completed:** 2026-09-04T05:21:58Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments

- Added a single atomic migration that validates and stages every legacy financial value, converts invoices and line items without rounding or guessing, widens only compatibility decimals, and preserves immutable original line-item evidence.
- Replaced direct authenticated invoice CRUD with locked, caller-bound exact/compatibility read RPCs and one exact-only draft save RPC using closed inputs, fixed ordering branches, bounded pagination, and explicit capability predicates.
- Converted automation limits, counters, and execution receipts to non-negative minor units with canonical request/effect fingerprints and a closed command-owned effect discriminator.
- Replaced the surviving evidence-finalization implementation without editing accepted history; canonical zero money now flows through the exact automation helper while the public signature and response shape remain stable.
- Created registry `003-exact-money` from deterministic live before/after hashes and proved exact invoice, line-item, automation, evidence, RPC, ACL, tax-rate, and unrelated-CRM invariants.
- Extended pgTAP, 32-way concurrency, Edge/Storage, and rolling static checks so identical replay succeeds and every tested conflicting-key variant preserves evidence, audit, grant, execution, and protected-effect state.

## Task Commits

Each task was committed with RED and GREEN evidence:

1. **Task 1: Perform the atomic exact cutover behind caller-bound RPCs** - `ded47f03`, `ef9cdae2`, `4b5b00e7`, `e9b4013c`
2. **Task 2: Migrate inherited SQL callers and prove evidence replay atomicity** - `2b3d6298`
3. **Task 3: Update inherited live callers and protect every Wave 4 path** - `3b105d65`

## Files Created/Modified

- `supabase/migrations/20260902000002_exact_billing_expand.sql` - Atomic conversion, exact triggers/helpers, invoice RPCs, automation fingerprints, evidence replacement, ownership, and ACLs.
- `supabase/tests/database/65_exact_billing_conversion.sql` - Exact schema, range, RPC, ACL, caller isolation, save, and canonical-zero proof.
- `supabase/tests/upgrades/003-exact-money/expected-transformations.json` - Append-only sequence-003 conversion authorization.
- `scripts/release/fingerprint-upgrade.mjs` - Value-based legacy tax-rate comparison across the intentional scale widening.
- `supabase/tests/database/35_billing_automation.sql` - Exact money callers, fingerprint checks, replay/conflict, negative, overflow, and unchanged-effect assertions.
- `supabase/tests/database/40_billing_evidence.sql` - Exact helper catalog proof and five conflicting inspection variants with byte-for-byte state snapshots.
- `supabase/tests/support/billing-security-fixtures.sql` - Exact automation limits and invoice-capable account fixtures.
- `tests/release/replay-concurrency.test.ts` - Canonical money in the 32-way live race plus conflict/negative state proof.
- `tests/release/billing-evidence.test.ts` - Real Edge boundary replay/conflict snapshots.
- `tests/release/exact-money-release-static.test.ts` - Wave 4 membership, hardening, no-view/no-dynamic-SQL, and accepted-history immutability checks.
- `makefile` - Protects test 65 in the permanent database SQL lane.

## Decisions Made

- Legacy invoice decimals and `line_items` remain derived or evidentiary only; no accepted legacy field can become a second write authority.
- Read RPCs manually apply `private.billing_has_capability` to both count and selected rows because definer ownership bypasses RLS.
- The general automation command supplies a neutral effect discriminator, while evidence inspection binds evidence ID, decision, and reason code; a key is duplicate only when both stored fingerprints match.
- Invoice draft saves intentionally have no invoice idempotency key or fingerprint, preserving the Phase 5 scope boundary.

## Deviations from Plan

### Auto-fixed Upgrade Semantic Comparison

**1. Compared widened tax rates by numeric value in the existing upgrade semantic check**

- **Found during:** Task 1 representative baseline upgrade
- **Issue:** The inherited preservation check compared `numeric::text`, so the intentional `numeric(5,2)` to `numeric(12,9)` widening changed textual scale despite preserving the value.
- **Fix:** Applied `pg_catalog.trim_scale` only in the preservation semantic snapshot; the separate exact tax-rate fingerprint still records and verifies the representation change.
- **Files modified:** `scripts/release/fingerprint-upgrade.mjs`
- **Verification:** The complete upgrade proof passes all legacy and exact invariants with report SHA-256 `537dafee2ce0b9c036e8297989b66993bb73c2ea29381f157e6f8d64fd95efd0`.

---

**Total deviations:** 1 auto-fixed verifier correctness issue
**Impact on plan:** Required to distinguish preserved financial value from the explicitly authorized compatibility-scale change; no accepted history or allowlist was weakened.

## Issues Encountered

- The first staged conversion updated invoice timestamps through the inherited trigger, making a row fingerprint time-dependent. The migration now disables that trigger only during the controlled backfill and restores it before commit.
- Another local Supabase project owns the default ports. Live database lanes used temporary alternate loopback ports, and the Edge test's public Storage URL was adjusted only for the local receipt; both files were restored before commits.
- Existing `supabaseAdapter.spec.ts` tests still emit their pre-existing unawaited-expectation warnings; all tests pass.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 03-05 can route the Supabase provider through the exact read/save RPCs and validate every wire response against the Phase 3 codec.
- Registry 003, direct-access revocation, and exact replay semantics are now permanent protected prerequisites.

## Self-Check: PASSED

- All three created artifacts and the summary exist.
- All six implementation/test commits resolve as commits.
- Canonical Supabase configuration is restored and `git diff --check` passes.

---
*Phase: 03-exact-money-and-rounding-contract*
*Completed: 2026-09-04*
