---
phase: 03-exact-money-and-rounding-contract
verified: 2026-09-04T07:18:15Z
status: passed
score: 3/3 must-haves verified
---

# Phase 3: Exact Money and Rounding Contract Verification Report

**Phase Goal:** Every later calculation, invoice, payment, and ledger fact
shares an exact and testable representation of money, rates, and rounding.
**Verified:** 2026-09-04T07:18:15Z
**Status:** passed

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Authoritative money crosses PostgreSQL, server, and browser boundaries as integer minor units with explicit currency, while rates remain exact scaled or rational values. | ✓ VERIFIED | Branded TypeScript codecs, checked PostgreSQL `bigint` authority, canonical string JSON, exact invoice line items, caller-bound read/save RPCs, and Supabase/FakeRest parity pass unit, pgTAP, HTTP, and provider tests. |
| 2 | Each supported currency and formula version names a rounding policy that deterministically handles fractional minor units, ties, negative adjustments, and currency boundaries. | ✓ VERIFIED | `usd-v1`, `ordinary-percentage-v1`, and `half-away-from-zero-v1` are immutable named policies; TypeScript and PostgreSQL golden/property tests cover ties, non-ties, negative values, exact division, policy mismatch, and signed persistence boundaries. |
| 3 | Boundary and property fixtures prove that JavaScript floating-point values cannot become authoritative financial amounts. | ✓ VERIFIED | Strict string-token parsing, 64/14-byte pre-parse limits, numeric-token/unsafe-collision rejection, BigInt rational arithmetic, exact provider response validation, and the 12-test static anti-float/coupling audit all pass. |

**Score:** 3/3 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| TypeScript exact-money authority | String-only money/rate codecs and named signed rounding | ✓ VERIFIED | `exactMoney.ts` is dependency-free, uses BigInt/exact ratios, canonicalizes signed zero and redundant leading zeros, and checks PostgreSQL signed-bigint persistence bounds. |
| PostgreSQL exact contract | Immutable policy catalogs, exact helpers, and checked persistence | ✓ VERIFIED | Three additive Phase 3 migrations replay cleanly, pass isolated schema push, revoke direct authenticated invoice access, and expose only narrowed exact RPC boundaries. |
| Representative upgrade proof | Historical immutability and complete forward conversion | ✓ VERIFIED | Registry 003 applies all three Phase 3 migrations, preserves pinned accepted history, and passes 22 assertions with report SHA-256 `d2c5a224d498508d88b56894a448cb0b5df7dc507c1296d36acc42e9ce4fe039`. |
| Live boundary and provider parity | Tenant-safe exact list/get/save over real and preview providers | ✓ VERIFIED | Live Auth/PostgREST tests prove same-tenant success, cross-tenant/direct denial, string-only signed endpoints, invalid-input unchanged effects, and exact Supabase/FakeRest parity. |
| Protected release coupling | Every money-bearing path executes in a non-optional inherited lane | ✓ VERIFIED | Final static audit enumerates all seven plans and keeps the six existing workflow identities, Make memberships, merge-group behavior, isolation, cleanup, timeouts, and production-mutation separation intact. |

**Artifacts:** 5/5 verified

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| Unknown browser/server input | Branded exact financial values | String-token grammar, length, policy, currency, range, and ratio normalization | ✓ WIRED | Numeric JSON, floats, exponents, whitespace, overlong values, unsupported currency/policy, zero/negative denominator, and overflow fail with stable non-reflective codes. |
| Exact runtime semantics | PostgreSQL semantics | Shared golden vectors plus independent generated/property assertions | ✓ WIRED | Both implementations use rational intermediates and signed half-away-from-zero at the explicit persistence boundary. |
| Legacy billing rows | Exact invoice/automation authority | Additive conversion, exception preflight, derived compatibility projections, and immutable registry fingerprints | ✓ WIRED | Upgrade proof covers exact money, `numeric(12,9)` rate compatibility, submitted-rate evidence, line items, automation fingerprints, ACLs, and unrelated CRM invariants. |
| Authenticated invoice callers | Exact stored rows | Caller-bound SECURITY DEFINER read/save RPCs with empty search paths, fixed branches, capability predicates, owner/ACL locks, and direct-table revoke | ✓ WIRED | Database and live HTTP tests prove authorized effects and cross-tenant/direct-table denial without browser-supplied tenant authority. |
| Automation/evidence callers | Exact grant consumption | Canonical request/effect fingerprints and exact zero-money evidence dependency | ✓ WIRED | Identical replay, conflicting-key denial, non-negative limits, contention, and unchanged effect/counter/evidence states pass. |
| React Admin and preview UI logic | Exact money authority | Validated compound provider methods and the central BigInt calculation adapter | ✓ WIRED | Supabase/FakeRest projections match; invoice preview has no independent `number`, `parseFloat`, or `Math.round` authority. |
| Phase 3 source/tests | Six inherited financial CI identities | Financial path classifier, explicit Make lists, and final static audit | ✓ WIRED | All affected database, HTTP, functions, replay, fast, security, migration, type, lint, and build paths pass together at the implementation head. |

**Wiring:** 7/7 verified

## Requirements Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| CALC-01 | ✓ SATISFIED | Integer minor-unit USD and exact rational percentage values are authoritative across TypeScript, PostgreSQL, RPC, provider, preview, migration, and JSON boundaries; floating-point input is rejected or remains explicitly non-authoritative legacy evidence. |
| CALC-03 | ✓ SATISFIED | Immutable named currency/rate/rounding policies and cross-runtime golden/property tests deterministically cover fractional minor units, ties, signed adjustments, explicit USD boundaries, and overflow. |

**Coverage:** 2/2 requirements satisfied

## Exact Execution Evidence

The complete no-assertion-retry phase command passed on Node 22 at integrated
implementation head `4926489a421d1448d4c6fb5055489a273d4ccf87`:

- 43-migration clean replay and isolated loopback schema push; filename SHA-256
  `d91c5166fa08955c9efc6616725c49c107d4dffa66b761770de0f394fcfd72f3`
- 22-test representative upgrade; report SHA-256
  `d2c5a224d498508d88b56894a448cb0b5df7dc507c1296d36acc42e9ce4fe039`
- 11 pgTAP files and 389 assertions
- 12 live Auth/HTTP/provider tests, 10 Edge/functions tests, 18 replay-fixture
  assertions, and 8 replay/concurrency tests
- 9 fast/static files and 119 tests, including 12 final release-audit tests
- zero critical/high dependency advisories and zero current/history secret
  findings; 54-file bundle scan; six protected workflow identities
- green typecheck, lint, and production build

The post-execution broad regression run passed 38 files and 465 tests (22
service-dependent tests skipped without local service environment). It emitted
only inherited warnings about unawaited assertions in the pre-existing
FakeRest adapter suite.

## Review and Drift Gates

- Standard review covers 35 Phase 3 implementation/test artifacts and reports
  zero critical, warning, or informational findings in `03-REVIEW.md`.
- The generic schema-drift detector reports the new migration files because it
  does not recognize the custom isolated runner. The actual required operation,
  `supabase db push --db-url <isolated-loopback> --include-all`, passed against
  all 43 migrations; no linked or hosted database mutation was attempted.
- Structural drift is advisory and reports no previous mapping baseline. The
  project may refresh planning context later with `$gsd-map-codebase --paths
  qa,supabase`; this does not affect the verified runtime contracts.

## Human and Release-Stage Verification

No rendered component, layout, navigation, canonical URL, or deployed asset
changed, so no source/preview/production surface receipt is required for the
Phase 3 implementation goal. No additional human behavior check is needed to
verify the exact arithmetic contract locally.

The following remain mandatory release-stage evidence and are not pre-satisfied
by this report:

- exact final PR-head owner approval and fresh merge-group checks;
- a default-branch release build after authorized merge;
- separately approved protected schema promotion with zero conversion
  exceptions; and
- provider post-state readback before any shipped/live claim.

## Gaps Summary

No Phase 3 implementation gap remains. Merge and hosted promotion evidence is
explicitly pending at its proper release stages and is not represented as local
green proof.

## Verification Metadata

**Verification approach:** Goal-backward from the three Phase 3 success criteria
and every plan's must-haves
**Must-haves source:** `.planning/ROADMAP.md`, Plans 03-01 through 03-07, and
`03-CONTEXT.md` decisions D-01 through D-23
**Automated checks:** Full exact implementation-head financial/security/type/lint/build gate plus broad regression suite
**Human checks required now:** None
**Release-stage checks pending:** PR approval/merge group, default-branch build,
protected schema promotion, and provider readback

---

_Verified: 2026-09-04T07:18:15Z_
_Verifier: Codex (inline phase verifier; sub-agent spawning unavailable by session policy)_
