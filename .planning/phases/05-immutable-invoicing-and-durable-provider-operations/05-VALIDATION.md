---
phase: 05
slug: immutable-invoicing-and-durable-provider-operations
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-05
---

# Phase 05 — Validation Strategy

This is a reviewed **test plan**, not a record of passing implementation tests.
Phase 5 has not been implemented. The baseline gate must pass before execution.

## Test Infrastructure

| Property | Value |
|---|---|
| Framework | Existing Vitest, pgTAP, real local Supabase Auth/REST/Edge and source surface harness |
| Config | vite.config.ts, package.json, makefile and isolated lane wrappers |
| Quick command | `npm test -- --run <task-owned test path>` with Node 22 |
| Full suite | `make financial-gate && npm run typecheck && npm run lint && npm run build && CI=1 npm test` |
| Runtime | Pure contract tests target <=30s; local database/HTTP/full gate can take minutes, not yet measured for Phase 5 |
| Target safety | Existing isolated loopback wrappers only; no linked/hosted schema mutation |
| Live evidence | Both provider sandbox receipts, genuine posting/notice approvals; no fixture substitution |

## Sampling Rate

After each edit/task commit run its exact listed non-watch command. New test
files are authored as failing behavioral cases at the beginning of their owning
task, before implementation; none may be an empty passing placeholder.
Run quick pure assertions before slow lanes where applicable. End every serial
wave with its full affected financial lane, plus typecheck for TypeScript.
Before phase verification, the full gate and source surface must be green at
one exact head. Real sandbox evidence is additional, not an optional CI skip.

Feedback target is 30s for pure tests. SQL/HTTP/full gates are explicit slower
checks; do not claim sub-30s latency or 100% physical-device coverage.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---|---|---|---|---|---|---|---|---|---|
| 05-01-01 | 01 | 1 | INV-01, INV-02, INV-03, AUTO-02 | T-05-01-01 | Concurrent draft requests with different command keys return one identity; changed source/request fingerprint conflicts with zero extra audit/counter effects. | SQL/HTTP integration | `make test-financial-database-sql` | Owner task creates new cases RED-first; inherited harness exists | pending |
| 05-01-02 | 01 | 1 | INV-01, INV-02, INV-03, AUTO-02 | T-05-01-02 | Every money/line/total mismatch and forged source field is rejected before a branded object is returned. | unit/contract + integration | `npm test -- --run src/components/atomic-crm/financial/billingInvoiceContract.test.ts` | Owner task creates new cases RED-first; inherited harness exists | pending |
| 05-02-01 | 02 | 2 | INV-03, AUTO-02 | T-05-02-01 | Parallel correction requests create one linked result; altered source/amount fails without secondary effects. | SQL/HTTP integration | `make test-financial-database-sql` | Owner task creates new cases RED-first; inherited harness exists | pending |
| 05-02-02 | 02 | 2 | INV-03, AUTO-02 | T-05-02-02 | A principal authorized for one correction cannot use another capability; replay does not consume another authorization counter. | SQL/HTTP integration | `npm test -- --run src/components/atomic-crm/financial/billingInvoiceContract.test.ts && make test-financial-database-sql` | Owner task creates new cases RED-first; inherited harness exists | pending |
| 05-03-01 | 03 | 3 | AUTO-01, AUTO-02 | T-05-03-01 | Crash after business commit leaves a claimable job; rollback leaves neither business effect nor orphan job. | SQL/HTTP integration | `make test-financial-database-sql` | Owner task creates new cases RED-first; inherited harness exists | pending |
| 05-03-02 | 03 | 3 | AUTO-01, AUTO-02 | T-05-03-02 | Restart/replay produces no duplicate invoice command, intent, notification business key, allocation or transition. | unit/contract + integration | `npm test -- --run tests/release/billing-job-runner.test.ts && make test-financial-replay-concurrency` | Owner task creates new cases RED-first; inherited harness exists | pending |
| 05-04-01 | 04 | 4 | PAY-02, PAY-05, AUTO-02 | T-05-04-01 | Same key with changed amount/account/provider/environment/policy rejects before job/grant mutation. | SQL/HTTP integration | `make test-financial-database-sql` | Owner task creates new cases RED-first; inherited harness exists | pending |
| 05-04-02 | 04 | 4 | PAY-02, PAY-05, AUTO-02 | T-05-04-02 | Raw bank/card/mandate credential fields, unapproved redirects and cross-connection IDs are rejected before intent creation. | Edge/HTTP | `make test-financial-functions` | Owner task creates new cases RED-first; inherited harness exists | pending |
| 05-05-01 | 05 | 5 | PAY-01, PAY-02, PAY-05, PAY-07 | T-05-05-01 | Both adapters run in Deno with pinned versions and identical closed normalized result validation. | unit/contract + integration | `npm test -- --run tests/release/billing-provider-adapters.test.ts` | Owner task creates new cases RED-first; inherited harness exists | pending |
| 05-05-02 | 05 | 5 | PAY-01, PAY-02, PAY-05, PAY-07 | T-05-05-02 | One manifest drives both adapter suites without provider-specific exclusions being counted as passes. | unit/contract + integration | `npm test -- --run tests/release/billing-provider-adapters.test.ts` | Owner task creates new cases RED-first; inherited harness exists | pending |
| 05-06-01 | 06 | 6 | PAY-06, PAY-07, AUTO-02 | T-05-06-01 | Duplicate envelope/batched events return durable dedupe results without second processing jobs. | SQL/HTTP integration | `make test-financial-database-sql` | Owner task creates new cases RED-first; inherited harness exists | pending |
| 05-06-02 | 06 | 6 | PAY-06, PAY-07, AUTO-02 | T-05-06-02 | Changing any verified body byte fails authenticity; secret/account/environment confusion fails closed. | Edge/HTTP | `make test-financial-functions` | Owner task creates new cases RED-first; inherited harness exists | pending |
| 05-07-01 | 07 | 7 | PAY-07, PAY-09, AUTO-02 | T-05-07-01 | Direct fact update/delete, cross-account references, malformed amounts and duplicate economic event insertion reject. | SQL/HTTP integration | `make test-financial-database-sql` | Owner task creates new cases RED-first; inherited harness exists | pending |
| 05-07-02 | 07 | 7 | PAY-07, PAY-09, AUTO-02 | T-05-07-02 | All supported event-order permutations yield identical economic balances and preserved causal history. | unit/contract + integration | `npm test -- --run tests/release/billing-payment-facts.test.ts && make test-financial-replay-concurrency` | Owner task creates new cases RED-first; inherited harness exists | pending |
| 05-08-01 | 08 | 8 | REC-01, AUTO-02 | T-05-08-01 | Imbalanced, empty, one-sided, cross-organization/currency or unsupported-kind journals cannot commit even via direct privileged command paths. | SQL/HTTP integration | `make test-financial-database-sql` | Owner task creates new cases RED-first; inherited harness exists | pending |
| 05-08-02 | 08 | 8 | REC-01, AUTO-02 | T-05-08-02 | Invoice command rollback leaves neither issued effect nor journal when its approved policy is missing/invalid. | SQL/HTTP integration | `npm test -- --run tests/release/billing-subledger.test.ts && make test-financial-database-sql` | Owner task creates new cases RED-first; inherited harness exists | pending |
| 05-09-01 | 09 | 9 | REC-02, PAY-09, AUTO-02 | T-05-09-01 | Full, partial, split-across-invoices and zero-residual/unapplied scenarios retain exact sums and all historical references. | SQL/HTTP integration | `make test-financial-database-sql` | Owner task creates new cases RED-first; inherited harness exists | pending |
| 05-09-02 | 09 | 9 | REC-02, PAY-09, AUTO-02 | T-05-09-02 | Replaying any reversal creates one reversal and matching journal; original allocation/journal bytes are unchanged. | unit/contract + integration | `npm test -- --run tests/release/billing-payment-allocations.test.ts && make test-financial-replay-concurrency` | Owner task creates new cases RED-first; inherited harness exists | pending |
| 05-10-01 | 10 | 10 | INV-06, PAY-04, AUTO-02 | T-05-10-01 | Invoice content and recipient policy cannot drift after issue; retry references the same approved content version. | SQL/HTTP integration | `make test-financial-database-sql` | Owner task creates new cases RED-first; inherited harness exists | pending |
| 05-10-02 | 10 | 10 | INV-06, PAY-04, AUTO-02 | T-05-10-02 | Crash after remote acceptance results in one accepted or unknown attempt, never an automatic second message. | Edge/HTTP | `make test-financial-functions && npm test -- --run tests/release/billing-delivery.test.ts` | Owner task creates new cases RED-first; inherited harness exists | pending |
| 05-11-01 | 11 | 11 | INV-01, INV-02, INV-03, INV-06, PAY-02, PAY-09, REC-02 | T-05-11-01 | Authenticated HTTP can read only assigned account safe fields; guessed IDs/filter operators cannot widen authority. | SQL/HTTP integration | `make test-financial-database-sql` | Owner task creates new cases RED-first; inherited harness exists | pending |
| 05-11-02 | 11 | 11 | INV-01, INV-02, INV-03, INV-06, PAY-02, PAY-09, REC-02 | T-05-11-02 | The same synthetic scenario IDs yield the same externally visible Supabase/FakeRest state and safe error codes. | SQL/HTTP integration | `npm test -- --run src/components/atomic-crm/financial/billingInvoiceProviderContract.test.ts && make test-financial-database-http` | Owner task creates new cases RED-first; inherited harness exists | pending |
| 05-12-01 | 12 | 12 | INV-01, INV-02, INV-03, INV-06, PAY-02, REC-02 | T-05-12-01 | Both responsive resource trees register all visible invoice links; account panel is wired rather than orphaned. | unit/contract + integration | `npm test -- --run src/components/atomic-crm/financial/billingInvoiceUi.test.tsx && npm run typecheck` | Owner task creates new cases RED-first; inherited harness exists | pending |
| 05-12-02 | 12 | 12 | INV-01, INV-02, INV-03, INV-06, PAY-02, REC-02 | T-05-12-02 | Missing approved terms or proof disables effect action with specific next step; server denial still wins. | unit/contract + integration | `npm test -- --run src/components/atomic-crm/financial/billingInvoiceUi.test.tsx tests/release/billing-invoice-privacy.test.ts && npm run typecheck` | Owner task creates new cases RED-first; inherited harness exists | pending |
| 05-13-01 | 13 | 13 | PAY-01, PAY-02, PAY-04, PAY-05, PAY-06, PAY-07, PAY-09, REC-01 | T-05-13-01 | Verifier requires both providers at one head/manifest and rejects missing, skipped or unsupported required scenarios. | unit/contract + integration | `npm test -- --run tests/release/billing-provider-certification.test.ts` | Owner task creates new cases RED-first; inherited harness exists | pending |
| 05-13-02 | 13 | 13 | PAY-01, PAY-02, PAY-04, PAY-05, PAY-06, PAY-07, PAY-09, REC-01 | T-05-13-02 | Both real receipts pass every required scenario and compare normalized invoice/payment/ledger/allocation outcomes, or task remains incomplete with exact gaps. | unit/contract + integration | `node scripts/billing/verify-provider-certification.mjs --directory artifacts/phase-05/provider-certification` | Owner task creates new cases RED-first; inherited harness exists | pending |
| 05-14-01 | 14 | 14 | INV-01, INV-02, INV-03, INV-06, PAY-01, PAY-02, PAY-04, PAY-05, PAY-06, PAY-07, PAY-09, REC-01, REC-02, AUTO-01, AUTO-02 | T-05-14-01 | Clean and representative upgrade match exact final schema/security/data fingerprints through all Phase 5 migrations. | unit/contract + integration | `npm test -- --run tests/release/phase-05-release-static.test.ts tests/release/migration-upgrade.test.ts && make test-financial-migration-upgrade` | Owner task creates new cases RED-first; inherited harness exists | pending |
| 05-14-02 | 14 | 14 | INV-01, INV-02, INV-03, INV-06, PAY-01, PAY-02, PAY-04, PAY-05, PAY-06, PAY-07, PAY-09, REC-01, REC-02, AUTO-01, AUTO-02 | T-05-14-02 | Schema-push proves every final migration on a loopback disposable database with matching registry and unchanged source config. | unit/contract + integration | `make test-financial-schema-push && make financial-gate && npm run typecheck && npm run lint && npm run build && CI=1 npm test` | Owner task creates new cases RED-first; inherited harness exists | pending |
| 05-14-03 | 14 | 14 | INV-01, INV-02, INV-03, INV-06, PAY-01, PAY-02, PAY-04, PAY-05, PAY-06, PAY-07, PAY-09, REC-01, REC-02, AUTO-01, AUTO-02 | T-05-14-03 | Source receipt passes no overflow, obscured focus, unexpected overlays, <44px controls or page/console errors at both required source sizes. | unit/contract + integration | `node scripts/release/run-invoice-source-surface.mjs && npm test -- --run tests/release/phase-05-release-static.test.ts && git diff --check` | Owner task creates new cases RED-first; inherited harness exists | pending |
| 05-13-03 | 13 | 13 | PAY-01, PAY-04, REC-01 | Human evidence gate | Genuine approvals tied to exact policy/scope | human + evidence verifier | `node scripts/billing/verify-provider-certification.mjs --directory artifacts/phase-05/provider-certification --require-approvals` | Created by 05-13-01 | pending |

## Wave 0 Requirements

Existing test frameworks and lane wrappers are installed. RED-first setup is
embedded in every owning task rather than a separate phase-wide empty stub
plan. New files required before each listed command can pass:

- [ ] 05-01: `supabase/tests/database/100_billing_invoice_obligations.sql`, `src/components/atomic-crm/financial/billingInvoiceContract.test.ts` — substantive cases created by that plan's owning task; register permanently.
- [ ] 05-02: `supabase/tests/database/105_billing_invoice_corrections.sql`, `src/components/atomic-crm/financial/billingInvoiceContract.test.ts` — substantive cases created by that plan's owning task; register permanently.
- [ ] 05-03: `supabase/tests/database/110_billing_durable_jobs.sql`, `tests/release/billing-job-runner.test.ts`, `tests/release/replay-concurrency.test.ts` — substantive cases created by that plan's owning task; register permanently.
- [ ] 05-04: `supabase/tests/database/115_billing_provider_intents.sql`, `tests/release/billing-provider-intents.test.ts` — substantive cases created by that plan's owning task; register permanently.
- [ ] 05-05: `tests/release/billing-provider-adapters.test.ts` — substantive cases created by that plan's owning task; register permanently.
- [ ] 05-06: `supabase/tests/database/120_billing_provider_webhooks.sql`, `tests/release/billing-provider-webhook.test.ts` — substantive cases created by that plan's owning task; register permanently.
- [ ] 05-07: `supabase/tests/database/125_billing_payment_facts.sql`, `tests/release/billing-payment-facts.test.ts`, `tests/release/replay-concurrency.test.ts` — substantive cases created by that plan's owning task; register permanently.
- [ ] 05-08: `supabase/tests/database/130_billing_subledger.sql`, `tests/release/billing-subledger.test.ts` — substantive cases created by that plan's owning task; register permanently.
- [ ] 05-09: `supabase/tests/database/135_billing_payment_allocations.sql`, `tests/release/billing-payment-allocations.test.ts`, `tests/release/replay-concurrency.test.ts` — substantive cases created by that plan's owning task; register permanently.
- [ ] 05-10: `supabase/tests/database/140_billing_delivery_obligations.sql`, `tests/release/billing-delivery.test.ts` — substantive cases created by that plan's owning task; register permanently.
- [ ] 05-11: `supabase/tests/database/145_billing_invoice_provider_reads.sql`, `src/components/atomic-crm/financial/billingInvoiceProviderContract.test.ts`, `tests/release/billing-invoice-http.test.ts` — substantive cases created by that plan's owning task; register permanently.
- [ ] 05-12: `src/components/atomic-crm/financial/billingInvoiceUi.test.tsx`, `tests/release/billing-invoice-privacy.test.ts` — substantive cases created by that plan's owning task; register permanently.
- [ ] 05-13: `tests/release/billing-provider-certification.test.ts` — substantive cases created by that plan's owning task; register permanently.
- [ ] 05-14: `tests/release/phase-05-release-static.test.ts`, `tests/release/migration-upgrade.test.ts` — substantive cases created by that plan's owning task; register permanently.

Inherited tests named above already exist; add the specified new cases to them.
`wave_0_complete` remains false until execution proves all new test setup exists.

## Manual / External Evidence

Additional Plan 12 RED-first file: `src/components/atomic-crm/billing-accounts/billingAccess.test.ts`
tests the explicit invoice-key/offline exclusion added to the existing
`billingAccess.ts` privacy boundary.

| Behavior | Requirement | Why not a local automated assertion | Instructions |
|---|---|---|---|
| Integrated baseline approval | D-26 | Local and reviewed release histories differ | Follow 05-BASELINE-PREFLIGHT.md and verify exact-head receipt |
| Existing numbering/payment terms | INV-02 | Customer commercial authority is not inferred | Enter approved explicit versioned settings before issue; no default net terms |
| Sandbox account and hosted payer setup | PAY-01/PAY-02 | Requires actual authorized accounts/synthetic payer interaction | Supply secret binding through approved channel, never chat/repo; complete hosted setup |
| Accounting rule approval | REC-01 | Accountant signs semantic policy, not just balanced arithmetic | Review exact policy hash and economic examples; store private evidence reference |
| Notice responsibilities/eligibility | PAY-04 | Scheme, provider and merchant obligations require real evidence | Validate timing/content/fallback/proof for both sandboxes and record approved responsibility |
| Provider selection | PAY-01 | Owner decision after complete evidence | Review scorecard/receipts and record choice without enabling live effects |
| Screen reader/physical devices | UI | Emulation does not prove assistive/physical behavior | Complete keyboard and screen-reader/real-device pass, name residual gaps |
| Preview and production | Release | Separate URLs, heads and owner stage gates | Independent five-viewport immutable preview and authorized canonical production receipts |

## Validation Sign-Off

- [x] All 29 implementation tasks and the evidence checkpoint have concrete automated checks.
- [x] No three consecutive implementation tasks lack automation; every serial wave is sampled.
- [x] Every new test path has an owning RED-first task and permanent lane registration.
- [x] No watch-mode or always-success verification command.
- [x] Fast/slow latency expectations are explicit; implementation timings are not fabricated.
- [x] Planning coverage meets Nyquist; `nyquist_compliant: true` is planning compliance only.
- [ ] Runtime tests, sandbox certification, accountant/notice approvals and rendered source proof executed.

**Planning review:** 2026-09-05, inline. **Implementation evidence:** pending.
