# Phase 5 baseline preflight

**Observed:** 2026-09-05. **Status:** BLOCKED for implementation, not for planning.
No merge, checkout, rebase, reset, deployment or conflict resolution was performed.

## Exact evidence

| Reference | SHA / result |
|---|---|
| Local Phase 4 completed head | `977dbc22c3bfbcaeff6117bfebb3803d1bdaf326` |
| Fetched origin/main | `b3f6fe800694af896c7e94678cf4a31c6debf0f9` |
| PR #22 | Merged as `ba3cb0938240e594bfc0c73b7ad46e4e4a83302d` |
| PR #24 | Open, non-draft, approved, clean against remote main; 11 successful check rollups |
| PR #24 head | `362fd9d355f353c9ceb6c8b5166f5a80871daeb9` |
| Local vs origin/main | 1 remote-only / 104 local-only commits; squash histories make this NOT a count of unpublished features |
| Local vs PR #24 merge base | `ba3cb0938240e594bfc0c73b7ad46e4e4a83302d` |

Read-only GitHub checks: `gh pr view 22`, `gh pr view 24`, and local
`git merge-tree --write-tree --name-only HEAD origin/review-pr-24`.
The merge-tree simulation produced conflicts without touching the worktree.
PR: https://github.com/rc-digital-llc/rc-digital-crm/pull/24

## Conflicting surfaces

Exact-money implementation/fixtures, invoice calculations, both data providers,
provider/domain types, both 20260902 migrations, registry 003, database and HTTP
fixtures, upgrade fingerprinting, replay tests, makefile and Phase 3 planning
records conflict. Local Phase 4 extends these surfaces and pins their local
hashes in registry 004. PR #24 does not contain the local
`20260903000001_exact_invoice_save_error_contract.sql` wrapper.

A PR can be clean against remote main while conflicting with this local tree.
Neither bulk “ours” nor bulk “theirs” is a valid reconciliation.

## Required integration work before executing 05-01

1. Revalidate exact remote head, check results, review decisions and applied
   migration provenance. Preserve local Phase 4 at its exact head and integrate
   in an isolated worktree/branch under the release workflow, outside planning.
2. Treat already merged Phase 3 migration bytes as immutable. Review PR #24's
   pending Phase 3 fixes as their own lineage. Port local Phase 4 changes by
   feature, checking exact API/SQL symbols and security semantics against the
   chosen reviewed base. Compare the local save-error wrapper with the release
   implementation; do not silently remove error normalization.
3. Preserve historical registries and receipts. If registry 004 was generated
   from a different base, retain it as historical evidence and create an explicit
   reviewed successor/supersession contract. Do not edit accepted hashes merely
   to make tests green. Any hosted applied-hash disagreement requires operator
   resolution before migration; never apply two definitions of one migration ID.
4. Run full Phase 3 and Phase 4 contracts, clean/upgrade/schema-push, source
   surface, typecheck, lint, build and broad regression against the integrated
   head. Resolve every high-severity/security and P1/P2 review finding.
5. Produce `artifacts/phase-05/baseline.json` with integrated SHA, both input
   SHAs, file/hash reconciliation manifest, exact gate receipts, registry lineage,
   reviewer disposition and isolated target proof. 05-01 must verify it before
   introducing any Phase 5 migration. A planning commit alone is not this proof.

## Authority and remaining release work

The earlier text approval names PR #22 only. GitHub reports PR #24 approved, but
this document does not issue a new approval, merge it or promote it. Release
owner identity, current exact-head review and every blocking check must be
revalidated in the release workflow. Preview and each protected promotion stage
retain their separate gates. No production claim is justified by this preflight.
