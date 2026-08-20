# External Integrations

**Analysis Date:** 2026-08-20

## APIs & External Services

**Supabase Platform:**
- Supabase PostgREST is the production CRUD/query API for CRM resources and database views; the client adapter is `ra-supabase-core` in `src/components/atomic-crm/providers/supabase/dataProvider.ts`.
  - SDK/Client: `ra-supabase-core` plus transitive `@supabase/supabase-js`, instantiated in `src/components/atomic-crm/providers/supabase/supabase.ts`.
  - Auth: browser requests use `VITE_SB_PUBLISHABLE_KEY` and Supabase Auth sessions; the project URL is `VITE_SUPABASE_URL` in `src/components/atomic-crm/providers/supabase/dataProvider.ts`.
- Supabase Edge Functions expose privileged user management, password reset, contact merge, storage cleanup, and inbound email processing from `supabase/functions/users/`, `supabase/functions/update_password/`, `supabase/functions/merge_contacts/`, `supabase/functions/delete_note_attachments/`, and `supabase/functions/postmark/`.
  - SDK/Client: the browser calls functions through `supabase.functions.invoke` in `src/components/atomic-crm/providers/supabase/dataProvider.ts`; functions use `jsr:@supabase/supabase-js@2` in `supabase/functions/_shared/supabaseAdmin.ts`.
  - Auth: client-facing functions manually validate bearer JWTs through `supabase/functions/_shared/authentication.ts`; the Supabase gateway has `verify_jwt = false` for these functions in `supabase/config.toml`.
- Supabase Realtime publishes database changes for core CRM tables in `supabase/migrations/20260305000005_add_realtime.sql`, `supabase/migrations/20260306000005_add_leads_realtime.sql`, and `supabase/migrations/20260306000006_add_touchpoints_table.sql`.
  - SDK/Client: browser channels are created with `supabase.channel(...).on("postgres_changes", ...)` in `src/providers/realtimeProvider.ts`.
  - Consumers: deal and lead list queries are invalidated on changes in `src/components/atomic-crm/deals/DealList.tsx` and `src/components/atomic-crm/leads/LeadList.tsx`.

**Inbound Email:**
- Postmark receives inbound email and POSTs it to the `postmark` Supabase Edge Function; messages become contact notes, missing contacts/companies are created, and attachments are stored in Supabase Storage through `supabase/functions/postmark/index.ts`, `supabase/functions/postmark/addNoteToContact.ts`, and `supabase/functions/postmark/extractAndUploadAttachments.ts`.
  - SDK/Client: no Postmark SDK is used; the integration consumes Postmark's inbound webhook JSON directly in `supabase/functions/postmark/index.ts`.
  - Auth: HTTP Basic credentials from `POSTMARK_WEBHOOK_USER` and `POSTMARK_WEBHOOK_PASSWORD`, plus an `x-forwarded-for` allowlist from `POSTMARK_WEBHOOK_AUTHORIZED_IPS`, are checked in `supabase/functions/postmark/index.ts`.
  - User-facing address: `VITE_INBOUND_EMAIL` displays and copies the configured inbound address in `src/components/atomic-crm/settings/ProfilePage.tsx`.

**Analytics & Telemetry:**
- PostHog captures page views, page exits, autocapture, identified users, and CRM deal/lead/attribution events through `src/providers/posthog.ts`; initialization occurs in `src/main.tsx`.
  - SDK/Client: `posthog-js` `^1.359.0` from `package.json`.
  - Auth: `VITE_POSTHOG_KEY`; `VITE_POSTHOG_HOST` optionally overrides the default US ingestion host in `src/providers/posthog.ts`.
  - Activation: no PostHog calls initialize when `VITE_POSTHOG_KEY` is absent, as enforced in `src/providers/posthog.ts`.
- Atomic CRM sends an anonymous production image request containing the browser hostname to Marmelab telemetry unless the `CRM` `disableTelemetry` prop is set in `src/components/atomic-crm/root/CRM.tsx`.
  - SDK/Client: browser `Image`; no credential is used in `src/components/atomic-crm/root/CRM.tsx`.
- Shadcn Admin Kit contains a separate telemetry endpoint in `src/components/admin/admin.tsx`, but the CRM composition passes `disableTelemetry` to its inner `Admin` in `src/components/atomic-crm/root/CRM.tsx`, so the standard CRM entry path does not emit that second request.
- The documentation site embeds Umami-compatible analytics via an external script tag configured in `doc/astro.config.mjs`.
  - SDK/Client: hosted browser script; the site identifier is static configuration in `doc/astro.config.mjs`.

**Optional Memory Service:**
- Vectorize Hindsight adapter code retains, recalls, reflects on, and bulk-syncs contacts, deals, and leads against a Hindsight HTTP service in `src/components/atomic-crm/providers/hindsight/hindsightClient.ts` and `src/components/atomic-crm/providers/hindsight/SyncMemoryButton.tsx`.
  - SDK/Client: `@vectorize-io/hindsight-client`; it is imported by `src/components/atomic-crm/providers/hindsight/hindsightClient.ts` but is not declared or locked in `package.json` or `package-lock.json`.
  - Endpoint/Auth: `VITE_HINDSIGHT_URL` selects the base URL; no auth credential is configured in `src/components/atomic-crm/providers/hindsight/hindsightClient.ts`.
  - Activation: `VITE_HINDSIGHT_ENABLED` disables only when equal to `false`; the present Hindsight UI components are not imported by the registered CRM resource tree in `src/components/atomic-crm/root/CRM.tsx`.

**Remote Media & Fonts:**
- Contact avatars probe Gravatar and email-domain favicons over unauthenticated HTTPS in `src/components/atomic-crm/providers/commons/getContactAvatar.ts`.
- Company avatars use the unauthenticated `favicon.show` image endpoint in `src/components/atomic-crm/providers/commons/getCompanyAvatar.ts`.
- The SPA loads the Inter web font from Google Fonts through the CSS import in `src/index.css`.

## Data Storage

**Databases:**
- Supabase PostgreSQL 15 is the primary database configured in `supabase/config.toml` and evolved exclusively through migrations in `supabase/migrations/`.
  - Connection: browser access uses `VITE_SUPABASE_URL` and PostgREST, while direct Edge Function SQL optionally uses `SUPABASE_DB_URL` in `supabase/functions/_shared/db.ts`.
  - Client: `ra-supabase-core`/Supabase JS for ordinary data access in `src/components/atomic-crm/providers/supabase/dataProvider.ts`; Kysely plus Deno Postgres for transactional merge logic in `supabase/functions/_shared/db.ts` and `supabase/functions/merge_contacts/index.ts`.
  - Core records: companies, contacts, contact notes, deals, deal notes, sales, tags, and tasks originate in `supabase/migrations/20240730075029_init_db.sql` and are renamed/extended by later migrations under `supabase/migrations/`.
  - Extended records: configuration, projects, project analytics, invoices, leads, lead activities, and attribution touchpoints are defined in `supabase/migrations/20260211194545_app_configuration.sql`, `supabase/migrations/20260305000002_add_projects_table.sql`, `supabase/migrations/20260305000003_add_project_analytics_table.sql`, `supabase/migrations/20260305000004_add_invoices_table.sql`, and `supabase/migrations/20260306000001_add_leads_table.sql` through `supabase/migrations/20260306000008_attribution_triggers.sql`.
  - Query views: `companies_summary`, `contacts_summary`, `init_state`, `channel_attribution_summary`, `lead_source_performance`, and `customer_journeys` are defined in migrations such as `supabase/migrations/20240730075029_init_db.sql`, `supabase/migrations/20240808141826_init_state_configure.sql`, and `supabase/migrations/20260306000007_attribution_summary_view.sql`.

**File Storage:**
- Supabase Storage contains a public `attachments` bucket created in `supabase/migrations/20240730075029_init_db.sql`; authenticated policies govern select/insert/delete operations on its objects.
- Browser note attachments, sales avatars, company logos, and configuration logos upload through `src/components/atomic-crm/providers/supabase/dataProvider.ts` using the shared bucket name from `src/components/atomic-crm/providers/commons/attachments.ts`.
- Postmark email attachments upload server-side through the service-role client in `supabase/functions/postmark/extractAndUploadAttachments.ts`.
- Database triggers invoke `delete_note_attachments` to remove orphaned objects after note deletes or attachment-list changes, using `pg_net` in `supabase/migrations/20260304104600_note_attachments_trigger.sql` and storage deletion in `supabase/functions/delete_note_attachments/index.ts`.

**Caching:**
- No external cache service is configured; desktop react-admin/query state remains in browser memory and ra-core localStorage in `src/components/atomic-crm/root/CRM.tsx`.
- Mobile TanStack Query data is persisted offline-first in browser localStorage for a 24-hour garbage-collection window by `src/components/atomic-crm/root/CRM.tsx`.
- Supabase Auth initialization and the current sales identity are cached in browser localStorage by `src/components/atomic-crm/providers/supabase/authProvider.ts`.
- The PWA service worker caches static build assets according to `vite.config.ts`; this cache does not replace Supabase data caching.

## Authentication & Identity

**Auth Provider:**
- Supabase Auth is the identity provider, wrapped by `supabaseAuthProvider` in `src/components/atomic-crm/providers/supabase/authProvider.ts`.
  - Email/password signup and login are exposed by `src/components/atomic-crm/providers/supabase/dataProvider.ts`, `src/components/atomic-crm/login/SignupPage.tsx`, and `src/components/atomic-crm/login/LoginPage.tsx`.
  - Password resets and invitations are sent through Supabase Auth from `supabase/functions/update_password/index.ts` and `supabase/functions/users/index.ts`; production therefore requires a Supabase SMTP provider as documented in `doc/src/content/docs/developers/supabase-configuration.mdx`.
  - SAML SSO is initiated with `supabase.auth.signInWithSSO` in `src/components/atomic-crm/providers/supabase/authProvider.ts`; the login domain comes from `VITE_GOOGLE_WORKPLACE_DOMAIN` in `src/components/atomic-crm/root/CRM.tsx`.
  - Google Workspace is the documented SAML setup, while Supabase SAML can front other IdPs; provider registration and attribute mapping are described in `doc/src/content/docs/developers/sso.mdx`.
  - OAuth authorization-server consent routes call Supabase Auth OAuth methods from `src/components/atomic-crm/providers/supabase/authProvider.ts` and render through `src/components/supabase/oauth-consent-page.tsx`.
  - Auth users synchronize to CRM `sales` rows through triggers in `supabase/migrations/20240730075425_init_triggers.sql` and `supabase/migrations/20260128165057_sso_handling.sql`.
  - Application authorization maps the `sales.administrator` flag to `admin` or `user` permissions in `src/components/atomic-crm/providers/supabase/authProvider.ts` and `src/components/atomic-crm/providers/commons/canAccess.ts`.

## Monitoring & Observability

**Error Tracking:**
- No dedicated error-tracking service is detected in `package.json`, `src/`, `supabase/functions/`, or `.github/workflows/`.
- React render failures are contained by `react-error-boundary` and the CRM error boundary in `src/components/atomic-crm/misc/CrmErrorBoundary.tsx`; they are not forwarded to an external tracker.

**Logs:**
- Browser integration failures use `console.warn`/`console.error` in `src/providers/posthog.ts`, `src/components/atomic-crm/providers/supabase/dataProvider.ts`, and `src/components/atomic-crm/providers/hindsight/hindsightClient.ts`.
- Edge Functions log operational errors to the Supabase runtime console from handlers under `supabase/functions/`; no log-export SDK is configured in `supabase/functions/`.
- Product analytics is PostHog, not operational error monitoring, and is implemented in `src/providers/posthog.ts`.

## CI/CD & Deployment

**Hosting:**
- The React SPA and FakeRest demo are static GitHub Pages deployments built from `vite.config.ts` or `vite.demo.config.ts` and published by `.github/workflows/deploy.yml`.
- Supabase hosts the PostgreSQL database, Auth, PostgREST, Storage, Realtime, and Edge Functions deployed by `.github/workflows/deploy.yml` and configured through `supabase/config.toml`.
- The Starlight documentation site and shadcn registry publish to GitHub Pages through `makefile`, `doc/astro.config.mjs`, and `.github/workflows/deploy.yml`.

**CI Pipeline:**
- GitHub Actions runs ESLint/Prettier, Vitest, and the production build on pushes and pull requests in `.github/workflows/check.yml`.
- GitHub Actions deploys documentation, registry, demo, Supabase migrations/functions, and the production SPA on main-branch pushes in `.github/workflows/deploy.yml`.
- The deploy workflow skips Supabase mutation when its required secret set is incomplete and emits warnings to the step summary in `.github/workflows/deploy.yml`.

## Environment Configuration

**Required env vars:**
- Browser production data access requires `VITE_SUPABASE_URL` and `VITE_SB_PUBLISHABLE_KEY` in `src/components/atomic-crm/providers/supabase/dataProvider.ts`.
- Supabase Edge Functions require platform-provided `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SB_PUBLISHABLE_KEY`, and `SB_JWT_ISSUER`; direct SQL can use `SUPABASE_DB_URL` in `supabase/functions/_shared/`.
- Postmark webhook processing requires `POSTMARK_WEBHOOK_USER`, `POSTMARK_WEBHOOK_PASSWORD`, and `POSTMARK_WEBHOOK_AUTHORIZED_IPS` in `supabase/functions/postmark/index.ts`.
- Automated Supabase deployment requires `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID`, `SUPABASE_URL`, and `SB_PUBLISHABLE_KEY` as GitHub Actions secrets in `.github/workflows/deploy.yml`.

**Optional env vars:**
- UI and auth options are `VITE_IS_DEMO`, `VITE_INBOUND_EMAIL`, `VITE_GOOGLE_WORKPLACE_DOMAIN`, and `VITE_DISABLE_EMAIL_PASSWORD_AUTHENTICATION`, consumed in `src/components/atomic-crm/root/CRM.tsx`, dashboards, and `src/components/atomic-crm/settings/ProfilePage.tsx`.
- Analytics options are `VITE_POSTHOG_KEY` and `VITE_POSTHOG_HOST` in `src/providers/posthog.ts`.
- Memory-service options are `VITE_HINDSIGHT_URL` and `VITE_HINDSIGHT_ENABLED` in `src/components/atomic-crm/providers/hindsight/hindsightClient.ts`.
- GitHub Pages routing options are `DEPLOY_BRANCH`, `DEPLOY_REPO_URL`, `DEPLOY_REPOSITORY`, and `DEMO_DEPLOY_REPOSITORY` in `scripts/ghpages-deploy.mjs` and `.github/workflows/deploy.yml`.

**Secrets location:**
- Local `.env.development` and `.env.example` files exist at the repository root; their contents are not documented here, and remote initialization writes local production configuration from `scripts/supabase-remote-init.mjs`.
- Repository deployment credentials are read from GitHub Actions Secrets and non-sensitive routing settings from GitHub Actions Variables in `.github/workflows/deploy.yml`.
- Postmark runtime credentials are pushed into the Supabase project secret store by `.github/workflows/deploy.yml` and read only through `Deno.env` in `supabase/functions/postmark/index.ts`.
- Local Supabase Auth points to `supabase/signing_keys.json` through `supabase/config.toml`; the key file's contents are intentionally excluded from this map.

## Webhooks & Callbacks

**Incoming:**
- `POST /functions/v1/postmark` accepts Postmark inbound-email events, validates IP and Basic auth, parses recipients and attachments, and writes CRM records through `supabase/functions/postmark/index.ts`.
- `/auth-callback.html` is the static target for external authentication redirects in `public/auth-callback.html`; React auth callback handling is registered by `src/components/admin/authentication.tsx` and Supabase auth is implemented in `src/components/atomic-crm/providers/supabase/authProvider.ts`.
- Supabase Realtime WebSocket change notifications enter the browser through subscriptions in `src/providers/realtimeProvider.ts`.

**Outgoing:**
- Database note triggers use `pg_net` to POST authenticated cleanup payloads to `/functions/v1/delete_note_attachments` after deletes or attachment changes in `supabase/migrations/20260304104600_note_attachments_trigger.sql`.
- Browser analytics events are sent to PostHog when configured by `src/providers/posthog.ts`; production usage telemetry sends a hostname image request from `src/components/atomic-crm/root/CRM.tsx`.
- Hindsight retain/recall/reflect requests originate from `src/components/atomic-crm/providers/hindsight/hindsightClient.ts` when its adapter is enabled and mounted.
- Supabase Auth sends invitation and password-reset email through its configured SMTP provider from flows in `supabase/functions/users/index.ts` and `supabase/functions/update_password/index.ts`.
- Avatar and media lookups issue browser requests to Gravatar, website favicon endpoints, and `favicon.show` from `src/components/atomic-crm/providers/commons/getContactAvatar.ts` and `src/components/atomic-crm/providers/commons/getCompanyAvatar.ts`.

---

*Integration audit: 2026-08-20*
