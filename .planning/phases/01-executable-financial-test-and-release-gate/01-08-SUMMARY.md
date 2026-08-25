---
phase: 01-executable-financial-test-and-release-gate
plan: 08
subsystem: release-evidence
tags: [receipts, sha256, github, private-evidence, attestations]

requires:
  - phase: 01-01
    provides: Release policy, receipt schema, exact check identities, and evidence visibility rule
provides:
  - Deterministic schema-valid content-addressed release receipts
  - Exact schema-to-enable predecessor receipt verification
  - Fail-closed approval and seven-day exception enforcement
  - Private GitHub evidence publication with immutable upload and authenticated readback
affects: [phase-01-ci, staged-promotion, rollback, release-audit]

tech-stack:
  added: []
  patterns:
    - Dependency-free closed-schema validation and canonical JSON hashing
    - Content-addressed immutable release assets without clobber
    - API-verified private destination and byte-exact authenticated readback

key-files:
  created:
    - scripts/release/build-receipt.mjs
    - scripts/release/verify-receipt.mjs
    - scripts/release/publish-evidence.mjs
    - tests/release/receipt.test.ts
  modified:
    - .github/release/release-receipt.schema.json
    - scripts/release/validate-config.mjs
    - tests/release/release-policy.test.ts

key-decisions:
  - "Represent policy version, release stage, and predecessor linkage as required closed-schema fields."
  - "Require the actual predecessor receipt, not only a caller-supplied predecessor digest, before a later stage verifies."
  - "Upload through uniquely named staged files because GitHub CLI asset labels do not rename release assets."
  - "Expose a numeric authenticated API asset URL and a hashed destination identifier so public output does not reveal the private repository name."

patterns-established:
  - "Receipt authority: canonical bytes, schema and policy versions, exact green checks, authenticated approval, OIDC subject, and predecessor identity all agree."
  - "Evidence authority: PRIVATE visibility is proven before upload; existing bytes may be reused but never clobbered."

requirements-completed: []

duration: 13min
completed: 2026-08-25
---

# Phase 1 Plan 08: Canonical Private Release Evidence Summary

**Canonical release receipts now bind every D-15 field, stage predecessor, approval, exception, rollback, and attestation to an immutable SHA-256 identity with private readback proof**

## Performance

- **Duration:** 13 min
- **Started:** 2026-08-25T16:44:30-07:00
- **Completed:** 2026-08-25T16:57:58-07:00
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Added dependency-free closed-schema validation, deterministic identity-array ordering, canonical key ordering, SHA-256 receipt IDs, and exclusive content-addressed writes.
- Covered all required top-level and nested D-15 fields with negative tests and enforced the exact ten successful release checks.
- Required the actual content-addressed predecessor receipt at every functions→frontend→dormant→enable transition, including matching commit, environment, target, stage, and subject digest.
- Enforced authenticated release-owner evidence and fail-closed D-13/D-14 exceptions with current policy identity, complete evidence, future expiry, and a seven-day maximum.
- Added a GitHub publisher that rejects missing, public, internal, source, or unverified repositories; uploads uniquely named receipt, attestation, and report assets without clobber; and verifies receipt bytes through authenticated readback.
- Added an external-write-free self-test covering private success, idempotency, public-destination rejection, tamper rejection, and no-clobber behavior.

## Task Commits

Each task was committed atomically:

1. **Task 1: Build and verify canonical content-addressed receipts** - `cc1e201` (failing contracts), `ad3e7b0` (implementation)
2. **Task 2: Publish and read back authoritative evidence privately** - `9307dfd` (failing contracts), `63d9d85` (implementation), `13a22e3` (configuration alignment)

## Files Created/Modified

- `.github/release/release-receipt.schema.json` - Adds closed policy, stage, and predecessor fields and requires nonempty approvals, migrations, and rollback references.
- `scripts/release/build-receipt.mjs` - Selects declared fields, normalizes identity arrays, verifies content, hashes canonical JSON, and writes without overwrite.
- `scripts/release/verify-receipt.mjs` - Validates the schema, policy, checks, stages, predecessor receipt, approvals, exceptions, timestamps, digests, attestation, and canonical bytes.
- `scripts/release/publish-evidence.mjs` - Verifies PRIVATE visibility, creates or reuses the commit evidence release, prevents clobber, uploads private assets, and validates authenticated readback.
- `tests/release/receipt.test.ts` - Runs 72 receipt, exception, privacy, tamper, readback, and immutability contracts.
- `scripts/release/validate-config.mjs` and `tests/release/release-policy.test.ts` - Keep the foundation contract aligned with the strengthened receipt schema.

## Decisions Made

- Used the receipt filename as the content address instead of placing a self-referential digest inside the receipt body.
- Required a trusted authenticated-owner value outside the receipt payload and matched it to a protected release-owner approval; exception owners cannot self-assert authority from the receipt alone.
- Used a numeric GitHub API asset URL for deployment linkage while returning only a hash-derived destination identifier in public output.
- Allowed identical existing assets as an idempotent success but rejected any same-name byte mismatch before new uploads.

## Deviations from Plan

### Auto-fixed Issues

**1. The original closed schema could not represent policy or stage-chain authority**

- **Found during:** Task 1 receipt design
- **Issue:** `policy_version`, `stage`, and `predecessor` were absent, so exact policy binding and schema→functions→frontend→dormant→enable linkage could not be schema-valid.
- **Fix:** Added all three as required closed-schema fields and updated the foundation validator/contracts.
- **Verification:** All 96 release-policy and receipt tests pass; the committed configuration validator passes.
- **Committed in:** `ad3e7b0`, `13a22e3`

---

**Total deviations:** 1 auto-fixed blocking contract defect
**Impact on plan:** The schema extension is necessary to implement the plan's explicit stage-chain and policy-version acceptance criteria.

## Issues Encountered

- GitHub CLI's `file#label` syntax changes only the display label, not the asset filename. The publisher now copies each asset into an exact content-addressed staging filename before upload and deletes only that temporary staging directory afterward.

## User Setup Required

Before any production promotion can publish authoritative evidence:

- Create or approve a separate private GitHub repository and set `RELEASE_EVIDENCE_REPOSITORY` to its `owner/name` identity in the protected production environment.
- Grant that environment's token read/write release access to the private evidence repository.
- Do not use `marmelab/atomic-crm` or `Rconman99/atomic-crm`; both are explicitly rejected source repositories.

The absence of this setup correctly blocks live publication and does not block local/CI self-tests.

## Next Phase Readiness

- Wave 3 can use canonical receipts and private publication as downstream evidence contracts.
- Plans 01-09 and 01-10 can wire the publisher only inside protected build/promotion workflows.
- REL-04 and REL-05 remain open until CI controls, staged deployment, live evidence configuration, and all security gates are verified together.

---
*Phase: 01-executable-financial-test-and-release-gate*
*Completed: 2026-08-25*
