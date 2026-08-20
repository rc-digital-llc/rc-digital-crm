# Testing Patterns

**Analysis Date:** 2026-08-20

## Test Framework

**Runner:**
- Vitest 3.2.4, declared in `package.json` and invoked by the `test` script.
- There is no dedicated `vitest.config.*`; Vitest inherits Vite/TypeScript resolution from `vite.config.ts` and `tsconfig.app.json`.
- The effective environment is Vitest's Node environment. This matches filesystem-based migration tests in `src/components/atomic-crm/leads/securityChecklist.test.ts` and the Node Web Crypto setup in `src/components/atomic-crm/providers/commons/getContactAvatar.spec.ts`.
- `tsconfig.app.json` includes `vitest/globals`, so `describe`, `it`, `expect`, and `vi` may be global. Most newer tests still import `describe`, `it`, and `expect` explicitly from `vitest`; `src/components/atomic-crm/providers/fakerest/internal/supabaseAdapter.spec.ts` demonstrates global `vi` usage.

**Assertion Library:**
- Vitest's built-in `expect` API. Current tests use `toBe`, `toEqual`, `toStrictEqual`, `toContain`, `toMatch`, `toBeCloseTo`, `toThrow`, `resolves`, and spy assertions such as `toHaveBeenCalledWith`.
- `@testing-library/jest-dom` is installed in `package.json`, but no setup file or current test imports it. There are no DOM-rendering tests in the repository.

**Run Commands:**
```bash
npm test -- --run       # Run all tests once; verified 19 files / 176 tests
npm test                # Start Vitest in its normal local interactive/watch mode
make test               # Project wrapper around npm test
make test-ci            # CI mode: CI=1 npm test
npm run typecheck       # Strict TypeScript verification
npm run lint            # ESLint verification only
make lint               # ESLint plus repository-wide Prettier check
npm run build           # TypeScript compile plus production Vite build
```

## Test File Organization

**Location:**
- Co-locate tests beside the implementation under `src/components/atomic-crm/`; there is no separate `tests/` tree.
- Pure domain/configuration tests live in their feature directories, such as `src/components/atomic-crm/invoices/invoiceCalculations.test.ts`, `src/components/atomic-crm/leads/leadStatuses.test.ts`, and `src/components/atomic-crm/settings/SettingsPage.test.ts`.
- Provider adapter tests live beside the provider internals, such as `src/components/atomic-crm/providers/fakerest/internal/supabaseAdapter.spec.ts` and `src/components/atomic-crm/providers/fakerest/internal/transformOrFilter.spec.ts`.
- SQL migration contract tests are TypeScript tests co-located with the frontend feature that depends on the migration, such as `src/components/atomic-crm/leads/leadConversion.test.ts` and `src/components/atomic-crm/attribution/attributionTriggers.test.ts`.

**Naming:**
- Both `<module>.test.ts` and `<module>.spec.ts` are accepted by Vitest and used in the repository.
- Use `.test.ts` for current domain/configuration contracts and `.spec.ts` for the older provider/helper convention. Match neighboring files rather than introducing a third suffix.
- No current test file uses `.test.tsx` or `.spec.tsx`, because the suite tests exported logic without rendering React components.

**Structure:**
```text
src/components/atomic-crm/<feature>/
├── FeatureComponent.tsx
├── helper.ts
├── helper.test.ts
└── relatedContract.test.ts

src/components/atomic-crm/providers/<provider>/internal/
├── adapter.ts
└── adapter.spec.ts
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, expect, it } from "vitest";
import { calculateInvoiceTotal } from "./invoiceCalculations";

describe("calculateInvoiceTotal", () => {
  it("returns correct totals with 10% tax", () => {
    const result = calculateInvoiceTotal(5000, 10);

    expect(result.taxAmount).toBe(500);
    expect(result.totalAmount).toBe(5500);
  });
});
```
- This mirrors the focused arrange/act/assert style in `src/components/atomic-crm/invoices/invoiceCalculations.test.ts` and `src/components/atomic-crm/settings/SettingsPage.test.ts`.

**Patterns:**
- Group behavior under `describe` when a module exposes several cases or functions; top-level `it` is acceptable for small single-helper specs such as `src/components/atomic-crm/providers/fakerest/internal/transformInFilter.spec.ts`.
- Give cases behavior-oriented names that identify the input/boundary and result. Boundary values are explicit in `src/components/atomic-crm/leads/LeadScoreBadge.test.ts` and `src/components/atomic-crm/leads/leadStatuses.test.ts`.
- Keep fixtures local and deterministic. Reusable object construction within one file uses small factories such as `makeDeal` and `makeStages` in `src/components/atomic-crm/deals/stages.test.ts`.
- Prefer direct outputs and observable collaborator calls over implementation details. `src/components/atomic-crm/providers/fakerest/internal/supabaseAdapter.spec.ts` checks both the returned promise and the transformed `DataProvider` call.
- There is no shared global setup or teardown file. Restore any mutated process/global state inside the test, as `src/components/atomic-crm/deals/dealUtils.spec.ts` does with `process.env.TZ` in `finally`.

## Mocking

**Framework:** Vitest `vi.fn`; no current suite uses module-level `vi.mock` or a separate mocking library.

**Patterns:**
```typescript
import type { DataProvider } from "ra-core";

it("transforms a provider filter", async () => {
  const getList = vi.fn();
  const provider = { getList } as unknown as DataProvider;
  getList.mockResolvedValueOnce([{ id: 1 }]);

  const adapted = withSupabaseFilterAdapter(provider);

  await expect(
    adapted.getList("resource", { filter: { "id@in": "(1,2)" } }),
  ).resolves.toEqual([{ id: 1 }]);
  expect(getList).toHaveBeenCalledWith("resource", {
    filter: { id_eq_any: [1, 2] },
  });
});
```
- The collaborator seam comes from `src/components/atomic-crm/providers/fakerest/internal/supabaseAdapter.spec.ts`; always make the test `async` and `await` promise matchers.
- Current assertions in `src/components/atomic-crm/providers/fakerest/internal/supabaseAdapter.spec.ts` omit `await`, and the verified test run emits an unawaited-`resolves` warning for those cases. Do not copy that omission into new tests.
- Patch missing platform primitives locally when needed. `src/components/atomic-crm/providers/commons/getContactAvatar.spec.ts` assigns Node's `webcrypto` to `globalThis.crypto`.

**What to Mock:**
- Mock provider/network collaborators when the unit under test is an adapter and the contract is the translated call, as in `src/components/atomic-crm/providers/fakerest/internal/supabaseAdapter.spec.ts`.
- Mock or inject time when exact timestamps matter. Existing date-range tests in `src/components/atomic-crm/attribution/dateRange.test.ts` and `src/components/atomic-crm/attribution/attributionDashboard.test.ts` instead use tolerance windows around `Date.now()`.
- Supply Node equivalents for unavailable browser APIs only at the narrow test boundary, as in `src/components/atomic-crm/providers/commons/getContactAvatar.spec.ts`.

**What NOT to Mock:**
- Do not mock deterministic business helpers; call them directly as in `src/components/atomic-crm/invoices/invoiceCalculations.test.ts`, `src/components/atomic-crm/deals/stages.test.ts`, and `src/components/atomic-crm/leads/LeadScoreBadge.test.ts`.
- Do not parse or reconstruct migrations in tests. Read the actual file from `supabase/migrations/` and assert the security/business contract, following `src/components/atomic-crm/leads/securityChecklist.test.ts`.
- Avoid live remote dependencies for new unit tests. `src/components/atomic-crm/providers/commons/getContactAvatar.spec.ts` currently exercises real fetch behavior, making it the exception rather than a reusable isolation pattern.

## Fixtures and Factories

**Test Data:**
```typescript
const makeDeal = (overrides: Partial<Deal> & { id: number }): Deal => ({
  name: "Test Deal",
  stage: "lead",
  amount: 1000,
  index: 0,
  // other required Deal fields
  ...overrides,
});
```
- This is the local factory pattern used in `src/components/atomic-crm/deals/stages.test.ts`: provide valid defaults, require the identifying field, and apply case-specific overrides last.
- Small table/config inputs are declared as local constants inside a suite, as with the `deals` fixture in `src/components/atomic-crm/settings/SettingsPage.test.ts`.
- SQL tests share a tiny `readMigration(filename)` helper within each test file, as in `src/components/atomic-crm/leads/leadConversion.test.ts` and `src/components/atomic-crm/attribution/attributionTriggers.test.ts`.

**Location:**
- Fixtures and factories are local to their test file. No shared fixture/factory directory is present.
- Development/demo data generators under `src/components/atomic-crm/providers/fakerest/dataGenerator/` support the FakeRest application but are not imported as unit-test fixtures.
- `test-data/contacts.csv` is manual CRM import data documented by `AGENTS.md`; it is not consumed by the automated Vitest suite.

## Coverage

**Requirements:** None enforced. `package.json` has no coverage script or direct `@vitest/coverage-v8`/`@vitest/coverage-istanbul` dependency, `vitest.config.*` is absent, and `.github/workflows/check.yml` does not upload or threshold coverage.

**View Coverage:**
```bash
# Not currently configured. Add a Vitest coverage provider and a package.json
# script before treating `vitest run --coverage` as a project command.
```
- Until coverage is configured, use the verified file/test counts only as execution evidence, not as line or branch coverage evidence.

## Test Types

**Unit Tests:**
- Pure calculations, mapping, validation, status/configuration boundaries, and formatting make up most of the suite. Representative files are `src/components/atomic-crm/invoices/invoiceCalculations.test.ts`, `src/components/atomic-crm/deals/stages.test.ts`, `src/components/atomic-crm/settings/SettingsPage.test.ts`, and `src/components/atomic-crm/leads/LeadScoreBadge.test.ts`.
- Provider transformation specs use `vi.fn` collaborators but remain unit tests; see `src/components/atomic-crm/providers/fakerest/internal/supabaseAdapter.spec.ts`.
- Extract non-rendering logic from React modules as named exports when it needs focused tests. `getScoreConfig` in `src/components/atomic-crm/leads/LeadScoreBadge.tsx` and `validateItemsInUse` in `src/components/atomic-crm/settings/SettingsPage.tsx` follow this pattern.

**Integration Tests:**
- Static migration contract tests read real SQL files and assert required functions, triggers, policies, and security clauses. These provide cross-layer contract coverage without starting Supabase; see `src/components/atomic-crm/leads/securityChecklist.test.ts`, `src/components/atomic-crm/leads/leadConversion.test.ts`, and `src/components/atomic-crm/attribution/attributionTriggers.test.ts`.
- There are no automated tests that start local Supabase, execute migrations against PostgreSQL, call Edge Functions, render React with a data provider, or verify browser behavior.

**E2E Tests:**
- Not used. No Playwright or Cypress configuration/test tree is present, and `.github/workflows/check.yml` runs only lint, Vitest, and build gates.

## Common Patterns

**Async Testing:**
```typescript
it("returns an avatar URL", async () => {
  const avatarUrl = await getContactAvatar(record);
  expect(avatarUrl).toBe(expectedUrl);
});

it("resolves through an adapter", async () => {
  await expect(adapterCall()).resolves.toEqual(expectedResult);
});
```
- Await the operation itself for async helpers, following `src/components/atomic-crm/providers/commons/getContactAvatar.spec.ts`.
- Await `resolves` and `rejects` matchers. The present unawaited matchers in `src/components/atomic-crm/providers/fakerest/internal/supabaseAdapter.spec.ts` pass today but generate Vitest warnings and are not the pattern to extend.

**Error Testing:**
```typescript
it("throws for an invalid date string", () => {
  expect(() => formatISODateString("invalid-date")).toThrow(
    "Invalid date format. Expected YYYY-MM-DD.",
  );
});
```
- Assert both that validation fails and that the stable message identifies the violated contract, following `src/components/atomic-crm/deals/dealUtils.spec.ts` and `src/components/atomic-crm/providers/fakerest/internal/transformInFilter.spec.ts`.

**Migration Contract Testing:**
```typescript
const migrationsDir = path.resolve(__dirname, "../../../../supabase/migrations");
const sql = fs.readFileSync(path.join(migrationsDir, filename), "utf-8");

expect(sql).toContain("SECURITY DEFINER");
```
- Assert externally important SQL clauses rather than incidental whitespace. Security checks combine substring and regular-expression assertions in `src/components/atomic-crm/leads/securityChecklist.test.ts`.

## Verification Status

- `npm test -- --run` passes 19 test files and 176 tests on 2026-08-20; the run reports warnings for unawaited promise assertions in `src/components/atomic-crm/providers/fakerest/internal/supabaseAdapter.spec.ts`.
- `npm run typecheck` passes on 2026-08-20 using `tsconfig.app.json` and `tsconfig.node.json`.
- `npm run lint` passes on 2026-08-20, with an ESLint warning that `.eslintignore` is unsupported under the flat-config setup in `eslint.config.js`.
- `npm run prettier` does not pass on 2026-08-20 because the repository-wide glob reaches malformed `.scan/audit.json` and multiple generated `dist-*` trees not covered by `.prettierignore`.
- CI runs `make test-ci` on Node 20 and independently requires lint and `npm run build`, as defined in `.github/workflows/check.yml`.

---

*Testing analysis: 2026-08-20*
