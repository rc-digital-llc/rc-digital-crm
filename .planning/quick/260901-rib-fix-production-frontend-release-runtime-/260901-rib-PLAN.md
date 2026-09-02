---
quick_id: 260901-rib
status: complete
description: Fix production frontend release runtime configuration and verification
created: 2026-09-02
---

# Quick Task 260901-rib: Fix production frontend release runtime configuration and verification

## Objective

Ensure the immutable production frontend is built with the RC Digital CRM
Supabase public runtime configuration, fails closed when that configuration is
missing or targets a different project, and can be promoted and verified at the
customer-facing canonical URL.

## Task 1: Bind and validate release-build runtime configuration

**Files:** `.github/workflows/release-build.yml`,
`tests/release/release-policy.test.ts`

**Action:** Pass repository-scoped `VITE_SUPABASE_URL` and
`VITE_SB_PUBLISHABLE_KEY` variables into the one canonical production build.
Fail before dependency installation when either value is absent, when the URL
does not exactly match `RELEASE_PROVIDER_TARGET`, or when the browser key is
not a supported public-key form. Add workflow-contract tests for all bindings
and fail-closed checks without introducing server credentials into the build.

**Verify:** Run the focused release-policy tests, formatting/lint checks for
the changed files, typecheck, and a production build with explicit non-secret
test configuration.

**Done:** The release workflow cannot attest a frontend artifact with missing
or cross-project browser configuration, and its contract tests enforce that.

## Task 2: Configure hosted build inputs and prove the rebuilt artifact

**Files:** External GitHub repository variables and Vercel project environment
configuration; no credential values are written to the repository.

**Action:** Resolve the RC Digital CRM Supabase public URL and publishable key
without logging the key, set the two GitHub repository variables and matching
Vercel production/preview variables, then open and merge the focused PR through
the protected queue. Rebuild the immutable release receipt chain from the new
main commit and promote schema, functions, and the exact frontend artifact.

**Verify:** Confirm the artifact contains the expected Supabase origin, the
promotion readback hashes match, and all protected checks pass at the exact
head SHA.

**Done:** The promoted frontend is the configured artifact produced by the
protected release workflow rather than the previously unconfigured bundle.

## Task 3: Publish and gate canonical production

**Files:** External immutable production evidence under `.codex/evidence`; no
source receipt is rewritten.

**Action:** Publish the already-built static frontend artifact to the canonical
Vercel production project without rebuilding it. Run the shared build-gate
production contract at all five required viewports with the Phase 2 freshness
marker.

**Verify:** Require zero console/page errors, correct canonical origin,
freshness marker presence, responsive reflow, focus, and target checks; preserve
the JSON receipt and screenshot hashes.

**Done:** Canonical production is proven from the released artifact. Residual
screen-reader and physical-device coverage remains explicitly manual.
