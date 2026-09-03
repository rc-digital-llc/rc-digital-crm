---
phase: 03-exact-money-and-rounding-contract
reviewers: [gpt-5.6-terra, gpt-5.5, gpt-5.4]
reviewed_at: 2026-09-03T01:18:14Z
plans_reviewed:
  - 03-01-PLAN.md
  - 03-02-PLAN.md
  - 03-03-PLAN.md
  - 03-04-PLAN.md
  - 03-05-PLAN.md
status: revise
current_high: 3
---

# Cross-Model Plan Review — Phase 3

Three independent repository-grounded review lanes evaluated the exact PR head
`5a61426b91daaf35a97c6ddbe516b9c85282d3bf`. This artifact consolidates the
actionable findings for a planning-only revision; no Phase 3 implementation is
part of this review cycle.

## HIGH Concerns

### H1 — Direct invoice table access can bypass the string-only wire boundary

Phase 2 grants authenticated base-table access to `public.invoices`. A direct
PostgREST write lets PostgreSQL coerce a JSON number before a trigger can prove
that the original token was a string, while a direct read can expose `bigint`
components as JSON numbers. Plan 03 must retire authenticated base-table
`SELECT`, `INSERT`, and `UPDATE` for authoritative invoice fields, replace reads
with a tenant-safe security-invoker projection that casts exact integers to
canonical text, and replace writes with a narrow JSONB RPC that checks
`jsonb_typeof(...) = 'string'` before casting. Plan 04 must prove denied direct
table access and unchanged effects for numeric-token attempts over live HTTP.

### H2 — The exact RPC cutover omits inherited callers and protected tests

The plans revoke the old numeric automation signature without owning every
current caller. Plan 03 must inventory and migrate the live definitions and
tests that use the old contract, including
`supabase/tests/database/35_billing_automation.sql`,
`supabase/tests/support/billing-security-fixtures.sql`,
`tests/release/replay-concurrency.test.ts`, and
`tests/release/billing-tenancy.test.ts`. Historical accepted migration files
must remain byte-identical; the new migration must replace surviving function
definitions instead of rewriting history. Acceptance must cover exact JSON
requests, revised ACL/signature assertions, counters/effects, sequential and
concurrent replay, and denial of the old numeric signature.

### H3 — Money-bearing paths are coupled to the protected gate too late

Plan 05 defers classifier, Makefile, and static coupling until after earlier
waves introduce exact money code and tests. The first wave that creates a new
money-bearing path must also classify it and make its focused tests
non-optional. Each later wave must add its new database/provider/replay tests to
the protected target in the same plan that creates them. Plan 05 should remain
the final integrated coupling audit rather than the first point where the
paths become protected.

## MEDIUM Concerns

### M1 — Per-wave verification can skip the new pgTAP files

Plans 02 and 03 invoke `make test-financial-database-sql`, but the current list
does not contain the planned `60_exact_financial_primitives.sql` or
`65_exact_billing_conversion.sql`. Add each file to the protected Make target in
the plan that introduces it, or invoke the named file explicitly through the
isolated runner before accepting that wave. Preserve Plan 05 as permanent
coupling proof.

### M2 — Full `bigint` authority conflicts with the legacy `numeric(15,2)` projection

The current invoice decimal columns cannot represent every signed-`bigint`
minor-unit value. Preserve full signed-`bigint` authority by explicitly
widening or replacing the read-only compatibility projection so every accepted
exact value is representable. Add endpoint and projection-overflow tests; do
not silently narrow, clamp, or create a second authority.

### M3 — Raw input length limits are promised but not concrete

Define pre-parse ASCII length limits for canonical/accepted integer and decimal
percentage text before `BigInt`, `numeric`, or `bigint` construction. Require
matching TypeScript, PostgreSQL, and live HTTP tests with stable non-reflective
errors for overlong payloads.

### M4 — The canonical exact line-item schema is underspecified

Name one post-cutover line-item wire and persistence shape, including exact
field names for the quantity ratio, unit-price money, extended/rounded money,
currency, and policy identity. Specify how legacy `rate` maps to `unit_price`
and whether the original legacy payload is retained only as immutable evidence.
Plans 03 and 04 must test both legacy conversion and canonical provider/runtime
round trips.

### M5 — Automation replay equality and signed-input rules need explicit proof

Require an immutable canonical request fingerprint covering the principal,
grant/command tuple, canonical money/currency, policy identity, and idempotency
key. Identical retries return the recorded result; conflicting key reuse fails
closed with no counter or effect change. Generic money remains signed, but
automation grant limits, executions, and command amounts must be explicitly
non-negative, with sequential and concurrent rejection tests.

### M6 — D-10 presentation history needs a bounded implementation contract

Keep the locked D-10 decision, but prevent it from expanding into agreement or
calculation versioning. Store submitted percentage text as non-authoritative
evidence and use the existing append-only billing audit mechanism for a
formatting-only presentation event. Defer financial formula/version semantics
to Phase 4.

## Agreed Strengths

- The wave order—TypeScript authority, PostgreSQL enforcement, legacy
  conversion, provider parity, and release proof—is coherent.
- Signed half-away ties, strict string JSON, reduced rational rates, full-range
  boundaries, fail-closed conversion, and immutable fingerprints are strongly
  specified.
- The phase correctly excludes agreements, invoice issuance, payments, Stripe,
  charging, reconciliation, and ledger behavior.

## Required Revision Outcome

Address H1–H3 and M1–M6 through planning artifacts only. A re-review is green
only when no HIGH concerns remain and deterministic plan checks confirm every
new money-bearing path and test is coupled in the same wave that introduces it.
