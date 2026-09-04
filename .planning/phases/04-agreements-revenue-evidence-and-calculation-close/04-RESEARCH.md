# Phase 4: Agreements, Revenue Evidence, and Calculation Close - Research

**Researched:** 2026-09-04
**Domain:** Immutable commercial agreements, monthly revenue evidence, and exact calculation close
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01 through D-05:** Structured agreement fields control calculation only
  after an explicit, audited activation anchored to private signed evidence.
  Activated versions are immutable and non-overlapping; v1 changes take effect
  on period boundaries; automation cannot approve terms.
- **D-06 through D-09:** Commissionable revenue is a structured versioned
  contract. V1 formula kinds are fixed, percentage, minimum-support, and hybrid;
  exact Phase 3 money/rate/policy values are embedded; each agreement defines an
  ordered evidence provenance ladder.
- **D-10 through D-16:** Revenue periods and submissions use stable business
  keys and immutable revisions. Review is explicit, bad or missing evidence
  creates an owned exception, minimum-only close requires contract permission
  plus approval, and close freezes a complete input snapshot transactionally.
- **D-17 through D-22:** Calculation authority lives in a server-owned command.
  It freezes exact intermediates and policy/input fingerprints, detects
  conflicting duplicate requests, explains prior-period differences, defaults
  to manual approval, and may auto-close only under an explicit active policy.
- **D-23 through D-25:** Late evidence creates a linked compensating
  calculation; it never rewrites the original close. Credit eligibility follows
  the agreement, and invoice placement remains Phase 5 scope.
- **D-26 through D-29:** Phase 4 extends billing-account detail on desktop and
  mobile, uses custom provider/RPC operations, and excludes sensitive data from
  offline persistence. Cross-account operations remain Phase 9.

### Agent Discretion Applied

- Use PostgreSQL `daterange` plus a GiST exclusion constraint for active-range
  non-overlap, with command-level locking for friendly deterministic errors.
- Use append-only lifecycle/review/exception event tables beside immutable
  current-domain facts; no generic mutation privilege on authoritative tables.
- Use versioned JSON snapshots only for frozen explanation/input payloads whose
  scalar financial components are also constrained in typed columns. JSON is
  not the sole source of amount, currency, rate, state, or identity.
- Reuse the Phase 3 request-fingerprint and effect-discriminator pattern for
  every command that can freeze or approve financial state.
- Keep formula execution in PostgreSQL and mirror it independently in the
  TypeScript/FakeRest test adapter from shared golden fixtures.

### Deferred Ideas (OUT OF SCOPE)

- Invoice creation, numbering, issuance, notice delivery, and adjustment
  placement are Phase 5.
- Customer self-service submissions and attestation UI are Phase 8.
- Cross-account close operations and collections are Phase 9.
- Provider payment, payout, and bank reconciliation state are later phases.

</user_constraints>

<phase_requirements>
## Phase Requirements

| Group | IDs | Research Support |
|-------|-----|------------------|
| Agreements | AGR-01–AGR-05 | Immutable version tables, exact embedded terms, range exclusion, signed-evidence reference, and lifecycle approval commands/events. |
| Revenue close | REV-01, REV-02, REV-04–REV-09 | Stable period keys, immutable submission revisions, evidence links/hashes, review events, owned exceptions, minimum exception, and transactional close policy. |
| Calculation | CALC-02, CALC-04–CALC-07 | Closed formula dispatcher, exact snapshots/intermediates, complete fingerprint idempotency, golden/property/concurrency proof, anomaly gates, and prior-period preview. |

</phase_requirements>

## Summary

The safest architecture is a narrow command surface over an append-only and
immutable PostgreSQL model. Agreement activation, evidence review, period close,
calculation creation, and calculation approval each need a single transactional
RPC that derives caller/account authority server-side, locks the relevant
business key, validates the complete prior state, performs exactly one state
transition, and writes the audit/exception effect before returning. Ordinary
browser CRUD should be read-only for support-safe views and unavailable for
financial mutations. [VERIFIED: repository Phase 2 and Phase 3 patterns]

PostgreSQL exclusion constraints are a direct database invariant for preventing
overlapping effective ranges, and PostgreSQL automatically backs an exclusion
constraint with an index. Use `btree_gist` for scalar organization/account keys
alongside a `daterange` overlap operator. A command should still acquire a
transaction-level account/agreement lock and map constraint violations to a
stable domain code so concurrent activations fail predictably. [CITED:
https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-EXCLUSION]

Supabase's current guidance requires both grants and RLS on exposed tables,
recommends invoker functions by default, and requires a pinned empty
`search_path` plus fully qualified names when a definer function is necessary.
Phase 4 should follow the repository's already locked definer-command pattern:
private implementation helpers, explicit caller/account reauthorization,
revoked default execution, and execute grants only on closed public wrappers.
[CITED: https://supabase.com/docs/guides/database/functions] [CITED:
https://supabase.com/docs/guides/database/postgres/row-level-security]

The existing account UI and private evidence panel are sufficient extension
points. Add account-scoped agreement and monthly-close panels rather than a new
global shell. The provider boundary already supports semantic custom methods,
strict exact-value decoding, FakeRest parity, and sensitive-query cache
exclusion. The main implementation risk is therefore not framework novelty; it
is preserving immutable lineage and transactional semantics across a larger
state machine. [VERIFIED: codebase]

**Primary recommendation:** implement and prove the PostgreSQL domain model and
command contracts in vertical dependency order, then expose strict TypeScript
provider codecs and account-scoped UI. Build shared golden vectors early, but
keep PostgreSQL and TypeScript formula implementations independent so parity
tests can detect drift.

## Recommended Domain Model

### Agreement aggregate

| Relation | Purpose | Required invariants |
|----------|---------|---------------------|
| `billing_agreements` | Stable account-level agreement identity | Organization/account composite ownership; no delete; one cadence/currency family in v1. |
| `billing_agreement_versions` | Immutable computational and lifecycle version | Monotonic version number; exact USD/rate/policy fields; `daterange`; signed evidence ID/hash; no mutation after activation. |
| `billing_agreement_revenue_rules` | Structured commissionable-revenue contract | One row per version; closed enums for timing/tax/refund/missing/true-up semantics; explicit IANA timezone. |
| `billing_agreement_events` | Append-only draft/submit/activate/pause/supersede/terminate history | Actor, role, reason, before/after state, evidence fingerprint, timestamp; immutable trigger. |

Use a half-open effective range `[effective_from, effective_until)` so adjacent
versions do not overlap. V1 activation requires the lower bound and any finite
upper bound to align to the agreement timezone's monthly boundary. The GiST
exclusion key should include organization, account, agreement family/cadence,
and effective range for financially active states. If a partial exclusion
constraint cannot express the exact lifecycle predicate cleanly, use a separate
immutable activation-interval relation populated only by activation commands.

### Revenue-period aggregate

| Relation | Purpose | Required invariants |
|----------|---------|---------------------|
| `billing_revenue_periods` | One account/agreement/month close identity | Unique organization/account/agreement-version/period key; exact date bounds/timezone; explicit open/closed/minimum-close state. |
| `billing_revenue_submissions` | Immutable revision header and exact totals | Monotonic revision; provenance kind/source ID; submitter; attestation; gross/excluded/commissionable USD; request fingerprint. |
| `billing_revenue_submission_evidence` | Link submission revision to private evidence | Composite tenant/account ownership; evidence hash captured at link time; no hard delete. |
| `billing_revenue_review_events` | Reviewer decisions | Append-only accept/reject/correction/hold; one accepted revision at close; reason and fingerprint required. |
| `billing_close_exceptions` | Durable fail-closed work item | Stable reason code; owner; amount at risk; next action/due time; open/resolved state; links to evidence and decisions. |

The monthly period key must be generated server-side from the agreement's
timezone and effective range, not from browser timestamps. A unique constraint
is sufficient for duplicate period creation; command-level locking gives stable
return-existing behavior under concurrency.

### Calculation aggregate

| Relation | Purpose | Required invariants |
|----------|---------|---------------------|
| `billing_calculations` | Immutable run identity and final exact result | Stable business key, request fingerprint, account/period/agreement lineage, formula/policy versions, status, exact candidates/result. |
| `billing_calculation_snapshots` | Frozen inputs/intermediates/explanation | Versioned JSON shape plus hash; all financial integer components serialized as strings; typed result columns reconcile with snapshot. |
| `billing_calculation_events` | Preview/approve/auto-close/hold history | Append-only actor/principal, authorization source, reason, policy, causation, timestamp. |
| `billing_close_policies` | Versioned manual/auto eligibility | Immutable version; default manual; account/formula/evidence/anomaly allowlists; activation audit. |
| `billing_calculation_links` | Original-to-adjustment causation | One original and linked true-up/credit-candidate calculation; no cycles; exact delta reconciliation. |

Store fixed, minimum, percentage, and final candidates in exact typed columns,
including exact numerator/denominator intermediates before the single named
rounding boundary. The explanation JSON should be regenerated from frozen
facts, versioned, hashed, and reconciled in tests; it must never be accepted as
input authority.

## Command and State-Transition Design

Recommended closed RPC surface:

1. `save_billing_agreement_draft(jsonb)` — validates shape/exact fields and
   creates a new draft version only.
2. `submit_billing_agreement_version(jsonb)` — freezes draft content for review.
3. `activate_billing_agreement_version(jsonb)` — reauthorizes reviewer, locks
   the account agreement family, validates signed evidence and non-overlap, then
   writes activation/supersession effects atomically.
4. `ensure_billing_revenue_period(jsonb)` — derives the applicable version and
   returns the existing period on a matching key.
5. `submit_billing_revenue_revision(jsonb)` — inserts immutable exact totals and
   evidence links after validating private evidence state/hashes.
6. `review_billing_revenue_revision(jsonb)` — records a review outcome and owns
   or resolves related exceptions without rewriting the revision.
7. `close_billing_revenue_period(jsonb)` — rechecks the accepted revision or
   minimum exception, freezes the input snapshot, and closes once.
8. `preview_billing_calculation(jsonb)` — returns an exact candidate and
   previous-period comparison without creating financial authority.
9. `create_billing_calculation(jsonb)` — inserts one immutable calculation from
   the frozen period snapshot and returns existing only on complete fingerprint
   equality.
10. `approve_billing_calculation(jsonb)` — manual or narrowly granted automation
    transition using one shared eligibility/recheck kernel.
11. `create_billing_adjustment_calculation(jsonb)` — consumes late accepted
    evidence and links a true-up/credit candidate to the original close.

If plan sizing becomes excessive, combine draft/submit operations into fewer
RPCs while preserving explicit states and separate authorization checks. Do not
combine agreement activation, period close, and calculation approval into one
opaque “close month” command; their evidence and authorization semantics differ.

Every command should use the established replay contract:

- caller-derived tenant/account and capability;
- stable business idempotency key;
- canonical request fingerprint over every financially meaningful field;
- command-owned effect discriminator;
- conflict before audit/counter/state mutation;
- append-only success/denial audit with redacted scalar context;
- stable safe error code, never raw submitted terms or evidence contents.

## Formula Kernel

The supported formulas are deliberately closed:

| Kind | Exact candidate | Final selection |
|------|-----------------|-----------------|
| fixed | Embedded fixed USD minor units | fixed |
| percentage | commissionable minor units × reduced rate | named rounding result |
| minimum-support | Embedded minimum USD minor units | minimum |
| hybrid | Both minimum and rounded percentage candidates | greater candidate; equality records both and a deterministic branch code |

Negative submitted revenue and ordinary percentage rates outside Phase 3's
0–100% contract fail. Negative adjustment deltas are allowed only in a linked
adjustment calculation and never enter the base monthly formula. Every output
must reconcile with the frozen input, intermediate ratio, rounding policy, and
selected branch.

Golden vectors should include zero, exact division, positive/negative adjustment
ties, percentage below/equal/above minimum, signed-`bigint` boundaries,
unsupported policy versions, stale evidence hashes, and concurrency races.

## Provider and UI Integration

### TypeScript contracts

Add branded/read-only domain types and strict parsers for agreement versions,
revenue submissions/periods, exceptions, previews, calculations, and events.
All `bigint`-backed values remain canonical strings on the wire. Reject unknown
keys in command payloads where practical and reconcile decoded calculation
responses through the Phase 3 exact kernel before returning application types.

Add explicit `CrmDataProvider` methods for each supported command and semantic
read resource. Supabase calls narrow RPCs; FakeRest owns isolated in-memory
state per provider instance and applies the same state machine, error codes,
request fingerprints, and exact result fixtures.

### Account-scoped presentation

Extend `BillingAccountShow` with:

- Agreements panel: active version summary, signed-source evidence reference,
  exact formula terms, effective dates, lifecycle history, and capability-gated
  draft/submit/activate actions.
- Monthly close panel: current/recent periods, provenance/revision status,
  evidence and exception summary, calculation preview with previous-period
  delta, and capability-gated review/close/approve actions.

Desktop may use adjacent summary cards and detail dialogs/sheets; mobile uses a
single ordered stack. Reuse the evidence panel for upload/access and link its
objects to immutable submission revisions. Do not duplicate the Phase 2 upload
security lifecycle inside Phase 4 components.

## Failure Modes and Prevention

| Failure | Prevention | Required proof |
|---------|------------|----------------|
| Concurrent agreement versions overlap | GiST exclusion plus account/version command lock | Two-session race: one activation succeeds, one returns stable overlap conflict. |
| Accepted evidence changes after preview | Freeze revision/evidence hashes and recheck them in close/approve transaction | Stale preview approval fails with no calculation/event mutation. |
| Duplicate command creates a second close | Unique business key plus complete request fingerprint | Same request returns existing; changed reuse conflicts before effects. |
| Minimum exception hides missing evidence | Keep exception open and link it to the minimum calculation | Query and UI show unresolved evidence after approval. |
| Late evidence rewrites history | Append linked adjustment calculation only | Original rows/hashes unchanged; delta reconciles exactly. |
| Browser or FakeRest drifts from PostgreSQL | Shared vectors with independent implementations | Provider contract tests assert equal success/error/result semantics. |
| RLS/view leaks another account | Forced RLS, minimal grants, safe views/RPCs, caller-derived filters | Two-tenant REST/RPC matrix including counts and nested links. |
| Explanation disagrees with amount | Versioned explanation generated from frozen typed facts | Decoder and SQL tests recalculate all candidates/deltas and reject mismatch. |
| Sensitive data persists offline or in logs | Existing sensitive-query filter and recursive redaction | Persistence/telemetry tests include every new resource and payload key. |

## Recommended Plan Boundaries

1. Agreement schema, immutable lifecycle, non-overlap, activation commands, and
   real concurrency/security tests.
2. Revenue periods, immutable submissions/evidence links, review events,
   exceptions, minimum-close rules, and real security tests.
3. Exact formula kernel, frozen calculation snapshots, replay/idempotency,
   anomaly/approval policy, and golden/property/concurrency tests.
4. Linked late-evidence adjustments and complete PostgreSQL close workflow.
5. TypeScript codecs and Supabase/FakeRest provider parity.
6. Account-scoped agreement UI and rendered surface contract.
7. Monthly-close UI, prior-period preview, responsive/accessibility surface,
   and end-to-end provider tests.
8. Release-gate coupling, representative upgrade proof, schema push, and full
   phase verification.

This order keeps every plan independently verifiable while avoiding a schema
plan so large that provider/UI plans must guess unfinished contracts.

## Validation Architecture

### Fast checks on every relevant change

- Vitest exact formula and decoder golden vectors.
- Supabase/FakeRest shared provider contract suite.
- TypeScript typecheck and ESLint/Prettier.
- Static release-path classification for every new financial module, migration,
  fixture, provider method, and UI resource.

### Real database and authorization checks

- Clean apply and representative upgrade through the accepted migration runner.
- pgTAP constraints, immutability, grants, RLS, function ownership/search path,
  audit effects, and two-tenant denial tests.
- Authenticated REST/RPC tests for operator, reviewer, auditor, wrong tenant,
  unauthorized role, and narrowly granted automation identities.
- Two-session races for activation overlap, period creation, revision review,
  calculation creation, approval, and late adjustment creation.

### End-to-end financial invariants

- Every approved calculation traces to one immutable agreement version, one
  closed revenue period/input snapshot, exact policies/intermediates, and one
  complete fingerprint.
- Replaying every supported formula returns byte-equivalent canonical financial
  values and the same explanation hash.
- Same-key/same-input commands return the original result; same-key/changed-input
  commands return a stable conflict with unchanged rows, audits, and counters.
- Missing or bad evidence never produces estimated revenue; permitted minimum
  close retains an owned exception; late accepted evidence creates only a
  linked adjustment.
- Cross-tenant reads, writes, counts, evidence links, and nested RPC results are
  denied without leaking existence.

### UI and rendered-surface checks

- Component/provider tests cover capability-gated actions, statuses, empty/error
  states, exact formatting, prior-period absence, stale-preview conflict, and
  offline-safe behavior.
- A rendered source receipt covers agreement and close flows at 320px and a
  desktop viewport before PR readiness.
- The immutable deployed preview must pass the shared five-viewport gate with a
  Phase 4 freshness marker before merge. Production proof remains a separate
  post-release receipt and is not part of local execution.
- Residual manual coverage is named for keyboard/screen-reader behavior,
  physical devices, and owner-authenticated hosted production data.

### Blocking release closure

Run `make financial-gate`, `npm run typecheck`, `npm run lint`, and
`npm run build` under Node 22. The financial gate must report clean migration,
representative upgrade, SQL/Auth/HTTP/Edge/replay/provider/static/security lanes,
and branch-scoped advisory scans. A local isolated `supabase db push --db-url`
proves the complete schema chain; no linked/hosted schema promotion occurs
without separate owner approval.

## Sources

- [PostgreSQL constraints and exclusion constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)
- [Supabase database functions](https://supabase.com/docs/guides/database/functions)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- `.planning/phases/04-agreements-revenue-evidence-and-calculation-close/04-CONTEXT.md`
- `supabase/migrations/20260901000001_billing_tenant_roles.sql`
- `supabase/migrations/20260901000004_billing_evidence_security.sql`
- `supabase/migrations/20260902000002_exact_billing_expand.sql`
- `src/components/atomic-crm/providers/types.ts`
- `src/components/atomic-crm/providers/supabase/dataProvider.ts`
- `src/components/atomic-crm/providers/fakerest/dataProvider.ts`
- `src/components/atomic-crm/billing-accounts/BillingAccountShow.tsx`
- `src/components/atomic-crm/billing-accounts/BillingAccountEvidencePanel.tsx`
- `src/components/atomic-crm/financial/exactMoney.ts`

---

*Research complete: 2026-09-04*
