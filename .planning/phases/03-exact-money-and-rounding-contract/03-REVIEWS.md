---
phase: 03-exact-money-and-rounding-contract
reviewers: [gpt-5.6-terra, gpt-5.5, gpt-5.4]
reviewed_at: 2026-09-03T02:33:34Z
plans_reviewed:
  - 03-01-PLAN.md
  - 03-02-PLAN.md
  - 03-03-PLAN.md
  - 03-04-PLAN.md
  - 03-05-PLAN.md
  - 03-06-PLAN.md
  - 03-07-PLAN.md
status: green
current_high: 0
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

## Cycle 2 Re-review

The first revision closed H3 and M1–M4/M6, but two repository-grounded HIGH
concerns and two formal scope warnings remain.

### C2-H1 — The proposed `security_invoker` views cannot read after base-table revoke

PostgreSQL checks underlying-table privileges as the caller for a
`security_invoker` view. The revised plan both revokes authenticated
`public.invoices` `SELECT` and requires authenticated users to read that table
through `security_invoker` views, so the authorized read path is impossible.
Keep base-table access revoked and replace the views with narrowly granted
`SECURITY DEFINER` read RPCs that use an empty `search_path`, fully qualified
objects, caller-derived tenant/capability checks, string-only outputs, locked
ownership, and explicit ACL tests. Live tests must prove legitimate same-tenant
reads, cross-tenant denial, direct table denial, and safe string serialization.

### C2-H2 — Evidence inspection still depends on the old numeric automation helper

The accepted `20260901000004_billing_evidence_security.sql` migration defines
`private.billing_finalize_evidence_inspection` with a call to the old numeric
automation helper, and the Edge helper plus protected evidence tests exercise
that API. Keep the historical migration byte-identical, but require the later
Phase 3 migration to replace the surviving evidence-finalization definition so
it calls the exact helper with canonical zero money. Include
`supabase/tests/database/40_billing_evidence.sql`,
`tests/release/billing-evidence.test.ts`, and, if the response contract changes,
`supabase/functions/_shared/billingAuthorization.ts`. Prove success, identical
replay, conflicting-key rejection with unchanged evidence/audit/grant/execution
state, old-signature absence, and continued protected-target membership.

### C2-W1 — Plan 03 exceeds the formal scope threshold

Plan 03 owns 11 files and combines upgrade-runner changes with the atomic
database cutover and inherited caller migration. Split upgrade-proof work into
an earlier plan while keeping the migration, callers, and same-wave gate
coupling together in a dependent plan at or below the checker threshold.

### C2-W2 — Plan 04 exceeds the formal scope threshold

Plan 04 owns 12 files across live Supabase boundaries, FakeRest/preview parity,
and release coupling. Split the live Supabase boundary from FakeRest/preview
parity, preserving strict dependency order and same-plan protection for every
new money-bearing path and test.

## Cycle 2 Required Revision Outcome

Close C2-H1 and C2-H2, reduce every plan to no more than ten unique files, and
preserve the already closed H3/M1–M4/M6 contracts. Re-review must return no
BLOCKER/WARNING findings and `current_high=0` before the branch is green.

## Cycle 2 Planning Revision Closure

| Finding | Revised contract |
|---------|------------------|
| C2-H1 | Plan 04 replaces both exact and retained compatibility reads with narrowly granted caller-bound SECURITY DEFINER RPCs, keeps authenticated table/sequence access revoked, and Plan 05 proves same-tenant success, cross-tenant/direct/unsafe denial, full-range string serialization, closed pagination/filtering, and unchanged effects. |
| C2-H2 | Plan 03 pins `20260901000004_billing_evidence_security.sql` byte-identically. Plan 04 CREATE OR REPLACEs the surviving evidence helper/wrapper to consume canonical zero exact money and proves SQL/Edge success, identical replay, conflicting-key atomicity, old numeric signature absence, and protected membership. |
| C2-W1 | Upgrade-runner work is isolated in Plan 03. Dependent Plan 04 owns the atomic database/inherited-caller/coupling cutover at exactly ten unique files. |
| C2-W2 | Plan 05 owns live Supabase/types and Plan 06 owns FakeRest/preview, each at eight unique files in strict sequential waves. |

Previously closed H3 and M1–M6 remain explicit in Plans 01–07. This entry records
the targeted planning revision; execution and exact-head re-review remain
separate gates.

## Cycle 3 Re-review

The security, inherited-caller, gate-coupling, and plan-size findings are
closed. One formal BLOCKER and one independent MEDIUM compatibility finding
remain.

### C3-H1 — Invoice-save idempotency leaked in from Phase 5

Plan 06 asks for provider-identical handling of `same-key conflicting saves`,
but Plans 04–05 intentionally define no invoice-save idempotency key or request
fingerprint. Invoice draft business idempotency belongs to Phase 5 (`INV-01`).
Remove this behavior from Plan 06 and test only the already-defined exact save
success/rejection cases with unchanged effects after invalid input. Do not add
an invoice idempotency contract to Phase 3.

### C3-M1 — Legacy tax-rate compatibility can narrow exact accepted rates

The inherited `tax_rate numeric(5,2)` cannot represent the Phase 3 contract's
nine fractional percentage digits or examples such as `8.875%`. Plan 04 must
explicitly widen the non-authoritative legacy compatibility column/projection
to `numeric(12,9)` (0 through 100 inclusive), derive it exactly from the
canonical ratio, and have the compatibility read RPC emit a fixed-scale string.
Keep the submitted percentage text separately as D-07/D-10 evidence. Add
upgrade/registry/live RPC assertions for `8.875%` and `12.500%` without
narrowing or financial-version creation.

## Cycle 3 Required Revision Outcome

Close C3-H1 without expanding Phase 3, close C3-M1 across Plans 03–05 plus the
validation/source-audit contracts, preserve all prior closures, and re-review
until the formal checker reports no BLOCKER/WARNING issues and
`current_high=0`.

## Cycle 4 Convergence

Exact head reviewed: `a312ce1010286521b5aab0770b2e084e57c75cba`.

- Formal GSD plan checker: `VERIFICATION PASSED`.
- Independent `gpt-5.6-terra` lane: GREEN, HIGH 0, MEDIUM 0, LOW 0.
- Independent `gpt-5.4` lane: GREEN, HIGH 0, MEDIUM 0, BLOCKER/WARNING 0.
- C3-H1 closed: Phase 3 covers exact save success and invalid-input unchanged
  effects only; invoice draft idempotency remains Phase 5 `INV-01` scope.
- C3-M1 closed: legacy tax-rate compatibility is checked `numeric(12,9)`,
  derived exactly from the canonical ratio, emitted at fixed nine-decimal
  scale, and tested with `8.875000000` and `12.500000000` while submitted text
  remains separate evidence.

No HIGH, MEDIUM, BLOCKER, or WARNING planning concerns remain. Phase 3 planning
is green; execution remains unstarted and separately gated.

## Cycle 3 Planning Revision Closure

| Finding | Revised contract |
|---------|------------------|
| C3-H1 | Plans 04–06 now state that Phase 3 defines no invoice-save key or fingerprint. Supabase/FakeRest save coverage is exact valid success plus invalid-input rejection with unchanged invoice/audit effects; draft business idempotency and conflicting save reuse remain deferred to Phase 5 `INV-01`. |
| C3-M1 | Plans 03–05 now require the later migration to widen only the non-authoritative legacy `tax_rate` compatibility column/projection from `numeric(5,2)` to checked `numeric(12,9)`, derive it exactly from the canonical ratio, preserve submitted percentage evidence separately, and return fixed-nine-decimal RPC text. Upgrade registry/fingerprint and live RPC assertions cover `8.875% -> 8.875000000` and `12.500% -> 1/8` with submitted `12.500%` retained and no new financial version. |

All seven plans, waves, CALC-01/CALC-03 coverage, D-01–D-23 coverage, prior
H1–H3/M1–M6 and C2 closures, same-wave coupling, historical migration
immutability, and per-plan file limits remain unchanged. Exact-head Cycle 3
re-review remains the authority for updating review status or `current_high`.
