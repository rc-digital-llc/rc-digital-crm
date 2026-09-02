# Phase 2: Tenant, Role, and Evidence Security - Research

**Researched:** 2026-09-01
**Domain:** Supabase/PostgreSQL multi-tenant authorization, private evidence, and React Admin account management
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Organization and Billing-Account Boundary

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

#### Roles and Human Access

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

#### Automation Principals and Privileged Commands

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

#### Private Evidence and Redaction

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

#### User Experience and Verification

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

### Deferred Ideas (OUT OF SCOPE)

- Agreement contents and lifecycle (Phase 4).
- Revenue evidence submission/review workflow beyond the secure object
  foundation (Phase 4).
- Invoice calculation, issuance, and customer-safe invoice packages (Phases 3,
  4, and 5).
- Provider commands, payment identities, and live amount authorization (Phase
  5).
- Customer portal authentication and dispute UI (Phase 8).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WORK-01 | Manage customer name, billing status, responsible owner, and billing-contact details. | First-class `billing_accounts` resource, nested contacts, and responsive CRUD pattern. |
| SEC-01 | Explicit organization/account ownership enforced by RLS for every billing resource. | Normalized boundary tables, private capability helpers, default-deny policies, and existing-invoice backfill. |
| SEC-02 | Real two-tenant denial proof for every actor and signed link. | Extend the Phase 1 local Auth/PostgREST/pgTAP/function harness with a reusable principal/resource matrix. |
| SEC-03 | Least-privilege separated billing roles. | Immutable role-capability catalog plus scoped assignments and admin-only assignment mutation. |
| SEC-04 | Narrow automation grants. | Auth-bound automation principals plus command/account/provider/policy/action/amount limits consumed atomically by privileged RPCs. |
| SEC-05 | Private, quarantined, retained, logged evidence. | Private bucket, server-generated paths, signed upload/download commands, quarantine state machine, retention/hold fields, and access events. |
| SEC-06 | Caller/tenant-bound privileged code with locked `search_path`. | Private `SECURITY DEFINER` helpers, schema-qualified names, explicit execute grants, and catalog tests. |
| SEC-07 | Redacted logs, telemetry, exports, and support views. | Recursive server redaction helper, allowlisted UI exporter/view, safe error bodies, and negative secret/token tests. |
</phase_requirements>

## Summary

The current application has an authenticated-user model but not a billing
tenant model. Most original CRM tables use permissive `USING (true)` policies,
while invoices use salesperson ownership; browser access is a binary
administrator/user presentation check. The existing `attachments` bucket is
public and its authenticated storage policies are not account-scoped. Phase 1
did establish the right executable foundation: clean/upgrade migration lanes,
real pgTAP and Auth/PostgREST tests, a running Edge Function lane, secret and
bundle gates, and staged release receipts. [VERIFIED: codebase]

Phase 2 should build a separate billing authorization substrate without
rewriting unrelated CRM ownership. Use one production RC Digital organization,
explicit billing accounts, scoped human role assignments, optional
Auth-bound customer contacts, and Auth-bound automation principals. Put
membership lookup helpers in a non-exposed private schema, lock every definer's
`search_path` to empty, qualify all referenced objects, revoke default PUBLIC
execution, and test the catalog plus live behavior. Supabase and PostgreSQL both
document these controls, including the fact that service-role clients bypass
RLS and therefore must re-establish caller/tenant authority inside privileged
commands. [CITED: https://supabase.com/docs/guides/database/postgres/row-level-security]
[CITED: https://www.postgresql.org/docs/17/sql-createfunction.html]

Financial evidence needs a new private bucket rather than reuse of the public
CRM attachment bucket. Direct authenticated object operations should have no
policy; an authenticated Edge Function should create exact server-owned object
paths, issue signed upload/download capabilities, and persist access outcomes.
Objects remain quarantined until an authorized inspection command records a
clean result. A production malware engine can attach to this seam later, but no
customer upload may be enabled while that engine is absent. [CITED:
https://supabase.com/docs/guides/storage/buckets/fundamentals] [CITED:
https://supabase.com/docs/guides/storage/security/access-control]

**Primary recommendation:** implement the database authorization kernel and
two-tenant test registry first, then evidence commands, then the responsive
billing-account UI and allowlisted export/redaction surfaces.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Tenant/account identity | Database | Auth | PostgreSQL must derive accessible rows from `auth.uid()` and stored assignments; the browser cannot author identity. [VERIFIED: codebase; CITED: Supabase RLS docs] |
| Human role assignment | Database | React Admin UI | RLS and immutable capability rows enforce access; UI provides admin workflows only. [VERIFIED: codebase] |
| Automation authorization | Database/RPC | Edge Function | The grant check and bounded action effect must share a database transaction; Edge authenticates and routes requests. [VERIFIED: codebase] |
| Evidence object bytes | Supabase Storage | Edge Function/Database | Storage owns bytes; metadata, quarantine, retention, and access decisions remain relational and audited. [CITED: Supabase Storage docs] |
| Signed evidence access | Edge Function | Database/Storage | The server validates purpose and caller, records the attempt, then asks Storage for a short-lived capability. [CITED: https://supabase.com/docs/guides/storage/serving/downloads] |
| Billing-account workflow | Browser/React Admin | PostgREST | Standard CRUD goes through the existing provider contract while RLS remains authoritative. [VERIFIED: codebase] |
| Redaction/export safety | Server and UI boundary | Database view | Emit only allowlisted fields; never sanitize secrets after they have already entered broad logs/exports. [CITED: OWASP ASVS v5 V16] |
| Cross-tenant proof | Local Supabase test environment | Vitest/pgTAP | Real JWT, REST, RPC, Storage, and Edge behavior is already executable in Phase 1 lanes. [VERIFIED: codebase] |

## Standard Stack

### Core

| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| PostgreSQL | 15 project target | Tables, RLS, constraints, triggers, definer helpers, audit append-only rules | Already configured in `supabase/config.toml`; RLS is the authoritative data boundary. [VERIFIED: codebase] |
| Supabase CLI | CI 2.115.0; local 2.112.0 | Clean/upgrade migration, local Auth/PostgREST/Storage/Functions, pgTAP | Phase 1 pins CI and supplies the runner. [VERIFIED: codebase/environment] |
| Supabase JS | Deno `jsr:@supabase/supabase-js@2`; browser resolves 2.90.1 | Authenticated Edge clients, admin Storage signing, existing browser provider | Already used by repository adapters and functions. [VERIFIED: codebase/lockfile] |
| React / ra-core | React 19.1.x / ra-core 5.14.x | Responsive account resource and CRUD controls | Existing application composition and resource contract. [VERIFIED: package.json] |
| Tailwind / shadcn-admin-kit | Tailwind 4.1.x / repository-owned | Existing design tokens and accessible UI primitives | `components.json` is initialized with the new-york/radix/lucide setup. [VERIFIED: codebase and `npx shadcn info`] |
| Vitest / pgTAP | Vitest 3.2.4 / local Supabase extension | HTTP/Edge orchestration and transactional SQL assertions | Existing Phase 1 gates already execute both. [VERIFIED: codebase] |

### Supporting

| Component | Purpose | When to Use |
|-----------|---------|-------------|
| Existing `AuthMiddleware` + `UserMiddleware` | Verify Bearer JWT and resolve the Auth user for Edge Functions. [VERIFIED: codebase] | Every human or automation evidence command. |
| Existing release-lane runner | Start isolated local Supabase/Functions and redact process output. [VERIFIED: codebase] | All Phase 2 database, REST, Storage, and Edge acceptance tests. |
| Build-gate `surface_gate.py` | Rendered responsive and deployment-freshness receipts. [VERIFIED: local build-gate skill] | Source, immutable preview, and production account-management routes. |

No external package installation is required. Use platform capabilities and
repository-owned test/UI infrastructure. [VERIFIED: codebase]

## Package Legitimacy Audit

Not applicable: Phase 2 adds no third-party package. The official shadcn
registry is already configured and no third-party registry block is required.
[VERIFIED: `components.json` and `npx shadcn info`]

## Recommended Data and Capability Model

| Object | Required fields/behavior | Access contract |
|--------|--------------------------|-----------------|
| `billing_organizations` | UUID, name, status, timestamps | Members/contacts may see their organization; only billing admins mutate. |
| `billing_accounts` | UUID, organization UUID, optional CRM company, customer name, status, timestamps | Admin/operator manage scoped accounts; reviewer/auditor read; customer sees only own account row; automation has no direct table policy. |
| `billing_account_owners` | account, responsible `sales` user, active/effective dates | Admin/operator manage; read follows account. Keeping ownership separate avoids exposing role-assignment internals in the account row. |
| `billing_contacts` | account, name, email, phone, preferred method, optional Auth user, active/effective dates | Admin/operator manage; bound customer reads own row/account only. |
| `billing_role_capabilities` | immutable role/capability seed | Authenticated users read only through helpers; no client mutation grants. |
| `billing_role_assignments` | organization, optional account, `sales_id`, role, validity, disabled reason | Billing admin assigns; user may inspect their own effective assignments; audit trigger records changes. |
| `billing_automation_principals` | organization, Auth user binding, name, status | Billing admin manages; automation cannot self-edit. |
| `billing_automation_grants` | principal, account, command, provider ref, policy version, action, amount/action limits, validity | Billing admin manages; privileged RPC consumes; no generic direct command authority. |
| `billing_evidence_objects` | org/account, bucket/path, purpose/kind, original metadata, byte size, hash, quarantine/inspection/retention/hold state | Metadata through account capabilities; bytes only through server-issued capabilities. |
| `billing_evidence_access_events` | actor/principal, org/account/evidence, purpose, result, reason, expiry, timestamp | Append-only; reviewer/auditor/admin read; no client update/delete. |
| `billing_audit_events` | actor type/id, org/account, action, subject, result, reason, allowlisted details, timestamp | Append-only; auditor/admin read; no secrets or object capabilities. |

This is a table-driven RBAC/ABAC hybrid: role capabilities answer what a human
may do, assignments answer where they may do it, and resource attributes supply
the organization/account being protected. Automation is deliberately separate
and command-oriented. [VERIFIED: requirements/context]

## Architecture Patterns

### System Architecture Diagram

```text
Human browser ──Supabase JWT──┐
                              ├─> PostgREST ─> RLS ─> billing rows
Automation ───Supabase JWT────┘                    │
         │                                         └─> append-only audit
         └─> Edge command ─> caller-bound RPC ─> exact account/grant/action

Evidence upload request
  └─> authenticated Edge Function
       ├─> begin-upload RPC (membership + account + quarantine row + audit)
       └─> private Storage signed upload capability for server-owned path

Evidence download request
  └─> authenticated Edge Function
       ├─> authorize-access RPC
       │    ├─ denied/quarantined/expired/held -> safe denial + audit
       │    └─ allowed -> access-event row
       └─> private Storage signed URL (60 seconds; never logged)
```

### Pattern 1: Private capability helpers for RLS

Use a private schema and `SECURITY DEFINER` membership helpers to avoid recursive
RLS. Set `search_path = ''`, schema-qualify all objects and functions, revoke
PUBLIC execution, and grant only the helper calls required by `authenticated`.
Supabase documents this exact approach for role lookup helpers. [CITED:
https://supabase.com/docs/guides/database/postgres/row-level-security]

```sql
create function private.billing_has_capability(
  target_organization uuid,
  target_account uuid,
  required_capability text
) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.billing_role_assignments as assignment
    join public.billing_role_capabilities as capability
      on capability.role = assignment.role
    join public.sales as actor on actor.id = assignment.sales_id
    where actor.user_id = (select auth.uid())
      and assignment.organization_id = target_organization
      and (assignment.billing_account_id is null
        or assignment.billing_account_id = target_account)
      and capability.capability = required_capability
      and assignment.disabled_at is null
  )
$$;
```

### Pattern 2: Default-deny plus explicit command policies

Enable and force RLS on every new billing table, grant only necessary DML, and
write command-specific policies with both `USING` and `WITH CHECK`. PostgreSQL
uses default deny when RLS is enabled without an applicable policy; table owners
and BYPASSRLS roles require special care. [CITED:
https://www.postgresql.org/docs/17/ddl-rowsecurity.html]

### Pattern 3: Automation check and effect in one RPC

A future command must not call a generic “authorize” endpoint and then mutate
in a separate browser/Edge request. The RPC that performs the effect must bind
`auth.uid()` to the active automation principal, locate one matching grant,
lock/count the action window when bounded, validate account/provider/policy/
action/amount fields, apply the effect, and append the audit event in the same
transaction. [VERIFIED: context and Phase 1 atomicity contract]

### Pattern 4: Quarantine-first evidence

Generate object paths from server-owned UUIDs, never user filenames. Persist the
metadata row in `quarantined` before upload. Direct bucket policies remain
absent. Only an authorized inspection command may move the row to `clean` or
`rejected`; only `clean`, active, non-expired, non-held rows may be signed for
download. OWASP ASVS v5 requires type/content validation and internally
generated or strictly sanitized paths. [CITED:
https://github.com/OWASP/ASVS/blob/master/5.0/docs_en/OWASP_Application_Security_Verification_Standard_5.0.0_en.flat.json]

### Pattern 5: Safe backfill for existing invoices

Create the default RC Digital organization, backfill administrator organization
assignments, create billing accounts only for companies referenced by existing
invoices, add nullable organization/account columns to invoices, backfill and
validate them, then set NOT NULL and replace salesperson-only RLS. Non-admin
operators receive account-scoped assignments only for accounts whose existing
invoice/company owner matches them. [VERIFIED: codebase]

### Pattern 6: Responsive resource parity

Create a feature-local `billing-accounts/` resource and register it in both
desktop and mobile Admin trees. Reuse ra-core CRUD inputs, cards, badges,
`MobileHeader`, and `MobileContent`. Give mobile its own list/content
composition; do not assume desktop registration reaches the mobile tree.
[VERIFIED: `CRM.tsx` and repository frontend skill]

### Recommended Project Structure

```text
supabase/migrations/
├── *_billing_tenant_roles.sql
├── *_billing_evidence_security.sql
└── *_billing_invoice_boundary.sql
supabase/functions/
├── _shared/billingAuthorization.ts
├── _shared/redaction.ts
└── billing_evidence/index.ts
supabase/tests/database/
├── 30_billing_tenancy.sql
└── 40_billing_evidence.sql
tests/release/
├── billing-tenancy.test.ts
└── billing-evidence.test.ts
src/components/atomic-crm/
├── billing-accounts/
├── providers/fakerest/dataGenerator/billingAccounts.ts
└── types.ts
qa/
└── billing-accounts.surface.*.json
```

### Anti-Patterns to Avoid

- **Client-selected organization/provider identity:** an ID in the request is a
  target to validate, never proof of authority. [VERIFIED: context]
- **Service-role authorization:** a service key identifies the server and
  bypasses RLS; it does not identify the end user. [CITED:
  https://supabase.com/docs/guides/getting-started/api-keys]
- **Public evidence or direct authenticated bucket policy:** path checks alone
  cannot supply quarantine, retention, purpose, or complete access logging.
  [CITED: Supabase Storage docs]
- **Generic authorize-then-act sequence:** it creates a time-of-check/time-of-use
  gap and may exceed action limits under concurrency. [VERIFIED: Phase 1]
- **Editable audit rows or destructive deletes:** they erase authorization
  history. [VERIFIED: context]
- **Default React Admin export for billing data:** it serializes the full record
  shape and violates the allowlist requirement. [VERIFIED: codebase]
- **Copying the public `attachments` flow:** current code uses random filenames,
  public URLs, and broad authenticated policies; it is explicitly unsuitable
  for financial evidence. [VERIFIED: codebase]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Authentication/token cryptography | Custom API keys or JWT verification | Existing Supabase Auth/JWKS middleware | Platform-managed signing and verified user identity already exist. [VERIFIED: codebase] |
| Object capability signing | Custom HMAC URL scheme | Supabase private-bucket signed upload/download methods | Storage binds token, path, and expiration. [CITED: Supabase Storage docs] |
| Authorization in React state | Client permission cache as authority | PostgreSQL RLS and caller-bound RPCs | Client state is bypassable and stale. [CITED: OWASP ASVS v5 V8] |
| Malware scanner | In-process signature list | Quarantine adapter plus a vetted managed scanner before uploads are enabled | Malware engines require maintained signatures, archive handling, and isolation. [CITED: OWASP ASVS v5 V5] |
| Audit secrecy | Redact after dumping full objects | Allowlisted structured events and recursive denylist as defense-in-depth | Sensitive data should not enter logs. [CITED: OWASP ASVS v5 V16] |

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | Existing `invoices` rows have company/sales ownership but no organization/account IDs; companies may exist without billing status. [VERIFIED: migrations] | Expand/backfill/validate/contract migration; never infer accounts for companies without invoices. |
| Live service config | Hosted Supabase row counts and Storage contents were not available in this Codex lane. [VERIFIED: environment boundary] | Protected schema promotion must emit pre/post backfill counts and stop if any invoice remains unmapped. No direct production mutation from development. |
| OS-registered state | No Phase 2 identifier is registered in launchd/system services. [VERIFIED: phase is additive; repository/runtime scan] | None. |
| Secrets/env vars | Existing function environment contains Supabase runtime values and synthetic Postmark fixtures; no malware-scanner credential exists. [VERIFIED: codebase] | Keep scanner integration disabled/fail-closed; add any future scanner secret only to protected server environments. |
| Build artifacts | Phase 1 creates immutable release artifacts and private receipts from protected main. [VERIFIED: codebase/state] | Include new migrations/function/frontend in existing staged release flow and freshness receipts. |

## Common Pitfalls

### RLS recursion and definer exposure

Membership tables protected by policies that query themselves can recurse.
Private definer helpers avoid this, but they become escalation surfaces if they
use an unsafe search path or retain PUBLIC execute. Catalog assertions must
check both properties for every privileged function. [CITED: Supabase RLS docs;
CITED: PostgreSQL CREATE FUNCTION]

### Permissive-policy OR widening

PostgreSQL combines permissive policies with OR. Adding a broad policy beside a
narrow policy silently widens access. Use one explicit policy per command or
restrictive policies where composition is required; tests must enumerate policy
names and live row effects. [CITED: PostgreSQL RLS docs]

### Customer and automation identities share `authenticated`

All Supabase Auth users reach PostgreSQL as `authenticated`; the authorization
model must classify the verified `auth.uid()` as human staff, customer contact,
or automation and prevent automation from receiving generic table access.
[VERIFIED: codebase; CITED: Supabase API key docs]

### Signed URL is a bearer capability

Once issued, a signed link can be used without the caller's JWT until expiry.
Keep expiry at 60 seconds, do not log it, do not cache it, and test that editing
the path cannot reuse the token for another account. [CITED: Supabase Storage
downloads docs]

### Quarantine without a production scanner

A state column alone is not malware protection. This phase may ship the
quarantine and inspection authorization seam while all uploads remain dormant;
customer-facing evidence upload cannot be enabled until a real scanner is
configured and verified. [CITED: OWASP ASVS v5 V5]

### Offline mobile cache and role revocation

The mobile app persists queries for 24 hours. Sensitive billing resources must
not be persisted after logout or permission revocation; either exclude billing
queries from persistence or clear them on auth/role changes. [VERIFIED:
`CRM.tsx`]

### Full-record exports and error logging

React Admin default export and `console.error(error)` may include server fields.
Billing exports require an explicit mapper, and Edge/browser logging should emit
stable operation codes plus redacted details only. [VERIFIED: codebase; CITED:
OWASP ASVS v5 V16]

## Code Examples

### Private storage signed URL

Supabase documents `createSignedUrl(path, expiresIn)` for private assets. Call
it only after the database access decision and never return/store the service
key. [CITED: https://supabase.com/docs/guides/storage/serving/downloads]

```ts
const { data, error } = await supabaseAdmin.storage
  .from("billing-evidence")
  .createSignedUrl(authorized.objectPath, 60);
```

### Locked definer grants

PostgreSQL recommends creating and restricting a definer within one transaction
to avoid a PUBLIC-execute window. [CITED:
https://www.postgresql.org/docs/17/sql-createfunction.html]

```sql
begin;
create function private.billing_has_capability(...) returns boolean
language sql security definer set search_path = '' as $$ ... $$;
revoke all on function private.billing_has_capability(...) from public;
grant execute on function private.billing_has_capability(...) to authenticated;
commit;
```

## State of the Art

| Old/current repository approach | Required Phase 2 approach | Impact |
|---------------------------------|---------------------------|--------|
| `administrator` boolean and salesperson ownership | Explicit scoped billing roles/capabilities | Separates billing administration, operation, review, audit, and customer access. |
| Broad/public attachments | Private server-authorized evidence capabilities | Adds quarantine, retention, access purpose, and auditability. |
| UI `canAccess` as the visible boundary | UI hint plus RLS/RPC authority | Prevents browser bypass from becoming data access. |
| Source-string SQL tests | Live pgTAP + real Auth/REST/RPC/Storage/Edge matrix | Proves actual denial and no side effects. |
| Per-function ad hoc checks | Reusable private capability kernel plus catalog gate | Makes later billing phases inherit one security contract. |

## Assumptions Log

All architecture claims are verified from the repository or cited primary
documentation. No unverified package or compliance assumption is required.

## Open Questions (RESOLVED)

1. **Which production malware-scanning provider will inspect evidence? — RESOLVED for Phase 2**
   - Known: no provider or credential exists; all financial evidence must remain
     quarantined/dormant without one. [VERIFIED: codebase]
   - Recommendation: implement the provider-neutral inspection command and
     deterministic clean/reject tests now; select and verify a managed scanner
     before Phase 8 enables customer uploads.
2. **How many hosted invoices require backfill? — RESOLVED for planning**
   - Known: local migrations define the shape, but hosted counts are unavailable
     in this lane. [VERIFIED: environment boundary]
   - Recommendation: protected promotion records exact before/after counts and
     blocks on unmapped or duplicate company/account relationships.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node | build/tests/scripts | yes | 26.7.0 locally; repository target 22 | Use Node 22 CI/release authority. |
| npm | dependencies/tests | yes | 12.0.2 | CI `npm ci`. |
| Supabase CLI | migrations/local stack | yes | 2.112.0 locally; CI pins 2.115.0 | CI remains authoritative. |
| Docker | local Supabase | yes | client/server 29.6.2 | None required. |
| Python | surface gate | yes | 3.14.6 | None required. |
| Playwright CLI | rendered gate | no standalone binary | build-gate Python dependency must be probed during execution | Install/use the build-gate documented Python Playwright environment; missing browser blocks the receipt. |
| Production scanner | evidence inspection | no | — | Quarantine and keep upload feature dormant. |

**Missing dependency with no fallback for live customer upload:** production
malware scanner. It does not block the Phase 2 security foundation because live
customer evidence upload belongs to Phase 8 and remains disabled.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| SQL framework | pgTAP through `supabase test db` |
| HTTP/function framework | Vitest 3.2.4 against isolated local Supabase/Auth/Storage/Edge |
| Quick run | `npm test -- --run tests/release/billing-security-static.test.ts` |
| Database run | `make test-financial-database-contracts` |
| Function/storage run | `make test-financial-functions` |
| Full phase gate | `make financial-gate && npm run typecheck && npm run lint && npm run build` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| WORK-01 | Account/contact CRUD and responsive resource contract | unit + rendered source | `npm test -- --run src/components/atomic-crm/billing-accounts/billingAccounts.test.ts` | Wave 0 |
| SEC-01 | Explicit columns, constraints, RLS, invoice backfill | pgTAP + clean/upgrade | `make test-financial-database-contracts` | Extend existing |
| SEC-02 | Human/customer/automation/signed-link two-tenant matrix | live HTTP/Storage/Edge | `npm test -- --run tests/release/billing-tenancy.test.ts tests/release/billing-evidence.test.ts` under runner | Wave 0 |
| SEC-03 | Role/capability separation and admin-only assignment | pgTAP + HTTP | `make test-financial-database-contracts` | Wave 0 |
| SEC-04 | Exact automation grant and amount/action denial | pgTAP + RPC concurrency | `make test-financial-database-contracts` | Wave 0 |
| SEC-05 | Private bucket, quarantine, clean access, expiry/hold/access log | Edge/Storage + pgTAP | `make test-financial-functions` | Wave 0 |
| SEC-06 | Caller binding, ownership, empty search path, grants | catalog + live RPC | `make test-financial-database-contracts` | Extend existing |
| SEC-07 | Recursive redaction and allowlisted export/support view | Vitest + pgTAP | `npm test -- --run tests/release/billing-redaction.test.ts` | Wave 0 |

### Sampling Rate

- **Per task commit:** focused Vitest or pgTAP file plus `git diff --check`.
- **Per wave:** affected financial lane and `npm run typecheck`.
- **Phase gate:** all six financial lanes, fast checks, source surface receipt,
  immutable preview receipt, then phase verification.

### Wave 0 Gaps

- [ ] `supabase/tests/support/billing-security-fixtures.sql` — two
  organizations and staff/customer/automation principals.
- [ ] `supabase/tests/database/30_billing_tenancy.sql` — schema, RLS, roles,
  privileged functions, audit immutability.
- [ ] `supabase/tests/database/40_billing_evidence.sql` — storage metadata,
  quarantine, retention, grant limits, access events.
- [ ] `tests/release/billing-tenancy.test.ts` — real Auth/PostgREST/RPC matrix.
- [ ] `tests/release/billing-evidence.test.ts` — running Edge/Storage signed-link
  matrix.
- [ ] `tests/release/billing-redaction.test.ts` — recursive redaction and safe
  response/log/export shapes.
- [ ] `qa/billing-accounts.surface.source.json` plus preview/production
  contracts and receipt directories.

## Security Domain

### Applicable ASVS 5.0 Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V6 Authentication | yes | Supabase Auth + verified JWT/user middleware; no custom credentials. |
| V7 Session Management | yes | Supabase sessions; clear/exclude persisted billing queries after logout or role change. |
| V8 Authorization | yes, primary | Server-side function/data/field access based on explicit entitlement and resource attributes. |
| V5 File Handling | yes, primary | Private storage, generated paths, type/size validation, quarantine and scanner seam. |
| V11 Cryptography | yes | Supabase-managed JWT and signed URL cryptography only; no custom primitives. |
| V14 Data Protection | yes | Minimize support/export/telemetry fields and document retention/hold states. |
| V16 Security Logging/Error Handling | yes | Structured append-only access decisions, secret exclusion, safe consumer errors. |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cross-account IDOR/BOLA | Spoofing/Elevation | RLS and caller-bound RPC re-read organization/account ownership; two-tenant tests. |
| Service-role confused deputy | Elevation | Verified user before admin client; exact target/capability checks; no raw service key in browser. |
| RLS policy recursion or OR widening | Elevation/Disclosure | Private definer helpers, explicit policy inventory, catalog and live tests. |
| Search-path object shadowing | Tampering/Elevation | `search_path = ''`, schema-qualified objects, PUBLIC execute revoked. |
| Signed-link path substitution/leakage | Disclosure | Server-owned paths, 60-second expiry, no logs/cache, tamper tests. |
| Malicious/oversized upload | Tampering/DoS | Size/MIME allowlist, quarantine, inspection result, dormant feature without scanner. |
| Audit modification | Repudiation | Append-only triggers/grants and compensating records. |
| Sensitive payload in logs/export/telemetry | Disclosure | Allowlists, recursive redaction, negative token/credential fixtures. |
| Automation grant replay/race | Elevation/Tampering | Effect-level transactional grant consumption, locking, action-window counters, concurrency tests. |

## Project Constraints (from AGENTS.md)

- Extend the existing React Admin/Supabase CRM; do not create a second app.
- Use the project backend/frontend skills for migrations, RLS, functions,
  providers, React resources, forms, and responsive layouts.
- New tables require RLS; privileged multi-table actions belong in Edge
  Functions or tightly controlled RPCs.
- `canAccess` is presentation only; PostgreSQL/function authorization is
  authoritative.
- New provider methods require Supabase and FakeRest parity.
- Features intended for both surfaces must be registered in desktop and mobile
  Admin trees.
- User deletion is disabled; use account disabling/end dating.
- Do not extend the existing FakeRest circular import.
- Financial UI changes require source, immutable preview, and production
  rendered receipts at the required viewports before readiness/live claims.
- Phase 1's protected financial gates, staged promotion, receipts, and
  non-overridable blockers remain mandatory.

## Sources

### Primary (HIGH confidence)

- `/supabase/supabase` via Context7 — RLS helpers, service-role behavior,
  private buckets, signed upload/download URLs, and Edge authentication.
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/storage/security/access-control
- https://supabase.com/docs/guides/storage/buckets/fundamentals
- https://supabase.com/docs/guides/storage/serving/downloads
- https://supabase.com/docs/guides/functions/auth
- https://www.postgresql.org/docs/17/ddl-rowsecurity.html
- https://www.postgresql.org/docs/17/sql-createfunction.html
- https://github.com/OWASP/ASVS/blob/master/5.0/en/0x17-V8-Authorization.md
- https://github.com/OWASP/ASVS/blob/master/5.0/en/0x25-V16-Security-Logging-and-Error-Handling.md
- https://github.com/OWASP/ASVS/blob/master/5.0/docs_en/OWASP_Application_Security_Verification_Standard_5.0.0_en.flat.json
- Live repository migrations, functions, providers, Phase 1 tests, and release
  policy at commit `a8d3b9295d2059abf18cf5d490530421b596c7b6`.

### Secondary (MEDIUM confidence)

None required.

### Tertiary (LOW confidence)

None.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — current versions and commands are repository/env
  verified; no new package is proposed.
- Architecture: HIGH — locked requirements align with official Supabase,
  PostgreSQL, and OWASP controls.
- Pitfalls: HIGH — most are present in the current code or documented by
  primary sources.

**Research date:** 2026-09-01
**Valid until:** 2026-10-01 for implementation details; re-check Supabase Edge
authentication docs before a later live scanner integration.
