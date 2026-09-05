---
phase: 04-agreements-revenue-evidence-and-calculation-close
verified: 2026-09-05T00:35:01Z
status: passed
score: 5/5 must-haves verified
---

# Phase 4: Agreements, Revenue Evidence, and Calculation Close Verification Report

**Phase Goal:** Authorized operators can turn immutable commercial terms and reviewed monthly evidence into one frozen, explainable, and reproducible calculation close.
**Verified:** 2026-09-05T00:35:01Z
**Status:** passed

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | An authorized operator can activate non-overlapping immutable fixed, percentage, minimum-support, and hybrid agreement versions with exact definitions and audited changes. | ✓ VERIFIED | The agreement schema constrains the closed formula vocabulary, exact terms, named policies, approvals, and lifecycle events; a GiST exclusion constraint plus advisory-lock activation prevents overlapping active ranges; immutable triggers and caller-bound RPCs preserve activated versions. Agreement pgTAP, Auth, provider, component, and concurrency contracts pass. |
| 2 | Each applicable account receives one monthly revenue period whose submissions retain provenance, submitter, evidence hashes, immutable revisions, and reviewer decisions. | ✓ VERIFIED | Server-derived period identity and idempotency, immutable linked submissions, exact gross/excluded/commissionable reconciliation, provenance, attestations, evidence fingerprints, reviewer causation, and accepted-input fingerprints are persisted and exposed only through caller-scoped support-safe projections. Database, provider, and UI suites pass. |
| 3 | Missing or questionable evidence creates an owned exception and never an estimate; permitted minimum close requires approval and late evidence creates a linked true-up or credit candidate. | ✓ VERIFIED | Close mode is restricted to accepted evidence or policy-permitted `minimum_only`; minimum snapshots retain null revenue authority and an owned exception. Late accepted evidence creates a separate immutable adjustment calculation and acyclic link whose exact delta and treatment follow the frozen agreement policy without reopening history. |
| 4 | Fixed, percentage, minimum, and hybrid calculations freeze terms, evidence, policy, intermediates, result, currency, and explanation and replay exactly. | ✓ VERIFIED | Calculation preview and persistence use the Phase 3 exact-money kernel, immutable snapshot fields, named formula/rate/rounding/close policies, exact branch candidates, hashes, anomaly results, and replay reconciliation. Duplicate same-input requests return existing authority; changed reuse conflicts before effects. |
| 5 | Operators can preview month-over-month differences while duplicates, anomalies, changed inputs, and unsatisfied close policy stop safely before approval or issuance. | ✓ VERIFIED | Strict provider decoders and the account-scoped Monthly Close UI present prior-state distinctions, exact deltas, winning branch, explanations, policies, anomalies, and immutable fingerprints. Approval rechecks the current frozen snapshot, capability, policy, anomaly, and input fingerprint. Phase 4 contains no invoice issuance, payment, portal, or global-close authority. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| Seven additive Phase 4 migrations | Immutable agreements, revenue/review/exception facts, calculation close, late adjustments, and caller-safe reads | ✓ VERIFIED | Migrations `20260904000001`–`20260904000007` replay cleanly, apply through an isolated schema push, and match registry 004's exact migration and catalog fingerprints. |
| PostgreSQL command boundary | Closed caller-bound RPCs, forced RLS, least privilege, immutable facts, and concurrency safety | ✓ VERIFIED | Seventeen public Phase 4 RPCs have locked ownership/search paths/ACLs; 19 Phase 4 tables use forced RLS; 23 exact capability rows cover nine distinct capabilities. All database/Auth/replay lanes pass. |
| Supabase and FakeRest providers | Strict shared typed methods and deterministic parity | ✓ VERIFIED | Seventeen named methods validate IDs, exact strings, policies, hashes, decisions, and lineage. Generic CRUD is rejected for raw and support resources; malformed success payloads fail closed. |
| Billing-account UI | Responsive Agreement and Monthly Close workflows without later-phase scope | ✓ VERIFIED | Account detail renders structured agreement lifecycle, evidence revisions, exceptions, close, exact comparison, approval, and adjustment history. Component tests and the 320px/desktop rendered source contract pass. |
| Registry 004 and release contracts | Append-only exact upgrade authority and permanent protected-lane ownership | ✓ VERIFIED | Registry 004 pins all seven migrations and final schema/RPC/security/capability transforms while registries 001–003 remain byte-identical. Negative static tests reject missing, reordered, broadened, mutable, float-authority, and scope-creep variants. |
| Rendered source receipt | Exact marker, contract snapshot, screenshots, and zero responsive/runtime failures | ✓ VERIFIED | `phase-04-source.json` records 150/150 checks across three routes and two viewports with six screenshot hashes and freshness marker `phase-04-agreement-close-v1`. |

**Artifacts:** 6/6 verified

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| Draft commercial terms | Active calculation authority | Structured exact term validation, human approval, immutable activation, advisory lock, and non-overlap exclusion | ✓ WIRED | Active terms cannot be edited, deleted, overlapped, or activated by automation; amendments append new drafts and lifecycle changes append events. |
| Revenue evidence | Frozen period close | Server-derived period, immutable revisions, clean evidence checks, reviewer decision, exception ownership, and input/evidence fingerprints | ✓ WIRED | Missing/questionable evidence cannot become estimated revenue; accepted evidence or explicit minimum-only policy is rechecked transactionally. |
| Frozen close | Exact calculation and approval | Phase 3 exact arithmetic, immutable snapshot, policy/anomaly gates, current fingerprint, idempotency, and concurrency locks | ✓ WIRED | Preview, create, replay, and approval reconcile exact terms and inputs; stale or conflicting authority fails before durable effects. |
| Late accepted evidence | Compensating adjustment | Separate exact adjustment calculation, acyclic immutable link, frozen original hash, and true-up policy | ✓ WIRED | Original close/calculation/approval stay unchanged; positive, zero, and negative treatments remain explicit and reproducible. |
| React Admin account detail | PostgreSQL authority | Strict Supabase/FakeRest methods and caller-scoped support-safe reads | ✓ WIRED | Browser state is presentation-only, exact values cross as strings, offline sensitive reads stop, and every server command reauthorizes. |
| All Phase 4 paths | Six inherited blocking financial identities | Exact path classifier, permanent Make memberships, static coupling tests, and complete gate | ✓ WIRED | SQL, Auth, provider, replay, UI, migration, security, type, lint, and build coverage cannot be silently classified outside the financial gate. |
| Source UI | Later deployed evidence | Independent source, immutable preview, and canonical production contracts sharing the same marker | ✓ WIRED | Local source passes; preview and production retain five-viewport, canonical, freshness, 44px, and runtime requirements but remain pending their proper release stages. |

**Wiring:** 7/7 verified

## Requirements Coverage

| Requirements | Status | Evidence |
|--------------|--------|----------|
| AGR-01–AGR-05 | ✓ SATISFIED | Closed agreement kinds and exact definitions, immutable non-overlapping versions, evidence-bound activation, append-only lifecycle changes, authorization, and complete audit causation pass database, provider, and UI contracts. |
| REV-01, REV-02, REV-04–REV-09 | ✓ SATISFIED | Idempotent periods, provenance/evidence, immutable revisions, review decisions, owned exceptions, approved minimum-only close, late adjustments, and complete close-policy rechecks pass. REV-03 remains correctly assigned to Phase 8 and is not Phase 4 scope. |
| CALC-02, CALC-04–CALC-07 | ✓ SATISFIED | Exact fixed/percentage/minimum/hybrid evaluation, frozen snapshots, deterministic replay, duplicate/conflict behavior, anomaly/staleness gating, and prior-period comparison pass across PostgreSQL, providers, and UI. |

**Coverage:** 18/18 Phase 4 requirements satisfied

## Exact Execution Evidence

The complete no-assertion-retry financial gate passed at implementation head
`1c818c957d1e8bdf9a179fda04ea615ed86d9dac`:

- 50-migration clean replay and disposable loopback schema push; filename
  SHA-256 `c11338750f487ee9870b0e6f12ae83ddab5b5dca77201f3c43298f4f59b7123e`
- exact Phase 4 pushed-catalog hashes: schema
  `f9d4dc5df5055c130e31e88edc7e7647a169fd970e801bd5d3d052bab6696dbb`,
  RPCs `243b8e4028e3fef60551c824e94d4b27c8313c09c53592501bc8989904266451`,
  security `10d3029fa333b039b90a633fe63740411533b47b835ffa53f227b5fd1e1d122c`,
  and capabilities `b83c54419102ba1f49b18d6311d6042da89e8f4dbf70f359d0f0c5519dfe2fd5`
- 25 representative-upgrade tests with all semantic invariants true; report
  SHA-256 `280f46ec4b6ac7d619e1d4bc1283d23e1357a26d3727ca57b7c6e11376dab222`
- 18 pgTAP files and 562 assertions
- 12 live Auth/HTTP/provider tests, 10 Edge/evidence tests, 18 replay-fixture
  assertions, and 9 live replay/concurrency tests
- 13 fast/static files and 187 tests
- zero critical/high dependency advisories and zero current/history secret
  findings; 54-file bundle scan; six protected workflow identities

The independent rendered source run passed 150/150 checks on three routes at
320×568 and 1280×800. Its exact contract SHA-256 is
`9c1e94d859f2b54c7541d370a26fe55410c1f2ba0a0b5fb62d71ba2d3af7390e`
and its UI implementation marker resolves to head
`759d30c3824410e9cd62c1fb4a0fb64243006483`. Later commits added only the
content-hashed receipt and exact reviewed scanner fingerprints; no rendered UI
source changed.

The post-gate repository sweep passed typecheck, lint with zero errors,
production build, `git diff --check`, and 47 test files / 566 tests (26
service-dependent tests intentionally skipped outside their explicit local
service lanes). The shared skill-suite smoke test passed 10/10.

## Inherited Non-Blocking Warnings

- ESLint reports three existing `react-refresh/only-export-components` warnings.
- Vite reports inherited CSS import ordering, large-chunk, stale Browserslist,
  and Node deprecation advisories.
- The broad suite reports existing unawaited FakeRest adapter assertions that
  currently pass but should be corrected before a future Vitest major upgrade.

None is a Phase 4 functional, security, release-coupling, or goal-achievement
failure.

## Drift Gates

- The generic schema-drift detector reports the four core Phase 4 migration
  files because it does not recognize the repository's custom isolated runner.
  The documented `GSD_SKIP_SCHEMA_CHECK=true` verifier override is justified by
  the stricter operation already completed: `supabase db push --db-url
  <isolated-loopback> --include-all` applied all 50 migrations, matched registry
  004, restored checked-in configuration byte-for-byte, and removed only the
  disposable target. No linked or hosted database was contacted.
- Structural drift is advisory and reports 68 elements because no prior mapping
  commit is recorded. Planning context can later be refreshed for `qa` and
  `supabase`; the warning is non-blocking by the workflow contract and does not
  contradict the exact migration, path-classification, or runtime proof.

## Human and Release-Stage Verification

The following remain mandatory at their proper stages and are not represented
as local green proof:

- immutable deployed preview at all five contract viewports with the exact
  Phase 4 freshness marker;
- exact final PR-head approval, merge-group checks, and default-branch CI;
- separately authorized protected schema/frontend promotion and post-state
  readback;
- canonical production evidence at all five contract viewports;
- VoiceOver/screen-reader announcement order, physical-device touch/keyboard/
  safe-area behavior, and owner-authenticated hosted support-safe readback.

No hosted schema, preview, merge, deployment, enablement, or production mutation
was performed during Phase 4 verification.

## Gaps Summary

No Phase 4 implementation or requirement gap remains. Deployed preview,
production, owner-authenticated readback, and manual assistive-technology/device
evidence are release-stage or manual gates and remain explicitly pending.

## Verification Metadata

**Verification approach:** Goal-backward from all five roadmap success criteria,
18 Phase 4 requirements, D-01 through D-29, and Plans 04-01 through 04-08
**Automated checks:** Complete financial gate, immutable upgrade/schema-push
proof, rendered source contract, typecheck, lint, build, broad regression, diff,
and suite-integrity smoke
**Human checks required now:** None for local phase completion
**Release-stage checks pending:** Immutable preview, PR/merge/default-branch,
protected promotion/readback, canonical production, and manual accessibility/
device evidence

---

_Verified: 2026-09-05T00:35:01Z_
_Verifier: Codex (inline phase verifier; sub-agent spawning prohibited by session policy)_
