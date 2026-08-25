# AGENTS.md

## Project Overview

Atomic CRM is a full-featured CRM built with React, shadcn-admin-kit, and Supabase. It provides contact management, task tracking, notes, email capture, and deal management with a Kanban board.

## Development Commands

### Setup

```bash
make install          # Install dependencies (frontend, backend, local Supabase)
make start            # Start full stack with real API (Supabase + Vite dev server)
make stop             # Stop the stack
make start-demo       # Start full-stack with FakeRest data provider
```

### Testing and Code Quality

```bash
make test             # Run unit tests (vitest)
make typecheck        # Run TypeScript type checking
make lint             # Run ESLint and Prettier checks
```

### Building

```bash
make build            # Build production bundle (runs tsc + vite build)
```

### Database Management

```bash
npx supabase migration new <name>  # Create new migration
npx supabase migration up          # Apply migrations locally
npx supabase db push               # Push migrations to remote
npx supabase db reset              # Reset local database (destructive)
```

### Registry (Shadcn Components)

```bash
make registry-gen     # Generate registry.json (runs automatically on pre-commit)
make registry-build   # Build Shadcn registry
```

## Architecture

### Technology Stack

- **Frontend**: React 19 + TypeScript + Vite
- **Routing**: React Router v7
- **Data Fetching**: React Query (TanStack Query)
- **Forms**: React Hook Form
- **Application Logic**: shadcn-admin-kit + ra-core (react-admin headless)
- **UI Components**: Shadcn UI + Radix UI
- **Styling**: Tailwind CSS v4
- **Backend**: Supabase (PostgreSQL + REST API + Auth + Storage + Edge Functions)
- **Testing**: Vitest

### Directory Structure

```
src/
├── components/
│   ├── admin/              # Shadcn Admin Kit components (mutable dependency)
│   ├── atomic-crm/         # Main CRM application code (~15,000 LOC)
│   │   ├── activity/       # Activity logs
│   │   ├── companies/      # Company management
│   │   ├── contacts/       # Contact management (includes CSV import/export)
│   │   ├── dashboard/      # Dashboard widgets
│   │   ├── deals/          # Deal pipeline (Kanban)
│   │   ├── filters/        # List filters
│   │   ├── layout/         # App layout components
│   │   ├── login/          # Authentication pages
│   │   ├── misc/           # Shared utilities
│   │   ├── notes/          # Note management
│   │   ├── providers/      # Data providers (Supabase + FakeRest)
│   │   ├── root/           # Root CRM component
│   │   ├── sales/          # Sales team management
│   │   ├── settings/       # Settings page
│   │   ├── simple-list/    # List components
│   │   ├── tags/           # Tag management
│   │   └── tasks/          # Task management
│   ├── supabase/           # Supabase-specific auth components
│   └── ui/                 # Shadcn UI components (mutable dependency)
├── hooks/                  # Custom React hooks
├── lib/                    # Utility functions
└── App.tsx                 # Application entry point

supabase/
├── functions/              # Edge functions (user management, inbound email)
└── migrations/             # Database migrations
```

### Key Architecture Patterns

For more details, check out the doc/src/content/docs/developers/architecture-choices.mdx document.

#### Mutable Dependencies

The codebase includes mutable dependencies that should be modified directly if needed:

- `src/components/admin/`: Shadcn Admin Kit framework code
- `src/components/ui/`: Shadcn UI components

#### Configuration via `<CRM>` Component

The `src/App.tsx` file renders the `<CRM>` component, which accepts props for domain-specific configuration:

- `contactGender`: Gender options
- `companySectors`: Company industry sectors
- `dealCategories`, `dealStages`, `dealPipelineStatuses`: Deal configuration
- `noteStatuses`: Note status options with colors
- `taskTypes`: Task type options
- `logo`, `title`: Branding
- `lightTheme`, `darkTheme`: Theme customization
- `disableTelemetry`: Opt-out of anonymous usage tracking

#### Database Views

Complex queries are handled via database views to simplify frontend code and reduce HTTP overhead. For example, `contacts_summary` provides aggregated contact data including task counts.

#### Database Triggers

User data syncs between Supabase's `auth.users` table and the CRM's `sales` table via triggers (see `supabase/migrations/20240730075425_init_triggers.sql`).

#### Edge Functions

Located in `supabase/functions/`:

- User management (creating/updating users, account disabling)
- Inbound email webhook processing

#### Data Providers

Two data providers are available:

1. **Supabase** (default): Production backend using PostgreSQL
2. **FakeRest**: In-browser fake API for development/demos, resets on page reload

When using FakeRest, database views are emulated in the frontend. Test data generators are in `src/components/atomic-crm/providers/fakerest/dataGenerator/`.

#### Filter Syntax

List filters follow the `ra-data-postgrest` convention with operator concatenation: `field_name@operator` (e.g., `first_name@eq`). The FakeRest adapter maps these to FakeRest syntax at runtime.

## Development Workflows

### Path Aliases

The project uses TypeScript path aliases configured in `tsconfig.json` and `components.json`:

- `@/components` → `src/components`
- `@/lib` → `src/lib`
- `@/hooks` → `src/hooks`
- `@/components/ui` → `src/components/ui`

### Adding Custom Fields

When modifying contact or company data structures:

1. Create a migration: `npx supabase migration new <name>`
2. Update the sample CSV: `src/components/atomic-crm/contacts/contacts_export.csv`
3. Update the import function: `src/components/atomic-crm/contacts/useContactImport.tsx`
4. If using FakeRest, update data generators in `src/components/atomic-crm/providers/fakerest/dataGenerator/`
5. Don't forget to update the views
6. Don't forget the export functions
7. Don't forget the contact merge logic

### Running with Test Data

Import `test-data/contacts.csv` via the Contacts page → Import button.

### Git Hooks

- Pre-commit: Automatically runs `make registry-gen` to update `registry.json`

### Accessing Local Services During Development

- Frontend: http://localhost:5173/
- Supabase Dashboard: http://localhost:54323/
- REST API: http://127.0.0.1:54321
- Storage (attachments): http://localhost:54323/project/default/storage/buckets/attachments
- Inbucket (email testing): http://localhost:54324/

## Important Notes

- The codebase is intentionally small (~15,000 LOC in `src/components/atomic-crm`) for easy customization
- Modify files in `src/components/admin` and `src/components/ui` directly - they are meant to be customized
- Unit tests can be added in the `src/` directory (test files are named `*.test.ts` or `*.test.tsx`)
- User deletion is not supported to avoid data loss; use account disabling instead
- Filter operators must be supported by the `supabaseAdapter` when using FakeRest

<!-- GSD:project-start source:PROJECT.md -->

## Project

**RC Digital Billing Operations**

RC Digital Billing Operations extends the existing RC Digital CRM into the
system of record for customer agreements, monthly revenue evidence,
commission and minimum-support calculations, invoices, payment status,
reconciliation, and collections follow-up. It serves RC Digital operators and
future staff, with a restricted customer portal for billing contacts to submit
revenue evidence, review invoices, establish hosted payment authorization, and
raise disputes.

Normal billing work should run without a human in the loop. The first
production policy is fail-closed: routine, provable operations proceed
automatically, while ambiguous or financially irreversible exceptions pause
with durable evidence until an authorized operator resolves them.

**Core Value:** Every dollar billed and collected is automatically traceable to the applicable
agreement version, verified revenue evidence, deterministic calculation,
invoice, payment-provider event, settlement, and collections history.

### Constraints

- **Brownfield architecture**: Extend `rc-digital-crm` and its established
  React Admin/Supabase provider patterns — do not create a second CRM.

- **Payment scope**: Hosted providers own payment credentials, mandates, ACH or
  card origination, fraud controls, returns, disputes, and settlement.

- **Residual compliance**: Hosted collection reduces sensitive-data scope but
  does not remove RC Digital's duties for authorization proof, notifications,
  provider oversight, record retention, and applicable ACH/card rules.

- **Autonomy**: Routine operations may run unattended only when preconditions,
  evidence, policy version, idempotency, and reconciliation invariants pass.

- **Fail-closed exceptions**: Unverified revenue, changed agreements, anomalous
  calculations, provider mismatches, disputes, refunds/write-offs, legal holds,
  and service suspension pause for authorized review in the initial release.

- **Financial precision**: Store money as integer minor units with explicit
  currency; never use floating-point arithmetic for balances or charges.

- **Auditability**: Financial facts and state transitions are append-only or use
  compensating records; issued invoices and calculation snapshots are immutable.

- **Security**: Enforce least privilege at PostgreSQL RLS and server boundaries;
  browser visibility controls are not authorization.

- **Evidence privacy**: Contracts, statements, receipts, and dispute documents
  live in private storage with short-lived access, retention, and access logs.

- **Reliability**: Provider intake is signature-verified, replay-safe,
  idempotent, order-tolerant, and durable before acknowledgement.

- **Deployment**: Introduce schema and provider behavior with expand-contract
  migrations, shadow mode, feature flags, kill switches, and independently
  verifiable rollout stages.

- **Anti-pattern fence**: Payment code must not copy existing unsafe precedents:
  no `SECURITY DEFINER` function without caller/tenant ownership checks and
  locked `search_path`; no client-controlled provider identity; no webhook
  acknowledgement before durable verified intake; no non-transactional
  side-effect chain; no duplicate/replay acceptance; and no swallowed error
  reported as success.

- **Initial market**: USD and US payment rails first.
- **Budget**: Prefer usage-based, low-fixed-cost infrastructure while preserving
  provider portability and an accounting-system integration path.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->

## Technology Stack

## Languages

- TypeScript 5.8 (`~5.8.3`) is the application, component, provider, configuration, and test language; compile browser code as strict TS/TSX targeting ES2022 from `src/`, `demo/`, and `tsconfig.app.json`.
- TypeScript on the Supabase Deno runtime implements backend Edge Functions in `supabase/functions/`; keep function imports compatible with `jsr:`, `npm:`, or pinned HTTPS modules as demonstrated in `supabase/functions/_shared/authentication.ts`, `supabase/functions/_shared/db.ts`, and `supabase/functions/postmark/deno.json`.
- SQL and PL/pgSQL define the PostgreSQL schema, views, row-level security, database functions, triggers, and Realtime publications under `supabase/migrations/`.
- ECMAScript modules drive repository tooling and deployment scripts in `scripts/generate-registry.mjs`, `scripts/ghpages-deploy.mjs`, and `scripts/supabase-remote-init.mjs`; the package is ESM via `package.json`.
- CSS uses Tailwind CSS directives plus repository-owned design tokens in `src/index.css` and `src/styles/twenty-design-system.css`.
- Astro-flavored Markdown/MDX and HTML provide the documentation site and auth email/static templates in `doc/src/content/docs/`, `supabase/templates/`, `index.html`, and `public/auth-callback.html`.

## Runtime

- Node.js 22 LTS is the documented development runtime and `.nvmrc` value; use Node 22 for local development and deployment parity with `README.md`, `.nvmrc`, and `.github/workflows/deploy.yml`.
- GitHub Actions checks run Node 20, while deployment runs Node 22; code must remain compatible with both lanes defined in `.github/workflows/check.yml` and `.github/workflows/deploy.yml`.
- Supabase Edge Runtime (Deno) executes `Deno.serve` handlers under `supabase/functions/`; runtime APIs are declared through `jsr:@supabase/functions-js/edge-runtime.d.ts` in files such as `supabase/functions/users/index.ts`.
- PostgreSQL 15 is the configured database engine for the local Supabase stack in `supabase/config.toml`.
- Modern browsers execute the React SPA/PWA; the DOM, Web Crypto, Fetch, localStorage, service worker, and ES2022 APIs are required by `tsconfig.app.json`, `src/components/atomic-crm/providers/commons/getContactAvatar.ts`, and `vite.config.ts`.
- npm is the package manager used by all root scripts, Make targets, and CI jobs in `package.json`, `makefile`, and `.github/workflows/check.yml`.
- Root lockfile: `package-lock.json` is present with lockfile version 3; use `npm ci` in reproducible environments as shown in `.github/workflows/check.yml` and `.github/workflows/deploy.yml`.
- Documentation lockfile: `doc/package-lock.json` is maintained separately for the Astro site declared in `doc/package.json`.
- No npm/package-manager version is pinned through a `packageManager` field in `package.json`; Node 22 supplies the intended npm toolchain through `.nvmrc`.

## Frameworks

- React `^19.1.0` and React DOM `^19.1.0` render the SPA from `src/main.tsx`; application composition begins in `src/App.tsx` and `src/components/atomic-crm/root/CRM.tsx`.
- ra-core `^5.14.2` is the headless admin/application framework for resources, auth, data-provider contracts, forms, routing, cache integration, and local stores in `src/components/atomic-crm/root/CRM.tsx`.
- React Router `^7.13.0` supplies routes and navigation through `src/components/atomic-crm/root/CRM.tsx` and application feature components under `src/components/atomic-crm/`.
- TanStack React Query `^5.90.21` manages server state; the mobile application adds offline-first localStorage persistence with `@tanstack/react-query-persist-client` and `@tanstack/query-async-storage-persister` in `src/components/atomic-crm/root/CRM.tsx`.
- Supabase is the backend platform: PostgREST/data access and Auth are adapted through `ra-supabase-core` `^3.5.2` in `src/components/atomic-crm/providers/supabase/dataProvider.ts` and `src/components/atomic-crm/providers/supabase/authProvider.ts`.
- FakeRest is the browser-only demo backend through `ra-data-fakerest` `^5.10.0` in `src/components/atomic-crm/providers/fakerest/dataProvider.ts` and `demo/App.tsx`.
- Tailwind CSS `^4.1.11` with `@tailwindcss/vite` `^4.1.18` provides styling and build integration in `src/index.css`, `components.json`, and `vite.config.ts`.
- Repository-owned Shadcn Admin Kit and shadcn/ui components live in `src/components/admin/` and `src/components/ui/`; they are mutable source dependencies rather than opaque installed packages, as documented in `AGENTS.md`.
- Radix UI primitives, `radix-ui`, Lucide React, Sonner, Vaul, and `class-variance-authority` implement accessible controls and presentation; versions are declared in `package.json` and wrappers live in `src/components/ui/`.
- Nivo Bar `^0.99.0` renders charts in `src/components/atomic-crm/dashboard/DealsChart.tsx`; `@hello-pangea/dnd` `^18.0.1` powers deal-pipeline drag-and-drop components under `src/components/atomic-crm/deals/`.
- React Hook Form `^7.71.1` supplies form state in feature forms such as `src/components/atomic-crm/settings/ProfilePage.tsx`; Zod `^4.1.12` is available as the schema-validation dependency declared in `package.json`.
- Vitest `^3.2.4` is the test runner with globals enabled and the `@/*` source alias in `vitest.config.ts`.
- Testing Library DOM assertions come from `@testing-library/jest-dom` `^6.6.3`, initialized by `src/setupTests.js`.
- Vite `^7.3.0` builds and serves the SPA; production and FakeRest demo builds are separated by `vite.config.ts` and `vite.demo.config.ts`.
- TypeScript `~5.8.3` runs before production builds through the `build` and `build:demo` scripts in `package.json`.
- Vite PWA `^1.2.0` generates an auto-updating service worker using the static manifest at `public/manifest.json`; PWA cache limits are configured in `vite.config.ts`.
- Rollup `^4.59.0` and `rollup-plugin-visualizer` `^6.0.3` produce the browser bundle and `dist/stats.html` through `vite.config.ts`.
- Astro `^5.16.10`, Starlight `^0.36.0`, and Starlight Tailwind `^4.0.1` build the separate documentation site from `doc/package.json` and `doc/astro.config.mjs`.
- ESLint 9, typescript-eslint 8, Prettier 3, Husky 9, and shadcn CLI 3 implement code checks, formatting, hooks, and registry generation through `eslint.config.js`, `.prettierrc.json`, `.husky/pre-commit`, and `package.json`.

## Key Dependencies

- `ra-core` `^5.14.2` defines the application contracts and resource model used across `src/components/admin/` and `src/components/atomic-crm/`.
- `ra-supabase-core` `^3.5.2` maps react-admin operations to Supabase/PostgREST and wraps Supabase Auth in `src/components/atomic-crm/providers/supabase/`.
- `@supabase/supabase-js` resolves transitively as `2.90.1` through `ra-supabase-core` but is imported directly in `src/components/atomic-crm/providers/supabase/supabase.ts`; add it as a direct dependency before relying on independent versioning.
- `date-fns` resolves transitively as `3.6.0` through `ra-core` but is imported directly throughout `src/components/atomic-crm/dashboard/`, `src/components/atomic-crm/deals/`, and `src/components/atomic-crm/tasks/`; treat the transitive dependency as an explicit manifest requirement when changing dependencies.
- `posthog-js` `^1.359.0` provides optional client analytics initialized from `src/main.tsx` and implemented in `src/providers/posthog.ts`.
- DOMPurify `^3.3.2` and Marked `^17.0.1` sanitize and render note markdown in `src/components/atomic-crm/misc/Markdown.tsx`.
- Papa Parse `^5.5.3`, `jsonexport` `^3.2.0`, and `@streamparser/json-whatwg` `^0.0.22` support CRM import/export flows in `src/components/atomic-crm/contacts/useContactImport.tsx` and `src/components/atomic-crm/misc/useImportFromJson.ts`.
- Supabase CLI is invoked through `npx` rather than declared in `package.json`; local database, Auth, Storage, Realtime, Studio, Inbucket, migrations, and Edge Functions are orchestrated by `makefile` and `supabase/config.toml`.
- Edge Functions use `jsr:@supabase/supabase-js@2`, `jsr:@panva/jose@6`, Kysely `0.27.2`, Deno Postgres `0.17.0`, and `npm:base64-arraybuffer`, all imported directly from runtime registries in `supabase/functions/_shared/` and `supabase/functions/postmark/`.
- `gh-pages` `^6.3.0` publishes the SPA, documentation, and shadcn registry through `scripts/ghpages-deploy.mjs`, `makefile`, and `.github/workflows/deploy.yml`.
- `execa` is imported directly by `scripts/supabase-remote-init.mjs` but resolves only transitively through the shadcn CLI according to `package-lock.json`; declare it directly before treating the initializer as independently supported tooling.
- `@vectorize-io/hindsight-client` is imported by `src/components/atomic-crm/providers/hindsight/hindsightClient.ts`, but it is absent from `package.json` and `package-lock.json`; the local installation reports `0.4.18` as extraneous, so a clean install cannot typecheck these source files.

## Configuration

- Required Supabase browser configuration is `VITE_SUPABASE_URL` plus `VITE_SB_PUBLISHABLE_KEY`; the production provider fails fast when either is absent in `src/components/atomic-crm/providers/supabase/dataProvider.ts`.
- Optional browser switches are `VITE_IS_DEMO`, `VITE_INBOUND_EMAIL`, `VITE_GOOGLE_WORKPLACE_DOMAIN`, `VITE_DISABLE_EMAIL_PASSWORD_AUTHENTICATION`, `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`, `VITE_HINDSIGHT_URL`, and `VITE_HINDSIGHT_ENABLED`, consumed in `vite.config.ts`, `src/components/atomic-crm/root/CRM.tsx`, `src/providers/posthog.ts`, and `src/components/atomic-crm/providers/hindsight/hindsightClient.ts`.
- Edge Functions consume Supabase-provided `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SB_PUBLISHABLE_KEY`, `SB_JWT_ISSUER`, and optional `SUPABASE_DB_URL`; Postmark additionally requires `POSTMARK_WEBHOOK_USER`, `POSTMARK_WEBHOOK_PASSWORD`, and `POSTMARK_WEBHOOK_AUTHORIZED_IPS` in `supabase/functions/_shared/` and `supabase/functions/postmark/index.ts`.
- `.env.development` and `.env.example` are present as local environment configuration files; their contents are intentionally not part of this map, and `scripts/supabase-remote-init.mjs` generates `.env.production.local` for linked remote projects.
- `vite.config.ts` configures React, Tailwind, HTML injection, Rollup visualization, PWA generation, relative asset paths, source maps, and the `@` alias.
- `vite.demo.config.ts` selects `demo/main.tsx`, hard-enables FakeRest demo mode, and omits the service-worker plugin used by `vite.config.ts`.
- `tsconfig.json`, `tsconfig.app.json`, and `tsconfig.node.json` separate shared aliases, strict browser compilation, and Node/Vite configuration compilation.
- `components.json` defines shadcn style, CSS, alias, and icon-library settings; `eslint.config.js` and `.prettierrc.json` govern static formatting and lint rules.
- `supabase/config.toml` configures the local API, PostgreSQL 15 database, Auth, Storage, Realtime, Studio, Inbucket, and Edge Function gateway behavior.
- `doc/astro.config.mjs` configures the Starlight documentation base path, Tailwind, navigation, metadata, and documentation analytics.

## Platform Requirements

- Install Make, Node 22 LTS, npm, and Docker before running `make install` or `make start`; Docker hosts the local Supabase/PostgreSQL services described in `README.md` and `makefile`.
- Use the Supabase CLI through `npx supabase` for local startup, database migrations, resets, Edge Function serving, linking, and deployment as defined in `makefile` and `scripts/supabase-remote-init.mjs`.
- Local ports are Vite `5173`, Supabase API `54321`, PostgreSQL `54322`, Studio `54323`, and Inbucket `54324`, configured in `supabase/config.toml` and documented in `README.md`.
- The frontend is a static relative-base SPA/PWA built into `dist/` and published to a GitHub Pages branch by `.github/workflows/deploy.yml` and `scripts/ghpages-deploy.mjs`.
- Backend production targets a hosted Supabase project with migrations and Edge Functions deployed by `.github/workflows/deploy.yml`; database, Auth, Storage, Realtime, and PostgREST remain Supabase-managed.
- Documentation and the generated shadcn registry are built separately and published to GitHub Pages by `makefile`, `doc/astro.config.mjs`, and `.github/workflows/deploy.yml`.

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

## Naming Patterns

- Use PascalCase for feature-level React component files under `src/components/atomic-crm/`, such as `src/components/atomic-crm/leads/LeadShow.tsx`, `src/components/atomic-crm/deals/DealList.tsx`, and `src/components/atomic-crm/settings/SettingsPage.tsx`.
- Use lower camelCase for hooks and non-component modules, such as `src/components/atomic-crm/contacts/useContactImport.tsx`, `src/components/atomic-crm/deals/dealUtils.ts`, `src/hooks/saved-queries.tsx`, and `src/lib/toSlug.ts`.
- Prefix custom hooks with `use`, matching `src/hooks/useBulkExport.tsx`, `src/hooks/use-mobile.ts`, and `src/components/atomic-crm/providers/hindsight/useHindsight.ts`.
- Preserve the lowercase hyphenated filenames used by the mutable framework layers in `src/components/admin/` and `src/components/ui/`, for example `src/components/admin/data-table.tsx`, `src/components/admin/simple-form-iterator.tsx`, and `src/components/ui/dropdown-menu.tsx`.
- Co-locate constants with their feature and use a descriptive suffix when useful, as in `src/components/atomic-crm/misc/unsupportedDomains.const.ts` and `src/components/atomic-crm/companies/sizes.ts`.
- Name co-located tests after the implementation with either `*.test.ts` or `*.spec.ts`; current examples include `src/components/atomic-crm/leads/leadScoring.test.ts` and `src/components/atomic-crm/deals/dealUtils.spec.ts`.
- Use PascalCase for React components (`LeadConvert`, `CrmErrorBoundary`) and lower camelCase for helpers (`calculateInvoiceTotal`, `getDateRangeFilter`, `mergeContactData`). See `src/components/atomic-crm/leads/LeadConvert.tsx`, `src/components/atomic-crm/misc/CrmErrorBoundary.tsx`, and `src/components/atomic-crm/invoices/invoiceCalculations.ts`.
- Use a `use` prefix only for hooks that invoke React hooks, as demonstrated by `useSavedQueries` in `src/hooks/saved-queries.tsx` and `useHindsight` exports in `src/components/atomic-crm/providers/hindsight/useHindsight.ts`.
- Prefer named function declarations for reusable pure helpers and async operations, as in `src/lib/utils.ts`, `src/components/atomic-crm/providers/commons/getContactAvatar.ts`, and `supabase/functions/merge_contacts/index.ts`.
- Arrow functions are conventional for React components, callbacks, and short expressions, as in `src/App.tsx`, `src/lib/toSlug.ts`, and `src/components/atomic-crm/settings/SettingsPage.tsx`.
- Use `const` by default and lower camelCase for local values, state, and service results; use `let` only for reassigned state such as the singleton client in `src/components/atomic-crm/providers/hindsight/hindsightClient.ts`.
- Name booleans with state-oriented prefixes such as `is`, `has`, or `can`, matching `isPending`, `hasError`, `isInitialized`, and `canAccess` in `src/components/atomic-crm/leads/LeadConvert.tsx`, `src/components/atomic-crm/misc/CrmErrorBoundary.tsx`, and `src/components/atomic-crm/providers/supabase/authProvider.ts`.
- Use uppercase snake case for module constants and configuration keys, such as `HINDSIGHT_ENABLED`, `BANKS`, `IS_INITIALIZED_CACHE_KEY`, and `CURRENT_SALE_CACHE_KEY` in `src/components/atomic-crm/providers/hindsight/hindsightClient.ts` and `src/components/atomic-crm/providers/supabase/authProvider.ts`.
- Prefix intentionally unused parameters or bindings with `_`; `eslint.config.js` permits `^_` for both variables and arguments.
- Use PascalCase for interfaces, type aliases, and generic type parameters. Domain records live primarily in `src/components/atomic-crm/types.ts` (`Contact`, `Deal`, `Lead`, `Touchpoint`), while module-specific props stay beside their implementation, as in `CrmErrorBoundary`'s `Props` and `State` in `src/components/atomic-crm/misc/CrmErrorBoundary.tsx`.
- Use `Props` or `<ComponentName>Props` for component contracts, such as `CompanyAsideProps` in `src/components/atomic-crm/companies/CompanyAside.tsx` and `TaskEditSheetProps` in `src/components/atomic-crm/tasks/TaskEditSheet.tsx`.
- Use `import type` or inline `type` imports for type-only dependencies. The rule is a warning across normal TypeScript files in `eslint.config.js`; examples appear in `src/components/atomic-crm/providers/supabase/dataProvider.ts` and `src/components/atomic-crm/settings/SettingsPage.tsx`.
- Prefer explicit return types for exported pure utilities and boundary functions when they clarify nullability or promises, as in `src/components/atomic-crm/invoices/invoiceCalculations.ts`, `src/lib/toSlug.ts`, and `supabase/functions/_shared/authentication.ts`.

## Code Style

- Run Prettier 3 using `.prettierrc.json`; the normal TypeScript/TSX style is two-space indentation, double quotes, semicolons, and trailing commas where supported.
- Keep the generated shadcn UI style under `src/components/ui/*.tsx`: two spaces, double quotes, no semicolons, LF endings, and ES5-compatible trailing commas. This override is defined in `.prettierrc.json` and is visible in `src/components/ui/sidebar.tsx`.
- Markdown and MDX use four-space indentation and single quotes where quote formatting applies, per `.prettierrc.json`.
- Use `npm run prettier` for a check and `npm run prettier:apply` for a mechanical rewrite. `make lint` runs both `npm run lint` and `npm run prettier` as defined in `Makefile`.
- Do not rely on the repository-wide Prettier command as a source-only check without reviewing its scope: `.prettierignore` excludes `dist` but not every dated `dist-*` artifact, and `.scan/audit.json` is not valid JSON, so the current `npm run prettier` check exits with an error before completing.
- Use the ESLint 9 flat configuration in `eslint.config.js`, combining `@eslint/js`, `typescript-eslint`, React Hooks, React Refresh, and Storybook recommended rules.
- Keep code compatible with strict TypeScript settings from `tsconfig.app.json`: `strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, and `noUncheckedSideEffectImports` are enabled.
- Do not use `console.log`; `eslint.config.js` allows only `console.warn` and `console.error`. Use these at service/error boundaries such as `src/components/atomic-crm/providers/supabase/dataProvider.ts` and `src/components/atomic-crm/misc/CrmErrorBoundary.tsx`.
- Avoid explicit `any` in `src/components/admin/*`, `src/hooks/*`, and `src/lib/*`, where `@typescript-eslint/no-explicit-any` is an error. Elsewhere it is permitted, but keep it at third-party or serialization boundaries and prefer concrete domain types.
- Keep React hook dependencies accurate. Narrow `eslint-disable-next-line` comments to the exact exceptional line, following existing compatibility cases in `src/components/atomic-crm/contacts/useContactImport.tsx` and `src/components/admin/date-time-input.tsx`.
- Use `npm run lint` for ESLint only, `npm run typecheck` for TypeScript only, and `make lint` for the combined ESLint/Prettier gate. CI also runs lint, tests, and build as separate jobs in `.github/workflows/check.yml`.
- Express component styling with Tailwind utility classes in `className`, as used throughout `src/components/atomic-crm/leads/LeadConvert.tsx` and `src/components/atomic-crm/misc/CrmErrorBoundary.tsx`.
- Use `cn` from `src/lib/utils.ts` when classes are conditional or must be merged safely with caller-provided classes.
- Build reusable variants with the conventions already present in `src/components/ui/`; do not introduce component-local CSS for patterns already represented by Tailwind utilities or shared UI primitives.

## Import Organization

- Use `@/*` for cross-feature or root-level imports. `tsconfig.json`, `tsconfig.app.json`, and `vite.config.ts` all map `@/*` to `src/*`.
- Use relative imports for code within the same feature or a nearby parent directory; examples include `./leadStatuses` in `src/components/atomic-crm/leads/leadScoring.test.ts` and `../types` in `src/components/atomic-crm/deals/stages.test.ts`.
- Supabase Edge Functions use explicit `.ts` extensions and URL/JSR imports because they run under Deno, as shown in `supabase/functions/_shared/authentication.ts` and `supabase/functions/merge_contacts/index.ts`.

## Error Handling

- Fail fast on missing required configuration and invalid provider inputs by throwing an `Error`, as in `src/components/atomic-crm/providers/supabase/dataProvider.ts`, `src/components/atomic-crm/providers/fakerest/internal/transformInFilter.ts`, and `src/components/atomic-crm/deals/dealUtils.ts`.
- At UI mutation boundaries, convert failures into user-visible `useNotify` messages and keep success/refresh/redirect behavior in React Query or ra-core callbacks. Follow `src/components/atomic-crm/leads/LeadConvert.tsx`, `src/components/atomic-crm/settings/ProfilePage.tsx`, and `src/components/atomic-crm/contacts/ContactMergeButton.tsx`.
- Log diagnostic context at provider and infrastructure boundaries, then throw a stable domain-facing error. `src/components/atomic-crm/providers/supabase/dataProvider.ts` logs the underlying Supabase failure and throws messages such as `Failed to merge contacts`.
- Treat analytics and optional memory features as non-critical: catch their failures without blocking the primary operation, as in `src/components/atomic-crm/providers/supabase/authProvider.ts` and `src/components/atomic-crm/providers/hindsight/hindsightClient.ts`.
- Wrap render-heavy feature surfaces in `CrmErrorBoundary` from `src/components/atomic-crm/misc/CrmErrorBoundary.tsx`; it logs the error and provides a recoverable fallback UI.
- Return structured HTTP errors from Edge Functions with `createErrorResponse` and compose authentication/CORS middleware, following `supabase/functions/_shared/authentication.ts`, `supabase/functions/_shared/utils.ts`, and `supabase/functions/merge_contacts/index.ts`.

## Logging

- Use `console.error` for failures that need developer diagnosis at data, network, transaction, or render boundaries; include a stable operation label as in `merge_contacts.error` in `src/components/atomic-crm/providers/supabase/dataProvider.ts`.
- Use `console.warn` for degraded optional behavior that falls back safely, such as Hindsight recall/retain failures in `src/components/atomic-crm/providers/hindsight/hindsightClient.ts`.
- Do not log routine control flow or user data. Surface actionable UI feedback through ra-core `useNotify` and track product events through `analytics` in `src/providers/posthog.ts`.

## Comments

- Comment the reason for unusual behavior, compatibility constraints, security boundaries, or non-obvious business rules. Examples include the authentication cache rationale in `src/components/atomic-crm/providers/supabase/authProvider.ts` and the RLS transaction steps in `supabase/functions/merge_contacts/index.ts`.
- Keep comments synchronized with cross-layer contracts. `src/lib/toSlug.ts` explicitly identifies the migration whose SQL slug behavior must remain aligned.
- Use TODO/FIXME only for a concrete remaining action and include context when possible, following `src/components/atomic-crm/providers/commons/getContactAvatar.ts` and `src/components/admin/select-input.tsx`.
- Avoid narrating straightforward JSX or assignments; prefer extracted names and types. Existing numbered comments in complex provider/Edge Function flows are the exception, as in `supabase/functions/merge_contacts/index.ts`.
- Use JSDoc for public entry points, reusable compatibility shims, and deprecations. `src/App.tsx` documents CRM customization and `src/hooks/saved-queries.tsx` documents replacements for deprecated helpers.
- Put `@deprecated` on the declaration with the replacement path so editors can guide migration, matching `src/hooks/useBulkExport.tsx` and `src/hooks/simple-form-iterator-context.tsx`.
- Routine private components and obvious helpers do not require JSDoc; their types and names are the primary documentation.

## Function Design

## Module Design

<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

## System Overview

```text

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

- Register each CRUD domain as a ra-core `<Resource>` and export its screen descriptor from the feature folder's `index.ts` or `index.tsx`; examples are `src/components/atomic-crm/contacts/index.tsx` and `src/components/atomic-crm/root/CRM.tsx`.
- Keep normal CRUD calls behind `CrmDataProvider`; use the same semantic resource names and custom methods in `src/components/atomic-crm/providers/supabase/dataProvider.ts` and `src/components/atomic-crm/providers/fakerest/dataProvider.ts`.
- Put resource-specific UI, filters, forms, and local helpers together under `src/components/atomic-crm/<feature>/`; shared ra-core UI belongs in `src/components/admin/`, and framework-neutral primitives belong in `src/components/ui/`.
- Model multi-table reads as PostgreSQL views such as `contacts_summary`, `companies_summary`, and attribution views in `supabase/migrations/20240730075029_init_db.sql` and `supabase/migrations/20260306000007_attribution_summary_view.sql`.
- Model privileged or atomic operations as database functions or authenticated Edge Functions, not client-side sequences; examples are `supabase/migrations/20260306000004_lead_conversion_function.sql` and `supabase/functions/merge_contacts/index.ts`.
- Treat desktop and mobile as separate application compositions chosen at the root, with a 768px breakpoint in `src/hooks/use-mobile.ts` and distinct resource sets in `src/components/atomic-crm/root/CRM.tsx`.
- Use React lazy loading at high-cost resource boundaries for deals, leads, and attribution via `src/components/atomic-crm/deals/index.ts`, `src/components/atomic-crm/leads/index.ts`, and `src/components/atomic-crm/attribution/index.ts`.

## Layers

- Purpose: Produce and mount the browser application and PWA shell.
- Location: `index.html`, `src/main.tsx`, `vite.config.ts`, `public/`.
- Contains: HTML mount point, global CSS import, analytics initialization, Vite plugins, Workbox configuration, and static PWA assets.
- Depends on: React, Vite, Tailwind, PostHog, and the CRM composition in `src/App.tsx`.
- Used by: Browser navigation and production deployments configured by `vercel.json`.
- Purpose: Assemble framework providers, authentication gates, responsive layouts, routes, and resource definitions.
- Location: `src/App.tsx`, `src/components/atomic-crm/root/`, `src/components/admin/admin.tsx`.
- Contains: `<CRM>`, `<Admin>`, desktop/mobile compositions, configuration defaults, i18n, and store setup.
- Depends on: ra-core, React Router, TanStack Query, feature descriptors, and provider ports in `src/components/atomic-crm/providers/`.
- Used by: Every authenticated page and public authentication route registered in `src/components/atomic-crm/root/CRM.tsx`.
- Purpose: Implement user-facing CRM workflows by domain.
- Location: `src/components/atomic-crm/activity/`, `attribution/`, `companies/`, `contacts/`, `dashboard/`, `deals/`, `leads/`, `notes/`, `sales/`, `settings/`, `tags/`, and `tasks/`.
- Contains: Resource descriptors, list/show/create/edit screens, forms, filters, sheets, Kanban behavior, import/export, and domain helpers.
- Depends on: `src/components/admin/`, `src/components/ui/`, `src/components/atomic-crm/types.ts`, ra-core hooks, and provider methods exposed through context.
- Used by: `<Resource>` and `<CustomRoutes>` declarations in `src/components/atomic-crm/root/CRM.tsx`.
- Purpose: Provide reusable controller-aware CRUD building blocks and low-level visual primitives.
- Location: `src/components/admin/`, `src/components/ui/`, `src/hooks/`, `src/lib/`.
- Contains: List/Edit/Create/Show wrappers, fields, inputs, filters, themes, Shadcn/Radix primitives, shared hooks, and utility functions.
- Depends on: ra-core, React Hook Form, React Router, Radix UI, Tailwind utilities, and `src/lib/utils.ts`.
- Used by: Feature components under `src/components/atomic-crm/`.
- Purpose: Preserve one frontend data/auth contract while switching between Supabase and FakeRest implementations.
- Location: `src/components/atomic-crm/providers/supabase/`, `src/components/atomic-crm/providers/fakerest/`, `src/components/atomic-crm/providers/commons/`.
- Contains: DataProvider/AuthProvider implementations, lifecycle callbacks, file upload logic, filter adaptation, activity aggregation, access rules, and merge helpers.
- Depends on: ra-core provider types, Supabase SDK/ra-supabase-core or ra-data-fakerest, plus shared domain types in `src/components/atomic-crm/types.ts`.
- Used by: Defaults in `src/components/atomic-crm/root/CRM.tsx` and demo overrides in `demo/App.tsx`.
- Purpose: Persist and protect data, expose REST/Auth/Storage/Realtime, and execute server-side business operations.
- Location: `supabase/migrations/`, `supabase/functions/`, `supabase/config.toml`.
- Contains: PostgreSQL schema, RLS, views, triggers, RPC functions, Edge Function handlers, email templates, and shared authentication/CORS/database helpers.
- Depends on: Supabase platform services, Deno runtime, Postgres, Kysely for transactional contact merge, and Postmark for inbound email.
- Used by: `src/components/atomic-crm/providers/supabase/`, `src/providers/realtimeProvider.ts`, and the direct lead-conversion RPC in `src/components/atomic-crm/leads/LeadConvert.tsx`.

## Data Flow

### Primary Contact List Request Path

### Deal Kanban Mutation and Realtime Flow

### Configuration and Authentication Flow

### Privileged Edge Function Flow

### Inbound Email Flow

- Use ra-core/TanStack Query as authoritative remote-request state; list/show/form controllers in `src/components/admin/` expose context rather than feature-owned fetch state.
- Use the ra-core store for persistent preferences/configuration; the default CRM store is namespaced in `src/components/atomic-crm/root/CRM.tsx`, while the demo uses `memoryStore()` in `demo/App.tsx`.
- Mobile creates an offline-first `QueryClient` and persists it to `localStorage`; desktop uses the query client supplied by ra-core (`src/components/atomic-crm/root/CRM.tsx:266`).
- Keep ephemeral interaction state local to components, such as Kanban grouping in `src/components/atomic-crm/deals/DealListContent.tsx` and attribution tabs/date range in `src/components/atomic-crm/attribution/AttributionDashboard.tsx`.
- Treat PostgreSQL/Supabase as the source of truth for production data and FakeRest's generated in-memory dataset as the source of truth only for `demo/App.tsx`.

## Key Abstractions

- Purpose: Accept provider, auth, store, branding, and domain configuration overrides while preserving one application composition.
- Examples: `src/components/atomic-crm/root/CRM.tsx`, `src/App.tsx`, `demo/App.tsx`.
- Pattern: Dependency injection through component props with production defaults.
- Purpose: Bind a domain name to list/show/create/edit screens and record representation.
- Examples: `src/components/atomic-crm/contacts/index.tsx`, `src/components/atomic-crm/companies/index.ts`, `src/components/atomic-crm/sales/index.ts`.
- Pattern: Feature-local default-exported descriptor consumed by `<Resource>` in `src/components/atomic-crm/root/CRM.tsx`.
- Purpose: Extend standard ra-core CRUD with CRM operations such as sign-up, user management, configuration, activity aggregation, deal unarchive, and contact merge.
- Examples: `src/components/atomic-crm/providers/types.ts`, `src/components/atomic-crm/providers/supabase/dataProvider.ts`, `src/components/atomic-crm/providers/fakerest/dataProvider.ts`.
- Pattern: Port-and-adapters plus `withLifecycleCallbacks` decorators.
- Purpose: Normalize login, identity, initialization, SSO/OAuth, and role-based access for production and demo modes.
- Examples: `src/components/atomic-crm/providers/supabase/authProvider.ts`, `src/components/atomic-crm/providers/fakerest/authProvider.ts`, `src/components/atomic-crm/providers/commons/canAccess.ts`.
- Pattern: ra-core strategy object with delegated base provider and application-specific guards.
- Purpose: Merge server-backed tenant configuration with compile-time defaults and expose it through hooks.
- Examples: `src/components/atomic-crm/root/ConfigurationContext.tsx`, `src/components/atomic-crm/root/defaultConfiguration.ts`, `src/components/atomic-crm/root/useConfigurationLoader.ts`.
- Pattern: Persistent ra-core store plus query-backed refresh; despite the filename, `ConfigurationContext.tsx` exposes store hooks rather than a React context provider.
- Purpose: Move cross-table aggregation and invariant maintenance out of UI queries.
- Examples: `supabase/migrations/20240730075029_init_db.sql`, `supabase/migrations/20260127140209_imports.sql`, `supabase/migrations/20260306000008_attribution_triggers.sql`.
- Pattern: SQL views for read models; triggers/functions for derived values and lifecycle invariants.
- Purpose: Reuse CORS, JWT verification, authenticated-user resolution, admin client access, and error response formatting.
- Examples: `supabase/functions/_shared/authentication.ts`, `supabase/functions/_shared/cors.ts`, `supabase/functions/_shared/utils.ts`, `supabase/functions/users/index.ts`.
- Pattern: Nested higher-order request handlers around `Deno.serve`.

## Entry Points

- Location: `index.html`, `src/main.tsx`.
- Triggers: Browser loads the Vite-generated HTML document.
- Responsibilities: Provide the `#root` mount, load `src/main.tsx`, initialize PostHog, and render `<App>`.
- Location: `src/App.tsx`.
- Triggers: Imported by `src/main.tsx`.
- Responsibilities: Instantiate `<CRM>` with production default providers and configuration.
- Location: `demo/main.tsx`, `demo/App.tsx`, `vite.demo.config.ts`.
- Triggers: `npm run dev:demo` or `npm run build:demo` from `package.json`.
- Responsibilities: Render the same `<CRM>` composition with FakeRest providers and an in-memory ra-core store.
- Location: `src/components/atomic-crm/root/CRM.tsx`.
- Triggers: Rendering `<CRM>` from either application entry.
- Responsibilities: Choose responsive composition, enforce authentication, register resources/custom routes, and inject state/data/auth/i18n services.
- Location: `supabase/functions/users/index.ts`, `supabase/functions/update_password/index.ts`, `supabase/functions/merge_contacts/index.ts`, `supabase/functions/postmark/index.ts`, `supabase/functions/delete_note_attachments/index.ts`.
- Triggers: Supabase Functions HTTP invocation, provider SDK invocation, Postmark webhook, or database webhook.
- Responsibilities: Execute operations requiring authentication, service-role access, transactional SQL, inbound webhook handling, or storage cleanup.
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

### Bypassing the Provider Port

### Browser-Orchestrated Multi-Record Transactions

### Detached Optional Integration Code

## Error Handling

- Let provider methods throw meaningful `Error` values after logging upstream details; ra-core mutation callbacks display user-facing notifications, as in `src/components/atomic-crm/providers/supabase/dataProvider.ts` and `src/components/atomic-crm/settings/SettingsPage.tsx`.
- Wrap complete layouts with `react-error-boundary` and high-risk feature regions with `CrmErrorBoundary` (`src/components/atomic-crm/layout/Layout.tsx`, `src/components/atomic-crm/attribution/AttributionDashboard.tsx`).
- Use `createErrorResponse` for JSON error bodies and HTTP status codes in authenticated functions (`supabase/functions/_shared/utils.ts`, `supabase/functions/users/index.ts`).
- Treat analytics/config refresh failures as non-critical and keep login operational (`src/components/atomic-crm/providers/supabase/authProvider.ts`, `src/components/atomic-crm/root/CRM.tsx`).
- Return explicit 401/403/405 responses for webhook authentication, invalid bodies, and unsupported methods (`supabase/functions/postmark/index.ts`, `supabase/functions/update_password/index.ts`).

## Cross-Cutting Concerns

<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

| Skill | Description | Path |
|-------|-------------|------|
| backend-dev | Coding practices for backend development in Atomic CRM. Use when deciding whether backend logic is needed, or when creating/modifying database migrations, views, triggers, RLS policies, edge functions, or custom dataProvider methods that call Supabase APIs. | `.claude/skills/backend-dev/SKILL.md` |
| frontend-dev | Coding practices for frontend development in Atomic CRM. Use when creating or modifying React components, forms, list pages, detail views, filters, data fetching, or responsive layouts. | `.claude/skills/frontend-dev/SKILL.md` |
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
