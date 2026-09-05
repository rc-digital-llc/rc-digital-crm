---
phase: 03-exact-money-and-rounding-contract
plan: "04"
subsystem: database
tags: [postgresql, supabase, exact-money, security-definer, idempotency, pgtap]

requires:
  - phase: 03-02
    provides: Hardened exact PostgreSQL money, rate, and rounding primitives
  - phase: 03-03
    provides: Closed registry 003 vocabulary, immutable-history hashes, and protected upgrade verification
provides:
  - Atomic validate-before-mutate conversion of invoice, automation, and evidence money to exact authority
  - Caller-bound exact and compatibility invoice read RPCs plus one closed exact save RPC
  - Canonical request/effect fingerprints with conflict-before-effect automation and evidence replay
  - Registry 003 hashes and invariants proving clean-install and accepted-baseline upgrade equivalence
  - Protected SQL, Edge, concurrency, upgrade, and rolling static Wave 4 contracts
affects: [03-05, 03-06, 03-07, invoice-rpcs, billing-automation, evidence-finalization]

tech-stack:
  added: []
  patterns:
    - Validate every legacy row and reconcile identities before one transactional exact cutover
    - Caller-bound SECURITY DEFINER reads with empty search paths, closed inputs, and fixed query branches
    - Canonical request and command-owned effect fingerprints with zero-effect conflict rejection
    - Worktree-local live tests discover the active Supabase project identifier from checked-in config

key-files:
  created:
    - supabase/migrations/20260902000002_exact_billing_expand.sql
    - supabase/tests/database/65_exact_billing_conversion.sql
    - supabase/tests/upgrades/003-exact-money/expected-transformations.json
  modified:
    - supabase/tests/database/35_billing_automation.sql
    - supabase/tests/database/40_billing_evidence.sql
    - supabase/tests/support/billing-security-fixtures.sql
    - scripts/release/fingerprint-upgrade.mjs
    - tests/release/migration-upgrade.test.ts
    - tests/release/replay-concurrency.test.ts
    - tests/release/billing-evidence.test.ts
    - tests/release/exact-money-release-static.test.ts
    - makefile

key-decisions:
  - "Exact minor-unit, ratio, and line-item fields are the sole billing authority; legacy decimals and submitted percentage text survive only as checked compatibility projection and immutable evidence."
  - "Authenticated invoice access is RPC-only: direct table and sequence privileges are revoked, while every SECURITY DEFINER read manually applies caller-derived capability predicates."
  - "Automation replay identity includes canonical exact money plus a command-owned effect discriminator; a reused key with any mismatch is denied before audit, grant, execution, evidence, or protected-effect mutation."
  - "Registry 003 authorizes only the deterministic Wave 4 transformations and continues to pin every accepted Phase 2 migration byte-for-byte."

patterns-established:
  - "Exact cutover: inventory ambiguity first, abort before mutation, backfill exact state, reconcile counts and values, then install constraints and replacement boundaries."
  - "Caller-bound invoice boundary: closed JSON requests, bounded pagination, allowlisted filters and ordering, qualified objects, and no dynamic SQL or client-supplied authority."
  - "Replay safety: identical canonical fingerprints return duplicate; request or effect conflicts return a stable denial with byte-identical state snapshots."

requirements-completed: [CALC-01, CALC-03]

duration: 56 min
completed: 2026-09-04
---

# Phase 3 Plan 04: Atomic Exact Billing Cutover Summary

**Transactional invoice, automation, and evidence conversion to exact minor-unit authority with caller-bound RPCs, conflict-atomic replay, and immutable upgrade proof**

## Performance

- **Duration:** 56 min
- **Started:** 2026-09-04T21:19:51Z
- **Completed:** 2026-09-04T22:16:27Z
- **Tasks:** 3
- **Files modified:** 12

## Accomplishments

- Added one additive transaction that validates all legacy invoice, line-item, automation, and surviving evidence inputs before mutation; backfills exact fields; reconciles counts, values, and identities; and installs exact constraints and replacement functions.
- Removed browser invoice table and sequence access in favor of two caller-bound SECURITY DEFINER read RPCs and one closed exact save RPC, with empty search paths, qualified objects, bounded inputs, fixed query branches, and string-only financial output.
- Replaced numeric automation consumption with canonical non-negative money plus request/effect fingerprints, then moved evidence finalization to canonical zero money and evidence-owned effect identity.
- Checked in registry 003 with deterministic exact hashes and 22 semantic invariants while preserving the accepted baseline, registry 002, and all three Phase 2 migration hashes byte-for-byte.
- Protected every Wave 4 file and production-shaped caller through the inherited SQL, Edge, replay/concurrency, migration-upgrade, and rolling static release gates.

## Task Commits

Each task was committed atomically, with RED observed before its GREEN result:

1. **Task 1: Perform the atomic exact cutover behind caller-bound RPCs** - `da09ca09` (RED test), `da8b3fb2` (GREEN feat)
2. **Task 2: Migrate inherited SQL callers and prove evidence replay atomicity** - `aca85af0` (GREEN test migration after inherited callers failed against the exact cutover)
3. **Task 3: Update inherited live callers and protect every Wave 4 path** - `b81d399b` (RED test), `dbfa7672` (GREEN feat)

**Plan metadata:** this documentation commit

## Files Created/Modified

- `supabase/migrations/20260902000002_exact_billing_expand.sql` - Performs the exact billing conversion and defines hardened invoice, automation, and evidence boundaries.
- `supabase/tests/database/65_exact_billing_conversion.sql` - Proves conversion aborts, exact ranges, compatibility, RPC authority, ACLs, fingerprints, and unchanged invalid effects.
- `supabase/tests/upgrades/003-exact-money/expected-transformations.json` - Authorizes the exact post-cutover category hashes and semantic invariants.
- `supabase/tests/database/35_billing_automation.sql` - Exercises exact grant consumption, identical replay, conflicts, and negative/overflow zero-effect cases.
- `supabase/tests/database/40_billing_evidence.sql` - Exercises exact evidence finalization and all same-key conflict variants against byte-identical snapshots.
- `supabase/tests/support/billing-security-fixtures.sql` - Supplies exact automation grant fields to protected live lanes.
- `scripts/release/fingerprint-upgrade.mjs` - Projects legacy and exact post-cutover state without weakening accepted-history comparisons.
- `tests/release/migration-upgrade.test.ts` - Locks the updated verifier projections and registry 003 behavior.
- `tests/release/replay-concurrency.test.ts` - Uses canonical minor-unit requests and proves conflict/negative zero effects through live PostgreSQL.
- `tests/release/billing-evidence.test.ts` - Proves identical and conflicting inspection replay through the real Edge boundary with unchanged state.
- `tests/release/exact-money-release-static.test.ts` - Locks Wave 4 membership, RPC hardening, exact helper use, ACL revocation, and accepted evidence migration bytes.
- `makefile` - Adds test 65 to the protected financial database SQL target.

## Decisions Made

- Kept widened legacy invoice decimals and `tax_rate numeric(12,9)` non-authoritative. Canonical exact fields determine financial equality; compatibility RPCs serialize fixed decimals, and submitted percentage text remains separate evidence.
- Preserved the evidence wrapper's public signature and response union so the existing Edge authorization helper required no widening.
- Used an explicit command-owned effect discriminator in addition to the required request tuple, preventing a same-key request from replaying a different protected effect.
- Retained the inherited six release-lane identities and added Wave 4 tests to their existing targets rather than creating replacement checks.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected post-cutover upgrade projections without weakening accepted history**

- **Found during:** Task 1 GREEN upgrade verification
- **Issue:** The pre-cutover verifier did not recognize PostgreSQL 17's empty `search_path` representation, raw PUBLIC ACL state, the structural empty fingerprint schema, or which legacy row/constraint/grant projections must remain comparable after exact columns and revokes are added.
- **Fix:** Normalized the catalog representations, read raw ACLs through `aclexplode`, gave empty exact categories their closed structural shape, and preserved legacy projection semantics alongside registry 003 exact categories.
- **Files modified:** `scripts/release/fingerprint-upgrade.mjs`, `tests/release/migration-upgrade.test.ts`
- **Verification:** The isolated upgrade verifier accepted all legacy hashes and all 22 exact semantic invariants; the focused unit contract passed 34/34.
- **Committed in:** `da8b3fb2`

**2. [Rule 3 - Blocking] Made live callers discover the active worktree-local Supabase namespace**

- **Found during:** Task 3 isolated live verification
- **Issue:** The replay and evidence tests hardcoded `supabase_db_atomic-crm-demo`, preventing safe execution in the required collision-free local project namespace.
- **Fix:** Both tests parse the checked-in `project_id`, fail closed when it is absent, and resolve only the exact matching database container.
- **Files modified:** `tests/release/replay-concurrency.test.ts`, `tests/release/billing-evidence.test.ts`
- **Verification:** Edge, fixture, and live concurrency lanes passed in project `rcd-p304-green-1508`, each with one assertion attempt and successful cleanup.
- **Committed in:** `dbfa7672`

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking issue)
**Impact on plan:** Both fixes were necessary to preserve immutable upgrade truth and execute the protected local contracts safely; no product scope, hosted system, or release identity changed.

## Issues Encountered

- The canonical local Supabase namespace was already contended. Verification used one disposable worktree-only project name and nonconflicting loopback ports. Every final lane reported a real assertion attempt and successful cleanup; `supabase/config.toml` was restored to SHA-256 `986fa4ec...` before the GREEN commit.
- The synthetic function fixture advertises the canonical default capability origin. Its URL was changed only for the isolated Edge run, then restored to SHA-256 `7d0a28c...` with zero tracked diff.
- The worktree initially lacked installed dependencies. `npm ci` restored the lockfile-defined dependency tree without changing `package.json`, the lockfile, or any committed dependency metadata.

## TDD Gate Compliance

- Task 1 committed the missing-schema, conversion, RPC, ACL, range, and replay failures in `da09ca09`; `da8b3fb2` then made the focused contract pass 32/32.
- Task 2 began with the committed inherited callers failing on the removed numeric private signature. `aca85af0` migrated those test-only callers and made the focused 35/40/65 set pass 166/166.
- Task 3 committed missing Make membership, numeric live caller, and absent Edge conflict-proof failures in `b81d399b`; `dbfa7672` made the rolling static and all production-shaped live lanes pass.

## Verification

- `make test-financial-schema-push` - PASS; clean local schema installed through `20260902000002` across 42 migrations.
- `make test-financial-migration-upgrade` - PASS; one assertion attempt, all 22 semantic invariants true, 34/34 unit tests, cleanup success.
- `make test-financial-database-sql` - PASS; 457/457 assertions across all 11 protected SQL contracts, cleanup success.
- Focused tests 35/40/65 - PASS; 166/166 exact automation, evidence, and conversion assertions.
- `make test-financial-functions` - PASS; 10/10 Edge/provider tests, including evidence conflict snapshots, cleanup success.
- `make test-financial-replay-concurrency` - PASS; fixture 18/18 and live concurrency 8/8, each with one assertion attempt and cleanup success.
- `npm test -- --run tests/release/exact-money-release-static.test.ts` - PASS; 9/9 rolling and mutation checks.
- `npm run typecheck`, targeted ESLint, targeted Prettier, and `git diff --check` - PASS.
- Accepted SHA-256 values - PASS: baseline `eb1f2e2c...`, registry 002 `dea0df2f...`, and Phase 2 migrations `811947e5...`, `d1c27c26...`, `740ac8cc...`.

## Known Stubs

None. Structural empty fingerprints represent intentionally absent pre-cutover exact categories and are closed verifier inputs, not runtime placeholders.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 05 can cut live Supabase and React Admin invoice reads/writes over to the now-proven caller-bound exact RPCs.
- Exact schema, upgrade, automation, evidence, ACL, and production-shaped replay contracts are all protected in inherited blocking lanes.
- No hosted database, linked Supabase project, production system, deployment, dependency definition, accepted historical migration, or external configuration changed.

## Self-Check: PASSED

All 12 implementation/protection files, this summary, and all five Task 1–3 commits were verified locally before planning metadata was advanced.

---
*Phase: 03-exact-money-and-rounding-contract*
*Completed: 2026-09-04*
