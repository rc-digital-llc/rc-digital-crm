---
phase: 01-executable-financial-test-and-release-gate
plan: 06
subsystem: replay-concurrency-assurance
tags: [postgresql, idempotency, concurrency, replay, ordering, docker]

requires:
  - phase: 01-02
    provides: Exact-once disposable Supabase lane orchestration
provides:
  - Test-only transactional command claim and ordering contract
  - Real 32-process duplicate and distinct-key concurrency proof
  - Post-process replay and reversed-sequence invariants
affects: [future-financial-commands, provider-contracts, release-gate]

tech-stack:
  added: []
  patterns:
    - Unique inbox claim plus locked per-stream order state in one transaction
    - Explicit Docker/psql argv with exact local container discovery
    - Fixed bounded process bursts with no assertion retry

key-files:
  created:
    - supabase/tests/support/replay-concurrency.sql
    - tests/release/replay-concurrency.test.ts
  modified:
    - scripts/release/run-supabase-lane.mjs

key-decisions:
  - "Model the invariant only in test_release; Phase 1 does not imply that the fixture is the future production ledger or inbox design."
  - "A failed claim raises inside the transaction, leaving neither claim nor effect committed, so the exact same key is explicitly retryable."
  - "Sequences at or below the locked stream watermark are recorded as ignored without effects and can never regress state."

patterns-established:
  - "Concurrency proof counts every subprocess result and exact durable effects, including a fresh psql process replay after completion."
  - "The lane resolves one exact repository database container and rejects zero/multiple matches before any SQL execution."

requirements-completed: [REL-02]
requirements-progressed: [REL-03]

duration: 7min
completed: 2026-08-25
---

# Phase 1 Plan 06: Replay and Concurrency Summary

**Real PostgreSQL transactions now prove that 32 simultaneous claims produce one winner and one effect, distinct keys all complete once, replay stays duplicate, and older sequences cannot regress state**

## Performance

- **Duration:** 7 min
- **Started:** 2026-08-25T17:50:00-07:00
- **Completed:** 2026-08-25T17:57:00-07:00
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added test-only inbox, stream watermark, effect, and transactional apply function objects under `test_release` only.
- Added 18 pgTAP assertions for first claim, sequential duplicate, completed replay, later/earlier ordering, failed-transaction rollback, and same-key retry.
- Added exact local database-container discovery and bounded, exit-checked `docker exec ... psql` process execution without shell interpolation or connection credentials.
- Launched 32 simultaneous same-key sessions and proved exactly one applied result, 31 duplicates, and one durable effect.
- Launched 32 simultaneous distinct-key sessions and proved 32 applied results with no missing or duplicate effect.
- Proved a fresh-process replay stays duplicate and a lower sequence arriving after a higher one is ignored with the high watermark and one effect intact.
- Verified production migrations contain no `test_release` support objects and financial provider registration cannot omit replay/concurrency test ownership.

## Task Commits

1. **Task 1: Define test-only idempotency, ordering, and claim invariants** - `6a45401`
2. **Task 2: Prove simultaneous execution and replay safety** - `ab50a60`

## Verification

- `make test-financial-concurrency-fixture` — PASS, 18 pgTAP assertions
- `make test-financial-concurrency` — PASS, 7 Vitest contracts and 71 bounded psql processes across the live cases
- Lane metadata — one assertion attempt, successful stack cleanup
- Targeted Prettier, ESLint, and lane self-test — PASS

## Deviations from Plan

### Auto-fixed Issues

**1. The concurrency lane did not preload its test-only support schema**

- **Found during:** Task 2 first red run
- **Issue:** Parallel psql sessions correctly reached the isolated database but failed because the support schema was not part of production migrations and had not been loaded for the Vitest command.
- **Fix:** Added a `setup_only` fixture mode and explicit Docker copy/psql preload in the replay lane before its single assertion run.
- **Verification:** All parallel sessions reach the test function, and stack teardown removes the support schema after the run.
- **Committed in:** `ab50a60`

---

**Total deviations:** 1 auto-fixed harness boundary
**Impact on plan:** The support objects remain test-only while becoming reliably available to the planned real-process proof.

## User Setup Required

None. The lane creates and destroys every test object in the disposable local stack.

## Next Phase Readiness

- REL-02 is complete across live PostgreSQL, RLS, RPC, triggers, Auth/PostgREST, Edge/webhook/provider, replay, and concurrency boundaries.
- Plan 01-09 can now wire all six implemented financial lanes as independently blocking CI checks.
- Future financial provider/command paths must replace limitation records with named executable replay and concurrency cases.

---
*Phase: 01-executable-financial-test-and-release-gate*
*Completed: 2026-08-25*
