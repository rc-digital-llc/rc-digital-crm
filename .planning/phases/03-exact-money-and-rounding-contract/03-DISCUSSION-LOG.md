# Phase 3: Exact Money and Rounding Contract - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-02
**Phase:** 03-exact-money-and-rounding-contract
**Areas discussed:** Exact rate format, rounding policy, legacy money conversion, API precision boundaries

---

## Exact Rate Format

| Decision question | Selected | Alternatives considered |
|---|---|---|
| Authoritative rate representation | Reduced numerator/denominator | Fixed-scale integer; store both as co-authority |
| Evidence retained from `12.500%` | Canonical value plus original text | Canonical only; original text only |
| Rate bounds | Named kinds with explicit bounds | All non-negative ratios; any signed ratio |
| Attachment to agreements/calculations | Immutable embedded value | Mutable shared registry; mixed registry/embedded authority |
| User/API entry | Decimal percentage text only | Decimal or fraction; fraction only |
| Normal display | Original percentage with canonical detail available | Normalized percentage only; ratio first |
| Maximum precision | Versioned limit by rate kind | One global limit; no business limit |
| Equality of `12.5%` and `12.500%` | Financially equal; presentation change audited | Always create a financial version; ignore formatting history entirely |

**User's choice:** The owner selected the recommended option for each of the eight rate questions.

**Notes:** Ordinary percentages are 0% through 100% inclusive in v1. Negative
ordinary percentages are rejected, while a future named rate kind may define a
different explicit range.

---

## Rounding Policy

| Decision question | Selected | Alternatives considered |
|---|---|---|
| Exact half-minor-unit ties | Round half away from zero | Half to even; half toward positive infinity |
| Rounding point | Only at a policy-declared conversion to minor units | Round each intermediate; round opportunistically at storage/API boundaries |
| Negative adjustments and zero | Symmetric signed rounding; canonical unsigned zero | Asymmetric credit rounding; preserve negative zero text |
| Currency relationship | Versioned policy bound to currency exponent; USD exponent 2 only in v1 | Global currency-agnostic default; infer exponent at runtime |

**User's choice:** The owner instructed the agent to use every recommended
option for this and all remaining discussion areas.

**Notes:** The chosen tie behavior makes the positive and negative cases
mirror one another and prevents a hidden runtime default from changing results.

---

## Legacy Money Conversion

| Decision question | Selected | Alternatives considered |
|---|---|---|
| Fields promoted to billing authority | Only explicitly classified billing fields | Convert every money-like CRM field; leave legacy billing fields unchanged |
| Conversion strategy | Additive expand-contract migration | Destructive in-place rewrite; application-only conversion |
| Ambiguous/invalid/fractional-cent rows | Stop with row-scoped exceptions | Automatically round or clamp; skip questionable rows |
| Removal of old columns | Later approved contract release after proof | Remove immediately after backfill; retain permanent dual authority |

**User's choice:** Recommended defaults selected under the owner's blanket
instruction.

**Notes:** The secured invoice table is authoritative billing data and must be
inventoried. Deal, project, and analytics values remain informational unless a
later approved migration explicitly promotes them.

---

## API Precision Boundaries

| Decision question | Selected | Alternatives considered |
|---|---|---|
| Canonical JSON | Typed objects with canonical integer strings | JSON numbers within the safe range; formatted decimal strings |
| TypeScript arithmetic | Branded types with `BigInt` exact helpers | Generic decimal library everywhere; guarded JavaScript numbers |
| Inbound grammar | Strict base-10 strings with explicit currency/kind | Permissive normalization; accept strings and JSON numbers |
| Bounds and failures | Checked persistence with stable fail-closed errors | Clamp into range; silently promote storage |
| Provider/serialization proof | Shared real/fake boundary, property, round-trip, and live PostgreSQL tests | Provider-specific semantics; production-provider unit tests only |

**User's choice:** Recommended defaults selected under the owner's blanket
instruction.

**Notes:** Redundant leading zeros and `-0` may be accepted only as narrow
integer text and are immediately canonicalized. Decimal points, exponents,
commas, whitespace, plus signs, and JSON numeric tokens are rejected.

---

## Agent Discretion

- Exact module, PostgreSQL helper/domain, and stable error-code names.
- Migration and compatibility-view split, provided authority remains singular.
- Property-testing library and fixture organization.
- Internal greatest-common-divisor and signed rounding implementation details.

## Deferred Ideas

- Multi-currency and international behavior after the USD/US v1 contract is proven.
- Phase 4 formula semantics and immutable calculation snapshots.
- Phase 5 invoice issuance and later payment, ledger, and reconciliation behavior.
- Any migration that promotes legacy non-billing CRM metrics into financial authority.
