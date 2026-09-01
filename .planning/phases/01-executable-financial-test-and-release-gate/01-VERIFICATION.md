---
phase: 01-executable-financial-test-and-release-gate
verified: 2026-09-01T18:58:53Z
status: passed
score: 4/4 must-haves verified
---

# Phase 1: Executable Financial Test and Release Gate Verification Report

**Phase Goal:** Maintainers and release owners can prove that financial changes migrate, authorize, fail, and deploy safely before those changes can reach production.
**Verified:** 2026-09-01T18:58:53Z
**Status:** passed

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | The complete migration chain replays cleanly and upgrades the immutable representative baseline without silent fact changes. | ✓ VERIFIED | All 33 migrations replay; isolated schema push passes; baseline upgrade preserves every declared fingerprint except the explicit grant transformation. |
| 2 | Real PostgreSQL, RLS, RPC, trigger, Auth/PostgREST, Edge, provider, replay, and concurrency behavior executes under representative claims. | ✓ VERIFIED | 75 live pgTAP assertions, Auth/PostgREST integration, 8 Edge/provider contracts, 18 concurrency TAP assertions, and 7 concurrency Vitest cases pass. |
| 3 | Live merge authority blocks money-bearing changes on every required check. | ✓ VERIFIED | The no-bypass `main-financial-release` ruleset requires one owner approval, signed linear history, merge queue, and ten exact contexts. Current protected main `4a6336668b7f038abfc98566725e0e563097b7bc` arrived through those controls. |
| 4 | A release owner can execute separately approved, receipt-linked production promotion and enablement through private evidence. | ✓ VERIFIED | Current-main build and schema/functions/frontend stages passed with authenticated private receipts and exact target readback. Protected dormant and separate enablement attempts reached distinct approval boundaries, then failed before provider access because Phase 1 intentionally registers no live financial feature. Positive dormant/enable transition behavior remains covered by synthetic source tests. |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| Migration and baseline harness | Clean replay, isolated push, immutable upgrade comparison | ✓ OPERATIONALLY VERIFIED | Dedicated scripts, fixtures, pgTAP, and Make targets execute successfully. |
| Authorization/provider/concurrency harness | Real local service and simultaneous database proof | ✓ OPERATIONALLY VERIFIED | SQL, HTTP, Edge, webhook, provider, restart, replay, ordering, and parallel fixtures pass. |
| Release security gate | Dependency, secret, bundle, and coupling enforcement | ✓ OPERATIONALLY VERIFIED | Dependency, fully redacted history/tree secret, bundle, and coupling checks pass; exact local-only classifications are hash-pinned against expansion. |
| Merge control | Exact workflow checks plus live no-bypass ruleset | ✓ OPERATIONALLY VERIFIED | Organization ownership, release-bot authorship, owner approval, signed commits, exact ruleset readback, ten PR contexts, and ten fresh merge-group contexts pass with no bypass. |
| Staged release control | Immutable build, private receipts, promotion, enablement, rollback | ✓ OPERATIONALLY VERIFIED | Protected environments, scoped credentials/targets, private evidence, three successful production-stage receipts, exact frontend/functions readback, and protected fail-closed feature proofs all executed on current main. |

**Artifacts:** 5/5 operationally verified

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| Financial path policy | Six financial CI jobs | Exact workflow identities and Make commands | ✓ WIRED | Source-policy tests cover names, commands, permissions, triggers, and merge-group behavior. |
| Checked-in main ruleset | Live GitHub main protection | Authenticated API comparison | ✓ WIRED | Live `main-financial-release` matches the checked-in contract, including merge queue, ten exact checks, one owner approval, signatures, linear history, and no bypass actors. Report SHA-256: `a44f0db82c5eb7175da15804a68d45e33d3b09ea4fa9c67f46e40e4a4dcee93f`. |
| Build receipt | Promotion input | Private evidence fetch, digest, attestation, predecessor verification | ✓ WIRED | Build run `33545281071` published receipt `c0ae9253cfdeca20c6ac21654403d93af1c21ac1d5d1cacaad74f644e426fbdd`; tamper, unsafe-path, mixed-release, and wrong-predecessor cases fail. |
| Schema receipt | Functions promotion | Protected approval plus exact predecessor verification | ✓ WIRED | Schema run `33545424206` reported the remote database current and published receipt `e39809f71b135d23daa356b072b21be1ed3956821a3ad8b98d169952f686e47f`. |
| Functions receipt | Frontend promotion | Pinned archive deployment and post-state readback | ✓ WIRED | Functions run `33545638363` deployed and read back all five functions, publishing receipt `d2093a35a316064050754cfaa6ffdc2ecef770627fab1947ebefca52e2e38da9`. |
| Frontend artifact | Customer production branch | Authenticated clone plus exact tree hash readback | ✓ WIRED | Frontend run `33545865904` published only the pinned artifact, verified production branch `05f84c4eaa9a08ce0d009e8ef7d56b90d2335390`, and published receipt `16383c889dc36eb2de3a4261a16dc6399915e90813813763cda07851bd049c7c`. |
| Promotion approval | Production secrets and one-stage mutation | `production-release` environment | ✓ WIRED | Runs paused for the protected owner review; scoped secrets appeared only after approval, and each invocation performed one selected stage. |
| Dormant receipt | Separate enablement approval | `production-financial-enable` and the empty Phase 1 registry | ✓ WIRED | Dormant run `33546107386` and enable run `33546294270` independently paused for their protected environments and then rejected the unregistered feature before provider access. No approval or receipt was reused and no financial state changed. |
| Historical secret classification | Release-security result | Value-blind local-stack reproduction plus full-redaction Gitleaks history scan | ✓ WIRED | The two historical values exactly match fresh isolated local-stack outputs; only their exact hash-pinned fingerprints are classified, and history/tree scans pass. The tracked JWK is also the identical upstream Marmelab localhost development fixture; current release archives exclude it and remove its config reference. |

**Wiring:** 9/9 verified

## Live Release Evidence

All current-main runs target commit `4a6336668b7f038abfc98566725e0e563097b7bc`.

| Stage | Run | Result | Authoritative outcome |
|-------|-----|--------|-----------------------|
| Build | `33545281071` | success | Deterministic artifacts, attestations, private publication/readback, build receipt |
| Schema | `33545424206` | success | Remote database current, schema receipt |
| Functions | `33545638363` | success | Five pinned functions deployed/read back, functions receipt |
| Frontend | `33545865904` | success | Pinned customer frontend published and exactly read back, frontend receipt |
| Dormant | `33546107386` | expected failure | Unregistered `synthetic-fixed-billing` rejected before provider access; later mutation/receipt steps skipped |
| Enablement | `33546294270` | expected failure | Distinct approval boundary reached; unregistered feature rejected before evidence fetch, invariants, or mutation |

The two expected failures are positive fail-closed evidence, not escaped release failures. Phase 1's versioned policy contains an empty `financial_features` registry, so a successful real dormant or enable transition would itself be a policy violation.

## Requirements Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| REL-01: clean migration and representative upgrade | ✓ SATISFIED | Clean replay, isolated push, immutable baseline upgrade, and current remote schema proof pass. |
| REL-02: real database, authorization, Edge/provider, replay, and concurrency tests | ✓ SATISFIED | All live local financial test lanes pass under representative claims and concurrent sessions. |
| REL-03: blocking CI for money-bearing changes | ✓ SATISFIED | Live signed merge authority requires all ten exact PR and merge-group contexts with no bypass. |
| REL-04: independently verified staged production release | ✓ SATISFIED | Build, three successful production stages, distinct protected approvals, private receipts/readback, synthetic transition coverage, and live empty-registry rejection are proven. “Independently” refers to independently gated stages; the owner explicitly accepted no independent human reviewer. |
| REL-05: non-waivable vulnerability, secret, source-map, and coupling gates | ✓ SATISFIED | All four release-security classes and their negative tests pass before promotion or enablement. |

**Coverage:** 5/5 requirements satisfied

## Anti-Patterns Found

No unresolved source or live-control anti-pattern remains. Three defects found during protected rollout—release-unsafe Supabase packaging, a missing function runtime dependency, and absent frontend publisher identity—became deterministic regression tests before their protected fixes merged.

## Human Verification

The required owner-controlled checks are complete:

- Both production environments paused for the configured owner approval and did not expose their mutation steps before approval.
- Authenticated private evidence publication/readback passed, while unauthenticated repository access returned 404.
- The current-main schema, functions, and frontend chain produced exact successor receipts.
- A separately approved enablement attempt could not reuse promotion authority and failed before provider access.

No additional Phase 1 human verification remains. Automated checks cannot substitute for future real customer feature registration, provider/legal approval, or physical-device coverage; those remain later-phase gates.

## Gaps Summary

No Phase 1 gaps remain. Production financial behavior stays disabled because the live feature registry is intentionally empty.

## Verification Metadata

**Verification approach:** Goal-backward from the four Phase 1 success criteria
**Must-haves source:** `.planning/ROADMAP.md` and Plans 01-01 through 01-10
**Automated checks:** All mapped task checks pass; protected live runs prove current-main build, promotion, readback, and fail-closed enablement
**Human checks completed:** Protected owner approvals and private evidence visibility/readback

---

_Verified: 2026-09-01T18:58:53Z_
_Verifier: Codex (inline phase verifier; no independent reviewer by owner decision)_
