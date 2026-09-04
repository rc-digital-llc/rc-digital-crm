---
phase: 04
slug: agreements-revenue-evidence-and-calculation-close
status: approved
shadcn_initialized: true
preset: repository-existing
created: 2026-09-04
---

# Phase 04 — UI Design Contract

> Visual and interaction contract for account-scoped agreement and monthly-close workflows.

---

## Design Intent

Phase 4 extends the existing billing-account detail page. It should feel like a
calm financial review surface: dense enough to prove every decision, but ordered
so an operator sees the blocking state and next permitted action before opening
audit detail. Do not create a dashboard, wizard shell, or separate visual brand.

The screen hierarchy is evidence first, result second, action last. Color never
communicates a financial or approval state by itself; every badge has literal
text and every block includes a reason or next action.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | Repository-owned shadcn/ui source components |
| Preset | Existing RC Digital/Twenty design tokens |
| Component library | Radix primitives through `src/components/ui/` |
| Icon library | Lucide React |
| Font | Inter, inherited from `src/index.css` |
| Admin framework | ra-core controllers and repository-owned admin components |

Reuse `Card`, `Badge`, `Alert`, `Button`, `Dialog`, `Sheet`, `Tabs`, `Table`,
`Input`, `Label`, `Select`, `Textarea`, `Skeleton`, and existing admin/reference
components. Do not install or copy a new registry block.

---

## Information Architecture

`BillingAccountShow` remains the route owner. Add two account-scoped sections
after identity/access and before generic evidence history:

1. **Agreement** — active version summary, effective period, formula terms,
   commissionable-revenue definition, signed-source reference, lifecycle state,
   and actions permitted by capability.
2. **Monthly close** — period selector, accepted submission/revision, evidence
   and exception state, exact calculation comparison, approval state, and linked
   late-evidence adjustments.

The existing evidence panel remains the owner of upload, inspection, access,
retention, and access-history behavior. Phase 4 links selected evidence records
from agreement/submission actions; it does not duplicate file cards or download
logic.

### Desktop composition (≥768px)

- Use the existing `md:grid-cols-[minmax(0,1fr)_320px]` account-detail rhythm.
- Agreement summary spans the main column; lifecycle/source proof uses the
  320px supporting column.
- Monthly close spans both columns. Within it, the period/evidence status and
  calculation preview may use a two-column grid at `xl`, collapsing below it.
- Primary action sits at the end of the reading order, never in a detached
  sticky footer.

### Mobile composition (<768px)

- Preserve the existing `MobileHeader` and `MobileContent` shell.
- Use one stacked column in this order: active agreement → selected period →
  evidence/revision → exceptions → calculation comparison → approval history →
  action.
- No horizontal scrolling is allowed for tables. Convert lifecycle/revision
  rows to bordered definition-list cards below `md`.
- Dialogs that contain more than four fields become full-height `Sheet`
  surfaces on mobile; short reason/confirmation actions may remain dialogs.

---

## Spacing Scale

Declared values use the repository's Tailwind spacing units and are multiples
of 4:

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Icon/text gap, badge internals |
| sm | 8px | Related labels and values, compact row gaps |
| md | 16px | Card padding on mobile, control groups |
| lg | 24px | Card padding on desktop, section groups |
| xl | 32px | Desktop column gap and major subsection separation |
| 2xl | 48px | Reserved page-level separation when needed |

Exceptions: existing 44px minimum controls use Tailwind `h-11`; narrow screens
retain 16px outer padding from `MobileContent`.

---

## Typography

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Body/value | 16px | 400 | 1.5 |
| Supporting/audit text | 14px | 400 | 1.4 |
| Field label | 14px | 500 | 1.4 |
| Section heading | 20px | 600 | 1.35 |
| Account/page heading | 24px | 600 | 1.25 |
| Financial result | 24px | 600, tabular numerals | 1.25 |

Use `font-mono` only for immutable fingerprints, canonical IDs, and exact ratio
audit detail. Use `tabular-nums` for money and deltas. Never use monospace for
ordinary prose or primary actions.

---

## Color

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | Existing `background` / white / `#111113` dark | Page and primary surfaces |
| Secondary (30%) | Existing `muted`, `#fafafa`, `#1c1c1e` dark | Supporting cards, audit detail, comparison rows |
| Brand accent (10%) | Existing `#0f3460` token family | Active navigation, neutral information alerts, selected period |
| Success | Emerald token family | Accepted, active, approved only |
| Warning | Amber token family | Needs review, missing evidence, held, minimum exception |
| Destructive | Existing destructive / `#e94560` family | Rejected, terminated, validation failure; never routine cancel |

Accent is reserved for selected navigation/period state, primary safe actions,
and neutral information emphasis. Success, warning, and destructive colors must
always be paired with visible text and, where actionable, a reason/next step.

---

## Status Vocabulary

Use the following user-facing labels exactly; internal enum names may differ:

| Domain | States shown |
|--------|--------------|
| Agreement | Draft, Awaiting review, Active, Paused, Superseded, Terminated |
| Revenue period | Open, Needs evidence, Under review, Ready to close, Closed on minimum, Closed |
| Submission | Submitted, Accepted, Correction requested, Rejected, Held, Superseded |
| Exception | Open, In review, Resolved |
| Calculation | Preview, Needs approval, Approved, Auto-approved, Held, Adjustment pending |
| Adjustment | True-up, Credit candidate, Held for contract review |

Do not use “paid,” “issued,” or “reconciled” in Phase 4. Those states belong to
later invoice/payment phases.

---

## Interaction Contract

### Agreement actions

- **Create new agreement:** opens a structured draft form. Group fields as
  lifecycle/dates, formula terms, commissionable-revenue rules, evidence policy,
  and signed-source evidence.
- **Submit for review:** shows a read-only summary and missing-field validation.
  On success, return to the agreement panel with “Awaiting review.”
- **Activate agreement:** confirmation names customer, effective period,
  formula, signed evidence filename/hash prefix, and self-approval status when
  applicable. The button label is `Activate agreement`.
- **Amend agreement:** creates a new draft prefilled for convenience but clearly
  labels the active version as unchanged. Never present an editable active form.
- **Pause/terminate:** requires a reason; copy states that historical closes are
  unaffected.

### Revenue and review actions

- **Add revenue revision:** requests exact gross/excluded USD values, provenance,
  source identifier, attestation when applicable, and selected clean evidence.
- **Review revision:** the comparison shows the prior revision if present. The
  operator chooses Accept, Request correction, Reject, or Hold and must enter a
  reason for every outcome except a clean Accept when policy allows it.
- **Approve minimum close:** appears only after the deadline when the agreement
  permits it. The confirmation must state that evidence remains unresolved and
  a later true-up/credit calculation may be required.
- **Close revenue period:** enabled only when the support-safe read model reports
  it eligible. Server rejection always wins over client state and refreshes the
  period before displaying the returned safe reason.

### Calculation actions

- **Preview calculation:** is safe and non-authoritative. Show fixed/minimum and
  percentage candidates, winning branch, exact prior-period delta, provenance,
  policy versions, and all anomaly checks.
- **Approve calculation:** confirmation names the final amount, agreement
  version, period, input fingerprint prefix, and whether approval is manual.
  Label the action `Approve calculation`.
- **Stale or changed input:** dismisses no state. Show `This preview is no longer
  current. Refresh the period and review the new calculation before approving.`
- **Linked adjustment:** display original result, actual result, signed delta,
  reason, and contract treatment. Do not imply an invoice/credit has been issued.

All mutation buttons disable while submitting, retain their label with an
adjacent spinner or progress text, and prevent double submission. A failed
command keeps the form open with user-entered non-sensitive fields intact.

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Agreement empty heading | `No agreement is active` |
| Agreement empty body | `Create a draft and attach the signed commercial terms before this account can enter monthly close.` |
| Agreement primary CTA | `Create agreement draft` |
| Revenue empty heading | `No revenue period for this month` |
| Revenue empty body | `Create the period from the active agreement to begin evidence review.` |
| Revenue primary CTA | `Create revenue period` |
| Missing evidence alert title | `Revenue evidence is unresolved` |
| Missing evidence alert body | `Assign the exception and obtain verifiable evidence. The system will not estimate revenue.` |
| Minimum confirmation title | `Approve minimum-only close?` |
| Minimum confirmation body | `This keeps the evidence exception open. Accepted late evidence will create a linked true-up or credit calculation without changing this close.` |
| Calculation empty heading | `Calculation is not ready` |
| Calculation empty body | `Resolve the listed agreement, evidence, or close-policy requirements first.` |
| Generic safe error | `The action could not be completed. Refresh the account and review the reason before trying again.` |
| Stale preview error | `This preview is no longer current. Refresh the period and review the new calculation before approving.` |
| Offline state | `Reconnect to view or change agreement, evidence, and calculation details.` |

Never use “Something went wrong” alone. Include the safe problem category and a
recovery action without exposing raw SQL, payloads, object paths, or cross-tenant
existence.

---

## Component and State Matrix

| Surface | Loading | Empty | Error | Permission | Success |
|---------|---------|-------|-------|------------|---------|
| Agreement panel | Heading + two card skeletons | Empty copy + create CTA if permitted | Safe alert + retry | Read-only summary or no CTA | Active version card + history |
| Revenue period | Period selector skeleton + status card | Empty copy + create CTA | Safe alert + refresh | Read-only period | Revision/evidence/exception summary |
| Calculation preview | Candidate/result skeleton | “Calculation is not ready” with blockers | Stale/contract alert + refresh | Preview may remain read-only | Exact comparison + approval state |
| Adjustment | Inline row skeleton | Omit section | Safe alert, preserve original result | Read-only | Linked signed delta card |

Never replace the full account page with a spinner after the account record has
loaded. Each Phase 4 section owns its loading and error boundary.

---

## Accessibility and Input Safety

- Maintain a single visible `h1`; Phase 4 panel titles are `h2`, card titles `h3`.
- Every status change is announced through the existing notification mechanism;
  blocking inline alerts use `role="alert"` only when newly introduced.
- Dialog/Sheet titles and descriptions are required; initial focus lands on the
  first invalid field or heading, and focus returns to the launching control.
- Money inputs accept decimal USD display text for operator entry but convert
  through the exact parser before any provider command. Validation never relies
  on `input type="number"` floating-point values.
- Date fields expose the agreement timezone and period-boundary rule beside the
  control. Do not silently convert a displayed date to the browser timezone.
- All actionable controls are at least 44×44px. Icons are decorative when paired
  with text and receive `aria-hidden="true"`.
- Badge color is never the only state cue. Amount deltas include sign and words
  such as `increase`, `decrease`, or `no change`.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| Repository-owned shadcn/ui | Existing primitives only | Normal source review and tests |
| Third-party registries | None | Any future addition requires explicit view + diff review before use |

No registry install, remote component copy, or new design-system dependency is
authorized by this UI contract.

---

## Rendered Surface Gate

- Before PR readiness, run the shared `source` surface receipt at 320px and a
  desktop viewport for the agreement and monthly-close flows.
- Before merge, run the full five-viewport `preview` receipt against an immutable
  deployed preview and require the exact Phase 4 freshness marker.
- After separately authorized release, run a new `production` receipt against
  the canonical customer-facing URL and verify the same marker.
- Preserve JSON receipts and screenshot hashes. Name residual VoiceOver,
  keyboard, and physical-device coverage instead of claiming full accessibility.

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS — exact actions, empty states, safe errors,
  and recovery copy are specified.
- [x] Dimension 2 Visuals: PASS — account-scoped hierarchy and desktop/mobile
  compositions are explicit.
- [x] Dimension 3 Color: PASS — existing tokens are reused and every semantic
  color has a text equivalent.
- [x] Dimension 4 Typography: PASS — role, size, weight, line height, numeric,
  and monospace usage are bounded.
- [x] Dimension 5 Spacing: PASS — a 4px scale, 44px controls, grid behavior, and
  mobile padding are defined.
- [x] Dimension 6 Registry Safety: PASS — existing repository components only;
  no third-party block or package is introduced.

**Approval:** approved 2026-09-04 after inline six-dimension verification
