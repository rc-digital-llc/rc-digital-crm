# Coding Conventions

**Analysis Date:** 2026-08-20

## Naming Patterns

**Files:**
- Use PascalCase for feature-level React component files under `src/components/atomic-crm/`, such as `src/components/atomic-crm/leads/LeadShow.tsx`, `src/components/atomic-crm/deals/DealList.tsx`, and `src/components/atomic-crm/settings/SettingsPage.tsx`.
- Use lower camelCase for hooks and non-component modules, such as `src/components/atomic-crm/contacts/useContactImport.tsx`, `src/components/atomic-crm/deals/dealUtils.ts`, `src/hooks/saved-queries.tsx`, and `src/lib/toSlug.ts`.
- Prefix custom hooks with `use`, matching `src/hooks/useBulkExport.tsx`, `src/hooks/use-mobile.ts`, and `src/components/atomic-crm/providers/hindsight/useHindsight.ts`.
- Preserve the lowercase hyphenated filenames used by the mutable framework layers in `src/components/admin/` and `src/components/ui/`, for example `src/components/admin/data-table.tsx`, `src/components/admin/simple-form-iterator.tsx`, and `src/components/ui/dropdown-menu.tsx`.
- Co-locate constants with their feature and use a descriptive suffix when useful, as in `src/components/atomic-crm/misc/unsupportedDomains.const.ts` and `src/components/atomic-crm/companies/sizes.ts`.
- Name co-located tests after the implementation with either `*.test.ts` or `*.spec.ts`; current examples include `src/components/atomic-crm/leads/leadScoring.test.ts` and `src/components/atomic-crm/deals/dealUtils.spec.ts`.

**Functions:**
- Use PascalCase for React components (`LeadConvert`, `CrmErrorBoundary`) and lower camelCase for helpers (`calculateInvoiceTotal`, `getDateRangeFilter`, `mergeContactData`). See `src/components/atomic-crm/leads/LeadConvert.tsx`, `src/components/atomic-crm/misc/CrmErrorBoundary.tsx`, and `src/components/atomic-crm/invoices/invoiceCalculations.ts`.
- Use a `use` prefix only for hooks that invoke React hooks, as demonstrated by `useSavedQueries` in `src/hooks/saved-queries.tsx` and `useHindsight` exports in `src/components/atomic-crm/providers/hindsight/useHindsight.ts`.
- Prefer named function declarations for reusable pure helpers and async operations, as in `src/lib/utils.ts`, `src/components/atomic-crm/providers/commons/getContactAvatar.ts`, and `supabase/functions/merge_contacts/index.ts`.
- Arrow functions are conventional for React components, callbacks, and short expressions, as in `src/App.tsx`, `src/lib/toSlug.ts`, and `src/components/atomic-crm/settings/SettingsPage.tsx`.

**Variables:**
- Use `const` by default and lower camelCase for local values, state, and service results; use `let` only for reassigned state such as the singleton client in `src/components/atomic-crm/providers/hindsight/hindsightClient.ts`.
- Name booleans with state-oriented prefixes such as `is`, `has`, or `can`, matching `isPending`, `hasError`, `isInitialized`, and `canAccess` in `src/components/atomic-crm/leads/LeadConvert.tsx`, `src/components/atomic-crm/misc/CrmErrorBoundary.tsx`, and `src/components/atomic-crm/providers/supabase/authProvider.ts`.
- Use uppercase snake case for module constants and configuration keys, such as `HINDSIGHT_ENABLED`, `BANKS`, `IS_INITIALIZED_CACHE_KEY`, and `CURRENT_SALE_CACHE_KEY` in `src/components/atomic-crm/providers/hindsight/hindsightClient.ts` and `src/components/atomic-crm/providers/supabase/authProvider.ts`.
- Prefix intentionally unused parameters or bindings with `_`; `eslint.config.js` permits `^_` for both variables and arguments.

**Types:**
- Use PascalCase for interfaces, type aliases, and generic type parameters. Domain records live primarily in `src/components/atomic-crm/types.ts` (`Contact`, `Deal`, `Lead`, `Touchpoint`), while module-specific props stay beside their implementation, as in `CrmErrorBoundary`'s `Props` and `State` in `src/components/atomic-crm/misc/CrmErrorBoundary.tsx`.
- Use `Props` or `<ComponentName>Props` for component contracts, such as `CompanyAsideProps` in `src/components/atomic-crm/companies/CompanyAside.tsx` and `TaskEditSheetProps` in `src/components/atomic-crm/tasks/TaskEditSheet.tsx`.
- Use `import type` or inline `type` imports for type-only dependencies. The rule is a warning across normal TypeScript files in `eslint.config.js`; examples appear in `src/components/atomic-crm/providers/supabase/dataProvider.ts` and `src/components/atomic-crm/settings/SettingsPage.tsx`.
- Prefer explicit return types for exported pure utilities and boundary functions when they clarify nullability or promises, as in `src/components/atomic-crm/invoices/invoiceCalculations.ts`, `src/lib/toSlug.ts`, and `supabase/functions/_shared/authentication.ts`.

## Code Style

**Formatting:**
- Run Prettier 3 using `.prettierrc.json`; the normal TypeScript/TSX style is two-space indentation, double quotes, semicolons, and trailing commas where supported.
- Keep the generated shadcn UI style under `src/components/ui/*.tsx`: two spaces, double quotes, no semicolons, LF endings, and ES5-compatible trailing commas. This override is defined in `.prettierrc.json` and is visible in `src/components/ui/sidebar.tsx`.
- Markdown and MDX use four-space indentation and single quotes where quote formatting applies, per `.prettierrc.json`.
- Use `npm run prettier` for a check and `npm run prettier:apply` for a mechanical rewrite. `make lint` runs both `npm run lint` and `npm run prettier` as defined in `Makefile`.
- Do not rely on the repository-wide Prettier command as a source-only check without reviewing its scope: `.prettierignore` excludes `dist` but not every dated `dist-*` artifact, and `.scan/audit.json` is not valid JSON, so the current `npm run prettier` check exits with an error before completing.

**Linting:**
- Use the ESLint 9 flat configuration in `eslint.config.js`, combining `@eslint/js`, `typescript-eslint`, React Hooks, React Refresh, and Storybook recommended rules.
- Keep code compatible with strict TypeScript settings from `tsconfig.app.json`: `strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, and `noUncheckedSideEffectImports` are enabled.
- Do not use `console.log`; `eslint.config.js` allows only `console.warn` and `console.error`. Use these at service/error boundaries such as `src/components/atomic-crm/providers/supabase/dataProvider.ts` and `src/components/atomic-crm/misc/CrmErrorBoundary.tsx`.
- Avoid explicit `any` in `src/components/admin/*`, `src/hooks/*`, and `src/lib/*`, where `@typescript-eslint/no-explicit-any` is an error. Elsewhere it is permitted, but keep it at third-party or serialization boundaries and prefer concrete domain types.
- Keep React hook dependencies accurate. Narrow `eslint-disable-next-line` comments to the exact exceptional line, following existing compatibility cases in `src/components/atomic-crm/contacts/useContactImport.tsx` and `src/components/admin/date-time-input.tsx`.
- Use `npm run lint` for ESLint only, `npm run typecheck` for TypeScript only, and `make lint` for the combined ESLint/Prettier gate. CI also runs lint, tests, and build as separate jobs in `.github/workflows/check.yml`.

**Styling:**
- Express component styling with Tailwind utility classes in `className`, as used throughout `src/components/atomic-crm/leads/LeadConvert.tsx` and `src/components/atomic-crm/misc/CrmErrorBoundary.tsx`.
- Use `cn` from `src/lib/utils.ts` when classes are conditional or must be merged safely with caller-provided classes.
- Build reusable variants with the conventions already present in `src/components/ui/`; do not introduce component-local CSS for patterns already represented by Tailwind utilities or shared UI primitives.

## Import Organization

**Order:**
1. Import runtime dependencies from React and other external packages first, with type-only imports kept explicit; see `src/components/atomic-crm/settings/ProfilePage.tsx` and `src/hooks/useSupportCreateSuggestion.tsx`.
2. Import application-wide modules through the `@/` alias next, such as `@/components/ui/button` and `@/providers/realtimeProvider` in `src/components/atomic-crm/deals/DealList.tsx`.
3. Import parent/sibling feature modules last with relative paths, such as `../types`, `../misc/CrmErrorBoundary`, and `./DealShow` in `src/components/atomic-crm/deals/DealList.tsx`.
4. Separate logical groups with a blank line when it improves readability. No `import/order` rule is configured in `eslint.config.js`, so follow the surrounding file when an existing module uses a slightly different order.

**Path Aliases:**
- Use `@/*` for cross-feature or root-level imports. `tsconfig.json`, `tsconfig.app.json`, and `vite.config.ts` all map `@/*` to `src/*`.
- Use relative imports for code within the same feature or a nearby parent directory; examples include `./leadStatuses` in `src/components/atomic-crm/leads/leadScoring.test.ts` and `../types` in `src/components/atomic-crm/deals/stages.test.ts`.
- Supabase Edge Functions use explicit `.ts` extensions and URL/JSR imports because they run under Deno, as shown in `supabase/functions/_shared/authentication.ts` and `supabase/functions/merge_contacts/index.ts`.

## Error Handling

**Patterns:**
- Fail fast on missing required configuration and invalid provider inputs by throwing an `Error`, as in `src/components/atomic-crm/providers/supabase/dataProvider.ts`, `src/components/atomic-crm/providers/fakerest/internal/transformInFilter.ts`, and `src/components/atomic-crm/deals/dealUtils.ts`.
- At UI mutation boundaries, convert failures into user-visible `useNotify` messages and keep success/refresh/redirect behavior in React Query or ra-core callbacks. Follow `src/components/atomic-crm/leads/LeadConvert.tsx`, `src/components/atomic-crm/settings/ProfilePage.tsx`, and `src/components/atomic-crm/contacts/ContactMergeButton.tsx`.
- Log diagnostic context at provider and infrastructure boundaries, then throw a stable domain-facing error. `src/components/atomic-crm/providers/supabase/dataProvider.ts` logs the underlying Supabase failure and throws messages such as `Failed to merge contacts`.
- Treat analytics and optional memory features as non-critical: catch their failures without blocking the primary operation, as in `src/components/atomic-crm/providers/supabase/authProvider.ts` and `src/components/atomic-crm/providers/hindsight/hindsightClient.ts`.
- Wrap render-heavy feature surfaces in `CrmErrorBoundary` from `src/components/atomic-crm/misc/CrmErrorBoundary.tsx`; it logs the error and provides a recoverable fallback UI.
- Return structured HTTP errors from Edge Functions with `createErrorResponse` and compose authentication/CORS middleware, following `supabase/functions/_shared/authentication.ts`, `supabase/functions/_shared/utils.ts`, and `supabase/functions/merge_contacts/index.ts`.

## Logging

**Framework:** `console.warn` and `console.error`; frontend analytics events use the wrapper in `src/providers/posthog.ts`.

**Patterns:**
- Use `console.error` for failures that need developer diagnosis at data, network, transaction, or render boundaries; include a stable operation label as in `merge_contacts.error` in `src/components/atomic-crm/providers/supabase/dataProvider.ts`.
- Use `console.warn` for degraded optional behavior that falls back safely, such as Hindsight recall/retain failures in `src/components/atomic-crm/providers/hindsight/hindsightClient.ts`.
- Do not log routine control flow or user data. Surface actionable UI feedback through ra-core `useNotify` and track product events through `analytics` in `src/providers/posthog.ts`.

## Comments

**When to Comment:**
- Comment the reason for unusual behavior, compatibility constraints, security boundaries, or non-obvious business rules. Examples include the authentication cache rationale in `src/components/atomic-crm/providers/supabase/authProvider.ts` and the RLS transaction steps in `supabase/functions/merge_contacts/index.ts`.
- Keep comments synchronized with cross-layer contracts. `src/lib/toSlug.ts` explicitly identifies the migration whose SQL slug behavior must remain aligned.
- Use TODO/FIXME only for a concrete remaining action and include context when possible, following `src/components/atomic-crm/providers/commons/getContactAvatar.ts` and `src/components/admin/select-input.tsx`.
- Avoid narrating straightforward JSX or assignments; prefer extracted names and types. Existing numbered comments in complex provider/Edge Function flows are the exception, as in `supabase/functions/merge_contacts/index.ts`.

**JSDoc/TSDoc:**
- Use JSDoc for public entry points, reusable compatibility shims, and deprecations. `src/App.tsx` documents CRM customization and `src/hooks/saved-queries.tsx` documents replacements for deprecated helpers.
- Put `@deprecated` on the declaration with the replacement path so editors can guide migration, matching `src/hooks/useBulkExport.tsx` and `src/hooks/simple-form-iterator-context.tsx`.
- Routine private components and obvious helpers do not require JSDoc; their types and names are the primary documentation.

## Function Design

**Size:** Extract deterministic business rules into small pure helpers that can be tested without rendering or a backend. Examples include `src/components/atomic-crm/invoices/invoiceCalculations.ts`, `src/components/atomic-crm/deals/dealUtils.ts`, and `src/lib/toSlug.ts`. Keep orchestration near the feature boundary and split nested UI sections into local components when a screen grows, as in `src/components/atomic-crm/companies/CompanyShow.tsx`.

**Parameters:** Destructure component props at the function boundary and define a nearby props type when the shape is reused or non-trivial. Use explicit domain records from `src/components/atomic-crm/types.ts`, and group service options into an object as in `retainMemory` in `src/components/atomic-crm/providers/hindsight/hindsightClient.ts`.

**Return Values:** Make absence explicit with `undefined` or `null` in the return type, use early returns for guard cases, and return stable domain objects from calculations/providers. See `getContactAvatar` in `src/components/atomic-crm/providers/commons/getContactAvatar.ts`, `getIsInitialized` in `src/components/atomic-crm/providers/supabase/authProvider.ts`, and `calculateInvoiceTotal` in `src/components/atomic-crm/invoices/invoiceCalculations.ts`.

## Module Design

**Exports:** Prefer named exports for components, hooks, providers, types, constants, and utilities so feature dependencies are explicit. `src/App.tsx` is the main default-export exception; some legacy image/editor modules also use defaults, so preserve the local convention when editing them.

**Barrel Files:** Use feature barrels only for deliberate public surfaces. Broad framework exports live in `src/components/admin/index.ts`; smaller provider and domain barrels live in `src/components/atomic-crm/providers/supabase/index.ts`, `src/components/atomic-crm/providers/fakerest/index.ts`, and feature `index.ts` files. Within a feature, direct relative imports remain common and avoid accidental barrel cycles.

---

*Convention analysis: 2026-08-20*
