# Architecture Research

**Domain:** Auditable recurring billing and revenue operations inside a brownfield CRM
**Researched:** 2026-08-20
**Confidence:** HIGH for the Supabase/PostgreSQL architecture and build order; MEDIUM for the final provider-specific adapter until the GoCardless-versus-Stripe sandbox spike is complete

## Standard Architecture

### Recommended Project Shape

Use a **modular monolith**: the existing React Admin application remains the operator shell, one Supabase PostgreSQL database owns financial state and invariants, and a small set of Supabase Edge Functions provides privileged commands, provider webhooks, and short-lived queue workers. Do not split billing into microservices. At RC Digital's likely scale, independent services would add distributed transactions and operational burden without solving a current capacity problem.

The important separation is not process count; it is **authority**:

- Browser surfaces may read authorized projections and request named commands. They never directly mutate issued invoices, provider state, balances, or ledger rows.
- PostgreSQL owns tenant binding, uniqueness, immutable records, legal state transitions, balanced subledger postings, and derived balances.
- Server-side billing commands own authorization, exact calculation, approvals, and creation of durable business intents.
- Provider adapters own outbound provider calls and normalization, but never become the source of agreement or invoice truth.
- The webhook inbox owns immutable external evidence. A worker may project that evidence into payment state only after durable intake.
- Reconciliation owns the claim that provider activity settled and explains a payout or deposit.
- Collections consumes a guarded eligibility projection; it does not infer eligibility from a mutable invoice status.

### System Overview

```text
┌──────────────────────────────── User Surfaces ────────────────────────────────┐
│ Existing operator SPA                   Restricted customer portal            │
│ React Admin resources + commands        revenue, evidence, invoice, dispute   │
└────────────────────┬──────────────────────────────────────┬────────────────────┘
                     │ Supabase JWT                         │ Supabase JWT
                     ▼                                      ▼
┌──────────────────────────── Command / Query Boundary ─────────────────────────┐
│ RLS-protected security-invoker read models                                    │
│ billing_commands     billing_portal     signed evidence URL service            │
│ - authorizes caller and account scope                                          │
│ - runs one database transaction per business command                          │
│ - emits immutable audit event + durable job/outbox intent                      │
└─────────────┬───────────────────────────────┬──────────────────────────────────┘
              │                               │
              ▼                               ▼
┌──────────────────── PostgreSQL Financial Kernel ──────────────────────────────┐
│ Identity/RBAC       Agreements/evidence       Billing runs/invoice documents   │
│ Immutable snapshots Append-only subledger     Reconciliation/collections       │
│ Provider inbox      Durable operations/jobs   Controls/audit/read models       │
│                                                                              │
│ Database constraints + RLS + narrow transactional commands own invariants.    │
└───────┬───────────────────────┬───────────────────────────────┬────────────────┘
        │                       │                               │
        ▼                       ▼                               ▼
┌───────────────┐     ┌────────────────────┐          ┌─────────────────────────┐
│ Private       │     │ Queue workers      │          │ Provider webhook intake │
│ evidence      │     │ leases/retry/DLQ   │          │ verify → persist → 2xx  │
│ Storage       │     │ short/restart-safe │          │ then async projection   │
└───────────────┘     └──────────┬─────────┘          └────────────┬────────────┘
                                 │                                 │
                                 ▼                                 ▼
                       ┌────────────────────────────────────────────────────────┐
                       │ Chosen hosted payment provider                         │
                       │ hosted authorization, ACH/card rails, events, payouts  │
                       └────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Owns | Must not own | Typical implementation |
|-----------|------|--------------|------------------------|
| Operator SPA | Workflow presentation, previews, approval requests, exception resolution | Authoritative math, tenant authorization, status mutation, provider secrets | Existing React Admin composition and typed `CrmDataProvider` commands |
| Customer portal | Account-scoped evidence submission, invoice access, hosted authorization launch, dispute creation | Internal CRM access, service-role access, provider callbacks as truth | Separate route/layout and resource allowlist inside the existing Vite application |
| Identity and authorization kernel | Organization membership, billing-account contact scope, billing roles, automation principals | UI visibility only | PostgreSQL membership tables, grants, RLS, pgTAP tests |
| Agreement service | Immutable signed term versions, effective dates, formula version, approval evidence | Mutable overwrite of historical terms | Named transactional commands and append-only version tables |
| Revenue-close service | Period lifecycle, source provenance, submissions, review, exceptions, true-ups | Silent estimates or use of attribution dashboards as verified revenue | PostgreSQL records plus private evidence objects |
| Calculation service | Exact integer/rational arithmetic, deterministic rounding, immutable input/output snapshot | JavaScript `number`, browser-authoritative totals | Pure server-side TypeScript using `bigint`, with stored canonical snapshot and hash |
| Invoice service | Draft/issue commands, legal invoice document versions, invoice numbers, adjustments/credit notes | Provider payment state in one mutable row; hard delete after issue | Transactional commands plus immutable document/status-event tables |
| Operational subledger | Payment, fee, refund, dispute, payout, clearing, cash, and allocation facts | Tax filing or the company's accounting GL | Minimal balanced transactions/postings with fixed account kinds |
| Provider adapter | Hosted authorization session, idempotent payment request, provider lookup, event/payout retrieval | Agreement formulas, invoice balances, tenant selection from request payload | Shared interface with GoCardless and Stripe sandbox implementations |
| Webhook inbox | Raw verified delivery, payload hash, provider event IDs, receipt time, processing state | Long synchronous processing | Provider-specific Edge Function plus one atomic database intake command |
| Job/outbox subsystem | Durable business intent, lease, attempts, backoff, rate limits, dead letter, replay | Untracked `waitUntil` work as the only copy of a task | PGMQ standard queue or equivalent logged job table plus durable operation rows |
| Reconciliation service | Watermarks, provider snapshots, payout items, matches, deltas, unmatched cases | Inferring cash settlement only from a `payment_succeeded` event | Scheduled worker and append-only reconciliation runs/results |
| Collections service | Versioned contact policy, eligibility, reminders, promises, disputes, legal holds | Contact or charge actions based only on `due_date` | Guarded queue jobs and auditable manual override |
| Control plane | Shadow/live modes, hierarchical kill switches, policy versions, approvals, replay controls | Feature flags stored only in browser state | Database-backed controls read again immediately before side effects |
| Observability | Correlation chain, queue age, webhook lag, reconciliation deltas, audit exports and alerts | Raw bank data, secrets, or evidence content in logs | Structured Edge logs plus durable operational tables and metric queries |

### Invariant Ownership and Sources of Truth

| Invariant / question | Source of truth | Enforcement |
|----------------------|-----------------|-------------|
| Which organization/account may this actor access? | `organization_memberships` and account-scoped portal memberships | RLS, explicit grants, server command authorization; never a client-supplied `tenant_id` alone |
| What terms applied to a service period? | Immutable `billing_agreement_versions` with non-overlapping effective range | Database constraints and activate/supersede command |
| What revenue was accepted? | Reviewed `revenue_submission` plus immutable evidence metadata/hash | Review command; rejected or replaced evidence remains in history |
| How was the fee calculated? | Immutable `calculation_snapshot` containing formula version, inputs, rounding, outputs and hash | Authoritative server calculation before insert; database uniqueness and immutability |
| What does the customer owe? | Issued invoice document version plus credit/debit adjustments | Issue/credit commands; no generic update/delete after issue |
| Has money merely been requested, provider-confirmed, or settled? | Payment attempt + provider events + subledger + reconciliation | Separate state projections; initiated ACH is never `paid` |
| What is the open invoice balance? | Sum of immutable invoice obligation and applied/reversed allocations | Security-aware database view, never an editable column |
| What explains a payout/deposit? | Provider payout and item snapshots matched to subledger transactions | Reconciliation run with zero-delta or explicit durable exception |
| May collections act now? | Guarded collection-eligibility view | Requires due/open balance, no pending payment, required reconciliation, no dispute/hold/pause, allowed policy/time |
| What happened and who authorized it? | Append-only `audit_events` linked by correlation ID | Every material command and override writes audit evidence in its transaction |

Provider data is authoritative only for facts the provider owns: mandate state, payment processing state, fees, returns/disputes, and payouts. RC Digital remains authoritative for contracts, revenue evidence, calculations, invoices, customer/account ownership, approvals, and collection policy.

## Domain Data Boundaries

### Security and Party Boundary

Create an explicit organization scope before adding financial records:

- `organizations`: the agency workspace/tenant.
- `organization_memberships`: `auth_user_id`, `organization_id`, versioned role set, active/revoked timestamps.
- `billing_accounts`: tenant-scoped customer billing identity linked to, but not permissioned solely by, the legacy `companies` row.
- `billing_account_contacts`: authorized customer portal identities, purpose/role, consent and revocation evidence.
- `automation_principals`: non-human identity, tenant scope, permitted command set, key/version metadata and last rotation.
- `provider_accounts`: maps `(environment, provider, provider_account_id)` to exactly one internal organization. A webhook never matches by email, display name, or client-provided organization ID.

Every financial row carries a non-null `organization_id`, and customer-visible rows also carry a non-null `billing_account_id`. RLS checks current database membership and account linkage. `service_role` bypasses RLS in Supabase, so it is server-only and every service-role command must independently reload and validate its organization/account target. Security-invoker views preserve underlying RLS; default security-definer views are an exposure risk.

### Agreement, Revenue, and Evidence Boundary

Recommended records:

```text
billing_agreements
  └── billing_agreement_versions (immutable signed terms + effective range)
       ├── agreement_formula_versions (fixed / percentage / minimum / hybrid)
       └── revenue_periods (one close per account/agreement/period)
            ├── revenue_submissions (append-only attempts and attestations)
            ├── revenue_evidence (private object path, SHA-256, source, retention)
            ├── revenue_reviews (approve/reject/request-changes events)
            └── calculation_snapshots (immutable exact inputs/outputs)
```

Use stable enumerated source categories: read-only API, automated export, authorized portal attestation, and contract-permitted minimum-only exception. Existing deal, attribution, project, and analytics revenue can be evidence inputs only after their provenance and measure are explicit; they must not silently become `commissionable_revenue`.

Evidence rows store the private object path, tenant/account scope, content hash, size, MIME type, upload actor, scan status, retention class and access log references. Never persist a signed URL. Generate short-lived signed reads only after each request is authorized.

### Money and Formula Boundary

Use integer minor units for amounts and an explicit ISO 4217 currency. Initial constraints can require `USD`, but retain the currency column so history remains unambiguous.

- Persist amounts as PostgreSQL `bigint` minor units.
- Transfer them over JSON as decimal strings because JavaScript `bigint` is not JSON-serializable and JavaScript `number` is unsafe for arbitrary integer money.
- Represent percentage rates as an integer scale such as parts-per-million, not binary floating point.
- Perform division with an agreement-versioned rounding rule and record the intermediate numerator/remainder needed to reproduce the result.
- Reject mixed currencies in a calculation, invoice, allocation, or subledger transaction.
- Treat browser calculations as labeled previews only.

The authoritative result for the common hybrid formula is conceptually:

```typescript
type Money = { amountMinor: bigint; currency: "USD" };

function calculateHybrid(input: {
  revenueMinor: bigint;
  ratePpm: bigint;
  minimumMinor: bigint;
  approvedAdjustmentMinor: bigint;
}): bigint {
  const denominator = 1_000_000n;
  const numerator = input.revenueMinor * input.ratePpm;
  const commissionMinor = roundUsingAgreementRule(numerator, denominator);
  return (
    (commissionMinor > input.minimumMinor
      ? commissionMinor
      : input.minimumMinor) + input.approvedAdjustmentMinor
  );
}
```

The production function runs server-side and stores its formula version, all inputs, exact rounding rule, output, and a canonical snapshot hash. If implementation changes, create a new formula version; never recalculate old invoices with new code.

### Invoice and Operational Subledger Boundary

Keep the legal invoice document separate from money movement:

- `invoices`: stable identity and tenant/account links.
- `invoice_versions`: immutable recipient/address/tax/currency/line-item/amount snapshots. The issued version cannot be changed.
- `invoice_status_events`: append-only `drafted`, `approved`, `issued`, `delivered`, `voided`, `credited`, `closed` evidence.
- `invoice_adjustments` or `credit_notes`: compensating records; never rewrite the original issue amount.
- `payment_attempts`: one internal intent per collection attempt, with a stable provider idempotency key and provider reference.
- `payment_allocations`: append-only application and reversal of confirmed/settled money to an invoice.
- `subledger_transactions` and `subledger_postings`: balanced operational postings for receivable, provider clearing, cash, fees, refunds and disputes.

This should be a **small fixed operational subledger**, not a configurable accounting general ledger. Each transaction has one immutable source key such as `(provider, provider_account, event_id)` or `(command_type, command_id)`. A deferred database check or finalize command proves postings sum to zero per currency before commit. Corrections are reversal transactions.

Useful projections are derived, not edited:

```text
invoice_obligation_minor
- settled_allocations_minor
- credits_minor
= open_balance_minor

provider_confirmed_unreconciled != settled_and_reconciled
pending_payment_attempt => suppress duplicate collection and dunning
```

The legacy `invoices.status`, `paid_date`, `payment_method`, and `payment_reference` may remain temporarily as a compatibility projection, but they cannot remain authoritative.

### Provider Inbox, Outbox, and Queue Boundary

Use three related durable concepts rather than one ambiguous job table:

1. **Inbox:** immutable verified provider deliveries and individual provider events.
2. **Business operation/outbox:** the durable intent to create a provider payment, send a notification, retrieve a payout, or perform another external side effect.
3. **Queue message:** a claimable wake-up pointing to an inbox event or operation ID. It may be rebuilt from durable pending rows.

Recommended records:

```text
provider_delivery_batches   # raw body/hash, signature metadata, received_at
provider_events             # unique provider/account/environment/event_id
provider_object_snapshots   # provider response used for a transition
provider_operations         # durable outbound intent + payload hash + idempotency key
billing_job_attempts        # lease owner/expiry, attempt, error code, latency
billing_dead_letters        # terminal failure and operator resolution
```

Use a standard logged PGMQ queue at this scale, or an equivalent PostgreSQL jobs table claimed with `FOR UPDATE SKIP LOCKED`. Do not use an unlogged queue. PGMQ messages remain until deleted/archived and support a visibility timeout; PostgreSQL documents `SKIP LOCKED` as appropriate for multiple consumers of a queue-like table. The job handler must still be idempotent because a lease can expire after a side effect but before local completion is recorded.

Do not use `EdgeRuntime.waitUntil()` as the sole durability mechanism. Supabase explicitly caps background tasks by Edge Function runtime limits. A worker invocation should claim a small batch, perform bounded I/O, persist progress after each item, and exit. Cron or another scheduler starts the next batch.

## Data Flow

### 1. Agreement to Issued Invoice

```text
Activate immutable agreement version
  → open unique revenue period
  → receive submission + private evidence
  → verify evidence/attestation or open exception
  → authorized reviewer accepts revenue
  → server computes and freezes calculation snapshot
  → create unique billing-run item
  → create invoice draft from frozen snapshot
  → approval command checks agreement/evidence/calculation hashes
  → issue immutable invoice version + audit event + delivery operation
```

Hard gates:

- A unique key such as `(organization_id, agreement_id, service_period, run_kind)` prevents duplicate normal or true-up runs.
- A billing run references one exact agreement version, revenue submission/review, formula version and snapshot.
- Percentage/hybrid invoices fail closed without accepted evidence or an explicit agreement clause permitting minimum-only billing.
- Issuance and enqueueing delivery happen in one database transaction.

### 2. Hosted Authorization / Mandate Setup

```text
Authorized portal or operator command
  → reload account membership and active agreement
  → create local authorization_session intent
  → provider worker creates hosted provider flow with stable idempotency key
  → store provider session/mandate IDs only
  → return hosted URL to the intended user
  → provider redirects user back (display “processing”, not “active”)
  → signed webhook/API lookup confirms terminal mandate state
  → append mandate event and update derived authorized/not-authorized projection
```

GoCardless Hosted Pages explicitly use a Billing Request plus Billing Request Flow and say to listen for webhooks to confirm the outcome. Stripe hosted ACH surfaces present the online mandate and keep bank details in Stripe. The CRM stores provider IDs, authorization evidence metadata, and status history—not raw account/routing numbers or card credentials.

### 3. Outbound Payment Creation

```text
Invoice eligible for collection
  → command transaction creates one payment_attempt + provider_operation
  → queue worker claims operation and rechecks:
       global/account kill switches, live mode, mandate, amount/currency,
       invoice balance, pending attempts, policy version, legal/dispute holds
  → call provider with stable key derived from internal operation ID
  → persist response/provider resource snapshot
  → wait for provider events; do not mark invoice paid on request success
```

If the provider call times out, the attempt enters `outcome_unknown`. The worker queries by known provider ID/idempotency evidence before retrying; it does not create a second local attempt. Provider idempotency retention is bounded—Stripe documents pruning after at least 24 hours and GoCardless guarantees its keys for at least 30 days—so RC Digital's permanent unique operation key is the stronger long-term duplicate barrier.

### 4. Webhook Intake: Durable Before Acknowledgement

```text
Provider POST with raw body
  → enforce method/content-type/body-size and select provider account/secret
  → verify signature against the unmodified raw body
  → parse bounded batch
  → ONE database transaction:
       insert delivery batch/hash
       insert each event with unique provider/account/environment/event ID
       record duplicate delivery observations without reapplying facts
       enqueue each new event or create equivalent pending job row
  → commit
  → return 2xx immediately
  → queue worker performs normalization and financial transitions later
```

If signature verification fails, return non-2xx. If durable persistence/enqueue fails, return a retryable non-2xx. If the event already exists, acknowledge after confirming the durable row. This reconciles provider guidance to return quickly with the project requirement to be durable before acknowledgement: the only synchronous business work is signature verification and a short atomic insert/enqueue transaction.

Workers tolerate duplicates and out-of-order events:

- retain the raw event even when it produces no new state;
- use unique source keys so the same event cannot post twice;
- validate legal transitions and never move a terminal state backward merely because an older event arrives later;
- retrieve the current provider object when a prerequisite event is missing or order is ambiguous;
- archive the queue message only after transactionally recording completion;
- expose replay and dead-letter resolution as authorized operator commands.

Stripe explicitly says event order is not guaranteed, duplicate delivery occurs, and webhook work should be asynchronous. GoCardless recommends recording processed events, avoiding double processing, and handling work asynchronously.

### 5. Reconciliation and Invoice Closure

```text
Scheduled reconciliation run with stored watermark + overlap window
  → fetch provider events/resources/payouts since watermark
  → upsert immutable snapshots by provider IDs
  → fetch itemized payout/balance transactions
  → match payment attempts, fees, refunds, disputes and payout items
  → post/reverse operational subledger transactions idempotently
  → prove payout item sum equals provider payout amount
  → optionally match bank deposit evidence
  → close invoice only when allocations and required settlement proof reconcile
  → create durable exception for every unmatched/delta item
  → advance watermark only after run commits
```

Use an overlap window and provider IDs rather than timestamp alone so late events do not fall through a cursor boundary. Watermarks are per provider account/environment/resource type. GoCardless's Payout Items API exposes credits and debits such as payments, failures, chargebacks, refunds, and fees; Stripe exposes itemized payout reconciliation/balance transaction reports. The adapter normalizes only common accounting facts and retains provider-specific raw payloads for evidence.

### 6. Collections

```text
Collection scheduler reads eligible_invoice_accounts view
  → excludes pending/unreconciled payments, disputes, legal holds, pauses,
    exceeded attempt caps, quiet hours and missing consent
  → creates unique action intent for invoice + policy version + stage
  → worker rechecks eligibility immediately before sending/contacting
  → append result and next-action event
  → human approval for write-off, refund, suspension or legal escalation
```

Reconciliation must precede collections automation. A provider-confirmed but not yet reconciled ACH payment suppresses duplicate charging and dunning even though the invoice is not yet financially closed.

### 7. Customer Portal Authorization

The portal is a separate trust surface even if it shares the Vite bundle:

- Separate route tree/layout and an explicit resource allowlist; do not reuse the operator navigation and merely hide links.
- Account membership is checked by RLS and again by every privileged portal command.
- A portal user can see only their billing-account agreement summaries, revenue periods, evidence metadata, issued invoices, payment-authorization status, and disputes—not internal notes, margins, tasks, reconciliation details, provider payloads, or other accounts.
- Upload paths are server-generated and account-bound. Finalization reloads the object and verifies path, size, type, hash and scan state.
- Signed document URLs are short-lived and issued only after a fresh authorization check.
- Creating a dispute writes a durable hold consumed by payment and collections eligibility in the same transaction.
- Provider redirect parameters and return URLs are untrusted UX inputs; webhook/API evidence determines the mandate/payment state.

### State Management

```text
Immutable facts / commands in PostgreSQL
  → security-aware SQL projections
  → React Admin / TanStack Query cache
  → targeted invalidation or compact domain notification
```

- PostgreSQL is authoritative for all production financial and authorization state.
- React Admin/TanStack Query stores remote-query cache and ephemeral form state only. A stale browser view cannot authorize a transition because every command reloads the database rows and expected version.
- Current invoice, payment, mandate, reconciliation and collections statuses are projections over immutable facts. Materialized columns are allowed only as transactionally maintained caches that can be rebuilt and checked against the underlying facts.
- High-volume provider, job and ledger tables stay out of broad Realtime publication. If operators need live updates, publish compact account/invoice/job notifications and invalidate only the affected query keys.
- Shadow, sandbox and live modes are explicit persisted dimensions on operations and provider accounts. They do not share idempotency namespaces or webhook secrets.

## Recommended Project Structure

```text
src/components/atomic-crm/
├── billing/
│   ├── domain/                 # shared record types, states, money display only
│   ├── agreements/             # operator agreement/version resources
│   ├── revenue/                # periods, submissions, evidence and review
│   ├── runs/                   # billing-run and calculation review
│   ├── invoices/               # document, balance and event read models
│   ├── payments/               # attempts, mandates and provider state
│   ├── reconciliation/         # runs, matches and exception workbench
│   ├── collections/            # cases, policies and action history
│   ├── operations/             # queue, DLQ, controls, audit and health
│   └── index.ts                # billing resource descriptors
├── portal/
│   └── billing/                # intentionally restricted customer UI
└── providers/
    ├── types.ts                # typed named billing commands/read operations
    ├── supabase/               # production adapter; no direct feature SDK use
    └── fakerest/               # clearly labeled simulation/read fixtures only

supabase/
├── functions/
│   ├── billing_commands/       # authenticated operator command API
│   ├── billing_portal/         # restricted portal commands/signed URLs
│   ├── provider_webhook_gocardless/ # raw-body signature + atomic inbox
│   ├── provider_webhook_stripe/     # sandbox spike; same inbox contract
│   ├── billing_worker/         # bounded queue consumer
│   └── _shared/billing/
│       ├── authorization.ts
│       ├── money.ts
│       ├── provider.ts         # provider-neutral interface
│       ├── gocardless.ts
│       ├── stripe.ts
│       └── observability.ts
├── migrations/                 # expand-contract schema/RLS/functions/indexes
└── tests/
    └── billing/                # pgTAP/RLS/invariant/concurrency tests
```

### Structure Rationale

- Keep one billing bounded context under `atomic-crm` so its many related React Admin resources share terminology without polluting generic UI or `src/lib`.
- Continue the current provider-port pattern: feature components call typed `CrmDataProvider` commands, never import the Supabase client or payment SDK.
- Keep portal UI separate because it has a materially narrower authorization and information-disclosure contract.
- Use separate webhook functions per provider so each raw-body parser, signature secret, event version, rate limit and deployment can be tested independently.
- Share provider normalization only behind a narrow server-side adapter. Keep raw provider responses so the common model never erases evidence.
- FakeRest is acceptable for UI demonstrations, but no financial correctness, RLS, provider, concurrency, or recovery acceptance may rely on it.

## Architectural Patterns

### Pattern 1: Named Commands Over Generic CRUD

**What:** Expose `approveRevenuePeriod`, `freezeCalculation`, `issueInvoice`, `requestPayment`, `resolveReconciliationException`, and similar business commands. Each command reloads authoritative rows, checks authorization and preconditions, performs one transaction, and appends audit evidence.

**When to use:** Every operation that changes agreement, evidence review, invoice, provider, ledger, reconciliation, collection, control, or audit state.

**Trade-offs:** More server code than generic React Admin updates, but state transitions become testable and impossible to bypass accidentally.

```typescript
type IssueInvoiceCommand = {
  invoiceId: string;
  expectedDraftVersion: number;
  idempotencyKey: string;
};

// The browser supplies intent and optimistic version, not amount or tenant.
await dataProvider.issueInvoice(command);
```

### Pattern 2: Immutable Facts Plus Derived Projections

**What:** Append agreement versions, evidence reviews, calculation snapshots, invoice events, provider events, subledger postings and collection actions. Build current status/balance views from facts.

**When to use:** Anything needed to explain a dollar or an irreversible operator action.

**Trade-offs:** More tables and read-model SQL, but corrections become explicit, replay is possible, and status cannot drift silently.

### Pattern 3: Transactional Inbox/Outbox With Idempotent Consumers

**What:** Store external events before acknowledgement and store outbound intent in the same transaction as the business state that caused it. Queue messages reference durable rows rather than being the only record.

**When to use:** Provider calls, invoice delivery, reminders, evidence ingestion, accounting export, reconciliation fetches, and webhooks.

**Trade-offs:** Requires worker/operator tooling and retry semantics. It prevents the more expensive failure modes: lost events, duplicate charges, and database/external side-effect divergence.

### Pattern 4: Hierarchical Fail-Closed Controls

**What:** Evaluate `environment → global workflow → organization → billing account → operation` controls immediately before an external side effect. Unknown/missing policy means pause, not proceed.

**When to use:** Payment creation, retries, reminders, collections contact, refunds, credits, write-offs, service suspension, and provider replay.

**Trade-offs:** Some false pauses during configuration incidents; this is preferable to an unauthorized financial action. Record false-pause metrics for later autonomy promotion.

### Pattern 5: Security-Invoker Read Models, Privileged Write Commands

**What:** Browser reads use RLS-protected tables/views; financial writes use narrow server commands. Any `SECURITY DEFINER` function has explicit caller/tenant checks, `search_path = ''`, schema-qualified names, revoked public execution, and focused grants.

**When to use:** Supabase/PostgREST exposure and transactionally complex commands.

**Trade-offs:** Requires integration tests under realistic JWT claims. Supabase recommends RLS on every exposed table, notes that service-role access bypasses RLS, and recommends testing every policy.

## Integration Points

### External Services

| Service | Integration pattern | Architectural note |
|---------|---------------------|--------------------|
| Supabase Auth | JWT identity mapped to current database memberships | JWT proves identity; database membership and account scope authorize each operation |
| Supabase Postgres/PostgREST | RLS-protected reads and narrow named commands | Financial state and invariants remain in one transactional kernel |
| Supabase Storage | New private evidence bucket, metadata row, short-lived signed access | Storage objects require a separate backup/restore plan |
| Supabase Edge Functions | Privileged commands, provider webhooks and bounded workers | No long-running or in-memory-only financial job |
| PGMQ / PostgreSQL jobs | Visibility-timeout claims and durable operation references | Queue delivery never replaces consumer idempotency |
| GoCardless or Stripe | Hosted authorization, idempotent provider calls, signed webhooks, payout/item retrieval | Choose one live provider after the sandbox spike; retain raw provider evidence |
| Email/invoice delivery provider | Transactional notification operation with template/policy version | Delivery result is append-only; collections rules gate retries |
| Accounting system, later | Export immutable invoices, credits, payments, fees and reconciliation batches | Accounting GL remains downstream; it does not calculate commissionable revenue |
| Bank statement feed/manual evidence | Deposit confirmation for payout reconciliation | Start manual/imported if necessary; never silently assume payout equals bank deposit |

### Internal Boundaries

| Boundary | Communication | Rule |
|----------|---------------|------|
| UI ↔ billing kernel | Typed query + named command | No direct financial CRUD or SDK calls in feature code |
| Portal ↔ billing kernel | Account-scoped read model + restricted command | Separate allowlist and fresh authorization per document/action |
| Agreement/revenue ↔ invoice | Immutable calculation snapshot reference | Invoice issue never recomputes from mutable current terms |
| Invoice ↔ provider | Durable payment operation ID | Provider receives stored invoice amount, never a browser amount |
| Webhook ↔ subledger | Inbox event consumed asynchronously | One source event can post at most one semantic financial transaction |
| Subledger ↔ reconciliation | Provider resource/payout IDs and immutable postings | Reconciliation appends matches/exceptions; it does not rewrite facts |
| Reconciliation ↔ collections | Guarded eligibility view | Pending/unreconciled money and disputes fail closed |
| Queue ↔ operator controls | Lease/attempt/DLQ rows plus kill-switch reads | Worker rechecks control state immediately before side effects |

## Provider Adapter Contract

The sandbox spike should implement the same capability contract for GoCardless and Stripe and score behavior, not merely SDK ergonomics:

```typescript
interface BillingProvider {
  createAuthorizationSession(input: AuthorizationIntent): Promise<ProviderSession>;
  getMandate(providerMandateId: string): Promise<ProviderMandateSnapshot>;
  createPayment(input: PaymentIntent, idempotencyKey: string): Promise<ProviderPayment>;
  getPayment(providerPaymentId: string): Promise<ProviderPayment>;
  cancelPayment(providerPaymentId: string, idempotencyKey: string): Promise<void>;
  listEvents(cursor: ProviderCursor): Promise<ProviderEventPage>;
  listPayouts(cursor: ProviderCursor): Promise<ProviderPayoutPage>;
  listPayoutItems(providerPayoutId: string): Promise<ProviderPayoutItem[]>;
  verifyAndParseWebhook(rawBody: Uint8Array, headers: Headers): VerifiedBatch;
}
```

Requirements for either live adapter:

- Separate sandbox/live account and webhook configuration.
- Stable internal operation ID sent as provider idempotency key and metadata/reference where supported.
- Exact amount/currency validation at both adapter and database boundary.
- Provider account resolved from stored configuration, never from an untrusted email/name.
- Raw provider snapshot retained alongside normalized state.
- Pagination, rate-limit, timeout and retry behavior implemented explicitly.
- Event deduplication and out-of-order recovery proven with fixtures and provider sandbox tests.
- Hosted authorization used; no raw bank/card credential enters RC Digital logs, database, analytics, or Storage.
- Reconciliation can explain fees, failures, refunds/disputes and payouts—not just successful charges.

Do not run two live providers in v1. The adapter preserves an exit path; operating multiple providers simultaneously would multiply reconciliation and support complexity.

## Expand-Contract Migration and Rollout Seams

| Release seam | Expand / verify | Contract only after evidence |
|--------------|-----------------|------------------------------|
| Test gate | Start local Supabase, apply the entire migration chain, run pgTAP and Edge integration tests in blocking CI | Remove static SQL-string tests only after behavioral coverage replaces them |
| Tenant scope | Add organizations/memberships and nullable tenant keys; backfill deterministically; add indexes and `NOT VALID` constraints; validate policies with multiple identities | Set `NOT NULL`, remove permissive grants/policies, and retire `sales_id` authorization only after every row and path is proven |
| Private evidence | Add new private bucket and metadata table; test signed read/upload/finalize/delete/retention | Never migrate sensitive files into or continue using the public `attachments` bucket |
| Money kernel | Add minor-unit/currency/formula columns and new immutable tables beside legacy invoice fields | Stop reading/writing `numeric(15,2)`/JavaScript-number fields only after backfill comparison is zero-delta |
| Invoice ledger | Import legacy invoices as explicit `legacy_import` snapshots; expose compatibility views | Revoke generic writes and hard delete before any provider collection; drop old columns much later |
| Commands | Deploy backward-compatible command functions and Edge handlers behind disabled flags | Remove browser CRUD paths after command E2E tests and operator acceptance |
| Provider intake | Deploy signature verification and inbox with sandbox endpoint; replay captured fixtures | Register/enable live endpoint only after durable-before-ack, duplicate, order, timeout and DB-failure tests pass |
| Provider output | Create shadow/sandbox operations and compare expected provider requests | Enable live payment POSTs for a tiny allowlist only after kill switch and reconciliation proof |
| Reconciliation | Import provider/payout data in shadow and prove zero/understood deltas | Permit invoice financial closure and collections eligibility only after reconciliation acceptance |
| Portal | Build routes behind a flag and run cross-account, signed-URL and dispute-hold E2E tests | Invite customer users only after tenant isolation/private storage proof |
| Autonomy | Run shadow cycles, preserve metrics, test rollback and restore | Increase allowlist/automation only through approved versioned promotion thresholds |

Avoid financial dual-write. During migration, choose one canonical writer and derive compatibility projections from it. Dual-writing the old mutable invoice row and new ledger independently creates two sources of truth.

## Dependency-Safe Build Order

The roadmap should encode these as hard dependencies:

1. **Executable database and deployment gate**
   - Repair the existing migration-chain defects.
   - Run clean `supabase db reset`, pgTAP/RLS tests, Edge Function integration tests, representative upgrade/backfill tests, and dependency/security checks in blocking CI.
   - Separate database, function and frontend deployment gates.
   - No new money-bearing migration or privileged endpoint ships before this gate.

2. **Tenant, role, storage and attack-surface hardening**
   - Add organization/account membership, billing roles, automation principals and provider-account ownership.
   - Replace permissive RLS/grants; secure views; harden/revoke unsafe definer functions.
   - Create and test private evidence Storage.
   - Remediate production dependency vulnerabilities and public source maps.
   - Agreements, evidence, portal and financial automation depend on this phase.

3. **Financial invariant kernel**
   - Define minor-unit/currency/rate/rounding contracts and JSON serialization.
   - Add immutable/audit primitives, state-transition command pattern, unique idempotency keys and compensating-record rules.
   - Prove formula properties, database constraints and concurrent duplicate prevention.

4. **Agreement and revenue-close foundation**
   - Agreement versions/effective dates, fixed and hybrid formulas, revenue periods, evidence, reviews, exceptions and true-ups.
   - Freeze reproducible calculation snapshots.
   - No provider charge may precede this source chain.

5. **Invoice document and operational subledger**
   - Issue immutable invoice versions, status events, adjustments/credit notes, payment attempts, allocations and balanced postings.
   - Build derived open-balance/aging views and import legacy invoices explicitly.
   - No hard deletes or generic financial updates.

6. **Durable operations platform and provider sandbox spike**
   - Build inbox, operation/outbox, PGMQ/jobs, leases, retries, rate limits, dead letter and basic control plane.
   - Implement GoCardless and Stripe sandbox adapters against the same contract.
   - Prove hosted authorization, provider idempotency, signature verification, duplicate/out-of-order replay, timeouts and unknown outcomes.
   - Choose one provider for live preparation; keep the other as documented fallback.

7. **Reconciliation**
   - Provider event/resource backfill, payout/balance-item ingestion, watermarks with overlap, match rules, fee/refund/dispute handling and exception workbench.
   - Prove invoice-to-provider-to-payout/bank explanation with fixtures and sandbox cycles.
   - Collections automation depends on this phase.

8. **Portal and dispute hold**
   - Release the restricted portal only after its cross-account/RLS/private-storage tests pass.
   - Revenue submission, invoice access, hosted authorization and dispute creation use named commands.
   - A dispute creates a payment/collection hold atomically.

9. **Collections, complete operator controls and observability**
   - Versioned dunning policy, consent/quiet hours, caps, pause/legal hold, promises and audited actions.
   - Global/account/workflow kill switches, dry run, policy rollback, queue/DLQ inspection, override approvals and audit export.
   - Structured alerts for webhook lag, job age, duplicate/error rates, reconciliation deltas and amount at risk.

10. **Recovery proof, shadow cycles and controlled live pilot**
    - Define RPO/RTO, enable adequate database recovery, back up evidence objects separately, and restore into an isolated project.
    - Replay provider events/operations, rebuild projections, verify subledger balance and reconcile from the last watermark.
    - Run two shadow cycles, then one fixed-fee and one hybrid customer through a tiny live allowlist.
    - Increase autonomy only when versioned metric thresholds and rollback tests pass.

### Safe Parallelism

- UI read-model work may parallelize after a domain schema is stable, but it cannot bypass command/RLS acceptance.
- GoCardless and Stripe sandbox adapters may be implemented in parallel after the provider contract, inbox, queue and financial primitives exist.
- Operator dashboard UI and alert query work may parallelize with worker implementation once durable statuses/metrics are defined.
- Portal visual work may begin earlier behind a flag, but portal data access/invitations cannot precede security and private-storage proof.
- Collections policy design may proceed while reconciliation is built; sending automation remains blocked on reconciled eligibility.

## Observability and Operator Safety

Give every chain a durable correlation ID:

```text
agreement version → revenue period/submission → calculation snapshot
→ billing run item → invoice version → payment attempt/provider operation
→ provider event → subledger transaction/allocation → payout item
→ reconciliation run/match → collection case/action
```

Minimum production metrics and alerts:

| Signal | Why it matters |
|--------|----------------|
| Webhook signature failures, intake failures and oldest unprocessed event age | Detect attack/noise and dropped processing |
| Queue depth, oldest ready job, lease expiries, retry count and DLQ count | Detect stalled unattended work |
| Provider request latency, rate-limit responses, timeouts and unknown outcomes | Bound duplicate-charge and revenue-delay risk |
| Duplicate event/operation prevention count | Prove idempotency is actively protecting the system |
| Reconciliation unmatched count, delta amount and oldest exception | Detect financial leakage rather than only technical errors |
| Open receivable, pending payment, confirmed-unreconciled and settled balances | Keep operator states distinct |
| Kill-switch changes, manual overrides and approval bypass attempts | Detect dangerous control-plane activity |
| Evidence scan failures and signed-URL issuance/access | Protect customer documents |
| Last successful backup, isolated restore and provider replay exercise | Keep recovery evidence current |

Logs use correlation IDs and internal opaque identifiers. Do not put raw webhook bodies, bank details, evidence contents, signed URLs, secrets or unnecessary customer PII into PostHog or console logs. Durable audit records contain reason codes and references; private evidence remains in protected storage.

## Disaster Recovery and Replay

Database backup alone is insufficient. Supabase states that database backups contain Storage metadata but do **not** restore deleted Storage objects. Before live unattended billing:

1. Approve a financial RPO/RTO. If daily-backup loss is unacceptable, enable Supabase PITR or an equivalent WAL-based recovery tier; do not imply that a daily backup meets a shorter RPO.
2. Maintain encrypted off-project logical exports of agreements, invoice documents, subledger, provider inbox metadata, controls and audit records according to retention policy.
3. Back up private evidence objects separately using a content-addressed manifest of path, byte size and SHA-256. Test readback and restore; database object metadata alone is not proof.
4. Preserve provider cursor/watermark and replay procedures. After restore, pull an overlap window from the provider and reprocess idempotently.
5. Restore into an isolated Supabase project on a schedule. Recreate non-backed-up secrets/custom role credentials through controlled configuration, not from application tables.
6. Start a restored environment with all live money/contact switches off. Rebuild projections, prove every subledger transaction balances, reconcile provider state through current time, then require explicit operator promotion.
7. Record measured RPO, RTO, missing objects/events, reconciliation delta and rollback result as promotion evidence.

## Scaling Considerations

| Scale | Architecture adjustment |
|-------|-------------------------|
| RC Digital now: a few operators, hundreds to low thousands of invoices/year | One Supabase project, one PostgreSQL financial kernel, PGMQ/logged jobs, one short-lived worker lane, server-side aggregates, no microservices |
| Tens of thousands of invoices / bursty month-end | Add bounded parallel workers, per-provider/account rate-limit lanes, composite/partial indexes, keyset pagination, queue-age alerts, and targeted read-model caching |
| Millions of provider/audit events | Partition only measured append-only hot tables by received/effective date, archive raw payloads under retention rules, add read replicas/warehouse exports for analytics, keep command source of truth in PostgreSQL |
| Edge runtime or provider throughput becomes limiting | Move the stateless queue consumer to a dedicated worker runtime while retaining the same database leases, inbox/outbox, adapter and idempotency contracts |

### Scaling Priorities

1. **Correctness before throughput:** full migration/RLS/provider/concurrency/recovery tests.
2. **Database query shape:** tenant-leading indexes, unique provider/source keys, actionable partial indexes, keyset event pagination and server-side financial aggregates.
3. **Worker concurrency:** add consumers only after leases, idempotency, per-account ordering and provider rate limits are proven.
4. **Event volume:** keep raw provider events out of broad Supabase Realtime publication; emit compact resource-level UI invalidations.
5. **Service extraction last:** split only when one independently scaling workload has measured limits or distinct compliance isolation—not because the domain has multiple modules.

## Anti-Patterns

### Mutable Invoice Row as Ledger

**What people do:** Set `invoices.status = 'Paid'`, overwrite `paid_date`, and delete/correct rows in place.
**Why it is wrong:** It cannot prove partial payments, returns, refunds, fees, disputes, allocations or who changed the claim.
**Do this instead:** Immutable invoice versions and events plus append-only balanced subledger transactions and allocations.

### Browser-Orchestrated Financial Transactions

**What people do:** Calculate a total in React, update an invoice, call a provider, then update status in several requests.
**Why it is wrong:** Partial failure creates divergence and the browser can tamper with amount or tenant identity.
**Do this instead:** One named server command creates authoritative state and durable operation intent transactionally.

### Acknowledge-Then-Persist Webhooks

**What people do:** Return `2xx`, then rely on `waitUntil`, console logs or an in-memory callback to save/process the event.
**Why it is wrong:** Runtime termination after acknowledgement loses the only copy.
**Do this instead:** Verify raw signature, atomically persist/deduplicate/enqueue, commit, then acknowledge; process asynchronously.

### Synchronous Side Effects Inside Webhook Intake

**What people do:** Call email, invoice, provider and ledger services before returning.
**Why it is wrong:** Provider timeouts cause retries, duplicate work and unpredictable partial completion.
**Do this instead:** Keep intake short; queue idempotent transition work after durable commit.

### Provider Redirect or Event Order as Truth

**What people do:** Mark a mandate active from a browser redirect, or apply events in delivery order.
**Why it is wrong:** Redirects are untrusted and Stripe does not guarantee ordering; ACH has delayed/return states.
**Do this instead:** Confirm from signed webhook/API snapshots and an order-tolerant transition model.

### Provider Idempotency as the Only Duplicate Barrier

**What people do:** Generate a new key on every retry or assume the provider retains keys forever.
**Why it is wrong:** Retention is bounded and the application can enqueue duplicate business intents months apart.
**Do this instead:** Permanent local uniqueness for the business operation plus the same stable key on every provider retry.

### Service Role as Authorization

**What people do:** Treat a valid Supabase JWT as enough, then use `service_role` against caller-supplied record IDs/paths.
**Why it is wrong:** The service role bypasses RLS and can cross tenant/account boundaries.
**Do this instead:** Reload caller membership and target ownership server-side; keep service keys out of browsers; use narrow commands.

### RLS Tables With Leaky Views/Functions

**What people do:** Enable RLS but expose default views or unsafe `SECURITY DEFINER` functions.
**Why it is wrong:** Default view/definer behavior can bypass the policy boundary.
**Do this instead:** Security-invoker views, restricted grants, locked `search_path`, schema-qualified names, ownership checks and real JWT integration tests.

### Collections From `due_date` Alone

**What people do:** Email or recharge every invoice where status is overdue.
**Why it is wrong:** It ignores pending ACH, unreconciled payments, disputes, consent, quiet hours, caps and legal holds.
**Do this instead:** Consume a fail-closed eligibility view and recheck before every side effect.

### “We Have Backups” Without Evidence Objects or Restore Tests

**What people do:** Rely on a green backup indicator.
**Why it is wrong:** Supabase database backup does not restore deleted Storage objects, and untested replay/configuration may make the restored financial system unusable.
**Do this instead:** Separate object backup/manifest, isolated restore, provider replay and zero-delta reconciliation exercises.

## Verification Architecture

The architecture is not ready for live money until tests exercise behavior, not SQL strings:

- Full clean migration chain and representative upgrade/backfill in CI.
- pgTAP RLS matrix for anonymous, operator roles, portal contacts, revoked memberships, cross-tenant/account access and automation principals.
- Command tests for stale versions, duplicate requests, unauthorized transitions, compensating corrections and transaction rollback.
- Money property tests for floors, negative adjustments/refunds, period boundaries, rounding ties, large values, reruns and true-ups.
- Concurrent tests proving one billing run, invoice number, payment attempt, provider operation, event application and subledger transaction per unique source.
- Webhook tests for raw-body signature, invalid/rotated secret, batch size, duplicate IDs, two semantic duplicates, out-of-order events, DB failure before acknowledgement, timeout, replay and dead letter.
- Provider sandbox tests for hosted mandate, unknown outbound outcome, idempotent retry, failure/return/refund/dispute and payout item retrieval.
- Reconciliation fixtures proving gross, fees, refunds, disputes and payout/deposit net with durable unmatched cases.
- Portal E2E tests for cross-account denial, signed URL expiry, upload finalization, dispute hold and no internal resource leakage.
- Recovery test that restores database and evidence objects, replays an overlap window, rebuilds projections and proves zero unexplained subledger/reconciliation delta.

## Sources

### High-confidence official sources

- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) — grants plus policies, service-role bypass, security-invoker views, policy tests and `SECURITY DEFINER` precautions.
- [Supabase Storage buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals) and [Storage access control](https://supabase.com/docs/guides/storage/security/access-control) — private bucket/RLS/signed URL model and service-key bypass.
- [Supabase PGMQ queues](https://supabase.com/docs/guides/queues/pgmq) — durable logged queues, visibility timeouts, explicit archive/delete and replayability.
- [Supabase Edge Function background tasks](https://supabase.com/docs/guides/functions/background-tasks) and [limits](https://supabase.com/docs/guides/functions/limits) — background execution is runtime-bounded, supporting durable queue-backed work rather than in-memory-only jobs.
- [Supabase database migrations](https://supabase.com/docs/guides/deployment/database-migrations) — migration-driven schema evolution.
- [Supabase database backups and PITR](https://supabase.com/docs/guides/platform/backups) — recovery granularity and the explicit exclusion of Storage objects from database backups.
- [PostgreSQL numeric types](https://www.postgresql.org/docs/current/datatype-numeric.html) — exact `numeric` versus inexact floating point; this architecture chooses even simpler minor-unit integers for stored money.
- [PostgreSQL `SELECT ... FOR UPDATE SKIP LOCKED`](https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE) — queue-like multi-consumer row claiming.
- [Stripe webhook guidance](https://docs.stripe.com/webhooks) — raw-body signature verification, quick acknowledgement, asynchronous handling, duplicates and non-guaranteed ordering.
- [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests) — stable POST idempotency keys and bounded retention.
- [Stripe ACH Direct Debit](https://docs.stripe.com/payments/ach-direct-debit) — hosted bank detail collection, mandates, delayed processing, failures/disputes and ACH authorization obligations.
- [Stripe payout reconciliation reports](https://docs.stripe.com/reports/report-types/payout-reconciliation) — itemized balance transaction and payout reconciliation evidence.
- [GoCardless Hosted Pages](https://developer.gocardless.com/integration-types/gocardless-hosted-pages) — hosted Billing Request Flow and webhook-confirmed outcome.
- [GoCardless webhook guide](https://developer.gocardless.com/getting-started/staying-up-to-date-with-webhooks) — signature verification, deduplication records and asynchronous processing.
- [GoCardless API idempotency guidance](https://developer.gocardless.com/api-reference#api-usage-making-requests-idempotency-keys) — stable creation key behavior and at-least-30-day retention.
- [GoCardless payout reconciliation](https://developer.gocardless.com/payouts/reconciling-payouts) — payout-item credits/debits for payments, fees, failures, refunds and chargebacks.

### Project evidence

- `.planning/PROJECT.md` — locked scope, constraints and hard delivery order.
- `.planning/AUDIT-CLAUDE-2026-08-20.md` — independently verified P0 prerequisites.
- `.planning/codebase/ARCHITECTURE.md`, `STRUCTURE.md`, `INTEGRATIONS.md`, `TESTING.md`, and `CONCERNS.md` — current brownfield boundaries, unsafe precedents and missing capabilities.
- RC Digital billing/revenue-operations Innovate synthesis, 2026-08-19 — agreement/evidence formula, build/buy line and pilot strategy.

## Confidence and Open Decisions

| Area | Confidence | Remaining decision |
|------|------------|--------------------|
| Modular monolith and PostgreSQL invariant ownership | HIGH | None before roadmap; this matches the current stack and scale |
| Tenant/RLS/private Storage boundary | HIGH | Final billing role matrix and whether portal users use the same Auth project |
| Minor-unit money and immutable snapshots | HIGH | Exact negative/tie rounding rule must be approved with agreement/legal/accounting owners |
| Inbox/outbox/queue semantics | HIGH | Prefer PGMQ; confirm extension availability in the target project during the platform phase |
| Minimal balanced operational subledger | HIGH | Final fixed account kinds and accounting export mapping require accountant review |
| Provider adapter | MEDIUM | GoCardless versus Stripe live choice is deliberately deferred to the sandbox spike |
| Reconciliation | HIGH conceptually | Exact provider objects/reports and bank-deposit evidence depend on chosen provider/account plan |
| Recovery | HIGH for required design | Business-approved RPO/RTO and PITR/off-project storage budget remain open |

---
*Architecture research for: RC Digital Billing Operations*
*Researched: 2026-08-20*
