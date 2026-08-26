# Financial rollback and forward-repair runbook

Rollback never rebuilds release inputs, destructively edits an issued receipt,
or treats a database restore as a routine deployment. Keep the affected feature
disabled or demoted before changing frontend, functions, or schema behavior.

## Build artifacts

Select a known-good private receipt chain and authenticate its private readback.
Verify the exact commit, GitHub OIDC attestation, artifact manifest, and SHA-256
digest for every chosen artifact. A public workflow artifact, branch name, tag,
or locally rebuilt directory is not a rollback input.

## Frontend rollback

1. Disable or demote the affected financial feature and preserve its provider
   post-state evidence.
2. Identify the known-good `functions` receipt immediately before the desired
   frontend artifact.
3. Dispatch `release-promote` with that receipt as `evidence_id`, stage
   `frontend`, and the current affected receipt ID as `rollback_reference`.
4. Approve only the protected `production-release` deployment. The workflow
   privately reads back the pinned frontend digest, verifies its attestation,
   publishes without rebuilding, and verifies the provider branch head.
5. Require the new compensating receipt and authenticated private readback
   before closing the rollback. Link the incident and both old/new receipt IDs.

## Functions rollback

1. Keep the feature disabled and select the known-good `schema` predecessor
   receipt for the desired backward-compatible functions digest.
2. Dispatch `release-promote` with stage `functions` and the affected current
   receipt ID as `rollback_reference`.
3. Verify the pinned bundle, private readback, deployed function inventory,
   post-state report, and compensating receipt. Do not deploy function source
   from a checkout that is not bound to the selected build receipt.

## Feature disable or demotion

Use the protected release environment and the registered provider control to
transition `enabled → disabled` or `dormant → disabled`. Verify state at the
provider immediately afterward and create a compensating receipt whose
`rollback_references` includes the affected enable/dormant receipt. Phase 1 has
an empty live feature registry, so any real transition correctly fails closed
until an implementation and owner-approved registry entry exist.

## Database forward repair

Database recovery defaults to a feature-disabled forward repair. Prepare a new
expand-compatible migration, run the complete clean/upgrade/database/security
gate, build and attest it once, then promote a new `schema` receipt chain. Do
not routinely reverse an applied financial migration or delete append-only
facts.

A destructive restore is incident-only. It requires explicit incident authorization,
an owner, impact and data-loss analysis, an isolated successful
restore test, verified backup evidence, stated RPO/RTO impact, provider replay
plan, reconciliation sign-off, and a final compensating receipt. If any proof
is absent, keep the feature disabled and continue forward repair.

## Stop conditions

Stop when the known-good receipt or digest is ambiguous, private readback or
attestation fails, target identity differs, the feature cannot be disabled,
post-state is incomplete, a database action would lose immutable facts, backup
evidence is missing, or the compensating receipt cannot be published and read
back. Escalate under the incident process; never substitute an unreceipted
manual command.
