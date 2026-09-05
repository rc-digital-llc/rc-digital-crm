---
phase: 04-agreements-revenue-evidence-and-calculation-close
plan: "08"
subsystem: release-verification
tags: [supabase, migration-upgrade, release-gate, playwright, security]
requires:
  - phase: 04-07
    provides: complete agreement, revenue, calculation-close, and adjustment workflow
provides:
  - Immutable registry 004 for every Phase 4 migration and final authority fingerprint
  - Disposable loopback schema-push verification for the complete 50-migration chain
  - Permanent protected-lane ownership for all Phase 4 implementation and test paths
  - Passing rendered source receipt across account list, create, and detail routes
  - Complete integrated financial, security, type, lint, build, and regression proof
affects: [phase-05-invoicing, release-promotion, billing-surface]
tech-stack:
  added: []
  patterns:
    - Append-only release registries pin migrations and exact final catalog semantics
    - Local schema-push proof accepts only isolated disposable loopback targets
    - Source, immutable preview, and canonical production remain independent evidence stages
key-files:
  created:
    - supabase/tests/upgrades/004-agreement-close/expected-transformations.json
    - tests/release/phase-04-release-static.test.ts
    - artifacts/surface/phase-04-source.json
  modified:
    - scripts/release/fingerprint-upgrade.mjs
    - scripts/release/verify-migration-chain.mjs
    - scripts/release/run-billing-source-surface.mjs
    - .github/release/financial-paths.json
    - makefile
    - qa/billing-accounts.surface.source.json
    - qa/billing-accounts.surface.preview.json
    - qa/billing-accounts.surface.production.json
key-decisions:
  - "Registry 004 pins all seven Phase 4 migrations, exact schema/RPC/security/capability hashes, and the byte identity of accepted registries 001-003."
  - "Clean schema-push comparison uses Phase 4-owned security fingerprints; the inherited global grant transformation remains pinned in the representative-upgrade lane."
  - "A passing local source receipt never substitutes for immutable preview or canonical production evidence."
requirements-completed: [AGR-01, AGR-02, AGR-03, AGR-04, AGR-05, REV-01, REV-02, REV-04, REV-05, REV-06, REV-07, REV-08, REV-09, CALC-02, CALC-04, CALC-05, CALC-06, CALC-07]
duration: 40 min
completed: 2026-09-04
---

# Phase 4 Plan 8: Integrated Release Verification Summary

**Phase 4 is locally CI-ready with immutable schema and upgrade authority, isolated schema-push proof, protected release-lane coupling, and rendered source evidence at the exact implementation head.**

## Performance

- **Duration:** 40 min
- **Started:** 2026-09-04T23:53:00Z
- **Completed:** 2026-09-05T00:33:00Z
- **Tasks:** 3
- **Files modified:** 29

## Accomplishments

- Added append-only registry `004-agreement-close`, pinning all seven Phase 4 migrations through `20260904000007`, exact final schema/RPC/ACL/RLS/capability/policy fingerprints, semantic business-fact invariants, and unchanged accepted registries 001-003.
- Extended protected path classification and permanent Make targets so every Phase 4 SQL, provider, replay, UI, static, migration, and security contract remains inside inherited blocking financial lanes.
- Proved all 50 migrations through a generated disposable loopback Supabase project and matched the four Phase 4 registry fingerprints without changing `supabase/config.toml` or contacting a linked/hosted project.
- Added the `phase-04-agreement-close-v1` rendered freshness marker and stable Agreement/Monthly-close action targets while retaining exact five-viewport preview and production contracts.
- Retained a PASS source receipt with 150 checks over three routes at 320×568 and 1280×800, six content-hashed screenshots, no overflow, focus occlusion, unexpected overlay, console error, or page error.
- Passed the complete financial gate plus repository-wide typecheck, lint, production build, broad regression suite, diff check, and shared skill-suite smoke test.

## Task Commits

1. **Task 1: Register immutable Phase 4 upgrade and protected lane ownership** — `39349ed5` (feat)
2. **Task 2: Push the complete schema chain into an isolated local database** — `a05815a6` (feat)
3. **Task 3: Produce rendered source receipt and pass the integrated gate** — `f132ea5f`, `24cf15c0`, `759d30c3`, `c4814956` (feat/fix/test), `1c818c95` (reviewed security classification)

## Exact Verification Evidence

- **Migration chain:** 50 migrations; filename SHA-256 `c11338750f487ee9870b0e6f12ae83ddab5b5dca77201f3c43298f4f59b7123e`.
- **Isolated schema push:** disposable project `rc-digital-schema-push-39313-983510f695`; schema `f9d4dc5df5055c130e31e88edc7e7647a169fd970e801bd5d3d052bab6696dbb`; RPCs `243b8e4028e3fef60551c824e94d4b27c8313c09c53592501bc8989904266451`; security `10d3029fa333b039b90a633fe63740411533b47b835ffa53f227b5fd1e1d122c`; capabilities `b83c54419102ba1f49b18d6311d6042da89e8f4dbf70f359d0f0c5519dfe2fd5`.
- **Representative upgrade:** 25 tests; all Phase 4 and inherited semantic invariants true; report SHA-256 `280f46ec4b6ac7d619e1d4bc1283d23e1357a26d3727ca57b7c6e11376dab222`.
- **Database:** 18 pgTAP files and 562 assertions; 12 live Auth/HTTP/provider tests; 10 Edge/evidence tests; 18 replay-fixture assertions; 9 live replay/concurrency tests.
- **Fast/security:** 187 fast/static tests; zero critical/high dependency advisories; zero current/history secret findings; 54-file bundle scan; six protected workflow identities.
- **Rendered source:** contract SHA-256 `9c1e94d859f2b54c7541d370a26fe55410c1f2ba0a0b5fb62d71ba2d3af7390e`; implementation head `759d30c3824410e9cd62c1fb4a0fb64243006483`; 150/150 checks and six screenshot hashes.
- **Repository sweep:** typecheck passed; lint passed with zero errors and three inherited Fast Refresh warnings; production build passed with inherited CSS import-order, bundle-size, Browserslist, and Node deprecation advisories; 566 tests passed and 26 intentional service-dependent tests skipped.
- **Suite integrity:** `suite_smoke.py` passed 10/10; `git diff --check` passed.

## Decisions Made

- The Phase 4 release registry is append-only and rejects missing, reordered, unknown, or altered migration and authority artifacts.
- Global catalog grants legitimately differ between a clean bootstrap and the representative historical upgrade. The clean schema-push lane therefore compares the exact Phase 4-owned security hash, while the representative-upgrade lane separately pins the global grant transform.
- Phase 4 actions use stable semantic selectors and a 44px minimum target. Route-specific targets are required where applicable and still measured whenever visible on other routes.
- Six synthetic idempotency command keys produced twelve scanner fingerprints across committed history and the current tree. Each readable test-only value was reviewed and pinned by exact fingerprint; broad scanner exclusions remain forbidden and the normalized entry-set hash remains fail-closed.

## Deviations from Plan

### Auto-fixed Issues

**1. Included the complete final Phase 4 migration set**

- **Issue:** Later plans added caller-scoped read support through migrations `00005`–`00007`, beyond the earlier draft plan's `00004` endpoint.
- **Fix:** Registry and schema-push verification pin every final Phase 4 migration through `20260904000007`.

**2. Separated Phase 4-owned security from global bootstrap grant shape**

- **Issue:** The clean database and representative historical upgrade intentionally have different inherited global grant catalogs.
- **Fix:** Clean schema-push requires the exact Phase 4 security fingerprint; representative upgrade continues to require the exact global grant transformation.

**3. Scoped critical controls across heterogeneous routes**

- **Issue:** The account-detail route does not contain the list/create action, and list/create routes do not all expose detail-only Phase 4 controls.
- **Fix:** The harness requires route-applicable controls and still checks size/hitability whenever optional targets are visible.

**4. Added bounded stale-lock recovery**

- **Issue:** An interrupted source run could leave an exact receipt lock behind.
- **Fix:** The source runner now recovers only its bounded stale lock while retaining fail-closed concurrent-run protection.

## Release-Stage Evidence Still Pending

- Immutable deployed preview receipt at all five required viewports and the exact Phase 4 freshness marker.
- Separately authorized merge/default-branch validation and protected schema/frontend promotion.
- Canonical production receipt at all five required viewports after that release.
- Residual screen-reader and physical-device validation when performed.

No preview, hosted schema, merge, deployment, feature enablement, or production mutation was performed or claimed during this plan.

## Self-Check: PASSED

- Registry, release-static, migration, schema-push, financial, security, rendered-source, type, lint, build, and regression evidence all pass.
- All Task 1–3 commits are present.
- Only the auto-chain runtime flag remained modified before phase close; it is not implementation evidence.

---

_Phase: 04-agreements-revenue-evidence-and-calculation-close_
_Completed: 2026-09-04_
