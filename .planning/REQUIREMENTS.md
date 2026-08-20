# Requirements: RC Digital Billing Operations

**Defined:** 2026-08-20  
**Core Value:** Every dollar billed and collected is automatically traceable
to the applicable agreement version, verified revenue evidence, deterministic
calculation, invoice, payment-provider event, settlement, and collections
history.

## User Stories

- As an RC Digital operator, I can see every customer's billing contacts,
  agreement, monthly revenue status, calculated compensation, invoices,
  collections status, and next action in one workspace.
- As a customer billing contact, I can securely report revenue, provide
  evidence, understand an invoice, manage hosted payment authorization, and
  dispute a charge without accessing RC Digital's internal CRM.
- As an authorized reviewer, I can approve or pause exceptional financial
  actions with the complete evidence chain and no need to reconstruct history
  from email or provider dashboards.
- As an auditor or business owner, I can trace billed, collected, outstanding,
  returned, refunded, and reconciled money back to immutable source facts.
- As RC Digital grows, routine proven work can run unattended while ambiguous,
  unauthorized, or unreconciled work stops safely and tells an operator why.

## v1 Requirements

### Release Assurance

- [ ] **REL-01**: A maintainer can apply the complete database migration chain
  to a clean local Supabase instance and upgrade a production-like prior schema
  without losing or silently rewriting financial facts.
- [ ] **REL-02**: A maintainer can execute PostgreSQL, RLS, RPC, trigger, Edge
  Function, webhook, concurrency, and provider-contract integration tests under
  representative authenticated claims.
- [ ] **REL-03**: CI blocks money-bearing schema, privileged endpoint, provider,
  or automation changes unless their executable migration, authorization,
  replay, and failure-path tests pass.
- [ ] **REL-04**: A release owner can deploy schema, functions, frontend, and
  dormant financial features as independently verified expand-contract stages
  with feature flags, rollback instructions, and immutable release receipts.
- [ ] **REL-05**: A release owner can see and block unresolved critical or high
  production dependency vulnerabilities, public source maps, secret exposure,
  and unsafe deployment coupling before a financial feature is enabled.

### Customer and Operator Workspace

- [ ] **WORK-01**: An operator can manage a billing account with customer name,
  billing status, responsible RC Digital owner, billing-contact name, email,
  phone, and preferred contact method.
- [ ] **WORK-02**: An operator can see each customer's active payment plan,
  fixed or minimum monthly support amount, commission rate, evidence status,
  calculated amount, invoiced amount, collected amount, outstanding balance,
  aging, and next action for a selected month.
- [ ] **WORK-03**: An operator can drill from any monthly amount into its
  agreement, evidence, calculation, invoice, payment, reconciliation, dispute,
  and collections history.
- [ ] **WORK-04**: An operator can filter and export billing work by customer,
  month, owner, agreement type, evidence state, invoice state, payment state,
  reconciliation state, hold, and collections status.
- [ ] **WORK-05**: An operator can safely review and triage assigned billing
  exceptions on supported desktop and mobile layouts without exposing actions
  that are unsafe on the current device or role.

### Tenancy, Roles, and Evidence Security

- [ ] **SEC-01**: Every billing account, agreement, evidence record, invoice,
  payment fact, job, message, and audit event belongs to an explicit
  organization/account boundary enforced by PostgreSQL RLS.
- [ ] **SEC-02**: Real two-tenant integration tests prove that operators,
  customer contacts, automation principals, and signed document links cannot
  read or mutate another account's billing data.
- [ ] **SEC-03**: An administrator can assign least-privilege billing roles for
  administration, operation, review/approval, audit/read-only access, and
  restricted customer access with explicit separation of duties.
- [ ] **SEC-04**: Each automation principal is limited to named commands,
  accounts, provider accounts, policy versions, and amount/action boundaries
  required for its job.
- [ ] **SEC-05**: Contracts, revenue statements, receipts, disputes, and related
  evidence are stored privately under server-authorized paths with short-lived
  access, malware/quarantine handling, retention rules, and access logs.
- [ ] **SEC-06**: Every privileged database function and server command binds
  the caller to the target tenant, validates ownership, uses a locked
  `search_path`, and rejects client-controlled provider or financial identity.
- [ ] **SEC-07**: Financial logs, telemetry, exports, and support views redact
  secrets, raw payment credentials, sensitive provider payload fields, and
  unnecessary customer evidence.

### Agreements

- [ ] **AGR-01**: An authorized operator can create fixed monthly,
  percentage-of-revenue, minimum-support, and hybrid
  `max(minimum, rate × commissionable revenue)` agreement versions.
- [ ] **AGR-02**: Each agreement version records effective dates, currency,
  billing cadence, due terms, evidence deadline, minimum, rate, and the exact
  signed commercial terms that control calculation and collection.
- [ ] **AGR-03**: Each percentage or hybrid agreement defines commissionable
  revenue, cash-versus-accrual timing, included and excluded amounts, taxes,
  refunds/chargebacks, period boundaries, cutoff, dispute window, missing-report
  treatment, and true-up/credit treatment.
- [ ] **AGR-04**: Activated agreement versions are immutable and non-overlapping;
  amendments create a new effective-dated version without changing historical
  calculations or invoices.
- [ ] **AGR-05**: Agreement activation, amendment, pause, termination, and
  customer authorization require authenticated approval and produce an
  auditable event containing actor, reason, evidence reference, and timestamp.

### Revenue Evidence and Monthly Close

- [ ] **REV-01**: The system creates one idempotent monthly revenue period for
  each applicable account and agreement version.
- [ ] **REV-02**: An operator can register evidence provenance through the
  controlled ladder of authorized read-only source, automated export, customer
  portal submission, or contract-permitted minimum exception.
- [ ] **REV-03**: A customer billing contact can submit commissionable revenue
  for an open period, attest to its accuracy, and upload supporting evidence.
- [ ] **REV-04**: Every submission records source, submitter, timestamps,
  currency, gross and excluded amounts, evidence hashes, and immutable revision
  history.
- [ ] **REV-05**: An authorized reviewer can accept, reject, request correction,
  or place a hold on a submission with a reason and complete audit history.
- [ ] **REV-06**: Missing, conflicting, late, anomalous, or unverified revenue
  creates a visible exception and never causes the system to estimate revenue.
- [ ] **REV-07**: When the active agreement explicitly permits it, an authorized
  reviewer can approve a minimum-only invoice draft for a missed reporting
  deadline while preserving the unresolved evidence exception.
- [ ] **REV-08**: Late accepted evidence produces a linked compensating true-up
  or credit calculation without rewriting the original minimum invoice.
- [ ] **REV-09**: A reviewer can close a revenue period only when its applicable
  agreement, accepted inputs, evidence, exceptions, and approval state satisfy
  the versioned close policy.

### Exact Calculations

- [ ] **CALC-01**: All authoritative money is represented as integer minor units
  with explicit currency, and all rates use an exact scaled or rational form
  without JavaScript floating-point authority.
- [ ] **CALC-02**: The calculation engine deterministically supports fixed,
  percentage, minimum-support, and hybrid formulas from the effective agreement
  and accepted revenue period.
- [ ] **CALC-03**: Each formula version applies an explicitly named and tested
  rounding policy for fractional minor units, ties, negative adjustments, and
  currency boundaries.
- [ ] **CALC-04**: Every calculation freezes its agreement version, evidence
  inputs, formula/policy version, intermediate values, selected minimum or
  percentage result, final amount, currency, and human-readable explanation.
- [ ] **CALC-05**: Replaying a calculation from its snapshot produces the exact
  same result, and golden, property, boundary, and concurrency tests prove the
  supported formulas.
- [ ] **CALC-06**: Duplicate runs return the existing calculation, while
  anomalous amounts, changed inputs, ambiguous terms, or policy violations
  pause before invoice issuance.
- [ ] **CALC-07**: An operator can preview and compare a calculation with the
  prior period before approving or automatically advancing it under policy.

### Invoices and Financial History

- [ ] **INV-01**: The system creates at most one invoice draft for an approved
  calculation run and preserves a permanent business idempotency key.
- [ ] **INV-02**: An authorized workflow can issue an invoice with a unique
  number, customer/account, billing period, immutable line items, dates,
  currency, agreement reference, calculation reference, and delivery policy.
- [ ] **INV-03**: Issued invoices cannot be edited or hard deleted; corrections,
  true-ups, credits, voids, and write-offs use linked compensating documents or
  events with separate authorization.
- [ ] **INV-04**: An operator and authorized customer can view or download a
  customer-safe invoice and “why this amount” package without exposing internal
  notes or unrelated customer data.
- [ ] **INV-05**: Invoice balance, payment, aging, return, dispute, and
  reconciliation statuses are derived from immutable events and allocations,
  not editable browser fields.
- [ ] **INV-06**: Invoice and business-context notice delivery attempts,
  outcomes, provider/message identifiers, content version, and required proof
  are retained and visible to authorized users.

### Hosted Payments and Provider Events

- [ ] **PAY-01**: The first live provider is selected only after Stripe and
  GoCardless pass the same sandbox fixtures and are scored on eligibility,
  hosted authorization, variable debit, notices, idempotency, webhooks, returns,
  payouts, export, support, portability, runtime fit, residual compliance, and
  effective cost.
- [ ] **PAY-02**: Customer bank/card credentials and mandate capture stay on
  hosted provider surfaces; RC Digital stores only provider references, masked
  display data, authorization state, and required proof references.
- [ ] **PAY-03**: An authorized customer can establish, replace, or revoke a
  hosted payment authorization, and the system prevents future debits after an
  effective revocation or hold.
- [ ] **PAY-04**: Required authorization copies and variable-debit or payment
  notices are sent by the responsible party and retained with content, timing,
  delivery, and fallback evidence.
- [ ] **PAY-05**: Every outbound provider command uses a permanent local intent,
  stable idempotency key, bounded amount/account scope, and recoverable
  timeout-ambiguity handling before another attempt is allowed.
- [ ] **PAY-06**: Provider webhooks are signature-verified from the raw request,
  atomically persisted, deduplicated, and queued before acknowledgement.
- [ ] **PAY-07**: Replayed, duplicated, delayed, or out-of-order provider events
  cannot duplicate a payment or allocation and trigger canonical provider-state
  retrieval when local ordering is insufficient.
- [ ] **PAY-08**: The system keeps initiated, processing, provider-confirmed,
  paid-out, bank-reconciled, failed, returned, disputed, refunded, and reversed
  states distinct.
- [ ] **PAY-09**: Payment attempts, mandates, allocations, fees, refunds,
  returns, disputes, provider events, payouts, and state transitions are stored
  as immutable normalized facts with source identifiers and causation.

### Operational Subledger and Reconciliation

- [ ] **REC-01**: The billing subledger records append-only receivable,
  allocation, clearing, cash, fee, refund, return, dispute, and adjustment facts
  using accountant-approved account kinds and balanced posting rules.
- [ ] **REC-02**: Authorized users can allocate full or partial payments across
  invoices while preserving unapplied amounts and allocation history.
- [ ] **REC-03**: The system ingests provider object, event, balance, payout, and
  payout-item snapshots with overlap-safe watermarks, pagination, backfill, and
  retention controls.
- [ ] **REC-04**: The system matches invoice obligations, payment attempts,
  allocations, fees, refunds, returns, disputes, payouts, and bank deposits with
  amount, count, and ending-balance controls.
- [ ] **REC-05**: Exact matches can close idempotently under policy, while
  missing, duplicate, stale, or mismatched items enter a durable unmatched queue
  with owner, reason, amount at risk, and next action.
- [ ] **REC-06**: An authorized reviewer can investigate, explain, resolve, and
  sign off reconciliation exceptions without overwriting source facts.
- [ ] **REC-07**: Late returns, refunds, disputes, or corrected settlement data
  create compensating facts and reopen affected balances, holds, and cases.
- [ ] **REC-08**: An invoice becomes bank-reconciled only when its allocations
  can be traced through provider payout items to confirmed bank evidence.

### Restricted Customer Portal

- [ ] **PORT-01**: An administrator can invite, disable, and scope a customer
  billing contact to specific billing accounts without granting internal CRM
  access.
- [ ] **PORT-02**: A customer contact can submit or revise open-period revenue,
  attest to it, and upload evidence through private server-authorized storage.
- [ ] **PORT-03**: A customer contact can view invoice status, outstanding
  balance, receipts, notices, payment timeline, and a customer-safe calculation
  explanation for their account.
- [ ] **PORT-04**: A customer contact can enter the selected provider's hosted
  payment setup/change/revocation flow without RC Digital receiving raw payment
  credentials.
- [ ] **PORT-05**: A customer contact can dispute revenue, a calculation, an
  invoice, or a payment with supporting evidence and receive a durable case
  reference.
- [ ] **PORT-06**: Opening a dispute atomically suppresses affected debit,
  retry, reminder, and escalation work until an authorized resolution event.
- [ ] **PORT-07**: Short-lived signed document access, invitation expiry,
  redirect validation, session handling, and desktop/mobile cross-tenant E2E
  tests protect every portal workflow.

### Collections and Money Follow-Up

- [ ] **COLL-01**: An operator can see accurate aging, outstanding balances,
  reconciliation state, in-flight payments, disputes, holds, promises, contact
  authority, and recommended next action before following up.
- [ ] **COLL-02**: Collections eligibility excludes disputed, legally held,
  incident-held, unreconciled, processing, recently paid, or otherwise
  policy-ineligible balances.
- [ ] **COLL-03**: An authorized operator can configure versioned reminder
  policies with approved contacts, channels, content, quiet hours, waiting
  periods, attempt caps, amount limits, and escalation boundaries.
- [ ] **COLL-04**: The system rechecks balance, reconciliation, holds, contact
  authority, preferences, policy version, and kill switches immediately before
  each message or task is released.
- [ ] **COLL-05**: Each reminder, operator task, promise, response, delivery
  result, and escalation decision has a unique action key and immutable history
  so retries cannot create duplicate customer contact.
- [ ] **COLL-06**: Routine informational reminders and internal follow-up tasks
  can run unattended only after their workflow/customer promotion criteria
  pass; exceptions pause with a clear owner and reason.
- [ ] **COLL-07**: Refunds, credits, write-offs, failed-payment retries, service
  suspension, and legal escalation remain separately human-authorized in v1.

### Durable Automation and Operator Controls

- [ ] **AUTO-01**: Every unattended workflow uses durable jobs with a permanent
  business key, transactional enqueue, leases, heartbeats, bounded retries,
  exponential backoff, rate limits, structured errors, and dead-letter state.
- [ ] **AUTO-02**: Restarting a worker or replaying a job cannot duplicate an
  invoice, debit, allocation, notification, collection action, or financial
  transition.
- [ ] **AUTO-03**: Each workflow/customer can operate in `disabled`, `shadow`,
  `approval`, or `live` mode, with new financial automation defaulting to
  `disabled` or `shadow`.
- [ ] **AUTO-04**: Authorized operators can activate global, provider,
  workflow, account, and customer kill switches that workers recheck before an
  external side effect.
- [ ] **AUTO-05**: Policies, formulas, templates, thresholds, and automation
  modes are versioned and can be rolled back or demoted without rewriting past
  actions.
- [ ] **AUTO-06**: An operator can inspect queues, paused jobs, attempts,
  errors, dead letters, and dependency state and can safely retry, resolve, or
  cancel eligible work with an audit reason.
- [ ] **AUTO-07**: Manual approval and override records include actor, role,
  timestamp, reason, before/after state, evidence, and applicable policy, and no
  browser-only change can bypass them.

### Observability, Audit, and Recovery

- [ ] **OPS-01**: A correlation identifier connects each revenue period,
  calculation, invoice, job, provider command/event, allocation,
  reconciliation item, message, dispute, and operator action.
- [ ] **OPS-02**: Authorized operators can monitor queue age, job/provider
  latency, webhook silence/lag, duplicate suppression, failed transitions,
  reconciliation deltas, unmatched value, holds, delivery errors, and amount at
  risk.
- [ ] **OPS-03**: Alerts route actionable failures and silence conditions to a
  named owner with severity, affected scope, safe first action, and escalation
  deadline.
- [ ] **OPS-04**: An auditor can export a redacted contract-to-cash evidence
  package for a customer, period, invoice, payment, or incident without secrets
  or unrelated tenant data.
- [ ] **OPS-05**: RC Digital defines approved RPO/RTO and encrypted retention
  for database facts, private evidence objects, provider-event archives,
  configuration, and required authorization/notice records.
- [ ] **OPS-06**: An operator can restore database and private evidence into an
  isolated environment, rehydrate access controls, replay the provider tail,
  and prove that external side effects remain disabled.
- [ ] **OPS-07**: A recurring disaster-recovery exercise verifies backup
  freshness, object manifests, restore integrity, provider replay, secret/config
  reconstruction, and measured recovery time with an immutable receipt.

### Compliance and Provider Oversight

- [ ] **GOV-01**: Before live debit, RC Digital records an approved
  provider/ODFI responsibility matrix covering customer account types, SEC
  codes, authorization language, variable-debit notices, revocation, returns,
  proof retention, fraud/sanctions delegation, incidents, and support duties.
- [ ] **GOV-02**: Applicable authorization, notice, consent, privacy,
  retention, and collections policies receive qualified legal/compliance review
  before their workflows can enter `live` mode.
- [ ] **GOV-03**: The selected provider's eligibility, terms, controls,
  notification behavior, webhook/reconciliation coverage, retention, incidents,
  complaints, and material changes are reviewed initially and on a scheduled
  basis.
- [ ] **GOV-04**: An accountant approves the operational subledger account kinds
  and export mapping for invoices, receipts, fees, refunds, returns, disputes,
  adjustments, write-offs, and month close before production accounting export.
- [ ] **GOV-05**: The system retains required authorization, notice, delivery,
  approval, and financial evidence for the approved period and can place a
  documented legal or incident hold on deletion.

### Shadow Pilot and Autonomy Promotion

- [ ] **PILOT-01**: Fixed and percentage-plus-minimum fixtures complete at least
  two representative shadow cycles covering calculation, invoice, notice,
  provider events, payout/bank reconciliation, holds, and collections decisions
  without moving money.
- [ ] **PILOT-02**: Promotion evidence is captured from the first shadow cycle,
  including duplicate charges, unauthorized transitions, reconciliation delta
  rate/value, false pauses, missed events, recovery time, disputes,
  collection-contact errors, and rollback success.
- [ ] **PILOT-03**: A business owner can approve versioned promotion thresholds,
  loss/action limits, pilot customers, responsible operators, alert ownership,
  and rollback authority before any workflow enters `live` mode.
- [ ] **PILOT-04**: The initial live pilot is allowlisted to one representative
  fixed-fee customer and one representative hybrid customer, with independent
  workflow modes and provider-confirmed production receipts.
- [ ] **PILOT-05**: Violating an authorization, idempotency, reconciliation,
  loss, error, silence, or recovery invariant automatically pauses or demotes
  the affected workflow/customer and preserves diagnostic evidence.
- [ ] **PILOT-06**: Autonomy is promoted independently by workflow and customer
  only after approved thresholds and rollback tests pass; maximum-autonomy
  exception handling is not enabled in v1.

## v2 Requirements

### Integrations and Scale

- **INT-01**: RC Digital can add source-specific read-only customer CRM or
  accounting connectors one at a time with revocation, provenance, and source
  reconciliation tests.
- **INT-02**: RC Digital can export or synchronize approved billing-subledger
  entries to a specialist accounting system without treating the CRM as the
  general ledger.
- **INT-03**: RC Digital can operate multiple live payment providers with tested
  routing, recovery, and assisted mandate-migration procedures.
- **INT-04**: RC Digital can support multiple currencies and additional
  jurisdictions after currency, tax, authorization, notice, settlement, and
  collections rules are separately designed and approved.

### Expanded Self-Service and Automation

- **NEXT-01**: A customer can request agreement amendments or payment plans
  through an authenticated approval workflow without editing active terms.
- **NEXT-02**: A separately authorized policy can issue bounded credits,
  refunds, write-offs, or failed-payment retries after loss limits, dual
  control, reconciliation, and rollback evidence pass.
- **NEXT-03**: Counsel-approved service suspension or legal-collections
  integration can be enabled through explicit owner authorization and separate
  safety limits.
- **NEXT-04**: Evaluated AI can summarize exceptions or rank review work while
  deterministic rules and authorized humans remain authoritative for revenue,
  amounts, approvals, customer contact, and money movement.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Storing raw card numbers, bank credentials, or operating a payment processor | Hosted providers must own credential capture, mandates, origination, fraud controls, returns, disputes, and settlement. |
| CRM as accounting general ledger, tax filing engine, payroll system, or legal collections platform | RC Digital needs an auditable billing subledger and integrations, not replacement of specialist regulated systems. |
| Silent revenue estimation | Missing or conflicting evidence must create a visible exception; only explicit contract terms can permit a minimum draft and true-up. |
| Mutable issued invoices or destructive financial deletion | Historical obligations must remain reproducible through immutable facts and compensating records. |
| Multiple live providers, multi-currency, and international rails in v1 | These multiply authorization, rounding, reconciliation, and legal paths before the first US/USD workflow is proven. |
| Automatic refunds, credits, write-offs, suspension, or legal escalation in v1 | These financially or relationally irreversible exceptions require separate proven policies and authorization. |
| AI as the authority for revenue, calculations, approval, collections language, or money movement | Nondeterministic output cannot own financial facts or irreversible actions. |
| Maximum-autonomy exception handling in v1 | The system starts fail-closed and earns bounded autonomy with measured evidence. |

## Definition of Done

A v1 requirement is complete only when:

1. Its implementation and migration are committed and pass the blocking test
   and security gates relevant to that requirement.
2. Authorization, tenant isolation, idempotency, concurrency, replay, failure,
   and recovery behaviors are verified in executable environments where
   applicable.
3. Operator/customer behavior works on the intended desktop and mobile
   surfaces, with residual manual or physical-device coverage named.
4. Observability, audit evidence, kill-switch behavior, and rollback or
   compensating procedures exist before an external side effect is enabled.
5. Requirement-to-phase traceability and verification evidence are updated,
   and any owner, legal, accounting, provider, or production approval gate is
   satisfied without being bypassed by automation.

## Traceability

Roadmap phase mappings will be populated after the roadmap is approved.

| Requirement | Phase | Status |
|-------------|-------|--------|
| All v1 requirements | Unmapped | Pending |

**Coverage:**
- v1 requirements: 100 total
- Mapped to phases: 0
- Unmapped: 100 — roadmap pending

---
*Requirements defined: 2026-08-20*
*Last updated: 2026-08-20 after approved research scope*
