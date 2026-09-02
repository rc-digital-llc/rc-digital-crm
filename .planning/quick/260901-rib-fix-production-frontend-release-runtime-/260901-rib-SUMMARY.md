---
quick_id: 260901-rib
status: complete
description: Fix production frontend release runtime configuration and verification
completed: 2026-09-01
source_commit: 0a7aa0229d9aaf0440c54bccf40a8e00ec89629a
production_url: https://atomic-crm-sigma-one.vercel.app
---

# Quick Task 260901-rib: Production Frontend Release Summary

**The configured RC Digital CRM frontend is live at the canonical Vercel URL,
byte-identical to its attested release artifact, and covered by fresh immutable
preview and production surface receipts.**

## Outcome

- Bound the protected release build to the exact RC Digital CRM Supabase origin
  and current publishable browser key, with fail-closed workflow contract tests.
- Merged the runtime fix in PR #13 and the credential-free production-entry
  contract in PR #14 through the protected merge queue with signed squash
  commits and all blocking checks green.
- Promoted final protected-main commit
  `0a7aa0229d9aaf0440c54bccf40a8e00ec89629a` through the content-addressed
  build, schema, functions, and frontend chain.
- Published the already-built 54-file frontend to Vercel without rebuilding it
  and proved the canonical public entry across five required viewports.

## Release Receipts

| Stage | GitHub run | Receipt ID |
|-------|------------|------------|
| Build | `33589891612` | `e045281d3219bd20ba8906fae8ccc9e5cf6bfa0b42be7156a0ef69c680610195` |
| Schema | `33590040647` | `56575122396fd9c648aa57dc1e10d86435e799fc753ab9f3babe0e9247d9928a` |
| Functions | `33590185711` | `ca842e73aa61c007dd2873fdf630f45dfebd23a482f0bab196066285b7347653` |
| Frontend | `33590304871` | `c1329de16ffff32b541c3efdc8cb5174fa438ecb73954be68be24744f87878d0` |

Every downloaded receipt matched its content-addressed filename. The chain
retains the same attested manifest digest
`34cd5cf8e11482b1d35365e77f4cd6ad5d87b5f43834bddfcf8033c93c08a01b`.
The release policy registers no dormant financial feature, so no enablement
stage was applicable.

## Rendered Evidence

- Public-entry immutable preview:
  `/Users/agenticmac/.codex/evidence/rc-digital-crm/public-entry-followup/e8e46e9b92b0332c0f1d8250ca034e0bf11d7808/preview/receipt.json`
  — 95 checks, 0 failures, 1 route × 5 viewports.
- Authenticated billing demo preview:
  `/Users/agenticmac/.codex/evidence/rc-digital-crm/billing-followup/e8e46e9b92b0332c0f1d8250ca034e0bf11d7808/preview/receipt.json`
  — 230 checks, 0 failures, 2 routes × 5 viewports.
- Canonical production:
  `/Users/agenticmac/.codex/evidence/rc-digital-crm/release-runtime/0a7aa0229d9aaf0440c54bccf40a8e00ec89629a/production/receipt.json`
  — 95 checks, 0 failures, 1 route × 5 viewports.

The production deployment is
`dpl_J7NQtFpG846jr7RYJq8wL3tPKGkr`. Its metadata pins the protected source
commit and tree, frontend receipt, customer branch commit, artifact digest,
and bundle digest. A direct canonical-origin readback matched all 54 files to
the promoted customer branch with bundle tree SHA-256
`9d75c838466c23dc3168efc83e04660cd3b42e672f1e26fdf5281bd54e700db4`.

## Failures Converted Into Contracts

1. The first corrected runtime deployment exposed that the billing-only
   production contract could not prove a credential-free site: unauthenticated
   routes correctly redirected to first-owner sign-up. The failed receipt was
   preserved under the `390c879e` production evidence directory.
2. PR #14 added shared release/canonical metadata to sign-in, sign-up, and
   billing surfaces plus a public-entry production contract. The contract now
   verifies freshness without creating accounts or inventing credentials.
3. The first configured local public-entry run found the disabled sign-up
   button was not a reliably hittable 44-pixel target. The submit target was
   corrected while native and form validation remained authoritative; the
   regression contract then passed locally, in immutable preview, and in
   production.

## User Setup Required

The first real owner must create the initial account at
`https://atomic-crm-sigma-one.vercel.app`. No account or credential was created
by the release process.

## Residual Manual Coverage

- Repeat the billing workflow in production after an owner-created account is
  available; the authenticated deterministic preview already proves the two
  billing routes responsively without using production credentials.
- Screen-reader and physical-device checks remain manual. Automated receipts
  cover viewport reflow, focus exposure, target sizing, canonical/freshness
  metadata, and browser/page errors, but do not substitute for those checks.

## Self-Check: PASSED

- Protected PR and merge-group checks passed at the exact approved heads.
- Protected-main build and all three promotion jobs completed successfully.
- Supabase browser configuration contains only the current publishable key; no
  secret key was present in the deployed bundle.
- Vercel production is `READY`, its canonical alias resolves to the exact
  deployment, and all 54 live files match the attested artifact.
- Production surface receipt: 95 checks, 0 failures.
