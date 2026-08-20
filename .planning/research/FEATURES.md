# Feature Research

**Domain:** Internal customer billing operations, revenue attestation, ACH/payment tracking, reconciliation, and collections
**Researched:** 2026-08-20
**Confidence:** HIGH for product/provider behavior; MEDIUM for legal applicability until counsel and the selected provider confirm RC Digital's exact account/SEC-code obligations

## Product Boundary and Core Value Test

Every v1 feature must either create, protect, or explain this chain:

`agreement version -> revenue evidence -> frozen calculation -> issued invoice -> provider event -> payment allocation -> payout/bank reconciliation -> collections history`

A feature that does not strengthen that traceability is not v1. RC Digital owns the agreement, evidence, calculation, approval, exception, and shadow-ledger history. A hosted provider owns bank/card credential capture, mandate creation, ACH origination, network returns/disputes, and settlement. The accounting system remains the general ledger.

This is a US/USD-first B2B system, but account type and ACH Standard Entry Class (SEC) code must be explicit. Regulation E's consumer rules do not automatically apply to corporate accounts. V1 should nevertheless use one conservative, provider-approved notice and evidence policy unless legal review approves a narrower branch; product code must not infer legal applicability from a contact's name or email.

## User and Operator Needs

| Actor | Must Be Able To See | Must Be Able To Do | Must Never Be Able To Do |
|-------|---------------------|--------------------|--------------------------|
| **Customer billing contact** | Their company only; open revenue periods; evidence status; formula explanation; invoice, balance, payment and dispute status; upcoming debit notice; mandate status using masked identifiers | Submit/replace evidence before close, attest, download invoices/receipts, follow a hosted payment-setup link, revoke/request payment-method change, raise a dispute, update billing-contact preferences | Browse internal CRM, see another tenant, edit agreement/formula, mark an invoice paid, directly change provider state, upload into public storage, or view raw bank/card credentials |
| **Billing operator** | Close calendar, missing/late evidence, calculation diffs, approval queue, invoice aging, payment timeline, unmatched reconciliation items, collections cases, paused/dead-letter jobs | Verify evidence, approve or reject snapshots, issue invoices, pause a customer/workflow, resolve exceptions, record external payment evidence, assign collections tasks | Mutate issued financial history, bypass RLS/provider evidence, silently estimate revenue, or execute an exceptional money action without the required approval |
| **Automation principal** | Only leased jobs and the minimum records required by its policy-scoped role | Open periods, send due reminders/notices, calculate drafts, ingest events, apply deterministic state transitions, exact-match reconciliation, and create bounded tasks when all gates pass | Expand its own scope, improvise a value, ignore a hold, retry an irreversible command without idempotency, or promote itself from shadow/approval mode |
| **Auditor/reconciler** | Read-only lineage, original and normalized evidence metadata, agreement/formula versions, approvals, notification proof, provider payload hashes/IDs, allocations, payout matches, access history and policy versions | Filter, reproduce, compare and export a period or invoice evidence package; sign off a reconciliation run if separately authorized | Alter source records, issue/refund/collect, or receive bank credentials and secrets in exports |

## Required Behavioral Contract

These behaviors are more important than the screen inventory:

- **Issued means immutable.** Correct an invoice with a void, credit, debit adjustment, or later true-up; never overwrite the historical amount or evidence snapshot. Stripe likewise restricts most edits after finalization, and immutable provider balance transactions model corrections as new entries. [S7][S10]
- **Initiated is not paid.** ACH is asynchronous and can fail or be disputed after initiation. Customer and operator views must show processing/confirmed/paid-out/reconciled separately. [S6][S9]
- **Missing revenue is an exception, not a number.** Never extrapolate or silently reuse a previous month. If the active agreement version expressly permits minimum billing after the cutoff, create a minimum-only draft, open a missing-evidence exception, require v1 approval, and generate a separate true-up/credit after verified evidence arrives.
- **A dispute is a hold.** Raising an invoice, evidence, authorization, or payment dispute immediately suppresses new debits, payment retries, reminders, and collections escalation for the affected obligation until an authorized resolution records what may resume.
- **Notices are evidence-bearing events.** Store template/policy version, amount, date, delivery channel, recipient, provider/RC sender, delivery outcome, and immutable content hash. CFPB rules require a copy of consumer preauthorization and advance notice for varying consumer debits; Nacha also requires date-change notice and proof on request. [S1][S2][S3]
- **Hosted does not mean invisible.** RC Digital stores provider customer/mandate/payment/event identifiers and status, not account/routing/card data. The portal redirects to the provider's hosted surface; RC records the result and proof references. PCI SSC notes that full outsourcing/redirects can reduce scope, but merchant-managed redirect security and other eligibility controls remain. [S4]
- **Reconciliation controls collections.** An overdue document row is insufficient authorization to contact or charge. Collections policy uses allocated payment, in-flight ACH, dispute/hold, reconciliation, consent/preference, quiet hours, attempt caps, and promise-to-pay state.
- **Provider events are untrusted input until verified and durably accepted.** Verify signatures, deduplicate event/object transitions, persist before acknowledging, process asynchronously, tolerate out-of-order delivery, and retrieve current provider objects when needed. [S8][S11]
- **Evidence is private by default.** Collect only what is needed, enforce least privilege and retention, log access, and use secure electronic channels rather than ordinary email for sensitive exception documents. [S5][S14]

## Feature Landscape

### Table Stakes (Users Expect These)

Missing any P1 item makes the billing chain incomplete or unsafe. Complexity includes brownfield security, migration, and integration work—not just screen construction.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **[All] Tenant isolation, billing RBAC, and separation of duties** | Customers and staff expect financial records to be visible and actionable only by the right company/role | HIGH | PostgreSQL RLS and server authorization are authoritative. Roles: billing operator, evidence reviewer/approver, reconciler, read-only auditor, customer billing contact, and narrow automation principal. Portal cannot launch before cross-tenant denial tests pass. |
| **[Operator/Auditor] Immutable versioned billing agreements** | Every invoice must point to the exact terms in force for its service/revenue period | HIGH | Store plan type, effective dates, currency, fixed/minimum/rate values, commissionable-revenue definition, inclusions/exclusions, timing basis, cutoff, missing-report behavior, true-up/dispute rules, payment terms and signed source. Changing terms creates a new version. |
| **[Customer/Operator] Monthly revenue-period close** | Percentage and hybrid billing needs a visible request, due date, status, owner and resolution | HIGH | State flow: scheduled -> open -> awaiting evidence -> submitted -> under review -> verified/frozen OR exception/disputed. One tenant/contract/period key prevents duplicate closes. |
| **[Customer] Restricted billing portal** | Customers need a safe fallback when RC Digital lacks read-only CRM/accounting access | HIGH | Company-scoped portal for open periods, upload/attestation, invoice/receipt download, hosted payment setup, notice history and disputes. No internal notes, sales records or cross-customer search. |
| **[Customer/Operator/Auditor] Private evidence submission and attestation** | A reported total without provenance cannot support a defensible revenue-share invoice | HIGH | Capture source system, reporting basis, gross, explicit exclusions/refunds/taxes/chargebacks, net commissionable amount, period, submitter identity/role, attestation text/version, timestamp, evidence object hash and review history. Replacement creates a new version. |
| **[Operator/Auditor] Evidence-source and review workbench** | Operators must distinguish trusted API data, customer exports, attestations and exceptions | MEDIUM | Implement the evidence ladder: read-only source API -> automated export -> portal attestation plus support -> exception. Show validation checks, discrepancy, reviewer, access log and why a source was accepted/rejected. Existing CRM deal/attribution totals are comparison signals, never verified billing evidence. |
| **[Operator/Automation/Auditor] Deterministic formula engine and frozen snapshot** | Fixed, percentage, minimum and hybrid charges must be reproducible exactly | HIGH | Integer minor units, explicit USD currency and rounding. Support fixed; percentage x verified commissionable revenue; fixed minimum support; `max(minimum, percentage x revenue)`; approved signed adjustments. Snapshot inputs, formula version, output, reason and tests. Browser preview is non-authoritative. |
| **[Customer/Operator/Auditor] Explainable calculation** | A customer should understand why the invoice amount differs month to month | MEDIUM | Show revenue total, excluded amounts, rate, minimum comparison, adjustments, prior true-ups, rounding rule and agreement version—without exposing internal-only notes or another customer's data. |
| **[Operator] Approval and exception queue** | Ambiguous or irreversible actions must stop with enough context to decide safely | HIGH | Queue missing evidence, source discrepancy, changed terms, unusual variance, duplicate run, invalid mandate, notice failure, provider mismatch, dispute, refund/credit/write-off/retry and legal hold. Every approval records actor, role, reason, inputs and policy version. |
| **[Customer/Operator/Auditor] Invoice lifecycle and immutable issued document** | Users expect draft, issued/open, processing, partial, paid, overdue, void and uncollectible states plus a durable invoice/PDF | HIGH | Finalization freezes billing address/tax/line-item/agreement/calculation snapshots. Corrections are linked compensating records. Support amount due, paid, remaining, due date and partial/out-of-band allocations; never generic CRUD of provider-owned status. [S7][S12] |
| **[Customer] Hosted payment authorization and revocation path** | ACH collection requires authorization and a practical way to change/revoke it | HIGH | Redirect to hosted mandate/account-verification surface. Store masked display and provider IDs/status only. Deliver provider confirmation/copy, record accepted terms/version and expose a revoke/change request route. Account type and SEC code are explicit. [S2][S6] |
| **[Customer/Auditor/Automation] Upcoming-debit, mandate and outcome notifications** | Variable-charge customers need amount/date clarity; operators need delivery proof | HIGH | Conservative v1: notify all ACH customers of amount/date before debit using the selected provider-approved window, even where consumer-only rules may not apply. Avoid duplicate RC/provider emails by assigning notification ownership. Keep failure and provider fallback visible. [S1][S2][S13] |
| **[Customer/Operator] Asynchronous payment and allocation timeline** | ACH initiation, confirmation, failure, return, dispute, payout and bank settlement are different facts | HIGH | Append-only provider event, payment attempt and allocation records. Show `scheduled`, `submitted/processing`, `confirmed`, `failed/returned`, `disputed`, `paid_out`, `bank_reconciled`; an invoice becomes paid only when allocations cover it, and fully reconciled only after settlement evidence. [S6][S9] |
| **[Operator/Auditor] Payout and bank-deposit reconciliation workbench** | Collected amount, provider fee/refund/dispute and net bank deposit must balance | HIGH | Match invoice -> payment -> provider balance/payout item -> deposit. Record fees/refunds/returns separately; preserve run/watermark, exact/assisted/manual match reason, reviewer, variance and unmatched queue. Exact-match auto-close may be unattended; fuzzy/manual match requires review. [S9][S10] |
| **[Customer/Operator] Dispute intake and scoped hold** | Customers need a clear channel to challenge revenue evidence, invoice or debit before collections compounds harm | MEDIUM | Category, amount/period, reason, evidence, contact, timestamps and status. Opening a dispute atomically applies the appropriate hold and acknowledges it; resolution uses approval and compensating records. Provider disputes synchronize but do not erase the internal case. |
| **[Operator/Customer] Aging and collections case management** | Teams need one next action, history and customer-visible status rather than ad hoc email | HIGH | Aging buckets, assigned owner, next action, contact preferences, delivery/attempt history, quiet hours, caps, promise to pay, dispute/legal hold and outcome. V1 automates only approved informational reminders/tasks when no payment is processing and reconciliation supports the balance. Escalation remains human. |
| **[Operator/Automation] Durable jobs and safety controls** | Scalable recurring work cannot depend on an open browser or unbounded retries | HIGH | Transactional queue/outbox, leases, idempotency, backoff, rate limits, dead letter, correlation ID, restart safety; disabled/shadow/approval/live mode per workflow and customer; global/customer/provider kill switches; paused-job inspection and policy rollback. |
| **[Operator/Auditor] Unified exception, health and aging dashboard** | Operators need to work the breaks, not watch raw event streams | MEDIUM | Prioritize missing evidence, approvals, notice failures, payment failures, overdue balances, disputes, unmatched payouts, webhook lag and dead letters. Totals come from server aggregates with as-of time, not paginated browser rows. Desktop supports full work; mobile v1 supports safe triage, hold and assignment only. |
| **[Auditor] Append-only audit timeline and evidence export** | A reviewer must reproduce who knew what, when, and why each dollar moved | HIGH | Material events include actor/principal, tenant, command, before/after references, agreement/formula/policy versions, correlation/idempotency keys and object hashes. Export a scoped package without secrets or raw account data. Provider APIs are not permanent archives; GoCardless now documents an 18-month event-access window. [S11] |
| **[Operator/Auditor] Operational receipts, recovery and replay evidence** | Unattended billing is not trustworthy without proof that events/jobs/data can be recovered | HIGH | Surface webhook lag, duplicate count, missed events, reconciliation deltas, notification failures and promotion metrics. Keep backup/PITR/restore receipts, provider replay checkpoints and evidence rehydration tests; auditors can see test date/outcome, not infrastructure secrets. |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Contract-to-cash lineage view** | One screen explains every dollar from signed terms through bank deposit and collection action | HIGH | The core differentiator. Traverse immutable IDs and display missing links as exceptions, never fabricate continuity. |
| **Revenue-evidence confidence ladder** | RC Digital can bill defensibly even when customer CRM access is unavailable | HIGH | Rank API, verified export, portal attestation/support and exception; preserve source-specific validations. Confidence informs review, never changes the contract formula. |
| **Calculation replay and human-readable diff** | Operators and customers can see exactly why this month changed | MEDIUM | Re-run the versioned engine against the frozen input, compare prior period and explain revenue/rate/minimum/adjustment deltas. Replay cannot mutate the issued snapshot. |
| **Contract-permitted minimum and later true-up workflow** | Prevents revenue leakage without silently inventing revenue | HIGH | After cutoff, explicit contract clause may create a minimum-only draft plus exception. V1 requires approval before issue/debit. Later verified evidence creates a linked debit true-up or credit; old invoices stay unchanged. |
| **Reconciliation-gated collections** | Avoids contacting a customer while payment is processing, misallocated or already in a payout | HIGH | Collections eligibility is a policy decision derived from subledger and reconciliation, not `due_date < now()`. |
| **Evidence-earned autonomy scorecard** | Automation becomes safer and cheaper over time without a risky all-at-once launch | HIGH | Per workflow/customer measure duplicate charge, unauthorized transition, reconciliation delta/value, false pause, missed event, recovery time, dispute/contact error and rollback success. Promotions are approved, versioned and reversible. |
| **Provider-portable payment boundary** | Contract and audit history survive a GoCardless/Stripe decision or future migration | HIGH | One internal command/event vocabulary; provider IDs remain namespaced. V1 supports one selected live provider plus one sandbox adapter—not simultaneous production routing. |
| **Formula and evidence anomaly detection** | Finds wrong periods, duplicates and unexplained swings before billing | MEDIUM | Deterministic rules first: cutoff, duplicate evidence ID/hash, period overlap, variance bands, rate/minimum mismatch. Statistical/AI suggestions may rank review; they may never set revenue or authorize money. |
| **Customer-facing “why this invoice?” package** | Reduces disputes and back-and-forth for percentage/hybrid billing | MEDIUM | Restricted view bundles relevant agreement excerpt/version, attested revenue, exclusions, formula, minimum comparison, true-ups, invoice and payment status with safe redaction. |
| **Secure evidence connectors** | Replaces manual monthly uploads once a source proves reliable | HIGH | Read-only least-privilege API, SFTP or automated export connectors with cursor/watermark, source record IDs, hashes, reconciliation and revocation. Add per customer/source after v1. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **A second standalone CRM** | Clean-slate appeal | Splits customer identity, notes, ownership and billing history | Extend the current CRM through typed billing resources and provider ports |
| **Raw bank/card credential storage or custom ACH authorization UI** | More control and fewer redirects | Expands PCI/Nacha/security scope and creates sensitive breach material | Hosted provider redirect/page; store only provider IDs, status and masked display |
| **Silent estimated revenue or “use last month”** | Keeps billing on schedule | Makes a percentage invoice untraceable and may violate the agreement | Missing-evidence exception; explicit contract minimum draft; later linked true-up/credit |
| **Mutating/deleting an issued invoice or payment event** | Easy corrections | Erases the historical facts needed for audit and reconciliation | Void/credit/debit adjustment, allocation reversal or linked true-up |
| **Marking ACH paid on submission or one success webhook** | Faster-looking cash reporting | ACH is delayed, can fail/return/dispute, and provider events can duplicate/arrive out of order | Separate processing, confirmed, paid-out and bank-reconciled states |
| **Automatic hybrid billing from unverified customer input** | Human-free close | A valid form submission can still be incomplete, duplicated or inconsistent with the contract | Review gate until each evidence source has passed promotion thresholds |
| **Automatic exceptional refunds, credits, write-offs, payment retries, service suspension or legal escalation in v1** | Maximum autonomy | Moves money or harms a customer relationship under ambiguous facts | Prepare recommendation/evidence package; require authorized approval and dual control where policy demands |
| **Collections from invoice due date alone** | Simple scheduled reminders | Ignores in-flight payment, allocations, dispute, legal hold, preferences and reconciliation | Collections eligibility policy based on subledger plus holds and contact controls |
| **Customer portal access to general CRM or public attachments** | Reuses existing screens/storage | Current CRM tenancy and public bucket are unsafe for billing evidence | Dedicated restricted composition, private bucket, short-lived signed reads and access logs |
| **CRM as general ledger, tax engine or legal collections platform** | “One system” convenience | Duplicates regulated/specialist accounting and legal capabilities | Maintain a billing subledger and integrate/export to accounting and counsel-approved systems |
| **Multi-currency, multiple live processors and international rails in v1** | Future-proof appearance | Multiplies rounding, tax, notice, authorization and reconciliation paths before one is correct | USD/US and one live provider; portable model and sandbox comparison only |
| **AI-calculated revenue, AI-approved exceptions or AI-written autonomous collection threats** | Perceived labor savings | Nondeterministic output cannot be the authority for financial facts or customer escalation | AI may summarize/rank; deterministic rules and human authorization remain authoritative |
| **Broad realtime provider-event feeds in the browser** | Feels operationally live | Amplifies event volume, exposes detail and causes whole-resource refetches | Durable backend intake plus compact domain notifications and server-side aggregates |
| **Provider dashboard as the only archive** | Avoids building a ledger | Access windows, provider changes and missing internal approvals break traceability | Persist normalized immutable events, hashes and source IDs; retain provider payloads per policy |

## Feature Dependencies

```text
[Executable DB/RLS/Edge Function tests + blocking CI migration gate]
    -> [Tenant/RBAC/automation-principal hardening + dependency security]
        -> [Private evidence storage + customer portal security]
        -> [Integer-minor-unit money + immutable state commands]
            -> [Agreement versions + formula versions]
                -> [Revenue periods + evidence + attestations]
                    -> [Verified close + frozen calculation snapshot]
                        -> [Immutable invoice issue/correction lifecycle]

[Provider sandbox decision spike + adapter contract]
    -> [Hosted mandate + authorization/notice proof]
    -> [Signature-verified durable event inbox + idempotent command outbox]
        -> [Payment attempts + allocations + invoice payment status]
            -> [Payout/fee/refund/dispute reconciliation]
                -> [Collections eligibility + bounded reminders]

[Durable jobs + kill switches + observability + tested recovery]
    -> [Shadow/approval mode]
        -> [Promotion metrics + approved thresholds + rollback proof]
            -> [Per-workflow/per-customer live autonomy]

[Explicit missing-report clause + late evidence]
    -> [Minimum-only draft + missing-evidence exception + v1 approval]
        -> [Linked true-up/credit snapshot + v1 approval]

[Dispute or legal hold] --blocks--> [new debit, retry, reminder, escalation]
[Payment processing/unmatched] --blocks--> [collections automation]
```

### Dependency Notes

- **The portal requires proven tenancy and private storage:** presentation-only permissions and the existing public attachments bucket are disqualifying.
- **Calculation requires agreement and verified evidence versions:** a formula cannot choose what “revenue” means; the active signed terms and close supply that meaning.
- **Issuing requires a frozen calculation:** invoice creation is downstream of approval/idempotent run identity, not an editable browser total.
- **Payment status requires durable provider intake:** never let the browser or an unverified webhook directly set `paid`.
- **Collections requires reconciliation:** payment processing, unapplied cash or provider/bank mismatch suppresses automation.
- **Live autonomy requires shadow evidence:** deployability is not promotion. Each workflow/customer has its own approved mode and rollback.
- **True-up requires compensating-document semantics:** late evidence never rewrites the minimum invoice; it produces a linked delta with the original and final calculation visible.

## MVP Definition

### Ruthless v1 Boundary

V1 is a restricted US/USD pilot, not a general billing platform. It supports exactly:

- One active live payment provider selected only after the GoCardless-versus-Stripe sandbox spike; the other may remain a sandbox adapter.
- Fixed monthly, percentage of verified commissionable revenue, minimum support, and `max(minimum, rate x verified revenue)` agreements.
- One monthly close path with the evidence ladder and one secure customer portal.
- Invoice preparation/issue, ACH status tracking, payment allocation, payout/bank reconciliation, dispute holds, aging and bounded collections tasks.
- Modes `disabled`, `shadow`, `approval`, and `live` per customer/workflow, defaulting to shadow or approval.

Routine fixed-fee debit may enter `live` only after active agreement/mandate, required notice, exact calculation, no hold, unique command, successful shadow cycles and approved promotion. Percentage/hybrid debit remains approval-gated until its specific evidence source and variance controls earn promotion. Missing-evidence minimums and later true-ups are always approval-gated in v1. Refunds, credits, write-offs, retries after failure, service suspension and legal escalation remain human-authorized.

### Launch With (v1)

- [ ] **Executable database/security/provider test gate** — no money-bearing feature ships on source-string tests alone.
- [ ] **Tenant/RBAC/private evidence foundation** — required for both operator and customer records.
- [ ] **Agreement versions and deterministic formula snapshots** — fixed and hybrid calculations reproduce in integer cents.
- [ ] **Revenue periods, portal evidence/attestation and operator verification** — solves the no-customer-CRM-access case without guessing.
- [ ] **Contract-permitted minimum exception and linked true-up/credit** — both require v1 approval and preserve original invoices.
- [ ] **Immutable invoice lifecycle and customer explanation/download** — every issued amount points to its frozen source chain.
- [ ] **Hosted mandate/setup, notification ledger and revocation/change route** — RC holds no raw payment credentials.
- [ ] **Durable provider sandbox/live-pilot events, payment attempts and allocations** — replay-safe and order-tolerant.
- [ ] **Payout/bank reconciliation with unmatched queue and signoff** — exact match may auto-close; exceptions pause.
- [ ] **Dispute intake/holds, aging and manual/bounded collections cases** — no debit or contact while affected facts are disputed.
- [ ] **Shadow/approval/live modes, kill switches, job/dead-letter UI and audit export** — operators can supervise and stop unattended work.
- [ ] **First-cycle promotion scorecard and recovery receipts** — evidence accumulation begins before live collection.

### V1 Acceptance Scenarios

1. A fixed agreement produces the same minor-unit invoice snapshot on replay, sends required notice, completes a sandbox/provider pilot payment, and reconciles to its payout/deposit.
2. A hybrid agreement receives portal evidence and attestation, shows `percentage result` versus `minimum`, freezes the selected amount, and gives the customer an intelligible explanation.
3. A customer misses the reporting cutoff; the system refuses to estimate revenue, proves the agreement permits minimum billing, creates an approval-gated minimum draft/exception, and later generates a linked delta after evidence arrives.
4. Duplicate and out-of-order provider events do not duplicate a payment/allocation or close an invoice early.
5. A customer dispute or operator hold atomically suppresses new debit, retry, reminder and escalation work.
6. An auditor exports one invoice package and can trace agreement, evidence hash/attestation, calculation, approval, invoice, notice, provider events, allocation, payout/deposit match and collections history without receiving secrets.

### Add After Validation (v1.x)

- [ ] **Automatic fixed-fee invoice/debit promotion** — per-customer only after approved shadow thresholds and rollback test pass.
- [ ] **Automatic percentage/hybrid close promotion** — only for a proven source connector with low discrepancy/false-pause rates.
- [ ] **Read-only CRM/accounting/export connectors** — add one at a time with source-specific reconciliation and revocation.
- [ ] **Accounting-system export/sync** — after invoice/payment/reconciliation semantics stabilize; CRM remains subledger, not GL.
- [ ] **Policy-bounded failed-payment retry and reminder sequences** — only after provider return timing, consent, caps and hold behavior are verified.
- [ ] **Customer notification ownership/customization** — only after provider approval and proof that fallback prevents missed or duplicate mandatory notices.
- [ ] **Rule-based anomaly ranking and calculation diffs** — when enough clean period history exists to set useful thresholds.

### Future Consideration (v2+)

- [ ] **Multiple simultaneous live providers and automated routing** — defer until provider-portability recovery is exercised.
- [ ] **Multi-currency/international schemes** — requires jurisdiction-specific tax, rounding, mandate, notice and reconciliation design.
- [ ] **Customer self-service agreement changes or payment plans** — requires authenticated contract amendment and approval semantics.
- [ ] **Bounded automatic credits/refunds/write-offs** — only after separate loss limits, dual control, metrics and rollback are proven.
- [ ] **Service suspension or legal collections integration** — counsel-approved policy and explicit owner authorization required.
- [ ] **AI-assisted exception summaries** — advisory only, evaluated for omission/hallucination and never authoritative for money.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Security/test/deployment prerequisite gate | HIGH | HIGH | P1 |
| Billing RBAC, portal tenancy and private evidence | HIGH | HIGH | P1 |
| Agreement/revenue/formula versioning | HIGH | HIGH | P1 |
| Revenue close, evidence and attestation | HIGH | HIGH | P1 |
| Minimum/true-up exception workflow | HIGH | HIGH | P1 |
| Immutable invoice and explanation | HIGH | HIGH | P1 |
| Hosted mandate and notice proof | HIGH | HIGH | P1 |
| Provider event/payment subledger | HIGH | HIGH | P1 |
| Reconciliation and unmatched queue | HIGH | HIGH | P1 |
| Disputes, holds, aging and collections cases | HIGH | HIGH | P1 |
| Job safety, kill switches, audit/recovery receipts | HIGH | HIGH | P1 |
| Contract-to-cash lineage view | HIGH | HIGH | P1 |
| Read-only evidence connectors | HIGH | HIGH | P2 |
| Autonomy scorecard and per-workflow promotion | HIGH | HIGH | P1 (shadow capture), P2 (promotion) |
| Accounting sync | MEDIUM | HIGH | P2 |
| Automated retries/dunning escalation | MEDIUM | HIGH | P2 |
| Anomaly ranking and source-confidence automation | MEDIUM | MEDIUM | P2 |
| Multiple live providers/multi-currency | LOW for initial market | HIGH | P3 |
| AI exception assistance | LOW until clean data exists | MEDIUM | P3 |

**Priority key:**

- **P1:** Required for the restricted v1 pilot or its safety boundary
- **P2:** Add only after core correctness and promotion evidence exist
- **P3:** Explicitly deferred; no v1 schema/UI detour unless needed for provider portability

## Competitor / Provider Feature Analysis

This is not the provider-selection decision; that remains a sandbox spike. It identifies what RC Digital should buy versus build.

| Feature | Stripe | GoCardless | RC Digital Approach |
|---------|--------|------------|---------------------|
| Hosted ACH authorization | Hosted flows, mandate confirmation, bank verification and ACH mandate status; ACH is delayed and disputable [S6] | Hosted payment/mandate flows and ACH authorization; mandate/payment APIs [S9][S11] | Redirect to provider; store only provider IDs/status/masked display and internal authorization/notice proof references |
| Invoice/customer payment experience | Strong invoice lifecycle, Hosted Invoice Page/portal, reminders, partial-payment state [S7][S12] | Payment/mandate focused; customer notifications and dashboards, not RC's revenue-evidence invoice logic [S9][S13] | RC portal owns evidence, calculation explanation and invoice shadow record; provider surface owns payment credentials/action |
| Variable debit notifications | Default mandate/microdeposit email; merchant can send custom notice but assumes responsibility [S6] | Automatically sends required notifications unless an approved integrator owns and handles them by deadline [S13] | Provider-owned by default in v1; RC stores schedule/delivery evidence and sends business-context notices without suppressing mandatory provider fallback |
| Payment/event reliability | Signed webhooks, duplicate/out-of-order guidance, asynchronous processing [S8] | Signed webhooks, explicit processed-event deduplication guidance, idempotency and event API [S11] | One durable inbox/outbox adapter contract stricter than either happy-path example; current provider state is re-fetched before irreversible transitions |
| Payout reconciliation | Payout/balance transactions and itemized reconciliation reports [S10] | Payout items and event-based reconciliation; recommended `confirmed` versus `paid_out` distinction [S9][S11] | Internal match invoice/allocation to provider payment/fee/refund/dispute, payout and bank deposit; preserve unmatched queue/signoff |
| Revenue attestation and hybrid formula | Not the authoritative contract/revenue-evidence engine | Not the authoritative contract/revenue-evidence engine | Build: versioned agreements, evidence ladder, deterministic calculation, missing-report minimum and true-up |
| Audit retention | Provider objects/reports available subject to product retention/access | Events older than 18 months are documented as archived from 2026 rollout [S11] | Internal append-only normalized archive and evidence package; provider is source, not sole long-term record |

## Sources

### Authoritative External Sources

- **[S1] HIGH — CFPB, current Regulation E §1005.10, “Preauthorized transfers.”** Consumer recurring debit authorization copy, stop-payment right, and 10-day notice for varying amounts: https://www.consumerfinance.gov/rules-policy/regulations/1005/10/
- **[S2] HIGH — Nacha ACH Guide for Developers, “How ACH Works.”** Authorization evidence, revocation instructions, date/amount change notices, and business-agreement distinction: https://achdevguide.nacha.org/how-ach-works
- **[S3] HIGH — CFPB, current Regulation E §1005.13, “Administrative enforcement; record retention.”** At least two years of evidence of applicable compliance: https://www.consumerfinance.gov/rules-policy/regulations/1005/13/
- **[S4] HIGH — PCI Security Standards Council FAQs 1588 and 1439.** Outsourced/redirect payment scope and merchant redirect/security responsibilities: https://www.pcisecuritystandards.org/faqs/1588/ and https://www.pcisecuritystandards.org/faqs/1439/
- **[S5] HIGH — FTC, “Start with Security: A Guide for Business.”** Data minimization, least privilege, secure lifecycle and service-provider oversight: https://www.ftc.gov/business-guidance/resources/start-security-guide-business
- **[S6] HIGH — Stripe official ACH Direct Debit documentation.** Mandates, customer copy/notifications, account verification, delayed results and disputes: https://docs.stripe.com/payments/ach-direct-debit
- **[S7] HIGH — Stripe official Invoicing lifecycle documentation.** Draft/finalized/open/paid/void/uncollectible behavior and post-finalization restrictions: https://docs.stripe.com/invoicing/overview
- **[S8] HIGH — Stripe official webhook documentation.** Signature verification, duplicates, asynchronous handling and non-guaranteed event order: https://docs.stripe.com/webhooks
- **[S9] HIGH — GoCardless official partner integration guide.** Sandbox testing and distinct confirmed/paid-out reconciliation states: https://docs.gocardless.com/docs/partner-integrations/integration-guide
- **[S10] HIGH — Stripe official payout reconciliation documentation.** Payout-to-balance-transaction matching, fees/refunds and immutable balance transactions: https://docs.stripe.com/payouts/reconciliation and https://docs.stripe.com/plan-integration/get-started/reporting-reconciliation
- **[S11] HIGH — GoCardless official API reference and webhook guide.** Payments, mandates, events, payout items, idempotency, deduplication, asynchronous handling and documented event archive window: https://developer.gocardless.com/api-reference and https://developer.gocardless.com/getting-started/stay-up-to-date-with-webhooks-v2
- **[S12] HIGH — Stripe official partial-payment documentation.** Payment allocation, amount remaining and portal state: https://docs.stripe.com/invoicing/partial-payments
- **[S13] HIGH — GoCardless official customer-notification guide.** Provider fallback, notification ownership, required deadlines and duplicate-notice avoidance: https://developer.gocardless.com/guides/handling-customer-notifications
- **[S14] HIGH — Nacha Operations Bulletin #2-2025.** Secure authenticated electronic channels for ACH exception documents: https://www.nacha.org/news/ach-operations-bulletin-2-2025-encouraging-use-secure-electronic-channels-resolving-ach

### Project Sources

- `.planning/PROJECT.md` — Core value, active requirements, constraints and mandatory delivery order.
- `.planning/AUDIT-CLAUDE-2026-08-20.md` — Verified P0 prerequisites and sequencing.
- `.planning/codebase/ARCHITECTURE.md` — Brownfield provider/resource patterns and mobile/desktop boundaries.
- `.planning/codebase/CONCERNS.md` — Current invoice, RLS, storage, webhook, queue, reconciliation and test gaps.
- `/Users/agenticmac/.cache/innovate/runs/20260820T031426Z-scalable-in-house-crm-for-recurring-invo-synthesis.md` — Evidence ladder, formula, build/buy boundary and first-milestone acceptance.

## Confidence and Open Validation

| Area | Confidence | Validation Still Required |
|------|------------|---------------------------|
| Customer/operator feature expectations | HIGH | Pilot usability with RC Digital billing staff and two representative customers |
| Stripe/GoCardless product behavior | HIGH | Sandbox spike on exact account configuration, webhook objects, payout detail, notification ownership and current pricing/terms |
| ACH authorization/notice/retention applicability | MEDIUM | Provider compliance review and US counsel must map consumer vs corporate accounts, SEC codes, contract language and RC/provider responsibilities before live debit |
| Privacy/security product controls | HIGH | Threat model, RLS/storage integration tests, retention schedule and incident/recovery exercises |
| Collections automation boundaries | MEDIUM | Counsel-approved commercial collections policy, customer communications, quiet hours, consent/preferences and escalation rules |
| Minimum/true-up semantics | HIGH as product pattern | Each signed agreement must explicitly define cutoff, missing-report minimum, dispute window and true-up/credit treatment |

The principal unresolved product decision is the first live provider. It does not change the required RC Digital behavior: hosted credentials/mandates, durable provider event intake, asynchronous payment truth, internal reconciliation and a portable audit chain.

---
*Feature research for: RC Digital Billing Operations*
*Researched: 2026-08-20*
