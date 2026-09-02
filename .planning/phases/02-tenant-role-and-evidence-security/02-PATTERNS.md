# Phase 2: Tenant, Role, and Evidence Security - Pattern Map

**Mapped:** 2026-09-01
**Files classified:** 31 planned new/modified files or file groups
**Strong analogs:** 5 code/test families

## File Classification

| New/Modified File or Group | Role | Data Flow | Closest Analog | Match Quality |
|----------------------------|------|-----------|----------------|---------------|
| `supabase/migrations/*_billing_tenant_roles.sql` | migration/model/authorization | CRUD + policy lookup | `20260211194545_app_configuration.sql`; `20260825000001_harden_lead_conversion.sql` | role match; must harden grants beyond first analog |
| `supabase/migrations/*_billing_evidence_security.sql` | migration/model/storage | file I/O + event/audit | `20240730075029_init_db.sql` storage section | partial; current bucket is the anti-pattern to replace |
| `supabase/migrations/*_billing_invoice_boundary.sql` | migration/backfill | batch + CRUD | `20260305000004_add_invoices_table.sql`; Phase 1 upgrade tests | role match |
| `supabase/functions/_shared/billingAuthorization.ts` | service/guard | request-response | `_shared/authentication.ts`, `_shared/getUserSale.ts` | role match |
| `supabase/functions/_shared/redaction.ts` | utility | transform | `scripts/release/run-supabase-lane.mjs#redactText` | role match |
| `supabase/functions/billing_evidence/index.ts` | controller | request-response + file I/O | `supabase/functions/merge_contacts/index.ts` | request/auth match; Storage flow is new |
| `supabase/tests/support/billing-security-fixtures.sql` | test fixture | batch | `supabase/tests/support/auth-fixtures.sql` | exact |
| `supabase/tests/database/30_billing_tenancy.sql` | test | transactional CRUD/RLS | `supabase/tests/database/10_authorization_rls.sql` | exact |
| `supabase/tests/database/40_billing_evidence.sql` | test | storage metadata + RPC | `supabase/tests/database/20_rpc_trigger.sql` | role match |
| `tests/release/billing-tenancy.test.ts` | integration test | Auth/REST/RPC | `tests/release/auth-rls-rpc-trigger.test.ts` | exact |
| `tests/release/billing-evidence.test.ts` | integration test | Auth/Edge/Storage | `tests/release/edge-webhook-provider.test.ts` | role match |
| `tests/release/billing-redaction.test.ts` | unit/contract test | transform | `tests/release/security-gate.test.ts` | role match |
| `Makefile`, `.github/workflows/financial-release-gate.yml` | config/orchestration | batch | existing Phase 1 financial targets/jobs | exact extension |
| `src/components/atomic-crm/billing-accounts/index.tsx` | resource config | CRUD routing | `companies/index.ts` | exact |
| `BillingAccountList.tsx` + mobile content | component | CRUD/list/export | `contacts/ContactList.tsx`; `companies/CompanyList.tsx` | exact composition |
| `BillingAccountCreate.tsx`, `BillingAccountEdit.tsx` | component | CRUD/form | `companies/CompanyCreate.tsx`, `CompanyEdit.tsx` | exact composition |
| `BillingAccountInputs.tsx` | component | CRUD/form | `companies/CompanyInputs.tsx` | exact |
| `BillingAccountShow.tsx` | component | CRUD/detail | `companies/CompanyShow.tsx` | exact composition |
| account contacts/access/automation/evidence panels | component | nested read/mutate | `companies/CompanyShow.tsx` tabs and related records | role match |
| `billingAccounts.test.ts` | unit/contract test | transform/validation | `settings/SettingsPage.test.ts` | role match |
| `src/components/atomic-crm/types.ts` | model | static types | existing domain record types | exact |
| Supabase/FakeRest providers | provider | CRUD/custom request | existing dual-provider implementations | exact extension |
| FakeRest billing generators/types | fixture/model | batch CRUD | `providers/fakerest/dataGenerator/*` | exact |
| Supabase/FakeRest auth presentation | provider/guard | request-response | current `authProvider.ts` + `commons/canAccess.ts` | role match; never authority |
| `root/CRM.tsx` | route/resource config | routing | existing desktop/mobile resource registration | exact extension |
| `qa/billing-accounts.surface.*.json` | QA config | rendered request-response | build-gate surface contract example | exact external contract |

## Pattern Assignments

### Tenant/role migrations (migration, CRUD/RLS)

**Analogs:**

- `supabase/migrations/20260211194545_app_configuration.sql:6-38`
- `supabase/migrations/20260825000001_harden_lead_conversion.sql:57-113`

**Copy:** migration-only schema ownership, explicit `ENABLE ROW LEVEL SECURITY`,
schema-qualified table access, `auth.uid()` caller binding, and
`SECURITY DEFINER SET search_path = ''`.

```sql
create or replace function public.is_admin()
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  return exists (
    select 1 from public.sales where user_id = auth.uid() and administrator = true
  );
end;
$$;
```

```sql
CREATE OR REPLACE FUNCTION public.convert_lead_to_contact(...)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Lead not found or not authorized';
  END IF;
  ...
END;
$function$;
```

**Strengthen for Phase 2:** put recursive membership helpers in `private`, use
`(select auth.uid())`, revoke PUBLIC execute in the same transaction, grant only
the intended signature, force RLS on billing tables, and verify every definer in
the catalog. Do not copy configuration's broad authenticated read policy or its
missing explicit function grant revocation.

### Evidence Edge Function (controller, request-response/file I/O)

**Analog:** `supabase/functions/merge_contacts/index.ts:1-6,79-92,155-180`

**Imports/auth pattern:**

```ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, OptionsMiddleware } from "../_shared/cors.ts";
import { createErrorResponse } from "../_shared/utils.ts";
import { AuthMiddleware, UserMiddleware } from "../_shared/authentication.ts";
```

**Middleware composition pattern:**

```ts
Deno.serve(async (req: Request) =>
  OptionsMiddleware(req, async (req) =>
    AuthMiddleware(req, async (req) =>
      UserMiddleware(req, async (req, user) => {
        // validate method/body, then call a caller-bound operation
      }),
    ),
  ),
);
```

**Error pattern:** catch at the operation boundary, log only a stable redacted
operation label, and return `createErrorResponse` with a safe public message.
Unlike `merge_contacts`, never interpolate a caller ID into raw SQL and never
log the request/error object wholesale.

**New behavior with no local analog:** signed upload/download capability
creation and quarantine finalization. Follow `02-RESEARCH.md` and official
Supabase Storage APIs; no current public-attachment code is suitable.

### Live Auth/RLS tests (integration test, Auth/REST/RPC)

**Analog:** `tests/release/auth-rls-rpc-trigger.test.ts:1-196`

**Environment fail-closed pattern:**

```ts
function localApiConfiguration() {
  expect(apiUrl).toBeTruthy();
  expect(anonKey).toBeTruthy();
  const parsed = new URL(apiUrl!);
  expect(["127.0.0.1", "localhost"]).toContain(parsed.hostname);
  return { apiUrl: parsed.toString().replace(/\/$/, ""), anonKey: anonKey! };
}
```

**Real principal pattern:** sign up through local Auth, log in for a real JWT,
then resolve the server-created `sales` row through REST. Preserve token cleanup
in `afterAll`.

**Denial assertions:** test same-tenant visibility, cross-tenant empty reads,
cross-tenant mutation no-effects, safe RPC errors, unauthenticated/invalid token
denials, and exact final state. Expand the principal union beyond “owner one / 
owner two” to admin, operator, reviewer, auditor, customer, and automation in
two organizations.

### pgTAP authorization/catalog tests (test, transactional CRUD)

**Analog:** `supabase/tests/database/10_authorization_rls.sql:1-180`

**Copy:** wrap every file in `BEGIN`/`ROLLBACK`, declare an exact plan count,
set representative JWT claims, `SET LOCAL ROLE authenticated`, reset the role
between principals, and assert both visibility and unchanged denied targets.

```sql
SELECT set_config('request.jwt.claim.sub', '<fixture-user>', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"<fixture-user>","role":"authenticated"}',
  true
);
SET LOCAL ROLE authenticated;
```

Use catalog assertions for `relrowsecurity`, `relforcerowsecurity`, function
`proconfig`, and ACLs. Add immutability assertions that authenticated callers
cannot update/delete audit or evidence-access events.

### Billing account forms (component, CRUD/form)

**Analogs:**

- `src/components/atomic-crm/companies/CompanyCreate.tsx:1-41`
- `src/components/atomic-crm/companies/CompanyInputs.tsx:1-159`

**Copy:** ra-core `CreateBase`/`EditBase` and `Form`, repository Admin inputs,
cards, a sticky toolbar, `required()` validators, `ReferenceInput` for active
sales users, and `useIsMobile()` to swap two-column/one-column layouts.

```tsx
<Form>
  <Card>
    <CardContent>
      <BillingAccountInputs />
      <div role="toolbar" className="sticky ... justify-end gap-2">
        <CancelButton />
        <SaveButton label="Create billing account" />
      </div>
    </CardContent>
  </Card>
</Form>
```

**Do not copy:** the client-supplied `sales_id` default as account/tenant
authority. The responsible owner is a validated business field; organization
identity remains server-derived.

### Responsive list and safe exporter (component, CRUD/list/transform)

**Analog:** `src/components/atomic-crm/contacts/ContactList.tsx:32-126`

**Copy:** separate desktop `List` and mobile `InfiniteListBase` composition,
explicit empty/loading/error state components, mobile header/content, and a
feature-local exporter function.

**Strengthen:** the billing exporter constructs a new allowlisted object; it
must not spread `...record` as the current contact exporter does at line 136.

### Provider parity (provider, CRUD/custom request)

**Analogs:**

- `src/components/atomic-crm/providers/supabase/dataProvider.ts`
- `src/components/atomic-crm/providers/fakerest/dataProvider.ts`

Standard account CRUD uses the inherited data-provider methods. Add custom
methods only for evidence capability requests or role/automation compound
commands. The method signature belongs in the Supabase-derived
`CrmDataProvider`, and FakeRest must implement a deterministic, no-secret
facsimile. Avoid extending the existing FakeRest auth/dataProvider import cycle.

### Financial lane integration (config/orchestration, batch)

**Analogs:** `Makefile:19-30`, `.github/workflows/financial-release-gate.yml`

Extend existing database and Edge lanes rather than adding optional jobs.
Phase 2 migrations and functions already match financial path classification.
Targeted local commands may be added, but merge-group authority remains the six
existing required check identities.

## Shared Patterns

### Authentication and caller identity

**Source:** `supabase/functions/_shared/authentication.ts`

Apply `OptionsMiddleware -> AuthMiddleware -> UserMiddleware` to every new Edge
command. Bind the returned Auth user to a database membership/contact/automation
principal. A service-role client is only the executor after authorization; it
is never caller identity.

### Safe errors and logging

**Sources:** `_shared/utils.ts`, Phase 1 `redactText`

Return structured 400/401/403/404/405 errors with stable messages. Log a stable
operation code plus redacted allowlisted context. Never log request bodies,
signed capabilities, object paths, provider references, email/phone, JWTs, or
admin-client errors wholesale.

### Transactionality

**Sources:** `merge_contacts` transaction pattern and hardened conversion RPC

Keep grant validation, bounded-action consumption, protected mutation, and
audit append in one database transaction. A separate authorize request is not a
safe analog.

### No destructive lifecycle

**Sources:** project AGENTS and Phase 2 context

Accounts, contacts, assignments, and principals end through status/effective
fields plus a reason. UI and provider code must not expose hard delete.

### Mobile resource registration

**Source:** `src/components/atomic-crm/root/CRM.tsx`

Register `billing_accounts` in both Admin trees with a dedicated mobile list and
responsive detail/edit components. Desktop registration alone is incomplete.

### Surface verification

**Source:** build-gate surface loop

Serve the exact source build and retain a source receipt before PR readiness.
Run the full five-viewport matrix against the immutable preview with a freshness
marker before merge, then an independent production receipt after authorized
release.

## No Analog Found

| File/Behavior | Role | Data Flow | Planner Guidance |
|---------------|------|-----------|------------------|
| `billing_evidence` signed capability controller | controller | authenticated file I/O | Use official Supabase APIs and research contract; current public attachments are an anti-pattern. |
| automation grant consumption kernel | authorization service/RPC | transactional command | Build as a reusable private helper invoked inside effect RPCs; Phase 1 concurrency tests supply the locking/idempotency style. |
| sensitive-query persistence exclusion | client cache policy | state lifecycle | Add an explicit billing-query exclusion/clear path and a focused test; current mobile cache persists all queries. |

## Metadata

**Analog search scope:** `supabase/migrations`, `supabase/functions`,
`supabase/tests`, `tests/release`, `src/components/atomic-crm`, `Makefile`, and
financial workflows.

**Primary analog families:** hardened SQL/RLS, authenticated Edge middleware,
live Auth/PostgREST tests, pgTAP transactions, and responsive React Admin CRUD.

**Pattern extraction date:** 2026-09-01
