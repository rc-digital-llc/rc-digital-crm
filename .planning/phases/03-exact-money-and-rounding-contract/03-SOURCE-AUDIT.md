# Phase 3 Multi-Source Coverage Audit

**Audited:** 2026-09-02
**Mode:** targeted review revision
**Result:** all in-scope source items are covered; no phase split or deferral is required.

| Source | ID | Feature / requirement | Plan | Status | Notes |
|--------|----|-----------------------|------|--------|-------|
| GOAL | — | One exact and testable representation of money, rates, and rounding across later financial facts | 01–07 | COVERED | Runtime, PostgreSQL, migrated billing authority, providers, and protected proof form one contract. |
| REQ | CALC-01 | Integer minor-unit money, explicit currency, exact rate form, and no JavaScript floating-point authority | 01–07 | COVERED | Includes full signed-bigint range, string JSON, exact invoice/automation/evidence cutover, and provider parity. |
| REQ | CALC-03 | Named tested rounding for fractional minor units, ties, negative adjustments, and currency boundaries | 01–07 | COVERED | `half-away-from-zero-v1`, `usd-v1`, signed fixtures, independent PostgreSQL proof, and protected lanes. |
| RESEARCH | R-01 | Dependency-free branded TypeScript codec and deterministic fixtures | 01 | COVERED | Also fixes 64-byte integer and 14-byte percentage pre-parse limits. |
| RESEARCH | R-02 | Immutable PostgreSQL currency/rate/rounding policies and hardened exact helpers | 02 | COVERED | Includes RLS, ACL, empty search path, exact intermediates, and explicit test 60 coupling. |
| RESEARCH | R-03 | Additive fail-closed invoice/line-item/automation/evidence conversion | 03–04 | COVERED | Plan 03 prepares proof; Plan 04 performs the later migration while accepted history stays byte-identical. |
| RESEARCH | R-04 | Compatibility is a projection, never a second authority | 03–05 | COVERED | Authenticated base-table access closes; money strings preserve full range, while `tax_rate` widens to checked `numeric(12,9)`, derives from the canonical ratio, and returns fixed-nine-decimal RPC text. |
| RESEARCH | R-05 | Exact canonical line-item structure | 04–06 | COVERED | Names quantity ratio, unit-price money, extended money, currencies, policies, legacy mapping, and immutable evidence. |
| RESEARCH | R-06 | Exact automation/evidence limit, effect, and replay contract | 04 | COVERED | Non-negative amounts, canonical request/effect fingerprint, identical retry, conflict rejection, and concurrency proof. |
| RESEARCH | R-07 | Supabase/FakeRest/live HTTP parity and exact preview | 05–06 | COVERED | Live RPC boundary precedes FakeRest/preview parity; invoice saves cover exact success and invalid-input zero effects only, with business idempotency deferred to Phase 5 `INV-01`. |
| RESEARCH | R-08 | Protected release classification and permanent execution | 01–07 | COVERED | Plans 01–06 couple paths/tests when introduced; Plan 07 audits the completed matrix. |
| RESEARCH | R-09 | Stable safe diagnostics without raw malformed-value disclosure | 01–06 | COVERED | Length, grammar, migration, read/write RPC, evidence, and provider errors are non-reflective. |
| RESEARCH | R-10 | No new package and no production mutation from implementation lanes | 01–07 | COVERED | Native BigInt/PostgreSQL exact arithmetic and inherited protected promotion only. |
| CONTEXT | D-01 | Signed integer minor units plus explicit USD | 01–04 | COVERED | Generic money retains both signed-bigint endpoints; only automation amounts are constrained non-negative. |
| CONTEXT | D-02 | Checked PostgreSQL bigint and canonical base-10 string boundary | 01–06 | COVERED | Caller-bound read RPCs emit text; HTTP tests distinguish token types. |
| CONTEXT | D-03 | Typed money object and one-way presentation | 01, 05–06 | COVERED | Canonical `{ amount_minor, currency }`; no parse-back path. |
| CONTEXT | D-04 | Canonical zero and strict malformed/range rejection | 01, 02, 04–06 | COVERED | Includes explicit pre-parse length rejection. |
| CONTEXT | D-05 | Reduced numerator and positive denominator | 01–06 | COVERED | Runtime/database/provider and migration assertions. |
| CONTEXT | D-06 | Exact decimal percentage text only | 01–06 | COVERED | Exact grammar, 14-byte limit, no component hand-entry. |
| CONTEXT | D-07 | Submitted percentage text retained as non-authoritative evidence | 01, 03–06 | COVERED | `submitted_percentage` remains separate from canonical ratio and fixed-nine-decimal compatibility output, including preserved `12.500%`. |
| CONTEXT | D-08 | Named kind-specific precision and bounds | 01–06 | COVERED | `ordinary-percentage-v1`, 0–100%, at most nine fractional digits. |
| CONTEXT | D-09 | Immutable canonical rate and policy evidence embedded in records | 04–06 | COVERED | No mutable shared rate authority. |
| CONTEXT | D-10 | Formatting-only equality plus presentation history | 01, 04–06 | COVERED | Bounded to submitted text and existing `billing_audit_events`; no agreement/calculation/formula versioning. |
| CONTEXT | D-11 | Half away from zero including signed ties | 01–06 | COVERED | Golden and generated parity fixtures. |
| CONTEXT | D-12 | Round only at declared minor-unit boundary | 01–06 | COVERED | Exact intermediate retained until named conversion. |
| CONTEXT | D-13 | Immutable named versioned rounding policy | 01–06 | COVERED | `half-away-from-zero-v1` plus explicit currency policy/exponent. |
| CONTEXT | D-14 | Wider intermediates and stable fail-closed errors | 01–06 | COVERED | No clamp/coercion; endpoints and overflow paths are explicit. |
| CONTEXT | D-15 | Migrate only classified authoritative billing fields | 03–04 | COVERED | Invoices and automation only; deal/project/analytics remain unchanged. |
| CONTEXT | D-16 | Expand-contract and projection-only legacy compatibility | 03–05 | COVERED | Exact authority, authenticated table closure, caller-bound RPC cutover, and exact `tax_rate numeric(12,9)` derivation/serialization. |
| CONTEXT | D-17 | Exact USD backfill or row-scoped migration stop | 04 | COVERED | Fractional cent, ambiguity, range, line-item, and reconciliation failures abort transaction. |
| CONTEXT | D-18 | Immutable pre/post migration proof and later-only removal | 03–04, 07 | COVERED | Historical files stay byte-identical; registry 003 is append-only. |
| CONTEXT | D-19 | Canonical string JSON for money/rate components | 01–06 | COVERED | Includes exact line-item/provider shapes and live HTTP proof. |
| CONTEXT | D-20 | Branded BigInt module replaces number authority | 01, 05–06 | COVERED | Preview delegates to the central exact codec. |
| CONTEXT | D-21 | Narrow integer grammar and canonicalization | 01, 02, 04–06 | COVERED | 64-byte cap precedes parsing/casting. |
| CONTEXT | D-22 | Supabase/FakeRest contract parity | 05–06 | COVERED | One provider fixture matrix and permanent HTTP/fast targets. |
| CONTEXT | D-23 | Golden/property/round-trip/overflow/live PostgreSQL proof | 01–07 | COVERED | All test families are permanently protected in their introduction plans. |

## Excluded Without Gap

- Phase 4 owns agreement terms, revenue evidence, financial formula/calculation snapshots, previews, and replay.
- Phase 5 owns invoice issuance, correction documents, payments, provider operations, and ledger facts.
- Phase 5 `INV-01` owns invoice-draft business idempotency, save keys/fingerprints, and conflicting save reuse semantics.
- Later phases own reconciliation, collections, and live charging.
- Multi-currency, non-US rails, and informational deal/project/analytics promotion remain explicitly outside Phase 3.

## Review Closure Coverage

| Finding | Plan coverage |
|---------|---------------|
| H1 | Plan 04 revokes authenticated invoice authority and installs exact read/write RPCs; Plan 05 proves live denial and unchanged effects. |
| H2 | Plans 03–05 preserve historical migrations and migrate every named inherited SQL/replay/tenancy caller to exact signatures. |
| H3 | Plans 01–06 perform rolling same-plan classifier/Make/static coupling; Plan 07 is final audit only. |
| M1 | Plans 02 and 04 add tests 60 and 65 explicitly to the protected SQL target when introduced. |
| M2 | Plans 04–05 use/test `numeric(19,2)` money compatibility strings for both signed-bigint endpoints and overflow. |
| M3 | Plans 01–06 enforce/test 64-byte integer and 14-byte percentage limits before construction/cast. |
| M4 | Plans 04–06 name the canonical line-item fields, legacy mappings, and immutable evidence disposition. |
| M5 | Plan 04 specifies canonical request/effect fingerprint equality/conflict semantics and non-negative automation tests. |
| M6 | Plans 01 and 04–06 confine D-10 to submitted percentage evidence plus existing append-only billing audit. |
| C2-H1 | Plan 04 installs caller-bound SECURITY DEFINER exact/compatibility read RPCs with table/sequence revoke; Plan 05 proves same-tenant success, cross-tenant/direct/unsafe denial, full-range strings, and unchanged effects. |
| C2-H2 | Plan 03 pins migration 00004 byte-identically; Plan 04 replaces the surviving helper with canonical-zero exact consumption and proves SQL/Edge success, replay, conflict atomicity, old-signature absence, and protected membership. |
| C2-W1 | Upgrade verifier work is isolated in Plan 03; dependent Plan 04 owns exactly ten database/inherited-caller/coupling files. |
| C2-W2 | Plan 05 owns live Supabase/types and Plan 06 owns FakeRest/preview, each with eight files and strict dependencies. |
| C3-H1 | Plans 04–06 explicitly define no invoice-save key/fingerprint; save coverage is exact valid success plus invalid-input rejection with unchanged effects, and Phase 5 `INV-01` retains business idempotency. |
| C3-M1 | Plans 03–05 fingerprint, migrate, register, and live-test `tax_rate numeric(12,9)` with 0..100 bounds, exact ratio derivation, `8.875000000`/`12.500000000` compatibility strings, preserved submitted evidence, and no new financial version. |
