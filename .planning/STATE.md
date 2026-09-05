---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: ready_to_plan
stopped_at: Phase 03 complete (7/7) — ready to discuss Phase 4
last_updated: 2026-09-05T03:08:48.596Z
last_activity: 2026-09-04
progress:
  total_phases: 10
  completed_phases: 3
  total_plans: 29
  completed_plans: 29
  percent: 30
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-20)

**Core value:** Every dollar billed and collected is automatically traceable to the applicable agreement version, verified revenue evidence, deterministic calculation, invoice, payment-provider event, settlement, and collections history.
**Current focus:** Phase 4 — agreements, revenue evidence, and calculation close

## Current Position

Phase: 4
Plan: Not started
Status: Ready to plan
Last activity: 2026-09-05

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**

- Total plans completed: 33
- Average duration: 27 min
- Total execution time: 11.9 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| Phase 01 | 10 | 371 min | 37 min |
| Phase 02 | 12 | 212 min | 18 min |
| Phase 03 | 4 | 128 min | 32 min |
| 03 | 7 | - | - |

**Recent Trend:**

- Last 5 plans: 31 min, 15 min, 32 min, 25 min, 56 min
- Trend: Phase 3 exact billing cutover and production-shaped replay are protected

| Phase 03 P03 | 25 min | 2 tasks | 5 files |
| Phase 03 P04 | 56 min | 3 tasks | 12 files |
| Phase 03 P05 | 27 min | 3 tasks | 7 files |
| Phase 03 P06 | 22 min | 3 tasks | 8 files |
| Phase 03 P07 | 28 min | 2 tasks | 2 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table. Current release and security decisions:

- [Phase 01]: Financial behavior reaches `main` only through six protected,
  unconditional, merge-queue-aware identities plus the staged promotion path.

- [Phase 01]: Source, build, preview, promotion, and customer-facing production
  are distinct evidence stages; one cannot substitute for another.

- [Phase 01]: Exact historical findings may be classified only after review and
  only by immutable fingerprint; broader scanner exceptions fail closed.

- [Phase 02]: Tenant authority derives from the authenticated caller's active
  assignments/bindings, never a browser-supplied organization or account ID.

- [Phase 02]: Human role capabilities are independent and additive; automation
  identities cannot hold human roles and can invoke only exact transactional
  grant tuples with limits, policy, provider, account, and command binding.

- [Phase 02]: Billing accounts, contacts, invoices, evidence, assignments, and
  audit history are non-destructive, caller-bound, forced-RLS resources.

- [Phase 02]: Evidence paths and short-lived capabilities remain server-owned;
  quarantine, inspection, retention, holds, and durable access decisions gate
  every download.

- [Phase 02]: Logs and errors use recursive fail-closed redaction plus a narrow
  scalar context allowlist; sensitive billing queries never persist offline.

- [Phase 02]: Supabase and FakeRest share executable billing contracts, while
  deterministic demo values remain non-network and non-sensitive.

- [Phase 02]: Billing UI capability summaries are presentation-only; every
  database, RPC, Storage, and Edge operation reauthorizes independently.

- [Phase 02]: Billing paths use real browser-history routes with root-relative
  assets and route-scoped canonical metadata.

- [Phase 02]: All SQL/Auth/Storage/Edge/redaction/provider/UI/QA contracts run
  inside the inherited six blocking identities, and exact path classification
  prevents billing changes from skipping them.

- [Phase 02]: The accepted upgrade registry chains the full Phase 2 migration
  set and pins final constraint/grant transforms plus semantic invariants.

- [Phase 02]: Source proof passed at integrated implementation head `68b013e4`;
  immutable preview and canonical production later passed at protected release
  commit `0a7aa022`, while screen-reader, physical-device, and owner-authenticated
  production billing checks remain explicitly separate manual gates.

- [Release]: The browser artifact is built once with an exact Supabase origin
  and publishable key, content-addressed through build → schema → functions →
  frontend receipts, then deployed prebuilt to Vercel and byte-read back.

- [Release]: Credential-free production freshness is proven at the first-owner
  sign-up surface; authenticated billing remains separately proven in an
  immutable deterministic preview until an owner-created account exists.

- [Release]: Email confirmation redirects are explicit in the signup request
  and canonical in hosted Supabase Auth; every promotion reads back that live
  configuration and fails before mutation on localhost, a missing canonical
  allow-list entry, or a cross-project target.

- [Phase 03]: Runtime financial objects use canonical string components; BigInt is confined to validated arithmetic. — This prevents JavaScript number and JSON token coercion from becoming authority.
- [Phase 03]: Rate equality compares reduced canonical ratios while submitted percentage text remains evidence. — Presentation changes do not create a new financial value.
- [Phase 03]: Exact rounding requires usd-v1, exponent 2, and half-away-from-zero-v1 explicitly. — Replays cannot inherit ambient or changed rounding defaults.
- [Phase 03]: Financial policy catalogs are global server-owned reference data with forced RLS and no browser mutation authority. — Their version identities must remain stable across every tenant and historical replay, so tenant sales_id ownership is inapplicable.
- [Phase 03]: PostgreSQL numeric is limited to wider exact intermediates while canonical components and rounded outputs remain checked signed bigint values serialized as strings. — This matches the runtime and wire contract without introducing floating-point or JSON numeric authority.
- [Phase 03]: Public exact helpers require explicit currency, exponent, rate-policy, and rounding-policy identities; private helpers keep empty search paths and no browser execution grants. — Explicit policy binding preserves deterministic replay while least-privilege helper boundaries prevent authority expansion.
- [Phase 03]: Exact minor-unit, ratio, and line-item fields are the sole billing authority; legacy decimals and submitted percentage text remain compatibility projection and immutable evidence. — This prevents parallel decimal authority while preserving audit and compatibility needs.
- [Phase 03]: Authenticated invoice access is RPC-only through caller-bound SECURITY DEFINER functions; direct invoice table and sequence privileges stay revoked. — Definer privilege must preserve caller-derived tenant and capability checks.
- [Phase 03]: Automation replay identity binds canonical exact money to a command-owned effect discriminator, and conflicting key reuse is denied before every protected effect. — A matching idempotency key cannot authorize a different request or evidence outcome.
- [Phase 03]: Registry 003 authorizes only deterministic Wave 4 transformations while accepted Phase 2 migration bytes remain pinned. — The upgrade proof must fail closed on unrelated changes or historical rewrites.
- [Phase 03]: React Admin invoice operations use only caller-bound exact RPCs — Closed provider requests reject generic invoice CRUD and client-supplied tenant identity
- [Phase 03]: Live invoice tenancy is proven through an exact RPC matrix — The inherited non-invoice RLS matrix remains intact and direct invoice table access remains a negative assertion
- [Phase 03]: Existing financial path patterns already classify every Wave 5 file — Make membership and mutation-tested static proof closed the remaining protection gap without redundant classifier entries
- [Phase 03]: FakeRest invoice CRUD delegates to a fresh exact provider — One shared parity matrix receives deterministic isolated state and identical closed financial behavior
- [Phase 03]: Invoice preview accepts canonical exact objects and rounds once through the central named helper — Display text remains one-way evidence and never becomes financial authority
- [Phase 03]: Wave 6 provider parity and preview suites are explicit protected-target members — Narrow classifier entries and mutation proof prevent silent release-gate bypass
- [Phase 03]: Preserve the six existing blocking financial workflow identities; Plan 07 audits their complete coupling instead of adding an optional seventh check.
- [Phase 03]: Keep protected schema promotion separately owner-authorized after the merged default-branch build receipt; local and CI-equivalent validation never constitutes production proof.
- [Phase 03]: Use the exact-ref single-branch checkout as authoritative release history and do not accept, ignore, or expose findings from unrelated upstream-only remote refs.

### Pending Todos

- If requested after owner sign-in, retain an authenticated production billing receipt without storing or fabricating credentials.
- Record residual screen-reader and physical-device coverage when performed.

### Blockers/Concerns

- No Phase 2 implementation, release, or email-confirmation redirect blocker
  remains.

- Canonical production, exact artifact freshness, and the live Supabase Auth
  redirect contract are proven; credentialed sign-in remains owner-operated.

- The Vite build retains non-blocking CSS import-order, bundle-size, and stale
  Browserslist advisories for later cleanup.

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Accessibility | Screen-reader and physical-device billing pass | Pending manual evidence | Phase 2 |

## Session Continuity

Last session: 2026-09-04T23:57:48.727Z
Stopped at: Completed 03-07-PLAN.md
Resume file: None
