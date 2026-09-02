---
phase: 02-tenant-role-and-evidence-security
plan: "07"
subsystem: edge-functions
tags: [supabase, edge, storage, jwt, evidence, quarantine, signed-urls]

requires:
  - phase: 02-tenant-role-and-evidence-security
    plan: "04"
    provides: exact automation principal/grant consumption and replay receipts
  - phase: 02-tenant-role-and-evidence-security
    plan: "05"
    provides: private evidence metadata, quarantine decisions, and access events
  - phase: 02-tenant-role-and-evidence-security
    plan: "06"
    provides: stable billing errors and allowlisted structured logging
provides:
  - authenticated billing_evidence Edge controller for upload, inspection, and download
  - service-executed but stored-user-authorized quarantine metadata creation
  - exact scanner grant resolution with object-presence and exhausted-grant replay support
  - clean-only 60-second private download capabilities with tamper proof
  - blocking Edge/Storage acceptance coverage in the financial functions lane
affects: [02-provider-parity, 02-account-ui, 04-revenue-evidence, 08-customer-portal]

tech-stack:
  added: []
  patterns: [verified-user service execution, quarantine-before-capability, caller-JWT RPC, decision-before-signing, no-store capability responses]

key-files:
  created:
    - supabase/functions/_shared/billingAuthorization.ts
    - supabase/functions/billing_evidence/index.ts
    - tests/release/billing-evidence.test.ts
  modified:
    - supabase/migrations/20260901000004_billing_evidence_security.sql
    - supabase/tests/database/40_billing_evidence.sql
    - supabase/functions/_shared/authentication.ts
    - supabase/config.toml
    - scripts/release/run-supabase-lane.mjs
    - supabase/tests/fixtures/functions.env
    - tests/release/edge-webhook-provider.test.ts
    - makefile

key-decisions:
  - "The service-only upload RPC accepts a verified Auth user ID but independently resolves stored sales assignments and evidence.upload capability before creating server-path metadata."
  - "Inspection and access RPCs run with the caller JWT; the admin client may resolve the exact stored grant/path and sign Storage capabilities only after the caller-bound database decision."
  - "Upload capabilities use Storage's fixed two-hour signed-upload lifetime, while every download decision and Storage URL is constrained to 60 seconds and returned with no-store headers."

patterns-established:
  - "Evidence Edge flow: strict command/body allowlist -> verified user -> caller-bound database decision -> exact server-owned Storage target -> minimum capability response."
  - "Local signed URLs use an explicit loopback-only fixture origin; deployed functions fall back to the configured Supabase project URL rather than trusting request Host headers."

requirements-completed: [SEC-02, SEC-04, SEC-05, SEC-06, SEC-07]

duration: 27min
completed: 2026-09-01
---

# Phase 2 Plan 07: Private Evidence Edge Summary

**Authenticated quarantine-first uploads, exact scanner inspection, and clean-only 60-second private downloads behind one redacted Edge boundary**

## Performance

- **Duration:** 27 min
- **Started:** 2026-09-01T15:55:00-07:00
- **Completed:** 2026-09-01T16:22:00-07:00
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments

- Added strict `upload`, `inspection`, and `download` command controllers using the required Options → Auth → User composition, exact request-key allowlists, stable errors, safe logs, and no-store responses.
- Added a service-only upload RPC that validates the verified Auth user against stored account-scoped `evidence.upload` authority, creates one quarantined row with a generated path, appends an allowlisted audit event, and exposes the path only to the Edge executor.
- Issued a real private signed upload and stored bytes without using the original filename in the object path; invalid auth/method/body/path/type/size/role/tenant and dormant customer cases create no metadata.
- Bound inspection to the one stored automation principal/grant tuple, required the exact private object to exist, handled exhausted-grant idempotent replay, and atomically recorded clean/rejected state plus audits.
- Issued downloads only after the caller-JWT access RPC commits and an immediate admin-side state recheck confirms clean, active, retained, unheld evidence; signed URL and database expiry are both 60 seconds.
- Denial checks cover direct reads, cross-tenant reads, quarantine, rejection, expiry, holds, dormant users, malformed paths, and forged links. Server authority remains private.

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement authenticated quarantine-first signed upload** - `77d01d1b` (red test), `41660e14` (feat)
2. **Task 2: Implement exact inspection and 60-second clean download** - `e42f9fe7` (red test), `00b1381e` (feat)

## Files Created/Modified

- `supabase/functions/billing_evidence/index.ts` - Strict authenticated command controller and capability response boundary.
- `supabase/functions/_shared/billingAuthorization.ts` - Caller client, service upload decision, scanner grant resolution, object-presence check, access decision, and exact Storage target recheck.
- `tests/release/billing-evidence.test.ts` - Real Auth/Edge/Storage upload, inspection, replay, download, state, direct-access, and tamper acceptance tests.
- `supabase/migrations/20260901000004_billing_evidence_security.sql` - Service-only upload command and inspection replay correction.
- `supabase/tests/database/40_billing_evidence.sql` - Upload ACL/search-path and inspection replay regressions.
- `supabase/functions/_shared/authentication.ts` - Stable token verification through Supabase Auth with non-leaking failures.
- `scripts/release/run-supabase-lane.mjs` - Deterministic billing fixture loading for the Edge lane.
- `supabase/config.toml` - Local function registration.
- `supabase/tests/fixtures/functions.env` - Explicit synthetic loopback capability origin.
- `tests/release/edge-webhook-provider.test.ts` - Synthetic environment contract update.
- `makefile` - New evidence acceptance included in the blocking financial functions target.

## Decisions Made

- Kept service-role use behind a service-only database entry point that re-resolves the verified user and stored capability; browser-supplied organization, path, grant, provider reference, or policy values are never accepted.
- Used the caller's Authorization header for inspection and access RPCs, preserving `auth.uid()` as database authority even though Storage signing requires an admin client.
- Required object presence before scanner finalization and re-resolved exhausted grants through the immutable execution receipt so replay stays idempotent after quota exhaustion.
- Used a dedicated synthetic public-origin override only for the local function fixture because Storage constructs URLs from the internal `kong` origin locally; production defaults to its configured Supabase URL.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Loaded billing fixtures in the Edge provider lane**

- **Found during:** Task 1 red test
- **Issue:** The Edge lane started Supabase/Functions but loaded no two-tenant billing organizations, so real role/grant fixtures could not be bound.
- **Fix:** Reused the deterministic database fixture loader before starting the Edge runtime.
- **Files modified:** `scripts/release/run-supabase-lane.mjs`
- **Verification:** Both legacy provider and new evidence tests pass together in the blocking functions lane.
- **Committed in:** `41660e14`

**2. [Rule 1 - Bug] Replaced issuer-fragile local JWKS verification with Supabase Auth verification**

- **Found during:** Task 1 live valid-JWT case
- **Issue:** The function runtime's internal issuer/origin did not match the external local Auth token issuer, causing a real valid JWT to return 401.
- **Fix:** `AuthMiddleware` now verifies the bearer through `auth.getUser(token)` and returns one stable Unauthorized message; `UserMiddleware` retains the verified-user lookup.
- **Files modified:** `supabase/functions/_shared/authentication.ts`
- **Verification:** Valid local JWT commands pass and missing/invalid JWT cases remain 401 without internals.
- **Committed in:** `41660e14`

**3. [Rule 1 - Bug] Externalized locally generated Storage capability origins**

- **Found during:** Task 1 signed upload execution
- **Issue:** Local Storage signing returned the internal `kong` origin, which is unreachable by a browser/test client.
- **Fix:** Added an explicit loopback-only fixture origin and rewrote only scheme/host while preserving the signed path/query; deployed functions fall back to `SUPABASE_URL` and do not trust Host headers.
- **Files modified:** `supabase/functions/billing_evidence/index.ts`, `supabase/tests/fixtures/functions.env`, `tests/release/edge-webhook-provider.test.ts`
- **Verification:** Real signed upload/download byte transfer succeeds through the loopback API.
- **Committed in:** `41660e14`

**4. [Rule 1 - Bug] Preserved duplicate inspection replay after state transition and grant exhaustion**

- **Found during:** Task 2 replay contract
- **Issue:** The database rejected any non-quarantined object before checking its immutable execution receipt, and the Edge resolver ignored exhausted grants, making a committed retry return denial instead of duplicate.
- **Fix:** Resolve the prior execution/grant tuple first for the same idempotency key, return/audit duplicate without another transition, and allow the Edge resolver to select that exact historical grant.
- **Files modified:** `supabase/migrations/20260901000004_billing_evidence_security.sql`, `supabase/functions/_shared/billingAuthorization.ts`, `supabase/tests/database/40_billing_evidence.sql`
- **Verification:** Replay before and after grant exhaustion returns duplicate with one execution and one successful inspection transition.
- **Committed in:** `41660e14`, `00b1381e`

---

**Total deviations:** 4 auto-fixed (2 blocking/runtime integration, 2 correctness/security bugs). **Impact on plan:** Each fix was necessary to make the planned real Auth/Edge/Storage proof executable without broadening customer upload or public Storage access.

## Issues Encountered

- `deno check` cannot resolve the repository's pre-existing `npm:openai@^4.52.5` Edge-runtime type dependency from local `node_modules`; live `supabase functions serve` compiled and executed the function successfully, while repository TypeScript and ESLint checks pass.
- Mutating only the final base64url character of a JWT signature can preserve the decoded bytes through unused padding bits. The tamper test now changes the first signature character and proves rejection.

## User Setup Required

None - all Auth, Edge, Storage, and PostgreSQL execution used disposable loopback Supabase projects; customer upload remains dormant and the protected dashboard project was not touched.

## Next Phase Readiness

- Live and FakeRest provider methods now have an implemented `billing_evidence` server boundary with matching command discriminants.
- Account UI work can request capabilities without ever receiving generic tenant, path, grant, or provider authority.
- Clean schema receipt: 37 migrations through `20260901000004`, hash `ebd15f781a1accbe1de58d6c3cfd2cdfb0c45515d808b2070faed340dbaaacbf`.

## Self-Check: PASSED

- Upload-focused live Edge/Storage test
- Inspection/download/tamper-focused live Edge/Storage test
- `make test-financial-functions` (10 tests)
- `make test-financial-database-sql` (235 assertions)
- `make test-financial-schema-push` (37 migrations)
- `npm run typecheck`
- `npm run lint -- --quiet`
- `deno fmt` on all changed Edge files

---
*Phase: 02-tenant-role-and-evidence-security*
*Completed: 2026-09-01*
