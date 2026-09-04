---
phase: 03-exact-money-and-rounding-contract
plan: "07"
subsystem: exact-release-closure
tags: [release-gate, upgrade, security, validation, exact-money]
requires:
  - phase: 03-exact-money-and-rounding-contract
    plan: "06"
    provides: Exact Supabase/FakeRest provider parity and invoice preview
provides:
  - Complete rolling Phase 3 path, lane, RPC, history, and security audit
  - Representative upgrade coverage for all three Phase 3 migrations with immutable pins
  - Exact implementation-head financial, type, lint, build, and security evidence
  - Explicit post-merge hosted promotion and readback boundary
affects: [04, financial-release-gate]
tech-stack:
  added: []
  patterns:
    - append-only representative-upgrade closure
    - section-aware disposable Supabase configuration
    - branch-ancestry-scoped secret history
key-files:
  created:
    - .planning/phases/03-exact-money-and-rounding-contract/03-07-SUMMARY.md
  modified:
    - tests/release/exact-money-release-static.test.ts
    - tests/release/migration-upgrade.test.ts
    - tests/release/migration-clean.test.ts
    - tests/release/security-gate.test.ts
    - scripts/release/fingerprint-upgrade.mjs
    - scripts/release/verify-migration-chain.mjs
    - scripts/release/security-gate.mjs
    - supabase/tests/upgrades/003-exact-money/expected-transformations.json
    - src/components/atomic-crm/financial/exactProviderContract.test.ts
    - src/components/atomic-crm/providers/fakerest/dataProvider.ts
    - makefile
    - .planning/phases/03-exact-money-and-rounding-contract/03-VALIDATION.md
key-decisions:
  - "The representative upgrade registry must include every Phase 3 forward migration, including the final public save-error wrapper."
  - "Disposable schema-push configuration resolves ports by TOML section, independent of the developer's canonical local port values."
  - "Gitleaks history authority is the current branch ancestry at HEAD; unrelated remote refs are not source history for this release."
  - "A local npm-compatible registry mirror may supply advisory transport when the official endpoint exceeds the bounded timeout; thresholds and repository configuration remain unchanged."
patterns-established:
  - "Release closure: require static coupling, immutable migration fingerprints, all protected lanes, security scans, typecheck, lint, and build at one implementation head"
  - "Hosted boundary: local proof never substitutes for merge-group, default-branch build, protected schema promotion, or provider readback"
requirements-completed: [CALC-01, CALC-03]
duration: 66 min
completed: 2026-09-04
---

# Phase 3 Plan 07: Exact Release Closure Summary

**Every Phase 3 money, rate, rounding, migration, RPC, provider, preview, and replay path is now covered by the inherited protected financial gate, with hosted release evidence kept separate.**

## Performance

- **Duration:** 66 min
- **Started:** 2026-09-04T06:01:44Z
- **Completed:** 2026-09-04T07:08:00Z
- **Tasks:** 2
- **Implementation files modified:** 11

## Accomplishments

- Expanded the final static audit to 12 tests covering all seven plans, the two
  caller-bound exact read contracts, direct invoice table/sequence revocation,
  closed RPC inputs, evidence-helper replacement, immutable history, workflow
  identities, and separation of production mutation.
- Found that the representative upgrade stopped before the final Phase 3
  invoice-save error migration, then extended registry 003 and the runner's
  migration pins so all three forward migrations are applied and fingerprinted.
- Made the isolated schema-push proof independent of an already-running local
  Supabase port range by rewriting a copied config structurally and allocating
  eight unique loopback ports.
- Scoped the release secret-history scan to the current branch ancestry so
  unrelated remote refs cannot destabilize a release while the full releasable
  history remains scanned.
- Cleared Phase-owned lint findings and bounded the npm advisory request at five
  minutes without relaxing the zero-high/zero-critical release threshold.
- Ran the full financial gate, typecheck, lint, and production build together at
  implementation head `4926489a421d1448d4c6fb5055489a273d4ccf87`.
- Recorded exact counts, fingerprints, transport details, and the still-pending
  merge/hosted boundary in `03-VALIDATION.md`.

## Task Commits

Task work was committed atomically, including RED/GREEN proof where behavior
changed:

1. **Task 1: Audit rolling coupling and security closure** — `8554dbe9`,
   `710cc631`, `1dd52b63`, `7e374776`, `2aa696c4`, `7e14a164`, `7e2ed7d8`,
   `23e294af`
2. **Task 2: Run integrated proof and record release boundary** — `4926489a`

## Files Created/Modified

- `tests/release/exact-money-release-static.test.ts` — Final 12-test closed
  coupling/RPC/history/workflow matrix.
- `scripts/release/fingerprint-upgrade.mjs` — Registry 003 pin and complete
  Phase 3 migration sequence.
- `supabase/tests/upgrades/003-exact-money/expected-transformations.json` —
  Final invoice-RPC transformation fingerprint.
- `tests/release/migration-upgrade.test.ts` — Exact registry/migration pin
  enforcement.
- `scripts/release/verify-migration-chain.mjs` — Section-aware copied-config
  rewrite and disposable port allocation.
- `tests/release/migration-clean.test.ts` — Alternate-primary-port isolation
  proof and permanent fast-lane membership.
- `scripts/release/security-gate.mjs` — HEAD-scoped history and bounded advisory
  request.
- `tests/release/security-gate.test.ts` — History-scope and timeout contracts.
- `src/components/atomic-crm/financial/exactProviderContract.test.ts` and
  `src/components/atomic-crm/providers/fakerest/dataProvider.ts` — Phase-owned
  type/lint cleanup with behavior unchanged.
- `makefile` — Migration-clean and security-gate unit contracts retained in the
  protected fast lane.
- `03-VALIDATION.md` — Final local evidence and explicit residual boundaries.

## Decisions Made

- A phase is not upgrade-complete until the registry and runner name every
  forward migration, even when the last migration only stabilizes a public
  error boundary.
- Schema-push proof owns a disposable copied configuration; it does not require
  the primary developer stack to use canonical ports or be stopped.
- Branch history means commits reachable from `HEAD`. Remote tracking refs that
  are not ancestors do not expand the release's secret-scan authority.
- The audit endpoint is transport, not policy. The final local run used the
  npm-compatible Yarn registry after the official endpoint repeatedly exceeded
  the five-minute bound; both responses reported 10 moderate and zero high or
  critical advisories, and no repository/CI registry setting changed.

## Deviations from Plan

### Auto-fixed Release-Closure Gaps

**1. Included the final invoice-save migration in representative upgrades**

- **Found during:** Task 1 final migration/history audit
- **Issue:** Registry 003 and its runner applied only the first two Phase 3
  migrations, so the final stable public save-error wrapper was absent from the
  representative upgrade proof.
- **Fix:** Added `20260903000001_exact_invoice_save_error_contract.sql`, pinned
  all three migration digests, and updated the final RPC fingerprint/report.
- **Verification:** 22 upgrade Vitest tests pass; report SHA-256
  `d2c5a224d498508d88b56894a448cb0b5df7dc507c1296d36acc42e9ce4fe039`.

**2. Removed canonical-port coupling from disposable schema push**

- **Found during:** Task 2 integrated gate on an alternate-port local stack
- **Issue:** The copied-config rewrite searched for canonical port literals, so
  a valid developer config using another local range could not run the isolated
  proof.
- **Fix:** Replaced literals by exact TOML section/key and allocated eight
  unique test ports.
- **Verification:** The alternate-port regression test and isolated 43-migration
  schema push pass.

**3. Scoped history secrets to the release branch**

- **Found during:** Task 2 security gate
- **Issue:** Gitleaks traversed unrelated local remote refs, making the current
  branch's release result depend on commits outside its ancestry.
- **Fix:** Added `--log-opts=HEAD` and a deterministic argv test.
- **Verification:** Current-tree and branch-history scans each report zero
  findings.

**4. Stabilized bounded dependency-advisory transport**

- **Found during:** Task 2 security gate
- **Issue:** The official npm advisory endpoint repeatedly failed to answer
  within its previous bound and later still exceeded five minutes.
- **Fix:** Increased the hard timeout to five minutes and used an
  npm-compatible mirror only for the final local command after the official
  endpoint stalled. Thresholds remain unchanged.
- **Verification:** Final audit reports 10 moderate, zero high, and zero critical
  advisories; report SHA-256
  `d8ebf36fbbbb1550a5ff8ddd65bba072bd70d55f72054277f0ba15450a27ab46`.

**5. Cleared Phase-owned provider lint findings**

- **Found during:** Task 2 integrated lint
- **Issue:** New provider test/import declarations produced unused/type-import
  lint findings.
- **Fix:** Removed the unused symbol and converted runtime-shaped imports to
  type-only imports.
- **Verification:** Lint exits zero with only three inherited Fast Refresh
  warnings.

---

**Total deviations:** 5 auto-fixed release-closure issues
**Impact on plan:** Each change made an already-required gate deterministic or
complete; no formula, invoice lifecycle, provider payment, or production
behavior entered Phase 3.

## Verification

- Clean migration/schema push: 43 migrations; filename SHA-256
  `d91c5166fa08955c9efc6616725c49c107d4dffa66b761770de0f394fcfd72f3`.
- Representative upgrade: 22 tests; report SHA-256
  `d2c5a224d498508d88b56894a448cb0b5df7dc507c1296d36acc42e9ce4fe039`.
- Database SQL: 11 pgTAP files, 389 assertions.
- Auth/HTTP/provider: 4 files, 12 tests.
- Edge/functions: 2 files, 10 tests.
- Replay fixture: 18 assertions; replay/concurrency: 8 tests.
- Fast/static: 9 files, 119 tests.
- Security: zero high/critical advisories, zero history/current secret findings,
  54 bundle files, and six protected workflow identities.
- Typecheck, lint, and build exit zero on Node 22.

## User Setup Required

None for local verification. Merge-group approval, default-branch build,
protected schema promotion, and provider readback remain separate release-owner
steps.

## Next Phase Readiness

- Phase 3 is locally implementation-complete and ready for exact-head PR review.
- Do not call the contract shipped or live until the merge queue, default-branch
  build, separately approved schema stage, and provider post-state readback pass.
- Phase 4 may consume the exact USD/rate/rounding primitives without reopening
  Phase 3's authority or introducing floating-point compatibility paths.

## Self-Check: PASSED

- All Plan 03-07 implementation/test commits resolve.
- The full integrated command passed at the recorded implementation head.
- The validation file distinguishes local green evidence from pending hosted
  evidence.
- The code review is clean and the checked-in Supabase config is restored.

---

*Phase: 03-exact-money-and-rounding-contract*
*Completed: 2026-09-04*
