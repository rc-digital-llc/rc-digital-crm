# Phase 3: Exact Money and Rounding Contract - Pattern Map

**Mapped:** 2026-09-02
**Files classified:** 29 planned new/modified implementation/test files or file groups
**Strong analogs:** 6 code/test/release families

## File Classification

| New/Modified File or Group | Role | Data Flow | Closest Analog | Match Quality |
|----------------------------|------|-----------|----------------|---------------|
| `src/components/atomic-crm/financial/exactMoney.ts` | utility/codec | transform + validation | No exact arithmetic analog; follow exported pure-helper style in `invoices/invoiceCalculations.ts` plus strict provider-boundary errors | new domain primitive isolated by research |
| `src/components/atomic-crm/financial/exactFinancialFixtures.ts` | shared fixture | deterministic vectors | `supabase/tests/support/replay-concurrency.sql`; Phase 2 billing fixtures | role match |
| `src/components/atomic-crm/financial/exactMoney.test.ts` | unit/property test | pure transform | `invoices/invoiceCalculations.test.ts` | direct regression target |
| `supabase/migrations/20260902000001_exact_financial_primitives.sql` | migration/model/function | exact validation/calculation | `20260901000001_billing_tenant_roles.sql`; `20260901000003_billing_automation_grants.sql` | security/function exact |
| `supabase/tests/database/60_exact_financial_primitives.sql` | pgTAP contract | transactional function/catalog | `30_billing_tenancy.sql`; `35_billing_automation.sql` | exact |
| `supabase/migrations/20260902000002_exact_billing_expand.sql` | migration/backfill | batch + CRUD + RPC | `20260901000002_billing_invoice_boundary.sql` | exact expand/validate/contract analog |
| `supabase/tests/database/65_exact_billing_conversion.sql` | pgTAP contract | rows/triggers/RPC | `35_billing_automation.sql` | exact |
| `supabase/tests/database/35_billing_automation.sql` | inherited pgTAP caller | exact automation command/effects | current numeric contract in same file | direct cutover target |
| `supabase/tests/support/billing-security-fixtures.sql` | shared database fixture | exact grant limits | current numeric automation fixtures | direct cutover target |
| `supabase/tests/upgrades/003-exact-money/expected-transformations.json` | accepted transform | immutable batch proof | `002-billing-tenancy/expected-transformations.json` | exact |
| `scripts/release/fingerprint-upgrade.mjs` | verifier | batch fingerprint | existing Phase 2 registry loader | exact extension; preserve earlier invariants |
| `tests/release/migration-upgrade.test.ts` | verifier unit | registry rejection | current transformation tests | exact extension |
| `tests/release/exact-money-boundaries.test.ts` | live boundary test | Auth/REST/RPC request-response | `billing-tenancy.test.ts` | live HTTP analog |
| `supabase/tests/database/40_billing_evidence.sql` | inherited pgTAP caller | exact zero inspection/replay/conflict | current evidence inspection contract | C2-H2 cutover target |
| `tests/release/billing-evidence.test.ts` | inherited Edge/live caller | exact evidence inspection replay | current production-shaped Edge contract | C2-H2 cutover target |
| `tests/release/billing-tenancy.test.ts` | inherited live HTTP caller | exact read RPC + direct-table denial | current invoice-table tenant matrix | direct authority cutover |
| `tests/release/replay-concurrency.test.ts` | inherited concurrent caller | exact automation replay/fingerprint | current numeric same-key grant race | direct cutover target |
| `src/components/atomic-crm/types.ts` | domain types | provider/browser | current billing automation types | direct conversion target |
| `src/components/atomic-crm/providers/types.ts` | provider contract | request-response | current compound billing methods/resources | exact |
| `providers/supabase/dataProvider.ts` | adapter | caller-bound RPC request-response | billing role/evidence command methods | exact |
| `providers/fakerest/dataProvider.ts` | adapter | in-memory command | Supabase-parity billing methods | exact |
| `providers/fakerest/dataGenerator/billingAccounts.ts` | fixture | generated records | current Phase 2 billing fixture | exact |
| `src/components/atomic-crm/financial/exactProviderContract.test.ts` | parity test | two-provider matrix | `billing-accounts/billingDataProvider.test.ts` | exact |
| `invoices/invoiceCalculations.ts` | preview service | exact transform | current file | direct unsafe authority replacement |
| `invoices/invoiceCalculations.test.ts` | preview test | exact golden vectors | current file | direct regression replacement |
| `makefile` | gate wiring | task orchestration | current financial targets | exact extension |
| `.github/release/financial-paths.json` | change classifier | path → gates | current Phase 2 paths | exact extension |
| `tests/release/exact-money-release-static.test.ts` | policy coupling | source/config | `billing-security-static.test.ts` | exact |

## Strong Analog Excerpts

### 1. Additive invoice backfill with trigger isolation

**Analog:** `supabase/migrations/20260901000002_billing_invoice_boundary.sql`

```sql
ALTER TABLE public.invoices DISABLE TRIGGER invoices_updated_at;
ALTER TABLE public.invoices DISABLE TRIGGER invoices_calculate_totals;
UPDATE public.invoices AS invoice SET ...;
ALTER TABLE public.invoices ENABLE TRIGGER invoices_calculate_totals;
ALTER TABLE public.invoices ENABLE TRIGGER invoices_updated_at;
```

Reuse the transactionally bounded disable/backfill/validate/re-enable structure,
but replace the old total trigger after the exact fields are populated. Never
allow the old trigger to round or overwrite accepted historical facts.

### 2. Append-only transformation registry

**Analog:** `supabase/tests/upgrades/002-billing-tenancy/expected-transformations.json`
and `scripts/release/fingerprint-upgrade.mjs`

The current loader validates ordered registries, known categories, exact before
and after hashes, named migrations, and allowlisted semantic invariants. Add a
numbered registry and narrow new categories; do not edit baseline 001 or registry
002. Preserve exact decimal text in the pre-fingerprint and add canonical exact
wire values to the post-fingerprint.

### 3. Private helper hardening

**Analog:** `20260901000003_billing_automation_grants.sql`

```sql
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
...
REVOKE ALL ON FUNCTION private.some_helper(...) FROM PUBLIC;
```

Use empty `search_path`, full qualification, exact signature ACL assertions, and
one-transaction creation/revoke. Prefer invoker functions where privilege
elevation is unnecessary.

### 4. Effect-focused automation tests

**Analog:** `supabase/tests/database/35_billing_automation.sql`

The current pgTAP contract invokes the public command under `authenticated`, then
checks executions, counters, audits, mismatches, retry failure, and unchanged
effects. Replace decimal arguments/expectations with typed money JSON and string
responses while preserving caller binding, row locks, idempotency, and exact
effect counts.

### 5. Supabase/FakeRest compound command parity

**Analogs:** `providers/supabase/dataProvider.ts`,
`providers/fakerest/dataProvider.ts`, and
`billing-accounts/billingDataProvider.test.ts`

Both adapters already expose explicit compound methods rather than pretending an
RPC is generic CRUD. Add exact money/rate request/response types to that interface,
then run the same fixture matrix against both implementations. Keep FakeRest data
generation in `dataGenerator/billingAccounts.ts` to avoid the documented circular
import boundary.

### 6. Stable financial lane coupling

**Analogs:** `makefile`, `.github/release/financial-paths.json`, and
`tests/release/billing-security-static.test.ts`

Add each file to its existing fast/database/upgrade/replay lane and financial
path glob in the same plan/wave that creates or converts it; the final plan
audits that rolling coupling rather than introducing it.
Preserve the six required workflow names, unconditional merge-group execution,
timeouts, pinned actions/CLI, cleanup, and no assertion retry. Do not create a
seventh optional exact-money check.

## New Pattern: Canonical Exact Codec

No current browser module is safe to reuse for authoritative money. The new
codec should be the sole constructor and arithmetic entry point:

```ts
const acceptedIntegerTextPattern = /^-?[0-9]+$/;

function parseCanonicalInteger(value: unknown): CanonicalIntegerText {
  // Require typeof string, accept only sign + digits, normalize leading zeros
  // and signed zero through BigInt, check the boundary, return branded text.
}
```

Do not expose public constructors that accept `number`. Presentation methods may
return formatted strings but must accept validated money/BigInt values only.

## Dependency and Wave Guidance

```text
03-01 TypeScript exact contract
   └──> 03-02 PostgreSQL catalogs/helpers (same golden semantics)
          └──> 03-03 upgrade verifier and immutable-history contract
                 └──> 03-04 atomic invoice/automation/evidence database cutover
                        └──> 03-05 live Supabase + React Admin RPC boundary
                               └──> 03-06 FakeRest + invoice preview parity
                                      └──> 03-07 final coupling audit + integrated proof
```

The sequence is intentionally linear where schema or shared type files overlap.
It avoids two plans editing the transformation registry, provider contracts, or
financial gate wiring in the same wave.

## File Ownership Boundaries

- Plan 01 owns the pure TypeScript exact module/golden fixtures and creates the
  rolling static test while coupling those paths into fast/classifier surfaces.
- Plan 02 owns the primitive policy/helper migration and pgTAP file and adds
  test 60 to the protected SQL target in the same wave.
- Plan 03 owns only the upgrade runner, its Vitest contract, and same-plan
  upgrade/static coupling; it pins accepted migrations 00002/00003/00004.
- Plan 04 owns the later billing expand migration, registry 003, conversion
  pgTAP, inherited automation/evidence SQL and live callers, and same-plan
  SQL/functions/replay/static coupling. Its ten-file boundary is exact.
- Plan 05 owns shared/provider types, the Supabase adapter, exact live boundary
  and inherited tenancy tests, plus their same-plan HTTP/path/static coupling.
- Plan 06 owns FakeRest, deterministic exact fixtures, provider parity, invoice
  preview, and their same-plan HTTP/fast/path/static coupling.
- Plan 07 owns the final closed coupling audit and validation results. It may
  correct an omission but is not the first protection point for earlier paths.

## Patterns to Avoid

- Importing provider code into the pure exact module.
- Putting test-only functions/tables into production migrations.
- Modifying the same gate or registry file from parallel plans.
- Calling `Number(...)` on authoritative integer text.
- Using a raw table response as the wire contract for exact `bigint` fields.
- Spreading unvalidated records into an RPC body or FakeRest response.
- Replacing live pgTAP/HTTP proof with regex-only source tests.
- Direct linked/remote schema push during implementation.

## Pattern Mapping Result

Every planned file has a concrete repository analog or is isolated as the one
necessary new domain primitive. No architectural ambiguity or external package
dependency remains.
