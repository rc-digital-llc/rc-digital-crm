# Phase 5: Immutable Invoicing and Durable Provider Operations - Discussion Log

> Audit trail only. Downstream planning/execution reads 05-CONTEXT.md.

**Date:** 2026-09-05
**User direction:** “okay work throught it”
**Mode:** Inline continuation of discussion/planning; no literal --auto flag or fabricated answers.
**Areas:** Invoice identity/terms, corrections, durable effects, hosted authorization,
notice responsibility, accounting, provider certification, UI and release baseline.

| Area | Alternatives considered | Planning treatment and provenance |
|---|---|---|
| Numbering/terms | Hardcode a convention; preserve known convention; require versioned configuration | Configurable series and explicit terms; no established convention was supplied |
| Correction placement | Rewrite original; silently carry; separately linked correction | Linked correction draft, consistent with immutable history; no automatic commercial issue decision |
| Queue | Browser jobs; new external service; transactional Postgres jobs | Existing runtime and atomicity favor Postgres outbox; agent implementation recommendation |
| Timeout | Retry with new key; hold/recover original intent | Hold and recover; binding PAY-05/AUTO-02 invariant |
| Provider | Choose from docs; test only one; certify both | Same real sandbox fixtures for both; binding PAY-01 |
| Notices | Custom sender takeover; initial provider responsibility | Keep provider notices enabled pending evidence; conservative technical default |
| Ledger | Treat fixtures as approval; require exact-policy accountant evidence | Require genuine approval; binding REC-01 |
| UI | New dashboard; existing account panels and invoice routes | Reuse existing visual system, agent implementation recommendation |
| Baseline | Bulk ours/theirs; reviewed feature reconciliation | Preserve histories and require proven integrated base; no merge performed |

**Optional clarification:** Asked whether existing invoice numbering or payment
terms must be preserved. No answer received at write time. This absence is not
consent to new commercial terms: issuance remains blocked without explicit
versioned configuration.

## the agent's Discretion

Routine names, bounded technical defaults and existing visual patterns are
selected to make the plans executable. No user statement is fabricated for
accounting policy, provider selection, credentials, real sends or promotion.

## Deferred Ideas

Only existing roadmap boundaries: bank reconciliation (6), full operator
governance (7), customer portal (8), collections/workspace (9).
