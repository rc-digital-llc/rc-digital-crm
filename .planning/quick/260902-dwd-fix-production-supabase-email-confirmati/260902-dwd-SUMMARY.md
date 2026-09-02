---
quick_id: 260902-dwd
status: complete
description: Fix production Supabase email confirmation redirect and add regression coverage
completed: 2026-09-02
source_commit: 3260cb37261b3757dcbc8d84fea6de79bc0903d7
production_url: https://atomic-crm-sigma-one.vercel.app
---

# Quick Task 260902-dwd: Production Auth Redirect Summary

**Supabase email confirmations now return to the canonical RC Digital CRM,
future production promotions fail closed if the hosted Auth configuration
regresses to localhost, and the exact hotfix is live and verified.**

## Outcome

- Corrected the live Supabase Auth Site URL and redirect allow-list from
  localhost to `https://atomic-crm-sigma-one.vercel.app`.
- Added an explicit signup `emailRedirectTo` policy: localhost is preserved for
  local development, while preview, production, invalid, and server-side
  contexts resolve to the canonical production origin.
- Added a credential-free production Auth contract and Management API verifier
  that runs before every protected promotion and rejects missing canonical,
  forbidden local, or cross-project values.
- Converted the escaped defect into release-policy, redirect-resolution, and
  live-configuration regression tests.
- Merged PR #18 through the protected queue as signed squash commit
  `3260cb37261b3757dcbc8d84fea6de79bc0903d7`, then promoted its already-built
  artifact through schema, functions, frontend, and Vercel production.

## Release Receipts

| Stage | GitHub run | Receipt ID |
|-------|------------|------------|
| Build | `33662699620` | `734a81418e55d549874c86ef348ba6b99391b43e84a1de1a5d51cea3b9cbadd3` |
| Schema | `33662869064` | `c4ac4907e2f33c1aa68c455471cb8ad75b44fe91c811f489aacf0178ff026ecf` |
| Functions | `33663075868` | `f350b9823f397fd86093fc78a8bcf6bab14513b9c9809fb220f4baa1962cd41a` |
| Frontend | `33663284058` | `63ec0f06d251a50cad5f54be5668712c1cb868247b3c060f6f1ed2dca25f41d9` |

Every stage privately read back and verified its immediate predecessor. The
release policy has no registered dormant financial feature, so no enablement
stage was applicable.

## Verification

- Focused release suite: 71 tests passed.
- Full suite: 422 tests passed and 14 existing tests were skipped.
- Lint, formatting, typecheck, production build, security coupling, and release
  bundle gates passed.
- PR head and merge-group reruns passed all 11 required checks; the approved
  head had zero unresolved review threads and all commits had verified
  signatures.
- Immutable preview receipt:
  `/Users/agenticmac/.codex/evidence/rc-digital-crm/auth-confirmation-redirect/8451e89e/preview/receipt.json`
  — 95 checks, 0 failures, 1 route × 5 viewports; SHA-256
  `4ce0edee904f22877a3dff916109207d84f8316cfff9c2c527f455ffcefc9393`.
- Canonical production receipt:
  `/Users/agenticmac/.codex/evidence/rc-digital-crm/auth-confirmation-redirect/3260cb37261b3757dcbc8d84fea6de79bc0903d7/production/receipt.json`
  — 95 checks, 0 failures, 1 route × 5 viewports; SHA-256
  `01f1abc0818766fb5dfb99ecf1e1b5365c1bb0b1525001a9925867295c670479`.
- Production deployment `dpl_DtcohxxzfHweij8JTWcyB4yG5bEu` is `READY`,
  owns the canonical alias, and contains the same 54 file-content hashes as the
  attested frontend artifact.
- Final live Supabase Management API readback confirmed the canonical Site URL,
  required wildcard redirect, correct project, and absence of local URLs.

## User Follow-up

The confirmation likely completed before the failed localhost navigation. The
owner can now return to the canonical CRM URL and sign in. The release process
did not create, inspect, or store any account credential or personal account
data.

## Residual Manual Coverage

- A real owner sign-in remains a user-performed check because the release
  process does not receive or persist personal credentials.
- Screen-reader and physical-device checks remain manual. Automated receipts
  cover responsive reflow, focus exposure, target sizing, canonical/freshness
  metadata, browser errors, and page errors.

## Self-Check: PASSED

- The hosted Auth configuration was corrected before release and reverified
  after production deployment.
- The defect is covered by deterministic application and promotion contracts.
- Source, immutable preview, protected merge, staged receipts, exact deployed
  bytes, canonical alias, and production rendering all passed independently.
