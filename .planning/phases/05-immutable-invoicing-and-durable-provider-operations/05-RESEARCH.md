# Phase 5 Research

**Researched:** 2026-09-05
**Confidence:** High for repository architecture and invariants; medium for adapter API details until pinned-version sandbox execution; unverified for merchant eligibility, effective prices and real accountant/notice approval.

## Summary

Use the existing Supabase PostgreSQL transactional authority and Deno Edge runtime.
There is no need for a new backend, external queue purchase, Stripe Billing
subscription engine or parallel invoice authority. Keep provider calls outside
database transactions; use committed intents, outbox jobs, idempotency and
recovery to bridge the unavoidable external transaction gap.

The blocking discovery is divergent Phase 3 lineage under locally complete
Phase 4. Read 05-BASELINE-PREFLIGHT.md before implementation. August code maps
are stale; actual migrations, Make targets and closed provider modules win.

## Standard Stack

Existing Node 22/Vite/React/ra-core, Tailwind 4, Radix/shadcn owned components,
Supabase PostgreSQL, Deno Edge, Vitest and pgTAP. No dependency installation is
required for planning. Pin any provider SDK/API version during adapter work and
test it in Deno; do not copy preview API versions from evolving documentation.

## Architecture Patterns

### Invoice commands

Extend the existing exact invoice boundary and immutable Phase 4 snapshot
lineage. Draft creation consumes calculation identity, not caller-supplied
financial lines. One unique business key survives status changes. A locked
organization numbering series assigns a final number once at issue. A
permanent reserved-number registry protects legacy values. Missing source
identity, approved terms or legacy provenance creates an exception, never a
fabricated historical link. No automatic credit re-bills.

### Durable state and effects

Separate mutable job scheduling projections from immutable attempts/events.
Claim with SKIP LOCKED-style bounded leases and a monotonically increasing
fence; completion/heartbeat must match the fence. Commit request intent before
network I/O. Ledger posting, allocation and notice obligations are idempotent
transactions with uniqueness independent of provider key retention. Do not
call external HTTP while holding account/invoice locks.

At-least-once processing is expected. Exactly-once financial effects require
permanent local keys and atomic writes; an external sender without recovery
cannot promise exactly-once delivery. Preserve outcome_unknown and require
recovery/manual review instead of claiming a timeout is safe to resend.

### Provider research and implications

- Stripe requires unmodified raw webhook bytes for verification; events may
  arrive out of order or more than once. Design implication: verify first,
  persist and enqueue atomically, then process asynchronously with canonical
  retrieval where event ordering is insufficient. Source:
  [Stripe webhooks](https://docs.stripe.com/webhooks).
- Stripe stores the first executed idempotent response, including failures, and
  keys can be pruned after at least 24 hours. Design implication: permanent
  local intent/fingerprint records outlive external keys; never generate a new
  key merely to escape a cached failure or ambiguous old attempt. Source:
  [Stripe idempotency](https://docs.stripe.com/api/idempotent_requests).
- ACH is delayed-notification, not synchronous cash settlement. Authorization
  and verification are separate from payment success; later returns/disputes
  remain possible. Use hosted authorization, retain mandate proof references,
  and treat scheme-specific notice responsibilities as a certification gate.
  Source: [Stripe ACH](https://docs.stripe.com/payments/ach-direct-debit).
- GoCardless uses a signature over the POST body and can include multiple
  events. Design implication: validate the exact bytes and the whole envelope,
  persist each unique event plus jobs in one transaction, retain unsupported
  authenticated event types for review without blindly dispatching them.
  Source: [GoCardless webhooks](https://docs.gocardless.com/docs/getting-started/stay-up-to-date-with-webhooks).
- GoCardless Billing Request Flows provide hosted authorization URLs. Use
  scheme/currency bound requests, allowlisted return locations and canonical
  mandate retrieval rather than accepting return-query claims. Source:
  [GoCardless first request](https://docs.gocardless.com/docs/getting-started/send-your-first-api-request).
- GoCardless mandatory notification metadata includes an identity, deadline and
  responsibility signal; its notification tutorial describes provider fallback
  and coordination when an application takes responsibility. Initial choice:
  keep provider-managed notices active; do not call suppression/handling APIs.
  Source: [GoCardless notifications](https://docs.gocardless.com/docs/tutorials/handling-customer-notifications).
- The GoCardless reference identifies separate sandbox and live origins.
  Adapter configuration must bind environment explicitly and prohibit live
  hosts in the certification harness. Exact idempotency conflict/recovery
  behavior must be pinned and demonstrated, not assumed identical to Stripe.
  Source: [GoCardless API reference](https://docs.gocardless.com/docs/api-reference).

These are integration design inferences from primary documentation, not a
legal-compliance opinion or evidence of merchant approval.

### Posting and allocation

Normalize economic events separately from delivery attempts. One causal event
may generate multiple balanced journal lines but at most one journal for its
rule version. Currency and account identity must match across all legs.
Accountant-approved account kinds and rules are operational prerequisites.
Fixture policies are isolated and cannot unlock live posting. Partial
allocations must preserve residual unapplied funds; return/refund reversals
append, never change original allocations. Payout facts are not bank matching.

### Delivery

The repository's Postmark function is inbound-only. Add a closed outbound
invoice sender port with a deterministic local implementation and a separately
configured server adapter. Contract acceptance must prove lookup/correlation
and ambiguous-send hold semantics before any real sends. Provider acceptance,
mail delivery callback and required proof are distinct append-only facts.
Required notices use provider-owned responsibility initially, not duplicate CRM
copies marketed as compliance proof.

## Do Not Hand-Roll

Postmark's outbound API supports metadata and returns a MessageID; this is
acceptance/correlation, not a durable local idempotency guarantee. Its message
search and authenticated webhook interfaces can support recovery/proof, but
absence from a search is not proof that sending never occurred. Keep uncertain
sends held. Sources: [Postmark Email API](https://postmarkapp.com/developer/api/email-api),
[Messages API](https://postmarkapp.com/developer/api/messages-api),
[webhook security](https://postmarkapp.com/developer/webhooks/webhooks-overview).

Reuse Phase 3 exact primitives, Phase 2 authorization/evidence/redaction, existing
financial-lane wrappers and owned UI primitives. Use maintained provider
signature verification code where Deno-compatible, or audited WebCrypto with
official vectors and constant-time comparison; never improvise a signature
format. Do not store card/bank credentials, provider secrets, hosted session
URLs or raw payloads in browser/offline/analytics state.

## Common Pitfalls

Number counters racing; returning a second draft after cancellation; client
amount authority; expired worker finishing after reassignment; replacing an
idempotency key after timeout; trusting webhook account metadata; acknowledging
before commit; event arrival overwriting a return; labeling a payout reconciled;
balance-only ledger tests; suppressing provider notices; FakeRest tests mistaken
for live provider proof; rewriting migration history to conceal baseline drift.

## Validation Architecture

Every plan creates tests before or alongside its implementation and registers
them permanently. SQL tests exercise forced RLS, direct DML denial, malformed
money, unique keys, invariants and transactions; authenticated HTTP tests test
real principal binding. Deno tests inject provider transport and raw signatures.
Concurrency tests inject crash points before/after network/commit, fence expiry,
duplicate jobs/events and returns after success. UI tests cover both resource
trees, 320px source rendering, narrow long identifiers, denied states and no
offline persistence. Both provider sandboxes execute one canonical fixture
manifest; sanitized receipts include exact head/API/environment/scenario hashes.
No key, unsupported scenario or incomplete accounting approval becomes a pass.

## Open Evidence, Not Guessed Defaults

- Integrated Phase 3/4 base and reviewed registry lineage.
- Real invoice numbering conventions and payment terms (configurable, issue blocked if absent).
- Both isolated provider sandbox bindings and synthetic payer completion.
- Merchant/scheme eligibility, pinned versions, notice proof availability and dated cost inputs.
- Accountant sign-off on the exact posting-policy hash.
- Sender credentials/test recipient ownership and real delivery evidence.
- Later immutable preview, staged production approval and canonical production receipt.
