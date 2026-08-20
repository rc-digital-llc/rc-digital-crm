# Codebase Structure

**Analysis Date:** 2026-08-20

## Directory Layout

```text
rc-digital-crm/
├── .claude/                    # Repository-local Claude commands and workflow support
├── .github/                    # Contribution templates and CI/deploy workflows
├── .husky/                     # Git hook entry points
├── .planning/codebase/         # GSD-generated codebase reference documents
├── demo/                       # FakeRest browser entry and CRM composition
├── doc/                        # Astro/Starlight user and developer documentation site
├── public/                     # Static PWA manifest, icons, logos, robots, auth callback
├── scripts/                    # Registry, GitHub Pages, and Supabase setup automation
├── src/
│   ├── components/
│   │   ├── admin/             # Mutable shadcn-admin-kit/ra-core components
│   │   ├── atomic-crm/        # CRM domain application and provider adapters
│   │   ├── supabase/          # Supabase-specific authentication pages
│   │   └── ui/                # Mutable Shadcn/Radix primitives
│   ├── hooks/                  # Cross-application React hooks
│   ├── lib/                    # Framework-neutral TypeScript helpers/types
│   ├── providers/              # App-wide realtime and analytics integrations
│   ├── styles/                 # RC Digital design-system CSS
│   ├── App.tsx                 # Production CRM composition
│   ├── main.tsx                # Production React browser bootstrap
│   └── index.css               # Tailwind/theme/global CSS entry
├── supabase/
│   ├── functions/              # Deno Edge Functions and shared middleware
│   ├── migrations/             # Ordered PostgreSQL schema evolution
│   ├── templates/              # Auth email templates
│   └── config.toml             # Local Supabase service configuration
├── test-data/                   # Manual import fixtures
├── index.html                  # Vite HTML shell and root mount
├── package.json                # Frontend scripts and dependency manifest
├── makefile                    # Full-stack developer command facade
├── vite.config.ts              # Production Vite/PWA build configuration
└── tsconfig.app.json           # Strict browser/demo TypeScript configuration
```

## Directory Purposes

**`src/components/atomic-crm/`:**
- Purpose: Own all CRM-specific application code and the replaceable backend adapters.
- Contains: Feature folders, root composition, responsive layouts, shared domain types/constants, and provider implementations.
- Key files: `src/components/atomic-crm/root/CRM.tsx`, `src/components/atomic-crm/types.ts`, `src/components/atomic-crm/root/ConfigurationContext.tsx`, `src/components/atomic-crm/providers/types.ts`.
- Placement rule: Put code here when it depends on CRM records, resources, configuration, or workflows; use one domain folder such as `src/components/atomic-crm/contacts/` or `src/components/atomic-crm/deals/`.

**`src/components/atomic-crm/root/`:**
- Purpose: Compose the application rather than implement individual business screens.
- Contains: `<CRM>`, responsive resource registries, configuration store hooks/defaults/loader, and CRM i18n.
- Key files: `src/components/atomic-crm/root/CRM.tsx`, `src/components/atomic-crm/root/defaultConfiguration.ts`, `src/components/atomic-crm/root/useConfigurationLoader.ts`.
- Placement rule: Add code here only when it affects application-wide construction, injected configuration, or provider wiring.

**`src/components/atomic-crm/<feature>/`:**
- Purpose: Co-locate each domain's screens, forms, filters, small hooks, helpers, and tests.
- Contains: PascalCase React components plus camelCase helpers/constants and an optional resource descriptor `index.ts`/`index.tsx`.
- Key files: `src/components/atomic-crm/contacts/index.tsx`, `src/components/atomic-crm/companies/index.ts`, `src/components/atomic-crm/deals/index.ts`, `src/components/atomic-crm/leads/index.ts`.
- Placement rule: Keep domain-specific behavior in its feature folder; do not move one-off feature logic to `src/lib/` or `src/hooks/`.

**`src/components/admin/`:**
- Purpose: Provide the mutable shadcn-admin-kit layer that wraps ra-core controllers and contexts in project UI.
- Contains: Admin composition, List/Create/Edit/Show wrappers, form fields, filters, tables, navigation shell components, theming, authentication, and notifications.
- Key files: `src/components/admin/admin.tsx`, `src/components/admin/list.tsx`, `src/components/admin/form.tsx`, `src/components/admin/index.ts`.
- Placement rule: Add code here when it is reusable across arbitrary ra-core resources and intentionally changes framework-level behavior.

**`src/components/ui/`:**
- Purpose: Provide mutable Shadcn/Radix presentation primitives.
- Contains: Button, dialog, drawer, input, select, table, tabs, tooltip, sidebar, and related primitive wrappers.
- Key files: `src/components/ui/button.tsx`, `src/components/ui/dialog.tsx`, `src/components/ui/table.tsx`, `src/components/ui/README.md`.
- Placement rule: Keep these components domain-neutral; CRM record access belongs under `src/components/atomic-crm/`.

**`src/components/supabase/`:**
- Purpose: Implement authentication pages tied to Supabase flows but hosted by the CRM route tree.
- Contains: Forgot-password, set-password, OAuth consent, and shared auth-page layout components.
- Key files: `src/components/supabase/forgot-password-page.tsx`, `src/components/supabase/set-password-page.tsx`, `src/components/supabase/oauth-consent-page.tsx`.
- Placement rule: Add a page here when its UI is specifically coupled to Supabase Auth APIs; register its route in `src/components/atomic-crm/root/CRM.tsx`.

**`src/components/atomic-crm/providers/`:**
- Purpose: Define the data/auth boundary and reusable infrastructure behavior shared by production and demo adapters.
- Contains: `supabase/`, `fakerest/`, `commons/`, provider type exports, and an isolated optional `hindsight/` client module.
- Key files: `src/components/atomic-crm/providers/supabase/dataProvider.ts`, `src/components/atomic-crm/providers/fakerest/dataProvider.ts`, `src/components/atomic-crm/providers/commons/canAccess.ts`, `src/components/atomic-crm/providers/types.ts`.
- Placement rule: Put backend-specific code in its adapter folder and adapter-independent business helpers in `src/components/atomic-crm/providers/commons/`.

**`src/components/atomic-crm/providers/supabase/`:**
- Purpose: Adapt ra-core's provider contracts to Supabase production services.
- Contains: Singleton client creation, auth provider, decorated data provider, REST/view mapping, storage upload, RPC/Function calls, and lifecycle hooks.
- Key files: `src/components/atomic-crm/providers/supabase/supabase.ts`, `src/components/atomic-crm/providers/supabase/authProvider.ts`, `src/components/atomic-crm/providers/supabase/dataProvider.ts`.
- Placement rule: Extend `CrmDataProvider` here for production, then implement the same method under `src/components/atomic-crm/providers/fakerest/`.

**`src/components/atomic-crm/providers/fakerest/`:**
- Purpose: Run the CRM without a backend while preserving Supabase-like resource and filter semantics.
- Contains: In-browser auth/data adapters, random dataset generators, summary-field maintenance, lifecycle callbacks, and PostgREST filter transformation.
- Key files: `src/components/atomic-crm/providers/fakerest/dataProvider.ts`, `src/components/atomic-crm/providers/fakerest/authProvider.ts`, `src/components/atomic-crm/providers/fakerest/dataGenerator/index.ts`, `src/components/atomic-crm/providers/fakerest/internal/supabaseAdapter.ts`.
- Placement rule: Mirror all user-visible provider behavior required by `demo/App.tsx`; add new generated fields under `src/components/atomic-crm/providers/fakerest/dataGenerator/`.

**`src/hooks/`:**
- Purpose: Hold reusable hooks that are not tied to one CRM domain.
- Contains: Mobile detection, saved-query state, bulk export, user-menu context, simple-form-iterator context, and generic create suggestion support.
- Key files: `src/hooks/use-mobile.ts`, `src/hooks/useBulkExport.tsx`, `src/hooks/saved-queries.tsx`.
- Placement rule: Use the `use*.ts`/`use*.tsx` prefix for callable hooks; keep domain-only hooks inside the relevant `src/components/atomic-crm/<feature>/` folder.

**`src/lib/`:**
- Purpose: Hold small framework-neutral helpers and types shared across admin/UI code.
- Contains: `cn` class merging, slug conversion, generic memoization, field types, input prop sanitization, and base i18n setup.
- Key files: `src/lib/utils.ts`, `src/lib/toSlug.ts`, `src/lib/genericMemo.ts`, `src/lib/field.type.ts`.
- Placement rule: Add pure helpers here only when multiple layers consume them and they have no CRM-resource dependency.

**`src/providers/`:**
- Purpose: Hold application-wide external/cross-cutting browser integrations outside the ra-core data/auth adapters.
- Contains: PostHog analytics and Supabase Realtime query invalidation.
- Key files: `src/providers/posthog.ts`, `src/providers/realtimeProvider.ts`.
- Placement rule: Add cross-cutting integrations here when they operate across features; expose hooks or narrow service objects instead of importing SDKs throughout feature code.

**`src/styles/`:**
- Purpose: Centralize the RC Digital design-system variables and shared layout/component classes.
- Contains: Twenty-inspired CSS variables, typography, spacing, navigation, Kanban, status, and responsive style contracts.
- Key files: `src/styles/twenty-design-system.css`, imported by `src/index.css`.
- Placement rule: Add cross-feature CSS contracts here; keep component-specific Tailwind classes next to components under `src/components/`.

**`supabase/migrations/`:**
- Purpose: Serve as the ordered source of truth for database schema and behavior.
- Contains: Tables, views, indexes, foreign keys, RLS policies, triggers, stored procedures, and realtime publication changes.
- Key files: `supabase/migrations/20240730075029_init_db.sql`, `supabase/migrations/20260211194545_app_configuration.sql`, `supabase/migrations/20260306000004_lead_conversion_function.sql`, `supabase/migrations/20260306000007_attribution_summary_view.sql`.
- Placement rule: Add schema changes as a new timestamped migration; never edit frontend types without corresponding view/table updates here.

**`supabase/functions/`:**
- Purpose: Host Deno HTTP endpoints for privileged, webhook-driven, transactional, or storage operations.
- Contains: One folder per deployable function and `_shared/` middleware/client/database helpers.
- Key files: `supabase/functions/users/index.ts`, `supabase/functions/merge_contacts/index.ts`, `supabase/functions/postmark/index.ts`, `supabase/functions/_shared/authentication.ts`.
- Placement rule: Create `supabase/functions/<snake_case_name>/index.ts`; reuse `_shared/` authentication, CORS, response, and admin-client code.

**`demo/`:**
- Purpose: Provide a separate build entry for the in-browser FakeRest application.
- Contains: Minimal `main.tsx` and `App.tsx` that reuse the production CRM component with alternate providers.
- Key files: `demo/main.tsx`, `demo/App.tsx`, with build configuration in `vite.demo.config.ts`.
- Placement rule: Keep demo-only composition here; shared screens and behavior stay under `src/components/atomic-crm/`.

**`doc/`:**
- Purpose: Build the user/developer documentation site independently of the CRM SPA.
- Contains: Astro/Starlight configuration, MDX content, images, public assets, and documentation styles.
- Key files: `doc/src/content/docs/developers/architecture-choices.mdx`, `doc/src/content/docs/developers/data-providers.mdx`, `doc/src/content/docs/users/`.
- Placement rule: Put developer architecture/configuration material under `doc/src/content/docs/developers/` and workflows for end users under `doc/src/content/docs/users/`.

**`public/`:**
- Purpose: Supply files copied as-is into the Vite build.
- Contains: PWA icons/manifest, logos, favicon, robots policy, static empty-state images, and auth callback HTML.
- Key files: `public/manifest.json`, `public/auth-callback.html`, `public/logos/`, `public/appIcon/`.
- Placement rule: Put static assets requiring stable public URLs here; imported/bundled assets belong in `src/assets/`.

**`scripts/`:**
- Purpose: Automate repository packaging and deployment support tasks.
- Contains: Shadcn registry generation, GitHub Pages deployment, and remote Supabase initialization.
- Key files: `scripts/generate-registry.mjs`, `scripts/ghpages-deploy.mjs`, `scripts/supabase-remote-init.mjs`.
- Placement rule: Add project automation as ESM `.mjs` scripts and expose it through `package.json` and, when developer-facing, `makefile`.

**`test-data/`:**
- Purpose: Store manual import fixtures for exercising CRM import paths.
- Contains: Contact CSV and invalid-sale JSON sample.
- Key files: `test-data/contacts.csv`, `test-data/import-sample-invalid-sale.json`.
- Placement rule: Keep user-loadable/manual fixtures here; co-located automated test data stays near its `*.test.ts(x)` file in `src/`.

## Key File Locations

**Entry Points:**
- `index.html`: Production/demo HTML shell with the `#root` mount and Vite-injected main script.
- `src/main.tsx`: Production browser bootstrap and PostHog initialization.
- `src/App.tsx`: Production `<CRM>` instantiation.
- `demo/main.tsx`: FakeRest browser bootstrap.
- `demo/App.tsx`: FakeRest provider and memory-store injection.
- `src/components/atomic-crm/root/CRM.tsx`: Authenticated route, resource, provider, responsive, and layout composition.
- `supabase/functions/*/index.ts`: Deno entry points for each deployed Edge Function.

**Configuration:**
- `package.json`: NPM scripts, runtime dependencies, and development tooling.
- `makefile`: Full-stack start/stop/build/test/migration/deploy command facade.
- `vite.config.ts`: Production React/Tailwind/PWA/build/alias configuration.
- `vite.demo.config.ts`: Demo entry substitution and FakeRest-compatible build-time environment defaults.
- `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`: Project references, `@/*` alias, browser strictness, and build-tool typing.
- `components.json`: Shadcn style, CSS, icon library, and path aliases.
- `vercel.json`: Vite build output, SPA rewrite, and immutable asset caching.
- `supabase/config.toml`: Local Supabase service configuration.
- `eslint.config.js`, `.prettierrc.json`, `vitest.config.ts`: Lint, formatting, and unit-test configuration.

**Core Logic:**
- `src/components/atomic-crm/types.ts`: Shared CRM record shapes and provider-facing types.
- `src/components/atomic-crm/root/CRM.tsx`: Resource registry and top-level behavior.
- `src/components/atomic-crm/providers/supabase/dataProvider.ts`: Production CRUD/read-model/custom-operation mapping.
- `src/components/atomic-crm/providers/supabase/authProvider.ts`: Production identity/session/access behavior.
- `src/components/atomic-crm/providers/fakerest/dataProvider.ts`: Demo parity and browser-side lifecycle emulation.
- `src/components/atomic-crm/providers/commons/`: Adapter-independent activity, access, attachments, avatar, and merge helpers.
- `supabase/migrations/`: Database domain model, policies, views, functions, and triggers.
- `supabase/functions/`: Privileged and webhook-driven backend behavior.

**Navigation and Layout:**
- `src/components/atomic-crm/layout/Header.tsx`: Desktop sidebar routes, role-gated links, identity, theme, and logout.
- `src/components/atomic-crm/layout/Layout.tsx`: Desktop content/error/suspense/notification shell.
- `src/components/atomic-crm/layout/MobileLayout.tsx`: Mobile content/error/navigation/notification shell.
- `src/components/atomic-crm/layout/MobileNavigation.tsx`: Mobile primary navigation and creation sheets.

**State and Data Access:**
- `src/components/admin/admin.tsx`: ra-core context composition and query-client injection point.
- `src/components/atomic-crm/root/ConfigurationContext.tsx`: Persistent configuration store hooks.
- `src/components/atomic-crm/root/useConfigurationLoader.ts`: Server configuration refresh.
- `src/providers/realtimeProvider.ts`: Realtime-to-query-cache bridge.
- `src/providers/posthog.ts`: Analytics service boundary.

**Styling:**
- `src/index.css`: Tailwind entry, global theme variables, dark mode, fonts, and base element rules.
- `src/styles/twenty-design-system.css`: RC Digital shared visual tokens and application layout classes.
- `src/components/ui/`: Reusable Shadcn/Radix component implementations.

**Testing:**
- `vitest.config.ts`: Vitest configuration.
- `src/setupTests.js`: Shared test setup.
- `src/components/atomic-crm/**/*.test.ts`, `src/components/atomic-crm/**/*.spec.ts`: Co-located domain/provider unit tests.
- `test-data/`: Manual import fixtures, not the automated unit-test suite.

## Naming Conventions

**Files:**
- Use PascalCase `.tsx` for React components and screens, for example `src/components/atomic-crm/contacts/ContactShow.tsx` and `src/components/atomic-crm/deals/DealListContent.tsx`.
- Use camelCase `.ts`/`.tsx` for helpers and hooks, for example `src/components/atomic-crm/deals/dealUtils.ts`, `src/components/atomic-crm/misc/fetchWithTimeout.ts`, and `src/hooks/useBulkExport.tsx`.
- Use lowercase kebab-case for Shadcn/admin primitive filenames, for example `src/components/ui/dropdown-menu.tsx` and `src/components/admin/reference-array-input.tsx`.
- Use `index.ts` or `index.tsx` as a feature's public descriptor/barrel, for example `src/components/atomic-crm/contacts/index.tsx` and `src/components/atomic-crm/leads/index.ts`.
- Use `*.test.ts(x)` or `*.spec.ts(x)` beside the implementation, for example `src/components/atomic-crm/attribution/dateRange.test.ts` and `src/components/atomic-crm/deals/dealUtils.spec.ts`.
- Use `use` prefixes for hooks, for example `src/components/atomic-crm/root/useConfigurationLoader.ts` and `src/components/atomic-crm/providers/hindsight/useHindsight.ts`.
- Use timestamp-prefixed snake_case migration names, for example `supabase/migrations/20260306000004_lead_conversion_function.sql`.
- Use `index.ts` inside each snake_case Edge Function directory, for example `supabase/functions/merge_contacts/index.ts` and `supabase/functions/update_password/index.ts`.

**Directories:**
- Use lowercase plural domain names for feature/resource folders, for example `src/components/atomic-crm/contacts/`, `companies/`, `deals/`, `leads/`, and `tasks/`.
- Use lowercase descriptive infrastructure folders, for example `src/components/atomic-crm/providers/supabase/`, `providers/fakerest/`, and `providers/commons/`.
- Use snake_case only when the directory name must match a deployed Supabase function, for example `supabase/functions/delete_note_attachments/`.
- Keep shared Deno modules in the reserved underscore-prefixed `supabase/functions/_shared/` directory.

**Exports:**
- Export feature resource descriptors as default objects from `index.ts(x)` when consumed by `<Resource>`, following `src/components/atomic-crm/contacts/index.tsx`.
- Use named exports for reusable components, hooks, helpers, providers, and types, following `src/providers/realtimeProvider.ts` and `src/components/atomic-crm/root/ConfigurationContext.tsx`.
- Reserve broad barrel exports for deliberate public surfaces such as `src/components/admin/index.ts`; feature code commonly imports concrete files to keep dependency paths explicit.

## Where to Add New Code

**New CRUD Feature:**
- Primary code: Create `src/components/atomic-crm/<plural-feature>/` with list/show/create/edit components as required.
- Resource descriptor: Add `src/components/atomic-crm/<plural-feature>/index.ts` exporting the ra-core screen mapping.
- Route registration: Add `<Resource name="<resource>" {...feature} />` to `DesktopAdmin` and, if supported on mobile, `MobileAdmin` in `src/components/atomic-crm/root/CRM.tsx`.
- Navigation: Add matching links to `src/components/atomic-crm/layout/Header.tsx` and/or `src/components/atomic-crm/layout/MobileNavigation.tsx` only after route registration.
- Domain types: Add record types to `src/components/atomic-crm/types.ts` when shared by several files; keep view-local types in the feature folder.
- Tests: Co-locate `*.test.ts(x)` or `*.spec.ts(x)` under `src/components/atomic-crm/<plural-feature>/`.

**New Database Resource:**
- Schema: Create a new timestamped file under `supabase/migrations/` for table, indexes, foreign keys, RLS policies, triggers, and realtime publication as needed.
- Read model: Add or update views in the new `supabase/migrations/<timestamp>_<description>.sql` and map logical resource names in `src/components/atomic-crm/providers/supabase/dataProvider.ts`.
- Demo parity: Update generators in `src/components/atomic-crm/providers/fakerest/dataGenerator/` and lifecycle/summary emulation in `src/components/atomic-crm/providers/fakerest/dataProvider.ts`.
- Types: Update `src/components/atomic-crm/types.ts` after the database contract is defined.

**New Custom Data Operation:**
- Provider contract: Extend the inferred/explicit `CrmDataProvider` surface in `src/components/atomic-crm/providers/supabase/dataProvider.ts` and export it through `src/components/atomic-crm/providers/types.ts`.
- Production implementation: Add the Supabase REST/RPC/Function behavior in `src/components/atomic-crm/providers/supabase/dataProvider.ts`.
- Demo implementation: Add behavior with the same signature in `src/components/atomic-crm/providers/fakerest/dataProvider.ts`.
- Feature usage: Resolve the operation with `useDataProvider<CrmDataProvider>()` inside `src/components/atomic-crm/<feature>/`; do not import the Supabase singleton directly.

**New Privileged or Transactional Backend Operation:**
- Implementation: Create `supabase/functions/<snake_case_name>/index.ts` for an HTTP function, or a new migration under `supabase/migrations/` for a PostgreSQL function.
- Shared middleware: Reuse `supabase/functions/_shared/authentication.ts`, `supabase/functions/_shared/cors.ts`, `supabase/functions/_shared/utils.ts`, and `supabase/functions/_shared/supabaseAdmin.ts`.
- Frontend bridge: Invoke the endpoint from `src/components/atomic-crm/providers/supabase/dataProvider.ts`, not directly from the screen.
- Demo bridge: Provide deterministic local behavior in `src/components/atomic-crm/providers/fakerest/dataProvider.ts`.

**New Component/Module:**
- Domain-specific component: `src/components/atomic-crm/<feature>/<PascalCaseName>.tsx`.
- Reusable ra-core component: `src/components/admin/<kebab-case-name>.tsx`, exported through `src/components/admin/index.ts` when it is part of the shared admin surface.
- Domain-neutral visual primitive: `src/components/ui/<kebab-case-name>.tsx`.
- Supabase auth-specific page: `src/components/supabase/<kebab-case-name>-page.tsx` plus route registration in `src/components/atomic-crm/root/CRM.tsx`.

**Utilities:**
- Shared pure helpers: `src/lib/<camelCaseName>.ts`.
- Cross-application hooks: `src/hooks/use<Name>.ts` or `src/hooks/use<Name>.tsx`.
- Feature-only helpers/hooks: `src/components/atomic-crm/<feature>/<camelCaseName>.ts(x)`.
- Provider-independent infrastructure helpers: `src/components/atomic-crm/providers/commons/<camelCaseName>.ts`.
- Deno function helpers: `supabase/functions/_shared/<camelCaseName>.ts` when shared across deployable functions, or beside the owning function when local.

**New External Browser Integration:**
- Cross-feature client/service: `src/providers/<service>.ts` with a narrow exported API, following `src/providers/posthog.ts`.
- Feature-bound integration UI/hooks: Keep them under `src/components/atomic-crm/<feature>/` or a clearly wired provider subfolder, and declare the SDK in `package.json`.
- Configuration typing: Add public Vite variable declarations to `src/vite-env.d.ts` when the integration uses new `import.meta.env` keys.

**New Styles or Assets:**
- Cross-feature design tokens/classes: `src/styles/<design-system>.css`, imported once by `src/index.css`.
- Component-local styling: Tailwind classes in the owning component under `src/components/`.
- Stable public files: `public/` for icons, manifests, callback HTML, and assets addressed by fixed URL.
- Bundled imports: `src/assets/` for assets imported by TypeScript/CSS.

## Special Directories

**`src/components/admin/`:**
- Purpose: Vendored/mutable shadcn-admin-kit source that is part of the application architecture.
- Generated: No; registry tooling can package it through `scripts/generate-registry.mjs`.
- Committed: Yes; tracked source is consumed directly by `src/components/atomic-crm/`.

**`src/components/ui/`:**
- Purpose: Vendored/mutable Shadcn component source.
- Generated: Components may originate from Shadcn tooling, but the repository treats the files as editable source through `components.json`.
- Committed: Yes; tracked source is imported directly throughout `src/components/`.

**`supabase/migrations/`:**
- Purpose: Immutable ordered database history and deployable schema contract.
- Generated: Migration filenames can be scaffolded by Supabase CLI, while SQL content is maintained as source.
- Committed: Yes; deployment commands in `makefile` apply this directory.

**`supabase/functions/_shared/`:**
- Purpose: Shared Deno authentication, CORS, admin-client, database, user lookup, and response utilities.
- Generated: No.
- Committed: Yes; deployable functions import it with relative `.ts` paths.

**`public/`:**
- Purpose: Vite pass-through static assets and PWA/auth support files.
- Generated: Mostly no; `public/r/` is generated by Shadcn registry tooling and ignored through `.gitignore`.
- Committed: Yes, except generated `public/r/`.

**`registry.json`:**
- Purpose: Publish the CRM/admin/UI source as a Shadcn registry artifact.
- Generated: Yes, by `scripts/generate-registry.mjs` and the pre-commit hook in `.husky/pre-commit`.
- Committed: Yes; regenerate it when registry-owned source changes.

**`dist/` and `dist-*`/`dist_*` snapshots:**
- Purpose: Vite build output and local quality/verification snapshots.
- Generated: Yes, from `vite.config.ts`, `vite.demo.config.ts`, and local scan workflows.
- Committed: No for `dist/` because `.gitignore` excludes it; the timestamped/verification variants present in the working tree are untracked local artifacts.

**`.scan/`:**
- Purpose: Local build/lint/test/typecheck and audit receipts.
- Generated: Yes, by local quality scans outside the application runtime.
- Committed: No; current files are untracked and are not imported by `src/`.

**`.gitnexus/` and `.claude/skills/gitnexus/`:**
- Purpose: Local code-intelligence metadata and an associated Claude skill checkout.
- Generated: Yes, by local repository analysis tooling.
- Committed: No in the current working tree; neither directory participates in production entry points under `src/`.

**`.planning/codebase/`:**
- Purpose: Store GSD's current codebase maps for planning and execution agents.
- Generated: Yes, by the mapping workflow.
- Committed: Determined by the parent GSD orchestrator; application code does not import it.

**`node_modules/`:**
- Purpose: Installed NPM dependencies for frontend, tests, scripts, and build tooling.
- Generated: Yes, from `package-lock.json` and `package.json`.
- Committed: No; excluded by `.gitignore`.

**Environment configuration files:**
- Purpose: Supply local/build-time environment configuration referenced by `vite.config.ts`, `src/components/atomic-crm/providers/supabase/`, `src/providers/posthog.ts`, and Supabase Functions.
- Generated: No; environment files are operator-managed and their contents are outside this map.
- Committed: Varies by filename under `.gitignore`; never place environment values in `src/`, `doc/`, or `.planning/codebase/`.

---

*Structure analysis: 2026-08-20*
