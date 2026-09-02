---
phase: 2
slug: tenant-role-and-evidence-security
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-09-01
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for tenant isolation, role separation, private
> evidence, safe operator surfaces, and protected release continuity.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.4 + pgTAP through the isolated Supabase CLI lane + build-gate surface receipts |
| **Config files** | `vite.config.ts`, `supabase/config.toml`, `makefile`, `.github/release/release-policy.json` |
| **Quick run command** | `npm test -- --run tests/release/billing-security-static.test.ts` |
| **Database command** | `make test-financial-database-contracts` |
| **Function/storage command** | `make test-financial-functions` |
| **Full phase command** | `make financial-gate && npm run typecheck && npm run lint && npm run build` |

## Sampling Rate

- **After every task commit:** run the task-specific automated command below
  plus `git diff --check`. Live database commands may target only the isolated
  loopback stack created by the Phase 1 runner.
- **After every wave:** run the affected financial lane and `npm run typecheck`
  for waves that touch TypeScript.
- **Before PR readiness:** run the full phase command and retain a rendered
  `source` receipt at 320px and a wider viewport.
- **Before merge:** require all protected checks for the exact head SHA and a
  full five-viewport receipt against an immutable deployed preview URL with the
  intended freshness marker.
- **After authorized release:** retain a new `production` receipt from the
  customer-facing canonical URL with the same marker before claiming live.
- **Retry policy:** no assertion retry. Only the classified local-stack
  bootstrap retry inherited from Phase 1 is allowed.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Secure Behavior | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | WORK-01, SEC-01, SEC-03, SEC-06 | Organization/account, contacts, roles, assignments, and audit tables are caller-bound and force RLS | `make test-financial-schema-push` | ✅ tracked | ✅ green |
| 02-01-02 | 01 | 1 | SEC-01, SEC-03, SEC-06 | pgTAP proves table constraints, role separation, helper grants, locked search paths, and append-only audit | `make test-financial-database-sql` | ✅ tracked | ✅ green |
| 02-02-01 | 02 | 2 | SEC-01, SEC-03 | The immutable baseline remains unchanged while a numbered upgrade contract names the intentional invoice boundary transform | `npm test -- --run tests/release/migration-upgrade.test.ts` | ✅ tracked | ✅ green |
| 02-02-02 | 02 | 2 | SEC-01, SEC-02, SEC-06 | Existing invoices backfill to one unambiguous organization/account and acquire tenant-safe RLS | `make test-financial-migration-upgrade && make test-financial-schema-push` | ✅ tracked | ✅ green |
| 02-03-01 | 03 | 3 | SEC-02, SEC-03 | Real admin/operator/reviewer/auditor/customer JWTs see only entitled rows across two organizations | `node scripts/release/run-supabase-lane.mjs run --lane database-contracts -- npm test -- --run tests/release/billing-tenancy.test.ts -t human` | ✅ tracked | ✅ green |
| 02-03-02 | 03 | 3 | WORK-01, SEC-02, SEC-06 | Account/contact/invoice mutations enforce exact allow/deny outcomes and append exact audit effects | `node scripts/release/run-supabase-lane.mjs run --lane database-contracts -- npm test -- --run tests/release/billing-tenancy.test.ts -t effects` | ✅ tracked | ✅ green |
| 02-04-01 | 04 | 2 | SEC-04, SEC-06 | Automation principals and grants bind Auth callers to exact account/command/provider/policy/action/limit tuples | `make test-financial-schema-push` | ✅ tracked | ✅ green |
| 02-04-02 | 04 | 2 | SEC-02, SEC-04, SEC-06 | Transactional grant consumption fails closed under mismatch, expiry, limit, replay, and concurrency | `make test-financial-database-sql` | ✅ tracked | ✅ green |
| 02-05-01 | 05 | 2 | SEC-05, SEC-06, SEC-07 | Evidence metadata, private bucket, quarantine, retention/hold, access events, and support-safe view install with force RLS | `make test-financial-schema-push` | ✅ tracked | ✅ green |
| 02-05-02 | 05 | 2 | SEC-02, SEC-05, SEC-06 | SQL contracts prove private storage policy, clean-only access decisions, expiry/hold denial, and immutable logs | `make test-financial-database-sql` | ✅ tracked | ✅ green |
| 02-06-01 | 06 | 1 | SEC-07 | Recursive redaction removes tokens, credentials, signed capabilities, provider payload fields, paths, and sensitive contact data | `npm test -- --run tests/release/billing-redaction.test.ts -t recursive` | ✅ tracked | ✅ green |
| 02-06-02 | 06 | 1 | SEC-07 | Shared error/log helpers emit stable allowlisted context without raw request or error objects | `npm test -- --run tests/release/billing-redaction.test.ts -t boundary` | ✅ tracked | ✅ green |
| 02-07-01 | 07 | 3 | SEC-02, SEC-05, SEC-06 | Authenticated evidence commands generate server-owned paths and quarantine-first signed uploads | `node scripts/release/run-supabase-lane.mjs run --lane edge-provider-contracts -- npm test -- --run tests/release/billing-evidence.test.ts -t upload` | ✅ tracked | ✅ green |
| 02-07-02 | 07 | 3 | SEC-02, SEC-04, SEC-05, SEC-07 | Inspection/download commands enforce exact grants, clean state, purpose, 60-second access, tamper denial, and redacted output | `node scripts/release/run-supabase-lane.mjs run --lane edge-provider-contracts -- npm test -- --run tests/release/billing-evidence.test.ts -t 'inspection|download|tamper'` | ✅ tracked | ✅ green |
| 02-08-01 | 08 | 2 | WORK-01, SEC-03 | Shared record/provider contracts expose standard account CRUD and explicit compound commands without trusting browser tenant IDs | `npm test -- --run src/components/atomic-crm/billing-accounts/billingDataProvider.test.ts -t contracts` | ✅ tracked | ✅ green |
| 02-08-02 | 08 | 2 | WORK-01, SEC-03, SEC-07 | Supabase and FakeRest implement parity with deterministic no-secret billing fixtures | `npm test -- --run src/components/atomic-crm/billing-accounts/billingDataProvider.test.ts -t parity` | ✅ tracked | ✅ green |
| 02-09-01 | 09 | 3 | WORK-01 | Responsive list and allowlisted export expose only safe billing-account fields | `npm test -- --run src/components/atomic-crm/billing-accounts/billingAccounts.test.ts -t 'list|export'` | ✅ tracked | ✅ green |
| 02-09-02 | 09 | 3 | WORK-01 | Create/edit forms capture identity, status, responsible owner, and contacts without exposing delete | `npm test -- --run src/components/atomic-crm/billing-accounts/billingAccounts.test.ts -t forms` | ✅ tracked | ✅ green |
| 02-09-03 | 09 | 3 | WORK-01, SEC-03 | Detail view makes account boundary and scoped records understandable on desktop and mobile | `npm test -- --run src/components/atomic-crm/billing-accounts/billingAccounts.test.ts -t detail` | ✅ tracked | ✅ green |
| 02-10-01 | 10 | 4 | WORK-01, SEC-03, SEC-04, SEC-05 | Access, automation, and evidence panels present capability-aware status and server-command outcomes | `npm test -- --run src/components/atomic-crm/billing-accounts/billingAccounts.test.ts -t panels` | ✅ tracked | ✅ green |
| 02-10-02 | 10 | 4 | SEC-03, SEC-07 | Presentation access is capability-based and persisted mobile cache excludes/clears billing-sensitive queries | `npm test -- --run src/components/atomic-crm/billing-accounts/billingAccounts.test.ts -t 'access|cache'` | ✅ tracked | ✅ green |
| 02-11-01 | 11 | 5 | WORK-01, SEC-03 | Billing accounts are registered in desktop and mobile Admin trees with real provider resources | `npm test -- --run tests/release/billing-security-static.test.ts -t registration` | ✅ tracked | ✅ green |
| 02-11-02 | 11 | 5 | WORK-01, SEC-07 | Source/preview/production surface contracts cover exact routes, marker, responsive viewports, and safe visible content | `node scripts/release/run-billing-source-surface.mjs --self-test` | ✅ tracked | ✅ green |
| 02-12-01 | 12 | 6 | SEC-01–07 | Existing blocking financial lanes include every Phase 2 SQL/Auth/Storage/Edge contract without new bypassable check identities | `npm test -- --run tests/release/billing-security-static.test.ts -t lanes` | ✅ tracked | ✅ green |
| 02-12-02 | 12 | 6 | WORK-01, SEC-01–07 | Full financial, type, lint, build, and source-rendered proof passes before PR readiness | `make financial-gate && npm run typecheck && npm run lint && npm run build && node scripts/release/run-billing-source-surface.mjs run --stage source --contract qa/billing-accounts.surface.source.json --receipt .planning/evidence/02/source/receipt.json --screenshots .planning/evidence/02/source/screenshots` | ✅ tracked | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

## Wave 0 Requirements

- [x] `supabase/tests/support/billing-security-fixtures.sql`
- [x] `supabase/tests/database/30_billing_tenancy.sql`
- [x] `supabase/tests/database/35_billing_automation.sql`
- [x] `supabase/tests/database/40_billing_evidence.sql`
- [x] `tests/release/billing-tenancy.test.ts`
- [x] `tests/release/billing-evidence.test.ts`
- [x] `tests/release/billing-redaction.test.ts`
- [x] `tests/release/billing-security-static.test.ts`
- [x] `src/components/atomic-crm/billing-accounts/billingDataProvider.test.ts`
- [x] `src/components/atomic-crm/billing-accounts/billingAccounts.test.ts`
- [x] `qa/billing-accounts.surface.source.json`
- [x] `qa/billing-accounts.surface.preview.json`
- [x] `qa/billing-accounts.surface.production.json`
- [x] `scripts/release/run-billing-source-surface.mjs`

## Owner-Controlled and Residual Verification

| Behavior | Requirement | Method |
|----------|-------------|--------|
| Immutable preview is deployment-fresh at all five viewports | D-17 / WORK-01 | Automated preview receipt after deployment, before merge |
| Canonical production route serves the same marker | D-17 / WORK-01 | Independent production receipt after protected promotion |
| Keyboard focus/order and screen-reader labels are usable | D-17 / WORK-01 | Manual keyboard and screen-reader pass; automation is supporting evidence only |
| Touch behavior works on a physical small-screen device | D-17 / WORK-01 | Residual real-device check, explicitly recorded |
| Hosted invoice backfill count is exact and unmapped rows are zero | SEC-01 | Protected schema-promotion pre/post count receipt; no direct local production access |

## Validation Sign-Off

- [x] Every planned implementation task has a targeted automated command.
- [x] No watch-mode flags occur in verification commands.
- [x] All Wave 0 files are named and owned by a preceding or same-task plan.
- [x] Security assertions use live pgTAP/Auth/REST/RPC/Storage/Edge behavior,
  with source contracts only as a supplementary release-coupling gate.
- [x] Wave 0 files exist and execute.
- [x] Full phase command is green at implementation head `a5da6dd1`.
- [x] The source receipt is retained with exact screenshot hashes.
- [ ] Preview and production receipts are retained at their later required gates.
- [ ] Residual keyboard, assistive-technology, and physical-device coverage is recorded without claiming complete automation.
- [ ] Hosted invoice backfill is proven by the protected schema-promotion receipt.

## Final Execution Evidence

- **Implementation head:** `a5da6dd1`
- **Observed:** 2026-09-02T01:19:51.636362Z
- **Migrations:** clean install and schema push passed for 40 migrations; legacy
  upgrade passed all nine semantic invariants with report SHA-256
  `b9fdb61ffb012e926d536e89a059dbef4d19a7bec98d39bf8842cef3f126a66d`.
- **Database:** nine pgTAP files and 262 assertions passed; live local Auth/HTTP
  tenancy passed 3 tests.
- **Edge and contention:** evidence/provider passed 10 tests; replay fixtures
  passed 18 assertions and the live PostgreSQL suite passed 8 tests.
- **Fast/security/build:** 48 billing tests passed; dependency audit found zero
  high/critical issues; current and history scans found zero findings; all six
  protected workflow identities remained coupled; typecheck, lint, and build
  exited 0.
- **Rendered source:** `.planning/evidence/02/source/receipt.json` passed 92/92
  checks across 2 routes × 2 viewports. Contract SHA-256 is
  `d2bbceda313d80dce383e74efdad57f851b12c8561bf4df7a2afb5a866e33b6e`;
  receipt SHA-256 is
  `5c7c4bbaa5f636d3b04afe5394b1c3cbba1ec8416827c9d4b1cc22d26eea328e`.
- **Stage boundary:** immutable five-viewport preview, canonical production,
  protected hosted backfill, screen-reader, and physical-device proof remain
  pending at their explicitly named release/manual gates.

**Approval:** automated Phase 2 validation complete; preview, merge, hosted
promotion, production, and residual manual coverage remain pending.
