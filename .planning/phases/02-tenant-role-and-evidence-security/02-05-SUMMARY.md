---
phase: 02-tenant-role-and-evidence-security
plan: "05"
subsystem: database
tags: [supabase, storage, evidence, quarantine, retention, audit]

requires:
  - phase: 02-tenant-role-and-evidence-security
    plan: "01"
    provides: caller-bound human capabilities and append-only billing audit
  - phase: 02-tenant-role-and-evidence-security
    plan: "04"
    provides: exact automation principals, grants, and transactional execution receipts
provides:
  - private billing-evidence Storage bucket with no authenticated object policy
  - quarantine-first evidence metadata with opaque generated paths and immutable byte identity
  - scanner-grant inspection finalization and purpose-bound short-lived access decisions
  - retention, hold, lifecycle, safe-view, access-history, and audit contracts
affects: [04-revenue-evidence, 05-provider-operations, 08-customer-portal, 10-collections]

tech-stack:
  added: []
  patterns: [quarantine-first evidence, server-generated storage paths, decision-before-capability, append-only access history]

key-files:
  created:
    - supabase/migrations/20260901000004_billing_evidence_security.sql
    - supabase/tests/database/40_billing_evidence.sql
  modified:
    - supabase/tests/support/billing-security-fixtures.sql

key-decisions:
  - "Evidence paths are generated from immutable server-owned organization, account, and evidence UUIDs; callers never provide a filename or path."
  - "Database access authorization returns only a 60-second capability-eligible decision and event ID; signed URLs, tokens, and paths are never persisted or returned by this layer."
  - "Customer upload stays dormant because the migration creates no authenticated Storage insert policy or upload command while no production scanner is registered."

patterns-established:
  - "Evidence release: exact automation grant -> inspection transition -> clean active unexpired unheld state -> purpose/capability decision -> append-only access and audit events."
  - "Support visibility: security-invoker allowlist view omits object paths, byte hashes, signed data, contacts, and provider payloads."

requirements-completed: [SEC-02, SEC-05, SEC-06, SEC-07]

duration: 15min
completed: 2026-09-01
---

# Phase 2 Plan 05: Private Evidence Security Summary

**Private quarantine-first evidence with exact scanner grants, bounded access decisions, and immutable retention/access history**

## Performance

- **Duration:** 15 min
- **Started:** 2026-09-01T15:05:00-07:00
- **Completed:** 2026-09-01T15:20:00-07:00
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Created the private `billing-evidence` bucket with no public or authenticated direct object policy and no customer upload command.
- Added account-bound evidence metadata with database-generated opaque paths, immutable SHA-256/size/MIME facts, quarantine inspection, retention, holds, and non-destructive lifecycle state.
- Reused exact automation grants for scanner decisions so inspection consumption, execution receipt, metadata transition, and audit commit or roll back together.
- Added purpose-bound human/customer access decisions that return no path or signed data and append exact access plus billing audit events before later capability issuance.
- Passed 230 live PostgreSQL assertions, including direct authenticated Storage denial and two-organization state/purpose/capability isolation.

## Task Commits

Each task was committed atomically:

1. **Task 1: Install private evidence metadata, storage, and decision state** - `36385b8c` (feat)
2. **Task 2: Prove evidence state, storage policy, retention, and immutable access history** - `b46a2e4f` (test)

## Files Created/Modified

- `supabase/migrations/20260901000004_billing_evidence_security.sql` - Private bucket, evidence/access schema, inspection and access commands, safe view, RLS, ACLs, and immutable triggers.
- `supabase/tests/database/40_billing_evidence.sql` - Sixty-five catalog, Storage, lifecycle, authorization, audit, and immutability assertions.
- `supabase/tests/support/billing-security-fixtures.sql` - Two-tenant scanner grants and synthetic evidence covering every lifecycle state.

## Decisions Made

- Generated the Storage path as a stored database expression from three UUID identities, preventing path traversal, user filenames, and caller-controlled tenant scope.
- Kept access authorization separate from signed URL creation: the database produces only an allow/deny event and a maximum 60-second eligibility expiry.
- Permitted reviewer/review, operator/download, customer/download, and auditor/audit combinations; mismatched purposes fail without broadening role capabilities.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Protected generated paths through immutable source identifiers**

- **Found during:** Task 2 (authorized inspection transition)
- **Issue:** PostgreSQL recomputes generated columns after `BEFORE UPDATE` triggers, so comparing `OLD.object_path` to the not-yet-recomputed `NEW.object_path` falsely rejected a legitimate state transition.
- **Fix:** Kept path immutability in the generated-column contract and protected its organization/account/evidence source identities in the trigger.
- **Files modified:** `supabase/migrations/20260901000004_billing_evidence_security.sql`
- **Verification:** Clean schema push and all 230 database assertions pass.
- **Committed in:** `b46a2e4f`

**2. [Rule 2 - Missing Critical] Normalized non-automation inspection denials**

- **Found during:** Task 2 (human impersonation contract)
- **Issue:** The underlying grant helper returned a grant-specific code to a human caller, exposing an internal authorization distinction.
- **Fix:** The inspection boundary now preserves duplicate outcomes but maps every non-applied authorization failure to `INSPECTION_NOT_AUTHORIZED`.
- **Files modified:** `supabase/migrations/20260901000004_billing_evidence_security.sql`
- **Verification:** Human, wrong-scanner, and cross-tenant cases all deny without changing inspection state or consuming allowance.
- **Committed in:** `b46a2e4f`

---

**Total deviations:** 2 auto-fixed (1 trigger-order bug, 1 safe-denial hardening). **Impact on plan:** Both fixes strengthen the planned boundary without expanding product scope.

## Issues Encountered

- The first live suite exposed generated-column trigger timing and safe-reason normalization; both were corrected and the full suite was rerun successfully.

## User Setup Required

None - all execution used disposable loopback Supabase projects and the protected dashboard project was not touched.

## Next Phase Readiness

- Later evidence Edge commands can issue signed capabilities only after consuming the database decision; no signed URL or object path is currently exposed.
- Customer uploads remain intentionally dormant until a production scanner and its exact automation grant are registered in a later authorized phase.
- Clean schema receipt: 37 migrations through `20260901000004`, hash `ebd15f781a1accbe1de58d6c3cfd2cdfb0c45515d808b2070faed340dbaaacbf`.

## Self-Check: PASSED

- `make test-financial-schema-push`
- `make test-financial-database-sql`

---
*Phase: 02-tenant-role-and-evidence-security*
*Completed: 2026-09-01*
