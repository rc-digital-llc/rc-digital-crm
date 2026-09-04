# Phase 4: Agreements, Revenue Evidence, and Calculation Close - Context

**Gathered:** 2026-09-04
**Status:** Ready for planning
**Mode:** Autonomous recommended defaults, authorized by the user's “keep moving” direction

<domain>
## Phase Boundary

This phase turns an authorized billing account into a reproducible monthly
calculation close. It adds immutable agreement versions for fixed,
percentage-of-revenue, minimum-support, and hybrid compensation; structured
commissionable-revenue definitions; one idempotent monthly revenue period per
applicable account/agreement; immutable evidence submissions and review
decisions; explicit exception ownership; and exact, replayable calculation
snapshots with prior-period comparison and a human-readable explanation.

The phase ends when a calculation is frozen and eligible for later invoice
creation. It does not issue invoices, create provider charges, reconcile cash,
deliver customer-portal submission flows, or add the cross-account collections
workspace. Those remain in Phases 5, 6, 8, and 9.

</domain>

<decisions>
## Implementation Decisions

### Agreement Terms and Lifecycle

- **D-01:** An agreement version combines a structured computational contract
  with a required reference to the private signed commercial evidence. The
  structured fields are authoritative for calculation only after activation;
  the source document hash and approval record prove why those fields were
  authorized.
- **D-02:** Agreement versions move through explicit `draft`, `pending_review`,
  `active`, `paused`, `superseded`, and `terminated` states. Drafts may be
  revised; an activated version is immutable. Amendments always create a new
  version linked to the version they replace.
- **D-03:** Activation is one transactional command that reauthorizes the
  caller, locks the billing-account agreement set, validates the effective
  range and signed evidence, rejects overlap, and appends the lifecycle audit
  event. It never silently truncates or edits an existing version.
- **D-04:** V1 monthly agreement versions activate on a revenue-period boundary.
  A proposed mid-period commercial change fails closed and must either take
  effect next period or use an explicitly defined future proration policy; the
  system does not invent prorated terms.
- **D-05:** Activation, amendment, pause, and termination require an active
  human approval capability and a reason. Under the already accepted
  single-owner operating model, the owner may hold author and approver roles,
  but a same-person approval is marked explicitly as self-approved under that
  risk acceptance. Automation cannot approve agreement terms.

### Commissionable Revenue Contract

- **D-06:** Commissionable revenue is a structured, versioned rule set rather
  than free text alone. It records cash-versus-accrual timing, included and
  excluded categories, tax treatment, refund/chargeback treatment, cutoff,
  period timezone/boundaries, dispute window, missing-report treatment, and
  true-up/credit treatment.
- **D-07:** The signed prose remains immutable evidence and a plain-language
  summary is shown to operators, but neither prose nor display formatting is
  parsed at calculation time. Ambiguous or incomplete structured terms block
  activation.
- **D-08:** Formula kinds are closed in v1: fixed, percentage, minimum-support,
  and hybrid `max(minimum, percentage result)`. Every agreement embeds the
  exact USD values, reduced rate ratio, formula version, and rounding-policy
  version established in Phase 3.
- **D-09:** Each agreement declares its allowed evidence provenance ladder in
  order: authorized read-only source, automated export, operator/customer
  submission, then contract-permitted minimum exception. A lower rung cannot
  replace a required higher rung without a recorded exception decision.

### Revenue Periods, Evidence, and Review

- **D-10:** Revenue periods use a stable business key derived from organization,
  billing account, agreement version, and calendar period in the agreement's
  immutable IANA billing timezone. Concurrent creation returns the existing
  period rather than producing duplicates.
- **D-11:** Each submission is an immutable revision containing provenance,
  submitter principal, attestation when applicable, submitted timestamp,
  exact USD gross and excluded amounts, derived commissionable amount,
  source identifiers, and hashes of linked private evidence objects.
- **D-12:** Corrections append a new revision linked to the prior revision.
  Exactly one revision may be accepted for close; rejected or superseded
  revisions remain visible in history and are never overwritten.
- **D-13:** Review is an explicit server-authorized command with accept,
  reject, request-correction, and hold outcomes. Every outcome records reviewer,
  role, reason, evidence/input fingerprint, policy version, and timestamp.
- **D-14:** Missing, conflicting, late, anomalous, or unverified evidence
  creates a durable exception with reason code, amount-at-risk when knowable,
  owner, due/next-action metadata, and status. It never causes an estimated
  revenue value.
- **D-15:** A minimum-only close is allowed only when the activated agreement
  explicitly permits it, the reporting deadline has passed, and an authorized
  reviewer approves it. The unresolved evidence exception stays open and is
  linked to the resulting minimum calculation.
- **D-16:** Closing a revenue period is transactional: it rechecks the active
  agreement, accepted revision, evidence state, open holds/exceptions, input
  hashes, and close-policy version before freezing the accepted input snapshot.
  A closed period is not reopened or edited.

### Calculation, Approval, and Replay

- **D-17:** Calculation runs are server-owned commands that consume only an
  activated agreement snapshot and a closable revenue-period snapshot. Browser
  totals and generic table CRUD are never financial authority.
- **D-18:** A frozen calculation records the agreement and revenue-period IDs
  and fingerprints, formula/close/rounding policy versions, exact intermediate
  numerator/denominator values, fixed/minimum/percentage candidates, selected
  result, final USD minor units, anomaly outcomes, and a versioned explanation
  payload.
- **D-19:** Duplicate commands with the same business key and complete request
  fingerprint return the existing calculation. A reused key with changed
  inputs conflicts before audit counters or financial state mutate.
- **D-20:** Preview shows the current result beside the previous comparable
  period, exact amount and percentage deltas, which formula branch won, input
  provenance, and every policy/anomaly check. A missing comparable period is
  labeled, not treated as zero.
- **D-21:** New close policies default to manual approval. A calculation may
  auto-close only when an explicitly activated policy version authorizes the
  exact account/formula/evidence class and every rechecked invariant passes.
  Any anomaly, changed input, hold, unresolved disallowed exception, or policy
  mismatch blocks before invoice eligibility.
- **D-22:** Approval and auto-close share one transactional state transition
  that reauthorizes the human or narrowly granted automation principal and
  rechecks the frozen fingerprint. The output is an immutable approved
  calculation reference for Phase 5, not an invoice.

### Late Evidence and Compensating Calculations

- **D-23:** Evidence accepted after a minimum-only close creates a new linked
  adjustment calculation against the original frozen calculation. The original
  period, evidence decision, and minimum result remain unchanged.
- **D-24:** The adjustment records the exact actual-result candidate, original
  billed candidate, delta, causation, and contract rule. A positive delta is a
  true-up; a negative delta is a credit candidate only when the activated
  agreement explicitly permits that treatment. Otherwise it becomes a held
  exception for review.
- **D-25:** Phase 4 freezes the adjustment calculation but does not decide
  whether Phase 5 issues it immediately or carries it onto a later invoice.
  Invoice timing and compensating-document behavior remain Phase 5 scope.

### Operator Surface

- **D-26:** Phase 4 extends the existing billing-account detail experience with
  account-scoped Agreements and Monthly Close sections. A cross-account billing
  workspace is deferred to Phase 9.
- **D-27:** Desktop uses the existing card/detail composition; mobile presents
  the same states and actions in a single stacked flow with 44px-or-larger
  targets. The primary monthly-close sequence is evidence status → exceptions →
  calculation preview → approval outcome.
- **D-28:** Status badges and summaries are presentation only. Every activate,
  review, close, calculate, and approve action uses explicit custom provider
  methods backed by transactional RPCs and independently enforced database
  authorization.
- **D-29:** Financial and evidence queries remain excluded from offline
  persistence. Offline screens may show a safe reconnect message but may not
  expose cached agreement terms, evidence metadata, or calculation snapshots.

### Agent Discretion

The agent may choose table/type/component names, migration split, reason-code
vocabulary, form composition, explanation JSON shape, anomaly-rule registry,
and exact prior-period comparison presentation. Those choices may not weaken
immutable versioning, period uniqueness, signed-evidence linkage, exact-money
authority, transactional rechecks, fail-closed exception handling, or the
separation between Phase 4 calculation close and Phase 5 invoicing.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and acceptance contract

- `.planning/PROJECT.md` — core value, fail-closed autonomy, evidence ladder,
  immutability, USD-first, and required delivery order.
- `.planning/REQUIREMENTS.md` — AGR-01 through AGR-05, REV-01, REV-02,
  REV-04 through REV-09, and CALC-02, CALC-04 through CALC-07.
- `.planning/ROADMAP.md` — Phase 4 boundary, dependency, success criteria, and
  separation from later invoice, portal, and workspace phases.
- `.planning/STATE.md` — completed Phase 1–3 decisions and current Phase 4 focus.
- `AGENTS.md` — repository architecture, commands, provider parity, and
  migration conventions.

### Inherited release, security, and exact-money authority

- `.planning/phases/01-executable-financial-test-and-release-gate/01-CONTEXT.md`
  — blocking financial lanes, expand-contract delivery, release receipts, and
  approval boundaries.
- `.planning/phases/01-executable-financial-test-and-release-gate/01-VERIFICATION.md`
  — verified release-gate foundation inherited by every Phase 4 change.
- `.planning/phases/02-tenant-role-and-evidence-security/02-CONTEXT.md` —
  account-scoped roles, automation grants, private evidence, audit, and
  two-tenant proof requirements.
- `.planning/phases/02-tenant-role-and-evidence-security/02-VERIFICATION.md` —
  verified tenant/evidence security contract Phase 4 must extend.
- `.planning/phases/03-exact-money-and-rounding-contract/03-CONTEXT.md` —
  authoritative money, exact rate, versioned rounding, serialization, and
  provider-parity decisions.
- `.planning/phases/03-exact-money-and-rounding-contract/03-VERIFICATION.md` —
  verified exact-money foundation and protected-lane evidence.

### Existing database and provider surfaces

- `supabase/migrations/20260901000001_billing_tenant_roles.sql` — billing
  accounts, scoped role assignments, audit foundation, RLS, and grants.
- `supabase/migrations/20260901000004_billing_evidence_security.sql` — private
  evidence metadata, inspection/access lifecycle, append-only access history,
  and server-authorized commands.
- `supabase/migrations/20260901000007_billing_evidence_presentation.sql` —
  support-safe evidence view and current upload presentation contract.
- `supabase/migrations/20260902000002_exact_billing_expand.sql` — exact SQL
  helpers, Phase 3 financial policies, authenticated exact RPC conventions,
  and invoice boundary patterns.
- `src/components/atomic-crm/providers/types.ts` — custom provider request and
  response contracts and registered billing resources.
- `src/components/atomic-crm/providers/supabase/dataProvider.ts` — production
  RPC translation, strict decoding, and exact financial reconciliation.
- `src/components/atomic-crm/providers/fakerest/dataProvider.ts` — deterministic
  provider-parity implementation required for demo and UI fixtures.

### Existing UI and exact calculation assets

- `src/components/atomic-crm/billing-accounts/BillingAccountShow.tsx` — current
  responsive account-detail composition and extension point.
- `src/components/atomic-crm/billing-accounts/BillingAccountEvidencePanel.tsx`
  — existing private evidence upload, status, access, and audit presentation.
- `src/components/atomic-crm/billing-accounts/billingAccess.ts` — presentation
  capability map and sensitive-query persistence exclusion.
- `src/components/atomic-crm/financial/exactMoney.ts` — sole TypeScript exact
  USD/rate/rounding authority.
- `src/components/atomic-crm/invoices/invoiceCalculations.ts` — reusable exact
  arithmetic patterns, but invoice issuance remains out of Phase 4.
- `supabase/tests/support/billing-security-fixtures.sql` — reusable identities,
  accounts, roles, and evidence fixture foundation.
- `supabase/tests/database/65_exact_billing_conversion.sql` — live PostgreSQL
  exact-money/RPC test conventions Phase 4 must extend.

No external specifications were introduced during discussion.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- `BillingAccountShow` already provides separate desktop/mobile compositions
  and account-scoped extension slots suitable for agreements and monthly close.
- `BillingAccountEvidencePanel` already owns private upload, inspection-state,
  transient access capability, and evidence access-history presentation.
- `exactMoney.ts` supplies strict USD money/rate parsing, exact multiplication,
  named rounding, canonical serialization, and stable financial error codes.
- Phase 2 SQL fixtures and capability helpers provide representative operator,
  reviewer, auditor, customer, and automation principals for Phase 4 tests.

### Established Patterns

- Supabase owns production authority; FakeRest mirrors externally observable
  semantics with deterministic, non-network financial fixtures.
- Financial writes use closed custom RPC contracts with strict response
  decoding rather than generic React Admin table CRUD.
- Browser capability checks affect presentation only; RPC and PostgreSQL
  authorization recheck caller, account scope, policy, and immutable state.
- Billing/evidence query keys are excluded from mobile offline persistence.
- New financial migrations and tests must enter all six inherited blocking
  financial-gate identities and the accepted upgrade registry.

### Integration Points

- New agreement and revenue-period panels attach to billing-account detail and
  register semantic resources/custom methods through the shared provider type.
- New SQL tables and RPCs extend the existing billing organization/account,
  role capability, audit-event, private evidence, and exact-policy schemas.
- Calculation preview reuses exact TypeScript primitives for display
  verification while treating the frozen server result as authoritative.
- Provider-parity fixtures and real PostgreSQL/Auth tests extend the existing
  billing contract registries rather than creating isolated one-off harnesses.

</code_context>

<specifics>
## Specific Ideas

- A hybrid explanation should read like: “10% of $8,250.00 is $825.00; the
  $500.00 minimum does not apply; final amount $825.00,” while retaining the
  exact reduced ratio and intermediate values in audit detail.
- A minimum-only close keeps a visible “revenue evidence unresolved” exception
  even after its calculation is approved.
- A prior-period comparison never substitutes missing history with `$0.00`.
- Agreement activation and calculation approval screens should show the exact
  source evidence and immutable fingerprint being authorized.

</specifics>

<deferred>
## Deferred Ideas

- Invoice creation, issue timing, true-up/credit document placement, and
  delivery are Phase 5.
- Customer self-service revenue submission and attestation UI is Phase 8;
  Phase 4 implements the secured operator-side domain and provider contracts it
  will later call.
- Cross-account monthly billing operations and collections workspace is Phase 9.
- Payment-provider operations, settlement, and reconciliation remain Phases 5
  and 6.

</deferred>

---

*Phase: 04-agreements-revenue-evidence-and-calculation-close*
*Context gathered: 2026-09-04*
