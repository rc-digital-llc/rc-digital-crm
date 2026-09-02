---
phase: 02-tenant-role-and-evidence-security
verified: 2026-09-02T01:50:00Z
status: passed
score: 5/5 must-haves verified
---

# Phase 2: Tenant, Role, and Evidence Security Verification Report

**Phase Goal:** Operators, customer contacts, and automation can act only inside
an explicit billing account boundary, while financial evidence remains private
and privileged commands remain narrowly authorized.
**Verified:** 2026-09-02T01:50:00Z
**Status:** passed

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | An operator can manage a billing account, status, responsible owner, and authorized billing contacts inside an explicit organization/account boundary. | ✓ VERIFIED | Caller-bound atomic create/edit commands, Supabase/FakeRest parity, and responsive list/create/edit/detail contracts pass. The rendered source receipt shows loaded mobile and desktop account/create surfaces. |
| 2 | Human billing roles are separated, and automation is limited to exact account, command, provider, policy, action, and quota grants. | ✓ VERIFIED | Forced-RLS role/assignment tables and transactional automation-grant consumption pass schema, pgTAP, HTTP, replay, and simultaneous-consumption checks. Machine identities cannot hold human roles. |
| 3 | Real two-tenant behavior denies operators, customer contacts, automation principals, and forged evidence capabilities outside their entitlement. | ✓ VERIFIED | Local Auth-issued JWTs traverse PostgREST/RPC/Storage/Edge boundaries; all allowed effects and denied protected-state/audit snapshots pass across two organizations. |
| 4 | Financial evidence remains private, quarantine-first, retention/hold-aware, and available only through short-lived server-issued capabilities with durable access records. | ✓ VERIFIED | Private-bucket SQL policies and running upload/inspection/download commands pass 10 Edge/provider tests, including exact-path existence, clean-state, expiry, replay, and cross-tenant denials. |
| 5 | Privileged functions bind caller/tenant ownership with locked execution context, while billing logs, support views, and exports expose only allowlisted safe fields. | ✓ VERIFIED | Nine database suites, recursive redaction, error/log boundary, allowlisted export, cache-exclusion, and release-security tests pass; current and history scans report zero findings. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| Tenant/role/account migrations | Explicit ownership, separated roles, forced RLS, append-only audit | ✓ VERIFIED | Migrations 01–07 install through the 40-migration clean chain and upgrade the immutable baseline with nine semantic invariants. |
| Live authorization contracts | Representative Auth, PostgREST, RPC, Storage, and Edge denials/effects | ✓ VERIFIED | Nine pgTAP files (262 assertions), 3 live Auth/HTTP tests, and 10 Edge/provider tests pass in isolated loopback stacks. |
| Automation and contention contracts | Exact tuple authority, replay safety, limit consumption, restart behavior | ✓ VERIFIED | The fixture passes 18 assertions and the live PostgreSQL suite passes 8 tests, including 32 same-key claims and simultaneous one-unit consumption. |
| Billing provider and UI surface | Safe CRUD/compound commands, responsive resources, no sensitive persistence | ✓ VERIFIED | The 48-test fast suite passes provider parity, redaction, UI behavior, static security, path classification, and lane coupling. |
| Rendered source proof | Exact routes, freshness, canonical identity, reflow, target sizing, focus, and browser health | ✓ VERIFIED | Receipt `46d00daf4bb826148b908fce71072f59d0c40caeb1688841671b1b3d54272062` passes 92/92 checks and retains four matching screenshots. |

**Artifacts:** 5/5 verified

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| Auth caller | Organization/account data | Active assignment or customer-contact binding plus forced RLS | ✓ WIRED | Browser organization claims are not authority; protected-state snapshots remain unchanged on denial. |
| Automation caller | Protected effect | One exact grant tuple consumed in the same transaction | ✓ WIRED | Rebinding, tuple mismatch, expiry, limit, replay, and contention fail closed. |
| Evidence request | Private object | Caller-JWT access decision followed by service-only exact-path signing | ✓ WIRED | Quarantine precedes upload; download requires clean active retained unheld state and lasts at most 60 seconds. |
| Billing UI | Supabase/FakeRest providers | Shared typed resource/method/capability registries | ✓ WIRED | Provider parity checks cover standard records and compound account, access, automation, and evidence commands. |
| Billing source paths | Protected release checks | Exact financial classification and explicit Make target enumeration | ✓ WIRED | All six inherited workflow identities remain required; no optional job, retry, direct hosted mutation, or alternate check was added. |
| Browser routes | Staged surface evidence | Browser-history paths, canonical metadata, freshness marker, and independent contracts | ✓ WIRED | Source passed; immutable preview and canonical production remain intentionally separate later gates. |

**Wiring:** 6/6 verified

## Requirements Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| WORK-01 | ✓ SATISFIED | Responsive account list/create/edit/detail, responsible owner/contact commands, and allowlisted export pass provider/UI/rendered proof. |
| SEC-01 | ✓ SATISFIED | Explicit organization/account ownership, deterministic invoice backfill, forced RLS, clean replay, and accepted upgrade invariants pass. |
| SEC-02 | ✓ SATISFIED | Real two-tenant human, customer, automation, and evidence-capability denials pass over live local service boundaries. |
| SEC-03 | ✓ SATISFIED | Least-privilege human roles, separation constraints, assignments, capabilities, and caller-bound commands pass. |
| SEC-04 | ✓ SATISFIED | Automation identities and grants bind exact account/command/provider/policy/action/limit tuples transactionally. |
| SEC-05 | ✓ SATISFIED | Private evidence paths, quarantine, clean-only access, retention, holds, and append-only access events pass. |
| SEC-06 | ✓ SATISFIED | Ownership validation, locked execution context, append-only audit, exact effects, and concurrency rollback pass. |
| SEC-07 | ✓ SATISFIED | Recursive redaction, strict log/error context, support-safe views, allowlisted export, and cache exclusion pass. |

**Coverage:** 8/8 requirements satisfied

## Exact Execution Evidence

The complete no-assertion-retry gate passed at integrated implementation head `68b013e4`:

- 40-migration clean install and schema push
- PostgreSQL 17 production-like upgrade with report SHA-256 `2d3909b3e62cd23c295ab096fd524da9839d69a626fdd5aadd08534578f63347`
- 262 pgTAP assertions; 3 Auth/HTTP, 10 Edge/provider, and 8 live contention tests
- 18 deterministic contention fixture assertions and 48 billing fast tests
- zero critical/high dependency findings and zero current/history scanner findings
- six protected workflow identities coupled, plus green typecheck, lint, and build
- source surface receipt: 92 checks, 0 failures, 2 routes × 2 viewports

## Human and Release-Stage Verification

No independent reviewer was used, by explicit owner decision. The four exact
source screenshots were visually inspected inline and match their recorded
hashes. Automated focus exposure, target sizing, reflow, overlay, console, and
page-error checks passed.

The following are not implementation gaps and remain mandatory at their proper
stages:

- five-viewport immutable preview receipt for the exact PR head before merge;
- hosted invoice-backfill receipt during protected schema promotion;
- canonical five-viewport production receipt after authorized release;
- residual screen-reader and physical-device checks, recorded without claiming
  complete automated accessibility proof.

## Gaps Summary

No Phase 2 implementation gap remains. Deployed-stage and residual manual
evidence is explicitly pending and cannot be pre-satisfied by this report.

## Verification Metadata

**Verification approach:** Goal-backward from the five Phase 2 success criteria
**Must-haves source:** `.planning/ROADMAP.md` and Plans 02-01 through 02-12
**Automated checks:** Full exact-head financial/security/type/lint/build gate plus rendered source receipt
**Human checks completed:** Inline visual inspection of the four exact source screenshots
**Human checks pending:** Screen reader and physical device

---

_Verified: 2026-09-02T01:50:00Z_
_Verifier: Codex (inline phase verifier; no independent reviewer by owner decision)_
