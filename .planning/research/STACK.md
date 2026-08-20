# Stack Research

**Domain:** Auditable recurring billing and ACH revenue operations in an existing Supabase CRM
**Researched:** 2026-08-19
**Confidence:** HIGH for the application, data, work-execution, money, observability, and testing recommendations; MEDIUM for the live payment-provider choice pending the required sandbox spike

## Research Position

This is a brownfield stack decision, not a platform selection. Retain the existing React 19, TypeScript, Vite, React Admin, and hosted Supabase architecture. Add financial-domain boundaries around it; do not introduce a second CRM, database, general-purpose backend, or workflow platform during the first billing milestone.

The one deliberately unresolved core choice is the first live ACH provider. GoCardless remains a credible first spike because its public Standard price is lower for many sub-$1,000 ACH debits and its hosted Billing Request Flow supports variable bank-debit mandates. Stripe is equally viable and has stronger documented Supabase/Deno SDK support, hosted Checkout/Payment Element options, and mature balance/payout reporting. The Innovate conclusion is therefore a hypothesis, not the provider decision.

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| Existing React + TypeScript + Vite application | React `19.1.x`; TypeScript `5.8.3`; Vite `7.3.x` in current lockfile | Operator and restricted customer-portal UI | Already established and integrated with React Admin. Billing should add explicit commands and read models, not replace the UI stack. | HIGH |
| Hosted Supabase | Existing project; local contract currently PostgreSQL 15 | PostgreSQL system of record, Auth, RLS, private Storage, Edge Functions | Keeps financial facts and authorization beside the existing CRM. PostgreSQL transactions are the correct consistency boundary for invoices, jobs, provider-event intake, and audit records. | HIGH |
| Supabase Edge Functions | Hosted, platform-managed Deno runtime | Public provider webhooks and short-lived provider API workers | Already in the repo; official Supabase documentation treats webhooks and Stripe as first-class Edge Function use cases. Keep functions thin and restart-safe. | HIGH |
| Supabase Queues (`pgmq`) + Supabase Cron (`pg_cron`) | Platform-managed extensions; assert availability in migrations rather than app-pinning an extension version | Durable work dispatch and scheduled worker wake-up | Postgres-native, no new fixed-cost service, messages persist, support visibility timeouts and archival, and can be enqueued in the same database transaction as domain state. | HIGH |
| Application-owned billing job registry | Versioned SQL schema owned by this project | Durable job lifecycle, attempts, leases, policy version, correlation IDs, dead letters, operator resolution | `pgmq` is transport, not the financial audit or operator model. A job row makes fail-closed state and manual resolution explicit. | HIGH |
| Payment-provider adapter | Internal interface version `v1`; one live implementation after spike | Hosted authorization, ACH debit creation, provider retrieval, refund/dispute read models, payout reconciliation | Prevents provider objects from becoming the billing domain. It preserves business-rule portability while acknowledging that mandate migration is provider-assisted, not automatic. | HIGH |
| GoCardless or Stripe | **Undecided** until sandbox scorecard passes | First live US ACH collection provider | Both meet the basic hosted-provider model on paper. A production choice without exercising variable charges, events, failures, payout detail, mandate proof, and export would be premature. | MEDIUM |

### Supporting Libraries and Tools

| Library / Tool | Verified Version | Purpose | When to Use | Confidence |
|----------------|------------------|---------|-------------|------------|
| `@supabase/supabase-js` | `2.90.1` (current transitive lock; Node `>=20`) | Explicit Supabase client dependency | Declare this exact currently resolved version directly before adding billing imports. Upgrade separately only after the Node 20 CI lane is unified with Node 22 and `ra-supabase-core` is regression-tested. Current registry latest `2.112.3` requires Node `>=22`. | HIGH |
| Zod | Current locked `4.3.6` | Runtime schemas at every RPC/provider boundary | Validate webhook envelopes, adapter responses, job payloads, and decimal-string wire amounts. Never cast provider JSON directly to domain types. | HIGH |
| Native `bigint` + branded TypeScript types | ES2020+ built-in | Exact minor-unit money and scaled rates | Use in formula/domain code. Serialize minor units as base-10 strings in JSON because native `BigInt` is not JSON-serializable. | HIGH |
| `supabase` CLI | `2.115.0` current npm release | Reproducible local stack, migration reset, pgTAP database tests, function serving | Pin as an exact dev dependency; stop relying on floating `npx supabase`. | HIGH |
| `fast-check` | `4.9.0` current npm release | Property-based formula and state-machine testing | Generate boundary, rounding, retry, duplicate, true-up, and period cases alongside existing Vitest tests. | HIGH |
| `@playwright/test` | `1.62.1` current npm release; Node `>=20` | Browser E2E across portal, operator approvals, hosted redirect returns, and responsive routes | Run deterministic local-provider flows in PR CI; run real provider-sandbox flows as a controlled release gate. | HIGH |
| `@sentry/react` + `@sentry/deno` | `10.70.0` current npm releases | Browser/Edge exception and trace monitoring | Capture operational failures with correlation IDs after strict PII scrubbing. Sentry is not the audit log. | HIGH |
| `@sentry/vite-plugin` | `5.4.0` current npm release | Private source-map upload | Upload source maps in CI, then remove `.map` files from the public artifact. | HIGH |
| Stripe Node SDK | `22.5.0` current npm release | Stripe spike and, if selected, server-side adapter | Officially supports Deno via `npm:` imports; Supabase's current webhook example uses `stripe@^22` and Web Crypto signature verification. Save exact in Edge Function dependency config. | HIGH |
| GoCardless Node SDK | `8.6.3` current npm release | GoCardless sandbox spike | Server-side only. Its Node `>=18` support is verified, but Supabase Edge Runtime compatibility is not documented at the same level as Stripe. The spike must prove deploy, cold start, webhook parsing, and API calls; otherwise use a small typed `fetch` client against the official API/OpenAPI contract. | MEDIUM |

Do not add a decimal-money package for v1. Integer minor units and integer/rational rates are simpler and more auditable for USD-only billing. Reconsider only if a future multi-currency contract requires provider-specific nonstandard minor units or substantially more complex decimal rules.

## Hosted Provider Boundary

### RC Digital Owns

- Versioned agreements, compensation formulas, commissionable-revenue definitions, evidence, approvals, and true-ups.
- Canonical invoice documents and append-only invoice/payment/allocation/refund/dispute/status subledger records.
- Amount calculation, invoice-to-provider correlation, policy gates, collections state, and reconciliation conclusions.
- Durable provider delivery/event records, business idempotency keys, job state, audit events, and operator overrides.
- Customer communications required by the agreement or by residual ACH duties when the provider does not send them.
- Evidence that authorization, notice, and retention requirements were satisfied; exact obligations require legal/provider approval before go-live.

### The Selected Provider Owns

- Hosted or provider-origin bank-account entry and verification.
- Raw routing/account numbers, card PAN/CVC, payment credentials, and provider-side tokens/mandates.
- ACH origination, network submission, provider fraud controls, returns, disputes, and settlement execution.
- Provider-native mandate/authorization artifact and hosted collection flow.
- Provider payout and fee records, which RC Digital imports and reconciles rather than replacing.

### Data Allowed in RC Digital

Store provider name/account, customer ID, mandate or payment-method ID, authorization type/status/timestamps, redacted display details if the provider permits them, payment/payout/event IDs, amounts, fees, and evidence references. Never store raw routing/account/card data. Never put access tokens, webhook secrets, PaymentIntent client secrets, hosted authorization payloads, or raw provider bodies into browser storage, PostHog, Sentry, ordinary console logs, or public Storage.

Hosted flows reduce sensitive-data scope; they do not eliminate merchant duties. Stripe explicitly states that ACH customers must authorize debits and that Stripe-hosted flows handle mandate collection/storage, while the merchant must still have accurate authorization and transaction information. GoCardless states that Open ACH authorizations require the merchant to make debit terms clear and retain reproducible evidence for two years after termination/revocation. If Stripe card fallback is later enabled, hosted Checkout/Elements can qualify for lighter SAQ A validation, but Stripe still describes PCI compliance as shared and annually attested.

## GoCardless-versus-Stripe Decision Spike

### Verified Public Economics as of 2026-08-19

| Cost Element | GoCardless Standard | Stripe Payments ACH Direct Debit | Interpretation |
|--------------|---------------------|----------------------------------|----------------|
| Fixed platform fee | No fixed monthly fee is shown on the US Standard pricing page | No setup or monthly fee on Standard Payments | Verify the actual merchant quote and taxes before selection. |
| Successful domestic ACH | `0.5% + $0.05`, capped at `$5` | `0.8%`, capped at `$5` for standard settlement | GoCardless is cheaper for many debits between roughly `$16.67` and `$990`; both hit `$5` near/above `$1,000`. |
| `$100` successful debit | `$0.55` | `$0.80` | Recommendation-derived example from listed rates. |
| `$500` successful debit | `$2.55` | `$4.00` | Recommendation-derived example from listed rates. |
| `$1,000` successful debit | `$5.00` cap | `$5.00` cap | Listed caps erase the successful-payment cost difference at this amount. |
| Failure fee | `$5` | `$4` | Failure rate can reverse part of the headline saving. |
| Dispute/chargeback | `$5` GoCardless chargeback fee only after more than 15 per month, per current page | `$15` per disputed ACH payment | Confirm merchant-specific and network terms. |
| Refund | `$0.50` | Pricing page says original processing fees are generally not returned; confirm ACH refund fee in merchant quote | Include actual refund mix in the model. |
| Bank verification | Instant verification is an Advanced-plan benefit, not listed for Standard | `$1.50` per successful instant verification; microdeposit verification is listed as free | Test customer conversion and failure tradeoffs, not just transaction fees. |
| Optional hosted invoice product | Not part of the adapter comparison | Stripe Invoicing Starter adds `0.4%` per paid invoice on top of Payments | RC Digital already owns invoices, so exclude Stripe Invoicing from the base comparison. Add it only if separately buying its hosted invoice/customer-portal value. |

The GoCardless pricing page is internally ambiguous about Standard payout speed: headline material references two-day payout, while the feature matrix reserves “faster ACH” for Advanced/Pro. Treat settlement timing and cutoff as an explicit written-confirmation item, not a verified Standard capability.

### Mandatory Pass/Fail Gates

A provider is ineligible if any gate fails:

1. US ACH is approved for RC Digital's legal entity and customer type, with a usable sandbox and a documented path to live onboarding.
2. Provider-hosted authorization supports the actual variable monthly amount policy (`max(minimum, rate × revenue) + adjustments`) without RC Digital receiving raw bank credentials.
3. The hosted authorization, confirmation, notice, and proof-retention behavior is reviewed against the intended ACH authorization type; custom forms/notifications are out of v1.
4. Every create/charge call supports a caller-supplied idempotency key, and an indeterminate timeout can be resolved by retrieving provider state.
5. Webhooks can be verified from the unmodified raw body, duplicated safely, delivered out of order, retried/replayed, and reconciled against a list/retrieve API.
6. Payout detail can map gross payments, failures, refunds, disputes, fees, and net settlement to a bank deposit without scraping a dashboard.
7. The sandbox can simulate success, asynchronous delay, failure/return, dispute, mandate cancellation, duplicate delivery, and payout/reconciliation paths.
8. Provider SDK or typed REST client deploys and runs under the current Supabase Edge Runtime within resource limits.
9. Provider-side customer, mandate, payment, event, and payout IDs can be exported; a written provider-assisted ACH authorization/mandate migration process is understood. Adapter portability does **not** imply instant mandate portability.
10. Secrets remain server-side and the provider contract does not require RC Digital to store raw account/card data.

### Weighted Score After Gates Pass

| Criterion | Weight | Required Evidence |
|-----------|-------:|-------------------|
| Safety and residual-compliance fit | 25 | Hosted flow recording, authorization artifact, notices, roles, data-flow diagram, provider/legal sign-off questions resolved |
| Reconciliation completeness | 20 | Sandbox payout matched cent-for-cent to payments, fees, failure/refund/dispute, and bank-deposit model |
| Reliability and webhook recovery | 15 | Duplicate/out-of-order/retry/backfill tests; provider object retrieval after timeout |
| Formula/workflow fit | 10 | Fixed and percentage-plus-minimum invoices charged from the same immutable calculation snapshot |
| Customer authorization UX | 10 | Hosted setup completion, fallback verification, abandonment and error evidence |
| Portability/export | 10 | Object export, API retention, assisted migration terms, re-authorization contingency |
| Effective cost | 10 | RC Digital volume distribution plus verification, failure, dispute, refund, settlement, optional product, tax, and support costs |

Run the same adapter contract against both sandboxes. Use one fixed-fee customer fixture and one percentage-plus-minimum fixture through two shadow cycles. A provider needs at least 80/100 and no mandatory failure. Choose GoCardless if it wins or ties and written Standard capabilities satisfy the gates. Choose Stripe if its better runtime support, hosted UX, reconciliation, card-fallback option, or lower operational risk outweighs measured cost. Do not run both live in v1.

### Provider-Specific Integration Shape

**If GoCardless wins:** use Billing Requests plus a GoCardless-hosted Billing Request Flow to create the ACH mandate, then create variable Payments against the resulting mandate. Use caller-owned idempotency keys on every create request. Verify `Webhook-Signature` against the raw body, split multi-event deliveries, and deduplicate by GoCardless event ID. Reconcile through payouts/payout items or the documented parent/child payout event path. GoCardless guarantees creation idempotency keys for at least 30 days, so the local permanent unique key remains authoritative.

**If Stripe wins:** use hosted Checkout/Payment Element with SetupIntents to save a `us_bank_account` PaymentMethod/mandate, then PaymentIntents for each approved internal invoice. Do not buy Stripe Billing/Invoicing for formula calculation. Verify `Stripe-Signature` against the raw body using the official SDK's Web Crypto provider. Treat ACH as asynchronous: `processing` is not paid; apply terminal success/failure/dispute events and reconcile immutable balance transactions plus automatic payout reports. Stripe v1 idempotency keys may be pruned after 24 hours, so the local permanent unique key remains authoritative.

## Durable Work Execution

### Recommended Pattern

```text
operator command / verified webhook
        │
        ▼
single PostgreSQL RPC transaction
  ├─ append domain/provider event
  ├─ insert/update billing_jobs with unique business key
  └─ pgmq.send({ job_id })
        │
        ▼
Supabase Cron (initially every minute)
        │ invokes
        ▼
short Edge Function worker
  ├─ pgmq.read with visibility timeout
  ├─ claim job conditionally
  ├─ execute one idempotent step
  ├─ append result / schedule next step
  └─ archive message; on retry, atomically enqueue delayed replacement
```

Use a **Basic/logged** queue, never an Unlogged queue. Queue payloads contain only `job_id`, job type, and correlation ID; authoritative customer, amount, agreement, and provider data is reloaded inside the worker. Do not expose `pgmq_public` to browsers. Only a narrow automation principal and database command functions can enqueue or consume billing work.

The job registry must include a unique business key, state, policy/version IDs, attempt count, `next_attempt_at`, lease owner/expiry, last structured error code, provider request ID, created/started/completed timestamps, dry-run flag, and operator resolution. Retry scheduling must be a database transaction that records the failed attempt and publishes the next delayed message together. After the policy's capped attempts, move to a durable dead-letter state and require an audited operator action.

`pgmq`'s visibility window prevents another consumer receiving a message during the window; it is not end-to-end “exactly once.” Financial exactly-once behavior comes from unique domain keys, transactional conditional transitions, locally persisted provider request keys, provider idempotency, and reconciliation.

Use Cron as a wake-up mechanism, not the job ledger. Supabase currently supports schedules from every second to yearly, recommends no more than eight concurrent Cron jobs and ten minutes per job, and bills Edge invocations cheaply beyond included quotas. A one-minute initial poll is about 43,200 invocations/month and is adequate for ACH; lower latency is not worth a second queue service in v1.

Do not use `EdgeRuntime.waitUntil` as durable work execution. Supabase documents that background tasks remain bounded by function wall-clock/CPU/memory limits (currently 150 seconds on Free, 400 seconds on paid plans), and local function instances normally terminate after the request. The webhook handler should verify and durably accept work, then return `2xx`; it should never perform the full financial side-effect chain in an untracked background promise.

## Integer Money and Formula Stack

Use these exact storage and boundary rules:

- Persist every monetary value as PostgreSQL `bigint` minor units plus a lowercase ISO 4217 currency code; v1 constrains currency to `usd`.
- Persist rates as scaled integers or an explicit numerator/denominator. Recommended v1 field: `commission_rate_ppm` with denominator `1_000_000`; store the denominator and rounding mode in the immutable formula version.
- Perform multiplication before division using PostgreSQL exact `numeric` as an intermediate when needed to avoid `bigint` multiplication overflow, then apply the contract's named rounding rule and cast the final minor-unit value to `bigint`.
- Perform TypeScript calculations with native `bigint`. On JSON/PostgREST/provider boundaries, use canonical base-10 strings, validate with Zod, convert to `bigint`, range-check, and only then convert to a provider integer if its SDK requires a JavaScript `number`.
- Keep one pure formula module shared by Edge Functions and UI preview. Only a server/database command may freeze an authoritative calculation snapshot or create a provider charge.
- Snapshot raw inputs, normalized inputs, agreement/formula version, rounding rule, intermediate commission, minimum comparison, adjustments, final amount, and code release identifier.
- Constrain every provider amount against both `Number.MAX_SAFE_INTEGER` and the provider's documented amount maximum before conversion.

PostgreSQL documents `bigint` as an exact eight-byte integer and floating-point types as inexact. Stripe and GoCardless both accept provider payment amounts in the currency's lowest denomination. Do not reuse the current JavaScript `number`/PostgreSQL `numeric(15,2)` invoice arithmetic for authoritative billing.

## Provider Webhook Intake

Implement one public Edge Function per provider with JWT verification disabled only for that endpoint. Provider signature verification replaces user JWT authentication; no other route should share this configuration.

The handler order is mandatory:

1. Enforce `POST`, content type, and a small provider-specific body limit.
2. Read the raw body exactly once and verify the provider signature with the server-side endpoint secret.
3. Parse and validate a narrow event envelope; reject unknown account/organization IDs.
4. In one database transaction, insert a delivery record, insert child events with unique `(provider, provider_account_id, provider_event_id)`, and enqueue processing jobs.
5. Return `2xx` only after durable commit. Return retryable non-`2xx` on database/unavailable failures; return a permanent client error on invalid signature/payload.
6. Process events asynchronously and order-tolerantly. Fetch the canonical provider object when an event is missing context or would cause an invalid transition.

Store delivery/event hashes, received timestamps, signature-verification result, provider API version, endpoint version, event IDs/types, correlation IDs, processing state, and a protected raw payload or immutable evidence reference. Never log the raw body. Retain local provider events beyond provider API windows: Stripe's event listing is documented at 30 days, while GoCardless now documents eventual event archival after an 18-month window.

## Observability

Use three separate layers; none substitutes for another:

1. **Financial evidence:** append-only PostgreSQL domain/provider/audit/job/reconciliation records. This is the authoritative long-term record.
2. **Operational state:** database views and operator screens for job age, queue depth, attempts, dead letters, webhook lag, unmatched payouts, reconciliation delta, kill-switch state, and last successful run.
3. **Exception diagnosis:** Sentry React/Deno for stack traces, releases, traces, alerting, and correlation IDs. Start on the `$0` one-user Developer tier (currently 5,000 errors/month and email alerts); move to Team only when multiple operators/API integrations justify the current `$26/month` base.

Tag every operation with `correlation_id`, `billing_run_id`, `job_id`, `invoice_id`, and non-sensitive provider request/event IDs. Do not send customer names, emails, agreement text, bank display data, revenue evidence, invoice line details, provider payloads, or secrets to Sentry. Configure `beforeSend`/breadcrumb scrubbing, disable session replay for billing surfaces initially, sample traces, and test redaction with synthetic canary data.

Keep PostHog for product analytics only; never emit financial amounts or provider/payment state there. Native Supabase logs are useful for live diagnosis but have finite retention and are not an audit trail. Supabase's current Pro Log Drain add-on starts at `$60/month` per drain, so do not add it in v1; use Sentry plus durable structured tables first. A scheduled invariant monitor should create a durable incident and alert on stuck jobs, webhook lag, unexpected duplicate attempts, reconciliation deltas, or kill-switch activation.

## Testing Stack

| Layer | Technology | Blocking Scope |
|-------|------------|----------------|
| Pure formula/state unit tests | Existing Vitest `3.2.4` | Examples and golden vectors for fixed, percentage, minimum, hybrid, refunds, adjustments, period boundaries, rounding, and true-ups |
| Property tests | `fast-check@4.9.0` under Vitest | No floating results; minimum invariant; deterministic reruns; allocation conservation; bounded/range-safe conversion; duplicate and order permutations |
| Database/migration/RLS tests | `supabase@2.115.0`, `supabase db reset`, `supabase test db`/pgTAP | Clean migration chain, constraints, grants, RLS under real claims, security-definer ownership, unique keys, transitions, queue enqueue transaction, and cross-tenant denials |
| Database concurrency tests | Running local Supabase/PostgreSQL | Two billing-run creators, two queue workers, duplicate webhooks, lease expiry, crash/retry, payout matching, and dead-letter promotion |
| Edge Function tests | Deno Test plus local `supabase functions serve` | Raw-body signature verification, body limits, unknown provider accounts, DB failure before acknowledgement, provider timeout, typed error mapping, and secret isolation |
| Adapter contract tests | Shared suite against fake adapters and both provider sandboxes | Hosted authorization creation, variable payment, idempotent replay, event duplicate/order, failures/disputes, mandate cancellation, payout detail, backfill/export |
| Browser E2E | `@playwright/test@1.62.1` | Operator approval, restricted portal, redirect/return, dispute hold, desktop/mobile routes, and no offline financial mutation |
| Recovery tests | Local restored database plus stored provider fixtures | Restore, replay from durable event inbox, rebuild read models, reconcile without double charging |

PR CI must pin tools, run `supabase db reset`, run pgTAP and concurrency tests, test Edge Functions, run Vitest/property tests, and build the app. Deterministic fake-provider adapter tests belong in every PR. Real GoCardless/Stripe sandboxes are external and can be flaky, so run them nightly/on demand and make a fresh passing receipt mandatory for provider-related release or autonomy promotion, not for unrelated UI commits.

Do not use Testcontainers as the primary database harness in this milestone. The Supabase CLI already supplies PostgreSQL, Auth, Storage, PostgREST, and the Edge Runtime that must be tested together. A plain PostgreSQL container would miss important platform behavior.

## Installation

These are research recommendations, not changes already applied. Pin exact versions and update them only through reviewed lockfile changes.

```bash
# Make currently-transitive runtime imports explicit without changing their resolved version
npm install --save-exact @supabase/supabase-js@2.90.1

# Browser operational monitoring and private source-map upload
npm install --save-exact @sentry/react@10.70.0
npm install -D --save-exact @sentry/vite-plugin@5.4.0

# Reproducible database and test tooling
npm install -D --save-exact supabase@2.115.0 fast-check@4.9.0 @playwright/test@1.62.1
npx playwright install --with-deps chromium
```

Pin Edge Function dependencies in `supabase/functions/deno.json` or per-function configuration rather than floating imports:

```json
{
  "imports": {
    "@sentry/deno": "npm:@sentry/deno@10.70.0"
  }
}
```

During the decision spike only, test `npm:stripe@22.5.0` and `npm:gocardless-nodejs@8.6.3` in isolated provider functions. Promote exactly one after the scorecard. If the GoCardless SDK does not pass Edge Runtime tests, use server-side `fetch` against the official API with Zod response schemas; do not move the SDK or access token into the browser.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Supabase Queues + app job registry + Cron | App-owned `billing_jobs` table claimed with `FOR UPDATE SKIP LOCKED` only | Acceptable fallback if Queues cannot be enabled. It requires implementing visibility, delayed delivery, archival, and queue monitoring carefully. |
| Supabase-native worker | Trigger.dev, Inngest, or Temporal | Revisit after v1 only if workflows truly require multi-hour orchestration, external human checkpoints, or throughput beyond Edge limits. Preserve a transactional outbox and local audit source of truth. |
| GoCardless after passing spike | Stripe Payments ACH | Use Stripe if its sandbox/runtime support, hosted UX, reconciliation, card fallback, or provider-assisted migration materially wins the scorecard. |
| Stripe Payments ACH after passing spike | GoCardless | Use GoCardless if ACH specialization and measured total cost win without compromising reconciliation, residual compliance, or runtime reliability. |
| Internal invoice/formula engine + provider collection | Stripe Invoicing/Billing | Buy later only if hosted invoice delivery, portal, retries, and card fallback are worth the additional fee and duplicate invoice-system complexity. Do not use it as the commission formula engine. |
| Sentry + durable DB operations | Supabase Log Drain/OpenTelemetry collector | Add when volume or team requirements justify at least `$60/month` per Supabase drain or an operated collector. |
| Supabase CLI whole-stack tests | Testcontainers PostgreSQL | Use only for isolated SQL library tests; it does not prove Auth, PostgREST, Storage, or Edge integration. |
| Native `bigint` and scaled/rational rates | Decimal.js or Dinero.js | Reconsider for later multi-currency/FX requirements after defining currency metadata and rounding rules. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| A second CRM, database, or general backend | Splits authorization, customer identity, and financial evidence | Existing Supabase CRM with explicit billing boundaries |
| Browser-side provider SDKs or secrets | Exposes payment credentials/privileged API access | Server-only Edge provider adapters and hosted payment UI |
| Custom ACH/card credential forms | Expands compliance and breach scope | GoCardless hosted Billing Request Flow or Stripe hosted Checkout/Payment Element |
| Stripe Billing/Invoicing as the contract/formula source | Cannot replace versioned commissionable-revenue evidence and creates dual invoice truth | Internal immutable billing engine; provider handles collection |
| Live dual-provider routing in v1 | Doubles reconciliation, mandate, support, and failure semantics | One selected live provider behind an adapter |
| JavaScript `number`, PostgreSQL floating point, or PostgreSQL `money` for authoritative amounts | Binary inexactness, locale behavior, and inconsistent rounding | `bigint` minor units, scaled/rational rates, explicit rounding |
| Global `BigInt.prototype.toJSON` patch | Hidden serialization behavior can leak into unrelated libraries | Explicit decimal-string DTOs and Zod transforms |
| `EdgeRuntime.waitUntil`, browser timers, GitHub Actions, or database HTTP triggers as the durable queue | No restart-safe lease, retry, dead-letter, or operator lifecycle | Logged `pgmq` queue plus app job registry and Cron worker |
| Unlogged Supabase Queue | Sacrifices crash durability | Basic/logged queue |
| `pgmq.pop()` for financial work | Deletes on read and provides at-most-once behavior | `read()` with visibility, then archive/delete only after durable completion |
| Provider webhook processing before durable intake | Timeout/retry can duplicate or lose money state | Verify, insert unique event, enqueue, commit, then acknowledge |
| Assuming webhook order or uniqueness | Both providers document/expect duplicate and asynchronous event handling; Stripe explicitly does not guarantee order | Unique event inbox, conditional transitions, canonical-object retrieval |
| Marking ACH paid at creation or `processing` | ACH is delayed and can fail/dispute after initiation | Terminal provider evidence plus payout/bank reconciliation |
| PostHog, console logs, Sentry, or provider dashboard as audit truth | Retention, mutability, PII exposure, and incomplete business context | Append-only PostgreSQL financial/audit records |
| PWA offline mutation of financial commands | Replayed browser mutations can duplicate irreversible actions | Online server command with idempotency key; offline billing is read-only |
| Floating `npx`, unpinned provider SDK/API version, or latest-tag Edge imports | Builds can change without a reviewed commit | Exact dev dependencies, Deno lock/import map, pinned provider API version |

## Stack Patterns by Variant

**If the job is purely database-local and bounded:** run a transactional SQL function from Cron; no Edge invocation is necessary.

**If the job calls a payment provider:** enqueue a job ID, wake a short Edge Function worker, and keep the provider call isolated behind the selected adapter.

**If a provider POST times out:** keep the job indeterminate, retry with the same provider idempotency key, retrieve provider state, and reconcile; never create a new key merely to “try again.”

**If a webhook is duplicated or arrives out of order:** durably record the duplicate receipt, do not reapply an already-applied event, retrieve canonical provider state when necessary, and make only a permitted conditional transition.

**If an automation prerequisite is ambiguous:** persist the reason, pause the job, alert, and require an authorized resolution. Infrastructure retries must never convert a business-policy exception into an automatic charge.

**If volume eventually exceeds Edge limits:** preserve PostgreSQL outbox/job/event contracts and move only the worker executor to a durable external workflow service. Do not move the financial source of truth.

## Version Compatibility

| Package / Platform | Compatible With | Notes |
|--------------------|-----------------|-------|
| Current app | Node 22 development/deploy; Node 20 check lane | New recommended test and monitoring packages support Node 20+. Keep both lanes green until CI is deliberately unified. |
| `@supabase/supabase-js@2.90.1` | Node `>=20`; current `ra-supabase-core` resolution | Declare directly without a surprise upgrade. Registry latest `2.112.3` requires Node `>=22`, so it is a separate compatibility change. |
| `supabase@2.115.0` | Node `>=20` | Works in both current CI lanes; pin it. |
| `@playwright/test@1.62.1` | Node `>=20` | Compatible with current check/deploy runtimes. |
| `fast-check@4.9.0` | Node `>=12.17` | Compatible with Vitest 3 and current Node lanes. |
| `@sentry/react@10.70.0` | Node `>=18` build tooling; React 19 runtime | Use a matching Sentry major across React/Deno packages. |
| `@sentry/deno@10.70.0` | Supabase Deno-compatible Edge Runtime | Supabase officially documents Sentry monitoring; exercise deploy/runtime in integration tests. |
| `stripe@22.5.0` | Node `>=18`; Deno `npm:` export | Official Stripe and Supabase docs support this runtime shape. Pin the Stripe API version used by the adapter and store it with events. |
| `gocardless-nodejs@8.6.3` | Node `>=18`; Deno status to prove | Do not assume Node engine compatibility equals Supabase Edge compatibility. Typed REST is the fallback. |
| Supabase Queues/Cron | Existing hosted Supabase/Postgres project | Assert extensions/config in migration tests; do not depend on an undocumented extension version. |

## Sources

### Existing System and Versions

- Repository `package.json`, `package-lock.json`, `.nvmrc`, `supabase/config.toml`, and `.planning/codebase/*` — existing brownfield versions and integration constraints (HIGH).
- [npm registry: Supabase CLI](https://www.npmjs.com/package/supabase), [Supabase JS](https://www.npmjs.com/package/@supabase/supabase-js), [fast-check](https://www.npmjs.com/package/fast-check), [Playwright Test](https://www.npmjs.com/package/@playwright/test), [Sentry React](https://www.npmjs.com/package/@sentry/react), [Sentry Deno](https://www.npmjs.com/package/@sentry/deno), [Stripe](https://www.npmjs.com/package/stripe), and [GoCardless Node](https://www.npmjs.com/package/gocardless-nodejs) — versions/engines queried 2026-08-19 (HIGH).

### Providers, Pricing, and Compliance

- [GoCardless US pricing](https://gocardless.com/en-us/pricing) — rates, caps, failure/refund/chargeback fees, plan features; observed 2026-08-19 (HIGH for listed price, MEDIUM for ambiguous settlement wording).
- [GoCardless hosted pages](https://developer.gocardless.com/integration-types/gocardless-hosted-pages), [Billing Requests overview](https://developer.gocardless.com/billing-requests/overview), and [API reference](https://developer.gocardless.com/api-reference/) — hosted authorization, variable payments, idempotency, events, payouts, and imports (HIGH).
- [GoCardless webhook guide](https://developer.gocardless.com/getting-started/stay-up-to-date-with-webhooks-v2) — raw-body signature, event IDs, asynchronous processing/deduplication (HIGH).
- [GoCardless ACH/PAD authorization types](https://support.gocardless.com/hc/en-us/articles/18121304847900-ACH-PAD-Authorization-Types) and [US notifications](https://support.gocardless.com/hc/en-us/articles/360023787373-United-States-ACH-custom-notifications) — Open authorization and retention/notification responsibilities (HIGH as provider guidance; legal applicability still requires review).
- [Stripe standard pricing](https://stripe.com/pricing), [local payment pricing](https://stripe.com/pricing/local-payment-methods), and [Invoicing pricing](https://stripe.com/invoicing/pricing) — ACH, failure/dispute/verification, and optional invoice fees; observed 2026-08-19 (HIGH).
- [Stripe ACH Direct Debit](https://docs.stripe.com/payments/ach-direct-debit) and [accept ACH](https://docs.stripe.com/payments/ach-direct-debit/accept-a-payment) — hosted options, mandates, async status, merchant responsibilities (HIGH).
- [Stripe webhook guide](https://docs.stripe.com/webhooks), [signature guide](https://docs.stripe.com/webhooks/signature), and [idempotent requests](https://docs.stripe.com/api/idempotent_requests) — duplicate/order/retry/signature/idempotency semantics (HIGH).
- [Stripe payout reconciliation](https://docs.stripe.com/reports/payout-reconciliation) and [balance transactions](https://docs.stripe.com/reports/balance-transaction-types) — settlement evidence (HIGH).
- [Stripe ACH migration](https://docs.stripe.com/payments/ach-direct-debit/migrating-from-another-processor) and [GoCardless mandate imports](https://developer.gocardless.com/mandates/importing-mandates/) — provider-assisted portability (HIGH for inbound flows; outbound/live applicability must be confirmed in the spike).
- [Stripe integration security](https://docs.stripe.com/security/guide) and [PCI guide](https://stripe.com/guides/pci-compliance) — hosted-surface scope reduction and merchant attestation duties (HIGH).

### Durable Work, Money, Observability, and Tests

- [Supabase Queues](https://supabase.com/docs/guides/queues), [Queues API](https://supabase.com/docs/guides/queues/api), and [Queues quickstart](https://supabase.com/docs/guides/queues/quickstart) — durability, visibility, archival, logged/unlogged behavior, permissions (HIGH).
- [Supabase Cron](https://supabase.com/docs/guides/cron), [scheduled Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions), [background tasks](https://supabase.com/docs/guides/functions/background-tasks), and [function limits](https://supabase.com/docs/guides/functions/limits) — scheduling and why background promises are not a queue (HIGH).
- [Supabase pricing](https://supabase.com/pricing) and [billing docs](https://supabase.com/docs/guides/platform/billing-on-supabase) — current Pro/Edge/Log Drain cost claims; observed 2026-08-19 (HIGH).
- [PostgreSQL 15 numeric types](https://www.postgresql.org/docs/15/datatype-numeric.html), [MDN BigInt JSON behavior](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/BigInt_not_serializable), and [Stripe minor-unit amounts](https://docs.stripe.com/api/payment_intents/create) — exact-money boundary (HIGH).
- [Supabase database testing](https://supabase.com/docs/guides/local-development/testing/overview), [testing and linting](https://supabase.com/docs/guides/local-development/cli/testing-and-linting), and [Edge Function tests](https://supabase.com/docs/guides/functions/unit-test) — local whole-stack/pgTAP/Deno strategy (HIGH).
- [Supabase Stripe webhook example](https://supabase.com/docs/guides/functions/examples/stripe-webhooks) and [Stripe Node Deno support](https://github.com/stripe/stripe-node#usage-with-deno) — current SDK/Edge compatibility (HIGH).
- [Sentry pricing](https://sentry.io/pricing/), [Sentry JavaScript SDKs](https://github.com/getsentry/sentry-javascript), and [Sentry source-map guidance](https://docs.sentry.io/platforms/javascript/guides/deno/sourcemaps/uploading/hosting-publicly/) — monitoring packages, dated cost, and private maps (HIGH).
- Context7 `/supabase/supabase`, `/websites/stripe`, and `/getsentry/sentry-javascript` — current library patterns cross-checked 2026-08-19 (HIGH).

---
*Stack research for: RC Digital Billing Operations*
*Researched: 2026-08-19*
