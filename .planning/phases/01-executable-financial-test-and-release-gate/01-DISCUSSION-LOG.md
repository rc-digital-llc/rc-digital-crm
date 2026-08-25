# Phase 1: Executable Financial Test and Release Gate - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution
> agents. Decisions are captured in CONTEXT.md — this log preserves the
> alternatives considered.

**Date:** 2026-08-25
**Phase:** 1-executable-financial-test-and-release-gate
**Areas discussed:** CI execution policy, upgrade baseline, release control,
exceptions and receipts

---

## CI Execution Policy

### Complete-suite timing

| Option | Description | Selected |
|--------|-------------|----------|
| Every PR event | Run the full expensive suite on every push. | |
| Path-scoped only | Run financial checks only when matching files change. | |
| Hybrid plus pre-merge | Use path-scoping for early feedback and require the complete suite before every merge. | ✓ |

### Verification layout

| Option | Description | Selected |
|--------|-------------|----------|
| Monolithic job | One job owns all financial verification. | |
| Independent required lanes | Each risk domain reports and blocks separately. | ✓ |
| Advisory sub-jobs | Sub-jobs report beneath one aggregate result. | |

### Test environment

| Option | Description | Selected |
|--------|-------------|----------|
| Shared remote project | Reuse one hosted test project. | |
| Pinned ephemeral local | Create an isolated repository-defined Supabase environment per run. | ✓ |
| Mock services | Simulate PostgreSQL and Edge Functions. | |

### Retry behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Retry everything | Automatically rerun failures until retry budget ends. | |
| Never retry | Treat every environment and assertion failure identically. | |
| Bootstrap-only retry | Permit one recorded environment-startup retry; never retry financial assertions to green. | ✓ |

**User's choice:** The user selected all areas and delegated detailed choices to
the agent.
**Notes:** The hybrid design keeps early feedback affordable while preventing
path filters or flaky retries from becoming merge authority.

---

## Upgrade Baseline

### Starting states

| Option | Description | Selected |
|--------|-------------|----------|
| Clean only | Prove only new database creation. | |
| Prior only | Prove only upgrade from the latest baseline. | |
| Clean plus prior | Prove clean creation and immutable representative upgrade. | ✓ |

### Fixture data

| Option | Description | Selected |
|--------|-------------|----------|
| Sanitized production dump | Copy and scrub live data. | |
| Empty schema | Use no representative records. | |
| Synthetic production-like | Use deterministic privacy-safe legacy and edge-case records. | ✓ |

### Baseline lifecycle

| Option | Description | Selected |
|--------|-------------|----------|
| Overwrite one baseline | Keep only a moving latest snapshot. | |
| Immutable milestone versions | Add baselines and preserve accepted history. | ✓ |
| Generate from main | Derive a new baseline dynamically on each run. | |

### Upgrade proof

| Option | Description | Selected |
|--------|-------------|----------|
| Exit code only | Passing means the command did not fail. | |
| Schema existence | Assert required objects exist. | |
| Data and authorization invariants | Preserve identity, values, ownership, grants, constraints, and queryability. | ✓ |

**User's choice:** Delegated to the agent.
**Notes:** Real customer data is prohibited. Unsafe database rollback is a
forward repair behind a disabled feature, not routine destructive reversal.

---

## Release Control

### Automatic activity

| Option | Description | Selected |
|--------|-------------|----------|
| Deploy production on main | Preserve the current push-to-main behavior. | |
| Preview and artifact only | Automate previews and immutable builds; protect production. | ✓ |
| No automation | Require manual previews and builds. | |

### Stage order

| Option | Description | Selected |
|--------|-------------|----------|
| Concurrent deployment | Push schema, functions, and frontend together. | |
| Frontend first | Publish UI before backend compatibility. | |
| Expand-contract | Schema, functions, frontend, then dormant feature with a receipt between stages. | ✓ |

### Approval points

| Option | Description | Selected |
|--------|-------------|----------|
| None | Treat CI success as production authority. | |
| Promotion only | Approve the production deployment once. | |
| Promotion and enablement | Approve production promotion and financial activation separately. | ✓ |

### Rollback

| Option | Description | Selected |
|--------|-------------|----------|
| Reverse migrations | Automatically run destructive down migrations. | |
| Restore database | Restore the full database for any stage failure. | |
| Artifact rollback and forward repair | Pin frontend/functions and repair database changes forward while disabled. | ✓ |

**User's choice:** Delegated to the agent.
**Notes:** Production promotion and permission to enable a financial workflow
are deliberately separate.

---

## Exceptions and Receipts

### Non-overridable gates

| Option | Description | Selected |
|--------|-------------|----------|
| Everything overridable | A release owner may waive any failure. | |
| Financial safety gates fixed | Migration, authorization, secret, source-map, replay/concurrency/provider, and critical/high production vulnerability gates cannot be waived for financial enablement. | ✓ |
| Secrets only fixed | Only committed/exposed secrets are non-overridable. | |

### Temporary exception policy

| Option | Description | Selected |
|--------|-------------|----------|
| No exceptions | Stop all work for every failure. | |
| Narrow seven-day exception | Allow unrelated issues with owner, issue, scope, controls, and automatic expiry. | ✓ |
| Standing exception list | Maintain reusable project-wide waivers. | |

### Receipt contents

| Option | Description | Selected |
|--------|-------------|----------|
| Job summary | Keep human-readable CI output only. | |
| Content-addressed manifest | Record artifacts, migrations, checks, reports, environment, flags, approvals, exceptions, and rollback references. | ✓ |
| Timestamp and SHA | Record only deployment time and commit. | |

### Receipt storage

| Option | Description | Selected |
|--------|-------------|----------|
| CI logs | Treat ephemeral workflow logs as evidence. | |
| Mutable checklist | Track releases in an editable document. | |
| Durable attested evidence | Retain a signed/attested manifest and link it from the protected deployment record. | ✓ |

**User's choice:** Delegated to the agent.
**Notes:** The planner retains discretion over the supported signing and
storage mechanism, but not over content addressing, durability, or required
receipt fields.

---

## the agent's Discretion

- The user said to work down all four areas as the agent saw fit.
- Exact script names, job names, fixture serialization, job parallelism, and
  supported attestation/storage tools remain implementation choices.
- Fail-closed merge and financial enablement boundaries are locked decisions,
  not discretionary implementation details.

## Deferred Ideas

None.

