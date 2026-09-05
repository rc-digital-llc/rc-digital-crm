---
phase: 03-exact-money-and-rounding-contract
verified: 2026-09-05T03:04:36Z
status: passed
score: 35/35 must-haves verified
overrides_applied: 0
---

# Phase 3: Exact Money and Rounding Contract Verification Report

**Phase Goal:** Every later calculation, invoice, payment, and ledger fact shares an exact and testable representation of money, rates, and rounding.
**Verified:** 2026-09-05T03:04:36Z
**Status:** passed
**Re-verification:** No — initial verification
**Verified implementation:** `e0b904b3` (`codex/phase-03-wave-02-07`); implementation files are byte-identical to the reviewed implementation at `9d94dbb1`.

## Goal Achievement

### Observable Truths

The three roadmap success criteria are non-negotiable truths. The 32 additional
truths below come from all seven PLAN frontmatters; none was substituted with a
SUMMARY claim.

| # | Truth | Status | Evidence |
|---|---|---|---|
| R1 | Authoritative money crosses PostgreSQL, server, and browser boundaries as integer minor units with explicit currency, while rates remain exact rational values. | ✓ VERIFIED | `exactMoney.ts` accepts string-bearing objects only and brands validated money/rates; both migrations persist signed `bigint` components; exact RPC payloads and both providers use strings; the provider parity and live-boundary suites reject numeric financial tokens. |
| R2 | Every supported currency/rate use names a deterministic rounding policy covering fractions, ties, negative adjustments, and currency boundaries. | ✓ VERIFIED | USD policy `usd-v1`, rate policy `ordinary-percentage-v1`, and rounding policy `half-away-from-zero-v1` are required by the TS and SQL contracts. Runtime and pgTAP vectors cover exact divisions, positive/negative ties and non-ties, policy/currency mismatches, and range overflow. No formula version exists yet; Phase 3 deliberately does not invent agreement/calculation/formula versioning before the later calculation phase. |
| R3 | Boundary and property fixtures prove JavaScript floating-point values cannot become authoritative. | ✓ VERIFIED | `exactFinancialFixtures.ts`, `exactMoney.test.ts`, and `exact-money-boundaries.test.ts` cover signed endpoints, grammar/length boundaries, round trips, and deterministic property loops. Source/static contracts reject `number`, `parseFloat`, `Math.round`, `toFixed`, or a `BigInt.prototype.toJSON` patch in authority paths. |
| 01-1 | Money is signed minor-unit text plus explicit USD and cannot be constructed from a JavaScript number. | ✓ VERIFIED | `parseCanonicalIntegerText` and `parseUsdMoney` validate `unknown`, exact keys, canonical text, currency, byte length, and signed PostgreSQL-bigint range before branding. |
| 01-2 | Decimal percentage text reduces to one immutable bounded rational while display evidence remains non-authoritative. | ✓ VERIFIED | `parseOrdinaryPercentageRate` parses a bounded decimal grammar, reduces through GCD, preserves submitted text, and `ordinaryPercentageRateEquals` excludes that display evidence from equality. |
| 01-3 | Named half-away-from-zero rounding occurs only at the minor-unit boundary and fails on overflow or policy mismatch. | ✓ VERIFIED | `roundExactRatioToUsdMoney` validates the complete policy tuple, applies signed quotient/remainder logic once, and reparses its result through the bounded money codec. |
| 01-4 | String-only wire objects, brands, strict grammar, boundaries, properties, and JSON round trips exclude float authority. | ✓ VERIFIED | 455-line implementation and 522 lines of focused fixtures/tests are substantive; the independently run Phase 3 unit/boundary selection passed. |
| 02-1 | PostgreSQL stores USD minor units and canonical rate components in signed bigint fields, using wider exact numeric only for intermediates. | ✓ VERIFIED | `20260902000001_exact_financial_primitives.sql` defines checked versioned policies and numeric intermediate helpers; the cutover migration adds signed-bigint authority columns and constraints. No `float`, `real`, or PostgreSQL `money` type appears in either Phase 3 migration. |
| 02-2 | Currency, rate, and rounding policy identities are immutable, named, bounded, and not browser-mutable. | ✓ VERIFIED | Policy tables are seeded, protected by immutable-row triggers, have RLS forced, and grant browsers SELECT but no DML. |
| 02-3 | Database rounding matches the runtime signed half-away contract and fails closed for invalid policy, zero denominator, or overflow. | ✓ VERIFIED | `private.financial_round_ratio` mirrors the TS quotient/remainder algorithm with checked numeric intermediates and a final signed-bigint bound; test 60 contains golden, negative, error, and property assertions. |
| 02-4 | PostgreSQL helpers require JSON strings, emit strings, and have live golden/property/ACL proof. | ✓ VERIFIED | Private parsers inspect JSON token types and pre-parse lengths; public wrappers have empty search paths, narrow grants, and string JSON output. Test 60 is explicitly in `FINANCIAL_DATABASE_SQL_TESTS`. |
| 03-1 | Accepted migration history remains byte-identical while the upgrade runner learns only the narrow Phase 3 vocabulary. | ✓ VERIFIED | The upgrade runner pins accepted artifact hashes and uses a closed category/invariant set; registry 003 appends only the two Phase 3 migrations and 15 named invariants. Current migration digests match the final review-fix report. |
| 03-2 | Upgrade proof distinguishes authorized financial transformations from unrelated CRM drift. | ✓ VERIFIED | `fingerprint-upgrade.mjs` fingerprints exact columns, types, constraints, functions, ACLs, triggers, and policy rows and rejects unknown, stale, overlapping, or no-op registry entries. |
| 03-3 | Upgrade fingerprints preserve PostgreSQL text/canonical strings without numeric coercion. | ✓ VERIFIED | Fingerprint serialization retains textual values; the runner has no `Number`/`parseFloat` conversion in exact financial fingerprint paths, and `migration-upgrade.test.ts` asserts this contract. |
| 03-4 | The upgraded runner and Vitest contract are protected. | ✓ VERIFIED | `test-financial-migration-upgrade` invokes the runner and the release test; their paths are included by the financial classifier and rolling static assertions. |
| 04-1 | Invoice, exact line-item, automation, and evidence data converts atomically; ambiguity aborts and unrelated numerics remain unchanged. | ✓ VERIFIED | Migration 00002 inventories and validates every affected row before disabling triggers or backfilling, raises one stable conversion exception on any inventory row, then installs constraints in the same transaction. Its legacy-evidence reconstruction aborts ambiguous effects. |
| 04-2 | Accepted history is not edited; the later migration and registry 003 authorize the exact result. | ✓ VERIFIED | Hash pins cover accepted Phase 1/2 artifacts, and registry 003 records the ordered Phase 3 additions. No earlier migration is replaced by the cutover. |
| 04-3 | Authenticated roles lack direct invoice table/sequence access and use caller-bound exact/compatibility read RPCs plus one exact save RPC. | ✓ VERIFIED | Migration 00002 revokes table/sequence privileges, revokes default function access, narrowly grants public wrappers, and exposes `read_billing_invoices_exact`, `read_billing_invoices_legacy_compat`, and `save_billing_invoice_exact`. |
| 04-4 | Read RPCs are locked, caller-authorized, closed and bounded, static SQL, and return string money/rates. | ✓ VERIFIED | Both read RPCs are `SECURITY DEFINER` with `search_path=''`; fixed CASE branches call `private.billing_has_capability` for each selected/count row. Keys, types, integer pagination (1..1,000,000 and 1..100), filters, sorts, and order are allowlisted. Fractional JSON values fail the direct text-to-`integer` cast and are mapped to `INVOICE_READ_INVALID_REQUEST`. No dynamic SQL exists. |
| 04-5 | Full signed-bigint values, fixed-decimal compatibility, exact line items, pre-parse limits, bounded presentation audit, non-negative automation, and fingerprints survive. | ✓ VERIFIED | Migration constraints/payload helpers and test 65 cover signed endpoints, `numeric(19,2)`, `numeric(12,9)`, `8.875000000`, `12.500000000`, 64/14-byte limits, nonnegative limits, rate-presentation audit, and canonical request/effect hashes. |
| 04-6 | Evidence finalization uses canonical zero exact money, with replay/conflict invariants. | ✓ VERIFIED | The replaced evidence helper calls the exact automation overload with `{amount_minor:"0",currency:"USD"}` and evidence-owned effect context; tests 40/65 cover success, identical replay, conflict, and unchanged audit/grant/execution state. |
| 04-7 | Wave 4 database, replay, evidence, and upgrade checks remain protected. | ✓ VERIFIED | Make explicitly includes tests 40/60/65, upgrade, functions, and replay targets; static tests police membership and forbidden regressions. |
| 05-1 | Supabase invoice reads/writes use typed canonical string objects and stable safe errors. | ✓ VERIFIED | `supabase/dataProvider.ts` translates and validates exact requests/responses, recomputes line and invoice totals through the exact codecs, and maps malformed results to stable errors. |
| 05-2 | React Admin list/get uses only the closed caller-bound read RPC; generic invoice-table CRUD is gone. | ✓ VERIFIED | Invoice branches in generic `getList`, `getOne`, create, and update delegate to exact methods. The implementation calls the two exact RPC names and contains no `.from("invoices")` path. |
| 05-3 | Live Auth/PostgREST proof covers tenant/privilege/request/range/rate behavior. | ✓ VERIFIED | `exact-money-boundaries.test.ts` contains real-JWT RPC matrices, service-only postcondition reads, direct table/sequence denial, signed endpoints, malformed/oversized requests, unchanged effects, and the required 8.875%/12.500% cases. It is wired to the isolated database-HTTP target; its eight live cases are environment-gated only in an ordinary Vitest invocation, not in that protected target. |
| 05-4 | Supabase boundary sources/tests are classified and run in the protected HTTP contract. | ✓ VERIFIED | Provider/types and release tests are covered by `.github/release/financial-paths.json`; Make explicitly lists exact boundary, inherited tenancy, and shared provider contract tests. |
| 06-1 | FakeRest mirrors the closed request, canonical response, safe error, and unchanged-effect behavior. | ✓ VERIFIED | `createFakeRestExactInvoiceProvider` validates the same page/sort/filter/save shapes with the shared codecs, creates fresh state, rejects non-Draft rewrites, and is exercised by the same 739-line provider contract as Supabase. |
| 06-2 | Invoice preview delegates to the central BigInt module with no independent rounding/float path. | ✓ VERIFIED | `invoiceCalculations.ts` validates exact line items and rate/policies, accumulates `bigint`, invokes `roundExactRatioToUsdMoney` once, and validates the final sum through `parseUsdMoney`. |
| 06-3 | Canonical rates/policies remain embedded; submitted percentage stays evidence and formatting-only history stays bounded. | ✓ VERIFIED | Both providers preserve rate/policy wire fields; exact equality excludes submitted formatting, and SQL emits only the existing `invoice.rate_presentation_changed` audit event for presentation changes. |
| 06-4 | Preview rounds once under the named policy and rejects mismatch/overflow without coercion. | ✓ VERIFIED | Preview tests cover positive/negative exact values, ties, unsupported policy/currency/exponent, invalid ratios, and one-step overflow. No independent `Math.round`/`Number` route exists. |
| 06-5 | FakeRest parity and preview code/tests are protected. | ✓ VERIFIED | Shared provider contract is in `FINANCIAL_DATABASE_HTTP_TESTS`; preview tests are in `FINANCIAL_FAST_TESTS`; all paths classify as financial. |
| 07-1 | Every D-01..D-23 contract is represented in an existing non-optional protected lane. | ✓ VERIFIED | The Makefile carries database SQL/HTTP, functions, replay, upgrade, and fast contracts; `financial-release-gate.yml` exposes the six stable required workflow identities with no optional replacement lane. |
| 07-2 | Plans 01–06 coupled each new path/test in its introducing plan; final audit is not the first protection. | ✓ VERIFIED | The rolling static test asserts same-plan target/classifier membership, while the final audit checks the accumulated closed set. Git history and current target lists show the protection is already present. |
| 07-3 | Direct invoice table/sequence access stays revoked and no numeric helper or security-invoker view survives. | ✓ VERIFIED | Final SQL revokes base privileges and old numeric overloads; static and pgTAP checks assert exact signatures/ACLs and absence of invoice read views. |
| 07-4 | Range, pre-parse, exact lines/fingerprints, nonnegative automation, bounded audit, history immutability, and Phase 3 scope pass together. | ✓ VERIFIED | The focused release/static and exact suites passed independently, and the full protected topology connects every corresponding SQL/runtime/live assertion. Unrelated CRM numeric fields remain outside the exact-authority scope. |

**Score:** 35/35 truths verified

### Required Artifacts

`gsd-sdk query verify.artifacts` was run for every PLAN: all 23 declarations
passed existence and substance checks (20 unique paths after duplicate
declarations were collapsed). Wiring and behavior were then checked manually.

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `src/components/atomic-crm/financial/exactMoney.ts` | Sole TS exact-money/rate/rounding authority | ✓ VERIFIED | 455 substantive lines; strict validation, brands, exact rational arithmetic, named rounding, and display-only formatting. |
| `src/components/atomic-crm/financial/exactMoney.test.ts` | Golden/property/grammar/range proof | ✓ VERIFIED | 410 lines; independently executed and passed. |
| `src/components/atomic-crm/financial/exactFinancialFixtures.ts` | Shared exact vectors | ✓ VERIFIED | 112 lines covering signed endpoints, length/grammar bounds, reduced rates, ties, negatives, and overflow. |
| `supabase/migrations/20260902000001_exact_financial_primitives.sql` | Immutable catalogs and SQL exact kernel | ✓ VERIFIED | 643 lines; transactional, qualified, access-controlled, and no float authority. |
| `supabase/tests/database/60_exact_financial_primitives.sql` | Live primitive pgTAP proof | ✓ VERIFIED | 706 lines and explicit protected SQL-target membership. |
| `scripts/release/fingerprint-upgrade.mjs` | Closed immutable upgrade verifier | ✓ VERIFIED | 2,630 lines; exact categories, accepted hashes, transformation and invariant checks. |
| `tests/release/migration-upgrade.test.ts` | Upgrade verifier regression contract | ✓ VERIFIED | 840 lines; independently executed and passed. |
| `supabase/migrations/20260902000002_exact_billing_expand.sql` | Atomic cutover and exact caller-bound RPCs | ✓ VERIFIED | 2,220 lines; preflight-before-mutation, compatibility derivation, ACLs, exact automation/evidence, read/save RPCs. |
| `supabase/tests/database/65_exact_billing_conversion.sql` | Conversion/RPC/range/ACL proof | ✓ VERIFIED | 866 lines; protected SQL target and review-fix regressions present. |
| `supabase/tests/database/40_billing_evidence.sql` | Evidence success/replay/conflict proof | ✓ VERIFIED | 900 lines; exact helper call and invariant snapshots. |
| `supabase/tests/upgrades/003-exact-money/expected-transformations.json` | Append-only conversion authorization | ✓ VERIFIED | Valid closed registry, two ordered migrations, ten transforms, fifteen semantic invariants. |
| `src/components/atomic-crm/providers/supabase/dataProvider.ts` | Validated exact Supabase adapter | ✓ VERIFIED | 1,202 lines; exact invoice branches are wired into generic provider methods. |
| `tests/release/exact-money-boundaries.test.ts` | Real Auth/PostgREST boundary proof | ✓ VERIFIED | 1,479 lines; live path is protected and ordinary-run environment skips are explicit. |
| `tests/release/billing-tenancy.test.ts` | Inherited tenant matrix over RPC | ✓ VERIFIED | 951 lines; no direct invoice-table success path. |
| `src/components/atomic-crm/financial/exactProviderContract.test.ts` | Supabase/FakeRest parity matrix | ✓ VERIFIED | 739 lines; both provider harnesses execute the same cases. |
| `src/components/atomic-crm/invoices/invoiceCalculations.ts` | Exact-only invoice preview | ✓ VERIFIED | 167 lines; central codec/rounder delegation. |
| `src/components/atomic-crm/providers/fakerest/dataGenerator/billingAccounts.ts` | Deterministic exact fixtures | ✓ VERIFIED | 336 lines; fixed/rate and signed endpoint fixtures, no import cycle. |
| `tests/release/exact-money-release-static.test.ts` | Rolling/final coupling and anti-float audit | ✓ VERIFIED | Independently executed and passed; protects source, migrations, Make, classifier, workflows, and history. |
| `makefile` | Stable protected execution topology | ✓ VERIFIED | Tests 60/65, live boundary/parity, preview/static, upgrade, functions, and replay are explicit members. |
| `.planning/phases/03-exact-money-and-rounding-contract/03-VALIDATION.md` | Task-to-proof map and release boundary | ✓ VERIFIED | Records the proof topology and correctly withholds production-live status until authorized promotion/readback. Used only as routing context, not implementation proof. |

### Key Link Verification

The generic key-link query reported zero matches because PLAN `from` values are
conceptual labels rather than filesystem paths. Manual source tracing verified
all 20 declared links.

| From | To | Via | Status | Details |
|---|---|---|---|---|
| Exact parsers | Branded exact types | Private construction after validation | ✓ WIRED | Exported parsers are the construction boundary. |
| Shared fixtures | Runtime tests | Imported golden/property matrix | ✓ WIRED | Fixtures are consumed by `exactMoney.test.ts`. |
| Exact source/tests | Fast lane | Classifier + Make | ✓ WIRED | Both explicit. |
| Policy catalogs | SQL helpers | Version/currency/exponent validation | ✓ WIRED | Helpers query/validate seeded policy identities. |
| Private helpers | Public SQL wrappers | String JSON + grants | ✓ WIRED | Narrow `SECURITY DEFINER` wrappers call private helpers; private EXECUTE is revoked. |
| Primitive pgTAP | SQL lane | Make membership | ✓ WIRED | Test 60 is explicitly listed. |
| Upgrade runner | Registry 003 | Closed registry parse | ✓ WIRED | Runner reads and validates the registry schema and invariants. |
| Upgrade Vitest | Upgrade target | Make invocation | ✓ WIRED | Target runs the test after fingerprinting. |
| Authenticated readers | Exact read RPC | Caller capability per row | ✓ WIRED | Fixed queries invoke `billing_has_capability`. |
| Compatibility readers | Compatibility read RPC | Same authority, derived strings | ✓ WIRED | No view/base grant is used. |
| Evidence finalization | Exact automation overload | Exact zero + effect context | ✓ WIRED | Replaced helper calls the exact overload. |
| Wave 4 tests | SQL/functions/replay/upgrade | Make + static coupling | ✓ WIRED | All paths/targets are present. |
| React Admin list/get | Exact read RPC | Request translation + response validation | ✓ WIRED | Provider branches call `read_billing_invoices_exact`. |
| Live boundary test | Auth/PostgREST RPC | JWTs + service postconditions | ✓ WIRED | Test setup and RPC calls use the isolated local stack contract. |
| Wave 5 source/tests | HTTP lane/classifier | Make + classifier | ✓ WIRED | Explicit members. |
| FakeRest methods | Shared exact codecs | Closed validation/canonical results | ✓ WIRED | Same codecs and parity matrix. |
| Invoice preview | Exact module | BigInt rational delegation | ✓ WIRED | One central rounder call. |
| Wave 6 tests | HTTP/fast lanes | Make + classifier | ✓ WIRED | Explicit members. |
| All Phase 3 paths | Six financial jobs | Classifier + target lists | ✓ WIRED | Workflow jobs call the six stable Make lanes. |
| Merged build receipt | Protected schema promotion | Attested predecessor + owner environment | ✓ WIRED | `release-promote.yml` requires the `production-release` environment and promotes schema only in the schema stage after receipt validation. This link exists but has not been exercised for Phase 3 production. |

### Data-Flow Trace (Level 4)

No rendered dynamic component changed, so there is no UI data-flow artifact to
test. The money-bearing provider/preview flows were nevertheless traced end to
end:

| Artifact | Data | Source | Produces Real Data | Status |
|---|---|---|---|---|
| Supabase invoice provider | Exact invoice list/get/save | React Admin params → validated request → exact RPC → validated/branded response | Yes; no static/empty response path | ✓ FLOWING |
| FakeRest invoice provider | Exact invoice list/get/save | Fresh in-memory generated invoice state → same codecs/parity contract | Yes; deterministic non-empty fixtures | ✓ FLOWING |
| Invoice preview | Amount/rate/line items | Exact inputs → BigInt sum → central rational rounder → exact total | Yes; calculated values are rendered-ready but remain string-authoritative | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Exact runtime, preview, provider, release-static, boundary, and upgrade contracts | `npm test -- --run src/components/atomic-crm/financial/exactMoney.test.ts src/components/atomic-crm/invoices/invoiceCalculations.test.ts src/components/atomic-crm/financial/exactProviderContract.test.ts tests/release/exact-money-boundaries.test.ts tests/release/migration-upgrade.test.ts tests/release/exact-money-release-static.test.ts` | 6 files passed; 147 tests passed; 8 live-environment cases explicitly skipped; 0 failed | ✓ PASS |
| Type contract | `npm run typecheck` | `tsc --noEmit` exited 0 | ✓ PASS |
| Patch integrity | `git diff --check` | exited 0 | ✓ PASS |
| Exact reviewed implementation retained | content/hash comparison and `git diff 9d94dbb1..e0b904b3` over implementation paths | No implementation drift; migration SHA-256 values match final review-fix evidence | ✓ PASS |

The eight skipped cases require the isolated Supabase lane variables and are
not silently skipped by the protected target: `make test-financial-database-http`
starts the isolated lane that supplies them. The codebase also contains the
726-assertion complete gate topology and the final clean review at the same
implementation bytes. This report does not treat SUMMARY prose as execution
proof; its direct spot-check result and the executable source/target wiring are
the verification evidence.

### Probe Execution

| Probe | Command | Result | Status |
|---|---|---|---|
| Phase 3 probe discovery | `find scripts -path '*/tests/probe-*.sh' -type f` plus PLAN/SUMMARY references | No conventional or declared Phase 3 probe scripts; verification is through the explicit Make/Vitest/pgTAP targets | SKIPPED — no probes declared |

### Requirements Coverage

Every Phase 3 PLAN declares both IDs. REQUIREMENTS maps only CALC-01 and
CALC-03 to Phase 3, so there are no orphaned Phase 3 requirements.

| Requirement | Source Plans | Description | Status | Evidence |
|---|---|---|---|---|
| CALC-01 | 03-01 through 03-07 | Authoritative money is integer minor units with currency; rates are exact scaled/rational; no JS float authority. | ✓ SATISFIED | Roadmap truth R1/R3 and plan truths 01-1/01-2/01-4, 02-1/02-4, 04-1/04-5, 05-1/05-3, 06-1/06-2, and 07-1/07-4 are verified by runtime, SQL, providers, exact preview, migrations, and protected tests. |
| CALC-03 | 03-01 through 03-07 | Named/tested rounding covers fractional units, ties, negative adjustments, and currency boundaries. | ✓ SATISFIED | Roadmap truth R2 and plan truths 01-3, 02-2/02-3, 04-5, 06-3/06-4, and 07-1/07-4 are verified by named policies, mirrored TS/SQL algorithms, signed vectors, rejection paths, and protected tests. |

### Anti-Patterns Found

Phase-modified source, migrations, tests, Make/classifier, and workflows were
scanned for untracked debt markers, placeholders, empty handlers/returns,
hardcoded empty financial data, float/real/money types, financial `number`
authority, `parseFloat`, `Math.round`, `toFixed`, `BigInt.prototype.toJSON`,
direct invoice-table provider access, numeric automation overloads, dynamic
read SQL, optional protected jobs, and history edits.

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| — | — | No blocker or warning pattern found | — | None |

Initial empty/fallback matches in provider files were inspected rather than
classified mechanically: they are unrelated inherited fallbacks, nullable
storage reads, or deliberate denial sentinels, and none supplies money-bearing
rendered output.

### Human Verification Required

None. Phase 3 changes exact data contracts, SQL, providers, tests, and release
coupling, not rendered UI. No PLAN contains a deferred `<human-check>`. Visual,
mobile, or surface-loop verification therefore does not apply.

### Release Boundary and Disconfirmation

- The two Phase 3 migrations are not claimed as pushed to hosted production.
  That is an intentional post-merge release-stage action, not an implementation
  substitute: `release-build.yml` cannot mutate production, while
  `release-promote.yml` requires the protected `production-release`
  environment, validates the exact predecessor receipt, runs the schema stage,
  and captures linked post-state. Local/CI verification proves readiness only.
- A possible pagination coercion gap was checked adversarially. Both TS
  providers require safe integers. SQL obtains JSON pagination via `->>` and
  casts text directly to `integer` inside a caught block, so a fractional token
  is rejected with `INVOICE_READ_INVALID_REQUEST`; the bounded contract is not
  weakened by numeric rounding.
- The final `03-REVIEW.md` is clean with zero critical, warning, or info
  findings. All three review-fix iterations are present in the final source:
  evidence effect reconstruction and replay protection; issued/non-Draft
  rewrite denial and capability matrices; migration-00001 NULL-date preflight,
  canonical date/year-zero parity, and matching provider rejection.
- Later roadmap phases add agreements, formula execution, frozen calculation
  snapshots, invoices, payments, and ledgers. Those are consumers of this
  exact vocabulary, not missing Phase 3 behavior; no Phase 3 gap needed to be
  moved to `deferred`.

### Gaps Summary

No implementation, wiring, requirement, anti-pattern, regression, or
human-verification gap remains. The phase goal is achieved in the codebase.
Hosted schema promotion remains separately owner-gated and must not be inferred
from this `passed` local/CI verification.

---

_Verified: 2026-09-05T03:04:36Z_
_Verifier: the agent (gsd-verifier)_
