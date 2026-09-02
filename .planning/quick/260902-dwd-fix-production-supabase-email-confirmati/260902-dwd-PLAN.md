---
quick_id: 260902-dwd
status: complete
description: Fix production Supabase email confirmation redirect and add regression coverage
created: 2026-09-02
completed: 2026-09-02
source_commit: 3260cb37261b3757dcbc8d84fea6de79bc0903d7
production_url: https://atomic-crm-sigma-one.vercel.app
---

# Quick Task 260902-dwd: Fix production email confirmation redirect

## Objective

Ensure account confirmation links return users to the canonical RC Digital CRM
site, keep localhost behavior limited to local development, and block any future
production promotion while Supabase Auth points at localhost or omits the
canonical redirect.

## Task 1: Convert the escaped redirect defect into deterministic tests

**Files:** `tests/release/production-auth-config.test.ts`,
`tests/release/public-entry-surface.test.ts`,
`tests/release/release-policy.test.ts`

**Action:** Cover production, preview, localhost, and server-side redirect
resolution. Exercise the live Auth configuration validator against correct,
missing, and forbidden redirect states. Assert that the promotion workflow
runs the validator before any provider mutation.

**Verify:** Run the focused release test files and require the new assertions
to fail before implementation and pass after it.

**Done:** The exact localhost failure reported by the owner is represented by
a durable automated contract.

## Task 2: Bind signup and release promotion to the canonical redirect

**Files:**
`src/components/atomic-crm/providers/supabase/authRedirect.ts`,
`src/components/atomic-crm/providers/supabase/dataProvider.ts`,
`.github/release/production-auth.json`,
`scripts/release/verify-production-auth-config.mjs`,
`.github/workflows/release-promote.yml`

**Action:** Send an explicit `emailRedirectTo` on signup. Resolve local browser
origins only for local development and otherwise force the public canonical
origin. Add a credential-free production Auth contract and query the Supabase
Management API before every promotion, failing closed on a mismatched Site URL,
missing canonical allow-list entry, localhost entry, or cross-project target.

**Verify:** Run focused tests, lint, formatting, typecheck, build, and the live
config verifier without printing access tokens.

**Done:** Both application behavior and the hosted Auth control plane enforce
the canonical production redirect.

## Task 3: Release and verify the exact hotfix

**Files:** Immutable evidence under `.codex/evidence`; no credentials or
personal account data are written to source or receipts.

**Action:** Run the source surface gate, merge the exact green PR head through
the protected queue, build and promote the attested frontend, publish that
artifact to the canonical Vercel project, and run fresh immutable-preview and
production five-viewport receipts.

**Verify:** Require the live Supabase Auth readback to match the contract, all
blocking checks to pass, promoted frontend bytes to match the attested artifact,
and both surface receipts to pass with the intended freshness marker.

**Done:** New confirmation emails return to RC Digital CRM and the deployed
hotfix is proven independently at source, preview, and production stages.
