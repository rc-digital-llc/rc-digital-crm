# Phase 3: Exact Money and Rounding Contract - Research

**Researched:** 2026-09-02
**Domain:** Exact financial arithmetic across TypeScript, PostgreSQL, PostgREST, and FakeRest
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01 through D-04:** Money is signed integer minor units plus explicit USD,
  stored as checked PostgreSQL `bigint`, serialized as canonical integer text,
  and rejected when malformed, numeric JSON, unsupported, or out of range.
- **D-05 through D-10:** Percentage text parses exactly into a reduced rational
  with positive denominator, named kind and versioned bounds/precision. Original
  percentage text remains non-authoritative evidence; embedded canonical values
  are immutable and formatting-only changes are not financial changes.
- **D-11 through D-14:** `half-away-from-zero-v1` is explicit and symmetric,
  rounds only at a declared minor-unit boundary, uses exact wider intermediates,
  and fails closed on policy mismatch, division by zero, or persistence overflow.
- **D-15 through D-18:** Only authoritative billing fields migrate through an
  additive expand-contract path. Ambiguous, fractional-minor-unit, malformed, or
  out-of-range rows stop with row-scoped exceptions. Immutable before/after
  fingerprints prove the transform; legacy columns remain read-only projections
  until a later approved contract release.
- **D-19 through D-23:** Money/rate JSON components are strings, TypeScript uses
  branded validated types and `BigInt`, Supabase/FakeRest are identical, and
  boundary/property/round-trip/live PostgreSQL tests prove floating point cannot
  enter or reappear as authority.

### Agent Discretion Applied

- Name the v1 catalogs `usd-v1`, `ordinary-percentage-v1`, and
  `half-away-from-zero-v1`.
- Limit ordinary percentage input to at most nine fractional decimal digits.
  This comfortably covers current tax/commission needs while keeping the v1
  input contract explicit. Exact reduction occurs before persisted range checks.
- Use dependency-free deterministic property loops in Vitest rather than adding
  a property-testing package.
- Represent financially operative quantities in migrated line items as reduced
  exact ratios; represent unit and extended values as typed money objects.
- Use narrowly granted, caller-bound SECURITY DEFINER read/write RPCs for wire
  shapes after base-table revocation; do not rely on a security-invoker view or
  expose authoritative `bigint` columns as untyped JSON numbers.

### Deferred Ideas (OUT OF SCOPE)

- Agreement formulas, revenue periods, calculation snapshots, invoice issuance,
  payments, ledger facts, and multi-currency behavior remain in later phases.
- Removing legacy decimal columns is a later approved contract release.
- Deal, project, and analytics values remain informational CRM data.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CALC-01 | Integer minor-unit money, explicit currency, and exact non-floating rates across every authoritative boundary. | Checked `bigint`, reduced ratios, canonical string JSON, branded TypeScript values, exact line items, provider parity, and live rejection tests. |
| CALC-03 | Explicit named/tested rounding for fractional minor units, ties, negative adjustments, and currency boundaries. | Immutable policy catalogs plus matching PostgreSQL/BigInt half-away algorithms and signed golden/property cases. |

</phase_requirements>

## Summary

The repository has two current sources of financial authority that Phase 3 must
convert. `public.invoices` stores amount/tax/total as `numeric(...,2)`, tax rate
as `numeric(5,2)`, and financially operative line items in unconstrained JSON.
Its trigger calculates with PostgreSQL decimal arithmetic, while the browser
preview duplicates that behavior with JavaScript `number` and can return a
fractional cent. Separately, billing automation grants and executions store
amount limits/counters/effects as `numeric(20,2)` and accept a `numeric` RPC
argument. The latter is a real authorization boundary: an imprecise caller value
could affect whether an action is allowed. [VERIFIED: codebase]

PostgreSQL `bigint` is the correct persistence boundary for minor units because
it is a signed eight-byte whole-number type and rejects overflow. PostgreSQL
`numeric` remains appropriate only for wider exact intermediate arithmetic.
PostgreSQL also documents that `round(numeric)` breaks ties away from zero, but
the project should still implement and name the algorithm explicitly so policy
identity is part of replay rather than an ambient database default. [CITED:
https://www.postgresql.org/docs/17/datatype-numeric.html] [CITED:
https://www.postgresql.org/docs/17/functions-math.html]

JavaScript `number` is unsafe for the full PostgreSQL `bigint` range: the safe
integer limit is `2^53 - 1`, beyond which distinct integers can compare equal.
Native `BigInt` provides exact integer arithmetic, but default JSON serialization
throws. Therefore the canonical wire representation must contain integer strings
and conversion must happen in a centralized validated codec, never by coercing a
`BigInt` to `number`. `Intl.NumberFormat` can format `BigInt` directly for display,
so presentation does not need to round-trip through floating point. [CITED:
https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/MAX_SAFE_INTEGER]
[CITED: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt]
[CITED: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Internationalization]

**Primary recommendation:** build and prove the shared TypeScript codec first;
install a matching PostgreSQL kernel and immutable policy catalogs second; then
perform one coordinated expand-contract conversion of invoices, line items, and
automation amount authority; finally switch Supabase/FakeRest and invoice preview
to string-only exact boundaries and couple all new tests into existing blocking
financial lanes.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Persistence range and currency | PostgreSQL | migration tests | Checked `bigint` and USD constraints are the final stored authority. |
| Percentage parsing | shared TypeScript codec + PostgreSQL RPC helper | provider tests | Browser ergonomics and server defense use the same grammar/golden fixtures. |
| Exact calculation | PostgreSQL `numeric` intermediate / TypeScript `BigInt` ratio | pgTAP/Vitest | Both remain exact; only the named boundary rounds to `bigint`. |
| JSON contract | caller-bound SECURITY DEFINER RPC | Supabase provider | Base-table access stays revoked; manual caller capability predicates and explicit `::text` output prevent privilege and numeric-token bypass. |
| Demo contract | FakeRest provider | shared fixtures | FakeRest must reject and normalize exactly as production does. |
| Legacy conversion | additive migrations | upgrade fingerprint runner | The migration blocks on ambiguity and fingerprints every intentional transform. |
| Release authority | existing protected financial workflows | release receipts | Local proof never substitutes for exact-head checks or protected schema promotion. |

## Standard Stack

### Core

| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| PostgreSQL | 17 test target | `bigint` persistence, exact `numeric` intermediates, constraints/functions | Existing authoritative database and local migration lanes. |
| TypeScript | 5.8.x | Branded boundary types and compiler enforcement | Already used by the app/providers. |
| JavaScript `BigInt` | Node 22 CI/browser baseline | Exact runtime integers and ratios | Native, dependency-free, full required range. |
| Vitest | 3.2.4 | Golden, grammar, property, provider, and JSON round-trip tests | Existing fast/release test framework. |
| pgTAP + Supabase CLI | CLI 2.116.0 in CI | Live constraints, helpers, migration, REST/RPC proof | Existing blocking financial lanes. |

### Supporting

| Component | Purpose | When to Use |
|-----------|---------|-------------|
| `Intl.NumberFormat` | One-way USD display from exact integers | Presentation only; never parse output. |
| Zod 4 | Optional outer object-shape validation | Reuse only if it simplifies provider request validation; exact integer grammar still belongs in the financial codec. |
| Existing transformation registries | Immutable before/after upgrade authorization | Add numbered Phase 3 categories/invariants without editing accepted baselines. |
| Existing release path classifier | Route changes to all blocking financial identities | Extend narrowly for the new financial module/tests. |

No new package is required. [VERIFIED: `package.json` and local runtime]

## Recommended Exact Contract

### TypeScript and wire shapes

```ts
type CanonicalIntegerText = string & { readonly __brand: unique symbol };
type UsdMoney = Readonly<{
  amount_minor: CanonicalIntegerText;
  currency: "USD";
}>;
type OrdinaryPercentageRate = Readonly<{
  kind: "ordinary_percentage";
  numerator: CanonicalIntegerText;
  denominator: CanonicalIntegerText;
  input: string;
  policy_version: "ordinary-percentage-v1";
}>;
```

The codec accepts objects, not scalars. It validates the JSON token type before
constructing `BigInt`, canonicalizes leading zeros and signed zero, checks the
PostgreSQL signed-`bigint` range at persistence boundaries, and returns stable
codes such as `FINANCIAL_INVALID_INTEGER`, `FINANCIAL_UNSUPPORTED_CURRENCY`,
`FINANCIAL_RATE_OUT_OF_BOUNDS`, `FINANCIAL_POLICY_MISMATCH`, and
`FINANCIAL_OVERFLOW`. Error details must not repeat the raw input.

### Percentage parsing

For percentage text `whole.fraction%`, remove the suffix, parse decimal digits as
an integer `scaled`, and form `scaled / (100 * 10^fractionDigits)`. Reduce with
`gcd(abs(numerator), denominator)`, normalize a zero numerator to denominator 1,
require 0% through 100%, and persist only when both reduced components fit signed
`bigint` (denominator positive). Examples:

- `12.500% -> 12500 / 100000 -> 1 / 8`
- `8.875% -> 8875 / 100000 -> 71 / 800`
- `0.000% -> 0 / 1`
- `100.000000000% -> 1 / 1`

### Rounding

For signed numerator `n` and positive denominator `d`, compute quotient and
remainder from absolute values, increment the absolute quotient when
`2 * remainder >= d`, then restore the sign. Exact divisions do not round.
Canonicalize a zero result to `0`. This makes the policy explicit and portable:

- `1 / 2 -> 1`
- `-1 / 2 -> -1`
- `1 / 3 -> 0`
- `-1 / 3 -> 0`
- `10000 * 71 / 800 -> 888` minor units

PostgreSQL's documented numeric behavior agrees with the chosen tie rule, but
the helper must validate the named policy and currency exponent instead of
calling an unversioned ambient default. [CITED:
https://www.postgresql.org/docs/17/functions-math.html]

## Recommended Database Model

### Immutable policy catalogs

- `financial_currency_policies`: `usd-v1`, currency `USD`, exponent 2.
- `financial_rate_policies`: `ordinary-percentage-v1`, kind, min/max ratio,
  maximum nine fractional percentage digits.
- `financial_rounding_policies`: `half-away-from-zero-v1`, currency-policy key,
  tie rule, effective version metadata.
- Revoke browser DML; use an immutable trigger and catalog tests. Later formula
  records embed values and policy versions rather than foreign-keying to a
  mutable default.

### Private helpers and public boundary objects

- Private exact GCD/ratio normalization, strict JSON string extraction, checked
  `bigint` conversion, percentage parsing, and signed rational rounding helpers.
- Empty `search_path`, fully qualified objects, explicit ACLs, and no generic
  browser execute on private helpers.
- Narrow caller-bound SECURITY DEFINER RPC results use `::text` for every
  integer wire component. They use empty `search_path`, fully qualified objects,
  locked owner/ACL, closed bounded list/get inputs, fixed query branches, and a
  caller-derived capability predicate on every selected/count row. A
  security-invoker view is not usable once authenticated base-table privilege is
  revoked. [CITED: https://docs.postgrest.org/en/stable/references/api.html]
- Live HTTP tests—not source inspection—must prove maximum/minimum `bigint` values
  arrive as JSON strings and numeric JSON request tokens are denied.

### Authoritative conversion inventory

| Source | Exact additions | Legacy disposition |
|--------|-----------------|--------------------|
| `public.invoices.amount` | `amount_minor bigint`, `currency text` | Read-only decimal projection after cutover. |
| `tax_rate` | reduced numerator/denominator, input evidence, rate-policy version | Read-only decimal projection. |
| `tax_amount`, `total_amount` | `*_minor bigint` plus rounding-policy version | Read-only decimal projections derived from exact fields. |
| `line_items` | exact JSON: reduced quantity ratio and typed money objects | Original JSON retained as compatibility evidence; malformed/ambiguous rows block. |
| `billing_automation_grants.max_amount` | `max_amount_minor bigint`, currency/policy | Legacy numeric projection; exact field is authority. |
| `total_amount_consumed` | `total_amount_consumed_minor bigint` | Derived projection only. |
| `billing_automation_executions.amount` | `amount_minor bigint`, currency | Append-only exact effect; derived projection only. |
| automation command RPC | typed money JSON with string minor units | Numeric signature revoked/dropped; cannot remain an authority path. |

Project/deal/analytics numerics are explicitly excluded. [VERIFIED: codebase and
CONTEXT.md D-15]

## Expand-Contract Sequence

1. Add nullable exact columns/catalogs/helpers without changing old reads.
2. Validate every row into a temporary exception inventory containing only table,
   stable row ID, field/path, and reason code. Any exception raises and rolls back.
3. Backfill money only when `legacy_numeric * 100` is integral and in range.
4. Parse rate text exactly and reduce it. Convert line items only when each
   quantity/rate/amount has one documented meaning and reconciles with row totals.
5. Backfill automation limits/counters/effects using the same USD rule.
6. Add NOT NULL/check/reconciliation constraints; switch trigger/RPC/provider
   authority to exact fields; make legacy fields generated/trigger-maintained
   read-only compatibility projections.
7. Fingerprint row count, stable IDs, exact pre-value text, exact post wire values,
   mappings, constraint definitions, and function/ACL identities.
8. Keep old columns until a later approved removal after consumer and rollback
   proof. Do not introduce dual-write authority.

The accepted baseline is immutable. Add a numbered `003-exact-money` registry
and extend the runner's allowlisted categories/invariants rather than editing
baseline 001 or the Phase 2 registry. [VERIFIED: codebase]

## Architecture Patterns

### Pattern 1: Parse at every trust boundary

Client validation improves errors, but PostgreSQL must independently reject JSON
numbers, missing currency, unsupported policy versions, noncanonical integer
text, and range overflow. A service-role caller does not waive exactness.

### Pattern 2: Separate exact intermediate from persistence boundary

Use arbitrary-width `BigInt` expressions in TypeScript and unconstrained exact
`numeric` inside PostgreSQL helpers. Check signed-`bigint` only when creating an
authoritative stored or wire value. This prevents intermediate overflow without
silently widening the persistence contract.

### Pattern 3: Compatibility is a projection, never a second authority

Exact fields drive inserts, updates, totals, limits, and responses. Legacy decimal
columns can be generated/maintained from exact fields for old readers, but legacy
input is rejected after cutover. A trigger that accepts both old and new values
would create ambiguous dual authority and is prohibited.

### Pattern 4: Shared golden vectors plus independent implementations

TypeScript and PostgreSQL algorithms should not call each other in unit tests.
They consume the same human-readable vectors and are compared again through live
HTTP/provider tests. Independent implementations plus end-to-end parity detect
drift more effectively than one implementation testing itself.

### Pattern 5: Stable error codes, safe diagnostics

Migration exceptions identify `table`, `id`, `field/path`, and reason code. Runtime
responses expose stable codes but not raw payloads. Logs/audit events record policy
identity and result, not malformed input or sensitive row content.

## Recommended Project Structure

```text
src/components/atomic-crm/financial/
  exactMoney.ts
  exactMoney.test.ts
  exactFinancialFixtures.ts
  exactProviderContract.test.ts
src/components/atomic-crm/invoices/
  invoiceCalculations.ts
  invoiceCalculations.test.ts
supabase/migrations/
  20260902000001_exact_financial_primitives.sql
  20260902000002_exact_billing_expand.sql
supabase/tests/database/
  60_exact_financial_primitives.sql
  65_exact_billing_conversion.sql
supabase/tests/upgrades/003-exact-money/
  expected-transformations.json
tests/release/
  exact-money-boundaries.test.ts
  exact-money-release-static.test.ts
```

Names may be adjusted during implementation if existing conventions require it,
but ownership and test placement should stay equivalent.

## Anti-Patterns to Avoid

- `Math.round`, `toFixed`, multiplication by 100 on a JavaScript `number`, or
  parsing formatted currency in an authoritative path.
- Emitting PostgreSQL `bigint` directly as an assumed-safe JSON number.
- Globally patching `BigInt.prototype.toJSON`; it hides boundary mistakes.
- Accepting both numeric and string JSON "for compatibility."
- Storing a mutable rate/policy foreign key as the only calculation evidence.
- Rounding a fractional legacy cent during migration.
- Treating an empty production table as permission to skip schema/RPC proof.
- Editing accepted baseline hashes or widening a transformation allowlist.
- Leaving the old numeric automation RPC executable after exact cutover.

## Runtime State Inventory

| Existing state | Classification | Phase 3 action |
|----------------|----------------|----------------|
| Invoice decimal columns and calculation trigger | authoritative legacy | Expand, validate, backfill, cut over, retain projections. |
| Invoice `line_items` JSON | authoritative legacy but weakly typed | Validate/reconcile and convert to exact typed JSON; block ambiguity. |
| Browser invoice calculation helpers | unsafe preview authority | Replace signatures/returns with exact objects and `BigInt` helpers. |
| Automation amount limits/counters/effects | authoritative security boundary | Convert with invoices; change command signature to typed string JSON. |
| Deal/project/analytics numerics | informational | Leave unchanged. |
| FakeRest billing data | contract test surface | Add exact fixtures and identical rejects/normalization. |
| Phase 1/2 financial lanes | release authority | Extend, never rename or weaken. |

## Common Pitfalls

### PostgreSQL exactness does not make JSON safe

The database may store an exact `bigint`, while a JSON consumer parses an unsafe
numeric token into `number`. Explicit text projection plus live HTTP round-trip
tests are mandatory. Supabase's own Edge Function database example stringifies
`bigint` before JSON response, which supports this boundary choice. [CITED:
https://supabase.com/docs/guides/functions/connect-to-postgres]

### PostgreSQL division/truncation differs by operand type

Keep helper operands explicitly `numeric` for wider exact intermediates and
implement the signed quotient/remainder policy deliberately. Catalog and golden
tests must catch accidental integer truncation or `double precision` promotion.

### Legacy line-item meaning may be ambiguous

The original migration comment shows numeric examples, while accepted baseline
fixtures use decimal strings. The migration must validate actual JSON token types
and reconciliation. It may not infer whether an unlabelled value means dollars or
cents. Ambiguous rows block with a safe row/path reason.

### Exact columns can still become dual authority

If PostgREST accepts both `amount` and `amount_minor`, clients can submit
contradictions. RLS alone does not solve this. Writes should go through one
validated exact contract; compatibility columns are not writable inputs.

### Full `bigint` range and negation

The minimum signed value has no positive signed-`bigint` counterpart. TypeScript
may use arbitrary-width `BigInt` for absolute-value math, but persistence checks
must cover both `-9223372036854775808` and `9223372036854775807` explicitly.

## Local Empirical Findings

At the planning head:

- `Number.MAX_SAFE_INTEGER + 1 === Number.MAX_SAFE_INTEGER + 2` is `true`.
- Parsing JSON token `9223372036854775807` produces `9223372036854776000`.
- `JSON.stringify({ value: 1n })` throws `TypeError`.
- `Intl.NumberFormat` formats both signed-`bigint` endpoints without converting
  them to `number`.

These are diagnostic observations, not a substitute for committed tests.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node | Vitest/build/scripts | yes | 26.8.1 local; CI targets 22 | CI Node 22 is release authority. |
| npm | locked install/tests | yes | 12.0.2 | `npm ci` in CI. |
| Supabase CLI | local database/migration lanes | yes | 2.116.0 | Pinned same version in current financial workflow. |
| PostgreSQL/Supabase stack | pgTAP/REST/RPC | available through isolated runner | PostgreSQL 17 lane | Runner owns lifecycle and safe loopback target. |
| New arithmetic library | not required | n/a | n/a | Native `BigInt`. |

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Unit/property framework | Vitest 3.2.4 with deterministic seeded loops |
| Database framework | pgTAP through isolated Supabase CLI lane |
| Boundary framework | Vitest against live local Auth/PostgREST/RPC |
| Quick run | `npm test -- --run src/components/atomic-crm/financial/exactMoney.test.ts` |
| Database run | `make test-financial-database-contracts` |
| Upgrade run | `make test-financial-migration-upgrade && make test-financial-schema-push` |
| Full phase gate | `make financial-gate && npm run typecheck && npm run lint && npm run build` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| CALC-01 | Strict money/rate grammar, canonical strings, range, reduction, JSON round trip | Vitest unit/property | `npm test -- --run src/components/atomic-crm/financial/exactMoney.test.ts` | Wave 0 |
| CALC-01 | Checked exact PostgreSQL catalogs/helpers and no float authority | pgTAP | `make test-financial-database-sql` | Wave 0 |
| CALC-01 | Invoice/line-item/automation expand-contract conversion and immutable fingerprints | clean/upgrade/schema push | `make test-financial-migration-upgrade && make test-financial-schema-push` | Extend existing + Wave 0 |
| CALC-01 | Supabase/FakeRest string-only provider parity and numeric-token rejection | Vitest + live HTTP | `npm test -- --run src/components/atomic-crm/financial/exactProviderContract.test.ts tests/release/exact-money-boundaries.test.ts` through intended lanes | Wave 0 |
| CALC-03 | Signed ties, non-ties, exact divisions, currency exponent, named policy | Vitest + pgTAP + live HTTP | `make test-financial-database-contracts && npm test -- --run src/components/atomic-crm/financial/exactMoney.test.ts` | Wave 0 |

### Sampling Rate

- **Per task commit:** focused exact-money Vitest or pgTAP file plus
  `git diff --check`.
- **Per wave:** affected financial lane and `npm run typecheck` for TypeScript.
- **Before PR readiness:** all six existing financial lanes, typecheck, lint,
  and build. No rendered receipt is required unless invoice UI is changed.
- **Before merge:** exact-head review plus fresh merge-group required checks.
- **After authorized merge:** build receipt then protected schema promotion and
  post-state receipt before claiming the exact contract is live.
- **Retry policy:** no assertion retry; only inherited classified bootstrap retry.

### Wave 0 Gaps

- [ ] `src/components/atomic-crm/financial/exactMoney.test.ts`
- [ ] `src/components/atomic-crm/financial/exactFinancialFixtures.ts`
- [ ] `supabase/tests/database/60_exact_financial_primitives.sql`
- [ ] `supabase/tests/database/65_exact_billing_conversion.sql`
- [ ] `supabase/tests/upgrades/003-exact-money/expected-transformations.json`
- [ ] `tests/release/exact-money-boundaries.test.ts`
- [ ] `src/components/atomic-crm/financial/exactProviderContract.test.ts`
- [ ] `tests/release/exact-money-release-static.test.ts`

## Security Domain

| Threat | STRIDE | Required mitigation |
|--------|--------|---------------------|
| Unsafe JSON integer/token substitution | Tampering | String-only type check at client/server/database boundaries and live rejection. |
| Policy downgrade/default drift | Tampering/Repudiation | Immutable named version embedded with every authoritative result. |
| Overflow/clamping | Tampering/DoS | Wider exact intermediates and checked persistence boundary; stable fail-closed code. |
| Ambiguous migration coercion | Tampering/Repudiation | Row/path exception inventory, transaction abort, immutable fingerprints. |
| Dual legacy/exact writes | Tampering | Single exact write contract; legacy is derived read-only projection. |
| Raw malformed value leakage | Information Disclosure | Reason codes and stable row identity only; no raw payload in logs/errors. |
| Privileged helper misuse | Elevation | Private helpers, locked search path, explicit grants, live catalog tests. |
| Gate/path omission | Tampering | Static classification tests and unchanged six merge-group identities. |

## Sources

### Primary (HIGH confidence)

- https://www.postgresql.org/docs/17/datatype-numeric.html
- https://www.postgresql.org/docs/17/functions-math.html
- https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/MAX_SAFE_INTEGER
- https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt
- https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Internationalization
- https://docs.postgrest.org/en/stable/references/api.html
- https://postgrest.org/en/stable/how-tos/working-with-postgresql-data-types.html
- https://supabase.com/docs/guides/database/tables
- https://supabase.com/docs/guides/functions/connect-to-postgres
- Repository source, migrations, tests, protected workflows, and Phase 1/2
  artifacts at planning head `26589470e939eac7a8eb7c4af49b3cff90ffc293`.

### Secondary (MEDIUM confidence)

None required.

## Metadata

**Research status:** complete
**Recommended next step:** execute the revised Nyquist validation and seven
sequential plans; no unresolved user decision remains.
