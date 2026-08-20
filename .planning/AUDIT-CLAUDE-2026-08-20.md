# Claude Pre-Roadmap Audit — RC Digital Billing Operations

**Date:** 2026-08-20  
**Reviewer:** Claude Sonnet through the fail-closed local bridge  
**Mode:** Read-only; no connector, account, repository, deployment, or customer
state mutation  
**Verdict:** READY WITH REQUIRED EDITS

## Scope

Claude independently read `AGENTS.md`, `.planning/PROJECT.md`, all seven
`.planning/codebase/` documents, the Innovate synthesis, and relevant source,
migration, test, CI, and provider files. The audit verified codebase-map claims
against live files rather than assuming the planning documents were correct.

## Verified P0 Prerequisites

1. Money is currently represented as PostgreSQL `numeric(15,2)` and JavaScript
   `number`, with competing line-item shapes between SQL and TypeScript
   (`supabase/migrations/20260305000004_add_invoices_table.sql`,
   `src/components/atomic-crm/invoices/invoiceCalculations.ts`).
2. Invoices are hard-deletable mutable rows with no append-only payment,
   refund, dispute, allocation, provider-event, or status history
   (`supabase/migrations/20260305000004_add_invoices_table.sql`).
3. The current `attachments` storage bucket is public and unsuitable for
   contracts, revenue statements, receipts, or dispute evidence
   (`supabase/migrations/20240730075029_init_db.sql`).
4. Legacy companies, contacts, deals, notes, tasks, tags, imports, and
   configuration include broadly permissive RLS policies; these records cannot
   safely anchor unattended billing until tenancy is hardened
   (`supabase/migrations/20240730075029_init_db.sql` and later migrations).
5. `convert_lead_to_contact` is an unsafe precedent: a `SECURITY DEFINER`
   function without caller ownership binding that also targets columns removed
   by later migrations
   (`supabase/migrations/20260306000004_lead_conversion_function.sql`).
6. No payment provider SDK, verified webhook intake, provider-account mapping,
   event inbox, reconciliation engine, billing roles, or durable queue exists.
7. Current migration/security tests mainly inspect SQL strings rather than
   applying migrations and exercising policies/functions under real JWT claims
   (`src/components/atomic-crm/leads/securityChecklist.test.ts`).
8. CI couples database push, function deployment, frontend build, and public
   deployment without the independent financial migration and rollout gates
   required by the project constraints (`.github/workflows/deploy.yml`).
9. The production dependency audit reported one critical, eight high, and
   twelve moderate vulnerabilities; payment-facing work must not expand this
   attack surface before remediation and a reproducible blocking check exist.

## Required Roadmap Ordering

- Executable database integration tests and blocking CI gates precede new
  money-bearing schema or privileged endpoints.
- RLS/RBAC/automation-principal hardening precedes agreements, invoices,
  evidence, portal access, and financial automation.
- Private evidence storage precedes every upload or customer-portal document
  workflow.
- Integer minor units and deterministic rounding precede calculations and
  provider charges.
- Durable idempotent provider intake precedes unattended billing.
- Reconciliation precedes collections automation.
- Operator controls, observability, kill switches, backup/restore tests, and
  shadow evidence precede live unattended collection.

## Required Requirement Edits

- Make residual PCI/Nacha/ACH authorization, notification, record-retention,
  provider-oversight, and related compliance duties explicit.
- Separate operator safety controls, observability/alerting, and disaster
  recovery into independently verifiable requirements.
- Define what autonomy-promotion evidence begins accumulating in shadow mode.
- Treat GoCardless versus Stripe as a sandbox decision spike rather than a live
  provider decision already made.
- Encode the audit's dependency order in `PROJECT.md` so a roadmapper cannot
  parallelize unsafe work.

## GSD Profile Assessment

Claude found the proposed workflow appropriate: YOLO applies to the build
workflow, while the product itself remains fail-closed; fine-grained phases,
safe parallelism, research, plan checking, post-build verification, and full PR
evidence are load-bearing for this project. The required adjustment was to make
safe parallelism a literal dependency graph rather than an informal intention.

## Disposition

The required edits above were incorporated into `.planning/PROJECT.md` before
requirements and roadmap creation. The provider recommendation remains a
sandbox hypothesis backed by the separate Innovate evidence bundle; the audit
correctly prevents that hypothesis from becoming a live integration decision
without a dedicated comparison phase.
