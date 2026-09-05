# Phase 5 execution order

**Planning complete:** 2026-09-05. **Implementation:** not started.
**Entry prerequisite:** [Reconcile the Phase 3/4 baseline](05-BASELINE-PREFLIGHT.md).

Read [context](05-CONTEXT.md), [research](05-RESEARCH.md),
[UI contract](05-UI-SPEC.md), [validation](05-VALIDATION.md) and
[plan review](05-PLAN-REVIEW.md). Run plans serially after the baseline gate.

| Order | Plan |
|---|---|
| 01 | [Immutable invoice obligations and numbering](05-01-PLAN.md) |
| 02 | [Linked corrections, credit, void and write-off](05-02-PLAN.md) |
| 03 | [Transactional jobs, fencing and recoverable execution](05-03-PLAN.md) |
| 04 | [Permanent provider intents and the hosted-authorization port](05-04-PLAN.md) |
| 05 | [Stripe and GoCardless server adapters and capability proof](05-05-PLAN.md) |
| 06 | [Raw-signature webhook ingress and atomic enqueue](05-06-PLAN.md) |
| 07 | [Normalized immutable payment facts and causal processing](05-07-PLAN.md) |
| 08 | [Balanced append-only subledger and accounting approval](05-08-PLAN.md) |
| 09 | [Full, partial and unapplied allocations with reversals](05-09-PLAN.md) |
| 10 | [Durable invoice delivery, mandatory notices and retained proof](05-10-PLAN.md) |
| 11 | [Closed invoice/payment data providers, reads and security parity](05-11-PLAN.md) |
| 12 | [Desktop/mobile invoice operations and proof visibility](05-12-PLAN.md) |
| 13 | [Real dual-sandbox certification and approval evidence](05-13-PLAN.md) |
| 14 | [Immutable upgrade registry and complete local release proof](05-14-PLAN.md) |

All 15 phase requirements and 26 decisions have plan coverage. This is not
runtime certification. Real dual-sandbox receipts, exact-policy accountant and
notice evidence, and owner provider-selection review are required in Plan 13.
No test approval enables live effects. Source, preview and production proof
remain separate stages.

The roadmap progress table is updated to 0/14 Planned. Its legacy
`**Plans**: TBD` detail label is not rewritten by the installed registered
roadmap handler; this index and the actual plan files supply the authoritative
plan list without directly editing managed roadmap sections.
