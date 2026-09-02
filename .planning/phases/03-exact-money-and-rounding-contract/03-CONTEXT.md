# Phase 3: Exact Money and Rounding Contract - Context

**Gathered:** 2026-09-02
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase gives every later billing workflow one exact, executable contract
for authoritative money, rates, serialization, and rounding. It introduces
USD minor-unit values, reduced rational rates, versioned rounding policies,
strict PostgreSQL/server/browser boundaries, an additive conversion path for
existing authoritative invoice data, and real/fake provider parity tests that
prove JavaScript floating-point values cannot become financial authority.

This phase does not implement agreement terms, monthly revenue evidence,
fixed/percentage/minimum/hybrid formulas, calculation-close snapshots, invoice
issuance, payments, or ledger behavior. It supplies the exact primitives those
later phases must use. Existing deal, project, and analytics amounts remain
informational CRM data unless a later approved migration explicitly promotes
them into the billing domain.

</domain>

<decisions>
## Implementation Decisions

### Authoritative Money

- **D-01:** Authoritative money is a signed integer count of minor units paired
  with an explicit currency. In v1 the only supported currency is `USD`, whose
  exponent is 2; unsupported or omitted currencies fail closed.
- **D-02:** PostgreSQL persists authoritative minor-unit amounts in checked
  signed `bigint` fields. Server and browser boundaries serialize the integer
  component as a canonical base-10 string so JSON and JavaScript `number`
  cannot silently change it.
- **D-03:** A money value is a typed object, not a bare scalar. Its canonical
  wire shape is equivalent to `{ amount_minor: "10888", currency: "USD" }`.
  Presentation formatting is one-way and may never be parsed back as authority.
- **D-04:** Every zero has one canonical form: integer zero with no negative
  sign. Money parsers reject missing currency, decimals, exponents, separators,
  whitespace, plus signs, unsafe JSON numbers, unsupported currency, and
  out-of-range persisted values.

### Exact Rates

- **D-05:** An authoritative rate is stored as a reduced numerator and positive
  denominator, not floating point. The persisted components are range-checked
  signed `bigint` values, the denominator cannot be zero, and mathematically
  equivalent inputs reduce to the same authoritative value.
- **D-06:** Users and external callers submit decimal percentage text only.
  Parsing is exact; internal numerator/denominator values are not hand-entered.
  The canonical wire value uses base-10 strings for both integer components.
- **D-07:** The system retains the submitted percentage text as non-authoritative
  audit/display evidence alongside the canonical ratio. Operators normally see
  the original percentage, with the reduced ratio available in explanations
  and audit detail.
- **D-08:** Rates have named kinds with versioned, kind-specific precision and
  bounds. An ordinary percentage rate is between 0% and 100% inclusive in v1;
  negative rates are rejected. Future rate kinds may define different bounds
  without weakening the ordinary-percentage contract.
- **D-09:** Agreement and calculation records embed the immutable canonical
  rate value and applicable policy versions. They do not point at a mutable
  shared rate registry.
- **D-10:** Inputs such as `12.5%` and `12.500%` are financially equal because
  both reduce to `1/8`. A formatting-only change is audited as presentation
  history but does not create a new financial formula or value version.

### Rounding Policy

- **D-11:** The v1 default tie rule is round half away from zero. The same rule
  applies symmetrically to negative adjustments: `+0.5` minor unit becomes
  `+1`, `-0.5` becomes `-1`, and an exact zero becomes canonical unsigned zero.
- **D-12:** Exact arithmetic does not round intermediate values. Rounding is
  allowed only at a policy-declared conversion into authoritative minor units;
  the policy name/version and currency exponent are explicit inputs to that
  conversion.
- **D-13:** Rounding policies are immutable, named, and versioned. Every later
  formula version binds to a specific policy version and currency exponent so
  a replay cannot inherit changed defaults.
- **D-14:** Exact intermediates may be wider than the persisted component range,
  using PostgreSQL exact numeric arithmetic and JavaScript `BigInt`-backed
  helpers. Division by zero, overflow at a persistence boundary, unsupported
  currency, excessive rate precision, or a policy mismatch returns a stable
  fail-closed error; values are never clamped, coerced, or estimated.

### Legacy Money Conversion

- **D-15:** Phase 3 converts only fields explicitly classified as authoritative
  billing data. The secured `public.invoices` amount, tax, total, tax-rate, and
  financially operative line-item values must be inventoried and migrated;
  unrelated CRM deal, project, and analytics metrics remain informational.
- **D-16:** Conversion uses expand-contract migrations: add minor-unit,
  currency, and exact-rate fields; deterministically backfill them; move all
  authoritative reads and writes to the new contract; and retain legacy decimal
  columns temporarily only as read-only compatibility projections. No in-place
  destructive rewrite or dual authority is allowed.
- **D-17:** The USD backfill may convert an exact legacy decimal amount only
  when multiplication by 100 produces an integer in range and the row has one
  unambiguous currency classification. A fractional-cent, contradictory
  currency, invalid/null-required value, malformed line item, or range failure
  stops the migration and identifies the affected row and reason. It may not
  round, skip, clamp, or guess.
- **D-18:** Migration proof includes immutable pre/post row counts, identifiers,
  mapping rules, and value fingerprints. Legacy columns may be removed only by
  a later approved contract release after every consumer and rollback path has
  proved the new representation.

### API, Runtime, and Provider Boundaries

- **D-19:** Canonical JSON uses explicit typed objects and canonical base-10
  strings for all authoritative integer components. A rate shape carries at
  least its kind, numerator, denominator, and policy/display evidence required
  by D-07 and D-08. Authoritative money or rate components are never JSON
  numbers or formatted locale strings.
- **D-20:** TypeScript uses branded boundary types plus a small, centralized
  exact-arithmetic module backed by `BigInt`. Application code cannot construct
  authoritative values without validation, and existing invoice helpers that
  use `number` must not remain an authoritative calculation path.
- **D-21:** Inbound integer text accepts only a narrow base-10 grammar and is
  canonicalized before use: redundant leading zeros are removed and `-0`
  becomes `0`. Exponents, commas, decimal points, surrounding whitespace, plus
  signs, and JSON numeric tokens are rejected rather than normalized.
- **D-22:** Supabase and FakeRest implement the same money, rate, parser,
  formatter, error, and serialization contracts. Shared fixtures must exercise
  both providers; FakeRest cannot use looser demo-only financial behavior.
- **D-23:** Acceptance includes golden boundary cases, property tests, JSON
  round trips, overflow and malformed-input cases, signed tie cases, and live
  PostgreSQL migration/function tests. Tests must demonstrate that a
  floating-point input cannot enter, persist, or reappear as an authoritative
  value.

### Agent Discretion

The agent may choose type and module names, PostgreSQL domain/helper layout,
stable error-code names, property-testing library, compatibility-view names,
migration split, and internal normalization algorithms. Those choices may not
weaken string-safe boundaries, reduced-ratio equality, signed-bigint checks,
explicit USD currency, versioned half-away-from-zero rounding, fail-closed
legacy conversion, provider parity, or live PostgreSQL proof.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and acceptance contract

- `.planning/PROJECT.md` — core value plus the precision, auditability,
  fail-closed, expand-contract, and USD-first constraints.
- `.planning/REQUIREMENTS.md` — CALC-01 and CALC-03 acceptance checks and the
  explicit deferral of multi-currency/international rails.
- `.planning/ROADMAP.md` — Phase 3 boundary, dependencies, goal, and observable
  success criteria.
- `.planning/STATE.md` — completed Phase 2 foundation and current Phase 3 focus.
- `AGENTS.md` — repository architecture, Supabase/FakeRest parity, commands, and
  implementation conventions.

### Inherited security and release authority

- `.planning/phases/01-executable-financial-test-and-release-gate/01-CONTEXT.md`
  — protected financial test and staged promotion contract.
- `.planning/phases/01-executable-financial-test-and-release-gate/01-10-SUMMARY.md`
  — accepted release workflow and receipt implementation.
- `.planning/phases/01-executable-financial-test-and-release-gate/01-VERIFICATION.md`
  — verified Phase 1 controls that Phase 3 must continue to satisfy.
- `.planning/phases/02-tenant-role-and-evidence-security/02-CONTEXT.md` —
  server-derived tenant authority, append-only audit, real PostgreSQL proof,
  and shared provider contracts inherited by financial types.

### Existing financial representation to replace or adapt

- `src/components/atomic-crm/invoices/invoiceCalculations.ts` — current
  `number`-based line-item and tax helpers; authoritative use must move to the
  exact module.
- `src/components/atomic-crm/invoices/invoiceCalculations.test.ts` — current
  fractional-number expectations that need exact boundary and policy fixtures.
- `supabase/migrations/20260305000004_add_invoices_table.sql` — inherited
  decimal invoice columns, JSON line-item convention, and implicitly rounded
  tax trigger requiring expand-contract treatment.
- `supabase/migrations/20260901000002_billing_invoice_boundary.sql` — secured
  invoice/account migration whose tenant and trigger-preservation behavior must
  remain intact.

### Architecture and verification patterns

- `.planning/codebase/ARCHITECTURE.md` — frontend/provider/database boundaries
  where exact values travel.
- `.planning/codebase/TESTING.md` — Vitest, local Supabase, migration, and
  provider test surfaces.
- `.planning/codebase/CONVENTIONS.md` — established TypeScript, migration, and
  naming conventions.
- `src/components/atomic-crm/providers/` — Supabase and FakeRest adapters that
  must expose identical exact-value contracts.
- `supabase/tests/` — real PostgreSQL/Auth test harness for conversion,
  constraints, functions, and boundary proof.
- `tests/release/` — protected-path and release checks that must classify the
  Phase 3 financial surface.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- The Phase 1 local PostgreSQL 17 and migration harness can execute exact
  backfill, constraint, function, and rollback tests rather than relying on SQL
  source inspection.
- Phase 2's billing-account schema, forced-RLS resources, audit vocabulary, and
  common Supabase/FakeRest contract fixtures provide the secure boundary on
  which exact financial values can be added.
- Existing invoice calculation tests provide recognizable examples, but their
  `number` inputs and fractional outputs are regression targets to replace.

### Established Patterns

- Financial migrations are additive, fail closed on ambiguous data, retain
  immutable proof, and run through the six protected release identities.
- Supabase is authoritative in production while FakeRest must mirror its
  externally observable contract for demos and UI tests.
- Browser capability checks are presentation-only; exactness and validation
  must be enforced again at the server and PostgreSQL boundaries.

### Integration Points

- New shared TypeScript types/parsers/formatters connect invoice UI and both
  providers without exposing raw `BigInt` to JSON.
- New PostgreSQL types, constraints, functions, and additive invoice columns
  connect the exact contract to the secured Phase 2 billing tables.
- Existing invoice triggers and calculation utilities must either delegate to
  the exact policy implementation or be removed from authoritative paths.
- Protected release classification must include every new financial type,
  migration, helper, provider adapter, and test fixture.

</code_context>

<specifics>
## Specific Ideas

- `12.500%` parses exactly to reduced ratio `1/8`; the submitted text remains
  display evidence, while `12.5%` compares as the same financial value.
- `8.875%` parses to `71/800`. Applying it to `$100.00` produces an exact
  intermediate of 887.5 cents, then the named v1 policy yields 888 cents.
- The signed tie fixtures should include both `+0.5 -> +1` and `-0.5 -> -1`,
  plus normalization of every zero result to `0`.
- Migration exception evidence should identify the table, stable row identity,
  field, and reason without copying sensitive record contents into logs.
- Phase 3 is primarily a data-contract and developer-facing foundation. It does
  not require a new screen; if implementation changes rendered invoice UI, the
  normal source/preview/production surface receipts apply.

</specifics>

<deferred>
## Deferred Ideas

- Fixed, percentage, minimum-support, and hybrid agreement formulas,
  calculation snapshots, previews, and replay behavior belong to Phase 4.
- Invoice issuance, correction documents, balances, and explanation packages
  belong to Phase 5.
- Payment commands, fees, refunds, returns, disputes, payouts, reconciliation,
  and ledger facts belong to later payment and reconciliation phases.
- Multiple currencies, non-USD exponents, international rails, and jurisdiction-
  specific tax/legal policy remain outside v1.
- Promoting legacy deal, project, or analytics amounts into authoritative
  billing data requires a separately scoped and approved migration.

</deferred>

---

*Phase: 03-exact-money-and-rounding-contract*
*Context gathered: 2026-09-02*
