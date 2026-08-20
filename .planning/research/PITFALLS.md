# Pitfalls Research

**Domain:** Unattended revenue-share billing, hosted ACH collection, reconciliation, and B2B collections for a small agency CRM  
**Researched:** 2026-08-19  
**Confidence:** HIGH for provider delivery/payment semantics and verified codebase risks; MEDIUM for the exact compliance duties RC Digital will inherit until the provider/ODFI and qualified counsel confirm its role, account mix, and contracts

## Recommended Prevention Phases

The roadmap may rename or subdivide these phases, but it must preserve this dependency order:

| ID | Phase | Exit condition relevant to pitfalls |
|----|-------|--------------------------------------|
| P0 | Executable Financial Test and Release Gate | A clean Supabase stack applies the full migration chain; database, RLS, RPC, Edge Function, and deployment checks block merges. |
| P1 | Tenant, Role, Storage, and Dependency Hardening | Two-tenant denial tests pass; billing roles and automation principals are least-privileged; financial evidence is private; vulnerable production dependencies and unsafe privileged-function precedents are remediated. |
| P2 | Money and Immutable State Primitives | Integer minor units, currency, canonical rounding, append-only events, compensating entries, and legal state-transition constraints are proven in PostgreSQL. |
| P3 | Versioned Agreements, Revenue Evidence, and Calculations | Effective-dated terms and formula versions, evidence provenance, deterministic snapshots, missing-report policy, and true-ups reproduce every amount without live ACH. |
| P4 | Provider Sandbox, Durable Intake, and Payment Subledger | The selected hosted provider is behind an adapter; authorization references, request idempotency, signature-verified durable webhook intake, order-tolerant processing, payment attempts, returns, disputes, fees, and payouts are recorded. |
| P5 | Reconciliation and Exception Operations | Invoice obligations, provider balance activity, payouts, fees, returns/refunds, and bank deposits reconcile; unmatched items fail closed into an operator queue. |
| P6 | Safe Collections and Restricted Portal | Collection eligibility depends on reconciled facts and active holds; contact policies are versioned; portal tenant isolation, private evidence, and dispute pause behavior pass end-to-end tests. |
| P7 | Observability, Recovery, and Shadow Pilot | Kill switches, dead-letter operations, alerting, provider replay, database plus evidence restore, and two representative shadow cycles are proven before live unattended collection. |
| P8 | Bounded Autonomy Promotion | Versioned reliability/loss thresholds are met; expansion is gradual, reversible, and supported by production evidence. |

## Critical Pitfalls

### Pitfall 1: The system applies the wrong agreement or produces an irreproducible bill

**Confidence:** HIGH — the current repository uses mutable invoice amounts, PostgreSQL `numeric(15,2)`, JavaScript `number`, competing line-item shapes, and no agreement/calculation snapshots.

**What goes wrong:**
A percentage, minimum, exclusion, adjustment, or rounding rule changes and silently alters a historical or in-flight invoice. Overlapping effective dates select the wrong contract version. “Revenue” means booked pipeline in one screen and commissionable collected revenue in another. A retry creates a second invoice, or browser, database, and provider totals differ by cents. Missing evidence is silently estimated rather than held or handled under an explicit contractual minimum-and-true-up rule.

**Why it happens:**
Teams store the current commission rate on the customer, reuse a mutable invoice row as both draft and ledger, perform money arithmetic in the browser, and regard formula tests as enough without binding the result to the exact agreement and evidence versions used.

**How to avoid:**
Use non-overlapping, immutable agreement versions with explicit effective intervals. Define commissionable revenue, cash/accrual timing, exclusions, refunds, taxes, attribution, cutoff, missing-report behavior, dispute window, and true-up policy in the signed terms. Store money as integer minor units plus ISO currency. Freeze a calculation snapshot containing agreement/formula version, revenue period, evidence IDs and hashes, gross/excluded amounts, adjustments, floor, rate, rounding policy/version, output, and code release. Enforce a permanent uniqueness key such as `(tenant, agreement, revenue_period, billing_run_kind)` and use compensating true-ups or credit notes instead of editing an issued result. Property-test boundaries, negative adjustments, floor crossover, repeated execution, date edges, and overflow; replay golden historical cases through both application and database paths.

**Warning signs:**
- Re-running the same close changes its hash or amount.
- Two agreement versions cover the same instant, or no version covers an invoice period.
- Line-item sum, stored total, generated document, and provider request differ.
- An operator can edit an issued amount or delete an invoice.
- A percentage invoice can advance without reviewed evidence or a contract-authorized fallback.
- Any financial assertion uses `toBeCloseTo`, a JavaScript floating-point amount, or SQL-text inspection instead of executed behavior.

**Recovery if triggered:**
Pause billing for the affected agreement cohort before sending or charging. Diff immutable inputs and formula versions to identify every affected period. Void only unissued drafts; correct issued records through explicit credit/debit adjustments and true-ups, with refunds requiring separate approval. Reconcile the corrected subledger to the provider and bank, notify affected customers with the original and corrected calculation, publish a new formula version, and retain the faulty version for audit. Add the discovered case as a permanent golden test before resuming.

**Phase to address:**
P2 establishes money/state invariants; P3 must prevent the business-rule failure before P4 can create a provider charge.

---

### Pitfall 2: A mutable invoice status is mistaken for a financial ledger

**Confidence:** HIGH — the audited schema permits mutable amounts/status and hard deletion, with no payment, allocation, refund, dispute, provider-event, or status history.

**What goes wrong:**
`invoice.status = 'Paid'` becomes the only record of what happened. Partial payments, multiple attempts, fees, returns, credits, refunds, disputes, write-offs, and payout membership are collapsed into one mutable field. Operators cannot prove who or what changed a balance, recovery cannot replay provider facts, and collections acts on a label rather than a defensible balance.

**Why it happens:**
Invoice-document CRUD looks complete in demos and matches many admin templates. Payment state is actually an event history with reversals and allocation, not a single forward-only enum.

**How to avoid:**
Treat the invoice as an immutable issued document and build a financial subledger beside it: provider events, payment intents/attempts, payments, allocations, fees, refunds, disputes/returns, payouts, adjustments, and invoice status events. Every material transition records tenant, actor/principal, cause event, prior/new state, timestamp, correlation ID, policy version, and amount/currency. Derive balances and presentation status from append-only facts; prohibit hard deletion and direct generic CRUD of provider-controlled fields. Use compensating entries and transactional transition functions with caller/tenant checks.

**Warning signs:**
- “Paid” has no provider event and allocation IDs.
- A refund rewrites the original payment amount.
- A payment reference column can hold only one attempt.
- A status update succeeds without a legal-transition or causation check.
- Historical aging changes when a current row is edited.
- Finance totals cannot be rebuilt from event rows at an `as_of` timestamp.

**Recovery if triggered:**
Freeze direct status mutation and take a snapshot of the current database. Import provider transaction, dispute, refund, and payout history into an append-only backfill ledger. Record uncertain legacy states as explicit exceptions rather than inventing event histories. Recompute balances, reconcile to provider and bank, require operator sign-off on unmatched legacy invoices, then make derived status read-only.

**Phase to address:**
P2 defines immutable primitives; P4 supplies provider-backed subledger events. This must precede P5 reconciliation and P6 collections.

---

### Pitfall 3: Duplicate, forged, missing, or out-of-order provider events move money twice or regress state

**Confidence:** HIGH — Stripe explicitly documents duplicate delivery, non-guaranteed order, retries for up to three days, raw-body signature verification, and asynchronous processing; GoCardless also instructs consumers to verify signatures, remember processed event IDs, and process asynchronously.

**What goes wrong:**
A webhook retry applies a payment twice; a later-arriving “created” event regresses a settled payment; a forged request marks an invoice paid; a handler returns `2xx` before the event is durable and then crashes; or a signature check fails because middleware changed the raw body. A network timeout after a provider accepted a charge leads the worker to create a second charge.

**Why it happens:**
Webhook delivery is treated as an ordered RPC rather than an at-least-once notification stream. Provider-side idempotency is assumed permanent even though Stripe may prune keys after 24 hours and GoCardless only guarantees them for at least 30 days. The existing Postmark handler is a dangerous precedent: it can acknowledge a helper failure and has no persisted event identity.

**How to avoid:**
At the public endpoint: bound body size, preserve the exact raw body, verify signature and account/environment, and transactionally insert a minimal immutable inbox record before responding `2xx`. Make `(provider, provider_account, event_id)` unique and also guard known semantic duplicates with `(object_id, event_type/action)` where the provider recommends it. Keep local billing-run and charge-intent uniqueness permanent. For every provider POST, persist the request purpose, canonical parameter hash, idempotency key, attempt, response/provider ID, and ambiguous-timeout state; retry with the same key and parameters, never a new key. Process events asynchronously with state-machine preconditions, fetch authoritative provider objects when dependencies are missing, and tolerate duplicates and arbitrary order. Keep intake enabled when downstream workers are killed so evidence is not lost.

**Warning signs:**
- More than one provider charge ID maps to one local charge intent.
- The endpoint returns `2xx` with no committed inbox row.
- Event timestamps or sequence move a resource backward.
- Duplicate-event count is always zero in production.
- A timeout retry generates a fresh idempotency key.
- Inbox received-to-processed lag, provider delivery failures, or signature failures have no alert.
- A webhook handler performs email, invoice updates, and provider calls synchronously before acknowledgement.

**Recovery if triggered:**
Disable charge creation and semantic event workers, but keep verified intake running. Query provider objects and events from the last known-good cursor; compare provider IDs to local charge intents and inbox rows. Replay unprocessed/failed events through the corrected idempotent reducer. Do not blindly resend ambiguous provider requests. Put possible duplicate debits into a high-priority review queue; issue refunds only after provider confirmation and authorization, then reconcile all corrections. Rotate a compromised webhook secret and overlap old/new verification only as supported by the provider.

**Phase to address:**
P4, after P0–P3. P7 must prove replay and alerting before live unattended charges.

---

### Pitfall 4: Hosted ACH is assumed to eliminate authorization and proof obligations

**Confidence:** HIGH that authorization/proof is required; MEDIUM on RC Digital's exact operational role until provider/ODFI and counsel confirm the account types, SEC codes, and contract. Nacha states that originators must be able to prove authorization, and its WEB guidance calls for retaining authorization evidence for two years after termination or revocation. Stripe requires a mandate before ACH debit and documents confirmation/notice duties.

**What goes wrong:**
The provider has a bank token, but RC Digital cannot show who accepted which one-time or recurring terms, for what calculation or expected range, when, and whether the mandate was later revoked. Variable commission invoices fall outside the authorization understood by the customer. Custom notification email is disabled or bounces. An inactive mandate is reused. Proof is sent through insecure email during an exception.

**Why it happens:**
“Hosted” is confused with “the provider owns every obligation.” Hosted collection keeps raw account credentials out of the CRM; it does not make an undocumented or out-of-scope debit authorized.

**How to avoid:**
Use only the provider's hosted authorization/bank-verification surface. Persist no raw account/routing data. Store provider customer/payment-method/mandate IDs, account classification and SEC-code decision supplied through the provider flow, authorization version/digest, acceptance timestamp, signer/contact, scope (one-time/recurring), amount/range or calculation disclosure, notification delivery evidence, revocation/inactivation events, and proof-retrieval procedure. Gate every debit on an active mandate whose scope matches the invoice. Let the provider send required mandate and debit notices unless RC Digital has deliberately accepted and tested that duty. Set retention from the current provider/ODFI requirements and legal review; for WEB evidence, design for at least two years after termination/revocation. Exercise retrieval, export, and secure transmission of proof in sandbox before launch.

**Warning signs:**
- A payment method ID exists without an authorization/proof reference and terms version.
- The system cannot export proof for a sampled mandate promptly.
- Variable debit amounts have no disclosed calculation/range or pre-debit notice policy.
- Mandate canceled/inactive events do not stop queued charges.
- Notifications are configured in two systems, or in neither.
- Operators paste bank data or authorization documents into notes, logs, email, or a public bucket.

**Recovery if triggered:**
Stop further debits under the affected mandate. Retrieve provider-held proof and all notifications without fabricating missing consent after the fact. Route requests through a secure channel, classify affected debits with the provider/ODFI, and preserve all correspondence. If proof or scope is insufficient, move the invoice to manual dispute resolution and obtain a new prospective mandate before another attempt. Review whether customer, provider, bank, regulator, or counsel notification is required.

**Phase to address:**
Provider/ODFI duty mapping begins in the P4 selection spike; P4 must implement proof, revocation, and charge gates before live use. P7 verifies retrieval and recovery.

---

### Pitfall 5: Queue retries repeat charges or contacts, while stuck jobs disappear silently

**Confidence:** HIGH — at-least-once delivery and crash ambiguity are inherent to the required webhook and job workflow; the codebase currently has no durable queue, lease, dead-letter, or operator tooling.

**What goes wrong:**
Two workers claim the same monthly run. A process crashes after the external side effect but before marking the job complete. Expired leases cause a second email or charge. Infinite retries hammer a provider or customer; non-retryable errors clog the queue; clock skew or daylight-saving calculations fire a collection action at the wrong time. A dead-letter row exists but nobody can safely inspect or replay it.

**Why it happens:**
A cron invocation or Edge Function request is mistaken for a durable workflow. “Exactly once” is claimed without designing local intent uniqueness and externally idempotent effects.

**How to avoid:**
Use a transactional outbox/job table with explicit state, available time, priority, attempt count, bounded exponential backoff with jitter, lease owner/expiry, heartbeat where needed, timeout class, maximum attempts, and dead-letter reason. Claim atomically (for example, `FOR UPDATE SKIP LOCKED`) and make each side effect independently idempotent using a stable business-action key. Commit business state and next work atomically when possible. Classify errors into retryable, terminal, and ambiguous; reconcile an ambiguous provider call before retry. Rate-limit by provider account and customer. Provide operator actions for inspect, retry, cancel, quarantine, and resolve—each audited. Test crashes before and after every boundary.

**Warning signs:**
- Queue depth is visible but oldest-ready age and stuck-lease count are not.
- A worker catches an error, logs it, and returns success.
- Attempts have no cap or jitter.
- Manual replay can bypass idempotency or holds.
- A job payload contains mutable customer/formula data rather than immutable references.
- Restart/concurrency tests produce more than one external-action intent.

**Recovery if triggered:**
Pause the affected action type with a scoped kill switch. Reclaim only expired leases after checking provider/email delivery state. Quarantine ambiguous rows, reconstruct intent from immutable references, and use provider IDs/message IDs to determine whether the side effect occurred. Repair the worker, replay through the normal idempotent path, and record manual resolutions. Notify customers for duplicate contacts; use approved refund/dispute workflow for duplicate debits.

**Phase to address:**
P4 for the durable queue and payment-action idempotency; P6 adds collection-policy keys; P7 proves crash/restart, dead-letter, and operator recovery.

---

### Pitfall 6: ACH “initiated” or provisional success is treated as final cash

**Confidence:** HIGH — Stripe documents ACH Direct Debit as delayed-notification, taking up to four business days for initial acknowledgement, with failures and disputes; it also documents final network disputes, late returns, mandate invalidation, and double-credit risk when a refund overlaps a dispute.

**What goes wrong:**
The invoice closes, revenue is counted as collected, service decisions change, or collections stops as soon as ACH is initiated. Later failure, return, dispute, refund, fee, or payout failure is not applied. Conversely, a delayed success is mistaken for nonpayment and triggers a duplicate attempt or collection contact. A proactive refund and bank dispute both credit the customer.

**Why it happens:**
Card-like “success” language is projected onto a bank-debit lifecycle. Provider object status, provider available balance, payout settlement, bank deposit, and final business resolution are collapsed into one `paid` boolean.

**How to avoid:**
Model distinct facts: authorized, submitted, provider-processing, provider-succeeded, available, included in payout, deposited/reconciled, failed, returned/disputed, refunded, and reversed. Define separately when an invoice is operationally satisfied and when cash is reconciled. Consume mandate, payment, return/dispute, refund, balance-transaction, and payout events. Make a return or dispute reopen the balance through a compensating event and pause automated collection until policy review. Never issue automatic refunds in v1; check for an open dispute/return and provider state first.

**Warning signs:**
- `paid_at` is set from charge creation or `processing`.
- Collected-revenue dashboards include funds not in a provider payout or bank deposit without labeling them pending.
- A returned payment does not reopen an invoice balance.
- A failed/delayed payment immediately triggers another debit without an attempt policy.
- Refund and dispute events can both reduce the balance without a double-credit alert.

**Recovery if triggered:**
Freeze collections and revenue exports for affected invoices. Pull provider payment, balance transaction, dispute/return, refund, and payout histories; append missing lifecycle events; recompute allocations and balances; reconcile to bank deposits. Open customer-visible exceptions where service or communications were based on the wrong state. Resolve possible double credits with the provider and customer rather than creating another automatic debit.

**Phase to address:**
P4 models the lifecycle; P5 proves settlement reconciliation; P6 may consume only the reconciled/exception-aware balance.

---

### Pitfall 7: Reconciliation proves invoice totals but not the cash that reached the bank

**Confidence:** HIGH — both Stripe and GoCardless expose payout-level reconciliation that relates payments/refunds and other balance activity to settlement batches; the current codebase has none of the required models or watermarks.

**What goes wrong:**
CRM invoices equal provider charge amounts, yet bank deposits differ because of fees, refunds, disputes, reserves, adjustments, failed payouts, timing, or transactions grouped into different batches. A dashboard is “balanced” only because unmatched items were dropped or a cutoff moved. Drift grows until month-end, when the source evidence needed to explain it is difficult to recover.

**Why it happens:**
Teams perform two-way invoice-to-payment matching and call it reconciliation. They do not model the provider as a clearing account or reconcile payouts and bank deposits with explicit as-of timestamps and completeness watermarks.

**How to avoid:**
Perform three-layer reconciliation: (1) invoice obligation and allocations, (2) provider payment/balance activity including gross, fees, refunds, disputes, adjustments and pending/available balances, and (3) provider payout to bank deposit using provider payout/trace IDs. Store immutable reconciliation runs, source cursor/watermark, expected and observed amount/count, cutoff/time zone, match rule/version, and evidence hash. Every source row must be matched, pending with reason, or in a durable unmatched queue—never silently ignored. Re-run late periods when returns arrive without rewriting the original close.

**Warning signs:**
- Reconciliation has no “source complete through” watermark.
- Net bank deposits are compared directly with gross invoices.
- The delta is zero but unmatched count is nonzero.
- Manual spreadsheet adjustments have no source or reviewer.
- An item can disappear when a date range changes.
- Unmatched value/age, failed payouts, and ending provider balance are not alerted.

**Recovery if triggered:**
Stop balance-dependent collections and reporting. Establish provider and bank cutoffs, import all balance/payout rows since the last verified watermark, and rebuild the clearing-account roll-forward. Preserve old runs; append a corrected run with reasons. Resolve missing mappings through provider IDs, invoice metadata, amounts, and dates; leave ambiguity unmatched for operator review. Resume only after both amount and count equations close or every exception has an owner and due date.

**Phase to address:**
P5, after P4's complete subledger. P6 collections is blocked until P5 exit criteria pass.

---

### Pitfall 8: Collections contacts the wrong customer, at the wrong time, for the wrong balance

**Confidence:** HIGH for the operational harm and required state gates; MEDIUM for legal scope. RC Digital appears to collect its own B2B receivables, and CFPB guidance says the federal FDCPA generally does not cover business debts or original-creditor collection, but state law, contract, communication channel, and future customer mix still require qualified review.

**What goes wrong:**
A reminder is sent after settlement but before reconciliation, during an active dispute, after a promise-to-pay, to a former billing contact, across the wrong tenant, outside customer preferences/quiet hours, or repeatedly because a retry is mistaken for a new policy action. The message states an incorrect amount or threatens escalation the contract and operator have not approved.

**Why it happens:**
“Due date passed” is treated as sufficient authority. Collections is built before reconciliation, contact authority, dispute/legal holds, communication history, and policy versioning.

**How to avoid:**
Create a collection case from the derived, reconciled open balance—not directly from invoice status. Before every action, transactionally re-check tenant, authorized billing contact, balance/as-of time, recent provider activity, dispute/legal/customer/incident hold, promise-to-pay, channel consent/preference, local time/quiet hours, attempt cap, template/policy version, and prior action key. Use one unique key per `(case, policy stage, channel, scheduled slot)`. Start with reminders and operator tasks; keep service suspension, legal escalation, refunds, credits, and write-offs manual. Obtain counsel's state/jurisdiction review before enabling automation and repeat it before expanding beyond B2B original-creditor activity.

**Warning signs:**
- A collection query is only `due_date < now AND status != paid`.
- Dispute creation does not synchronously place a hold.
- Contact changes do not invalidate queued messages.
- Templates can change without versioning or approval.
- A retry produces a second customer-visible action.
- There is no metric for post-payment contact, held-case contact, wrong-contact report, or duplicate contact.

**Recovery if triggered:**
Activate the global collections kill switch and cancel queued actions. Place incident/customer holds, correct the ledger and contact record, and send a human-reviewed apology/correction when appropriate. Preserve the exact message, policy, data snapshot, and delivery evidence. Review every case selected by the same rule, notify counsel/management when warranted, add a deterministic regression test, and require an operator-approved dry-run before re-enabling the stage.

**Phase to address:**
P6, strictly after P5. P7 shadow cycles must measure false-contact and hold-violation rates before P8 promotion.

---

### Pitfall 9: Tenant isolation or a privileged endpoint leaks financial data or moves another customer's money

**Confidence:** HIGH — the repository has verified permissive RLS and an unsafe `SECURITY DEFINER` precedent. Supabase documents that views may bypass RLS, security-definer functions run with creator privileges, the `search_path` must be pinned, and service credentials bypass RLS.

**What goes wrong:**
One customer sees another's agreement, invoice, evidence, mandate metadata, or dispute. A caller supplies another tenant's record/provider ID to a service-role Edge Function. A security-definer RPC bypasses RLS, or a view exposes rows its base-table policies intended to hide. An automation principal is effectively a global superuser and a bug charges the wrong provider customer.

**Why it happens:**
UI filtering and salesperson ownership are mistaken for tenant authorization. Service-role code trusts IDs in the request body. Broad legacy policies and privileged functions are copied into the billing domain.

**How to avoid:**
Create an explicit organization membership, billing role, and scoped automation-principal model. Enable least-privilege RLS on every exposed billing table and storage object; test views for invoker behavior. At server boundaries, derive tenant and provider-account mapping through authorized database relationships instead of accepting them from the client. Keep privileged functions in a non-exposed schema, revoke default execution, grant narrowly, set `search_path = ''`, schema-qualify every object, validate caller/tenant ownership inside the function, and audit every material action. Run behavioral tests with two tenants, anonymous/authenticated users, each billing role, stale membership/JWT cases, and automation identities.

**Warning signs:**
- `USING (true)`, `WITH CHECK (true)`, nullable ownership as global visibility, or browser-only role checks.
- A service-role function accepts `tenant_id`, storage path, provider customer, invoice, or mandate ID without reloading ownership.
- A view or RPC lacks explicit security semantics and grants.
- Cross-tenant negative tests inspect SQL text rather than query a running database.
- One automation secret can mutate all tenants without an allowlisted operation and audit cause.

**Recovery if triggered:**
Disable portal, privileged endpoints, and outgoing financial actions; preserve audit and provider logs. Revoke sessions/keys/secrets implicated in the path, determine accessed and mutated records, and reconcile any provider effects. Follow the incident-response and legally reviewed notification process. Repair authorization centrally, run the full cross-tenant matrix plus provider sandbox tests, and require independent review before reopening.

**Phase to address:**
P1 is a hard prerequisite for every later phase. P6 adds portal-specific E2E isolation; P7 rehearses incident containment.

---

### Pitfall 10: Revenue evidence and authorization records are publicly accessible, over-shared, or unrecoverable

**Confidence:** HIGH — the current `attachments` bucket is public. Supabase says public-bucket reads bypass access controls; private-bucket reads use RLS or time-limited signed URLs. Supabase also states database backups contain Storage metadata, not the stored objects themselves.

**What goes wrong:**
Contracts, statements, receipts, exports, mandate proof, or dispute documents inherit the public note-attachment pattern. Long-lived links are forwarded or logged. Tenant isolation protects metadata but not a public object URL. Files survive beyond policy, malware is served to operators, or a database restore recreates references to Storage objects that were never restored.

**Why it happens:**
Evidence is treated as a generic attachment feature. Public URLs are convenient, and database backup status creates false confidence that blobs are protected.

**How to avoid:**
Create a dedicated private billing-evidence bucket. Authorize object access through tenant-bound metadata and Storage RLS; generate short-lived signed reads only after server-side authorization. Never accept caller-supplied arbitrary paths for privileged deletion. Validate type, size, extension and content; quarantine/scan untrusted uploads before review. Record object hash, size, source, uploader, tenant, access events, retention class, legal/dispute hold, and deletion tombstone. Redact sensitive data from logs and do not store raw bank credentials. Build a separate encrypted/versioned export or backup process for evidence objects and verify hash-based rehydration with the database snapshot. Keep signed-URL TTLs short because Supabase notes they remain valid until expiry unless support intervenes.

**Warning signs:**
- Billing evidence calls `getPublicUrl` or is placed in the legacy `attachments` bucket.
- Anyone with a copied URL can fetch an object after logout.
- Storage paths encode customer names or sensitive terms.
- A restore exercise validates metadata rows but not file bytes and hashes.
- Signed URLs are stored permanently in database rows or analytics logs.
- There is no access log, retention owner, quarantine status, or hold override.

**Recovery if triggered:**
Disable public access and upload/download paths, move affected objects to a private bucket with new randomized names, and invalidate/remove public objects and cached references. Treat already shared URLs as disclosed; inspect access/audit logs and follow the incident notification decision process. Restore missing evidence from verified export/provider/customer sources, record provenance and gaps, then test link expiry and hash-based restore before reopening.

**Phase to address:**
P1 before any production evidence upload; P3 uses the hardened evidence model; P7 proves object recovery.

---

### Pitfall 11: A coupled migration or deployment leaves schema, functions, frontend, and provider behavior at incompatible versions

**Confidence:** HIGH — the audited workflow currently couples database push, Edge Functions, frontend build, and publication, while the migration chain has known stale-column failures and is not executed by CI. Supabase recommends clean reset/testing, migration-only schema changes, separate environments, and required migration checks.

**What goes wrong:**
A database migration applies, a later function or frontend deployment fails, and old code writes an incompatible shape. A destructive rename/drop races with queued work. A webhook endpoint or collection worker becomes live before its table/policy exists. Direct production SQL creates migration-history drift. Rollback restores code but cannot unapply already-written financial facts.

**Why it happens:**
Deployment is treated as one reversible artifact. Database changes and external side effects have different rollback semantics, and a green TypeScript build says nothing about the full migration chain or mixed-version operation.

**How to avoid:**
Make P0 blocking: recreate a clean local database, apply every migration, run pgTAP/client integration tests under real claims, serve/test Edge Functions, and test upgrade from representative sanitized fixtures. Use expand/backfill/dual-read-or-write/contract migrations; do not drop old columns or states until all consumers and queued jobs have moved. Deploy backward-compatible schema first, then dormant handlers, then application, then shadow traffic, then scoped feature flag. Separate provider intake from charge/collection enablement. Maintain global and per-customer kill switches. Validate backfill counts, sums, hashes, constraints, RLS, and migration history. Never edit an applied migration or make uncaptured remote schema changes.

**Warning signs:**
- `supabase db reset` is absent from blocking CI.
- A deployment can charge immediately when a route appears.
- One commit adds a required column and removes the old one.
- Database, Edge Function, frontend, and job versions lack compatibility tests and release markers.
- `migration repair` is used without first proving the actual schema state.
- Rollback documentation says only “redeploy the previous frontend.”

**Recovery if triggered:**
Disable new writers and external actions while keeping verified event intake. Capture migration history and schema state; choose a forward repair that preserves financial facts. Reconcile any external side effects created during the partial window. Restore only after an explicit data-loss/RPO decision, then replay durable provider events and queued intents. Re-run clean-chain, upgrade, RLS, compatibility, and reconciliation checks before staged re-enable.

**Phase to address:**
P0 is the prevention gate; every later phase uses it. P7 proves staged rollback/forward-repair and kill switches before live automation.

---

### Pitfall 12: Logs are green while revenue leakage, drift, or customer harm accumulates

**Confidence:** HIGH — current operational failures are console-only and the system has no event/job failure store, alerting, or financial health dashboard.

**What goes wrong:**
No webhook arrives after a configuration change, so there are no errors to alert on. A queue stops claiming jobs, signature failures spike, reconciliation lags, evidence reminders bounce, or a provider credential expires. Each request looks successful in isolation while billing closes are missed or collection messages violate a hold.

**Why it happens:**
Teams alert on thrown exceptions and HTTP 500s rather than invariants, silence, lag, and business outcomes. Logs have no durable correlation from agreement to evidence, invoice, provider request/event, payout, reconciliation, and collection action.

**How to avoid:**
Use structured, redacted logs plus durable status rows and correlation IDs. Measure event last-received/last-processed time, signature failures, duplicate suppression, inbox/queue oldest age, stuck leases, retries/dead letters, ambiguous provider calls, mandate inactivation, payment return/dispute rate, reconciliation delta amount/count and unmatched age, failed payouts, missing revenue closes, collection post-payment/hold violations, delivery bounces, backup age, and last successful restore exercise. Add absence-of-data heartbeats/canaries, explicit thresholds with owners/escalation, runbook links, and alert-delivery tests. Dashboard counts must link to the exact exception rows.

**Warning signs:**
- “No errors” is the only health evidence.
- Metrics omit tenant, provider account, environment, release, policy, or correlation ID.
- Reconciliation or queue lag is checked only at month-end.
- Alerts have no owner, acknowledgement, escalation, or synthetic delivery test.
- A kill switch is configuration-only and has never stopped a sandbox action already queued.

**Recovery if triggered:**
Freeze outgoing actions and establish the last known-good watermark for each pipeline. Backfill provider events/reports, revenue closes, job outcomes, and bank settlements; rebuild reconciliation; inspect communications already sent. Create exception cases for all gaps, notify affected customers where appropriate, add the missing metric/alert and a runbook, and require a monitored shadow window before re-enable.

**Phase to address:**
P7 builds and proves observability, but each earlier phase must emit its domain metrics from first implementation. P8 promotion consumes those metrics.

---

### Pitfall 13: “Backups enabled” is mistaken for financial disaster recovery

**Confidence:** HIGH — Supabase documents that database backups exclude Storage objects, restores cause downtime, and PITR granularity/availability depends on plan. NIST guidance emphasizes tested contingency plans, recovery validation, and exercises rather than backup existence alone.

**What goes wrong:**
A database can be restored but evidence bytes, function configuration, secrets, external provider events, email history, and bank reports are missing. Restoring to an earlier point duplicates charges when queued intents replay or loses webhook events received after the recovery point. The first attempted restore occurs during an incident, RLS or custom roles differ, and nobody knows the acceptable data-loss or downtime window.

**Why it happens:**
Managed backup status is treated as an end-to-end recovery capability. External systems and object storage are omitted, and restoration is never reconciled against real provider truth.

**How to avoid:**
Define affordable, explicit RPO/RTO targets for database, evidence objects, webhook inbox, provider/accounting exports, configuration, and audit records. Choose daily backup or PITR based on those targets rather than labels. Maintain encrypted evidence-object backup/export with hashes, version-controlled migrations/functions/config, a secrets/credential recovery inventory, and provider replay/cursor procedures. Restore to an isolated project on a recurring schedule; verify roles/RLS, row counts, event uniqueness, ledger control totals, evidence hashes, provider cursor, queued-intent state, and reconciliation to provider/bank. The runbook must prevent side effects during restore and require a new idempotency/reconciliation assessment before workers resume.

**Warning signs:**
- The recovery plan says only “Supabase has backups.”
- No owner can state RPO, RTO, retention, or last successful restore duration.
- Evidence-object bytes are not part of the restore receipt.
- Provider webhook resend/retrieval limits are assumed infinite.
- A restored queue can immediately contact customers or create charges.
- A restore test ends at “database started” without financial control totals and RLS tests.

**Recovery if triggered:**
Keep all outbound workers disabled. Restore database and evidence to an isolated environment, reapply/verify configuration and roles, and determine the exact recovery watermark. Pull provider events and financial reports after that point, deduplicate into the inbox, rebuild the subledger and reconciliation, and classify irrecoverable evidence gaps. Promote the recovered system only after control totals, tenant-denial tests, file hashes, and sampled invoice-to-bank traces pass; then resume tenants/actions gradually.

**Phase to address:**
P7 before live unattended billing; P0 ensures the restored schema/test suite is executable. Rehearse again before each autonomy promotion in P8.

## Technical Debt Patterns

Shortcuts that look inexpensive for a small agency but create direct financial or customer risk.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Keep money as JavaScript `number` / mutable SQL decimal fields | Reuses current invoice helper/schema | Cent drift, irreproducible charges, browser/server mismatch | Never for stored obligations, balances, or provider amounts; client-only preview may format integer-minor-unit results. |
| Edit or delete issued invoices | Easy correction UI | Destroys audit history and reconciliation | Never; use void-before-issue or compensating credit/debit records. |
| Use SQL-string tests as security proof | Very fast unit suite | Broken migrations and RLS bypass still ship | Only as supplemental lint, never as a release gate. |
| Use the legacy public attachment bucket | No new storage work | Confidential financial evidence disclosure | Never for billing evidence. |
| Perform provider work synchronously in webhooks | Less infrastructure | Timeouts, retries, duplicates, partial side effects | Never beyond signature verification and durable inbox acceptance. |
| Rely only on provider idempotency | No local intent table | Duplicate after provider retention window or changed key | Never; provider protection supplements permanent local uniqueness. |
| Derive “collected” from invoice status | Simple dashboard | False revenue and collections decisions | Never; derive from append-only provider/reconciliation facts. |
| Use a spreadsheet as the unmatched-item queue | Familiar operations | Lost ownership, no replay/audit, stale corrections | Acceptable only as a temporary read-only export while the CRM remains the authoritative exception store. |
| Give the automation principal service-role access everywhere | Quick integration | Cross-tenant blast radius and untraceable mutation | Never; split/scoped principals and allowlisted operations are prerequisites. |
| Let one deploy job mutate DB, functions, UI, and live provider flags | Simple CI | Partial incompatible rollout and unsafe rollback | Never for money-moving releases. |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Stripe webhooks | Parse/re-serialize before signature check; assume order; process before durable insert | Verify against raw bytes, persist unique event/account first, acknowledge quickly, process asynchronously and order-independently. |
| GoCardless webhooks | Ignore batched events or process the same event twice | Verify signature, persist each event ID, enqueue each independently, and retain the whole delivery correlation. |
| Stripe API idempotency | Generate a new key after timeout or treat a 24-hour-plus key as permanent | Persist one business-intent key and parameter hash; reuse it for the same attempt, and enforce permanent local uniqueness. |
| GoCardless API idempotency | Depend solely on the provider's at-least-30-day retention | Use a stable local payment-intent ID as the provider key and keep a permanent local unique constraint. |
| ACH mandates | Save a payment method token but not terms/proof/revocation state | Persist provider proof references, terms version/digest, scope, notifications, and active/revoked history; test retrieval. |
| ACH payment status | Treat submitted/processing/provider success as bank-reconciled cash | Preserve every lifecycle fact and reconcile provider payouts to bank deposits. |
| Stripe payouts | Match net payout directly to invoices | Use balance/payout reconciliation rows including fees, refunds, disputes, adjustments, and ending balance. |
| GoCardless payouts | Ignore child events or pagination | Fetch payout paid event and all child payment/refund events to a completeness watermark. |
| Supabase RLS | Trust UI filters, views, or service-role handlers | Enforce tenant/role ownership in PostgreSQL and at server boundaries; exercise real cross-tenant denial. |
| Supabase Storage | Store sensitive documents in public buckets or persist signed URLs | Use a private bucket, RLS, short-lived authorized links, object access audit, and separate object backup. |
| Supabase backup/PITR | Assume database restore includes Storage objects or immediately restart workers | Restore evidence separately, validate hashes/control totals, ingest missing provider facts, then gradually re-enable workers. |
| Email/collection delivery | Treat provider acceptance as customer receipt, and retries as new actions | Store message/action ID, bounce/delivery events, customer/time policy, and one stable action key per policy slot. |

## Performance Traps

Correctness failures arrive before “large scale”; thresholds below are operational triggers, not reasons to postpone the durable design.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Browser-side financial aggregation with fixed page limits | Totals change with pagination; 100/500/1,000-row caps undercount | Server-side control totals, as-of timestamps, cursor pagination | As soon as a period exceeds the fetch limit; the current app already uses capped queries. |
| Unindexed inbox/queue/reconciliation scans | Month-end jobs slow, leases expire, duplicate workers rise | Composite indexes on state/available time/provider/account/object and archive strategy | Often at tens of thousands of event/job rows—plausible within months even for few customers because every transition is a row. |
| Broad Realtime invalidation on event tables | Bulk replay causes repeated full refetches and UI/provider load | Keep high-volume event tables out of broad publication; emit compact domain notifications and coalesce refresh | During first provider backfill or month-end burst, not only at high customer count. |
| Synchronous webhook business logic | Provider retries and duplicate deliveries rise during bursts | Durable inbox plus bounded async workers | A handful of simultaneous month-start renewals or one slow downstream call can exceed request limits. |
| One unbounded global worker | One tenant/provider failure starves all billing; rate limits cascade | Bounded concurrency, per-provider/account limits, fair scheduling, backoff/jitter | A single poison job or provider incident. |
| Recomputing the full ledger for every list row | Slow aging/portal screens and database contention | Indexed balance projections/materialized summaries derived from immutable events, with audit drill-down | Hundreds of invoices with several events each; optimize measured queries after correctness. |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Permissive legacy RLS anchors billing relationships | Any authenticated user may read/mutate another customer's financial context | P1 explicit organizations/roles plus real two-tenant policy tests before billing data exists. |
| Unsafe `SECURITY DEFINER` or definer view | RLS bypass and search-path privilege escalation | Private schema, revoked default execute, pinned empty `search_path`, qualified names, caller/tenant binding, invoker-safe views. |
| Client-controlled tenant/provider/storage IDs | Cross-tenant evidence access or wrong-customer debit | Resolve every external identifier from an authorized server-side record. |
| Service credential in browser or broad automation secret | Full-data compromise | Server-only secrets, scoped principals, secret rotation, allowlisted operations, audit/correlation IDs. |
| Public evidence bucket / long signed URLs | Contracts, statements, disputes, or proof leak | Private RLS bucket, short TTL, no persisted URL, access audit, incident procedure. |
| Raw bank data in CRM, logs, screenshots, or support notes | Expands security/compliance scope and breach impact | Hosted provider collection only; store provider tokens/last-four only where needed; redact telemetry. |
| Unsigned/replayed webhook acceptance | Forged or duplicate financial transitions | Raw-body signature verification, timestamp tolerance where supported, unique inbox, semantic transition guards. |
| Unbounded upload | Malware, storage abuse, operator compromise | Size/type/content checks, randomized path, quarantine/scanning, download headers, retention. |
| Dependency vulnerabilities and public source maps | Enlarged payment-facing attack surface and leaked implementation detail | Remediate current audit, block regressions, verify release assets/config before provider endpoints go live. |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| One “Paid” badge hides ACH uncertainty | Operators and customers make decisions from provisional state | Show human-readable submitted, processing, settled-to-provider, reconciled, returned/disputed states with dates and evidence. |
| Calculated amount lacks trace | Customer cannot understand percentage/minimum invoice | Show frozen formula version, period, gross/exclusions, rate/floor, adjustments, evidence status, and dispute action without exposing internal notes. |
| Exception looks like failure | Operators work around fail-closed holds | Show why it paused, money/contact actions prevented, required evidence/role, owner/SLA, and safe next actions. |
| Generic CRUD exposes provider fields | Operators “fix” state by editing IDs/status | Use explicit commands with confirmation, permission, consequence preview, and immutable audit event. |
| Portal exposes internal CRM concepts | Customer confusion and possible information leak | Restricted task-oriented portal: submit evidence, view issued invoice, hosted payment setup, dispute, and communication preferences only. |
| Mobile silently omits billing safety actions | On-call operator cannot pause or inspect an incident | Deliberately support a safe mobile read/kill-switch/exception subset, and label desktop-only high-risk resolutions. |
| Kill switch has unclear scope | Operator believes all money stopped when only one worker stopped | Display provider intake, charges, collection messages, retries, and per-customer/global switch states separately. |
| Reconciliation dashboard shows only green totals | Hidden unmatched items and cutoff ambiguity | Show amount and count equations, watermark/as-of time, unmatched age/value, and drill-down evidence. |

## “Looks Done But Isn't” Checklist

These are release receipts, not demo observations.

- [ ] **Database gate:** A CI run from an empty local Supabase instance applies the entire migration chain and executes database/RLS/RPC tests; verify the known stale-column migration cases can no longer pass through SQL-string assertions alone.
- [ ] **Tenant isolation:** In a deployed preview, two real test tenants plus anonymous, operator, customer, auditor, and automation identities attempt every billing table, view, RPC, Edge Function, and Storage operation; verify cross-tenant reads and mutations are denied in the database logs/results.
- [ ] **Formula reproduction:** Persist a fixed and a percentage-plus-minimum close, redeploy with changed terms/code, and reproduce the original snapshot byte-for-byte; verify boundary/rounding/true-up cases and unique period/run constraints.
- [ ] **Immutable invoice:** Attempt update/delete of an issued invoice and direct provider-status edit; verify denial and prove a correction creates a compensating event/document while history remains queryable.
- [ ] **Provider unknown outcome:** Force a timeout after sandbox provider acceptance, restart the worker, and verify exactly one provider charge maps to one permanent local intent using the same idempotency key.
- [ ] **Webhook intake:** Replay an identical signed event, a semantic duplicate, invalid signature, malformed body, oversized body, and reversed event order; verify one durable effect, no state regression, correct response, and alert/metric increments.
- [ ] **Queue recovery:** Crash workers before and after provider/email side effects, expire a lease, exhaust retries, and replay a dead letter; verify no duplicate customer-visible action and a complete audited operator resolution.
- [ ] **Authorization proof:** From the production-like provider configuration, export a sampled mandate's accepted terms/version, scope, timestamp, confirmation delivery, and revocation state; verify a revoked/inactive/out-of-scope mandate blocks charge creation.
- [ ] **ACH return/dispute:** In sandbox/scenario simulation, take a payment through processing/success and then failure/return/dispute; verify the ledger compensates, mandate/policy gates react, reconciliation reopens, and collections remains held.
- [ ] **Payout reconciliation:** Trace representative fixed and percentage invoices through gross payment, fee, refund/return, payout, and bank-deposit fixture; verify amount and count equations, ending balance, watermark, and unmatched queue.
- [ ] **False-collection prevention:** Settle an invoice after the schedule selects it, change the billing contact, create a dispute and promise-to-pay, and retry the worker; verify every queued message is re-authorized at send time and prohibited actions are absent from delivery logs.
- [ ] **Evidence privacy:** Verify unauthenticated and wrong-tenant users cannot list or download objects; verify signed-link expiry, upload quarantine, access audit, retention hold, and absence of public URLs in database/build/log output.
- [ ] **Staged deployment:** Deploy compatible schema, dormant handlers, app, and shadow flag separately; deliberately fail an intermediate stage and verify old/new clients remain safe, external actions stay disabled, and forward repair/kill-switch receipts are retained.
- [ ] **Observability:** Stop webhooks/workers without generating errors, create reconciliation drift and a stuck lease, and trigger a collection hold violation in sandbox; verify alerts arrive to the named operator with correlation IDs and runbook links.
- [ ] **Restore:** Restore database and evidence objects into an isolated project, apply roles/secrets/config, import provider events after the recovery watermark, and verify hashes, RLS, ledger control totals, queues disabled, and sampled invoice-to-bank traces within declared RPO/RTO.
- [ ] **Shadow-to-live gate:** Complete at least two shadow cycles for one fixed and one percentage-plus-minimum customer; verify zero duplicate charges, unauthorized transitions, and prohibited contacts, plus approved thresholds for reconciliation delta, missed events, recovery time, disputes, and rollback.
- [ ] **Production proof:** After authorized enablement, verify the immutable deployed release/policy marker, provider endpoint/account/environment, kill-switch state, webhook freshness, queue lag, reconciliation watermark, and alert delivery; a merge, HTTP 200, screenshot, or provider sandbox pass alone is not production proof.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Wrong formula/version | HIGH | Pause cohort; diff snapshots; create credits/debits/true-ups; reconcile provider/bank; customer correction; new version plus regression fixture. |
| Mutable/incomplete ledger | HIGH | Freeze edits; import provider history; append explicit legacy exceptions; rebuild balances; restrict derived status. |
| Duplicate/forged/out-of-order webhook | MEDIUM–HIGH | Keep intake, stop workers/charges; query provider truth; deduplicate/replay; review duplicate debit; rotate secret if compromised. |
| Missing/out-of-scope ACH proof | HIGH | Stop mandate; retrieve evidence securely; provider/ODFI/counsel review; handle disputed entries; obtain new prospective authorization. |
| Queue retry/stuck lease | MEDIUM | Pause action type; check external outcome; quarantine ambiguity; repair; replay idempotently; audit resolution. |
| Late ACH return/double credit | HIGH | Freeze dependent collections/reporting; ingest return/refund/dispute; compensate ledger; reconcile; direct customer/provider resolution. |
| Reconciliation drift | MEDIUM–HIGH | Lock cutoff/watermark; import complete provider/bank sources; rebuild clearing roll-forward; assign every exception. |
| False collections | HIGH | Global collection stop; cancel queue; correct case/contact/balance; preserve message; human-reviewed correction; cohort review. |
| Tenant/evidence exposure | HIGH | Disable affected surfaces/actions; revoke credentials; preserve logs; scope exposure; reconcile mutations; incident/legal response; retest. |
| Partial migration/deploy | HIGH | Disable writers/actions; capture schema/history; forward repair; reconcile external effects; restore/replay only with explicit RPO decision. |
| Monitoring blind spot | MEDIUM–HIGH | Determine last-good watermark; backfill all pipelines; create exceptions; add invariant/absence alert; shadow before re-enable. |
| Incomplete disaster recovery | HIGH | Restore isolated; recover objects/config; pull provider tail; deduplicate/reconcile; validate RLS/hashes/control totals; gradual promotion. |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Wrong agreement/formula/rounding | P2–P3 | Repeated and post-upgrade calculation snapshot is identical; overlap, boundary, rounding, missing-evidence, and true-up tests pass. |
| Mutable invoice as ledger | P2 and P4 | Issued facts cannot update/delete; balances rebuild from append-only events; provider event causation is traceable. |
| Duplicate/forged/out-of-order events | P4 | Signature, replay, semantic duplicate, reverse-order, timeout, and provider-backfill tests produce one legal effect. |
| Authorization proof failure | P4 | Sample proof export and revocation/out-of-scope charge-denial test pass; provider/ODFI/counsel duty matrix approved. |
| Queue/retry failure | P4, extended P6 | Crash-boundary, lease, concurrency, rate-limit, dead-letter, and replay tests produce no duplicate side effect. |
| ACH state/return/dispute error | P4–P5 | Sandbox lifecycle through return/dispute compensates ledger and reopens reconciliation without false collection. |
| Reconciliation drift | P5 | Provider clearing roll-forward and payout-to-bank amount/count equations close; unmatched items persist with owner/SLA. |
| False collections | P6 | Post-selection reauthorization tests block paid, disputed, held, wrong-contact, capped, and duplicate actions. |
| Tenant/privileged endpoint leak | P1, portal in P6 | Two-tenant behavioral matrix covers tables, views, RPCs, functions, provider mappings, and storage. |
| Evidence privacy/recovery | P1 and P7 | Private access/expiry/audit tests pass and isolated restore reproduces file hashes. |
| Migration/rollout incompatibility | P0, rehearsed P7 | Clean/upgrade CI passes; deliberate partial deploy remains side-effect-free and recovers via tested forward path. |
| Monitoring blind spot | P7 | Silence, lag, drift, stuck lease, and hold-violation synthetic tests reach the named operator. |
| Disaster recovery gap | P7, repeated P8 | Isolated restore plus provider-tail replay meets declared RPO/RTO, control totals, RLS, and evidence hashes. |

## Phase-Specific Warnings

| Phase | Do not declare complete if… | Recovery capability that must already exist |
|-------|-----------------------------|--------------------------------------------|
| P0 | Tests only inspect source text, or CI never starts a clean database | Capture migration/schema state and perform a side-effect-free forward repair. |
| P1 | UI hides records but database/storage cross-tenant requests still succeed | Disable portal/privileged endpoints and revoke scoped principals. |
| P2 | Issued financial facts can update/delete, or money crosses a float boundary | Freeze mutations and compensate rather than rewrite. |
| P3 | Same inputs cannot reproduce one immutable output, or missing revenue is guessed | Pause period/customer, preserve evidence, and issue a versioned true-up path. |
| P4 | Webhooks are not durable before `2xx`, or provider timeout recovery can create a second charge | Keep intake running, stop workers, query provider truth, and replay. |
| P5 | “Zero delta” ignores unmatched count, pending balance, failed payout, or cutoff | Rebuild from last verified watermark and durable unmatched rows. |
| P6 | Collection action is authorized only when scheduled, not again when sent | Global/per-customer hold plus delivery cancellation and correction workflow. |
| P7 | Backup has never restored evidence/provider tail, or alerts have never been delivered | Isolated restore and last-good-watermark reconstruction. |
| P8 | Promotion relies on anecdote rather than versioned thresholds and rollback receipt | One-switch demotion to the prior policy/automation level without disabling evidence intake. |

## Compliance Scope Caveat

Hosted collection materially reduces credential-handling scope, but it does not by itself settle RC Digital's authorization, notification, proof-retention, provider-oversight, sanctions/fraud, accounting, tax, state collection, or incident-notification duties. RC Digital appears to collect its own business receivables, so federal consumer-debt rules may not apply in the same way; that is not permission to encode aggressive automation. Before P4 and again before P6, obtain a written responsibility matrix from the chosen provider/ODFI and qualified legal/accounting review for the actual customer/account mix. Treat provider marketing and this research as implementation input, not legal advice.

## Sources

### Primary and authoritative external sources

- **HIGH:** [Stripe — Receive events in your webhook endpoint](https://docs.stripe.com/webhooks) — raw-body signature verification, fast acknowledgement, asynchronous processing, duplicate events, retry behavior, and non-guaranteed order.
- **HIGH:** [Stripe — Idempotent requests](https://docs.stripe.com/api/idempotent_requests) — POST idempotency semantics, parameter comparison, and keys eligible for pruning after at least 24 hours.
- **HIGH:** [Stripe — ACH Direct Debit](https://docs.stripe.com/payments/ach-direct-debit) — mandate, notification, delayed acknowledgement, returns/disputes, mandate invalidation, and refund/dispute double-credit risk.
- **HIGH:** [Stripe — ACH SEC codes](https://docs.stripe.com/payments/ach-direct-debit/sec-codes) — business responsibility for account/authorization classification and mandate differences.
- **HIGH:** [Stripe — Payout reconciliation report](https://docs.stripe.com/reports/payout-reconciliation) and [report schema](https://docs.stripe.com/reports/report-types/payout-reconciliation) — payout batches, ending balance, fees, refunds/disputes, bank trace identifiers, and item-level matching.
- **HIGH:** [Stripe — Balance transaction types](https://docs.stripe.com/reports/balance-transaction-types) — provider balance activity and pending/available state.
- **HIGH:** [GoCardless — Stay up to date with webhooks](https://developer.gocardless.com/getting-started/stay-up-to-date-with-webhooks-v2) — signature verification, processed-event tracking, batched events, and asynchronous handling.
- **HIGH:** [GoCardless — API reference](https://developer.gocardless.com/api-reference/) — provider idempotency is guaranteed for at least 30 days; payout events expose child payment/refund events for reconciliation.
- **HIGH:** [Nacha — ACH Guide for Developers: How ACH Works](https://achdevguide.nacha.org/index.php/how-ach-works) — consumer/business authorization distinctions, proof responsibility, and amount/date notices.
- **HIGH:** [Nacha — Importance of Compliant ACH Authorizations](https://www.nacha.org/news/importance-compliant-ach-authorizations) — clear terms, proof on request, and risk of extended authorization-warranty returns.
- **HIGH:** [Nacha — WEB Proof of Authorization](https://www.nacha.org/system/files/2022-11/WEB_Proof_of_Authorization_Industry_Practices.pdf) — evidence content/practices and two-year retention after termination/revocation.
- **HIGH:** [Nacha — Secure channels for ACH exceptions](https://www.nacha.org/news/ach-operations-bulletin-2-2025-encouraging-use-secure-electronic-channels-resolving-ach) — avoid insecure exchange of proof and exception documents.
- **HIGH:** [Supabase — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) — exposed-table RLS, view behavior, security-definer/search-path rules, service-key bypass, and database test links.
- **HIGH:** [Supabase — Storage buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals) and [Storage access control](https://supabase.com/docs/guides/storage/security/access-control) — public versus private access, RLS, and signed reads.
- **HIGH:** [Supabase — Serving Storage assets](https://supabase.com/docs/guides/storage/serving/downloads) — signed URL behavior and expiry/revocation limitation.
- **HIGH:** [Supabase — Database backups](https://supabase.com/docs/guides/platform/backups) — database-only coverage, Storage exclusion, downtime, and PITR behavior.
- **HIGH:** [Supabase — Testing your database](https://supabase.com/docs/guides/database/testing) — executable client and pgTAP testing for data/RLS behavior.
- **HIGH:** [Supabase — Database migrations](https://supabase.com/docs/guides/deployment/database-migrations) and [GitHub integration](https://supabase.com/docs/guides/deployment/branching/github-integration) — clean reset, migration-history discipline, isolated checking, and required migration gates.
- **HIGH:** [CFPB — What laws limit debt collectors](https://www.consumerfinance.gov/ask-cfpb/what-laws-limit-what-debt-collectors-can-say-or-do-en-329/) — federal FDCPA scope generally excludes business debts and original-creditor collection; state and other rules still require review.
- **HIGH:** [NIST SP 800-34 Rev. 1](https://csrc.nist.gov/pubs/sp/800/34/r1/upd1/final), [NIST SP 800-84](https://csrc.nist.gov/pubs/sp/800/84/final), and [NIST SP 800-184](https://csrc.nist.gov/pubs/sp/800/184/final) — recovery planning, testing/exercises, validation, and continual improvement.

### Verified project evidence

- **HIGH:** `.planning/PROJECT.md` — hard dependency order, fail-closed scope, active requirements, and explicit recovery/promotion requirements.
- **HIGH:** `.planning/AUDIT-CLAUDE-2026-08-20.md` — verified P0 defects and required roadmap ordering.
- **HIGH:** `.planning/codebase/CONCERNS.md` — mutable invoice schema, permissive RLS, public storage, unsafe privileged function, non-idempotent webhook precedent, deployment coupling, absent provider/queue/reconciliation/controls, and dependency audit.
- **HIGH:** `.planning/codebase/TESTING.md` — current tests are predominantly unit/static SQL assertions with no running Supabase, Edge Function, or E2E coverage.
- **MEDIUM:** `/Users/agenticmac/.cache/innovate/runs/20260820T031426Z-scalable-in-house-crm-for-recurring-invo-synthesis.md` — domain synthesis and initial provider hypothesis; provider choice and economics remain subject to P4 sandbox verification.

## Research Gaps Requiring Phase-Specific Validation

- The chosen provider/ODFI responsibility matrix for B2B versus any consumer accounts, SEC code, authorization wording, notification owner, record retention, return handling, sanctions/fraud controls, and audit evidence.
- Applicable state contract, commercial collection, privacy/breach, tax, record-retention, email/text, and escheatment requirements for RC Digital's customer locations and future expansion.
- Current production Supabase plan, backup/PITR entitlement, Storage backup/export design, webhook/event retrieval windows, provider report retention, and affordable RPO/RTO.
- Provider sandbox fidelity for ACH returns, late disputes, failed payouts, mandate revocation, notification delivery, and event ordering; tests must identify where production-only controls require a controlled pilot.
- Accounting system-of-record integration and the exact clearing-account, fee, refund, write-off, tax, and month-close treatment approved by RC Digital's accountant.

---
*Pitfalls research for: RC Digital Billing Operations*  
*Researched: 2026-08-19*
