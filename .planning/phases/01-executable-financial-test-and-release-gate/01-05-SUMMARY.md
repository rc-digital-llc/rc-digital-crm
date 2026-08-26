---
phase: 01-executable-financial-test-and-release-gate
plan: 05
subsystem: edge-provider-assurance
tags: [supabase, edge-functions, postmark, webhooks, provider-contracts]

requires:
  - phase: 01-02
    provides: Disposable local Supabase lane orchestration
provides:
  - Synthetic provider fixtures and enforceable case ownership
  - Live Edge Runtime authentication, method, body, failure, and success proof
  - Fail-closed Postmark database acknowledgement behavior
affects: [edge-provider-contracts, webhooks, future-financial-providers, release-gate]

tech-stack:
  added: []
  patterns:
    - Explicit synthetic env file passed to a managed local function runtime
    - Provider registration with mandatory auth/body/failure/replay/concurrency/success classes
    - HTTP status plus exact database-effect assertions

key-files:
  created:
    - supabase/tests/fixtures/functions.env
    - tests/release/fixtures/postmark-inbound.json
    - tests/release/fixtures/provider-contract.json
    - tests/release/edge-webhook-provider.test.ts
  modified:
    - scripts/release/run-supabase-lane.mjs
    - supabase/functions/postmark/index.ts

key-decisions:
  - "Keep Postmark explicitly non-financial in v1 and record its replay/concurrency limitations instead of claiming guarantees it does not have."
  - "Require every future financial provider registration to name executable tests for all six provider case classes."
  - "Return the first downstream helper Response immediately; 200 is emitted only after every contact operation succeeds."

patterns-established:
  - "The Edge lane owns runtime startup, readiness, termination, and stack teardown; assertion failures never retry."
  - "Tracked provider fixtures use reserved-example identities, fixed event IDs/timestamps, and visibly synthetic credentials only."

requirements-completed: []
requirements-progressed: [REL-02, REL-03]

duration: 6min
completed: 2026-08-25
---

# Phase 1 Plan 05: Edge and Provider Boundary Summary

**The real local Edge Runtime now proves 401, 403, 405, 500, and 200 provider behavior with exact database effects, and Postmark can no longer acknowledge a failed database operation as success**

## Performance

- **Duration:** 6 min
- **Started:** 2026-08-25T17:43:00-07:00
- **Completed:** 2026-08-25T17:49:00-07:00
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Extracted the inline Postmark example into a deterministic reserved-example fixture with a fixed provider event ID and timestamp.
- Added a synthetic-only function env fixture and validation that rejects non-reserved domains, non-synthetic credentials, missing event identity, and incomplete provider case ownership.
- Registered auth, malformed-body, downstream-failure, duplicate/replay, concurrency, and success classes; financial paths cannot use limitation records in place of executable tests.
- Extended the disposable lane runner to start the Edge Runtime with the explicit fixture env, wait for readiness, suppress runtime secrets/log payloads, terminate it, and then destroy the stack.
- Exercised live Postmark IP/Basic authentication, method/body checks, missing-sales 403, duplicate-contact database 500, and exact successful contact/note creation.
- Exercised a Bearer-authenticated Edge Function with missing and invalid tokens.
- Fixed the observed swallowed-response defect by returning `addNoteToContact` failures before the final 200 acknowledgement.

## Task Commits

1. **Task 1: Define synthetic Edge and provider contract fixtures** - `88f496f`
2. **Task 2: Exercise running Edge contracts and propagate Postmark failures** - `bfb64ce` (failing runtime contract), `010df35` (handler fix)

## Verification

- `npm test -- --run tests/release/edge-webhook-provider.test.ts -t fixtures` — PASS, 3 fixture/contract tests
- `make test-financial-functions` — PASS, 8 tests against the running local Edge Runtime
- Targeted Prettier and ESLint — PASS
- Gitleaks scan of `supabase/tests/fixtures` — PASS, zero findings

## Deviations from Plan

### Auto-fixed Issues

**1. The lane runner did not own Edge Runtime startup or the synthetic env boundary**

- **Found during:** Task 2 harness setup
- **Issue:** Starting the database stack alone did not prove that functions were served with the tracked synthetic provider settings.
- **Fix:** Added bounded function-runtime readiness and guaranteed shutdown to the `edge-provider-contracts` lane using explicit argv and the tracked fixture env.
- **Verification:** The live suite reaches `/functions/v1/postmark` and `/functions/v1/users`; runtime and stack cleanup both complete after pass or failure.
- **Committed in:** `bfb64ce`

**2. Postmark swallowed returned database helper failures**

- **Found during:** Task 2 red test
- **Issue:** A valid webhook with no matching sales owner produced an internal 403 Response but the handler discarded it and returned 200.
- **Fix:** Capture and immediately return any `addNoteToContact` Response.
- **Verification:** The same test now observes 403 and 500 with unchanged effect sets, while the seeded success still returns 200 with one contact and one note.
- **Committed in:** `010df35`

---

**Total deviations:** 2 auto-fixed trust-boundary defects
**Impact on plan:** The runtime lifecycle makes the planned HTTP proof reproducible; the handler change is the exact fail-closed behavior required by the plan.

## User Setup Required

None. Provider values and data are synthetic and the lane never reads the ignored function env file.

## Next Phase Readiness

- The Edge/provider portion of REL-02 is complete.
- Plan 01-06 must complete duplicate/replay/concurrency proof before REL-02 can close.
- Postmark remains explicitly non-financial; a future financial provider cannot register without executable replay and concurrency ownership.

---
*Phase: 01-executable-financial-test-and-release-gate*
*Completed: 2026-08-25*
