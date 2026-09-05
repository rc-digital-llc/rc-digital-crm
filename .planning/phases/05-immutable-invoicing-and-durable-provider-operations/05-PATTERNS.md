# Phase 5 Pattern Map

**Mode:** Inline repository scout, 2026-09-05. Paths below are actual source
anchors; planned destinations do not exist until the owning plan executes.

| Planned destination | Closest existing analog | Required adaptation |
|---|---|---|
| supabase/migrations/20260905000001_billing_invoice_obligations.sql | supabase/migrations/20260902000002_exact_billing_expand.sql and 20260904000003_billing_calculations.sql | Extend exact invoice authority; calculation snapshot only, immutable issued state |
| supabase/migrations/20260905000002_billing_invoice_corrections.sql | 20260904000004_billing_calculation_close.sql | Read approved adjustment lineage; linked immutable documents and distinct capability events |
| supabase/migrations/20260905000003_billing_durable_jobs.sql | Phase 2 automation executions and Phase 4 replay helpers | Durable scheduling/fencing new; do not confuse grant execution with a queue |
| supabase/functions/_shared/billingProviderPort.ts | supabase/functions/_shared/authentication.ts and billingCloseProvider.ts | Closed server-only transport, bound connection, no untrusted destination or raw error |
| supabase/functions/billing-provider-webhook/index.ts | supabase/functions/postmark/index.ts | Provider signature auth replaces user JWT at ingress; persist raw envelope and all jobs before ack |
| supabase/migrations/20260905000007_billing_subledger.sql | Phase 3 exact primitives and Phase 4 append-only events | New journal authority with deferred balanced invariant and signed rule approval |
| src/components/atomic-crm/providers/supabase/billingInvoiceProvider.ts | src/components/atomic-crm/providers/supabase/billingCloseProvider.ts | Strict invoice/intent/proof/allocation requests and reconciled responses |
| src/components/atomic-crm/providers/fakerest/billingInvoiceProvider.ts | src/components/atomic-crm/providers/fakerest/billingCloseProvider.ts | Isolated deterministic state; same failures and replay behavior; no network |
| src/components/atomic-crm/invoices/InvoiceShow.tsx | src/components/atomic-crm/billing-accounts/BillingAccountShow.tsx | Registered desktop/mobile resource, immutable display, proof states |
| supabase/tests/database/100_billing_invoice_obligations.sql onward | supabase/tests/database/80_billing_calculations.sql | Forced RLS, direct write denial, exact boundary and concurrency assertions |
| tests/release/billing-provider-webhook.test.ts | tests/release/billing-evidence.test.ts | Real local HTTP/raw-body/signature/crash tests, not source-string-only tests |
| supabase/tests/upgrades/005-invoice-provider/expected-transformations.json | supabase/tests/upgrades/004-agreement-close/expected-transformations.json | Append to reconciled immutable lineage; no prior hash edits |
| scripts/release/run-invoice-source-surface.mjs | scripts/release/run-billing-source-surface.mjs | Reuse synthetic authenticated source harness; independent receipt/marker |

**Confirmed privacy owner:** `src/components/atomic-crm/billing-accounts/billingAccess.ts`
currently recognizes billing-prefixed query keys, so Plan 12 must explicitly
cover invoice semantic keys. Keep strict errors,
safe scalar logging, organization-bound capabilities and offline exclusions.
Never add an implicit sales_id ownership rule to a billing financial fact.

**Shared-file ownership:** Plans run serially because provider contracts,
makefile membership and ordered migrations overlap. Only run isolated test
processes in parallel when their lane wrappers guarantee separate targets.
