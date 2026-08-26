---
phase: 01-executable-financial-test-and-release-gate
plan: 03
subsystem: database-upgrade-assurance
tags: [supabase, baseline, fingerprints, migrations, synthetic-fixtures]

requires:
  - phase: 01-02
    provides: Executable clean migration chain and isolated local database lane
provides:
  - Immutable pre-financial baseline 001 at migration 20260825000001
  - Deterministic production-like synthetic upgrade fixtures
  - Append-only manifest and base-ref enforcement
  - Seven-category live before/after upgrade fingerprint proof
affects: [future-financial-migrations, database-release-gate, release-receipts]

tech-stack:
  added: []
  patterns:
    - Schema-only pg_dump plus explicit application-owned cross-schema bindings
    - Exact PostgreSQL text preservation for financial numeric values
    - Docker-executed psql with canonical Node SHA-256 fingerprints

key-files:
  created:
    - supabase/tests/baselines/001-pre-financial/manifest.json
    - supabase/tests/baselines/001-pre-financial/schema.sql
    - supabase/tests/baselines/001-pre-financial/migration-history.sql
    - supabase/tests/baselines/001-pre-financial/fixtures.sql
    - supabase/tests/baselines/001-pre-financial/expected-fingerprints.json
    - scripts/release/verify-baseline.mjs
    - scripts/release/fingerprint-upgrade.mjs
    - tests/release/migration-upgrade.test.ts

key-decisions:
  - "Freeze the full current application schema as the pre-financial cutoff; later financial migrations are pending upgrades from baseline 001."
  - "Preserve database numerics as PostgreSQL text or textual row payloads before hashing; never round-trip them through JavaScript numbers."
  - "Reject any edit to an accepted baseline directory relative to the PR base, even when its manifest is co-edited."

patterns-established:
  - "Accepted baseline evolution is append-only: new schema milestones add numbered directories."
  - "Upgrade proof names each failed preservation category and emits only hashes, never fixture contents."

requirements-completed: [REL-01]

duration: 19min
completed: 2026-08-25
---

# Phase 1 Plan 03: Immutable Representative Upgrade Summary

**Baseline 001 reconstructs the complete pre-financial application schema with deterministic synthetic facts and proves all seven D-08 preservation categories across a live upgrade**

## Performance

- **Duration:** 19 min
- **Started:** 2026-08-25T16:58:00-07:00
- **Completed:** 2026-08-25T17:17:00-07:00
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Captured the application-owned schema, grants, policies, functions, triggers, and realtime bindings at cutoff `20260825000001` without Auth rows, Storage objects, or customer data.
- Added fixed synthetic fixtures covering two owners, four mutable invoice states, optional/orphan relationships, `0.01` and `9999999999999.99` numeric boundaries, non-ASCII text, projects, analytics, leads, activities, and attribution.
- Added a manifest verifier that hashes every companion file, checks exact migration/fixture/fingerprint coverage, rejects unsafe fixture domains/provider-like data, and blocks any accepted-baseline co-edit against a base ref.
- Added live Docker/psql orchestration that reconstructs baseline 001, captures canonical pre-state, applies pending migrations exactly once, captures post-state, and compares seven independent preservation categories.
- Added targeted mutation tests for every fingerprint category and exact PostgreSQL numeric-text preservation.

## Task Commits

Each task was committed atomically:

1. **Task 1: Capture and lock baseline 001** - `82f36e4` (failing verifier), `200091a` (baseline assets)
2. **Task 2: Execute canonical before/after upgrade fingerprints** - `b66ecff` (failing contracts), `f89fc74` (implementation and deterministic fixture correction)

## Files Created/Modified

- `supabase/tests/baselines/001-pre-financial/schema.sql` - Self-contained application schema/grants snapshot plus application-owned Auth triggers and realtime membership.
- `supabase/tests/baselines/001-pre-financial/migration-history.sql` - Exact 32-version Supabase migration history through the cutoff.
- `supabase/tests/baselines/001-pre-financial/fixtures.sql` - Fixed reserved-domain production-like synthetic records.
- `supabase/tests/baselines/001-pre-financial/expected-fingerprints.json` - Versioned expected hashes and explicit transformation map.
- `supabase/tests/baselines/001-pre-financial/manifest.json` - Cutoff, coverage, file hashes, migration versions, and fingerprint identity.
- `scripts/release/verify-baseline.mjs` - Integrity, fixture safety, and append-only base-ref verifier.
- `scripts/release/fingerprint-upgrade.mjs` - Live baseline loader, migration runner, canonical category capture, and comparison report.
- `tests/release/migration-upgrade.test.ts` - Category mutation, numeric-text, and process-boundary contracts.

## Decisions Made

- Used the complete current schema as the pre-financial baseline because no Phase 2 money-bearing migrations exist yet; future migrations become the pending upgrade set without rewriting baseline 001.
- Loaded the snapshot only into the disposable lane database after a loopback/container identity check and used explicit `docker exec ... psql` argv, avoiding a host psql dependency.
- Kept row payloads as PostgreSQL-produced JSON text before Node hashing so large decimals and bigint-like values cannot be rounded by JavaScript.
- Compared row identities/counts, ownership links, invoice numerics, payload hashes, constraints, grants, and queryability separately so a single aggregate digest cannot hide the failed dimension.

## Deviations from Plan

### Auto-fixed Issues

**1. Public-schema dump omitted application-owned Auth triggers and realtime membership**

- **Found during:** Task 1 snapshot review
- **Issue:** A schema-filtered dump correctly excluded Auth/Storage objects but also omitted triggers attached to `auth.users` and publication membership owned by the application.
- **Fix:** Added only the two application functions' Auth trigger bindings and the explicit public-table realtime membership after the generated schema snapshot.
- **Verification:** The baseline loads from a fresh system stack and both Auth triggers are recreated without Auth data.
- **Committed in:** `200091a`

**2. Lead scoring made fixture timestamps nondeterministic**

- **Found during:** Task 2 first live fingerprint run
- **Issue:** Inserting lead activities updated `leads.updated_at` through the scoring/timestamp trigger using wall-clock time, causing row payload drift between runs.
- **Fix:** Restored the declared fixed timestamps with the timestamp trigger temporarily disabled inside the fixture transaction.
- **Verification:** Fresh live lane before/after hashes now match exactly across repeated reconstruction.
- **Committed in:** `f89fc74`

---

**Total deviations:** 2 auto-fixed blocking fidelity defects
**Impact on plan:** Both fixes strengthen the planned deterministic, reconstructable baseline without adding production behavior.

## Issues Encountered

- The current cutoff has no pending application migrations because Phase 2 has not begun. The lane still executes `supabase migration up --local` once and proves exact preservation; future migrations automatically exercise the same immutable baseline path.

## User Setup Required

None - all baseline data is synthetic and the lane owns its disposable local database lifecycle.

## Next Phase Readiness

- REL-01 is complete: both blank replay and representative prior-schema upgrade are executable and blocking.
- Plans 01-04 through 01-06 can reuse baseline owner IDs and the isolated Docker/psql pattern for authorization and concurrency proof.
- Any future accepted schema milestone must add baseline 002 or later; baseline 001 is now append-only.

---
*Phase: 01-executable-financial-test-and-release-gate*
*Completed: 2026-08-25*
