---
phase: 02-tenant-role-and-evidence-security
plan: "02"
subsystem: database
tags: [supabase, migrations, upgrade, invoices, rls, fingerprints]

requires:
  - phase: 02-tenant-role-and-evidence-security
    plan: "01"
    provides: billing organization/account/role/audit kernel
  - phase: 01-executable-financial-test-and-release-gate
    plan: "03"
    provides: immutable pre-financial baseline and live upgrade fingerprints
provides:
  - deterministic invoice-to-billing-account backfill
  - capability-bound forced RLS for inherited invoices
  - numbered append-only transformation registry with semantic invariants
  - exact preservation proof for monetary, provider, ownership, and business facts
affects: [03-invoice-calculation, 04-revenue-evidence, 05-provider-commands, 08-customer-portal]

tech-stack:
  added: []
  patterns: [expand-validate-contract migration, deterministic UUID derivation, chained fingerprint registry, semantic upgrade assertions]

key-files:
  created:
    - supabase/migrations/20260901000002_billing_invoice_boundary.sql
    - supabase/tests/upgrades/002-billing-tenancy/expected-transformations.json
  modified:
    - scripts/release/fingerprint-upgrade.mjs
    - tests/release/migration-upgrade.test.ts

key-decisions:
  - "Historical invoice accounts use deterministic company-derived UUIDs so representative upgrade hashes remain repeatable."
  - "Invoice compatibility roles are narrow account-scoped operator assignments; legacy sales ownership remains immutable."
  - "Accepted baseline 001 stays byte-identical while registry 002 chains exact final hashes and executable semantic invariants."

patterns-established:
  - "Upgrade authorization: numbered registries may name only known fingerprint categories, ordered migrations, chained before/after hashes, and implemented invariant IDs."
  - "Financial backfill: disable only known value-mutating triggers during key population, validate exact mappings, then add NOT NULL/FKs/RLS."

requirements-completed: [SEC-01, SEC-02, SEC-03, SEC-06]

duration: 10min
completed: 2026-09-01
---

# Phase 2 Plan 02: Invoice Tenant Boundary Summary

**Inherited invoices deterministically bound to billing accounts with capability RLS and an exact, semantic live-upgrade receipt**

## Performance

- **Duration:** 10 min
- **Started:** 2026-09-01T14:31:00-07:00
- **Completed:** 2026-09-01T14:41:00-07:00
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added deterministic organization/account keys to every inherited invoice and validated responsible owner plus compatibility-role mappings before constraints committed.
- Replaced salesperson-only and delete-capable invoice policies with explicit `invoice.*` capabilities, forced RLS, immutable ownership scope, least-privilege grants, and append-only audit events.
- Added ordered transformation-registry validation that rejects stale/missing/unknown/overlapping hashes, invariant names, migrations, or registry fields.
- Proved invoice count, numeric text, provider text, legacy ownership, and complete business facts remain exact while tenant keys/FKs and least-privilege grants become enforced.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend upgrade proof with an append-only transformation registry** - `93c55f25` (feat)
2. **Task 2: Backfill and constrain invoice tenant ownership** - `6b26c0e3` (feat)

## Files Created/Modified

- `supabase/migrations/20260901000002_billing_invoice_boundary.sql` - Expand/backfill/validate/contract migration, invoice capabilities, RLS, audit, and grants.
- `supabase/tests/upgrades/002-billing-tenancy/expected-transformations.json` - Exact three-category transform and nine semantic invariants.
- `scripts/release/fingerprint-upgrade.mjs` - Registry loader, schema validator, semantic snapshots, and post-upgrade assertions.
- `tests/release/migration-upgrade.test.ts` - Negative registry validation and ordered acceptance contracts.

## Decisions Made

- Derived inserted account UUIDs from a namespaced company identifier. This is identity determinism, not cryptography, and prevents random UUIDs from making accepted fingerprints irreproducible.
- Aborted companies with multiple historical invoice owners rather than guessing one responsible owner.
- Added distinct `invoice.read/create/update` capabilities; customer contacts do not receive invoice access implicitly through `account.read`.

## Deviations from Plan

None - plan executed as specified.

## Issues Encountered

- The first live upgrade correctly failed with the three previously unregistered changed hashes. Their hash-only candidates were recorded in registry 002, after which the complete proof passed.

## User Setup Required

None - all execution used disposable loopback Supabase projects and the protected dashboard project was not touched.

## Next Phase Readiness

- Every inherited invoice now has non-null organization/account ownership and capability-bound RLS, ready for later calculation and provider workflows.
- Upgrade receipt: preserved row identity, ownership, numeric text, and queryability; exact approved changes to row shape, constraints, and grants; nine semantic invariants passed; receipt hash `6df57ecc2f74c978108219040691750eeeedbb3ee32bdb8ec600496bddf65ae8`.
- Clean schema receipt: 35 migrations through `20260901000002`, hash `da994803baebf6e44389c340c085bee326948c40c1d751050cfe4063575ea221`.

---
*Phase: 02-tenant-role-and-evidence-security*
*Completed: 2026-09-01*
