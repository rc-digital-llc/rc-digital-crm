# Codebase Concerns

**Analysis Date:** 2026-08-20

## Tech Debt

**Invoice state is not a financial ledger:**
- Issue: A single mutable `invoices` row holds the amount, lifecycle status, paid date, payment method, and one payment reference; users can also hard-delete the row. There is no append-only payment, refund, dispute, adjustment, or provider-event history in `supabase/migrations/20260305000004_add_invoices_table.sql`.
- Files: `supabase/migrations/20260305000004_add_invoices_table.sql`
- Impact: The application cannot reconstruct who changed a balance, distinguish partial payments from full settlement, prove that a provider event caused a transition, or audit collections actions. Do not use `invoices.status = 'Paid'` as unattended revenue evidence.
- Fix approach: Keep invoices as documents, add immutable `payment_provider_events`, `payments`, `payment_allocations`, `refunds`, `disputes`, and `invoice_status_events` tables, and restrict deletion to compensating records or explicit archival in new migrations under `supabase/migrations/`.

**Billing domain is only a schema stub:**
- Issue: Navigation exposes Projects, Analytics, and Invoices, but `DesktopAdmin` registers none of those resources; invoice source contains only arithmetic helpers and tests. The links in `src/components/atomic-crm/layout/Header.tsx` lead to resources absent from `src/components/atomic-crm/root/CRM.tsx`, and no invoice record type exists in `src/components/atomic-crm/types.ts`.
- Files: `src/components/atomic-crm/layout/Header.tsx`, `src/components/atomic-crm/root/CRM.tsx`, `src/components/atomic-crm/invoices/invoiceCalculations.ts`, `src/components/atomic-crm/types.ts`
- Impact: There is no supported workflow for creating, reviewing, sending, reconciling, or collecting an invoice, despite the database table and sidebar implying otherwise.
- Fix approach: Add typed invoice/project resources, list/show/create/edit flows, permission-aware actions, and explicit lifecycle commands under `src/components/atomic-crm/invoices/` and register them in `src/components/atomic-crm/root/CRM.tsx`; do not expose direct generic CRUD for provider-controlled fields.

**Revenue has multiple uncoordinated meanings:**
- Issue: Project cash is manually stored in `projects.total_paid`, attributed revenue is manually stored in `project_analytics.revenue_from_leads`, channel revenue is derived from won `deals.amount`, and invoices separately hold `total_amount`. No trigger, view, or job reconciles these values.
- Files: `supabase/migrations/20260305000002_add_projects_table.sql`, `supabase/migrations/20260305000003_add_project_analytics_table.sql`, `supabase/migrations/20260305000004_add_invoices_table.sql`, `supabase/migrations/20260306000007_attribution_summary_view.sql`
- Impact: Pipeline value, invoiced value, collected cash, and attributed revenue can disagree while each screen appears authoritative.
- Fix approach: Define named measures (`booked`, `invoiced`, `collected`, `refunded`, `net_collected`) and derive them from immutable deal/invoice/payment records through security-invoker views; keep manually estimated revenue explicitly labeled and separate.

**Invoice calculations have competing representations:**
- Issue: The SQL line-item example uses `rate` and `amount`, the TypeScript `LineItem` uses `unit_price`, and the database total trigger ignores `line_items` and trusts the independent `amount` column. JavaScript calculations also return unrounded binary floating-point values.
- Files: `supabase/migrations/20260305000004_add_invoices_table.sql`, `src/components/atomic-crm/invoices/invoiceCalculations.ts`, `src/components/atomic-crm/invoices/invoiceCalculations.test.ts`
- Impact: Line items can disagree with the subtotal, provider charge amount, tax, and stored total; fractional-cent behavior can diverge between browser, Postgres, and a payment provider.
- Fix approach: Choose one canonical line-item schema, validate it with database constraints, store money in integer minor units plus an ISO currency, derive totals server-side with an explicit rounding rule, and treat client math as preview only.

**SQL tests check strings rather than behavior:**
- Issue: Lead-conversion, RLS, attribution, and trigger tests read migration files and assert that phrases exist; they never apply migrations or execute functions, policies, constraints, or concurrent transactions.
- Files: `src/components/atomic-crm/leads/leadConversion.test.ts`, `src/components/atomic-crm/leads/securityChecklist.test.ts`, `src/components/atomic-crm/attribution/attributionTriggers.test.ts`
- Impact: Stale column references, privilege escalation, invalid views, and incorrect revenue aggregation all pass the 176-test suite.
- Fix approach: Add a disposable Postgres/Supabase integration suite that runs every migration from zero and exercises authenticated, anonymous, service-role, duplicate-event, out-of-order-event, and concurrent-payment cases.

**Database rollout lacks a migration gate:**
- Issue: CI runs frontend lint, unit tests, and build, but does not reset a database, lint SQL, test Edge Functions, or verify migration rollback/forward compatibility before `npx supabase db push` runs on `main`.
- Files: `.github/workflows/check.yml`, `.github/workflows/deploy.yml`, `Makefile`
- Impact: A syntactically valid TypeScript change can merge while the database chain is broken; production deployment can partially apply database changes before a later function or frontend step fails.
- Fix approach: Add a blocking Supabase job to `.github/workflows/check.yml` that starts a clean local stack, executes `supabase db reset`, runs database contract tests, serves/tests Edge Functions, and verifies expand-contract migrations before deployment.

**Operational errors are console-only:**
- Issue: Edge Functions and client providers write failures to `console.error`/`console.warn`, while no durable job/event failure table or error-tracking integration records retries, terminal failures, or reconciliation exceptions.
- Files: `supabase/functions/postmark/index.ts`, `supabase/functions/users/index.ts`, `supabase/functions/merge_contacts/index.ts`, `src/components/atomic-crm/providers/supabase/dataProvider.ts`, `src/components/atomic-crm/misc/CrmErrorBoundary.tsx`
- Impact: Unattended billing failures can become silent revenue leakage unless someone watches transient logs.
- Fix approach: Persist operation IDs, attempts, next retry time, terminal error code, and operator resolution; add structured logging and alerts for webhook lag, reconciliation deltas, failed charges, and collections sends.

## Known Bugs

**Lead conversion writes removed contact columns:**
- Symptoms: `convert_lead_to_contact` inserts `contacts.email` and `contacts.phone_1_number`, although those columns are dropped in favor of `email_jsonb` and `phone_jsonb`.
- Files: `supabase/migrations/20250109152531_email_jsonb.sql`, `supabase/migrations/20250113132531_phone_jsonb.sql`, `supabase/migrations/20260306000004_lead_conversion_function.sql`
- Trigger: Invoke `convert_lead_to_contact` for any unconverted lead.
- Workaround: Do not invoke the RPC until it inserts the current JSONB shapes and an integration test executes the full conversion transaction.

**Customer-journey view references a removed column:**
- Symptoms: The view selects `c.email`, but `contacts.email` is dropped; applying `20260306000007_attribution_summary_view.sql` to the repository schema fails when creating `customer_journeys`.
- Files: `supabase/migrations/20250109152531_email_jsonb.sql`, `supabase/migrations/20260306000007_attribution_summary_view.sql`
- Trigger: Apply the full migration chain to a clean database.
- Workaround: Replace the reference with a deliberate extraction from `c.email_jsonb` and verify the migration through `supabase db reset` before deploying later migrations.

**Default attribution filters target absent columns:**
- Symptoms: The dashboard defaults to 30 days, and two tabs send `created_at@gte` filters to `channel_attribution_summary` and `lead_source_performance`, but neither view exposes `created_at`.
- Files: `src/components/atomic-crm/attribution/AttributionDashboard.tsx`, `src/components/atomic-crm/attribution/ChannelPerformance.tsx`, `src/components/atomic-crm/attribution/LeadSourceAnalytics.tsx`, `supabase/migrations/20260306000007_attribution_summary_view.sql`
- Trigger: Open the Channel Performance or Lead Sources tab with the default date range.
- Workaround: Remove the invalid client filter only as a temporary measure; the durable fix is to aggregate with an explicit time dimension or parameterized RPC and test the PostgREST query end to end.

**Revenue aggregation undercounts equal-value deals:**
- Symptoms: `SUM(DISTINCT ... d.amount)` counts identical monetary amounts once, even when they belong to different won deals in the same channel/source group.
- Files: `supabase/migrations/20260306000007_attribution_summary_view.sql`, `src/components/atomic-crm/attribution/attributionTriggers.test.ts`
- Trigger: Attribute two distinct won deals with the same amount to the same group.
- Workaround: Pre-aggregate one row per deal/touch role and then sum amounts without monetary-value `DISTINCT`; add a fixture containing duplicate deal amounts.

**Inbound-email failures can be acknowledged as success:**
- Symptoms: `addNoteToContact` returns error `Response` objects, but the loop in the Postmark handler ignores the returned response and ultimately returns `200 OK`.
- Files: `supabase/functions/postmark/index.ts`, `supabase/functions/postmark/addNoteToContact.ts`
- Trigger: Deliver a webhook whose salesperson/contact/company/note database operation fails without throwing.
- Workaround: Make the helper return a typed result or throw, aggregate all recipient outcomes, and return a retryable non-2xx response until processing is transactionally complete.

**Inbound email is not idempotent:**
- Symptoms: The handler accepts Postmark's `MessageID` but never persists or checks it; retries can create duplicate notes and attachments.
- Files: `supabase/functions/postmark/index.ts`, `supabase/functions/postmark/addNoteToContact.ts`, `supabase/functions/postmark/extractAndUploadAttachments.ts`
- Trigger: Postmark retries after a timeout or ambiguous response.
- Workaround: Treat this handler as an unsafe precedent for payments; add a unique provider-event key and claim/process/finalize transaction before acknowledging any webhook.

**Invoice navigation points to an unregistered route:**
- Symptoms: The sidebar links to `/invoices`, but the admin tree has no `invoices` resource or custom route.
- Files: `src/components/atomic-crm/layout/Header.tsx`, `src/components/atomic-crm/root/CRM.tsx`
- Trigger: Select Invoices in the desktop navigation.
- Workaround: Hide the link until the resource and authorization flow are implemented.

## Security Considerations

**Cross-tenant lead conversion through a definer RPC:**
- Risk: `convert_lead_to_contact` is `SECURITY DEFINER`, accepts an arbitrary lead ID, uses unqualified object names, and performs no caller or `sales_id` ownership check. Default function execution privileges can let a caller bypass RLS and convert another user's lead.
- Files: `supabase/migrations/20260306000004_lead_conversion_function.sql`, `src/components/atomic-crm/leads/securityChecklist.test.ts`
- Current mitigation: The function rejects missing or already-converted leads, but that is state validation rather than authorization.
- Recommendations: Revoke execute from `PUBLIC`/`anon`, grant only the intended role, set an empty search path, schema-qualify objects, bind the lead to `auth.uid()`, and test cross-user denial. Apply the same rules to future payment RPCs.

**Legacy CRM records are globally mutable by authenticated users:**
- Risk: Initial policies use `USING (true)` and `WITH CHECK (true)` for companies, contacts, deals, notes, tasks, and tags, including destructive operations. These records anchor invoices and collections contacts.
- Files: `supabase/migrations/20240730075029_init_db.sql`, `supabase/migrations/20241104153231_sales_policies.sql`
- Current mitigation: Newer projects, invoices, leads, and analytics tables use `sales_id` ownership policies in `supabase/migrations/20260305000002_add_projects_table.sql` and `supabase/migrations/20260305000004_add_invoices_table.sql`.
- Recommendations: Replace permissive legacy policies with an explicit organization/role model before billing; verify that collectors, administrators, sales owners, and automation principals receive only required access.

**Attribution evidence can be forged:**
- Risk: The touchpoint INSERT policy is `WITH CHECK (true)` and allows arbitrary `sales_id`, channel, flags, metadata, and entity links; anonymous/unowned rows are visible to every authenticated user. This data feeds revenue claims.
- Files: `supabase/migrations/20260306000006_add_touchpoints_table.sql`, `supabase/migrations/20260306000007_attribution_summary_view.sql`
- Current mitigation: Select policy limits owned rows except for `sales_id IS NULL`; no provenance or signature fields exist.
- Recommendations: Separate untrusted intake from verified touchpoints, derive ownership server-side, validate entity relationships, record source/event IDs, and never promote this table to payment evidence.

**Authenticated JWT can authorize arbitrary attachment deletion payloads:**
- Risk: `delete_note_attachments` accepts caller-supplied storage paths and uses the service-role client to delete them; authentication proves identity but the handler never proves that the caller owns the referenced note or object.
- Files: `supabase/functions/delete_note_attachments/index.ts`, `supabase/functions/_shared/authentication.ts`, `supabase/functions/_shared/supabaseAdmin.ts`, `supabase/config.toml`
- Current mitigation: A valid Supabase bearer token and POST method are required by the function itself.
- Recommendations: Accept a note/event identifier rather than raw paths, reload authorized records server-side, use a narrowly scoped database function, and apply the pattern to payment evidence documents.

**Attachments are public and unsuitable for financial evidence:**
- Risk: The attachments bucket is created as public, and generated public URLs are stored on note records. Receipts, contracts, tax records, or dispute evidence placed there would be accessible to anyone holding or discovering the URL.
- Files: `supabase/migrations/20240730075029_init_db.sql`, `src/components/atomic-crm/providers/supabase/dataProvider.ts`, `supabase/functions/postmark/extractAndUploadAttachments.ts`
- Current mitigation: Browser code sometimes checks a short-lived signed URL, but uploads still obtain and persist public URLs.
- Recommendations: Create a private billing-evidence bucket with ownership metadata, short-lived signed reads, content/type/size validation, malware scanning, retention policy, and audited access.

**Postmark admin queries cross ownership boundaries:**
- Risk: Service-role queries locate contacts by email and companies by name without `sales_id`, then may attach a note to a record belonging to another salesperson or fail on duplicates.
- Files: `supabase/functions/postmark/addNoteToContact.ts`, `supabase/functions/_shared/supabaseAdmin.ts`
- Current mitigation: The sender must match an active salesperson, and the outer webhook checks Basic authentication plus an IP allowlist in `supabase/functions/postmark/index.ts`.
- Recommendations: Scope every lookup to the resolved salesperson/organization and enforce unique tenant-scoped identities. Payment-provider webhooks must resolve an internal account from stored provider IDs, never user-supplied email/name matching.

**Production dependency vulnerabilities remain in the lockfile:**
- Risk: `npm audit --omit=dev` reports 21 production vulnerabilities (1 critical, 8 high, 12 moderate), including direct vulnerable ranges for `lodash`, `react-router`, `vite`, `dompurify`, `posthog-js`, and `qs`, plus critical transitive `protobufjs`.
- Files: `package.json`, `package-lock.json`
- Current mitigation: Type checking and 176 unit tests pass, but `.github/workflows/check.yml` has no dependency-audit gate.
- Recommendations: Update through reviewed lockfile changes, regression-test authentication/routing/Markdown/analytics, and make a production-only audit or an approved advisory policy blocking in CI.

**Production source maps are deployed:**
- Risk: Vite emits source maps and the GitHub Pages deployment publishes the entire `dist` directory, exposing application internals that simplify endpoint and business-logic reconnaissance.
- Files: `vite.config.ts`, `.github/workflows/deploy.yml`
- Current mitigation: Frontend secrets are expected to remain server-side, but source visibility expands the attacker's map of privileged functions and billing flows.
- Recommendations: Upload source maps privately to observability and exclude them from public artifacts before adding payment workflows.

## Performance Bottlenecks

**Attribution views aggregate the full history before client pagination:**
- Problem: Multi-join views group all touchpoints/leads/deals, and the intended date filters are not part of the channel/source aggregation contract.
- Files: `supabase/migrations/20260306000007_attribution_summary_view.sql`, `src/components/atomic-crm/attribution/ChannelPerformance.tsx`, `src/components/atomic-crm/attribution/LeadSourceAnalytics.tsx`
- Cause: Time filtering is attempted against non-projected columns after aggregation; the views have no materialization or rollup strategy.
- Improvement path: Filter in a parameterized, security-aware query before grouping; add explain-plan benchmarks and rollups only after correctness is covered.

**Invoice indexes do not cover collection/reconciliation queues:**
- Problem: Single-column indexes exist, but common unattended queries need combinations such as owner/status/due date and provider/reference uniqueness.
- Files: `supabase/migrations/20260305000004_add_invoices_table.sql`
- Cause: The schema is optimized for basic CRUD rather than claiming batches of overdue invoices or matching provider events.
- Improvement path: Add workload-driven composite/partial indexes after designing states, such as actionable overdue invoices and unique provider-account/event/reference keys; verify with `EXPLAIN (ANALYZE, BUFFERS)`.

**Realtime refresh invalidates whole resources:**
- Problem: Every insert/update/delete invalidates all cached queries for a table, causing list refetches for each event.
- Files: `src/providers/realtimeProvider.ts`, `supabase/migrations/20260305000005_add_realtime.sql`
- Cause: The subscription callback ignores event payload and affected record/query scope.
- Improvement path: Patch or invalidate targeted records, debounce bursts, and avoid broadcasting raw high-volume provider events to browser clients.

**Dashboard values truncate at fixed page sizes:**
- Problem: Pipeline value sums only the first 100 deals, lead cards inspect at most 500 leads, and the API caps responses at 1,000 rows.
- Files: `src/components/atomic-crm/dashboard/Dashboard.tsx`, `src/components/atomic-crm/dashboard/LeadPipelineCard.tsx`, `supabase/config.toml`
- Cause: Aggregation occurs in the browser over paginated lists.
- Improvement path: Move monetary/count metrics into database aggregates with precise filters and tests; never calculate total collectible or collected revenue from a paginated client list.

**Activity feed performs five large queries:**
- Problem: The feed fetches up to 250 rows from five resources and merges/sorts them in the browser.
- Files: `src/components/atomic-crm/providers/commons/activity.ts`
- Cause: There is no unified server-side activity/event table or view.
- Improvement path: Introduce a paginated audit/activity stream; reuse it for invoice and collections lifecycle evidence instead of adding more client-side fan-out.

## Fragile Areas

**Invoice invariants exist only in comments:**
- Files: `supabase/migrations/20260305000004_add_invoices_table.sql`
- Why fragile: Status, payment method, line-item JSON shape, nonnegative amounts, tax range, due-date ordering, paid-state consistency, invoice-number uniqueness, provider-reference uniqueness, and currency are not constrained.
- Safe modification: Add constraints as `NOT VALID`, clean existing data, validate, then enforce commands that transition state transactionally; do not let generic form updates set provider-owned fields.
- Test coverage: `src/components/atomic-crm/invoices/invoiceCalculations.test.ts` covers arithmetic only and does not exercise schema constraints or status transitions.

**Attribution uses ambiguous record identity:**
- Files: `supabase/migrations/20260306000007_attribution_summary_view.sql`, `src/components/atomic-crm/attribution/ChannelPerformance.tsx`, `src/components/atomic-crm/attribution/LeadSourceAnalytics.tsx`, `src/components/atomic-crm/attribution/CustomerJourneyTimeline.tsx`
- Why fragile: All three TypeScript row interfaces require `id`, but none of the views selects a stable `id`; list row keys can be undefined and React Admin record assumptions may fail.
- Safe modification: Give every view a deterministic composite identity or adapt the data provider explicitly, then test pagination, sorting, and duplicate groups through PostgREST.
- Test coverage: `src/components/atomic-crm/attribution/attributionDashboard.test.ts` tests date arithmetic, while `src/components/atomic-crm/attribution/attributionTriggers.test.ts` tests SQL substrings rather than returned records.

**Webhook side effects are not transactional:**
- Files: `supabase/functions/postmark/index.ts`, `supabase/functions/postmark/addNoteToContact.ts`, `supabase/functions/postmark/extractAndUploadAttachments.ts`
- Why fragile: Attachments upload before contact/note writes, contact/company/note operations span separate calls, and retries have no durable state; partial execution leaves orphans or duplicates.
- Safe modification: Use an inbox table to persist the verified raw event, process it with idempotent transactional steps, record side-effect completion, and acknowledge only after durable acceptance.
- Test coverage: No tests exist under `supabase/functions/`; future payment handlers require signature, replay, duplicate, out-of-order, timeout, partial-failure, and retry tests.

**Mobile and desktop expose different resources:**
- Files: `src/components/atomic-crm/root/CRM.tsx`, `src/components/atomic-crm/layout/Header.tsx`
- Why fragile: Mobile registers only contacts, companies, and tasks; billing added only to desktop routing would silently disappear for mobile operators.
- Safe modification: Define a shared resource contract and intentionally specify supported billing operations per viewport/role.
- Test coverage: No route-level tests verify invoice navigation, resource registration, authorization, or responsive access in `src/`.

**Deployment couples irreversible and public mutations:**
- Files: `.github/workflows/deploy.yml`, `Makefile`
- Why fragile: A push to `main` performs database migration, Edge Function deployment, frontend build, and GitHub Pages publication in one job without staged compatibility checks or a billing-specific kill switch.
- Safe modification: Use expand-contract releases, independently deploy backward-compatible handlers, enable provider endpoints behind configuration, and verify reconciliation in shadow mode before enabling charges or collections.
- Test coverage: `.github/workflows/check.yml` has no preview environment or end-to-end workflow that proves database, function, and frontend compatibility together.

## Scaling Limits

**No durable work queue:**
- Current capacity: Only synchronous browser requests, direct Edge Function work, and database triggers are present in `src/components/atomic-crm/providers/supabase/dataProvider.ts`, `supabase/functions/`, and `supabase/migrations/20260304104600_note_attachments_trigger.sql`.
- Limit: Provider bursts, retry backoff, rate limits, long reconciliation windows, and thousands of overdue invoices cannot be processed reliably within request lifetimes.
- Scaling path: Add a transactional outbox/job table with claim leases, `SKIP LOCKED`, bounded concurrency, retry/backoff, dead-letter handling, and per-provider/account rate limits under `supabase/migrations/` and `supabase/functions/`.

**Browser-side aggregation caps financial totals:**
- Current capacity: Dashboard queries fetch 100 deals and other screens request 100–500 rows; Supabase REST caps a response at 1,000 in `supabase/config.toml`.
- Limit: Counts and sums become incomplete beyond these page sizes in `src/components/atomic-crm/dashboard/Dashboard.tsx` and `src/components/atomic-crm/dashboard/LeadPipelineCard.tsx`.
- Scaling path: Use server-side numeric aggregates and cursor/keyset pagination for event histories; expose evidence totals with as-of timestamps and reconciliation status.

**Realtime event amplification:**
- Current capacity: One browser subscription per mounted table invalidates every query key for that table in `src/providers/realtimeProvider.ts`.
- Limit: Bulk imports, provider event replay, or collection batch updates produce repeated full refetches and connection load.
- Scaling path: Keep high-volume billing event tables out of broad Realtime publication, send compact domain notifications, and coalesce UI refreshes.

## Dependencies at Risk

**Vulnerable production dependency tree:**
- Risk: The installed lockfile produces 1 critical, 8 high, and 12 moderate production audit findings, all reported with fixes available.
- Impact: Routing, sanitization, analytics telemetry, query parsing, build tooling, and transitive serialization code expand the attack surface of an application that handles customer and financial data.
- Migration plan: Update `package.json` and `package-lock.json` in reviewed batches, add audit policy to `.github/workflows/check.yml`, and regression-test `src/components/atomic-crm/misc/Markdown.tsx`, `src/components/atomic-crm/root/CRM.tsx`, and `src/providers/posthog.ts`.

**Deprecated Faker package:**
- Risk: Test/demo generation depends on `faker` 5.x and its separate typings rather than the maintained package.
- Impact: Demo parity for new invoice/payment resources is likely to lag, and future runtime/toolchain compatibility is uncertain.
- Migration plan: Move generators under `src/components/atomic-crm/providers/fakerest/dataGenerator/` to `@faker-js/faker`, then add realistic invoice/payment/reconciliation fixtures.

## Missing Critical Features

**Payment-provider ingestion boundary:**
- Problem: No Stripe, PayPal, bank, accounting, or other payment-provider SDK, Edge Function, signature verifier, provider-account mapping, event inbox, or webhook route exists in `package.json`, `supabase/functions/`, or `supabase/config.toml`.
- Blocks: Unattended payment confirmation, refund/dispute handling, subscription/recurring billing, and provider-backed revenue evidence.

**Reconciliation engine and evidence model:**
- Problem: There is no settlement/payout import, balance transaction model, matching rule, unmatched-item queue, reconciliation run/watermark, evidence attachment, or signed report in `supabase/migrations/` or `src/components/atomic-crm/`.
- Blocks: Proving that CRM invoices equal provider charges, bank settlements, fees, refunds, and net deposits.

**Collections policy and safety controls:**
- Problem: There is no dunning schedule, attempt history, contact consent/preference model, quiet hours, per-customer pause, dispute/legal hold, maximum attempt cap, approval threshold, template/version record, or human escalation state in `supabase/migrations/`.
- Blocks: Safe automated reminders or collection actions; a simple `due_date`/`Overdue` query is insufficient authorization to contact or charge a customer.

**Billing roles and separation of duties:**
- Problem: Authorization is based on salesperson ownership and a general administrator flag; no billing operator, reconciler, approver, automation principal, or read-only auditor role exists in `supabase/migrations/20240730075029_init_db.sql`, `supabase/functions/users/index.ts`, or `src/components/atomic-crm/types.ts`.
- Blocks: Least-privilege unattended automation, dual control for refunds/write-offs, and independent revenue verification.

**Currency, tax, and legal document semantics:**
- Problem: Invoices lack currency, jurisdiction, tax identifiers/snapshots, billing address snapshot, immutable issue version, credit-note semantics, and provider/account ownership in `supabase/migrations/20260305000004_add_invoices_table.sql`.
- Blocks: Correct provider amount conversion, historical invoice reproduction, multi-currency reconciliation, and defensible tax/collections records.

**Job monitoring and operator controls:**
- Problem: No kill switch, dry-run/shadow mode, job dashboard, retry/dead-letter UI, reconciliation-delta alert, or audit export exists in `src/components/atomic-crm/settings/`, `supabase/functions/`, or `.github/workflows/deploy.yml`.
- Blocks: Safely enabling and supervising unattended billing or collections in production.

## Test Coverage Gaps

**Invoice database behavior:**
- What's not tested: Money rounding, line-item/subtotal consistency, constraints, lifecycle transitions, partial payments, refunds, disputes, deletes, concurrency, and ownership policies.
- Files: `src/components/atomic-crm/invoices/invoiceCalculations.test.ts`, `supabase/migrations/20260305000004_add_invoices_table.sql`
- Risk: Financial corruption or unauthorized transitions can ship while arithmetic unit tests remain green.
- Priority: High

**Webhook security and delivery semantics:**
- What's not tested: Signature/auth failure, replay, duplicate IDs, out-of-order events, malformed bodies, body-size limits, provider retry behavior, partial database failure, and acknowledgement timing.
- Files: `supabase/functions/postmark/index.ts`, `supabase/functions/delete_note_attachments/index.ts`, `supabase/functions/`
- Risk: A future payment webhook can double-apply money or silently discard an event by copying existing patterns.
- Priority: High

**Migration-chain execution:**
- What's not tested: Clean database creation, stale-column references, view queryability, RLS under real JWT claims, function grants, indexes, and upgrade from representative production data.
- Files: `.github/workflows/check.yml`, `supabase/migrations/`, `src/components/atomic-crm/leads/securityChecklist.test.ts`
- Risk: Database deployment fails or creates insecure/broken objects after frontend checks pass.
- Priority: High

**Revenue correctness and reconciliation:**
- What's not tested: Duplicate equal-value deals, one deal across multiple touchpoints, invoice-versus-deal-versus-payment totals, refunds/fees, date boundaries, and stable view identities.
- Files: `supabase/migrations/20260306000007_attribution_summary_view.sql`, `src/components/atomic-crm/attribution/attributionTriggers.test.ts`, `src/components/atomic-crm/attribution/ChannelPerformance.tsx`
- Risk: Dashboards present plausible but materially wrong revenue evidence.
- Priority: High

**Edge Function integration:**
- What's not tested: Auth middleware plus service-role authorization, cross-user access, transactionality, storage cleanup, CORS, and structured error responses in a running Supabase environment.
- Files: `supabase/functions/_shared/authentication.ts`, `supabase/functions/_shared/supabaseAdmin.ts`, `supabase/functions/merge_contacts/index.ts`, `supabase/functions/users/index.ts`
- Risk: Privileged functions bypass RLS or leave partial state without detection.
- Priority: High

**Route and responsive billing access:**
- What's not tested: Dead invoice/project links, resource registration, mobile availability, role visibility, loading/error states, and offline mutation behavior.
- Files: `src/components/atomic-crm/layout/Header.tsx`, `src/components/atomic-crm/root/CRM.tsx`
- Risk: Billing appears available in navigation but fails or behaves differently across devices.
- Priority: Medium

**Test-suite assertion reliability:**
- What's not tested: Many promise assertions in the FakeRest adapter are not awaited, so failures can be misreported by the runner.
- Files: `src/components/atomic-crm/providers/fakerest/internal/supabaseAdapter.spec.ts`
- Risk: Provider regressions can escape as the test framework tightens hanging-assertion behavior.
- Priority: Medium

---

*Concerns audit: 2026-08-20*
