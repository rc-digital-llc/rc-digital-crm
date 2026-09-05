# Phase 5: Immutable Invoicing and Durable Provider Operations - Context

**Gathered:** 2026-09-05
**Status:** Ready for planning; execution requires baseline reconciliation
**Decision provenance:** Existing requirements and Phase 2–4 invariants are binding. The user directed “okay work throught it” after the Phase 5 planning recommendation. Configurable implementation defaults below are agent recommendations, not assertions of new commercial, accountant, provider or release approval. The optional question about existing invoice-number/payment-term conventions has no answer as of this document.

<domain>
## Phase Boundary

Turn approved calculations into immutable invoice obligations; add durable provider operations, hosted authorization, verified webhook intake, payment facts, balanced subledger, allocations and retained delivery/notice proof. Cover INV-01/02/03/06, PAY-01/02/04/05/06/07/09, REC-01/02 and AUTO-01/02.

Bank reconciliation belongs to Phase 6, full operator-mode governance to Phase 7, customer self-service to Phase 8 and collections/global workspace to Phase 9. Minimal fail-closed server controls are prerequisites to provider effects, not deferred safety work. This phase does not authorize production promotion or live money movement.
</domain>

<decisions>
## Implementation Decisions

### Invoice authority

- **D-01:** Use one permanent organization/account/approved-calculation business key for an invoice draft. Retries return that draft, including after issuance or cancellation; no second draft can replace its history.
- **D-02:** Create financial lines only from the approved Phase 4 snapshot, including its formula, rounding policy, agreement, period and evidence lineage. Browser amounts, formatted text and legacy numeric columns are never authority.
- **D-03:** Assign the final unique invoice number transactionally at issuance from a versioned organization series, with reserved legacy numbers protected. Number format is configurable; do not claim gapless numbering or assume a fiscal-year reset.
- **D-04:** Require explicit issue date, due date/payment terms, account billing contact snapshot and delivery-policy version before issuance. No invented net-30 or customer-specific business terms; missing approved configuration blocks issue.
- **D-05:** Issued snapshots and line items are immutable, including dates, amount, identity and policy. Lifecycle changes append events; issue status, delivery status, payment state and reconciliation state remain separate.

### Corrections

- **D-06:** Positive late-evidence deltas create separately reviewed linked true-up drafts; contract-permitted negative deltas create credit drafts. Zero deltas are no-op facts and held/ambiguous adjustments remain held. No silent carry-forward into the next ordinary invoice.
- **D-07:** Credit, void and write-off are distinct commands with independent capabilities, reasons, immutable causation and bounded amounts. They never erase an issued document or imply a provider refund. No automatic replacement invoice without an explicit linked correction authority.

### Durability

- **D-08:** A transactional outbox with permanent business keys owns all effectful work. Jobs use bounded batches, renewable leases, fencing tokens, heartbeats, bounded backoff with jitter, provider/account rate limits, structured redacted errors and a dead-letter state.
- **D-09:** Every provider mutation first creates a permanent local intent binding organization, account, environment, provider connection, operation, exact amount/currency, authorization, invoice/adjustment, policy and request fingerprint to one stable external idempotency key.
- **D-10:** Timeout or uncertain provider result becomes outcome_unknown. Recover by existing reference, idempotency conflict reference or canonical provider query before retry; ambiguous absence is not proof of no effect. A new key or switching providers cannot bypass this hold.

### Provider boundaries

- **D-11:** Implement both Stripe and GoCardless behind a closed server-side adapter contract, using the same scenario IDs and expected normalized outcomes. Do not choose a live winner from documentation, price alone, mocks or one provider's sandbox.
- **D-12:** Use provider-hosted credential/mandate capture. Store only connection-scoped references, allowlisted masked metadata, authorization state and proof references. Hosted return URLs are allowlisted and a return redirect is not proof of authorization or payment.
- **D-13:** External effects are disabled by default. Sandbox harnesses require explicit sandbox connection binding and synthetic subjects; live provider selection and production enablement are separate owner-controlled decisions, not side effects of completing Phase 5.
- **D-14:** Webhook ingress verifies the untouched raw request bytes using each provider's protocol, validates environment/account binding, and commits the deduplicated envelope/events plus processing jobs atomically before success acknowledgement.
- **D-15:** Handle batched, duplicate, delayed and reordered events using provider/environment/connection/event identity and canonical retrieval when necessary. Never rank states by arrival time, declare a payment settled from a redirect, or discard a late return because success arrived first.
- **D-16:** Provider facts and transitions are immutable normalized records for mandates, attempts, payments, allocations, fees, refunds, returns, disputes, payouts and source events. Restricted raw-envelope evidence is not exposed to generic CRUD, browser storage, logs or broad support roles.

### Ledger and allocations

- **D-17:** Use an append-only balanced exact-USD subledger with versioned posting rules and account kinds for receivable, clearing, cash, fee, refund, return, dispute, unapplied and adjustment treatments. Require accountant approval of the exact policy hash before operational posting; synthetic test approval is never real approval.
- **D-18:** Full and partial allocations are explicit same-organization/account/currency commands with locks and no over-allocation. Excess remains unapplied. Corrections/reversals append linked entries and preserve the prior allocation; provider payout does not prove bank reconciliation.

### Delivery and notices

- **D-19:** Invoice delivery and required provider notices are separate durable obligations. Each retains responsible party, recipient/effective contact snapshot, content version/hash, due window, attempts, accepted/delivered/failed/unknown outcomes and provider/message/proof references.
- **D-20:** Keep provider-managed mandatory notices enabled for the initial integrations; do not suppress GoCardless fallback or disable Stripe notices without verified scheme-specific replacement responsibility and evidence. Missing authorization/notice proof holds dependent debits, with explicit owned exceptions.
- **D-21:** Outbound invoice sending uses a durable sender adapter, stable correlation and an ambiguity hold. SMTP/API acceptance is not delivery proof; a timeout never licenses a blind resend. No new email service purchase or real-customer sends are authorized by a fixture run.

### Operator surface

- **D-22:** Extend billing-account detail with Invoices and add registered desktop/mobile invoice list/show routes. Show obligation, delivery, payment and proof independently; reuse existing components and account/evidence navigation, not a new cross-account collections workspace.
- **D-23:** Expose closed CrmDataProvider methods with strict request/response decoding and deterministic Supabase/FakeRest parity. Server authorization remains independent; all new financial queries are excluded from offline persistence, realtime and analytics unless explicitly allowlisted safely.

### Proof and release

- **D-24:** Both real sandboxes must produce redacted dated receipts for the shared fixtures plus an eligibility, hosted authorization, variable debit/notice, idempotency/recovery, webhook/return, payout/export, support, portability, Deno runtime, residual compliance and effective-cost scorecard. Missing credentials or unsupported scenarios are gaps, not passed tests.
- **D-25:** All database/Auth/Edge/provider/replay/UI tests join the existing six protected financial lanes. Require clean and upgrade proof, isolated loopback schema push, exact hashes and rendered source receipt; preview and production remain separate gated evidence stages.
- **D-26:** Before Phase 5 implementation, reconcile the local Phase 4 baseline with the reviewed Phase 3 release lineage and rerun its gates. Preserve both histories and accepted hashes; do not overwrite registries, accept conflict sides wholesale or treat GitHub PR approval as production authorization.

### the agent's Discretion

Table/module/test names, bounded retry defaults, closed safe error vocabulary and visual composition within these invariants. Number format remains configurable; real terms, approval policy and provider eligibility require genuine evidence before use.
</decisions>

<canonical_refs>
## Canonical References

Downstream agents MUST read these before implementation:

- `.planning/REQUIREMENTS.md` — exact Phase 5 requirement text and definition of done.
- `.planning/ROADMAP.md` — phase boundaries and dependencies.
- `.planning/PROJECT.md` — tenancy, exact money, capability and release decisions.
- `.planning/phases/04-agreements-revenue-evidence-and-calculation-close/04-CONTEXT.md` — calculation/adjustment authority.
- `.planning/phases/04-agreements-revenue-evidence-and-calculation-close/04-VERIFICATION.md` — local proof, not deployed proof.
- `.planning/phases/05-immutable-invoicing-and-durable-provider-operations/05-BASELINE-PREFLIGHT.md` — exact conflicting baselines and entry gate.
- `docs/runbooks/financial-release.md` — staged owner-approved promotion.
- `docs/runbooks/financial-rollback.md` — failure handling, no receipt rewriting.
- `src/components/atomic-crm/providers/supabase/billingCloseProvider.ts` — existing closed RPC port.
- `src/components/atomic-crm/financial/exactMoney.ts` — exact branded USD authority.
- `supabase/tests/upgrades/004-agreement-close/expected-transformations.json` — local Phase 4 upgrade provenance.
- `makefile` and `.github/release/financial-paths.json` — protected test ownership.
</canonical_refs>

<code_context>
## Existing Code Insights

Current source, not the stale August codebase maps, is authority. Invoices already have an exact draft RPC compatibility layer; extend it without a second mutable authority. Billing close has strict Supabase/FakeRest adapters and calculation lineage reads. BillingAccountShow supports account panels and separate mobile composition. There is no durable payment queue, provider adapter or invoice resource screen yet; existing Postmark code handles inbound mail, not proven outbound delivery.

Reuse private evidence access controls, independent capabilities, request fingerprints, exact validators, billing offline exclusions and the six isolated release lanes. Generic sales-owned CRUD conventions do not override billing-organization authority and forced RLS.
</code_context>

<specifics>
## Specific Ideas

A paid-looking provider success must not hide a later return. Show “Payment received — bank reconciliation pending” only when supported by normalized facts, and never “Reconciled” from provider events alone. An outcome-unknown attempt shows “Check provider outcome” with no ordinary retry action.
</specifics>

<deferred>
## Deferred Ideas

No added scope. Customer portal, full collections workspace, bank imports/matching and broad automation controls remain their assigned later phases. Owner conventions can be supplied as versioned configuration without changing immutable history.
</deferred>
