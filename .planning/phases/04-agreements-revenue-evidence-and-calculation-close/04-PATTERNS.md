# Phase 04 — Implementation Pattern Map

**Mapped:** 2026-09-04
**Scope:** Agreement versions, revenue evidence/close, exact calculations, provider parity, and account-scoped UI

## Data Flow

```text
BillingAccountShow panels
  → typed CrmDataProvider command/read contract
    → Supabase RPC (production) / isolated in-memory command kernel (FakeRest)
      → caller-bound transactional PostgreSQL function
        → immutable agreement / submission / calculation facts + append-only audit
          → support-safe read RPC/view
            → strict decoder + exact reconciliation
              → account-scoped UI
```

## Closest Analogs

| New responsibility | Closest existing analog | Reuse rule |
|--------------------|-------------------------|------------|
| Agreement lifecycle RPCs | `supabase/migrations/20260901000005_billing_account_commands.sql` | Use one JSON request, caller/account reauthorization, fully qualified relations, empty `search_path`, append-only audit, revoked default execute, and narrow authenticated grant. |
| Exact calculation and replay fingerprint | `supabase/migrations/20260902000002_exact_billing_expand.sql` | Reuse private exact helpers, canonical JSON integer strings, request/effect fingerprint conflict-before-mutation behavior, and public wrapper/private implementation split. |
| Evidence/review linkage | `supabase/migrations/20260901000004_billing_evidence_security.sql` | Reference private evidence by composite organization/account ownership, retain hashes and lifecycle state, and append access/review events instead of mutating evidence content. |
| PostgreSQL behavior tests | `supabase/tests/database/65_exact_billing_conversion.sql` and `supabase/tests/database/40_billing_evidence.sql` | Extend pgTAP with constraints, ACL/owner/search-path checks, exact RPC results, denial effects, and immutable-history assertions. |
| Two-tenant identities | `supabase/tests/support/billing-security-fixtures.sql` | Add agreement/period/calculation fixtures to the existing operator/reviewer/auditor/customer/automation matrix. |
| Provider method types | `src/components/atomic-crm/providers/types.ts` | Define read-only request/response types, method-key registries, semantic resource names, and canonical money/rate objects before adapter implementation. |
| Supabase adapter | `src/components/atomic-crm/providers/supabase/dataProvider.ts` (`saveExactBillingInvoice`, `saveBillingAccountBoundary`) | Parse unknown inputs, invoke one named RPC, normalize stable errors, strictly decode the response, and reconcile exact financial fields before returning. |
| FakeRest exact state | `createExactFakeInvoiceProvider` in `src/components/atomic-crm/providers/fakerest/dataProvider.ts` | Use a factory-owned state instance, deterministic IDs/timestamps, complete request fingerprints, isolated tests, and equal production error semantics. |
| Capability presentation | `src/components/atomic-crm/billing-accounts/billingAccess.ts` | Map each resource/action to the Phase 2 capability vocabulary; presentation remains non-authoritative and all `billing_*` queries remain excluded from persistence. |
| Account panels and dialogs | `BillingAccountEvidencePanel.tsx` and `BillingAccountAccessPanels.tsx` | Use section-local loading/error states, `useCanAccess`, typed `useDataProvider`, explicit dialogs/sheets, safe notifications, refetch on success, and 44px controls. |
| Desktop/mobile composition | `BillingAccountShow.tsx` | Add account-scoped slots to the existing responsive grid and reuse `MobileHeader`/`MobileContent`; do not create a parallel route shell. |
| Release classification | `tests/release/exact-money-release-static.test.ts` and `tests/release/billing-security-static.test.ts` | Register every Phase 4 migration, provider, fixture, UI, and test path in the inherited six financial identities. |
| Upgrade registry | `tests/release/migration-upgrade.test.ts` and `supabase/tests/upgrades/003-exact-money/expected-transformations.json` | Add a new immutable numbered Phase 4 registry; do not edit accepted baseline/Phase 2/Phase 3 transformation contracts. |

## Concrete Patterns to Preserve

### SQL command boundary

- Public RPC accepts one `jsonb` payload and returns a closed JSON response.
- `SECURITY DEFINER SET search_path = ''` only where required; every name is
  schema-qualified.
- Revoke from `PUBLIC`, `anon`, `authenticated`, and `service_role` first, then
  grant only the intended wrapper to `authenticated`/authorized server role.
- Re-read `auth.uid()`, organization/account ownership, current capability,
  record state, and complete request fingerprint in the same transaction.
- Lock the business identity before uniqueness/transition checks.
- A conflict exits before audit, counters, immutable facts, or exception state
  changes.

### Exact response decoder

- Treat RPC responses as `unknown`.
- Reject absent/extra/incorrectly typed financial fields.
- Pass money/rate/policy objects through `exactMoney.ts`.
- Recalculate fixed/percentage/minimum/hybrid candidates and signed deltas;
  reject any mismatch between typed fields and snapshot/explanation data.
- Return branded/read-only application types only after reconciliation.

### FakeRest provider factory

- Create state inside a factory so tests cannot leak agreement/revenue/calculation
  facts across instances.
- Mirror server-generated keys, transition validation, idempotent return,
  conflicting key reuse, immutable revisions, and stable error codes.
- Use deterministic fixed timestamps and reserved identifiers; no randomness,
  network calls, customer data, or browser `number` authority.

### UI section contract

- Parent account record loads once; agreement and close sections own their
  query loading/error/empty state.
- `useCanAccess` hides/disables actions, but command responses remain the final
  authorization result.
- Mutation success invalidates/refetches the exact section and clears transient
  sensitive values; failure keeps only non-sensitive operator inputs.
- Desktop uses cards/tables where space permits; mobile converts history tables
  to stacked definition-list cards.
- All money uses `formatUsdMoney`; fingerprints/IDs are truncated visibly with
  full safe value available to authorized audit detail, not hidden tooltips only.

## Planned File Ownership

| Role | Expected location |
|------|-------------------|
| SQL agreement schema/commands | New forward-only files under `supabase/migrations/` |
| SQL revenue close/exception commands | New forward-only files under `supabase/migrations/` |
| SQL calculation/adjustment commands | New forward-only files under `supabase/migrations/` |
| Live database fixtures/tests | `supabase/tests/support/` and `supabase/tests/database/` |
| Shared exact Phase 4 fixtures | `src/components/atomic-crm/financial/` |
| Domain/provider types | `src/components/atomic-crm/types.ts` and `providers/types.ts` |
| Production/FakeRest adapters | Existing `providers/supabase/` and `providers/fakerest/` modules; split Phase 4 helpers if current files become unwieldy |
| Agreement UI | New files under `src/components/atomic-crm/billing-accounts/` |
| Monthly-close UI | New files under `src/components/atomic-crm/billing-accounts/` |
| Provider/component tests | Co-located Phase 4 tests plus shared provider-contract tests |
| Release/upgrade contracts | Existing `tests/release/`, `.github/release/`, and `supabase/tests/upgrades/` registries |

## Avoid

- Generic browser CRUD for financial state transitions.
- One mutable agreement, submission, or calculation row presented as history.
- JavaScript `number`, SQL `float`, locale-formatted money, or explanation text
  as financial authority.
- A single opaque “close month” command that mixes agreement approval, evidence
  acceptance, period close, and calculation approval.
- Editing earlier migrations or accepted upgrade baselines.
- Duplicating evidence upload/download/inspection behavior in new components.
- Treating UI capability checks, HTTP 200, or a local schema apply as production
  authorization or rollout proof.

---

*Pattern mapping complete: 2026-09-04*
