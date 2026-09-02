# Roadmap: RC Digital Billing Operations

## Overview

RC Digital Billing Operations will be delivered as ten dependency-gated
horizontal capability layers. The sequence first establishes executable release
proof, tenant security, and an exact money contract; then adds agreements,
evidence, invoicing, provider operations, and reconciliation; and only then
opens operator controls, the customer portal, collections, and bounded live
autonomy. Work may run in parallel inside a phase after its contracts are
stable, but no money-bearing or customer-facing workflow may bypass the exit
evidence of a prerequisite phase.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Executable Financial Test and Release Gate** - Prove migrations, authorization, integration behavior, and staged releases before financial schema can ship.
- [x] **Phase 2: Tenant, Role, and Evidence Security** - Establish the account boundary, least privilege, private evidence, and real cross-tenant denial.
- [ ] **Phase 3: Exact Money and Rounding Contract** - Give every later financial workflow one exact minor-unit and rounding vocabulary.
- [ ] **Phase 4: Agreements, Revenue Evidence, and Calculation Close** - Make the signed terms and accepted evidence produce frozen, reproducible monthly calculations.
- [ ] **Phase 5: Immutable Invoicing and Durable Provider Operations** - Create immutable obligations, durable payment commands, and a sandbox-backed provider decision.
- [ ] **Phase 6: Provider-to-Bank Reconciliation** - Derive balances from complete provider and bank evidence with durable exception handling.
- [ ] **Phase 7: Controls, Observability, and Recovery** - Make financial automation stoppable, diagnosable, auditable, and recoverable before live use.
- [ ] **Phase 8: Restricted Customer Portal and Dispute Holds** - Give billing contacts a tenant-safe self-service surface whose disputes stop affected automation.
- [ ] **Phase 9: Reconciliation-Gated Workspace and Collections** - Deliver complete operator billing work and bounded follow-up from reconciled, eligible balances.
- [ ] **Phase 10: Shadow Pilot and Bounded Autonomy** - Prove fixed and hybrid cycles, satisfy governance gates, and promote live work reversibly.

## Phase Details

### Phase 1: Executable Financial Test and Release Gate

**Goal**: Maintainers and release owners can prove that financial changes migrate, authorize, fail, and deploy safely before those changes can reach production.
**Depends on**: Nothing (first phase)
**Requirements**: REL-01, REL-02, REL-03, REL-04, REL-05
**Success Criteria** (what must be TRUE):

  1. A maintainer can apply the full migration chain to a clean local Supabase instance and upgrade a production-like prior schema without losing or silently rewriting financial facts.
  2. A maintainer can run real PostgreSQL, RLS, RPC, trigger, Edge Function, webhook, concurrency, and provider-contract tests under representative authenticated claims.
  3. CI rejects money-bearing changes when executable migration, authorization, replay, failure-path, vulnerability, source-map, or secret checks fail.
  4. A release owner can independently deploy schema, functions, frontend, and dormant financial behavior through verified expand-contract stages with flags, rollback instructions, and immutable receipts.

**Plans**: 10 plans

Plans:

**Wave 1**

- [x] 01-01-PLAN.md — Encode the release policy, receipt schema, isolated Supabase runner, and stable command surface.
- [x] 01-07-PLAN.md — Remediate critical/high dependencies, tracked-secret exposure, and public source maps.

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — Repair and prove clean migration replay plus local schema push.
- [x] 01-08-PLAN.md — Build content-addressed receipts and private evidence publication/readback.

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-03-PLAN.md — Freeze baseline 001 and prove exact representative upgrades.
- [x] 01-04-PLAN.md — Execute real PostgreSQL, Auth, RLS, RPC, and trigger authorization tests.
- [x] 01-05-PLAN.md — Execute running Edge Function, webhook, and provider failure contracts.
- [x] 01-06-PLAN.md — Prove replay, ordering, and simultaneous-command safety in PostgreSQL.

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 01-09-PLAN.md — Install six independent merge-queue checks and verify the protected main ruleset.

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 01-10-PLAN.md — Replace coupled deploys with attested build, staged promotion, separate enablement, and rollback receipts.

### Phase 2: Tenant, Role, and Evidence Security

**Goal**: Operators, customer contacts, and automation can act only inside an explicit billing account boundary, while financial evidence remains private and privileged commands remain narrowly authorized.
**Depends on**: Phase 1
**Requirements**: WORK-01, SEC-01, SEC-02, SEC-03, SEC-04, SEC-05, SEC-06, SEC-07
**Success Criteria** (what must be TRUE):

  1. An operator can manage a billing account, responsible owner, billing status, and authorized billing contacts inside an explicit organization/account boundary.
  2. Administrators can assign separated billing roles, and every automation principal is restricted to named accounts, commands, providers, policies, and action limits.
  3. Real two-tenant tests prove that operators, customer contacts, automation principals, and signed links cannot read or mutate another account's data.
  4. Contracts and financial evidence use private server-authorized storage with short-lived access, quarantine, retention, and access logs.
  5. Privileged functions bind caller and tenant ownership with a locked `search_path`, while logs and exports redact secrets, credentials, sensitive provider fields, and unnecessary evidence.

**Plans**: 12 plans
**UI hint**: yes

Plans:

**Wave 1**

- [x] 02-01-PLAN.md — Install the human tenant/account/role/audit kernel and live SQL contracts.
- [x] 02-06-PLAN.md — Build recursive redaction and safe Edge error/log boundaries.

**Wave 2** *(blocked on Wave 1 foundations as declared per plan)*

- [x] 02-02-PLAN.md — Backfill inherited invoices into the explicit account boundary with append-only upgrade proof.
- [x] 02-04-PLAN.md — Install exact transactional automation principals, grants, limits, and concurrency proof.
- [x] 02-05-PLAN.md — Install private quarantine-first evidence metadata, storage, retention, and access history.
- [x] 02-08-PLAN.md — Define typed Supabase/FakeRest billing data contracts and safe deterministic fixtures.

**Wave 3** *(blocked on the applicable Wave 2 contracts)*

- [x] 02-03-PLAN.md — Prove human role/account isolation through real Auth JWT and PostgREST effects.
- [x] 02-07-PLAN.md — Expose caller-bound signed evidence upload, inspection, and short-lived download commands.
- [x] 02-09-PLAN.md — Build responsive billing-account list/create/edit/detail and allowlisted export surfaces.

**Wave 4** *(blocked on backend commands and account UI)*

- [x] 02-10-PLAN.md — Add scoped access/evidence panels and exclude sensitive billing query persistence.

**Wave 5** *(blocked on complete account UI)*

- [x] 02-11-PLAN.md — Register desktop/mobile resources and encode source/preview/production rendered contracts.

**Wave 6** *(blocked on all security and UI contracts)*

- [x] 02-12-PLAN.md — Couple Phase 2 into protected financial lanes and retain full source proof.

### Phase 3: Exact Money and Rounding Contract

**Goal**: Every later calculation, invoice, payment, and ledger fact shares an exact and testable representation of money, rates, and rounding.
**Depends on**: Phase 2
**Requirements**: CALC-01, CALC-03
**Success Criteria** (what must be TRUE):

  1. Authoritative money crosses PostgreSQL, server, and browser boundaries as integer minor units with explicit currency, while rates remain exact scaled or rational values.
  2. Each supported currency and formula version names a rounding policy that deterministically handles fractional minor units, ties, negative adjustments, and currency boundaries.
  3. Boundary and property fixtures prove that JavaScript floating-point values cannot become authoritative financial amounts.

**Plans**: TBD

### Phase 4: Agreements, Revenue Evidence, and Calculation Close

**Goal**: Authorized operators can turn immutable commercial terms and reviewed monthly evidence into one frozen, explainable, and reproducible calculation close.
**Depends on**: Phase 3
**Requirements**: AGR-01, AGR-02, AGR-03, AGR-04, AGR-05, REV-01, REV-02, REV-04, REV-05, REV-06, REV-07, REV-08, REV-09, CALC-02, CALC-04, CALC-05, CALC-06, CALC-07
**Success Criteria** (what must be TRUE):

  1. An authorized operator can activate non-overlapping immutable versions of fixed, percentage, minimum-support, and hybrid agreements with exact commissionable-revenue definitions and audited changes.
  2. Each applicable account receives one monthly revenue period whose submissions retain provenance, submitter, evidence hashes, immutable revisions, and reviewer decisions.
  3. Missing or questionable evidence creates an owned exception and never an estimate; a contract-permitted minimum draft requires approval and late evidence creates a linked true-up or credit.
  4. Fixed, percentage, minimum, and hybrid calculations freeze their terms, evidence, policy version, intermediate values, result, currency, and human-readable explanation and replay exactly.
  5. An operator can preview month-over-month differences, while duplicates, anomalies, changed inputs, and unsatisfied close policy stop safely before issuance.

**Plans**: TBD
**UI hint**: yes

### Phase 5: Immutable Invoicing and Durable Provider Operations

**Goal**: Approved calculations become immutable invoice obligations and durable, replay-safe provider operations without placing payment credentials or ambiguous side effects inside the CRM.
**Depends on**: Phase 4
**Requirements**: INV-01, INV-02, INV-03, INV-06, PAY-01, PAY-02, PAY-04, PAY-05, PAY-06, PAY-07, PAY-09, REC-01, REC-02, AUTO-01, AUTO-02
**Success Criteria** (what must be TRUE):

  1. An approved calculation produces at most one invoice draft, and issuance freezes its number, account, period, lines, dates, currency, agreement, calculation, and delivery policy.
  2. Issued invoices cannot be edited or hard deleted; corrections use linked documents or events, and every invoice or notice delivery attempt retains its outcome and proof.
  3. Stripe and GoCardless execute the same sandbox fixtures, hosted credential and notice boundaries, and operational scorecard before one live provider is selected.
  4. Every provider command has a permanent local intent and stable idempotency key, while raw-body-verified webhooks are persisted, deduplicated, queued, and made safe under replay and reordering.
  5. Durable jobs, immutable payment facts, balanced subledger postings, and full/partial/unapplied allocations survive retries and restarts without duplicating invoices, debits, notifications, allocations, or transitions.

**Plans**: TBD
**UI hint**: yes

### Phase 6: Provider-to-Bank Reconciliation

**Goal**: Operators can distinguish provisional payment progress from bank-reconciled cash and resolve every mismatch without overwriting source facts.
**Depends on**: Phase 5
**Requirements**: INV-05, PAY-08, REC-03, REC-04, REC-05, REC-06, REC-07, REC-08
**Success Criteria** (what must be TRUE):

  1. Initiated, processing, provider-confirmed, paid-out, bank-reconciled, failed, returned, disputed, refunded, and reversed states remain visibly distinct.
  2. Provider objects, events, balances, payouts, and payout items ingest through overlap-safe watermarks, pagination, backfill, and retention controls.
  3. Invoice balances and aging derive from immutable events and allocations, and matching controls connect obligations, attempts, fees, refunds, returns, disputes, payouts, and bank deposits.
  4. Exact matches close idempotently, while missing, duplicate, stale, and mismatched items remain in an owned queue until an authorized reviewer explains and resolves them.
  5. Late returns or corrected settlements add compensating facts and reopen affected balances, and bank reconciliation requires itemized traceability from invoice allocation through payout to bank evidence.

**Plans**: TBD
**UI hint**: yes

### Phase 7: Controls, Observability, and Recovery

**Goal**: Authorized operators can stop, inspect, explain, restore, and safely resume every financial workflow before any unattended live collection is allowed.
**Depends on**: Phase 6
**Requirements**: AUTO-03, AUTO-04, AUTO-05, AUTO-06, AUTO-07, OPS-01, OPS-02, OPS-03, OPS-04, OPS-05, OPS-06, OPS-07, GOV-05
**Success Criteria** (what must be TRUE):

  1. Each workflow/customer runs in disabled, shadow, approval, or live mode under versioned policies, and hierarchical kill switches are rechecked before external side effects.
  2. Operators can inspect and safely retry, resolve, or cancel eligible queue and dead-letter work, and every approval or override retains actor, role, reason, evidence, policy, and before/after state.
  3. Correlation IDs, dashboards, silence detection, and owned alerts expose queue/provider lag, duplicate suppression, failed transitions, reconciliation deltas, holds, delivery errors, and amount at risk.
  4. Auditors can export redacted contract-to-cash evidence, while approved retention and legal/incident holds protect required authorization, notice, and financial records.
  5. Approved RPO/RTO, isolated database-and-object restoration, disabled-side-effect provider replay, and recurring recovery exercises produce immutable proof of recoverability.

**Plans**: TBD
**UI hint**: yes

### Phase 8: Restricted Customer Portal and Dispute Holds

**Goal**: Customer billing contacts can report revenue, understand obligations, manage hosted authorization, and dispute activity through a tenant-safe surface that cannot expose the internal CRM.
**Depends on**: Phases 2, 4, 5, and 7
**Requirements**: REV-03, INV-04, PAY-03, PORT-01, PORT-02, PORT-03, PORT-04, PORT-05, PORT-06, PORT-07
**Success Criteria** (what must be TRUE):

  1. Administrators can invite, disable, and account-scope customer contacts without CRM access, and invitation, session, redirect, signed-link, mobile, and cross-tenant tests protect that boundary.
  2. A customer contact can submit or revise open-period revenue, attest to it, and upload supporting evidence through private server-authorized storage.
  3. A customer contact can view invoice status, balance, receipts, notices, payment history, and a customer-safe downloadable explanation without seeing internal notes or another account.
  4. A customer contact can establish, replace, or revoke hosted payment authorization without RC Digital receiving raw credentials, and effective revocation prevents future debits.
  5. A customer contact can open a durable evidence-backed dispute whose creation atomically suppresses affected debit, retry, reminder, and escalation work until authorized resolution.

**Plans**: TBD
**UI hint**: yes

### Phase 9: Reconciliation-Gated Workspace and Collections

**Goal**: Operators can run monthly billing and bounded customer follow-up from one complete workspace without contacting ineligible balances or duplicating communication.
**Depends on**: Phases 6, 7, and 8
**Requirements**: WORK-02, WORK-03, WORK-04, WORK-05, COLL-01, COLL-02, COLL-03, COLL-04, COLL-05, COLL-06, COLL-07
**Success Criteria** (what must be TRUE):

  1. For a selected month, an operator can see each customer's plan, evidence, calculated, invoiced, collected, outstanding, aging, and next-action state and drill every dollar into its complete source history.
  2. Operators can filter and export billing work and safely triage assigned exceptions on supported desktop and mobile layouts according to role and device safety.
  3. Collections eligibility excludes disputed, held, unreconciled, processing, recently paid, and otherwise ineligible balances while showing accurate contacts, promises, and next action.
  4. Versioned contact policies control approved contacts, channels, content, quiet hours, waits, caps, limits, and escalation boundaries and are rechecked immediately before release.
  5. Unique action keys prevent duplicate contact, routine reminders become unattended only after promotion, and refunds, retries, write-offs, suspension, and legal escalation remain human-authorized in v1.

**Plans**: TBD
**UI hint**: yes

### Phase 10: Shadow Pilot and Bounded Autonomy

**Goal**: RC Digital can authorize and run a tightly allowlisted live pilot only after shadow evidence, governance approval, loss limits, and rollback proof satisfy versioned thresholds.
**Depends on**: Phase 9
**Requirements**: GOV-01, GOV-02, GOV-03, GOV-04, PILOT-01, PILOT-02, PILOT-03, PILOT-04, PILOT-05, PILOT-06
**Success Criteria** (what must be TRUE):

  1. Before live debit, RC Digital has approved provider/ODFI responsibilities, applicable legal/compliance policy, and accountant-approved subledger/export mapping.
  2. Provider eligibility, terms, controls, notices, reconciliation coverage, retention, incidents, complaints, and material changes have an initial and recurring owner.
  3. Fixed and percentage-plus-minimum fixtures complete at least two representative shadow cycles while capturing reliability, reconciliation, dispute, contact-error, recovery, and rollback metrics from the first cycle.
  4. A business owner can approve versioned thresholds, loss/action limits, operators, alerts, rollback authority, and an initial allowlist of one fixed and one hybrid customer with production receipts.
  5. Violating authorization, idempotency, reconciliation, loss, error, silence, or recovery invariants automatically pauses or demotes the affected workflow/customer, and autonomy advances independently by workflow and customer.

**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute through the hard chain 1 → 2 → 3 → 4 → 5 → 6 → 7. Phase
8 additionally requires Phases 2, 4, 5, and 7; Phase 9 requires Phases 6, 7,
and 8; Phase 10 requires all prior safety surfaces. Safe parallelism is allowed
inside a phase only after shared schemas and command contracts stabilize.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Executable Financial Test and Release Gate | 10/10 | Complete | 2026-09-01 |
| 2. Tenant, Role, and Evidence Security | 12/12 | Complete | 2026-09-01 |
| 3. Exact Money and Rounding Contract | 0/TBD | Not started | - |
| 4. Agreements, Revenue Evidence, and Calculation Close | 0/TBD | Not started | - |
| 5. Immutable Invoicing and Durable Provider Operations | 0/TBD | Not started | - |
| 6. Provider-to-Bank Reconciliation | 0/TBD | Not started | - |
| 7. Controls, Observability, and Recovery | 0/TBD | Not started | - |
| 8. Restricted Customer Portal and Dispute Holds | 0/TBD | Not started | - |
| 9. Reconciliation-Gated Workspace and Collections | 0/TBD | Not started | - |
| 10. Shadow Pilot and Bounded Autonomy | 0/TBD | Not started | - |
