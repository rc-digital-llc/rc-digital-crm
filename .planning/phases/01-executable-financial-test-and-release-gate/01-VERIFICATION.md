---
phase: 01-executable-financial-test-and-release-gate
verified: 2026-08-27T16:21:47Z
status: gaps_found
score: 2/4 must-haves verified
---

# Phase 1: Executable Financial Test and Release Gate Verification Report

**Phase Goal:** Maintainers and release owners can prove that financial changes migrate, authorize, fail, and deploy safely before those changes can reach production.
**Verified:** 2026-08-27T16:21:47Z
**Status:** gaps_found

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | The complete migration chain replays cleanly and upgrades the immutable representative baseline without silent fact changes. | ✓ VERIFIED | All 33 migrations replay; isolated schema push passes; baseline upgrade preserves every declared fingerprint except the explicit grant transformation. |
| 2 | Real PostgreSQL, RLS, RPC, trigger, Auth/PostgREST, Edge, provider, replay, and concurrency behavior executes under representative claims. | ✓ VERIFIED | 75 live pgTAP assertions, Auth/PostgREST integration, 8 Edge/provider contracts, 18 concurrency TAP assertions, and 7 concurrency Vitest cases pass. |
| 3 | Live merge authority blocks money-bearing changes on every required independent check. | ⚠ PARTIAL | The source repository is organization-owned and the exact no-bypass main ruleset passes authenticated readback. Replacement PR #3 at `04c2926` passes all four fast checks and all six financial checks, including release security; an independent reviewer is still required before a merge-group candidate can be observed. |
| 4 | A release owner can execute separately approved, receipt-linked production promotion and enablement through private evidence. | ⚠ PARTIAL | The private evidence repository passes authenticated/private readback and both protected environments exist with no admin bypass or self-review. Scoped secrets/targets, an independent reviewer, and the synthetic protected dry run remain absent. |

**Score:** 2/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| Migration and baseline harness | Clean replay, isolated push, immutable upgrade comparison | ✓ EXISTS + SUBSTANTIVE | Dedicated scripts, fixtures, pgTAP, and Make targets execute successfully. |
| Authorization/provider/concurrency harness | Real local service and simultaneous database proof | ✓ EXISTS + SUBSTANTIVE | SQL, HTTP, Edge, webhook, provider, restart, replay, ordering, and parallel fixtures pass. |
| Release security gate | Dependency, secret, bundle, and coupling enforcement | ✓ EXISTS + SUBSTANTIVE | Dependency, fully redacted history/tree secret, bundle, and coupling checks pass; exact local-only classifications are hash-pinned against expansion. |
| Merge control | Independent workflow checks plus live no-bypass ruleset | ⚠ LIVE CONTROL PARTIAL | Organization ownership and exact ruleset readback pass; required review and merge-group proof remain. |
| Staged release control | Immutable build, private receipts, promotion, enablement, rollback | ⚠ LIVE CONTROL PARTIAL | Private storage and protected environment policy exist; credentials, target variables, second reviewer, and synthetic approvals remain. |

**Artifacts:** 3/5 operationally verified; 2/5 source-complete but unavailable live

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| Financial path policy | Six financial CI jobs | Exact workflow identities and Make commands | ✓ WIRED | Source-policy tests cover names, commands, permissions, triggers, and merge-group behavior. |
| Checked-in main ruleset | Live GitHub main protection | Authenticated API comparison | ✓ WIRED | Authenticated readback matches `main-financial-release`, including merge queue, ten exact checks, one review, signed/linear history, and no bypass actors. |
| Build receipt | Promotion input | Private evidence fetch, digest, attestation, predecessor verification | ✓ WIRED | Tamper, unsafe path, mixed-release, and wrong-predecessor cases fail. |
| Frontend artifact | Deployed production branch | Authenticated clone plus exact tree hash readback | ✓ WIRED | Every path and file digest must match before a stage receipt can be issued. |
| Promotion approval | Production secrets and one-stage mutation | `production-release` environment | ⚠ PARTIAL | Protection, reviewer policy, and branch restriction exist; scoped secrets/targets and synthetic approval proof are missing. |
| Dormant receipt | Separate enablement approval | `production-financial-enable` environment and empty Phase 1 registry | ⚠ PARTIAL | Separate protection exists and the empty registry still prevents a real enable; scoped secrets and synthetic approval proof are missing. |
| Historical secret classification | Release-security result | Value-blind local-stack reproduction plus full-redaction Gitleaks history scan | ✓ WIRED | The two historical values exactly match fresh isolated local-stack outputs; only their exact hash-pinned fingerprints are classified, and both history/tree scans pass. |

**Wiring:** 5/7 operationally verified; 2/7 partially provisioned

## Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| REL-01: clean migration and representative upgrade | ✓ SATISFIED | - |
| REL-02: real database, authorization, Edge/provider, replay, and concurrency tests | ✓ SATISFIED | - |
| REL-03: blocking CI for money-bearing changes | ✗ BLOCKED | Live protection is installed and all ten exact PR contexts pass, but the required fresh merge-group run still needs an independent reviewer. |
| REL-04: independently verified staged production release | ✗ BLOCKED | Private evidence and environment policy exist; scoped secrets/targets, independent review, and synthetic live approval/readback proof are absent. |
| REL-05: non-waivable vulnerability, secret, source-map, and coupling gates | ✓ SATISFIED | All four release-security classes pass; negative tests reject leaks, broad classifications, source maps, bundle markers, and workflow bypasses. |

**Coverage:** 3/5 requirements satisfied

## Anti-Patterns Found

No unresolved source anti-patterns remain after the standard-depth review in
`01-REVIEW.md`. The open items are external control gaps, not hidden source
stubs or bypasses.

## Human Verification Required

### 1. Independent Review and Merge-Queue Candidate

**Test:** Add a second trusted organization reviewer, obtain approval for PR #3,
and enqueue it now that all ten exact required contexts pass live CI.
**Expected:** A fresh merge-group candidate runs all ten exact required contexts
under the already verified no-bypass ruleset.
**Why human:** The sole current organization member authored the PR and cannot
provide the independent approval required by policy.

### 2. Protected Release Environments and Private Evidence

**Test:** Provision the declared scoped secrets and target variables, add the
independent reviewer, then run a synthetic build → schema → functions → frontend
→ dormant chain and a separate enablement approval attempt.
**Expected:** Each environment pauses for its required reviewer, secrets appear
only after approval, private authenticated readback succeeds, unauthenticated
readback fails, and the empty Phase 1 feature registry blocks enablement.
**Why human:** Production credential/target selection and independent approval
are owner-controlled inputs and cannot be fabricated from repository context.

## Gaps Summary

### Critical Gaps (Block Progress)

1. **A fresh merge-group proof cannot yet be produced**
   - Present: Organization ownership and exact no-bypass main ruleset readback.
   - Missing: An independent PR reviewer; the live release-security check now passes.
   - Impact: Plan 01-09 and REL-03 remain open despite live protection being installed.
   - Fix: Add a second trusted reviewer, approve PR #3, enqueue it, and observe the unconditional merge-group checks.

2. **Protected release infrastructure is only partially provisioned**
   - Present: Private evidence storage and two protected environments with no admin bypass, self-review prevention, and protected-branch restrictions.
   - Missing: Scoped variables/secrets, an independent reviewer, and synthetic dry-run receipts.
   - Impact: Approval isolation, private readback, staged promotion, and separate enablement cannot be proven; Plan 01-10 and REL-04 remain open.
   - Fix: Provision the declared controls and complete the documented synthetic dry run without enabling a customer feature.

### Non-Critical Gaps (Can Defer)

None. Every recorded gap is phase-blocking by the approved release policy.

## Recommended Fix Plans

No additional plan files are needed. Complete the owner-action sections already
defined in `01-09-PLAN.md` and `01-10-PLAN.md`, then rerun the
security audit and this phase verification.

## Verification Metadata

**Verification approach:** Goal-backward from the four Phase 1 success criteria
**Must-haves source:** `.planning/ROADMAP.md` and Plans 01-01 through 01-10
**Automated checks:** 21 mapped task checks passed; 3 external checks failed closed
**Human checks required:** 2
**Total verification time:** Full isolated financial gate plus targeted final review checks

---

_Verified: 2026-08-27T16:21:47Z_
_Verifier: Codex (inline phase verifier)_
