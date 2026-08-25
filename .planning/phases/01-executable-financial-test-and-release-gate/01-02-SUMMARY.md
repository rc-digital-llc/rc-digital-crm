---
phase: 01-executable-financial-test-and-release-gate
plan: 02
subsystem: database-release-assurance
tags: [supabase, migrations, pgtap, security-definer, schema-push]

requires:
  - phase: 01-01
    provides: Isolated Supabase lane lifecycle and stable release-gate commands
provides:
  - Clean PostgreSQL 15 replay of all repository migrations
  - Live pgTAP schema, view, trigger, and privileged-RPC contracts
  - Caller-bound and schema-qualified lead conversion
  - Guarded schema push to a second disposable loopback Supabase project
affects: [phase-01-upgrade, database-contracts, ci-release-gates]

tech-stack:
  added: []
  patterns:
    - Live pgTAP assertions against replayed repository migrations
    - Forward hardening migrations for privileged database functions
    - Test-scoped local Supabase project with exact cleanup ownership

key-files:
  created:
    - supabase/tests/database/00_schema_contracts.sql
    - supabase/migrations/20260825000001_harden_lead_conversion.sql
  modified:
    - supabase/migrations/20250305153000_create_contact_attribution_view.sql
    - supabase/migrations/20260305000001_custom_pipeline_stages.sql
    - scripts/release/verify-migration-chain.mjs
    - tests/release/migration-clean.test.ts

key-decisions:
  - "Treat the ordered repository migration filenames and the live database migration table as one exact contract."
  - "Repair inherited privileged helpers in a forward migration when live empty-search-path execution exposes them."
  - "Create schema-push authority internally from a uniquely named local Supabase project; reject external URLs, tokens, links, and project refs."

patterns-established:
  - "Migration proof is executable: blank replay, exact history, and live object behavior must all pass."
  - "Remote mutation is impossible by construction: loopback parsing and test-scoped identity precede database push."

requirements-completed: []

duration: 24min
completed: 2026-08-25
---

# Phase 1 Plan 02: Clean Migration and Schema Push Summary

**All 32 migrations replay cleanly on PostgreSQL 15 and push to a separately booted, disposable loopback Supabase target under live schema contracts**

## Performance

- **Duration:** 24 min
- **Started:** 2026-08-25T16:20:47-07:00
- **Completed:** 2026-08-25T16:44:29-07:00
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Repaired historical stale-column failures so the authoritative migration chain applies from an empty PostgreSQL 15 database.
- Added 24 live pgTAP assertions for required tables, views, triggers, grants, runtime view queries, caller ownership, and cross-owner denial.
- Hardened `convert_lead_to_contact` and supporting trigger/helper functions with caller-bound authorization, schema qualification, atomic row locking, typed JSONB writes, and narrow execution grants.
- Added an exact migration-history verifier and a mandatory schema-push mode that boots a second test-scoped Supabase project, pushes all migrations, reruns schema contracts, and cleans up only that project.

## Task Commits

Each task was committed atomically:

1. **Task 1: Repair clean replay and harden live lead conversion** - `e085f10` (failing contracts), `311ba99` (implementation)
2. **Task 2: Verify ordered clean migration history** - `b14bab7` (failing contracts), `bac8275` (implementation)
3. **Task 3: Prove schema push against a disposable local target** - `5bf75c5` (failing guards), `12f998c` (implementation)

## Files Created/Modified

- `supabase/tests/database/00_schema_contracts.sql` - Executes live schema, view, trigger, grant, and privileged-RPC assertions.
- `supabase/migrations/20260825000001_harden_lead_conversion.sql` - Makes lead conversion caller-bound, deterministic, schema-qualified, and narrowly granted; repairs inherited helper execution.
- `supabase/migrations/20250305153000_create_contact_attribution_view.sql` - Uses the current JSONB email shape during clean replay.
- `supabase/migrations/20260305000001_custom_pipeline_stages.sql` - Seeds the current typed configuration schema.
- `scripts/release/verify-migration-chain.mjs` - Verifies clean history and guarded isolated schema push.
- `tests/release/migration-clean.test.ts` - Covers ordering, no-retry behavior, remote-mutation rejection, exact push commands, and cleanup scope.

## Decisions Made

- Kept migration history comparison exact rather than checking only the latest version, preventing missing or reordered files from passing.
- Created the push target inside the verifier instead of accepting a caller-provided database URL, while still exposing the generated loopback URL only as `LOCAL_UPGRADE_DB_URL` to the child process.
- Ran the same pgTAP contracts after both reset and push so a successful CLI command alone cannot count as schema proof.

## Deviations from Plan

### Auto-fixed Issues

**1. Historical pipeline-stage seed referenced an obsolete configuration shape**

- **Found during:** Task 1 clean replay
- **Issue:** The migration wrote nonexistent `key` and `value` columns after the table had moved to `id` plus JSONB configuration.
- **Fix:** Updated the historical seed to the current typed JSONB representation.
- **Verification:** Full blank replay and all 24 pgTAP assertions pass.
- **Committed in:** `311ba99`

**2. Attribution view referenced a removed scalar contact email column**

- **Found during:** Task 1 live view query
- **Issue:** The view selected `contacts.email` although contacts now store email data in `email_jsonb`.
- **Fix:** Read the primary JSONB email value using the current schema.
- **Verification:** The view is queryable after clean replay.
- **Committed in:** `311ba99`

**3. Existing empty-search-path helpers failed at runtime**

- **Found during:** Task 1 privileged RPC execution
- **Issue:** Supporting trigger functions used unqualified relations with an empty `search_path`.
- **Fix:** Recreated the helpers with explicit schema qualification in the forward hardening migration.
- **Verification:** Lead conversion succeeds for its owner and rejects a cross-owner caller without partial writes.
- **Committed in:** `311ba99`

---

**Total deviations:** 3 auto-fixed blocking defects
**Impact on plan:** All fixes were required to make the planned executable migration and authorization proof truthful; no scope expansion.

## Issues Encountered

- The second local Supabase database does not support TLS, while `supabase db push --db-url` defaults to SSL for an explicitly supplied URL. The generated loopback URL now sets `sslmode=disable`; remote URLs remain prohibited before execution.

## User Setup Required

None - the verifier creates and destroys its own second local target.

## Next Phase Readiness

- Plan 01-03 can freeze the representative pre-billing baseline now that the complete current migration chain is executable.
- Plans 01-04 through 01-06 can build on the live pgTAP and isolated lane patterns.
- REL-01 remains open until the immutable representative upgrade path passes in Plan 01-03.

---
*Phase: 01-executable-financial-test-and-release-gate*
*Completed: 2026-08-25*
