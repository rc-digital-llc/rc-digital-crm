---
phase: 04
slug: agreements-revenue-evidence-and-calculation-close
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-09-04
---

# Phase 04 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.4, pgTAP, Supabase CLI, release shell/Node runners |
| **Config file** | `vitest.config.ts`, `supabase/config.toml`, `tests/release/` |
| **Quick run command** | `PATH=/tmp/rc-digital-node22/bin:$PATH npm test -- --run <changed-test-files>` |
| **Database run command** | `PATH=/tmp/rc-digital-node22/bin:$PATH npm run test:db` or the targeted isolated financial-lane runner |
| **Full suite command** | `PATH=/tmp/rc-digital-node22/bin:$PATH make financial-gate && PATH=/tmp/rc-digital-node22/bin:$PATH npm run typecheck && PATH=/tmp/rc-digital-node22/bin:$PATH npm run lint && PATH=/tmp/rc-digital-node22/bin:$PATH npm run build` |
| **Estimated runtime** | Quick 5–30 seconds; targeted database 2–8 minutes; full gate 15–30 minutes |

---

## Sampling Rate

- **After every task commit:** Run the task's targeted Vitest, pgTAP, provider,
  or release-contract command.
- **After every plan:** Run all tests named by that plan plus `npm run typecheck`
  when TypeScript changed or the isolated clean/upgrade database lane when SQL
  changed.
- **After every plan wave:** Run `make financial-gate` when the wave changes a
  money-bearing schema/RPC; otherwise run all affected Vitest and static lanes.
- **Before `$gsd-verify-work`:** The full suite command above and broad
  `CI=1 npm test` must be green.
- **Max feedback latency:** 30 seconds for unit/provider tasks and 8 minutes for
  targeted live database tasks.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | AGR-01, AGR-02, AGR-03 | T-04-01 | Malformed or ambiguous structured terms cannot persist | pgTAP | targeted agreement schema test | ❌ plan creates | ⬜ pending |
| 04-01-02 | 01 | 1 | AGR-04 | T-04-02 | Concurrent activation cannot create overlap or mutate an active version | pgTAP/concurrency | targeted activation race test | ❌ plan creates | ⬜ pending |
| 04-01-03 | 01 | 1 | AGR-05 | T-04-03 | Only authorized human approval can activate lifecycle events | Auth/RPC | targeted agreement command test | ❌ plan creates | ⬜ pending |
| 04-02-01 | 02 | 2 | REV-01, REV-02 | T-04-04 | Period identity and provenance are server-derived and idempotent | pgTAP/RPC | targeted revenue period test | ❌ plan creates | ⬜ pending |
| 04-02-02 | 02 | 2 | REV-04, REV-05 | T-04-05 | Revisions and review effects are immutable and tenant-safe | pgTAP/Auth | targeted submission review test | ❌ plan creates | ⬜ pending |
| 04-02-03 | 02 | 2 | REV-06, REV-07 | T-04-06 | Bad/missing evidence creates an owned exception; permitted minimum requires approval | pgTAP/RPC | targeted evidence exception test | ❌ plan creates | ⬜ pending |
| 04-03-01 | 03 | 2 | CALC-02 | T-04-07 | Closed formula kinds use exact Phase 3 arithmetic only | unit/pgTAP | targeted formula golden test | ❌ plan creates | ⬜ pending |
| 04-03-02 | 03 | 2 | CALC-04, CALC-05 | T-04-08 | Frozen snapshots replay byte-equivalent exact results | unit/property/pgTAP | targeted calculation replay test | ❌ plan creates | ⬜ pending |
| 04-03-03 | 03 | 2 | CALC-06 | T-04-09 | Same request dedupes; changed reuse conflicts before effects | concurrency/RPC | targeted calculation race test | ❌ plan creates | ⬜ pending |
| 04-04-01 | 04 | 3 | REV-09 | T-04-10 | Close transaction rechecks agreement, evidence, exceptions, and policy | pgTAP/RPC | targeted close-policy test | ❌ plan creates | ⬜ pending |
| 04-04-02 | 04 | 3 | CALC-07 | T-04-11 | Preview and approval reject stale fingerprints and anomalous inputs | unit/RPC | targeted preview approval test | ❌ plan creates | ⬜ pending |
| 04-04-03 | 04 | 3 | REV-08 | T-04-12 | Late evidence creates a linked adjustment without rewriting history | pgTAP/concurrency | targeted adjustment test | ❌ plan creates | ⬜ pending |
| 04-05-01 | 05 | 4 | AGR-01–AGR-05 | T-04-13 | Supabase codecs reject malformed agreement responses and commands | Vitest | targeted provider codec test | ❌ plan creates | ⬜ pending |
| 04-05-02 | 05 | 4 | REV-01–REV-09 | T-04-14 | Both providers expose equal revenue state/error semantics | provider contract | targeted shared provider suite | ❌ plan creates | ⬜ pending |
| 04-05-03 | 05 | 4 | CALC-02, CALC-04–CALC-07 | T-04-15 | Both providers reconcile exact calculations before returning | provider contract/property | targeted shared calculation suite | ❌ plan creates | ⬜ pending |
| 04-06-01 | 06 | 5 | AGR-01, AGR-02, AGR-03 | T-04-16 | Agreement UI submits only structured typed terms through custom methods | component | targeted agreement form test | ❌ plan creates | ⬜ pending |
| 04-06-02 | 06 | 5 | AGR-04, AGR-05 | T-04-17 | Lifecycle actions are capability-gated and show immutable evidence/approval context | component | targeted agreement lifecycle test | ❌ plan creates | ⬜ pending |
| 04-06-03 | 06 | 5 | AGR-01–AGR-05 | T-04-18 | Mobile/desktop account panels preserve state and safe error behavior | component/surface | targeted responsive component test | ❌ plan creates | ⬜ pending |
| 04-07-01 | 07 | 5 | REV-01, REV-02, REV-04–REV-07 | T-04-19 | Close UI exposes revisions, provenance, evidence, and owned exceptions without cached secrets | component | targeted close evidence test | ❌ plan creates | ⬜ pending |
| 04-07-02 | 07 | 5 | REV-09, CALC-07 | T-04-20 | Preview shows exact prior-period delta and blocks stale/held approval | component | targeted preview test | ❌ plan creates | ⬜ pending |
| 04-07-03 | 07 | 5 | REV-08, CALC-04–CALC-06 | T-04-21 | Adjustment lineage and explanations remain visible and immutable | component/surface | targeted adjustment UI test | ❌ plan creates | ⬜ pending |
| 04-08-01 | 08 | 6 | All Phase 4 | T-04-22 | Every new path enters all inherited blocking financial identities | release contract | targeted release classification tests | ✅ existing harness | ⬜ pending |
| 04-08-02 | 08 | 6 | All Phase 4 | T-04-23 | Clean and representative upgrade apply complete Phase 4 schema with fingerprints | migration/upgrade | isolated clean and upgrade runners | ✅ existing harness | ⬜ pending |
| 04-08-03 | 08 | 6 | All Phase 4 | T-04-24 | Full gate, typecheck, lint, build, source receipt, and schema push pass at one head | integrated gate | full suite command | ✅ existing harness | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing Vitest, pgTAP, two-tenant Auth/HTTP, concurrency, provider-contract,
clean-migration, representative-upgrade, release-classification, and rendered
surface infrastructure covers all Phase 4 requirements. Each implementation
plan creates its domain-specific fixtures and tests before or alongside the
corresponding behavior; no new test framework is required.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Screen-reader announcement order for agreement and close state changes | AGR-05, REV-05, CALC-07 | Automated semantics do not prove real assistive-technology behavior | With a representative account in an immutable preview, complete submit/review/preview actions using VoiceOver and record announced labels/status order. |
| Physical-device mobile workflow | AGR-01–AGR-05, REV-01–REV-09, CALC-07 | Emulator viewports do not prove touch, keyboard, safe-area, or browser behavior | On at least one narrow iOS/Android device, inspect agreement terms, evidence revisions, an exception, and calculation preview without horizontal overflow or inaccessible actions. |
| Owner-authenticated hosted data readback | All Phase 4 | Credentials and production mutation remain owner-controlled | After separately authorized deployment/schema promotion and owner sign-in, read one account's Phase 4 support-safe surfaces and retain only redacted receipt metadata. |

Production promotion and feature enablement are not Phase 4 execution tests;
they remain separate owner-approved release actions.

---

## Validation Sign-Off

- [x] All anticipated tasks have automated verification or existing harness dependencies.
- [x] Sampling continuity: no three consecutive tasks lack automated verification.
- [x] Existing infrastructure covers all required test categories.
- [x] No watch-mode flags are used.
- [x] Unit feedback latency target is under 30 seconds; live database target is under 8 minutes.
- [x] `nyquist_compliant: true` is set in frontmatter.

**Approval:** approved 2026-09-04 under autonomous Phase 4 planning direction
