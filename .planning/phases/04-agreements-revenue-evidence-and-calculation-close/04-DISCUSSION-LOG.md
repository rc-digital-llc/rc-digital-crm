# Phase 4: Agreements, Revenue Evidence, and Calculation Close - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution
> agents. Decisions are captured in `04-CONTEXT.md`; this log preserves the
> alternatives considered.

**Date:** 2026-09-04
**Phase:** 04-agreements-revenue-evidence-and-calculation-close
**Mode:** `--auto`, following the user's “keep moving” direction
**Areas discussed:** Agreement lifecycle, commissionable revenue contract,
evidence and close, calculation approval, late evidence, operator surface

---

## Agreement Lifecycle

| Question | Alternatives considered | Selected |
|----------|-------------------------|----------|
| What controls calculation? | Signed document only; structured terms only; structured terms anchored to signed private evidence | Structured terms anchored to signed private evidence |
| What happens after activation? | Editable current row; immutable activated versions; mutable row plus audit log | Immutable activated versions |
| How are overlaps handled? | Auto-truncate prior version; reject overlap; allow priority ordering | Reject overlap transactionally |
| Can the single owner approve? | Never; yes without distinction; yes with explicit self-approval marker | Yes with explicit self-approval marker under accepted single-owner risk |

**Selection basis:** Recommended defaults preserve exact calculation authority,
signed-term evidence, and the already accepted single-owner operating model
without hiding reduced separation of duties.

---

## Commissionable Revenue Contract

| Question | Alternatives considered | Selected |
|----------|-------------------------|----------|
| How are revenue rules represented? | Free text; fixed global schema; structured versioned rules plus immutable prose | Structured versioned rules plus immutable prose |
| How broad is the formula vocabulary? | Arbitrary expressions; closed v1 formula kinds; fixed and percentage only | Closed fixed, percentage, minimum-support, and hybrid kinds |
| How are source fallbacks chosen? | Global order only; operator choice per month; agreement-declared ordered ladder | Agreement-declared ordered ladder |
| How are mid-period amendments treated? | Silent proration; immediate full-period replacement; period-boundary activation or explicit future proration policy | Period-boundary activation or explicit future policy |

**Selection basis:** Recommended defaults keep v1 deterministic and prevent
ambiguous prose, source choice, or invented proration from becoming authority.

---

## Evidence and Monthly Close

| Question | Alternatives considered | Selected |
|----------|-------------------------|----------|
| What identifies a monthly period? | Generated ID only; account/month key; organization/account/agreement/month/timezone key | Full stable business key |
| How are corrections retained? | Edit in place; revisions with one accepted input; retain only accepted value | Immutable revisions with one accepted input |
| What happens to bad or missing evidence? | Estimate; block without owner; durable owned exception | Durable owned exception, never estimate |
| What does close freeze? | Status only; accepted amount only; agreement, evidence, policy, hashes, and decision snapshot | Complete immutable input snapshot |

**Selection basis:** Recommended defaults satisfy the explicit provenance,
revision, exception, and reproducibility requirements.

---

## Calculation Approval

| Question | Alternatives considered | Selected |
|----------|-------------------------|----------|
| Where is the calculation authoritative? | Browser; database/server command; duplicated browser and server logic | Database/server command with browser verification |
| How are duplicates handled? | New run every time; key-only dedupe; key plus complete request fingerprint | Key plus complete request fingerprint |
| What appears in preview? | Final amount only; amount plus prior total; exact branch, inputs, deltas, provenance, and checks | Complete explainable comparison |
| When may a clean result auto-close? | Always; never; only under an explicitly activated policy with transactional rechecks | Explicit policy only; new policies default manual |

**Selection basis:** Recommended defaults enable later bounded autonomy without
making auto-close an implicit behavior or trusting stale browser state.

---

## Late Evidence

| Question | Alternatives considered | Selected |
|----------|-------------------------|----------|
| Is the original close changed? | Reopen and rewrite; overwrite result; append linked adjustment | Append linked adjustment |
| How is a negative delta handled? | Always credit; ignore; credit only when contract permits, otherwise hold | Contract-permitted credit or held exception |
| Does Phase 4 issue the adjustment? | Create invoice now; freeze calculation only; post directly to ledger | Freeze adjustment calculation only |

**Selection basis:** Recommended defaults preserve historical truth and the
roadmap boundary between calculation close and invoicing.

---

## Operator Surface

| Question | Alternatives considered | Selected |
|----------|-------------------------|----------|
| Where does Phase 4 live? | New global workspace; billing-account detail; invoice screens | Billing-account detail |
| How is mobile handled? | Desktop-only; compressed desktop grid; stacked parity flow | Stacked parity flow |
| How are mutations performed? | Generic CRUD; browser state plus generic CRUD; closed custom provider/RPC commands | Closed custom provider/RPC commands |
| May billing data persist offline? | Full cache; metadata-only cache; no sensitive offline persistence | No sensitive offline persistence |

**Selection basis:** Recommended defaults reuse the current account experience,
preserve security boundaries, and defer the cross-account workspace to Phase 9.

## Agent Discretion

- Table, RPC, TypeScript, and component naming.
- Migration and test-file split.
- Stable reason-code vocabulary and explanation JSON structure.
- Exact anomaly-rule configuration and prior-period visual treatment, within
  the fail-closed and exact-money decisions in `04-CONTEXT.md`.

## Deferred Ideas

- Invoice/credit issuance and adjustment placement — Phase 5.
- Customer revenue-submission UI — Phase 8.
- Cross-account close/collections workspace — Phase 9.
