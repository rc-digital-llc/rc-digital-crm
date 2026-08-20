# Technology Stack

**Analysis Date:** 2026-08-20

## Languages

**Primary:**
- TypeScript 5.8 (`~5.8.3`) is the application, component, provider, configuration, and test language; compile browser code as strict TS/TSX targeting ES2022 from `src/`, `demo/`, and `tsconfig.app.json`.
- TypeScript on the Supabase Deno runtime implements backend Edge Functions in `supabase/functions/`; keep function imports compatible with `jsr:`, `npm:`, or pinned HTTPS modules as demonstrated in `supabase/functions/_shared/authentication.ts`, `supabase/functions/_shared/db.ts`, and `supabase/functions/postmark/deno.json`.

**Secondary:**
- SQL and PL/pgSQL define the PostgreSQL schema, views, row-level security, database functions, triggers, and Realtime publications under `supabase/migrations/`.
- ECMAScript modules drive repository tooling and deployment scripts in `scripts/generate-registry.mjs`, `scripts/ghpages-deploy.mjs`, and `scripts/supabase-remote-init.mjs`; the package is ESM via `package.json`.
- CSS uses Tailwind CSS directives plus repository-owned design tokens in `src/index.css` and `src/styles/twenty-design-system.css`.
- Astro-flavored Markdown/MDX and HTML provide the documentation site and auth email/static templates in `doc/src/content/docs/`, `supabase/templates/`, `index.html`, and `public/auth-callback.html`.

## Runtime

**Environment:**
- Node.js 22 LTS is the documented development runtime and `.nvmrc` value; use Node 22 for local development and deployment parity with `README.md`, `.nvmrc`, and `.github/workflows/deploy.yml`.
- GitHub Actions checks run Node 20, while deployment runs Node 22; code must remain compatible with both lanes defined in `.github/workflows/check.yml` and `.github/workflows/deploy.yml`.
- Supabase Edge Runtime (Deno) executes `Deno.serve` handlers under `supabase/functions/`; runtime APIs are declared through `jsr:@supabase/functions-js/edge-runtime.d.ts` in files such as `supabase/functions/users/index.ts`.
- PostgreSQL 15 is the configured database engine for the local Supabase stack in `supabase/config.toml`.
- Modern browsers execute the React SPA/PWA; the DOM, Web Crypto, Fetch, localStorage, service worker, and ES2022 APIs are required by `tsconfig.app.json`, `src/components/atomic-crm/providers/commons/getContactAvatar.ts`, and `vite.config.ts`.

**Package Manager:**
- npm is the package manager used by all root scripts, Make targets, and CI jobs in `package.json`, `makefile`, and `.github/workflows/check.yml`.
- Root lockfile: `package-lock.json` is present with lockfile version 3; use `npm ci` in reproducible environments as shown in `.github/workflows/check.yml` and `.github/workflows/deploy.yml`.
- Documentation lockfile: `doc/package-lock.json` is maintained separately for the Astro site declared in `doc/package.json`.
- No npm/package-manager version is pinned through a `packageManager` field in `package.json`; Node 22 supplies the intended npm toolchain through `.nvmrc`.

## Frameworks

**Core:**
- React `^19.1.0` and React DOM `^19.1.0` render the SPA from `src/main.tsx`; application composition begins in `src/App.tsx` and `src/components/atomic-crm/root/CRM.tsx`.
- ra-core `^5.14.2` is the headless admin/application framework for resources, auth, data-provider contracts, forms, routing, cache integration, and local stores in `src/components/atomic-crm/root/CRM.tsx`.
- React Router `^7.13.0` supplies routes and navigation through `src/components/atomic-crm/root/CRM.tsx` and application feature components under `src/components/atomic-crm/`.
- TanStack React Query `^5.90.21` manages server state; the mobile application adds offline-first localStorage persistence with `@tanstack/react-query-persist-client` and `@tanstack/query-async-storage-persister` in `src/components/atomic-crm/root/CRM.tsx`.
- Supabase is the backend platform: PostgREST/data access and Auth are adapted through `ra-supabase-core` `^3.5.2` in `src/components/atomic-crm/providers/supabase/dataProvider.ts` and `src/components/atomic-crm/providers/supabase/authProvider.ts`.
- FakeRest is the browser-only demo backend through `ra-data-fakerest` `^5.10.0` in `src/components/atomic-crm/providers/fakerest/dataProvider.ts` and `demo/App.tsx`.

**UI:**
- Tailwind CSS `^4.1.11` with `@tailwindcss/vite` `^4.1.18` provides styling and build integration in `src/index.css`, `components.json`, and `vite.config.ts`.
- Repository-owned Shadcn Admin Kit and shadcn/ui components live in `src/components/admin/` and `src/components/ui/`; they are mutable source dependencies rather than opaque installed packages, as documented in `AGENTS.md`.
- Radix UI primitives, `radix-ui`, Lucide React, Sonner, Vaul, and `class-variance-authority` implement accessible controls and presentation; versions are declared in `package.json` and wrappers live in `src/components/ui/`.
- Nivo Bar `^0.99.0` renders charts in `src/components/atomic-crm/dashboard/DealsChart.tsx`; `@hello-pangea/dnd` `^18.0.1` powers deal-pipeline drag-and-drop components under `src/components/atomic-crm/deals/`.
- React Hook Form `^7.71.1` supplies form state in feature forms such as `src/components/atomic-crm/settings/ProfilePage.tsx`; Zod `^4.1.12` is available as the schema-validation dependency declared in `package.json`.

**Testing:**
- Vitest `^3.2.4` is the test runner with globals enabled and the `@/*` source alias in `vitest.config.ts`.
- Testing Library DOM assertions come from `@testing-library/jest-dom` `^6.6.3`, initialized by `src/setupTests.js`.

**Build/Dev:**
- Vite `^7.3.0` builds and serves the SPA; production and FakeRest demo builds are separated by `vite.config.ts` and `vite.demo.config.ts`.
- TypeScript `~5.8.3` runs before production builds through the `build` and `build:demo` scripts in `package.json`.
- Vite PWA `^1.2.0` generates an auto-updating service worker using the static manifest at `public/manifest.json`; PWA cache limits are configured in `vite.config.ts`.
- Rollup `^4.59.0` and `rollup-plugin-visualizer` `^6.0.3` produce the browser bundle and `dist/stats.html` through `vite.config.ts`.
- Astro `^5.16.10`, Starlight `^0.36.0`, and Starlight Tailwind `^4.0.1` build the separate documentation site from `doc/package.json` and `doc/astro.config.mjs`.
- ESLint 9, typescript-eslint 8, Prettier 3, Husky 9, and shadcn CLI 3 implement code checks, formatting, hooks, and registry generation through `eslint.config.js`, `.prettierrc.json`, `.husky/pre-commit`, and `package.json`.

## Key Dependencies

**Critical:**
- `ra-core` `^5.14.2` defines the application contracts and resource model used across `src/components/admin/` and `src/components/atomic-crm/`.
- `ra-supabase-core` `^3.5.2` maps react-admin operations to Supabase/PostgREST and wraps Supabase Auth in `src/components/atomic-crm/providers/supabase/`.
- `@supabase/supabase-js` resolves transitively as `2.90.1` through `ra-supabase-core` but is imported directly in `src/components/atomic-crm/providers/supabase/supabase.ts`; add it as a direct dependency before relying on independent versioning.
- `date-fns` resolves transitively as `3.6.0` through `ra-core` but is imported directly throughout `src/components/atomic-crm/dashboard/`, `src/components/atomic-crm/deals/`, and `src/components/atomic-crm/tasks/`; treat the transitive dependency as an explicit manifest requirement when changing dependencies.
- `posthog-js` `^1.359.0` provides optional client analytics initialized from `src/main.tsx` and implemented in `src/providers/posthog.ts`.
- DOMPurify `^3.3.2` and Marked `^17.0.1` sanitize and render note markdown in `src/components/atomic-crm/misc/Markdown.tsx`.
- Papa Parse `^5.5.3`, `jsonexport` `^3.2.0`, and `@streamparser/json-whatwg` `^0.0.22` support CRM import/export flows in `src/components/atomic-crm/contacts/useContactImport.tsx` and `src/components/atomic-crm/misc/useImportFromJson.ts`.

**Infrastructure:**
- Supabase CLI is invoked through `npx` rather than declared in `package.json`; local database, Auth, Storage, Realtime, Studio, Inbucket, migrations, and Edge Functions are orchestrated by `makefile` and `supabase/config.toml`.
- Edge Functions use `jsr:@supabase/supabase-js@2`, `jsr:@panva/jose@6`, Kysely `0.27.2`, Deno Postgres `0.17.0`, and `npm:base64-arraybuffer`, all imported directly from runtime registries in `supabase/functions/_shared/` and `supabase/functions/postmark/`.
- `gh-pages` `^6.3.0` publishes the SPA, documentation, and shadcn registry through `scripts/ghpages-deploy.mjs`, `makefile`, and `.github/workflows/deploy.yml`.
- `execa` is imported directly by `scripts/supabase-remote-init.mjs` but resolves only transitively through the shadcn CLI according to `package-lock.json`; declare it directly before treating the initializer as independently supported tooling.
- `@vectorize-io/hindsight-client` is imported by `src/components/atomic-crm/providers/hindsight/hindsightClient.ts`, but it is absent from `package.json` and `package-lock.json`; the local installation reports `0.4.18` as extraneous, so a clean install cannot typecheck these source files.

## Configuration

**Environment:**
- Required Supabase browser configuration is `VITE_SUPABASE_URL` plus `VITE_SB_PUBLISHABLE_KEY`; the production provider fails fast when either is absent in `src/components/atomic-crm/providers/supabase/dataProvider.ts`.
- Optional browser switches are `VITE_IS_DEMO`, `VITE_INBOUND_EMAIL`, `VITE_GOOGLE_WORKPLACE_DOMAIN`, `VITE_DISABLE_EMAIL_PASSWORD_AUTHENTICATION`, `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`, `VITE_HINDSIGHT_URL`, and `VITE_HINDSIGHT_ENABLED`, consumed in `vite.config.ts`, `src/components/atomic-crm/root/CRM.tsx`, `src/providers/posthog.ts`, and `src/components/atomic-crm/providers/hindsight/hindsightClient.ts`.
- Edge Functions consume Supabase-provided `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SB_PUBLISHABLE_KEY`, `SB_JWT_ISSUER`, and optional `SUPABASE_DB_URL`; Postmark additionally requires `POSTMARK_WEBHOOK_USER`, `POSTMARK_WEBHOOK_PASSWORD`, and `POSTMARK_WEBHOOK_AUTHORIZED_IPS` in `supabase/functions/_shared/` and `supabase/functions/postmark/index.ts`.
- `.env.development` and `.env.example` are present as local environment configuration files; their contents are intentionally not part of this map, and `scripts/supabase-remote-init.mjs` generates `.env.production.local` for linked remote projects.

**Build:**
- `vite.config.ts` configures React, Tailwind, HTML injection, Rollup visualization, PWA generation, relative asset paths, source maps, and the `@` alias.
- `vite.demo.config.ts` selects `demo/main.tsx`, hard-enables FakeRest demo mode, and omits the service-worker plugin used by `vite.config.ts`.
- `tsconfig.json`, `tsconfig.app.json`, and `tsconfig.node.json` separate shared aliases, strict browser compilation, and Node/Vite configuration compilation.
- `components.json` defines shadcn style, CSS, alias, and icon-library settings; `eslint.config.js` and `.prettierrc.json` govern static formatting and lint rules.
- `supabase/config.toml` configures the local API, PostgreSQL 15 database, Auth, Storage, Realtime, Studio, Inbucket, and Edge Function gateway behavior.
- `doc/astro.config.mjs` configures the Starlight documentation base path, Tailwind, navigation, metadata, and documentation analytics.

## Platform Requirements

**Development:**
- Install Make, Node 22 LTS, npm, and Docker before running `make install` or `make start`; Docker hosts the local Supabase/PostgreSQL services described in `README.md` and `makefile`.
- Use the Supabase CLI through `npx supabase` for local startup, database migrations, resets, Edge Function serving, linking, and deployment as defined in `makefile` and `scripts/supabase-remote-init.mjs`.
- Local ports are Vite `5173`, Supabase API `54321`, PostgreSQL `54322`, Studio `54323`, and Inbucket `54324`, configured in `supabase/config.toml` and documented in `README.md`.

**Production:**
- The frontend is a static relative-base SPA/PWA built into `dist/` and published to a GitHub Pages branch by `.github/workflows/deploy.yml` and `scripts/ghpages-deploy.mjs`.
- Backend production targets a hosted Supabase project with migrations and Edge Functions deployed by `.github/workflows/deploy.yml`; database, Auth, Storage, Realtime, and PostgREST remain Supabase-managed.
- Documentation and the generated shadcn registry are built separately and published to GitHub Pages by `makefile`, `doc/astro.config.mjs`, and `.github/workflows/deploy.yml`.

---

*Stack analysis: 2026-08-20*
