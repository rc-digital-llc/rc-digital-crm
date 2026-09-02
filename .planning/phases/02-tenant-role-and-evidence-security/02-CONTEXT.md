# Phase 2: Tenant, Role, and Evidence Security - Context

**Gathered:** 2026-09-01
**Status:** Ready for research and planning
**Source:** Express-path extraction from the locked roadmap and requirements

<domain>
## Phase Boundary

This phase establishes the reusable authorization and evidence-security
foundation for RC Digital billing. It introduces explicit organizations and
billing accounts, account-scoped human and automation access, separated billing
roles, private evidence metadata and storage access, tenant-safe privileged
commands, and executable two-tenant denial proof.

The operator-facing scope is billing-account administration: customer identity,
billing status, responsible RC Digital owner, authorized billing contacts, and
role/account assignments. This phase also brings every billing table that
already exists into the new boundary and defines mandatory tenant/account
columns and policy helpers for future agreement, evidence, payment, job,
message, and audit tables.

This phase does not implement agreement versioning, revenue-period workflow,
calculation, invoice issuance, payment-provider commands, reconciliation,
collections, or the customer portal. It may create security-ready placeholder
contracts needed by later phases, but it must not enable live money movement or
customer self-service.

</domain>

<decisions>
## Implementation Decisions

### Organization and Billing-Account Boundary

- **D-01:** Every billing-domain row uses immutable organization and billing
  account identifiers where account scope applies. Tenant identity is derived
  from authenticated membership or a server-owned automation grant, never from
  a browser-supplied provider/customer identity.
- **D-02:** A billing account records the customer name, billing status,
  responsible RC Digital owner, and authorized billing contacts required by
  WORK-01. Contacts are account-scoped records with name, email, phone,
  preferred contact method, active state, and an optional authenticated-user
  binding.
- **D-03:** Existing non-billing CRM ownership remains compatible. Phase 2
  secures the billing domain and adapts existing billing tables; it does not
  force a speculative tenant rewrite of unrelated contacts, deals, or tasks.

### Roles and Human Access

- **D-04:** Billing authorization is modeled separately from the legacy
  salesperson administrator flag. The role vocabulary covers billing
  administration, operation, review/approval, audit/read-only, and restricted
  customer access, with explicit capabilities and account scope.
- **D-05:** A person may hold more than one role when explicitly assigned. The
  product exposes role separation and auditable assignments even though the
  currently accepted single-owner operating model may assign multiple roles to
  the same authenticated owner. Automation never inherits that exception.
- **D-06:** Browser `canAccess` behavior only hides or disables presentation.
  PostgreSQL RLS and authenticated server boundaries are the authoritative
  controls for every read and mutation.

### Automation Principals and Privileged Commands

- **D-07:** Automation identities are first-class principals with explicit
  grants for named organizations/accounts, commands, provider-account
  references, policy versions, action kinds, and optional amount/action limits.
  Missing, expired, disabled, or mismatched grants fail closed.
- **D-08:** Privileged database functions and server commands bind the verified
  caller to their target tenant, re-read ownership server-side, lock
  `search_path`, use least-privilege grants, and reject client-controlled
  provider or financial identity.
- **D-09:** Security-relevant role, grant, evidence-access, and privileged
  command activity produces append-only audit records with actor, tenant,
  account, action, result, reason, and timestamp.

### Private Evidence and Redaction

- **D-10:** Contracts, statements, receipts, dispute files, and related evidence
  live in private storage paths owned by the server-side organization/account
  boundary. Direct public buckets and permanent download URLs are prohibited.
- **D-11:** New evidence enters a quarantine state. Only authorized, active
  evidence that has passed the configured inspection decision may receive a
  short-lived access URL. Rejection, retention expiry, and legal/operational
  holds remain explicit states with an access trail.
- **D-12:** Evidence access is mediated by an authenticated server command that
  checks role, membership, account ownership, object state, and requested
  purpose before issuing short-lived access and recording the attempt.
- **D-13:** Logs, telemetry, exports, and support-safe views expose allowlisted
  fields. Secrets, raw credentials, signed URLs/tokens, sensitive provider
  payloads, and unnecessary evidence contents or paths are never emitted.

### User Experience and Verification

- **D-14:** Billing accounts are a first-class React Admin resource with
  desktop and mobile list/detail/create/edit coverage. Forms group account
  identity, billing ownership/status, contacts, and authorized access so an
  operator can understand the boundary before saving.
- **D-15:** Destructive deletion is not part of the workflow. Accounts,
  contacts, memberships, and principals are disabled or ended with an audit
  reason so authorization history remains reproducible.
- **D-16:** Acceptance requires executable local Supabase tests using two real
  tenants and representative operator, reviewer, auditor, customer, and
  automation identities. Tests cover REST/RLS, privileged commands, storage
  object access, short-lived links, cross-tenant mutation denial, and exact
  audit effects; source-string checks alone are advisory.
- **D-17:** The account-management UI must pass the repository's rendered source
  gate at 320px and a wider viewport before a pull request is ready, the full
  five-viewport immutable-preview gate before merge, and an independent
  production receipt after authorized release. Automated accessibility checks
  do not replace manual keyboard or real-device coverage.

### Agent Discretion

The agent may choose normalized table names, capability encoding, migration
split, React component composition, FakeRest fixtures, test helper layout,
quarantine adapter seam, short-lived URL duration within a conservative
documented bound, and support-view allowlists. Those choices may not weaken
explicit account scoping, server-derived identity, role separation, append-only
auditability, private/quarantined evidence, or real two-tenant denial proof.

</decisions>

<canonical_refs>
## Canonical References

**Downstream planning and implementation must read these files.**

### Scope and acceptance contract

- `.planning/PROJECT.md` — core value, fail-closed behavior, evidence privacy,
  least privilege, and the privileged-function anti-pattern fence.
- `.planning/REQUIREMENTS.md` — WORK-01 and SEC-01 through SEC-07; all other
  pending requirements are downstream and outside this phase.
- `.planning/ROADMAP.md` — Phase 2 goal, dependency, observable success
  criteria, and UI hint.
- `.planning/STATE.md` — completed Phase 1 release controls and accepted
  single-owner review risk.

### Phase 1 authority inherited by this phase

- `.planning/phases/01-executable-financial-test-and-release-gate/01-10-SUMMARY.md`
  — protected build, staged promotion, dormant enablement, and receipt model.
- `.planning/phases/01-executable-financial-test-and-release-gate/01-VERIFICATION.md`
  — verified release-gate evidence that Phase 2 must continue to satisfy.
- `docs/financial-release-policy.md` — non-overridable financial checks,
  production approvals, and staged release requirements.
- `supabase/tests/` and `tests/release/` — executable local
  Supabase/Auth/RLS/function harness and Vitest orchestration to extend with
  Phase 2 two-tenant and storage cases.

### Codebase and implementation surfaces

- `AGENTS.md` — project architecture, dual-provider parity, responsive resource
  registration, authorization, and GSD constraints.
- `.claude/skills/backend-dev/SKILL.md` and
  `.claude/skills/frontend-dev/SKILL.md` — repository-specific implementation
  conventions.
- `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/CONCERNS.md`, and
  `.planning/codebase/TESTING.md` — existing authorization hazards, provider
  boundaries, and testing patterns.
- `supabase/migrations/` — authoritative schema, existing invoices, ownership,
  functions, triggers, and RLS policies.
- `supabase/functions/_shared/` and `supabase/functions/` — authentication,
  service-role, logging, and privileged command boundaries.
- `src/components/atomic-crm/root/CRM.tsx` — separate desktop/mobile resource
  registration.
- `src/components/atomic-crm/providers/` — Supabase/FakeRest parity and browser
  access presentation.
- `src/components/atomic-crm/sales/` and
  `src/components/atomic-crm/settings/` — current administrator and user
  management patterns.

</canonical_refs>

<specifics>
## Specific Ideas

- Make the account boundary visible in the operator UI instead of hiding it in
  implicit ownership fields.
- Prefer capability checks backed by normalized assignments/grants over a
  growing set of boolean role columns.
- Keep storage object metadata separate from opaque storage paths, and make an
  access-log row part of the signed-link issuance transaction/command result.
- Build the two-tenant matrix as a reusable registry so later billing resources
  must add cases instead of inventing one-off security tests.

</specifics>

<deferred>
## Deferred Ideas

- Agreement contents and lifecycle (Phase 4).
- Revenue evidence submission/review workflow beyond the secure object
  foundation (Phase 4).
- Invoice calculation, issuance, and customer-safe invoice packages (Phases 3,
  4, and 5).
- Provider commands, payment identities, and live amount authorization (Phase
  5).
- Customer portal authentication and dispute UI (Phase 8).

</deferred>

---

*Phase: 02-tenant-role-and-evidence-security*
*Context gathered: 2026-09-01*
