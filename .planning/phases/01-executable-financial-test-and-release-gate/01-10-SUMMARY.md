---
phase: 01-executable-financial-test-and-release-gate
plan: 10
subsystem: release-engineering
tags: [github-actions, supabase, attestations, protected-environments, immutable-receipts]

requires:
  - phase: 01-08
    provides: Canonical receipts and authenticated private evidence publication/readback
  - phase: 01-09
    provides: Protected signed main, exact required checks, merge queue, and single-owner approval
provides:
  - Build-once release artifacts with SHA-256 identities and GitHub OIDC attestations
  - Protected one-stage schema, functions, frontend, and dormant promotion controls
  - Separately approved financial enablement with an empty Phase 1 live registry
  - Pinned artifact rollback, feature disablement, and forward-safe database repair procedures
  - Live private receipts and exact production readback for the safe Phase 1 release chain
affects: [all-financial-phases, production-release, rollback, evidence-retention]

tech-stack:
  added: []
  patterns:
    - Build once on protected main, then promote only content-addressed evidence
    - One protected approval and one receipt per production stage
    - Financial enablement uses a distinct protected environment and fails closed on an empty registry

key-files:
  created:
    - .github/workflows/release-build.yml
    - .github/workflows/release-promote.yml
    - .github/workflows/release-enable.yml
    - docs/runbooks/financial-release.md
    - docs/runbooks/financial-rollback.md
  modified:
    - .github/workflows/deploy.yml
    - .github/release/protected-environments.json
    - scripts/release/prepare-build-evidence.mjs
    - scripts/release/verify-github-controls.mjs
    - tests/release/release-policy.test.ts

key-decisions:
  - "A protected-main build may attest and archive artifacts but receives no production mutation authority."
  - "Schema, functions, and frontend promote independently from immutable predecessor receipts; no stage rebuilds or automatically invokes its successor."
  - "Phase 1 registers no live financial feature, so dormant registration and enablement are proven by protected fail-closed attempts before provider access."
  - "The upstream Supabase signing JWK is a public localhost development fixture, but release archives exclude it and remove its config reference."

patterns-established:
  - "Release authority: exact private receipt readback and artifact digest verification immediately precede every mutation."
  - "Production proof: a successful merge or build is insufficient; exact target readback and a stage receipt are required."
  - "Rollback: frontend/functions consume known-good digests, while database recovery defaults to feature-disabled forward repair."

requirements-completed: [REL-04, REL-05]

duration: 155min
completed: 2026-09-01
---

# Phase 1 Plan 10: Attested Staged Release Summary

**Protected main now builds immutable artifacts without production authority, and release owners can promote schema, functions, and frontend through separately approved, receipt-linked stages while unregistered financial behavior fails closed before mutation**

## Performance

- **Duration:** 155 min across implementation, protected rollout, and live failure remediation
- **Started:** 2026-08-25T18:28:45-07:00
- **Completed:** 2026-09-01T18:54:05Z
- **Tasks:** 3
- **Core files modified:** 26

## Accomplishments

- Replaced coupled main-branch deployment with a build-only workflow that creates deterministic frontend, functions, and migration archives, records their SHA-256 identities, attests them through GitHub OIDC, and publishes them to authenticated private evidence storage.
- Installed protected single-stage promotion for schema, functions, frontend, and dormant behavior. Each invocation verifies the exact predecessor receipt and pinned artifact immediately before mutation, validates post-state, and publishes an authoritative successor receipt.
- Added a distinct `production-financial-enable` approval boundary, registered-feature/dormant-state validation, and fail-closed provider invariants. Phase 1's empty registry prevents every real financial enable attempt.
- Added pinned frontend/functions rollback plus feature-disabled forward database repair and compensating receipt procedures.
- Executed the current-main release chain against Supabase project `gtasqgavcrodxusvcsyt`: build, schema, functions, and frontend passed with private receipts and exact readback; protected dormant and enablement attempts stopped before provider access because `synthetic-fixed-billing` is intentionally unregistered.

## Task Commits and Live Receipts

1. **Task 1: Build once, hash, attest, and archive** — `605e6f22`, with release-safe archive correction `bf92c38d`
2. **Task 2: Protected single-stage promotion** — `1a9f8148`, exact frontend readback `a4558bcc`, packaged function dependency `427cb49c`, and publisher identity `4a633666`
3. **Task 3: Separate enablement and rollback controls** — `b4c51c05`
4. **Protected current main** — `4a6336668b7f038abfc98566725e0e563097b7bc`

Live current-main evidence:

- Release build run `33545281071`: success; receipt `c0ae9253cfdeca20c6ac21654403d93af1c21ac1d5d1cacaad74f644e426fbdd`
- Schema promotion run `33545424206`: success; receipt `e39809f71b135d23daa356b072b21be1ed3956821a3ad8b98d169952f686e47f`
- Functions promotion run `33545638363`: success; receipt `d2093a35a316064050754cfaa6ffdc2ecef770627fab1947ebefca52e2e38da9`
- Frontend promotion run `33545865904`: success; receipt `16383c889dc36eb2de3a4261a16dc6399915e90813813763cda07851bd049c7c`; production branch `05f84c4eaa9a08ce0d009e8ef7d56b90d2335390`
- Dormant proof run `33546107386`: expected failure before provider access because the feature is unregistered
- Separate enablement proof run `33546294270`: expected failure before evidence fetch or provider access for the same policy reason

## Decisions Made

- Preserved build and promotion as separate authorities: the build workflow has no production environment, Supabase mutation, feature mutation, or customer frontend publication capability.
- Used distinct protected environments for promotion and financial enablement. The project owner's accepted single-owner policy allows the same owner to approve each boundary separately; approval is not inherited.
- Treated the empty Phase 1 feature registry as a deliberate safety contract. Live proof therefore requires deterministic rejection before provider contact, not temporarily registering or enabling a customer-facing feature.
- Preserved superseded private evidence rather than deleting audit history. The JWK found in the early archive is the identical public Marmelab localhost development fixture from upstream commit `d348cef1`; corrected authoritative archives exclude it and strip `signing_keys_path`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Supabase archive referenced an omitted signing-key file**

- **Found during:** Live schema promotion
- **Issue:** The initial archive copied `signing_keys_path` while omitting its target, so Supabase rejected the packaged config.
- **Fix:** Added deterministic USTAR+gzip packaging, stripped the release-only signing-key reference, excluded `supabase/signing_keys.json`, and rejected unsafe entries.
- **Files modified:** `scripts/release/prepare-build-evidence.mjs`, `tests/release/build-evidence.test.ts`
- **Verification:** Archive extraction, safety, determinism, release tests, and corrected live schema promotion pass.
- **Committed in:** `bf92c38d`

**2. [Rule 1 - Bug] Functions archive omitted a runtime source dependency**

- **Found during:** Live functions promotion
- **Issue:** `delete_note_attachments` imported the shared attachment module outside the initially packaged function tree.
- **Fix:** Added the exact runtime support path to the immutable functions artifact and regression-tested extraction.
- **Files modified:** `scripts/release/prepare-build-evidence.mjs`, `tests/release/build-evidence.test.ts`
- **Verification:** All five functions deployed and read back successfully in run `33545638363`.
- **Committed in:** `427cb49c`

**3. [Rule 1 - Bug] Frontend publication lacked a Git author identity**

- **Found during:** Live frontend promotion
- **Issue:** `gh-pages` could not create its production-branch commit in the protected runner.
- **Fix:** Scoped the release-bot author and committer identity to the publish step and enforced it in source-policy tests.
- **Files modified:** `.github/workflows/release-promote.yml`, `tests/release/release-policy.test.ts`
- **Verification:** Exact artifact publication and authenticated production-branch readback passed in run `33545865904`.
- **Committed in:** `4a633666`

---

**Total deviations:** 3 auto-fixed bugs
**Impact on plan:** Each fix was required for artifact integrity or deterministic live promotion. No customer financial feature was registered or enabled.

## Issues Encountered

- One protected replay job timed out while pulling Supabase Docker images before tests began. The bounded bootstrap retry succeeded; no financial assertion was retried or hidden.
- An earlier unsafe schema archive and its superseding fixes remain visible as immutable audit evidence. The only private material it contained was an upstream public localhost development key, not a production credential; the authoritative current build excludes it.

## User Setup Required

None remaining for Phase 1. The private evidence repository, both protected environments, scoped Supabase credentials/target, and customer frontend target are provisioned and passed live readback. Later phases must register an actual feature in versioned policy before dormant promotion or enablement can succeed.

## Next Phase Readiness

- Phase 1 is complete: all five REL requirements and all four goal truths have executable and live evidence.
- Phase 2 may begin. Production financial behavior remains disabled because the Phase 1 live feature registry is empty.

---
*Phase: 01-executable-financial-test-and-release-gate*
*Completed: 2026-09-01*
