# RC Digital Billing Operations

## What This Is

RC Digital Billing Operations extends the existing RC Digital CRM into the
system of record for customer agreements, monthly revenue evidence,
commission and minimum-support calculations, invoices, payment status,
reconciliation, and collections follow-up. It serves RC Digital operators and
future staff, with a restricted customer portal for billing contacts to submit
revenue evidence, review invoices, establish hosted payment authorization, and
raise disputes.

Normal billing work should run without a human in the loop. The first
production policy is fail-closed: routine, provable operations proceed
automatically, while ambiguous or financially irreversible exceptions pause
with durable evidence until an authorized operator resolves them.

## Core Value

Every dollar billed and collected is automatically traceable to the applicable
agreement version, verified revenue evidence, deterministic calculation,
invoice, payment-provider event, settlement, and collections history.

## Requirements

### Validated

- ✓ RC Digital can authenticate operators and manage companies, contacts,
  deals, tasks, notes, sales ownership, leads, and attribution records —
  existing CRM.
- ✓ The application has a replaceable data-provider boundary with production
  Supabase and in-browser FakeRest implementations — existing architecture.
- ✓ Supabase provides PostgreSQL persistence, Auth, Storage, Realtime, RLS,
  migrations, RPCs, and authenticated Edge Functions — existing backend.
- ✓ Database migrations provide initial project, project analytics, and invoice
  schema foundations — existing but not yet exposed as complete workflows.
- ✓ The application has separate desktop and mobile compositions plus reusable
  React Admin and Shadcn/Radix component patterns — existing UI foundation.
- ✓ Vitest, TypeScript, ESLint/Prettier, GitHub Actions, and local Supabase
  commands provide an initial verification toolchain — existing quality
  foundation.

### Active

- [ ] Harden tenant and role authorization before financial data is introduced,
  including billing-specific roles, private evidence storage, and removal of
  payment-relevant permissive RLS paths.
- [ ] Model immutable, versioned customer billing agreements covering fixed,
  percentage-of-revenue, minimum-support, and hybrid compensation plans.
- [ ] Define commissionable revenue precisely and capture monthly revenue
  periods, submissions, source provenance, evidence, attestations, review
  status, exceptions, and true-ups.
- [ ] Calculate invoice amounts deterministically using integer minor units,
  versioned formulas, immutable input/output snapshots, and reproducible
  rounding rules.
- [ ] Complete project, analytics, invoice, and billing workflows in the
  existing CRM for both intentional desktop and mobile operator use.
- [ ] Give customer billing contacts a restricted portal for revenue reporting,
  evidence upload, invoice access, hosted payment setup, and disputes without
  exposing internal CRM data.
- [ ] Integrate hosted payment providers through an adapter boundary while
  keeping bank/card credentials and mandate capture outside RC Digital.
- [ ] Persist verified provider events, payment attempts, allocations, fees,
  refunds, disputes, payouts, and invoice status events as an auditable
  financial subledger.
- [ ] Reconcile invoice obligations, provider activity, settlements, fees,
  refunds, and net bank deposits with durable unmatched-item handling.
- [ ] Automate recurring billing, invoice delivery, reminders, revenue-reporting
  follow-up, payment recovery, and collections tasks according to versioned
  policies, consent, quiet hours, attempt caps, legal holds, and customer pauses.
- [ ] Run unattended work through a durable queue with leases, idempotency,
  retry/backoff, rate limits, dead-letter handling, structured errors, and
  restart-safe state transitions.
- [ ] Provide shadow/dry-run mode, per-customer and global kill switches,
  anomaly detection, reconciliation-delta alerts, health dashboards, audit
  exports, backup/restore validation, and disaster recovery controls.
- [ ] Prove financial correctness and access control through real migration,
  database, Edge Function, webhook, concurrency, provider-sandbox, end-to-end,
  and recovery tests rather than source-string assertions alone.
- [ ] Graduate workflows from fail-closed automation toward maximum autonomy
  only when measured reliability, reconciliation accuracy, bounded loss, and
  rollback evidence satisfy explicit promotion criteria.

### Out of Scope

- Building or operating an ACH/card processor, storing raw card numbers, or
  storing raw bank credentials — use hosted, compliant provider surfaces.
- Treating the CRM as the accounting general ledger, tax filing engine, payroll
  system, or legal collections platform — integrate with specialized systems.
- Automatically changing contract terms, commission definitions, or customer
  authorization — these require an authenticated, versioned agreement event.
- Automatically issuing refunds, credits, write-offs, service suspension, or
  legal escalation in the initial release — fail closed until each action has
  separate policy limits and proven reliability.
- Maximum-autonomy exception handling in the initial release — it is a future
  promotion target, not a v1 assumption.
- Multi-currency and non-US payment rails in the initial release — establish
  correct USD/US operations before expanding jurisdictions.

## Context

RC Digital currently receives one-off or manually initiated monthly ACH
payments. Some customer compensation is fixed, while other agreements use a
percentage of commissionable revenue with a negotiated minimum support fee,
for example `max($500, 10% × commissionable revenue)`. The immediate operational
problem is that RC Digital may not have access to the customer's revenue CRM,
making the monthly amount difficult to verify without a structured reporting
and evidence process.

The existing repository is a React 19, TypeScript, Vite, React Admin/ra-core,
Shadcn/Radix, and Supabase application. Migrations exist for projects,
analytics, and invoices, but desktop navigation points at unregistered
resources and the current invoice schema is a mutable document/status row, not
a financial ledger. Revenue has multiple competing meanings across project,
analytics, deal, attribution, and invoice records.

The codebase map identified material prerequisites for unattended money work:
permissive legacy RLS, a public attachment bucket, no payment-provider boundary,
no durable queue, no reconciliation engine, no billing roles, no kill switch,
no dead-letter/operator tooling, browser-side financial aggregates, incomplete
database integration testing, and production dependency vulnerabilities. These
are roadmap requirements, not cleanup to postpone until after payment launch.

Revenue evidence will use a controlled fallback ladder: read-only system API,
automated export, authorized customer portal attestation with supporting
evidence, then a contract-permitted minimum invoice with a later true-up. The
system must never silently guess customer revenue.

## Constraints

- **Brownfield architecture**: Extend `rc-digital-crm` and its established
  React Admin/Supabase provider patterns — do not create a second CRM.
- **Payment scope**: Hosted providers own payment credentials, mandates, ACH or
  card origination, fraud controls, returns, disputes, and settlement.
- **Autonomy**: Routine operations may run unattended only when preconditions,
  evidence, policy version, idempotency, and reconciliation invariants pass.
- **Fail-closed exceptions**: Unverified revenue, changed agreements, anomalous
  calculations, provider mismatches, disputes, refunds/write-offs, legal holds,
  and service suspension pause for authorized review in the initial release.
- **Financial precision**: Store money as integer minor units with explicit
  currency; never use floating-point arithmetic for balances or charges.
- **Auditability**: Financial facts and state transitions are append-only or use
  compensating records; issued invoices and calculation snapshots are immutable.
- **Security**: Enforce least privilege at PostgreSQL RLS and server boundaries;
  browser visibility controls are not authorization.
- **Evidence privacy**: Contracts, statements, receipts, and dispute documents
  live in private storage with short-lived access, retention, and access logs.
- **Reliability**: Provider intake is signature-verified, replay-safe,
  idempotent, order-tolerant, and durable before acknowledgement.
- **Deployment**: Introduce schema and provider behavior with expand-contract
  migrations, shadow mode, feature flags, kill switches, and independently
  verifiable rollout stages.
- **Initial market**: USD and US payment rails first.
- **Budget**: Prefer usage-based, low-fixed-cost infrastructure while preserving
  provider portability and an accounting-system integration path.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Extend the existing RC Digital CRM | Customer, contact, deal, provider, UI, and Supabase foundations already exist | — Pending |
| RC Digital owns billing logic but not payment rails | Keeps contract and calculation control while reducing sensitive payment scope | — Pending |
| Start with fail-closed autonomy | Routine work can be unattended without letting ambiguous exceptions move money or damage customer relationships | — Pending |
| Treat maximum autonomy as a promotion target | Higher autonomy should be earned with measured reliability, not assumed at launch | — Pending |
| Include a restricted customer portal in v1 | Revenue evidence and disputes need a secure fallback when direct customer-system access is unavailable | — Pending |
| Use immutable agreement and calculation versions | Historical invoices must remain reproducible after terms or formulas change | — Pending |
| Build a financial subledger beside invoice documents | A mutable invoice status cannot prove payment, refund, dispute, or settlement history | — Pending |
| Use a provider adapter with GoCardless as first sandbox candidate and Stripe as fallback | Preserves portability while testing lower-cost ACH and broader invoice/card capabilities | — Pending |
| Separate normal automation from exception policy | Allows routine human-out-of-loop operation with explicit stop conditions and later bounded promotion | — Pending |
| Require shadow cycles before live charging | Provider, formula, delivery, reconciliation, and collections behavior must be compared without moving money first | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition**:
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone**:
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-08-20 after project initialization*
