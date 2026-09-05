---
phase: 03-exact-money-and-rounding-contract
fixed_at: 2026-09-05T02:38:08Z
review_path: .planning/phases/03-exact-money-and-rounding-contract/03-REVIEW.md
iteration: 3
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 03: Code Review Fix Report

**Fixed at:** 2026-09-05T02:38:08Z  
**Source review:** `.planning/phases/03-exact-money-and-rounding-contract/03-REVIEW.md`  
**Iteration:** 3

**Summary:**

- Findings in scope: 2
- Fixed: 2
- Skipped: 0
- Reviewed branch head: `1287b0758d44b8d51fde723f0eb3f5bdafc82b39`
- Review source head: `e191f9fb2abdabdcacdc0c4b48c7bc1310cf93cd`
- Final source head: `9d94dbb11020df3c324cdfc2cba01f5f5618f40b`

## Fixed Issues

### CR-01: The classified NULL-date abort leaves the first Phase-3 migration committed

**Status:** fixed: requires human verification  
**Files modified:** `scripts/release/fingerprint-upgrade.mjs`, `supabase/migrations/20260902000001_exact_financial_primitives.sql`, `supabase/tests/upgrades/003-exact-money/expected-transformations.json`, `tests/release/migration-upgrade.test.ts`, `tests/release/exact-money-release-static.test.ts`  
**Commit:** `419f6cde6e8fe6e967b8c7b8004546efe9d86460`  
**Applied fix:** Adds the classified `EXACT_BILLING_LEGACY_ISSUE_DATE_REQUIRED` preflight at the start of migration `20260902000001`, before any Phase 3 schema, seed-data, trigger, policy, or private-function mutation, while retaining the independent guard in `20260902000002` against intervening drift. The upgrade verifier now resets both disposable `public` and `private` baseline schemas before replaying held pre-Phase-3 migrations, then proves the expected abort leaves both Phase 3 migration records absent along with the representative policy table, `usd-v1` seed, canonical integer helper, exact invoice column, and save RPC. It restores the fixture to the exact captured historical date and proves the subsequent full chain succeeds. Registry `003` now records the `legacy_issue_date_preflight_atomic` semantic invariant. No date is guessed or imputed.

Deterministic final digests:

- `20260902000001_exact_financial_primitives.sql`: `b5bfb328f5686f9169ba68ef9a450a023304c5437ce79fb3a79a0af8c5795159`
- `20260902000002_exact_billing_expand.sql` (retained guard): `3e295c66820ee76726cda915f3cc9f1c380fd389649f932bc708d849763e8320`
- `003-exact-money/expected-transformations.json`: `a585995ad2100934ef1df99cdc0203efb2ac8793f22ea558289f7975ca6fed6e`
- Integrated upgrade report: `872457eeaf66141547c77ad4f0c5bc5a43656ab21835fa346a6c2ac4fdd0bf49`

### WR-01: Year-zero dates still break SQL/provider parity

**Status:** fixed: requires human verification  
**Files modified:** `src/components/atomic-crm/providers/types.ts`, `src/components/atomic-crm/providers/supabase/dataProvider.ts`, `src/components/atomic-crm/providers/fakerest/dataProvider.ts`, `src/components/atomic-crm/financial/exactProviderContract.test.ts`, `supabase/tests/database/65_exact_billing_conversion.sql`, `tests/release/exact-money-boundaries.test.ts`, `tests/release/exact-money-release-static.test.ts`  
**Commit:** `9d94dbb11020df3c324cdfc2cba01f5f5618f40b`  
**Applied fix:** Defines one shared TypeScript canonical invoice-date predicate for the four-digit PostgreSQL AD range `0001-01-01` through `9999-12-31`, and routes both Supabase and FakeRest validation through it before dispatch or mutation. Shared provider, direct SQL, and live PostgREST matrices now reject `issue_date: "0000-01-01"` and `due_date: "0000-02-29"` with stable request/public errors and byte-identical effect snapshots. Valid lower/upper endpoints and existing leap-date behavior remain accepted. The locked SQL canonical-date helper remains the server-side authority.

## Verification

The complete command `CI=1 make financial-gate && npm run typecheck && npm run lint && npm run build` passed at `9d94dbb11020df3c324cdfc2cba01f5f5618f40b` in a fresh single-branch clone:

- Clean migration chain: 42/42 migrations, first attempt
- Isolated schema push: 42/42 migrations, first attempt
- Staged upgrade: one expected pre-`00001` classified abort, one successful assertion attempt, 24/24 semantic invariants
- Upgrade verifier unit tests: 37/37
- Database SQL assertions: 484/484
- Auth, PostgREST, and provider assertions: 29/29
- Edge and evidence function assertions: 10/10
- Replay/concurrency SQL assertions: 18/18
- Replay/concurrency Vitest assertions: 8/8
- Fast financial/security assertions: 140/140
- Total executable assertions/tests: 726/726
- Dependency gate: 0 critical, 0 high
- Single-ref secret-history and current-tree gates: 0 findings
- Built-bundle gate: 54 files checked
- Automation-identity coupling gate: 6 workflows checked
- Typecheck, lint, and production build: passed

Focused verification also passed: upgrade/static 52/52; provider/boundary/static 33 passed with 8 intentionally environment-skipped; pgTAP 484/484; live Auth/PostgREST/provider 29/29. The lint lane retained three pre-existing Fast Refresh warnings and no errors. The build retained existing CSS import-order, bundle-size, deprecation, and browser-data freshness warnings but exited successfully.

No rendered UI file changed. No hosted service, remote Supabase project, deployment, push, pull request, merge, production mutation, or secret was accessed.

---

_Fixed: 2026-09-05T02:38:08Z_  
_Fixer: the agent (gsd-code-fixer)_  
_Iteration: 3_
