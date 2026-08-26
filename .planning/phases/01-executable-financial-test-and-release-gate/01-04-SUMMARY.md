---
phase: 01-executable-financial-test-and-release-gate
plan: 04
subsystem: database-authorization-assurance
tags: [supabase, pgtap, auth, rls, postgrest, rpc, triggers]

requires:
  - phase: 01-02
    provides: Disposable local Supabase lanes and live migration contracts
provides:
  - Live PostgreSQL grants and two-owner RLS proof under representative JWT claims
  - RPC success, denial, failure atomicity, and trigger-effect proof
  - Real local Auth JWT, PostgREST, and RPC boundary integration proof
affects: [database-release-gate, tenancy, privileged-functions, release-receipts]

tech-stack:
  added: []
  patterns:
    - Test-only SQL principals loaded by the disposable lane wrapper
    - Real local email/password Auth sessions with in-memory bearer tokens
    - Exact before/after side-effect assertions across trust boundaries

key-files:
  created:
    - supabase/tests/support/auth-fixtures.sql
    - supabase/tests/database/10_authorization_rls.sql
    - supabase/tests/database/20_rpc_trigger.sql
    - tests/release/auth-rls-rpc-trigger.test.ts
    - supabase/migrations/20260825000002_harden_lead_api_grants.sql
  modified:
    - scripts/release/run-supabase-lane.mjs
    - supabase/tests/baselines/001-pre-financial/expected-fingerprints.json
    - supabase/tests/baselines/001-pre-financial/manifest.json
    - makefile

key-decisions:
  - "Load deterministic SQL-only identities outside production migrations and destroy the whole local stack after each assertion run."
  - "Treat cross-owner invisibility plus exact unchanged effect counts as the HTTP denial proof, not status codes alone."
  - "Record the new authenticated lead grants as an explicit baseline upgrade transformation while preserving every other fingerprint category."

patterns-established:
  - "Authorization lanes prove the same policy internally with pgTAP and externally with real Auth JWTs."
  - "Tokens remain in memory, are never snapshotted or printed, and are invalidated before stack teardown."

requirements-completed: []
requirements-progressed: [REL-02, REL-03]

duration: 14min
completed: 2026-08-25
---

# Phase 1 Plan 04: Live Authorization Boundary Summary

**Seventy-five live PostgreSQL assertions and a real two-principal Auth/PostgREST flow now prove same-owner access, cross-owner denial, privileged RPC behavior, trigger effects, and failure atomicity**

## Performance

- **Duration:** 14 min
- **Started:** 2026-08-25T17:25:00-07:00
- **Completed:** 2026-08-25T17:39:00-07:00
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Added deterministic two-user/two-owner SQL fixtures in a test-only schema loaded only by the disposable database lane.
- Added pgTAP coverage for authenticated/anonymous grants, same-owner and cross-owner lead access and mutations, secured conversion RPC execution, exact success effects, forced-failure rollback, lead scoring, and attribution flags.
- Added real local Auth signup and password sign-in for two principals, then exercised REST selection/mutation, conversion RPC, and touchpoint triggers using distinct bearer JWTs.
- Asserted cross-owner and invalid-token denials against resulting database state, including zero unauthorized company, contact, deal, or activity effects.
- Narrowed lead API grants so PostgreSQL RLS can govern authenticated requests while anonymous reads and direct trigger-function execution remain denied.
- Preserved upgrade assurance by declaring only the intentional grant-matrix transition; the other six baseline fingerprint categories remain byte-identical.

## Task Commits

1. **Task 1: Add pgTAP claims, RLS, grants, RPC, and trigger contracts** - `a285033`, `a4dd483`, `8d6f337`, `966b082`
2. **Task 2: Prove authorization through local Auth and HTTP APIs** - `0cb6116`

## Verification

- `make test-financial-database-sql` — PASS, 3 files and 75 assertions
- `make test-financial-database-http` — PASS, 2 real local Auth principals and 1 end-to-end boundary test
- `make test-financial-migration-upgrade` — PASS, one declared grant transformation and six preserved categories
- Targeted Prettier and ESLint checks — PASS

## Deviations from Plan

### Auto-fixed Issues

**1. Recursive SQL discovery executed support and baseline files as TAP suites**

- **Found during:** Task 1 first live run
- **Issue:** The default database test command recursively discovered non-TAP support and baseline SQL.
- **Fix:** Scoped the Make target to `supabase/tests/database` while the lane wrapper loads support fixtures explicitly.
- **Verification:** Only the three declared database contract files execute and all 75 assertions pass.
- **Committed in:** `a4dd483`

**2. RLS policies existed without the authenticated table and sequence grants required by PostgREST**

- **Found during:** Task 1 live role execution
- **Issue:** Authenticated callers were denied at PostgreSQL privileges before owner policies could be evaluated.
- **Fix:** Added a production migration granting only the lead resources required by the existing owner policies, revoking anonymous access and direct trigger execution.
- **Verification:** Same-owner calls pass, cross-owner calls remain invisible/unchanged, and anonymous calls return 401/403.
- **Committed in:** `8d6f337`

**3. The authorization fix intentionally changed the upgrade grant fingerprint**

- **Found during:** Task 1 upgrade-gate verification
- **Issue:** The immutable baseline correctly rejected the new grant matrix as undeclared drift.
- **Fix:** Recorded the exact before/after grant hashes and migration identity in baseline 001's transformation map.
- **Verification:** Live upgrade proof passes with only `grant_matrix` marked transformed.
- **Committed in:** `966b082`

---

**Total deviations:** 3 auto-fixed release-assurance defects
**Impact on plan:** All fixes were required to execute the planned trust-boundary tests and tightened rather than broadened anonymous authority.

## User Setup Required

None. All identities, rows, passwords, and tokens are synthetic, local-only, and destroyed with the disposable stack.

## Next Phase Readiness

- The REL-02 database-side PostgreSQL, RLS, RPC, trigger, and Auth/PostgREST portion is complete; Edge/provider and concurrency proof remains in Plans 05 and 06.
- Plans 01-05 and 01-06 can reuse the exact-once lane runner and test-only database fixture pattern for Edge/provider and replay/concurrency contracts.
- REL-03 remains pending until the complete six-lane CI workflow is wired and verified in Plan 09.

---
*Phase: 01-executable-financial-test-and-release-gate*
*Completed: 2026-08-25*
