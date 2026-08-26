# Financial release runbook

This procedure promotes one immutable, attested release stage at a time. A
successful merge or `release-build` run is not production proof and grants no
production mutation authority.

## Prerequisites

- The private evidence repository, `RELEASE_PROVIDER_TARGET`, and
  `RELEASE_OWNER_LOGIN` repository variables are configured.
- The `production-release` environment permits protected `main` only, requires
  the release-owner reviewer with self-review prevention, and contains the
  private evidence, Supabase, and customer frontend secrets.
- The predecessor receipt and all detailed reports have authenticated private
  readback. Public workflow logs or Actions artifacts are diagnostic only.

## Dispatch inputs

Open the `release-promote` workflow and provide:

- `evidence_id`: the 64-character receipt ID from the immediately preceding
  stage.
- `stage`: exactly one of `schema`, `functions`, `frontend`, or `dormant`.
- `feature`: required only for `dormant`; it must already exist in the
  versioned financial feature registry.

The expected chain is `build → schema → functions → frontend → dormant`.
Each run remains pending at `production-release` until a required reviewer
approves it. Approval releases protected secrets only to that one job; it does
not approve the next stage or financial enablement.

## Stage procedure

1. Confirm the requested stage is the immediate successor of the receipt shown
   in `evidence_id`.
2. Review the exact commit, artifact manifest digest, ten required check links,
   migration range, security report hashes, and any exceptions. Phase 1 expects
   no exception for a non-overridable failure.
3. Approve the protected deployment only when the selected stage and target are
   correct.
4. The workflow privately reads back the complete receipt chain, verifies every
   artifact digest and GitHub OIDC attestation, checks out the exact commit, and
   reverifies the predecessor immediately before mutation.
5. The workflow performs only the selected operation:
   - `schema`: dry-run and apply the pinned expand-compatible migration set.
   - `functions`: deploy the pinned backward-compatible function bundle.
   - `frontend`: publish the pinned frontend archive without rebuilding.
   - `dormant`: register a policy-listed feature in dormant state. The empty
     Phase 1 registry makes real dormant attempts fail closed.
6. Confirm the provider post-state check passes and the protected deployment
   links a new private receipt whose readback is `verified`.
7. Copy that new receipt ID only when intentionally dispatching the next stage.

## Stop conditions

Stop without retrying or advancing when any secret is missing; the evidence
repository is not private; a receipt, predecessor, digest, attestation, commit,
or required check differs; stage order is wrong; an exception is expired; the
schema dry-run is not compatible; provider post-state is incomplete; the
feature is unregistered; or private receipt readback fails. Preserve the failed
run ID and follow [financial-rollback.md](financial-rollback.md); do not rebuild,
skip a stage, edit an issued receipt, or invoke the next workflow automatically.
