---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Completed 04-06-PLAN.md
last_updated: "2026-09-04T23:28:19.485Z"
last_activity: 2026-09-04
progress:
  total_phases: 10
  completed_phases: 3
  total_plans: 37
  completed_plans: 35
  percent: 30
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-09-04)

**Core value:** Every dollar billed and collected is automatically traceable
to the applicable agreement version, verified revenue evidence, deterministic
calculation, invoice, payment-provider event, settlement, and collections
history.
**Current focus:** Phase 04 — agreements-revenue-evidence-and-calculation-close

## Current Position

Phase: 04 (agreements-revenue-evidence-and-calculation-close) — EXECUTING
Plan: 7 of 8
Status: Ready to execute
Last activity: 2026-09-04

Progress: [██████████] 95%

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
| Phase 04 P01 | 22 min | 3 tasks | 4 files |
| Phase 04 P02 | 23 min | 3 tasks | 3 files |
| Phase 04 P03 | 34 min | 3 tasks | 5 files |
| Phase 04 P04 | 29 min | 3 tasks | 8 files |
| Phase 04 P05 | 44 min | 3 tasks | 13 files |
| Phase 04 P06 | 22 min | 3 tasks | 11 files |

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
- [Phase 04]: Agreement activation uses an advisory lock plus GiST exclusion; active ranges are never truncated. — This preserves signed historical terms while making concurrent non-overlap a database invariant.
- [Phase 04]: Pause and termination are append-only events instead of edits to activated versions. — Operational lifecycle changes must not rewrite calculation authority.
- [Phase 04]: Agreement approval is human-only and same-person approval is explicitly marked. — Automation cannot become commercial authority, while the accepted single-owner risk remains visible.
- [Phase 04]: Revenue corrections append immutable linked revisions, and one acceptance event is the sole close authority. — Historical source amounts and reviewer causation must remain reproducible.
- [Phase 04]: Minimum-only close freezes null revenue inputs and retains an open missing-evidence exception. — The system must never turn missing evidence into an estimate.
- [Phase 04]: Calculation authority accepts only active agreement terms and frozen close inputs. — Browser amounts, branches, and explanations cannot become financial authority.
- [Phase 04]: Calculation approval is one immutable event over a frozen snapshot. — Manual and automation paths share current policy, anomaly, fingerprint, and authorization rechecks without mutating the calculation.
- [Phase 04]: Missing and zero prior periods have distinct exact comparison states. — not_available preserves null deltas; zero_baseline avoids inventing a percentage.
- [Phase 04]: Close, calculation creation, and approval remain separate commands, while shared validators require immutable IDs, fingerprints, policies, exact values, and actor/grant causation to form one complete chain.
- [Phase 04]: Support lineage is caller-bound and allowlisted to stable IDs, exact values, policy names, and hash prefixes; raw evidence paths, content, filenames, and customer data are excluded.
- [Phase 04]: Late evidence creates a dedicated immutable adjustment calculation and acyclic link without reopening or changing the original close, calculation, approval, or missing-evidence exception.
- [Phase 04]: A hybrid late adjustment compares the exact percentage candidate with the frozen minimum, and the original true-up policy alone determines credit-candidate versus held treatment for a negative delta.
- [Phase 04]: Phase 4 authority is exposed only through seventeen explicit typed methods; raw and semantic support resources reject generic create, update, and delete operations. — Named transactional boundaries prevent generic CRUD from bypassing immutable server workflows.
- [Phase 04]: Revenue-period and calculation support lists use bounded caller-scoped RPCs with text financial tokens and safe fields only. — The UI needs list data without trusting browser tenant scope or exposing evidence paths and content.
- [Phase 04]: Supabase success payloads are accepted only after exact key, ID, policy, hash, lineage, and formula reconciliation. — Structurally valid JSON is not sufficient financial authority.
- [Phase 04]: FakeRest owns deterministic isolated state per factory and mirrors evidence, replay, conflict, anomaly, lineage, and adjustment behavior without network or randomness. — Demo behavior must be repeatable and must not silently weaken production controls.
- [Phase 04]: Agreement lifecycle history uses a caller-scoped support-safe projection with string event IDs. — Operators need immutable actor, role, reason, and timestamp causation without evidence storage details or raw contract content.
- [Phase 04]: Active agreement versions remain browser read-only and amendments create new drafts. — Signed calculation authority must remain immutable while operators can propose future terms through explicit server commands.
- [Phase 04]: Agreement presentation stops offline and treats capability checks as presentation only. — Sensitive agreement data must not render from persisted cache, and the server must remain authoritative for every lifecycle command.

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

Last session: 2026-09-04T23:28:19.479Z
Stopped at: Completed 04-06-PLAN.md
Resume file: None
