---
phase: 03
slug: exact-money-and-rounding-contract
status: verified
threats_open: 0
asvs_level: 1
created: 2026-09-05
verified_head: 57b2f506a572e2f05ec8760881e19232b179a81a
---

# Phase 03 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| JSON and provider requests → exact values | Untrusted tokens must not introduce floating-point, malformed, oversized, or tenant-selected authority. | Money, rates, dates, pagination, filters, account identifiers |
| Exact intermediates → persisted facts | Overflow, implicit rounding, or mutable issued facts must not change authoritative billing values. | Minor units, rational rates, invoice lines, policy identities |
| Authenticated caller → privileged RPC | Definer rights must preserve caller-derived capability and tenant scope. | Invoice reads/writes, evidence finalization, audit facts |
| Legacy database → Phase 3 schema | Ambiguous or incomplete legacy data must abort before partial migration or guessed conversion. | Invoice dates, decimals, automation/evidence fingerprints |
| Source path → protected CI/release | New financial paths must not bypass the six blocking workflows or substitute evidence from another head. | Tests, artifacts, migration hashes, build receipts |
| Merged build → production schema | Code integration must not imply deployment; production mutation requires owner-gated, receipt-bound promotion. | Supabase migrations and promotion evidence |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-03-01 | Tampering | JSON, wire, and provider tokens | mitigate | Canonical string-only parsers, shared provider matrix, malformed/full-range boundary tests | closed |
| T-03-02 | Tampering | JavaScript arithmetic and fingerprints | mitigate | BigInt-only authority, exact fingerprints, central preview rounder, float anti-pattern gate | closed |
| T-03-03 | Tampering / Repudiation | Policy and rounding identity | mitigate | Immutable named catalogs plus signed golden/property vectors | closed |
| T-03-04 | Denial of Service | Oversized exact input | mitigate | Pre-parse byte limits, bounded ranges, checked output, stable non-reflective errors | closed |
| T-03-05 | Elevation | Private helper ACL and search path | mitigate | Private schema, empty search paths, qualification, PUBLIC revocation, narrow grants, live ACL assertions | closed |
| T-03-06 | Tampering / Repudiation | Legacy backfill and upgrade abort | mitigate | Pre-00001 fail-closed validation, retained 00002 drift guard, validate-all inventory, zero-partial-effect upgrade proof | closed |
| T-03-07 | Tampering / Repudiation | Migration history and upgrade registry | mitigate | Closed registry vocabulary, pinned hashes/invariants, immutable accepted history | closed |
| T-03-08 | Elevation | Production schema path | mitigate | Build cannot mutate; protected promotion revalidates predecessor receipt inside the owner-gated environment | closed |
| T-03-09 | Tampering / Repudiation | Financial path and CI coupling | mitigate | Classifier, explicit Make membership, six required workflow identities, mutation/removal tests | closed |
| T-03-10 | Elevation / Information Disclosure | Invoice read/write RPCs | mitigate | Caller-bound capability checks, locked definer/search path, base-table/sequence denial, same/cross-tenant live proof | closed |
| T-03-11 | Tampering / Repudiation | Request and effect fingerprints | mitigate | Canonical request/effect hashes under lock; conflicts stop before audit or effects | closed |
| T-03-12 | Tampering / Denial of Service | Compatibility RPC | mitigate | Caller-bound exact derivation with bounded fixed-decimal presentation | closed |
| T-03-13 | Tampering / Denial of Service | Pagination, filters, sorting | mitigate | Closed keys, bounded pages, allowlists, fixed SQL branches, no dynamic SQL | closed |
| T-03-14 | Elevation / Tampering | Evidence finalization | mitigate | Exact canonical-zero helper, obsolete signature removal, replay/conflict effect snapshots | closed |
| T-03-15 | Elevation | FakeRest caller scope | mitigate | Internal account scope, capability checks, rejection of client tenant identity | closed |
| T-03-SC | Tampering | Dependency and workflow supply chain | mitigate | No dependency additions, full-SHA actions, locked installs, pinned tools, dependency/secret gates | closed |

*Status: open · closed*  
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

No accepted risks.

---

## Verification Evidence

- Exact/provider/preview/upgrade/static suite: 147 passed; 8 live-environment cases intentionally skipped in the ordinary invocation and covered by the protected local Supabase target.
- Security-gate unit suite: 8 passed.
- Full Phase 3 release evidence: 726/726 executable assertions, clean dependency and source-ref secret scans, 54-file bundle scan, and all six workflow identities coupled.
- `git diff --check`, TypeScript, lint, and production build passed.
- No hosted system was contacted and no production deployment is claimed.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-05 | 16 | 16 | 0 | GSD security auditor |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-05
