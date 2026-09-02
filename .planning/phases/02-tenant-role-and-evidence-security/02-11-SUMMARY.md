---
phase: 02-tenant-role-and-evidence-security
plan: "11"
subsystem: billing-responsive-surface-gate
tags: [react-admin, browser-router, responsive-ui, canonical, build-gate]

requires:
  - phase: 02-tenant-role-and-evidence-security
    plan: "09"
    provides: responsive billing account list/create/edit/detail surfaces
  - phase: 02-tenant-role-and-evidence-security
    plan: "10"
    provides: capability-aware access, evidence, and cache boundaries
provides:
  - desktop and mobile billing_accounts resource registration and navigation
  - browser-history deep links with root-relative build and logo assets
  - deterministic non-sensitive billing surface freshness and canonical metadata
  - closed source, immutable-preview, and production rendered contracts
  - bounded source runner plus passing two-viewport source receipt
affects: [02-protected-lane-coupling, phase-2-release, billing-ui]

tech-stack:
  added: []
  patterns: [browser-history admin entrypoint, route-scoped canonical metadata, staged rendered receipt]

key-files:
  created:
    - src/components/atomic-crm/billing-accounts/BillingSurfaceMetadata.tsx
    - qa/billing-accounts.surface.source.json
    - qa/billing-accounts.surface.preview.json
    - qa/billing-accounts.surface.production.json
    - scripts/release/run-billing-source-surface.mjs
  modified:
    - src/components/atomic-crm/root/CRM.tsx
    - src/components/atomic-crm/billing-accounts/BillingAccountList.tsx
    - src/components/atomic-crm/layout/Header.tsx
    - src/components/atomic-crm/layout/MobileNavigation.tsx
    - src/main.tsx
    - demo/main.tsx

key-decisions:
  - "Billing routes use BrowserRouter plus root-relative build/runtime assets so direct pathname requests render the intended resource at every nested route."
  - "The freshness marker is exposed only after list loading settles and contains no tenant, customer, credential, token, or commit identity."
  - "Source, immutable preview, and production retain separate exact-origin contracts; a passing source receipt cannot satisfy either deployed stage."

patterns-established:
  - "Rendered billing surfaces own one dynamic canonical link and reserve mobile scroll padding so fixed actions/navigation cannot obscure keyboard focus."
  - "The source runner builds deterministic FakeRest output, binds only loopback, invokes the shared gate with argv, redacts output, and terminates children in finally."

requirements-completed: [WORK-01, SEC-03, SEC-07]

duration: 27min
completed: 2026-09-01
---

# Phase 2 Plan 11: Responsive Billing Surface Gate Summary

**Desktop/mobile billing routes are deep-linkable and protected by independent source, preview, and production rendered contracts**

## Performance

- **Duration:** 27 min
- **Started:** 2026-09-01T17:19:37-07:00
- **Completed:** 2026-09-01T17:46:37-07:00
- **Tasks:** 2
- **Files modified:** 20

## Accomplishments

- Registered `billing_accounts` exactly once in both Admin trees and added capability-aware desktop/mobile navigation without treating menu visibility as authorization.
- Added real pathname routing, root-relative build/runtime assets, canonical metadata, and the non-sensitive `billing-security-phase2` freshness marker for list/create surfaces.
- Encoded an exact two-viewport source contract and independent five-viewport immutable-preview and canonical-production contracts.
- Added a dependency-free bounded runner that builds the demo, starts a loopback preview, invokes the shared Python surface gate without a shell, redacts output, and always stops the server.
- Retained a passing source receipt with 92 checks, zero failures, two routes, two viewports, and four hashed screenshots.

## Task Commits

1. **Task 1: Register responsive resource and capability-aware navigation** - `3a3a6b3d`, `e2248ba8`, `a3da4c89`, `b99dae3b`
2. **Task 2: Encode and execute staged rendered contracts** - `c89f51eb` (red test), `65a04847` (feature)

## Decisions Made

- React-admin's default hash router was replaced at the app entry points because build-gate routes, Vercel rewrites, canonical URLs, and direct browser navigation all require pathname identity.
- Source readiness is delayed until account loading settles, preventing a skeleton screenshot from masquerading as rendered account proof.
- The demo administrator received the same `account.create` capability needed to exercise the permitted create surface; server/provider checks remain authoritative.
- Billing surfaces reserve 9.5rem of document scroll padding while mounted so browser focus scrolling accounts for both the sticky form toolbar and fixed mobile navigation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Made nested resource paths truly deep-linkable**

- **Found during:** First source rendered receipt
- **Issue:** React-admin defaulted to hash routing and Vite emitted relative assets, so `/billing_accounts` showed the dashboard and `/billing_accounts/create` stalled after requesting a nested asset path.
- **Fix:** Wrapped both entry points in `BrowserRouter`, made both Vite bases root-relative, and changed default logos to root-relative URLs.
- **Verification:** Both direct routes return the correct marker and canonical path at both source viewports.
- **Committed in:** `65a04847`

**2. [Rule 2 - Missing Critical] Closed mobile keyboard focus occlusion**

- **Found during:** Source gate focus sampling
- **Issue:** Four create-form controls scrolled underneath the sticky action bar or bottom navigation at 320x568.
- **Fix:** Added route-scoped document scroll padding and preserved/restored any prior value on unmount.
- **Verification:** The final source receipt reports exposed keyboard focus for every sampled route/viewport.
- **Committed in:** `65a04847`

**3. [Rule 2 - Missing Critical] Required loaded UI before freshness readiness**

- **Found during:** Screenshot review
- **Issue:** The list freshness marker appeared before FakeRest list loading settled, allowing a skeleton to satisfy readiness.
- **Fix:** Moved/conditioned the list markers so readiness begins only after the desktop/mobile pending state ends.
- **Verification:** Final screenshots show the example account card and table row instead of skeletons.
- **Committed in:** `65a04847`

---

**Total deviations:** 3 auto-fixed missing critical surface defects. **Impact on plan:** All fixes strengthen direct-route, accessibility, and evidence integrity without changing server authorization.

## Issues Encountered

- The source gate failed closed three times as intended: missing route readiness, nested asset 404s, then mobile focus occlusion. Each failure became a deterministic static or rendered contract before the final pass.

## User Setup Required

None - the receipt uses deterministic FakeRest data on loopback. No Supabase dashboard project or deployed Vercel environment was mutated.

## Next Phase Readiness

- Plan 12 can couple every Phase 2 contract into the inherited blocking financial lanes and run the complete phase gate.
- The preview contract still points at a stale failed deployment and must be updated to the intended immutable preview URL before its mandatory five-viewport pre-merge receipt.
- Production remains independently unproven until an authorized release and a new canonical five-viewport receipt.

## Self-Check: PASSED

- `npm test -- --run tests/release/billing-security-static.test.ts` (8 tests)
- `node scripts/release/run-billing-source-surface.mjs --self-test`
- Billing UI/provider/static suite (38 tests)
- `npm run typecheck`
- `npm run lint`
- Source receipt: 92 checks, 0 failures, 4 screenshot hashes

---
*Phase: 02-tenant-role-and-evidence-security*
*Completed: 2026-09-01*
