<!-- refreshed: 2026-08-20 -->
# Architecture

**Analysis Date:** 2026-08-20

## System Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                 Browser / installable Vite SPA                  │
│             `index.html` → `src/main.tsx` → `src/App.tsx`     │
└─────────────────────────────┬───────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────────┐
│       CRM composition, authentication, routes, resources         │
│             `src/components/atomic-crm/root/CRM.tsx`             │
└──────────────┬───────────────┬───────────────┬───────────────┘
               │               │               │
               ▼               ▼               ▼
┌─────────────┐ ┌─────────────┐ ┌──────────────┐
│ Feature     │ │ Admin/UI    │ │ State/cache  │
│ slices      │ │ primitives  │ │ ra-core +   │
│ `atomic-crm`│ │ `admin`,`ui`│ │ React Query │
└──────┬─────┘ └─────────────┘ └──────┬──────┘
       │                              │
       └───────────────┬──────────────┘
                      ▼
┌────────────────────────────────────────────────────────────┐
│             Replaceable provider boundary                        │
│ `providers/supabase/*` or `providers/fakerest/*`; auth + data    │
└─────────────────────────────┬───────────────────────────────┘
                            │
              ┌────────────────────└────────────────────┐
              ▼                                         ▼
┌────────────────────────┐   ┌────────────────────────┐
│ Supabase platform      │   │ In-browser FakeRest    │
│ REST/Auth/Storage/RT   │   │ generated demo data    │
│ `supabase/migrations`  │   │ `providers/fakerest`   │
└───────────┬────────────┘   └────────────────────────┘
            │
            ▼
┌───────────────────────────────────────────────────────────┐
│ PostgreSQL tables/views/triggers/RLS + Deno Edge Functions        │
│              `supabase/migrations/`, `supabase/functions/`       │
└────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Browser bootstrap | Initializes PostHog, mounts React strict mode, and loads the application root. | `src/main.tsx` |
| CRM composition root | Selects desktop/mobile shells, wraps authentication, registers resources and custom routes, and injects providers. | `src/components/atomic-crm/root/CRM.tsx` |
| Admin framework | Joins ra-core contexts, React Query, routing, authentication, store, theming, and the application layout. | `src/components/admin/admin.tsx` |
| Desktop/mobile layouts | Load remote configuration and provide error, suspense, navigation, and notification boundaries. | `src/components/atomic-crm/layout/Layout.tsx`, `src/components/atomic-crm/layout/MobileLayout.tsx` |
| Feature slices | Own resource screens, forms, filters, and domain-local behavior for contacts, companies, deals, leads, attribution, notes, tasks, and sales. | `src/components/atomic-crm/contacts/`, `src/components/atomic-crm/companies/`, `src/components/atomic-crm/deals/`, `src/components/atomic-crm/leads/` |
| Mutable admin toolkit | Supplies reusable ra-core-aware CRUD controllers and fields; application features consume these instead of raw controller plumbing. | `src/components/admin/` |
| Mutable UI toolkit | Supplies Radix/Shadcn presentation primitives without CRM domain behavior. | `src/components/ui/` |
| Production adapters | Translate ra-core data/auth contracts to Supabase REST, Auth, Storage, RPC, and Functions. | `src/components/atomic-crm/providers/supabase/` |
| Demo adapters | Emulate the production provider contract in-browser, including summary data and lifecycle side effects. | `src/components/atomic-crm/providers/fakerest/` |
| Realtime bridge | Subscribes to table changes and invalidates the matching TanStack Query resource key. | `src/providers/realtimeProvider.ts` |
| Analytics bridge | Initializes PostHog and centralizes CRM event names and payload shapes. | `src/providers/posthog.ts` |
| Database contract | Defines authoritative tables, views, RLS policies, triggers, functions, and realtime publication membership. | `supabase/migrations/` |
| Privileged/transactional backend | Implements user administration, password reset, contact merge, inbound email, and attachment cleanup. | `supabase/functions/` |

## Pattern Overview

**Overall:** Resource-driven, feature-oriented single-page application with ports-and-adapters data access and a managed/serverless Supabase backend (`src/components/atomic-crm/root/CRM.tsx`, `src/components/atomic-crm/providers/`).

**Key Characteristics:**
- Register each CRUD domain as a ra-core `<Resource>` and export its screen descriptor from the feature folder's `index.ts` or `index.tsx`; examples are `src/components/atomic-crm/contacts/index.tsx` and `src/components/atomic-crm/root/CRM.tsx`.
- Keep normal CRUD calls behind `CrmDataProvider`; use the same semantic resource names and custom methods in `src/components/atomic-crm/providers/supabase/dataProvider.ts` and `src/components/atomic-crm/providers/fakerest/dataProvider.ts`.
- Put resource-specific UI, filters, forms, and local helpers together under `src/components/atomic-crm/<feature>/`; shared ra-core UI belongs in `src/components/admin/`, and framework-neutral primitives belong in `src/components/ui/`.
- Model multi-table reads as PostgreSQL views such as `contacts_summary`, `companies_summary`, and attribution views in `supabase/migrations/20240730075029_init_db.sql` and `supabase/migrations/20260306000007_attribution_summary_view.sql`.
- Model privileged or atomic operations as database functions or authenticated Edge Functions, not client-side sequences; examples are `supabase/migrations/20260306000004_lead_conversion_function.sql` and `supabase/functions/merge_contacts/index.ts`.
- Treat desktop and mobile as separate application compositions chosen at the root, with a 768px breakpoint in `src/hooks/use-mobile.ts` and distinct resource sets in `src/components/atomic-crm/root/CRM.tsx`.
- Use React lazy loading at high-cost resource boundaries for deals, leads, and attribution via `src/components/atomic-crm/deals/index.ts`, `src/components/atomic-crm/leads/index.ts`, and `src/components/atomic-crm/attribution/index.ts`.

## Layers

**Bootstrap and Build Layer:**
- Purpose: Produce and mount the browser application and PWA shell.
- Location: `index.html`, `src/main.tsx`, `vite.config.ts`, `public/`.
- Contains: HTML mount point, global CSS import, analytics initialization, Vite plugins, Workbox configuration, and static PWA assets.
- Depends on: React, Vite, Tailwind, PostHog, and the CRM composition in `src/App.tsx`.
- Used by: Browser navigation and production deployments configured by `vercel.json`.

**Application Composition Layer:**
- Purpose: Assemble framework providers, authentication gates, responsive layouts, routes, and resource definitions.
- Location: `src/App.tsx`, `src/components/atomic-crm/root/`, `src/components/admin/admin.tsx`.
- Contains: `<CRM>`, `<Admin>`, desktop/mobile compositions, configuration defaults, i18n, and store setup.
- Depends on: ra-core, React Router, TanStack Query, feature descriptors, and provider ports in `src/components/atomic-crm/providers/`.
- Used by: Every authenticated page and public authentication route registered in `src/components/atomic-crm/root/CRM.tsx`.

**Feature Layer:**
- Purpose: Implement user-facing CRM workflows by domain.
- Location: `src/components/atomic-crm/activity/`, `attribution/`, `companies/`, `contacts/`, `dashboard/`, `deals/`, `leads/`, `notes/`, `sales/`, `settings/`, `tags/`, and `tasks/`.
- Contains: Resource descriptors, list/show/create/edit screens, forms, filters, sheets, Kanban behavior, import/export, and domain helpers.
- Depends on: `src/components/admin/`, `src/components/ui/`, `src/components/atomic-crm/types.ts`, ra-core hooks, and provider methods exposed through context.
- Used by: `<Resource>` and `<CustomRoutes>` declarations in `src/components/atomic-crm/root/CRM.tsx`.

**Application Framework and UI Layer:**
- Purpose: Provide reusable controller-aware CRUD building blocks and low-level visual primitives.
- Location: `src/components/admin/`, `src/components/ui/`, `src/hooks/`, `src/lib/`.
- Contains: List/Edit/Create/Show wrappers, fields, inputs, filters, themes, Shadcn/Radix primitives, shared hooks, and utility functions.
- Depends on: ra-core, React Hook Form, React Router, Radix UI, Tailwind utilities, and `src/lib/utils.ts`.
- Used by: Feature components under `src/components/atomic-crm/`.

**Provider and Infrastructure Layer:**
- Purpose: Preserve one frontend data/auth contract while switching between Supabase and FakeRest implementations.
- Location: `src/components/atomic-crm/providers/supabase/`, `src/components/atomic-crm/providers/fakerest/`, `src/components/atomic-crm/providers/commons/`.
- Contains: DataProvider/AuthProvider implementations, lifecycle callbacks, file upload logic, filter adaptation, activity aggregation, access rules, and merge helpers.
- Depends on: ra-core provider types, Supabase SDK/ra-supabase-core or ra-data-fakerest, plus shared domain types in `src/components/atomic-crm/types.ts`.
- Used by: Defaults in `src/components/atomic-crm/root/CRM.tsx` and demo overrides in `demo/App.tsx`.

**Supabase Backend Layer:**
- Purpose: Persist and protect data, expose REST/Auth/Storage/Realtime, and execute server-side business operations.
- Location: `supabase/migrations/`, `supabase/functions/`, `supabase/config.toml`.
- Contains: PostgreSQL schema, RLS, views, triggers, RPC functions, Edge Function handlers, email templates, and shared authentication/CORS/database helpers.
- Depends on: Supabase platform services, Deno runtime, Postgres, Kysely for transactional contact merge, and Postmark for inbound email.
- Used by: `src/components/atomic-crm/providers/supabase/`, `src/providers/realtimeProvider.ts`, and the direct lead-conversion RPC in `src/components/atomic-crm/leads/LeadConvert.tsx`.

## Data Flow

### Primary Contact List Request Path

1. The desktop application registers `contacts` as a resource with the feature descriptor (`src/components/atomic-crm/root/CRM.tsx:247`, `src/components/atomic-crm/contacts/index.tsx:7`).
2. `ContactList` delegates filtering, paging, sorting, caching, and provider invocation to the shared `<List>`/ra-core `ListBase` controller (`src/components/atomic-crm/contacts/ContactList.tsx:32`, `src/components/admin/list.tsx:53`).
3. The Supabase adapter intercepts `getList("contacts")`, redirects it to `contacts_summary`, and applies `@`-operator full-text filters through lifecycle callbacks (`src/components/atomic-crm/providers/supabase/dataProvider.ts:58`, `src/components/atomic-crm/providers/supabase/dataProvider.ts:288`, `src/components/atomic-crm/providers/supabase/dataProvider.ts:358`).
4. `ra-supabase-core` sends the request to Supabase REST, where the summary view supplies contact fields plus aggregate task/company data under database RLS (`supabase/migrations/20240730075029_init_db.sql:584`, `supabase/migrations/20240730075029_init_db.sql:39`).
5. TanStack Query caches the response; ra-core exposes it through `ListContext`, and the feature renders each record inside a `RecordContextProvider` (`src/components/atomic-crm/contacts/ContactListContent.tsx:30`, `src/components/atomic-crm/contacts/ContactListContent.tsx:80`).

### Deal Kanban Mutation and Realtime Flow

1. The deal list subscribes to the `deals` table and renders provider-backed records grouped by configured stages (`src/components/atomic-crm/deals/DealList.tsx:25`, `src/components/atomic-crm/deals/DealList.tsx:29`, `src/components/atomic-crm/deals/DealListContent.tsx:14`).
2. Drag end updates local grouped state synchronously, emits analytics for a stage change, then calls `updateDealStage` (`src/components/atomic-crm/deals/DealListContent.tsx:35`, `src/components/atomic-crm/deals/DealListContent.tsx:59`, `src/components/atomic-crm/deals/DealListContent.tsx:69`).
3. `updateDealStage` fetches the full affected column or columns and performs the necessary provider updates to maintain indexes (`src/components/atomic-crm/deals/DealListContent.tsx:146`, `src/components/atomic-crm/deals/DealListContent.tsx:220`).
4. Supabase Realtime publishes database changes configured in `supabase/migrations/20260305000005_add_realtime.sql`; the subscription invalidates query key `["deals"]`, causing ra-core to refetch (`src/providers/realtimeProvider.ts:16`, `src/providers/realtimeProvider.ts:29`).

### Configuration and Authentication Flow

1. `<CRM>` creates a namespaced local-storage ra-core store and seeds default/domain configuration under `app.configuration` (`src/components/atomic-crm/root/CRM.tsx:62`, `src/components/atomic-crm/root/CRM.tsx:143`, `src/components/atomic-crm/root/ConfigurationContext.tsx:7`).
2. Login and OAuth callback wrap the auth provider, fetch configuration through the data-provider extension, and save non-empty results before rendering authenticated pages (`src/components/atomic-crm/root/CRM.tsx:165`, `src/components/atomic-crm/root/CRM.tsx:171`, `src/components/atomic-crm/root/CRM.tsx:180`).
3. Each layout runs `useConfigurationLoader`, which refreshes configuration with a five-minute TanStack Query stale window and merges it with defaults (`src/components/atomic-crm/layout/Layout.tsx:10`, `src/components/atomic-crm/root/useConfigurationLoader.ts:11`, `src/components/atomic-crm/root/ConfigurationContext.tsx:23`).
4. Logout clears cached configuration and Supabase identity/initialization caches through the root wrapper and Supabase auth adapter (`src/components/atomic-crm/root/CRM.tsx:197`, `src/components/atomic-crm/providers/supabase/authProvider.ts:83`).

### Privileged Edge Function Flow

1. Provider extensions invoke named functions such as `users`, `update_password`, and `merge_contacts` instead of issuing privileged browser mutations (`src/components/atomic-crm/providers/supabase/dataProvider.ts:105`, `src/components/atomic-crm/providers/supabase/dataProvider.ts:157`, `src/components/atomic-crm/providers/supabase/dataProvider.ts:204`).
2. Function handlers compose OPTIONS, JWT verification, authenticated-user loading, and method dispatch (`supabase/functions/users/index.ts:262`, `supabase/functions/_shared/cors.ts:11`, `supabase/functions/_shared/authentication.ts:35`).
3. User administration checks the caller's associated `sales` record and uses an admin Supabase client only after authorization (`supabase/functions/users/index.ts:266`, `supabase/functions/users/index.ts:69`, `supabase/functions/_shared/supabaseAdmin.ts:4`).
4. Contact merge uses one Kysely transaction, sets the authenticated Postgres role/JWT subject for RLS, reassigns relations, merges fields, and deletes the losing contact atomically (`supabase/functions/merge_contacts/index.ts:79`, `supabase/functions/merge_contacts/index.ts:85`, `supabase/functions/merge_contacts/index.ts:108`).

### Inbound Email Flow

1. Postmark calls the Deno endpoint, which enforces POST, authorized proxy IPs, HTTP Basic authorization, and required message fields (`supabase/functions/postmark/index.ts:26`, `supabase/functions/postmark/index.ts:77`, `supabase/functions/postmark/index.ts:108`).
2. The handler extracts note content and recipients, uploads attachments, and creates or matches contacts before inserting a contact note (`supabase/functions/postmark/index.ts:36`, `supabase/functions/postmark/index.ts:50`, `supabase/functions/postmark/addNoteToContact.ts`).
3. Attachment metadata remains in note JSONB while binary content lives in the Supabase `attachments` bucket (`supabase/functions/postmark/extractAndUploadAttachments.ts`, `src/components/atomic-crm/providers/commons/attachments.ts`).

**State Management:**
- Use ra-core/TanStack Query as authoritative remote-request state; list/show/form controllers in `src/components/admin/` expose context rather than feature-owned fetch state.
- Use the ra-core store for persistent preferences/configuration; the default CRM store is namespaced in `src/components/atomic-crm/root/CRM.tsx`, while the demo uses `memoryStore()` in `demo/App.tsx`.
- Mobile creates an offline-first `QueryClient` and persists it to `localStorage`; desktop uses the query client supplied by ra-core (`src/components/atomic-crm/root/CRM.tsx:266`).
- Keep ephemeral interaction state local to components, such as Kanban grouping in `src/components/atomic-crm/deals/DealListContent.tsx` and attribution tabs/date range in `src/components/atomic-crm/attribution/AttributionDashboard.tsx`.
- Treat PostgreSQL/Supabase as the source of truth for production data and FakeRest's generated in-memory dataset as the source of truth only for `demo/App.tsx`.

## Key Abstractions

**CRM Composition Port:**
- Purpose: Accept provider, auth, store, branding, and domain configuration overrides while preserving one application composition.
- Examples: `src/components/atomic-crm/root/CRM.tsx`, `src/App.tsx`, `demo/App.tsx`.
- Pattern: Dependency injection through component props with production defaults.

**Resource Descriptor:**
- Purpose: Bind a domain name to list/show/create/edit screens and record representation.
- Examples: `src/components/atomic-crm/contacts/index.tsx`, `src/components/atomic-crm/companies/index.ts`, `src/components/atomic-crm/sales/index.ts`.
- Pattern: Feature-local default-exported descriptor consumed by `<Resource>` in `src/components/atomic-crm/root/CRM.tsx`.

**CrmDataProvider:**
- Purpose: Extend standard ra-core CRUD with CRM operations such as sign-up, user management, configuration, activity aggregation, deal unarchive, and contact merge.
- Examples: `src/components/atomic-crm/providers/types.ts`, `src/components/atomic-crm/providers/supabase/dataProvider.ts`, `src/components/atomic-crm/providers/fakerest/dataProvider.ts`.
- Pattern: Port-and-adapters plus `withLifecycleCallbacks` decorators.

**AuthProvider:**
- Purpose: Normalize login, identity, initialization, SSO/OAuth, and role-based access for production and demo modes.
- Examples: `src/components/atomic-crm/providers/supabase/authProvider.ts`, `src/components/atomic-crm/providers/fakerest/authProvider.ts`, `src/components/atomic-crm/providers/commons/canAccess.ts`.
- Pattern: ra-core strategy object with delegated base provider and application-specific guards.

**Configuration Store:**
- Purpose: Merge server-backed tenant configuration with compile-time defaults and expose it through hooks.
- Examples: `src/components/atomic-crm/root/ConfigurationContext.tsx`, `src/components/atomic-crm/root/defaultConfiguration.ts`, `src/components/atomic-crm/root/useConfigurationLoader.ts`.
- Pattern: Persistent ra-core store plus query-backed refresh; despite the filename, `ConfigurationContext.tsx` exposes store hooks rather than a React context provider.

**Database View/Trigger Contract:**
- Purpose: Move cross-table aggregation and invariant maintenance out of UI queries.
- Examples: `supabase/migrations/20240730075029_init_db.sql`, `supabase/migrations/20260127140209_imports.sql`, `supabase/migrations/20260306000008_attribution_triggers.sql`.
- Pattern: SQL views for read models; triggers/functions for derived values and lifecycle invariants.

**Edge Middleware Chain:**
- Purpose: Reuse CORS, JWT verification, authenticated-user resolution, admin client access, and error response formatting.
- Examples: `supabase/functions/_shared/authentication.ts`, `supabase/functions/_shared/cors.ts`, `supabase/functions/_shared/utils.ts`, `supabase/functions/users/index.ts`.
- Pattern: Nested higher-order request handlers around `Deno.serve`.

## Entry Points

**Production Browser Entry:**
- Location: `index.html`, `src/main.tsx`.
- Triggers: Browser loads the Vite-generated HTML document.
- Responsibilities: Provide the `#root` mount, load `src/main.tsx`, initialize PostHog, and render `<App>`.

**Production Application Entry:**
- Location: `src/App.tsx`.
- Triggers: Imported by `src/main.tsx`.
- Responsibilities: Instantiate `<CRM>` with production default providers and configuration.

**Demo Browser Entry:**
- Location: `demo/main.tsx`, `demo/App.tsx`, `vite.demo.config.ts`.
- Triggers: `npm run dev:demo` or `npm run build:demo` from `package.json`.
- Responsibilities: Render the same `<CRM>` composition with FakeRest providers and an in-memory ra-core store.

**CRM Route/Resource Entry:**
- Location: `src/components/atomic-crm/root/CRM.tsx`.
- Triggers: Rendering `<CRM>` from either application entry.
- Responsibilities: Choose responsive composition, enforce authentication, register resources/custom routes, and inject state/data/auth/i18n services.

**Supabase Function Entries:**
- Location: `supabase/functions/users/index.ts`, `supabase/functions/update_password/index.ts`, `supabase/functions/merge_contacts/index.ts`, `supabase/functions/postmark/index.ts`, `supabase/functions/delete_note_attachments/index.ts`.
- Triggers: Supabase Functions HTTP invocation, provider SDK invocation, Postmark webhook, or database webhook.
- Responsibilities: Execute operations requiring authentication, service-role access, transactional SQL, inbound webhook handling, or storage cleanup.

**Database Evolution Entry:**
- Location: `supabase/migrations/`.
- Triggers: Supabase migration up/reset/push commands defined in `makefile`.
- Responsibilities: Materialize the schema, policies, read models, triggers, stored procedures, and realtime publication contract.

## Architectural Constraints

- **Threading:** Frontend code uses the browser event loop and async promises; Supabase Functions are independent Deno requests. The contact-merge database adapter deliberately configures a one-connection pool in `supabase/functions/_shared/db.ts:171`.
- **Responsive composition:** Width below 768px selects a different Admin tree and smaller resource registry, so a feature intended for both surfaces must be registered in both `DesktopAdmin` and `MobileAdmin` in `src/components/atomic-crm/root/CRM.tsx` and supported by `src/hooks/use-mobile.ts`.
- **Global state:** Module-level singletons include the Supabase client in `src/components/atomic-crm/providers/supabase/supabase.ts`, PostHog's imported client in `src/providers/posthog.ts`, FakeRest's provider dataset in `src/components/atomic-crm/providers/fakerest/dataProvider.ts`, and the optional Hindsight client in `src/components/atomic-crm/providers/hindsight/hindsightClient.ts`.
- **Persistent browser state:** Authentication identity/initialization, CRM configuration, mobile query cache, theme, and FakeRest identity use browser storage in `src/components/atomic-crm/providers/supabase/authProvider.ts`, `src/components/atomic-crm/root/CRM.tsx`, and `src/components/atomic-crm/providers/fakerest/authProvider.ts`.
- **Circular imports:** FakeRest has a direct cycle: `src/components/atomic-crm/providers/fakerest/authProvider.ts` imports `dataProvider`, while `src/components/atomic-crm/providers/fakerest/dataProvider.ts` imports `authProvider` and `USER_STORAGE_KEY`. Do not extend this cycle; move shared demo session state to a dependency-free module.
- **Filter dialect:** Frontend filters must use ra-data-postgrest `field@operator` syntax; FakeRest compatibility depends on transformations in `src/components/atomic-crm/providers/fakerest/internal/supabaseAdapter.ts`.
- **Read-model naming:** Production contact/company list and show operations transparently target `contacts_summary` and `companies_summary`, so schema changes must update the views and provider mapping in `src/components/atomic-crm/providers/supabase/dataProvider.ts`.
- **Dual-provider parity:** Any new custom `CrmDataProvider` method or resource lifecycle behavior must have both Supabase and FakeRest implementations in `src/components/atomic-crm/providers/supabase/dataProvider.ts` and `src/components/atomic-crm/providers/fakerest/dataProvider.ts`.
- **Authorization:** Client-side `canAccess` controls presentation only; authoritative access remains in PostgreSQL RLS and Edge Function checks under `supabase/migrations/` and `supabase/functions/`.
- **Mutable dependencies:** `src/components/admin/` and `src/components/ui/` are vendored/mutable source, not opaque packages; customize them directly only for behavior intended to affect all consuming features.

## Anti-Patterns

### Navigation Without Registered Routes

**What happens:** Desktop navigation links to `/projects`, `/project_analytics`, and `/invoices` in `src/components/atomic-crm/layout/Header.tsx`, while `DesktopAdmin` registers no matching resources or custom routes in `src/components/atomic-crm/root/CRM.tsx`; only backend tables exist in `supabase/migrations/20260305000002_add_projects_table.sql`, `supabase/migrations/20260305000003_add_project_analytics_table.sql`, and `supabase/migrations/20260305000004_add_invoices_table.sql`.
**Why it's wrong:** Navigation and the ra-core route registry can drift, producing catch-all/not-found behavior even though database schema exists.
**Do this instead:** Add a feature folder and descriptor under `src/components/atomic-crm/<feature>/`, register its `<Resource>` or `<Route>` in `src/components/atomic-crm/root/CRM.tsx`, then expose the matching link in `src/components/atomic-crm/layout/Header.tsx`.

### Bypassing the Provider Port

**What happens:** Lead conversion calls `supabase.rpc` directly from `src/components/atomic-crm/leads/LeadConvert.tsx`, unlike custom operations routed through `CrmDataProvider` in `src/components/atomic-crm/providers/supabase/dataProvider.ts`.
**Why it's wrong:** Feature code becomes tied to the production adapter, and `demo/App.tsx` cannot provide equivalent behavior through FakeRest.
**Do this instead:** Add a typed `convertLead` method to both provider adapters and call it through `useDataProvider<CrmDataProvider>()`, following `mergeContacts` in `src/components/atomic-crm/providers/supabase/dataProvider.ts` and `src/components/atomic-crm/providers/fakerest/dataProvider.ts`.

### Browser-Orchestrated Multi-Record Transactions

**What happens:** Kanban reordering issues multiple parallel `dataProvider.update` calls from `src/components/atomic-crm/deals/DealListContent.tsx`, so maintaining indexes spans several independent HTTP mutations.
**Why it's wrong:** Partial failure or concurrent edits can leave duplicate/gapped indexes even though local optimistic state appears valid.
**Do this instead:** Implement reorder as one PostgreSQL function or authenticated Edge Function under `supabase/migrations/` or `supabase/functions/`, then expose one typed provider method in `src/components/atomic-crm/providers/supabase/dataProvider.ts` and mirror it in FakeRest.

### Detached Optional Integration Code

**What happens:** `src/components/atomic-crm/providers/hindsight/` and `src/components/atomic-crm/deals/DealInsights.tsx` form an isolated optional integration, but no registered screen imports them and `package.json` does not declare `@vectorize-io/hindsight-client`.
**Why it's wrong:** Treating the directory as a live architectural layer causes build/runtime assumptions that the active application does not satisfy.
**Do this instead:** Keep optional integrations behind a feature entry exported from an active resource screen, declare the SDK in `package.json`, and guard network use through a provider/service boundary such as `src/components/atomic-crm/providers/hindsight/hindsightClient.ts`.

## Error Handling

**Strategy:** Combine framework-level render boundaries, feature-local render boundaries, ra-core notifications, provider exceptions, and structured HTTP errors (`src/components/atomic-crm/layout/Layout.tsx`, `src/components/atomic-crm/misc/CrmErrorBoundary.tsx`, `supabase/functions/_shared/utils.ts`).

**Patterns:**
- Let provider methods throw meaningful `Error` values after logging upstream details; ra-core mutation callbacks display user-facing notifications, as in `src/components/atomic-crm/providers/supabase/dataProvider.ts` and `src/components/atomic-crm/settings/SettingsPage.tsx`.
- Wrap complete layouts with `react-error-boundary` and high-risk feature regions with `CrmErrorBoundary` (`src/components/atomic-crm/layout/Layout.tsx`, `src/components/atomic-crm/attribution/AttributionDashboard.tsx`).
- Use `createErrorResponse` for JSON error bodies and HTTP status codes in authenticated functions (`supabase/functions/_shared/utils.ts`, `supabase/functions/users/index.ts`).
- Treat analytics/config refresh failures as non-critical and keep login operational (`src/components/atomic-crm/providers/supabase/authProvider.ts`, `src/components/atomic-crm/root/CRM.tsx`).
- Return explicit 401/403/405 responses for webhook authentication, invalid bodies, and unsupported methods (`supabase/functions/postmark/index.ts`, `supabase/functions/update_password/index.ts`).

## Cross-Cutting Concerns

**Logging:** Browser and Deno code use `console.warn`/`console.error`; analytics events go through `src/providers/posthog.ts`, while render faults are logged by `src/components/atomic-crm/misc/CrmErrorBoundary.tsx`.

**Validation:** Forms use ra-core validators and React Hook Form in feature input components such as `src/components/atomic-crm/contacts/ContactInputs.tsx`, `src/components/atomic-crm/deals/DealInputs.tsx`, and `src/components/atomic-crm/settings/SettingsPage.tsx`; Edge Functions perform explicit method/header/body validation under `supabase/functions/`.

**Authentication:** Production delegates sessions and SSO/OAuth to Supabase Auth through `src/components/atomic-crm/providers/supabase/authProvider.ts`; UI authorization uses `src/components/atomic-crm/providers/commons/canAccess.ts`, database authorization uses RLS in `supabase/migrations/`, and privileged functions re-verify JWT/user identity in `supabase/functions/_shared/authentication.ts`.

**Caching:** ra-core/TanStack Query owns remote data cache, mobile persistence is configured in `src/components/atomic-crm/root/CRM.tsx`, configuration uses a five-minute stale window in `src/components/atomic-crm/root/useConfigurationLoader.ts`, and Supabase identity/initialization caches live in `src/components/atomic-crm/providers/supabase/authProvider.ts`.

**Observability:** PostHog initialization and event contracts live in `src/providers/posthog.ts`; no separate structured application logger is present outside console output in `src/` and `supabase/functions/`.

**Styling:** Features compose Tailwind utility classes and shared CSS variables from `src/index.css` and `src/styles/twenty-design-system.css`, while reusable widgets live in `src/components/ui/`.

---

*Architecture analysis: 2026-08-20*
