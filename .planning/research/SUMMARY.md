# Project Research Summary

**Project:** RC Digital Billing Operations
**Domain:** Auditable recurring billing, revenue evidence, hosted ACH collection, reconciliation, and bounded collections inside an existing CRM
**Researched:** 2026-08-19 to 2026-08-20
**Confidence:** HIGH for roadmap direction and safety sequencing; MEDIUM for the live payment-provider choice and unresolved legal/accounting details

## Executive Summary

RC Digital Billing Operations should extend the existing React/Supabase CRM into a US/USD billing operations system, not become a second CRM, payment processor, accounting general ledger, tax engine, or legal collections platform. Its product contract is a traceable chain from the applicable agreement version through accepted revenue evidence, deterministic calculation, immutable invoice, hosted-provider activity, allocation, payout/bank reconciliation, and collections history. Expert practice for this class of system is to keep authoritative financial facts and invariants in PostgreSQL, expose named server-side commands instead of generic financial CRUD, use hosted payment authorization so raw credentials never enter RC Digital, and treat every external side effect as durable, idempotent, replayable work.

The recommended architecture is a modular monolith: retain React 19, TypeScript, Vite, React Admin, Supabase Auth/PostgreSQL/RLS/private Storage, and thin Edge Functions; add integer-minor-unit money, immutable agreement/calculation/invoice records, an append-only operational subledger, a transactional provider inbox/outbox, a logged queue plus application-owned job registry, provider-neutral adapters, reconciliation, and operator controls. GoCardless and Stripe both remain plausible first providers. Provider choice is **medium-confidence and intentionally unresolved** until the same adapter contract and fixed/hybrid fixtures pass a GoCardless-versus-Stripe sandbox scorecard covering hosted authorization, variable charges, webhooks, timeout recovery, payouts, compliance evidence, portability, runtime fit, and total cost.

The dominant risk is not UI delivery; it is moving or reporting money on unproven foundations. The audited repository currently has source-string-oriented database tests, permissive legacy RLS, public attachment storage, unsafe privileged-function precedent, mutable/hard-deletable invoices, floating/decimal-boundary inconsistencies, coupled deployment, dependency vulnerabilities, and no durable provider, queue, reconciliation, kill-switch, or recovery system. The roadmap therefore must follow `.planning/PROJECT.md`'s audited Required Delivery Order as a hard dependency chain: executable test/release gates, security hardening, financial invariants, agreement/evidence foundations, durable invoice/provider history, reconciliation, controls/recovery/shadow proof, secured portal, and only then evidence-earned autonomy. Ambiguity must pause with durable evidence; it must never be converted into guessed revenue, duplicate money movement, or automated customer harm.

## Key Findings

### Recommended Stack

[STACK.md](./STACK.md) recommends preserving the brownfield application and adding narrowly scoped financial infrastructure. The versions below are research recommendations as of 2026-08-19, not changes already installed; implementation plans should recheck compatibility and pin reviewed versions.

**Core technologies:**

- **React `19.1.x`, TypeScript `5.8.3`, Vite `7.3.x`, and React Admin:** operator and restricted-portal presentation — already established, so new billing UI should use typed provider commands and authorized read models rather than introducing a second frontend stack.
- **Hosted Supabase with PostgreSQL 15 contract, Auth, RLS, private Storage, and Edge Functions:** financial source of truth and privileged boundary — keeps tenancy, invariants, durable events, commands, and existing CRM identity in one transactionally consistent system.
- **Supabase Queues (`pgmq`) plus Cron (`pg_cron`) and an application-owned job registry:** durable wake-up, leases, retries, dead letters, policy versions, and operator resolution — queue delivery supports work execution but does not replace permanent business idempotency.
- **Native TypeScript `bigint`, PostgreSQL `bigint` minor units, scaled/rational rates, and Zod `4.3.6`:** exact USD calculations and validated wire boundaries — avoids JavaScript floating-point authority and records explicit currency and rounding.
- **Provider-neutral adapter with one selected live provider:** hosted authorization, payment creation, event retrieval, and payout detail — isolates GoCardless/Stripe semantics without pretending mandates are instantly portable or operating two live providers in v1.
- **Supabase CLI `2.115.0`, Vitest `3.2.4`, `fast-check@4.9.0`, and `@playwright/test@1.62.1`:** executable migration/RLS/Edge, property, concurrency, provider-contract, and browser verification — FakeRest and SQL-string assertions remain useful supplements but cannot approve money-bearing behavior.
- **Sentry React/Deno `10.70.0` with private source-map upload:** redacted exception and trace diagnosis — durable PostgreSQL financial/audit records, not telemetry, remain authoritative.

**Critical compatibility notes:** declare the currently resolved `@supabase/supabase-js@2.90.1` directly before billing imports and treat any upgrade as separate work; it supports the current Node 20/22 lanes, while the then-current registry release cited by research required Node 22. Pin provider SDK/API versions during the spike. If `gocardless-nodejs@8.6.3` does not prove compatible with the Supabase Edge runtime, prefer a small server-side typed `fetch` client rather than moving provider code or credentials into the browser. Confirm `pgmq`/`pg_cron` availability and the target Supabase plan in executable platform checks.

### Expected Features

[FEATURES.md](./FEATURES.md) defines v1 by whether a capability creates, protects, or explains the contract-to-cash chain.

**Must have (table stakes):**

- Executable database/security/provider release gates, tenant-scoped billing RBAC, narrow automation principals, private evidence Storage, and dependency/deployment hardening.
- Immutable effective-dated agreements and formula versions for fixed, percentage, minimum-support, and hybrid plans.
- Monthly revenue periods, provenance, attestations, evidence review, exception handling, and contract-permitted minimum-plus-later-true-up semantics without guessed revenue.
- Deterministic integer-minor-unit calculations, frozen snapshots, human-readable explanations, immutable issued invoices, compensating corrections, and derived balances.
- Restricted customer access to revenue submission, evidence, invoices, hosted authorization, notices, and disputes only after cross-tenant and private-storage tests pass.
- Hosted mandate setup and revocation, notification/proof history, verified durable provider events, asynchronous payment attempts, allocations, returns/disputes, fees, and payouts.
- Payout-to-bank reconciliation with watermarks, amount/count controls, durable unmatched items, and operator signoff.
- Dispute/legal/customer holds, aging, bounded collections cases, durable jobs, retry/dead-letter operations, hierarchical kill switches, audit exports, observability, restore/replay receipts, and shadow/approval/live modes.

**Should have (competitive):**

- Contract-to-cash lineage and a customer-safe “why this invoice?” package.
- Revenue-evidence confidence ladder, deterministic anomaly rules, calculation replay, and human-readable period diffs.
- Contract-authorized minimum billing with linked true-up/credit rather than silent estimation.
- Reconciliation-gated collections and an evidence-earned, reversible autonomy scorecard.
- Provider portability at the command/event boundary and later source-specific read-only evidence connectors.

**Defer (v2+ or after validated v1):**

- Multiple simultaneous live providers, automated routing, multi-currency, international payment schemes, and jurisdiction expansion.
- Customer self-service agreement amendments or payment plans.
- Automatic credits, refunds, write-offs, service suspension, or legal escalation; v1 keeps these separately authorized.
- General-ledger/tax/legal-collections functionality; integrate with specialist systems after the subledger semantics stabilize.
- AI-generated revenue, exception approval, or autonomous collection language. Any later AI assistance should remain advisory and evaluated.

### Architecture Approach

[ARCHITECTURE.md](./ARCHITECTURE.md) recommends a modular monolith organized around authority rather than service count. Browsers read authorized projections and request named commands; PostgreSQL owns tenancy, uniqueness, immutable facts, legal transitions, balanced postings, and derived balances; thin Edge Functions handle privileged commands, provider webhooks, and bounded queue work. External calls use a transactional inbox/outbox and permanent local business keys. Current status is a rebuildable projection over facts, while reconciliation alone establishes settlement and collections consumes a fail-closed eligibility view.

**Major components:**

1. **Operator SPA and restricted portal** — present workflows through separate trust surfaces; neither owns authoritative math, authorization, or provider state.
2. **Identity/authorization and evidence boundary** — organization/account memberships, billing roles, scoped automation principals, provider-account ownership, private objects, short-lived signed access, and access/retention evidence.
3. **Agreement, revenue-close, and calculation kernel** — immutable terms, accepted evidence, exact formulas, frozen snapshots, exceptions, and true-ups.
4. **Invoice document and operational subledger** — immutable invoice versions/events, adjustments, payment attempts, allocations, and balanced receivable/clearing/cash/fee/refund/dispute facts.
5. **Provider adapter, durable inbox/outbox, and job subsystem** — hosted setup, stable idempotency, signature-verified intake before acknowledgement, leases, bounded retry, dead letters, and order-tolerant projection.
6. **Reconciliation and collections boundary** — provider/bank watermarks, itemized matching, durable exceptions, and contact eligibility that rechecks payment, holds, consent, quiet hours, and policy immediately before action.
7. **Control, observability, and recovery plane** — persisted modes and kill switches, correlation IDs, alerts on silence/lag/drift, audit export, object-aware backup, isolated restore, provider replay, and promotion receipts.

**Key patterns:** named commands over generic CRUD; immutable facts plus derived projections; transactional inbox/outbox with idempotent consumers; hierarchical fail-closed controls; security-invoker reads and narrowly privileged writes; expand-contract deployment; one canonical writer with compatibility projections rather than financial dual-write.

### Critical Pitfalls

[PITFALLS.md](./PITFALLS.md) makes the prevention sequence part of the product design, not deferred cleanup.

1. **Wrong agreement, revenue definition, or rounding produces an irreproducible bill** — enforce non-overlapping immutable terms, integer minor units, named rounding, evidence-bound snapshots, permanent run uniqueness, golden/property tests, and compensating true-ups.
2. **A mutable invoice status is mistaken for a ledger** — separate the issued document from append-only events, balanced postings, attempts, allocations, refunds/disputes, payouts, and reconciliation; prohibit hard deletion and generic provider-state edits.
3. **Duplicate, forged, missing, out-of-order, or timeout-ambiguous provider activity creates duplicate or false state** — verify raw-body signatures, persist/deduplicate/enqueue before `2xx`, use permanent local uniqueness plus stable provider keys, fetch canonical provider state, and test every crash boundary.
4. **Tenant, privileged endpoint, or evidence-storage weaknesses expose data or move the wrong customer's money** — make PostgreSQL/server authorization authoritative, replace permissive RLS and public attachments, lock privileged functions, bind server-generated paths/IDs, and prove a real two-tenant denial matrix.
5. **Provisional ACH, incomplete reconciliation, unsafe collections, or untested recovery creates customer and cash harm** — keep processing, provider-confirmed, paid-out, and bank-reconciled states distinct; require itemized payout/bank closure before collections; reauthorize contacts at send time; alert on silence and drift; restore database, evidence objects, roles, and provider tail in isolation before live autonomy.

## Implications for Roadmap

The following phase structure is intentionally more conservative than a feature-first roadmap. It translates `.planning/PROJECT.md`'s Required Delivery Order into hard exits. Later UI work may be prototyped behind flags, but no phase may parallelize away the financial, security, reconciliation, portal, or promotion prerequisite it depends on.

### Phase 1: Executable Financial Test and Release Gate

**Rationale:** The current test/deployment foundation does not prove a clean migration chain, RLS behavior, privileged commands, or mixed-version safety; every later financial migration depends on this gate.

**Delivers:** pinned local Supabase tooling; clean and representative-upgrade migration tests; pgTAP/client RLS and RPC tests under real claims; local Edge Function tests; concurrency harness; dependency/source-map checks; separately gated schema, function, frontend, and dormant-feature rollout.

**Addresses:** executable database/security/provider test gate and safe deployment foundation.

**Avoids:** SQL-string tests as security proof, stale migrations, partial incompatible deployment, and rollback claims that ignore written financial facts.

### Phase 2: Tenant, Role, Storage, and Attack-Surface Hardening

**Rationale:** Financial records, evidence, automation principals, and portal identities cannot safely exist on permissive legacy RLS or public attachments.

**Delivers:** explicit organizations/billing accounts and memberships; billing roles and separation of duties; scoped automation/provider-account ownership; hardened RLS/views/privileged functions; private evidence Storage and signed-access tests; dependency remediation and deployment separation.

**Addresses:** tenant isolation, billing RBAC, private evidence, authorization boundary, and production security prerequisites.

**Avoids:** cross-tenant disclosure, service-role-as-authorization, unsafe `SECURITY DEFINER` reuse, public evidence, and broad automation blast radius.

### Phase 3: Exact Money and Immutable State Primitives

**Rationale:** Formula, invoice, provider, and ledger work must share one exact and testable financial vocabulary before feature schemas multiply existing ambiguity.

**Delivers:** `bigint` minor units plus currency, scaled/rational rates, approved tie/negative rounding rules, canonical string DTOs, immutable event/audit primitives, legal transition commands, compensating-record semantics, permanent business idempotency keys, and property/concurrency tests.

**Addresses:** deterministic financial precision, immutable state, audit causation, and duplicate prevention.

**Avoids:** float/decimal-boundary drift, mutable issued facts, browser-authoritative money, and unreproducible calculations.

### Phase 4: Versioned Agreements, Revenue Evidence, and Calculation Close

**Rationale:** The signed agreement and accepted evidence must define what is billable before an invoice run or provider charge can exist.

**Delivers:** agreement/formula versions and effective ranges; monthly revenue periods; the source-confidence ladder; private evidence metadata and review; exceptions; fixed/percentage/minimum/hybrid calculations; frozen snapshots; contract-permitted minimum drafts and linked true-ups; operator approval flow.

**Addresses:** agreement management, revenue reporting/provenance, calculation explanation, missing-evidence exception, and replay/diff foundations.

**Avoids:** guessed revenue, overlapping terms, mutable rates, unreviewed customer input, and recomputation of historical invoices under new code.

### Phase 5: Immutable Invoices, Durable Operations, and Provider Decision Spike

**Rationale:** Issued obligations and durable external intents must exist before live provider work. This is the earliest safe point to exercise both providers against the actual internal contract.

**Delivers:** immutable invoice versions/status events and corrections; payment attempts, allocations, and balanced operational subledger; provider inbox/outbox; logged queue/job registry, leases/retries/dead letters; hosted authorization and notification-proof model; GoCardless and Stripe sandbox adapters; one evidence-backed live-provider decision.

**Addresses:** invoice lifecycle, hosted mandate/setup, asynchronous payment timeline, provider portability, durable jobs, and operator-visible exceptions.

**Avoids:** mutable invoice-as-ledger, webhook acknowledgement before durable intake, provider-only idempotency, ACH marked paid at initiation, unbounded retry, and dual live providers.

### Phase 6: Provider-to-Bank Reconciliation

**Rationale:** Collections and financial closure require complete provider and settlement evidence, not an invoice status or success event.

**Delivers:** provider backfill and overlap watermarks; immutable object/payout/item snapshots; fee/refund/return/dispute postings; invoice-payment-payout-bank matching; amount/count/ending-balance controls; durable unmatched queue, reviewer workflow, and reconciliation-aware invoice projections.

**Addresses:** payout/bank reconciliation, accurate balances and aging, exception workbench, and audit lineage.

**Avoids:** net-to-gross comparisons, dropped unmatched items, false zero deltas, missed late returns, and provisional ACH treated as cash.

### Phase 7: Operator Controls, Observability, Recovery, and Shadow Readiness

**Rationale:** Live unattended work must remain stoppable, diagnosable, recoverable, and measurable before any automation promotion.

**Delivers:** disabled/shadow/approval/live modes; hierarchical kill switches; policy rollback; queue/dead-letter inspection; audited overrides; correlation and health dashboards; alerts for silence, lag, drift, holds, and amount at risk; approved RPO/RTO; database and evidence-object backup; isolated restore/provider replay; shadow-cycle test protocol and metric capture.

**Addresses:** safety controls, operational receipts, audit export, disaster recovery, and promotion evidence from the first shadow cycle.

**Avoids:** green logs masking leakage, untested backups, accidental side effects after restore, unusable dead letters, and anecdotal autonomy decisions.

### Phase 8: Restricted Customer Portal and Dispute Holds

**Rationale:** The portal is required for evidence fallback and customer transparency, but it is a separate attack surface and may ship only after tenant isolation, private Storage, named commands, provider boundaries, and recovery controls are proven.

**Delivers:** dedicated account-scoped portal composition for revenue evidence/attestation, invoice and receipt access, calculation explanation, hosted payment setup/change/revocation, notice history, and disputes; short-lived signed documents; atomic debit/reminder/collection holds; desktop/mobile E2E security tests.

**Addresses:** customer fallback evidence, “why this invoice?”, hosted authorization, document access, and dispute intake.

**Avoids:** reusing operator CRM permissions, public objects, persisted signed URLs, redirect-as-truth, and disputes that fail to stop queued actions.

### Phase 9: Reconciliation-Gated Collections

**Rationale:** Collections may act only after Phase 6 proves the balance and Phases 7–8 prove controls, contact authority, and dispute suppression.

**Delivers:** versioned collections policy; eligible-balance projection; authorized contacts, preferences, consent, quiet hours, caps, promises, and legal/customer/incident holds; unique action keys; reauthorization immediately before send; informational reminders and operator tasks; human-only exceptional escalation.

**Addresses:** aging, collections case management, bounded reminders, safe mobile triage, and complete communication history.

**Avoids:** due-date-only dunning, post-payment or wrong-contact messages, retries as new actions, unversioned templates, and automatic exceptional customer harm.

### Phase 10: Shadow Cycles, Controlled Live Pilot, and Bounded Promotion

**Rationale:** Deployment is not permission to move money. Autonomy must be earned independently for each workflow/customer with measured outcomes and a tested demotion path.

**Delivers:** at least two representative shadow cycles for fixed and percentage-plus-minimum fixtures; fresh provider-sandbox receipts; one fixed and one hybrid pilot allowlist; versioned thresholds for duplicate charges, unauthorized transitions, reconciliation delta/value, false pauses, missed events, recovery time, disputes, collection-contact errors, and rollback; production release/policy/provider proof; gradual reversible promotion.

**Addresses:** evidence-earned autonomy, first-cycle scorecard, controlled production launch, and future v1.x fixed/hybrid promotion.

**Avoids:** all-at-once automation, maximum-autonomy exceptions in v1, promotion by anecdote, and treating merge/HTTP/sandbox success as production proof.

### Phase Ordering Rationale

- **Hard chain:** Phase 1 → 2 → 3 → 4 → 5 → 6 → 7. No money-bearing schema, privileged endpoint, provider charge, collection action, or autonomy promotion may bypass its prerequisite exit evidence.
- **Portal gate:** Phase 8 depends on Phases 2, 4, 5, and 7; visual prototyping may happen earlier behind a flag, but data access, invitations, and uploads may not.
- **Collections gate:** Phase 9 depends on reconciled facts from Phase 6, controls/recovery from Phase 7, and atomic dispute/contact behavior from Phase 8.
- **Promotion gate:** Phase 10 depends on every preceding safety surface. Metrics begin in shadow mode, thresholds are approved/versioned, and rollback is exercised before scope expands.
- **Safe parallelism only:** after schemas/contracts stabilize, read-model UI may proceed with tests; the two sandbox adapters may be implemented in parallel inside Phase 5; alert UI may parallel worker implementation after durable states are defined. Parallel work cannot change the required exit order.

### Research Flags

Phases likely needing deeper research during planning:

- **Phase 5:** run a focused GoCardless-versus-Stripe sandbox/API spike. The provider choice remains MEDIUM confidence until runtime compatibility, account eligibility, hosted variable authorization, notices/proof, timeout/idempotency, returns/disputes, payout detail, export, support, and effective cost are demonstrated on the same fixtures.
- **Phase 6:** research the selected provider's actual account-plan reports, pagination/retention, payout identifiers, bank evidence, settlement timing, and sandbox gaps before finalizing reconciliation schemas and acceptance fixtures.
- **Phase 7:** verify RC Digital's production Supabase plan, PITR/backup entitlements and cost; design Storage object backup/export; agree RPO/RTO and secret/configuration recovery with the operator.
- **Phase 9:** obtain a written provider/ODFI responsibility matrix and qualified legal review for account type/SEC code, authorization/notice retention, commercial collections, state rules, email/text preferences, and escalation boundaries.
- **Phase 10:** define promotion thresholds, pilot cohort, rollback authority, and residual production-only scenarios with business owners; this is operational validation rather than generic technology research.

Phases with sufficiently documented patterns to skip a generic research phase:

- **Phases 1–3:** Supabase CLI/pgTAP/Edge integration testing, RLS/private Storage, exact minor-unit money, immutable events, and expand-contract migrations have strong official documentation and project-specific findings. Planning should focus on executable acceptance criteria.
- **Phase 4:** the agreement/evidence/calculation model is well specified; planning still needs owner approval of actual agreement terms, commissionable-revenue definitions, rounding, cutoff, and true-up rules.
- **Phase 8:** RLS, private Storage, signed access, hosted redirects, and dispute-hold patterns are well documented. Treat the cross-tenant E2E matrix as implementation verification, not a reason to reopen the architecture.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH overall; provider MEDIUM | Brownfield React/Supabase, exact money, queue/job, testing, and observability recommendations are supported by official docs and live project evidence. GoCardless versus Stripe and the GoCardless Edge runtime remain sandbox decisions. |
| Features | HIGH for v1 product boundary; MEDIUM for compliance-sensitive automation | The traceability chain, evidence fallback, immutable invoice/payment behavior, portal, reconciliation, and bounded automation converge across sources. Legal/account-type and pilot usability validation remain. |
| Architecture | HIGH overall; provider/report details MEDIUM | Modular monolith, PostgreSQL authority, named commands, immutable facts, inbox/outbox, and fail-closed projections match the current codebase and documented platform behavior. Final role matrix, provider objects, and accounting mappings are open. |
| Pitfalls | HIGH for technical/provider failure modes; MEDIUM for exact legal scope | Risks are supported by audited repository defects and official provider/Supabase guidance. RC Digital's provider/ODFI duties, state-law exposure, and collections boundaries require qualified review. |

**Overall confidence:** HIGH that this is the correct roadmap direction and dependency order; MEDIUM for provider selection and the unresolved compliance, accounting, recovery-budget, and promotion-policy decisions.

### Gaps to Address

- **Provider selection:** execute the GoCardless-versus-Stripe pass/fail gates and weighted scorecard; confirm merchant eligibility, current pricing/terms, sandbox fidelity, notification ownership, payout completeness, runtime compatibility, and assisted mandate migration.
- **Compliance responsibility:** provider/ODFI and qualified legal review must map B2B versus any consumer accounts, SEC codes, authorization language, variable-debit notice, proof retention, sanctions/fraud delegation, state collection/privacy rules, and incident duties. Research is implementation guidance, not legal advice.
- **Contract semantics:** approve the exact definition of commissionable revenue, cash/accrual timing, exclusions/refunds/taxes, period/cutoff, missing-report minimum, dispute window, true-up/credit handling, and tie/negative rounding.
- **Accounting boundary:** an accountant should approve the fixed operational subledger account kinds and invoice/payment/fee/refund/dispute/write-off/month-close export mapping; RC Digital remains a subledger, not the GL.
- **Recovery economics:** confirm Supabase plan/PITR, provider history windows, separate Storage backup/export, encrypted retention location, evidence rehydration, and affordable RPO/RTO.
- **Portal identity and operations:** finalize the billing-role matrix, whether portal identities share the current Auth project, document retention/quarantine, notification/delivery provider, and the operator's safe mobile action subset.
- **Pilot and promotion policy:** select representative fixed and hybrid customers, define approved metric thresholds and loss limits, name alert/override/rollback owners, and identify sandbox scenarios requiring a controlled production pilot.

## Sources

### Primary (HIGH confidence)

- [PROJECT.md](../PROJECT.md) and [AUDIT-CLAUDE-2026-08-20.md](../AUDIT-CLAUDE-2026-08-20.md) — audited scope, verified brownfield defects, and mandatory delivery order.
- [STACK.md](./STACK.md), [FEATURES.md](./FEATURES.md), [ARCHITECTURE.md](./ARCHITECTURE.md), and [PITFALLS.md](./PITFALLS.md) — full research evidence, version notes, feature analysis, architectural contracts, failure modes, and source annotations.
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage](https://supabase.com/docs/guides/storage), [Queues](https://supabase.com/docs/guides/queues), [database testing](https://supabase.com/docs/guides/database/testing), [migrations](https://supabase.com/docs/guides/deployment/database-migrations), and [backups](https://supabase.com/docs/guides/platform/backups) — authorization, private evidence, durable work, executable gates, deployment, and recovery behavior.
- [PostgreSQL numeric types](https://www.postgresql.org/docs/current/datatype-numeric.html) — exact versus inexact numeric behavior supporting the minor-unit money recommendation.
- [Stripe ACH](https://docs.stripe.com/payments/ach-direct-debit), [webhooks](https://docs.stripe.com/webhooks), [idempotency](https://docs.stripe.com/api/idempotent_requests), and [payout reconciliation](https://docs.stripe.com/reports/payout-reconciliation) — hosted mandates, asynchronous payments, intake semantics, request recovery, and settlement data.
- [GoCardless hosted pages](https://developer.gocardless.com/integration-types/gocardless-hosted-pages), [webhooks](https://developer.gocardless.com/getting-started/stay-up-to-date-with-webhooks-v2), [API reference](https://developer.gocardless.com/api-reference/), and [payout reconciliation](https://developer.gocardless.com/payouts/reconciling-payouts) — hosted authorization, event/idempotency behavior, and payout items.
- [Nacha ACH Guide for Developers](https://achdevguide.nacha.org/how-ach-works) and [NIST contingency planning](https://csrc.nist.gov/pubs/sp/800/34/r1/upd1/final) — authorization/proof considerations and tested recovery practice.

### Secondary (MEDIUM confidence)

- RC Digital billing/revenue-operations Innovate synthesis dated 2026-08-19 — evidence ladder, build/buy boundary, formula hypothesis, and initial provider economics; the provider conclusion remains subject to the sandbox spike.
- Current provider pricing pages and plan descriptions observed 2026-08-19 — useful for the spike scorecard, but merchant quotes, taxes, settlement terms, and support costs must be reconfirmed at selection.

### Tertiary (LOW confidence)

- None used as a roadmap dependency. Open legal, accounting, customer-policy, and production-plan questions are recorded as validation gaps rather than treated as facts.

---
*Research completed: 2026-08-20*
*Ready for roadmap: yes, subject to the hard dependency order and named validation gates above*
