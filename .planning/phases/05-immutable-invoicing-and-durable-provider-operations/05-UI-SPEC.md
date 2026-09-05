---
phase: 05
slug: immutable-invoicing-and-durable-provider-operations
status: approved
reviewed_at: 2026-09-05
review_mode: inline
shadcn_initialized: true
preset: repository-existing-new-york-neutral
created: 2026-09-05
---

# Phase 05 — UI Design Contract

## Design System

| Property | Value |
|---|---|
| Tool | Repository-owned shadcn/admin source |
| Preset | Existing new-york, neutral CSS variables; no initialization |
| Component library | Radix primitives through src/components/ui |
| Icon library | Lucide React |
| Font | Inter inherited from src/index.css |
| Framework | ra-core and existing desktop/mobile shells |

Evidence: components.json and successful local `npx --no-install shadcn info`
on 2026-09-05 confirm Vite, Tailwind 4 and official registry only.
Reuse Phase 4 layout; defaults here do not change the brand. New phase-owned
text uses exactly two weights (400/600); do not copy Phase 4's third 500 weight.

## Information Architecture and Visual Hierarchy

The invoice identity, exact amount due and next blocking reason are the focal
point. Then show calculation/agreement/period lineage, financial lines, payment
and delivery proof, correction history and permitted actions.

- Account detail gains an Invoices panel linking approved calculations and
  invoice drafts. The account evidence panel retains ownership of downloads.
- Register `/invoices` and `/invoices/:id/show` in BOTH CRM resource trees.
  Draft/issue/correction commands use contextual panels, not unrestricted CRUD.
- Desktop >=768px: existing main plus 320px supporting column. Main holds
  obligation/lines/history; supporting column holds status/proof/action.
- Mobile <768px: one column in the same semantic order. Line items, deliveries
  and allocations become labelled cards, never a squeezed scrollable table.
- Long IDs wrap using min-width zero and overflow-wrap; money remains readable.
  No sticky action/footer overlay. >4-field forms use existing mobile Sheet.

## Spacing Scale

| Token | Value | Usage |
|---|---|---|
| xs | 4px | Icon gaps |
| sm | 8px | Labels and related controls |
| md | 16px | Mobile padding and form groups |
| lg | 24px | Desktop card padding |
| xl | 32px | Desktop column separation |
| 2xl | 48px | Major section separation |
| 3xl | 64px | Reserved page spacing |

Exception: 44px minimum control height/touch width (h-11) is inherited
interaction sizing, not a new spacing token. Mobile outer padding stays 16px.

## Typography

| Role | Size | Weight | Line Height |
|---|---|---|---|
| Supporting text/label | 14px | 400/600 | 1.5 |
| Body/line values | 16px | 400 | 1.5 |
| Section heading | 20px | 600 | 1.3 |
| Invoice heading/amount | 24px | 600 | 1.25 |

Exactly four sizes and two weights. Money uses tabular numerals. Monospace is
reserved for expandable IDs/fingerprints, never ordinary descriptions.

## Color

| Role | Value | Usage |
|---|---|---|
| Dominant 60% | Existing background token, white / #111113 dark | Page |
| Secondary 30% | Existing muted/card, #fafafa / #1c1c1e dark | Proof cards |
| Accent 10% | Existing #0f3460 token family | Primary permitted CTA, selected nav, focus |
| Destructive | Existing #e94560 family | Credit/void/write-off confirmation and errors |
| Semantic warning | Existing amber tokens | Unknown/held/missing-proof text badges |
| Semantic success | Existing emerald tokens | Verified/received states with literal labels |

Accent reserved only for the primary permitted action, selected navigation and
focus indication. Warning/success are semantic status aids, not extra decorative
accents. Color never stands alone as a financial state.

## Status and Interaction Contract

Keep four labelled dimensions: Document (Draft/Issued/Credited/Voided/Written
off), Delivery (Not requested/Queued/Accepted/Delivered/Failed/Outcome unknown),
Payment (Unpaid/Partial/Processing/Received/Returned/Disputed) and Reconciliation
(Not reconciled). Later bank reconciliation is not simulated as complete.

Issued fields are read-only. Correction screens show original, signed delta,
new linked-document identity and reason. Issue confirmation shows account,
period, amount, approved terms, contact snapshot and delivery policy; missing
terms or required approval shows a blocking reason, not a default due date.
Disable duplicate submit while pending. Refresh server state on conflicts,
retain non-sensitive form values on errors and return focus to the invoker.

## Copywriting Contract

| Element | Copy |
|---|---|
| Primary CTA before draft | Create invoice draft |
| Draft action | Review invoice issuance |
| Confirmation action | Issue invoice |
| Correction action | Create linked correction |
| Allocation action | Allocate payment |
| Proof action | View delivery proof |
| Unknown-result action | Check provider outcome |
| Empty heading | No invoices for this account |
| Empty body | Approve a calculation, then create its invoice draft. |
| Missing terms | Payment terms are missing. Add approved terms before issuing this invoice. |
| Stale action | This invoice changed. Refresh its details and review the current state before continuing. |
| Unknown provider outcome | The provider outcome is not confirmed. Check the existing attempt before retrying. |
| Missing notice proof | Required notice proof is missing. Review the delivery exception before requesting payment. |
| Read error | Invoice details could not be loaded. Retry loading the invoice; no billing action was taken. |
| Retry read CTA | Reload invoice |
| Leave form CTA | Keep invoice unchanged |

Financial confirmations are explicit: `Void invoice` says “This preserves the
issued invoice and adds a void event. It does not refund a payment.” Credit and
write-off have their own amounts, original reference, reason and consequence;
server capabilities are independent. No delete action is rendered.

## Accessibility and Privacy

All interactive targets >=44px in both dimensions where applicable, visible
focus, keyboard reachability, labelled inputs, described errors, dialog focus
trap/restore and text statuses. No icon-only destructive actions; every icon
has adjacent text or an accessible name. Announce completion/errors, not raw
provider payloads. No financial requests persisted offline, hosted session URLs
in analytics, or raw proof envelopes in UI.

## Registry Safety

| Registry | Blocks used | Safety gate |
|---|---|---|
| shadcn official | Existing Card, Badge, Alert, Button, Dialog, Sheet, Table, Skeleton, Tabs and admin fields | Existing owned source; no new registry imports |
| Third-party | None | Not applicable |

## Rendered Acceptance

Source: synthetic states at 320x568 and 1440x900, including long invoice ID,
many lines, partial payment, return after success, failed notice, forbidden
correction and outcome-unknown. Assert links, no overflow/occlusion, 44px
controls, no page/console errors and exact source marker.
Preview and production retain the repository's existing five-viewport matrix
and independent immutable URL/canonical URL receipt requirements. Do not claim
screen-reader or physical-device coverage from browser automation alone.

## Checker Sign-Off

- [x] Copywriting: PASS — specific invoice/proof/recovery actions and actionable empty/error states.
- [x] Visual hierarchy: PASS — obligation and blocking reason precede proof/history/actions.
- [x] Color: PASS — explicit 60/30/10 and bounded semantic status usage.
- [x] Typography: PASS — four sizes, two weights and explicit line heights.
- [x] Spacing: PASS — standard scale with justified inherited 44px interaction sizing.
- [x] Registry safety: PASS — existing official owned components, no third-party imports.

Approved 2026-09-05 by inline contract review. This is design-contract review
only, not user commercial approval or rendered implementation proof.
