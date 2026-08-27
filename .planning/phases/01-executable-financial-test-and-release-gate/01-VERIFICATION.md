---
phase: 01-executable-financial-test-and-release-gate
verified: 2026-08-27T03:35:29Z
status: gaps_found
score: 2/4 must-haves verified
---

# Phase 1: Executable Financial Test and Release Gate Verification Report

**Phase Goal:** Maintainers and release owners can prove that financial changes migrate, authorize, fail, and deploy safely before those changes can reach production.
**Verified:** 2026-08-27T03:35:29Z
**Status:** gaps_found

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | The complete migration chain replays cleanly and upgrades the immutable representative baseline without silent fact changes. | ✓ VERIFIED | All 33 migrations replay; isolated schema push passes; baseline upgrade preserves every declared fingerprint except the explicit grant transformation. |
| 2 | Real PostgreSQL, RLS, RPC, trigger, Auth/PostgREST, Edge, provider, replay, and concurrency behavior executes under representative claims. | ✓ VERIFIED | 75 live pgTAP assertions, Auth/PostgREST integration, 8 Edge/provider contracts, 18 concurrency TAP assertions, and 7 concurrency Vitest cases pass. |
| 3 | Live merge authority blocks money-bearing changes on every required independent check. | ⚠ PARTIAL | The source repository is organization-owned and the exact no-bypass main ruleset passes authenticated readback. PR #2 proves all fast checks and five non-secret financial lanes, but the historical-secret lane and missing independent reviewer prevent a merge-group candidate. |
| 4 | A release owner can execute separately approved, receipt-linked production promotion and enablement through private evidence. | ⚠ PARTIAL | The private evidence repository passes authenticated/private readback and both protected environments exist with no admin bypass or self-review. Scoped secrets/targets, an independent reviewer, and the synthetic protected dry run remain absent. |

**Score:** 2/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| Migration and baseline harness | Clean replay, isolated push, immutable upgrade comparison | ✓ EXISTS + SUBSTANTIVE | Dedicated scripts, fixtures, pgTAP, and Make targets execute successfully. |
| Authorization/provider/concurrency harness | Real local service and simultaneous database proof | ✓ EXISTS + SUBSTANTIVE | SQL, HTTP, Edge, webhook, provider, restart, replay, ordering, and parallel fixtures pass. |
| Release security gate | Dependency, secret, bundle, and coupling enforcement | ⚠️ BLOCKING BY DESIGN | Dependency, current-tree, bundle, and coupling checks pass; full history intentionally remains red pending credential rotation. |
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
| Historical secret finding | Release-security result | Full-redaction Gitleaks history scan | ✓ FAIL-CLOSED | Two identifiers remain blocking under rotation ID `16fb4d8f3aa647db0bb47df5690ee5eb8507c48ed7da4c5b981a9e8de959dcf0`. |

**Wiring:** 5/7 operationally verified; 2/7 partially provisioned

## Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| REL-01: clean migration and representative upgrade | ✓ SATISFIED | - |
| REL-02: real database, authorization, Edge/provider, replay, and concurrency tests | ✓ SATISFIED | - |
| REL-03: blocking CI for money-bearing changes | ✗ BLOCKED | Live protection is installed, but the required fresh merge-group run is blocked by the historical-secret failure and lack of an independent reviewer. |
| REL-04: independently verified staged production release | ✗ BLOCKED | Private evidence and environment policy exist; scoped secrets/targets, independent review, and synthetic live approval/readback proof are absent. |
| REL-05: non-waivable vulnerability, secret, source-map, and coupling gates | ✗ BLOCKED | Historical credential rotation has no private completion evidence; the gate remains red without waiver. |

**Coverage:** 2/5 requirements satisfied

## Anti-Patterns Found

No unresolved source anti-patterns remain after the standard-depth review in
`01-REVIEW.md`. The open items are external control gaps, not hidden source
stubs or bypasses.

## Human Verification Required

### 1. Historical Credential Rotation

**Test:** Rotate the identified provider credential outside the repository,
record private evidence against the rotation ID, and rerun
`make test-release-secrets` with the approved private evidence mechanism.
**Expected:** The history scan remains fully redacted and the release gate
recognizes valid private rotation proof without an allowlist or waiver.
**Why human:** Only the credential owner can rotate the provider-side secret and
retain private proof.

### 2. Independent Review and Merge-Queue Candidate

**Test:** Add a second trusted organization reviewer, obtain approval for PR #2,
and enqueue it after the historical-secret gate passes.
**Expected:** A fresh merge-group candidate runs all ten exact required contexts
under the already verified no-bypass ruleset.
**Why human:** The sole current organization member authored the PR and cannot
provide the independent approval required by policy.

### 3. Protected Release Environments and Private Evidence

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

1. **Historical credential rotation is incomplete**
   - Missing: Provider-side rotation plus private evidence for the stable finding ID.
   - Impact: The non-waivable secret gate remains red and Plan 01-07 cannot complete.
   - Fix: Rotate privately, record evidence without committing credential data, and rerun the gate.

2. **A fresh merge-group proof cannot yet be produced**
   - Present: Organization ownership and exact no-bypass main ruleset readback.
   - Missing: A passing historical-secret check and independent PR reviewer.
   - Impact: Plan 01-09 and REL-03 remain open despite live protection being installed.
   - Fix: Complete rotation, add a second trusted reviewer, approve PR #2, and observe the unconditional merge-group checks.

3. **Protected release infrastructure is only partially provisioned**
   - Present: Private evidence storage and two protected environments with no admin bypass, self-review prevention, and protected-branch restrictions.
   - Missing: Scoped variables/secrets, an independent reviewer, and synthetic dry-run receipts.
   - Impact: Approval isolation, private readback, staged promotion, and separate enablement cannot be proven; Plan 01-10 and REL-04 remain open.
   - Fix: Provision the declared controls and complete the documented synthetic dry run without enabling a customer feature.

### Non-Critical Gaps (Can Defer)

None. Every recorded gap is phase-blocking by the approved release policy.

## Recommended Fix Plans

No additional plan files are needed. Complete the owner-action sections already
defined in `01-07-PLAN.md`, `01-09-PLAN.md`, and `01-10-PLAN.md`, then rerun the
security audit and this phase verification.

## Verification Metadata

**Verification approach:** Goal-backward from the four Phase 1 success criteria
**Must-haves source:** `.planning/ROADMAP.md` and Plans 01-01 through 01-10
**Automated checks:** 20 mapped task checks passed; 4 external/security checks failed closed
**Human checks required:** 3
**Total verification time:** Full isolated financial gate plus targeted final review checks

---

_Verified: 2026-08-27T03:35:29Z_
_Verifier: Codex (inline phase verifier)_
