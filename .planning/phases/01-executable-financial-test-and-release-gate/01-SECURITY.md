---
phase: 01
slug: executable-financial-test-and-release-gate
status: blocked
threats_open: 5
asvs_level: 1
created: 2026-08-26
---

# Phase 1 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Repository policy → GitHub controls | Source intent becomes merge authority only when the live ruleset and merge queue match. | Check identities, review policy, merge authority |
| Untrusted PR/test code → local runners | Tests may exercise privileged local services but must never receive production secrets or mutation rights. | Synthetic JWTs, local service keys, SQL and HTTP inputs |
| Migration/baseline source → PostgreSQL | SQL and upgrade fixtures can alter authorization and financial history. | Schema, grants, immutable representative facts |
| Provider request → privileged Edge/database effects | Untrusted authentication, bodies, retries, and ordering cross into service-role operations. | Synthetic provider payloads and database effects |
| Git history/dependencies/build → release evidence | Vulnerable code, credentials, source maps, or altered artifacts could enter a release. | Dependency graph, secret identifiers, public bundle bytes |
| Workflow dispatch → protected production environment | User-selected stages cross into scoped secrets and production mutation commands. | Receipt IDs, artifact digests, feature names, approvals |
| Private evidence store → deployment target | Receipts and artifacts must remain confidential, immutable, authenticated, and stage-linked. | Attestations, digests, reports, receipts, post-state |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation and Evidence | Status |
|-----------|----------|-----------|-------------|-------------------------|--------|
| T-01-01 | Elevation of Privilege | Required checks and live main ruleset | mitigate | Organization ownership and authenticated exact no-bypass ruleset readback pass. PR #2 proves all fast contexts and five non-secret financial lanes; the secret gate and missing independent reviewer still prevent the required merge-group observation. | open |
| T-01-02 | Repudiation / Spoofing | Receipts, approvals, skipped checks | mitigate | Canonical receipts require authenticated-owner approval and exact successful checks; merge-group paths are unconditional. Environment self-review is disabled, but only one organization member exists and no independent approval has been observed. | open |
| T-01-03 | Tampering / Information Disclosure | Supabase lane, container selection, PR jobs | mitigate | Local-only target validation, exact container selection, bounded bootstrap retry, redaction, cleanup, read-only workflow permissions, and no production secrets are implemented and tested. | closed |
| T-01-04 | Tampering | Migration chain and representative upgrade | mitigate | Clean replay, exact migration history, frozen baseline fingerprints, declared transformations, and no assertion retry pass against live PostgreSQL. | closed |
| T-01-05 | Spoofing / Elevation | RLS, RPC claims, privileged lead conversion | mitigate | Locked search path, caller ownership, narrow grants, representative SQL claims, and real Auth/PostgREST cross-owner denial pass. | closed |
| T-01-06 | Tampering | Schema-push target and baseline history | mitigate | Loopback/test-scope enforcement, caller-supplied target rejection, per-file baseline hashes, and append-only comparison are implemented and pass. | closed |
| T-01-07 | Information Disclosure / Spoofing | Synthetic fixtures, reports, Postmark/Edge auth | mitigate | Reserved fixtures, redacted reports, and live invalid/missing IP, Basic, Bearer, method, and body assertions pass. | closed |
| T-01-08 | Tampering / Repudiation | RPC, trigger, webhook side effects | mitigate | Denied/failed exact-effect assertions and propagated downstream database failures prevent false acknowledgement. | closed |
| T-01-09 | Tampering / Repudiation | Replay and concurrency | mitigate | Unique claims, transactional locks, exact counts, restart replay, out-of-order fixtures, and parallel PostgreSQL sessions pass. | closed |
| T-01-10 | Tampering | Production dependency graph | mitigate | Locked production dependency audit reports zero unresolved high or critical advisories; full application regression, typecheck, and build pass. | closed |
| T-01-11 | Information Disclosure | Git history, tokens, logs | mitigate | Current-tree scan, full-redaction history scan, narrow allowlist policy, and log redaction exist. Full history still reports two historical findings under rotation ID `16fb4d8f3aa647db0bb47df5690ee5eb8507c48ed7da4c5b981a9e8de959dcf0`; private owner rotation evidence is absent. | open |
| T-01-12 | Information Disclosure | Production bundle | mitigate | Production source maps are disabled; recursive bundle scan reports no map files or secret markers. | closed |
| T-01-13 | Tampering / Repudiation | Receipt builder and verifier | mitigate | Strict schema/policy, canonical SHA-256 identity, exact predecessor chain, artifact attestation, safe filenames, duplicate rejection, and tamper tests pass. | closed |
| T-01-14 | Information Disclosure / Tampering | Private evidence publication | mitigate | The organization-owned private evidence repository passes authenticated content readback and unauthenticated access denial. A complete synthetic receipt chain is still absent. | open |
| T-01-15 | Elevation of Privilege | Promotion and enablement environments | mitigate | Both environments exist with protected branches, no admin bypass, and self-review prevention. Scoped secrets/targets, a second reviewer, and protected synthetic approvals remain absent. | open |
| T-01-16 | Tampering | Promotion chain, post-state, rollback | mitigate | Exact predecessor receipts, artifact attestations, deploy-tree readback, feature fail-close, compensating receipts, pinned rollback, and forward-only database repair controls are implemented and tested. | closed |
| T-01-SC | Tampering | Actions, CLI, and dependency supply chain | mitigate | Workflow actions use full commit SHAs, Supabase CLI is fixed at 2.115.0, artifact builds are deterministic, and no audit-force or registry substitution was introduced. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

No accepted risks. Open threats remain blocking and were not waived.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-08-26 | 17 | 12 | 5 | Codex inline security audit |
| 2026-08-27 | 17 | 12 | 5 | Codex live-control follow-up |

### Live Gate Evidence

- `node scripts/release/verify-github-controls.mjs --self-test`: pass.
- `node scripts/release/verify-github-controls.mjs --check`: pass against `rc-digital-llc/rc-digital-crm`; report SHA-256 `2ee6d5b4db9cbc2a2eabd086fb7628c841bfa1ad383b008be6e1bcd84112bbd9`.
- PR #2 at `9bb5f6f3c3e377302d4e8dfe91c9aad6c5f60688`: all fast checks and migration-clean, migration-upgrade, database-contracts, edge-provider-contracts, and replay-concurrency pass; release-security remains red only on the deferred historical findings.
- The organization-owned evidence repository is private; authenticated README readback SHA-256 is `ad7f3859b7143dc751987c040905e32365cd484316ecbd435cd480204aacbb0f`, while unauthenticated API access returns 404.
- `node scripts/release/verify-github-controls.mjs --check-environments`: nonzero only for declared missing scoped secrets; both environment protection shells and known evidence/owner variables exist.
- `make test-release-secrets`: nonzero by design; two redacted historical findings remain pending private rotation evidence. Report SHA-256: `1dba2f9b42b28428a4b73ae76d5d19a65bf11a7f35d1a59d898af4a4da5d6e53`.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] No risks were accepted or waived
- [ ] `threats_open: 0` confirmed
- [ ] `status: verified` set in frontmatter

**Approval:** blocked pending live controls and credential rotation evidence
