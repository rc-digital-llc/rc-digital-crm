---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: ready_to_plan
stopped_at: Phase 3 complete (7/7) — ready to discuss Phase 4
last_updated: 2026-09-04T07:21:05.122Z
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

See: .planning/PROJECT.md (updated 2026-09-04)

**Core value:** Every dollar billed and collected is automatically traceable
to the applicable agreement version, verified revenue evidence, deterministic
calculation, invoice, payment-provider event, settlement, and collections
history.
**Current focus:** Phase 4 — agreements, revenue evidence, and calculation close

## Current Position

Phase: 4
Plan: Not started
Status: Ready to plan
Last activity: 2026-09-04

Progress: [██████████] 100%

## Performance Metrics

**Velocity:**

- Total plans completed: 29
- Average duration: 26 min
- Total execution time: 12.6 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| Phase 01 | 10 | 371 min | 37 min |
| Phase 02 | 12 | 212 min | 18 min |
| Phase 03 | 7 | 173 min | 25 min |

**Recent Trend:**

- Last 5 plans: 12 min, 43 min, 17 min, 14 min, 66 min
- Trend: Phase 3 closed with exact cross-runtime authority and complete protected-lane proof

| Phase 03 P01 | 6 min | 3 tasks | 6 files |
| Phase 03 P02 | 15 min | 3 tasks | 5 files |
| Phase 03 P03 | 12 min | 2 tasks | 5 files |
| Phase 03 P04 | 43 min | 3 tasks | 11 files |
| Phase 03 P05 | 17 min | 3 tasks | 8 files |
| Phase 03 P06 | 14 min | 3 tasks | 10 files |
| Phase 03 P07 | 66 min | 2 tasks | 11 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table. Current release and
security decisions:

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

- [Phase 03]: Invoice legacy money and tax columns remain derived compatibility projections; exact minor units, reduced rate ratios, policies, and canonical line items are the sole authority.
- [Phase 03]: Automation replay equality binds the complete request fingerprint and a command-owned effect discriminator; conflicts return before audit, counters, execution, or evidence mutation.
- [Phase 03]: Authenticated invoice access is RPC-only: base-table and sequence privileges remain revoked even though the functions run as a locked definer.
- [Phase 03]: React Admin invoice operations translate into closed exact RPC contracts; generic Supabase table CRUD never handles invoices.
- [Phase 03]: Every exact invoice response is decoded and financially reconciled before branded application types are returned.
- [Phase 03]: Malformed PostgreSQL invoice-save parameter errors are normalized by a forward-only locked wrapper.
- [Phase 03]: FakeRest exact invoice state is owned by an isolated deterministic provider factory.
- [Phase 03]: Invoice preview delegates parsing, exact multiplication, named rounding, and range enforcement to the central exact-money module.
- [Phase 03]: Human invoice preview descriptions are display-only and never accepted as financial authority.

### Pending Todos

- Start Phase 03 exact-money-and-rounding-contract planning.
- If requested after owner sign-in, retain an authenticated production billing
  receipt without storing or fabricating credentials.

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

Last session: 2026-09-04T05:58:29.878Z
Stopped at: Completed 03-06-PLAN.md
Resume file: None
