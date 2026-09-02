---
phase: 2
slug: tenant-role-and-evidence-security
status: approved
shadcn_initialized: true
preset: new-york-radix-lucide
created: 2026-09-01
reviewed_at: 2026-09-01
---

# Phase 2 — UI Design Contract

> Visual and interaction contract for billing-account, role, automation, and
> evidence-security administration. Generated in `--auto` mode from the locked
> phase context, technical research, and existing RC Digital design system.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn, repository-owned mutable components |
| Preset | new-york style, Radix base, Lucide icons |
| Admin layer | ra-core + `@/components/admin` wrappers |
| Component library | `@/components/ui` shadcn/Radix primitives |
| Icon library | Lucide React |
| Font | Inter with existing system fallbacks |
| Styling | Tailwind CSS v4 and existing RC Digital/Twenty tokens |

No new visual framework, font, registry, or global theme is introduced. Admin
inputs come from `@/components/admin`; pure presentation comes from
`@/components/ui`.

## Product Surfaces

| Surface | Primary user | Purpose |
|---------|--------------|---------|
| Billing account list | Billing administrator/operator/reviewer/auditor | Scan customer, status, responsible owner, contact readiness, and access health. |
| Billing account create/edit | Billing administrator/operator | Create or update the explicit account boundary and authorized contacts. |
| Billing account detail | All authorized staff roles | Read the account boundary first, then inspect Contacts, Access, Automation, and Evidence tabs according to capability. |
| Role assignment panel | Billing administrator | Assign/end scoped staff roles without deleting history. |
| Automation panel | Billing administrator/auditor | See principal status and exact account/command/provider/policy/action limits; manage only when authorized. |
| Evidence security panel | Billing administrator/reviewer/auditor/operator as allowed | See metadata, quarantine/clean/rejected state, retention/hold state, and access history without exposing object paths or signed URLs. |

Customer portal screens are out of scope. A bound billing contact is managed by
staff in this phase and receives no general CRM navigation.

## Visual Hierarchy

The billing-account name and boundary/status summary are the focal point on
list and detail screens. The first detail card presents, in order: customer
name, billing status, responsible owner, organization/account identifier label,
and primary billing contact. Secondary tabs hold Contacts, Access, Automation,
and Evidence so permission administration never competes visually with the
account identity.

On create/edit, the page reads top-to-bottom as:

1. Account identity and status.
2. Responsible RC Digital owner.
3. Authorized billing contacts.
4. Explicit access summary.
5. Sticky action toolbar.

Use text labels beside all security icons. Icon-only buttons are permitted only
for familiar close/back controls and require an accessible name and a 44×44px
hit area.

## Responsive Layout

### Desktop (768px and wider)

- List: full-width card/table with customer, status badge, responsible owner,
  primary contact, and last updated columns; search and status/owner filters sit
  above the table.
- Detail: two-column composition. The account/detail region is flexible; a
  320px access-summary rail shows effective roles, contact authorization, and
  security warnings.
- Create/edit: two columns inside one card. Account identity/contacts occupy the
  larger column and ownership/access summary the smaller column.
- Tabs stay in one row only when they fit; otherwise use horizontal scrolling,
  never compressed unreadable labels.

### Mobile (below 768px)

- Register a dedicated mobile resource in `MobileAdmin`.
- List: `InfiniteListBase` with one account card per row. Each card shows name,
  status, owner, primary contact method, and one chevron/labelled detail target.
- Detail/edit: `MobileHeader` + `MobileContent`, one column, cards stacked in the
  same semantic order as desktop.
- Contacts, role assignments, automation grants, and evidence history use
  stacked rows; no horizontal data table is required to understand them.
- Sticky action regions must leave the existing mobile navigation unobscured.
- Billing queries and sensitive evidence metadata are excluded from the
  persisted offline query cache or cleared on logout/permission change.

## Spacing Scale

Declared values (multiples of 4 only):

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Icon/text gap and compact badge internals |
| sm | 8px | Control groups and row padding |
| md | 16px | Default field/card internal spacing |
| lg | 24px | Card and section padding |
| xl | 32px | Desktop column and major group gaps |
| 2xl | 48px | Major page section breaks when needed |
| 3xl | 64px | Reserved page-level separation; do not use inside forms |

Exceptions: none. The required 44×44px mobile interaction floor is a target-size
contract, not a spacing token.

## Typography

Use exactly these four sizes and two weights within new Phase 2 surfaces:

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Label/meta | 14px | 400 | 1.5 |
| Body/control | 16px | 400 | 1.5 |
| Section heading | 20px | 600 | 1.2 |
| Page/account heading | 24px | 600 | 1.2 |

Security state and identifiers use label/meta size but never an all-caps body
paragraph. Long organization/account identifiers wrap or truncate with a
labelled copy control; they never force horizontal page overflow.

## Color

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `#ffffff` / dark `#111113` | Page background and primary reading surface |
| Secondary (30%) | `#fafafa`, `#f5f5f5` / dark `#1c1c1e`, `#2c2c2e` | Cards, sidebar, secondary panels, inactive tabs |
| Accent (10%) | `#0f3460` | Active detail tab indicator, selected account boundary, keyboard focus ring, and one primary security-summary emphasis per screen |
| Highlight | `#e94560` | Existing active sidebar indicator only; do not spread into ordinary controls |
| Destructive | `#e94560` | Disable/end confirmations and blocked/rejected security states only |
| Success | `#10b981` | Clean evidence and active/verified states with text labels |
| Warning | `#f59e0b` | Quarantined, expiring, on-hold, or incomplete states with text labels |

Accent is reserved for active detail tabs, selected account-boundary emphasis,
focus rings, and the primary security-summary emphasis. It is not applied to
all links, buttons, badges, or icons. Status is always communicated by label and
icon/shape as well as color.

## Component Inventory

Use installed, repository-owned components only:

- Admin: `List`, `DataTable`, `CreateBase`, `EditBase`, `ShowBase`, `Form`,
  `TextInput`, `SelectInput`, `ReferenceInput`, `ArrayInput`,
  `SimpleFormIterator`, `SearchInput`, `CreateButton`, `SaveButton`, and
  `CancelButton`.
- UI: `Card`, `Badge`, `Tabs`, `Alert`, `Button`, `Dialog`, `Sheet`,
  `Separator`, `Skeleton`, and `Tooltip`.
- Mobile: `MobileHeader`, `MobileContent`, `MobileBackButton`, existing infinite
  list/pagination patterns.
- Icons: building/account, shield/access, bot/automation, file-lock/evidence,
  circle-alert/warning, and chevron navigation icons from Lucide.

Do not add a generic “permissions dashboard” component layer. Feature-local
components should express billing concepts and reuse admin/UI primitives.

## Account Form Contract

### Account identity

- Customer name — required text.
- Billing status — required select with `active`, `on_hold`, and `closed`; labels
  are “Active”, “On hold”, and “Closed”.
- Responsible RC Digital owner — required active-user reference.
- Organization boundary — visible read-only label on edit/detail; derived by
  the server on create and never accepted as free text.

### Authorized billing contacts

- Repeatable contact rows: full name, email, phone, preferred contact method,
  active state.
- Preferred method choices: Email, Phone, Text.
- At least one active contact is recommended but not required by this phase;
  show a warning banner when none exists.
- An authenticated-user binding is an admin-only secondary control and displays
  “Not linked” by default. Do not expose raw Auth user identifiers in exports.

### Access summary

- Show effective staff roles with scope labels: “All RC Digital billing
  accounts” or the current customer name.
- Show role descriptions, not only enum names.
- Ending an assignment requires a reason and effective timestamp; there is no
  delete affordance.
- Automation rows show status and a readable sentence summarizing each exact
  grant. Raw provider references are masked and never included in list export.

## Evidence Security Contract

- Evidence list rows expose filename, kind, size, quarantine/inspection state,
  retention date, hold state, uploader identity label, and timestamp.
- Storage bucket, internal object path, access token, and signed URL are never
  rendered.
- “Open evidence” is available only for clean, active, non-expired, non-held
  objects and returns a short-lived capability. The UI does not cache or copy it
  into analytics.
- Quarantined rows show: “Inspection required before this file can be opened.”
- Rejected rows show the stable result/reason category, not malware payload or
  scanner internals.
- Evidence access history shows actor type/label, purpose, result, and time; it
  contains no URL or secret-bearing provider payload.

## Copywriting Contract

| Element | Copy |
|---------|------|
| Primary list CTA | Create billing account |
| Create form CTA | Create billing account |
| Edit form CTA | Save account changes |
| Add contact CTA | Add billing contact |
| Add staff role CTA | Assign billing role |
| Add automation CTA | Add automation principal |
| Empty state heading | No billing accounts yet |
| Empty state body | Create the first billing account to define its owner, billing contacts, and access boundary. |
| Filter-empty state | No billing accounts match these filters. Clear a filter or search for another customer. |
| Load error | Billing accounts could not be loaded. Check your connection and try again. |
| Save error | Account changes were not saved. Review the highlighted fields and try again. |
| Authorization error | You do not have access to this billing account. Return to the billing account list or ask a billing administrator for access. |
| Quarantine message | Inspection required before this file can be opened. |
| Disable account action | Disable billing account |
| Disable confirmation | Disable this billing account? New billing actions will stop, but its history and evidence will remain available to authorized reviewers. Enter a reason to continue. |
| End role action | End role assignment |
| End role confirmation | End this billing role assignment? Access ends at the selected time and the assignment remains in the audit history. Enter a reason to continue. |
| Disable automation action | Disable automation principal |
| Disable automation confirmation | Disable this automation principal? Its future commands will be rejected; prior command and audit history will remain. Enter a reason to continue. |

Buttons may use “Back to billing accounts” or “Keep assignment” inside
confirmation dialogs. Do not label a primary action only “Submit”, “OK”,
“Save”, “Create”, or “Cancel”.

## Interaction States

- Loading: preserve page structure with skeleton rows/cards; do not flash an
  empty state while access is resolving.
- Unauthorized: return the stable authorization copy above and no record
  details.
- Disabled/ended: records remain readable according to role, use an explicit
  badge, and remove mutation controls.
- Concurrent/stale edit: surface a failed save and reload the current record;
  never imply success.
- Role change: refresh identity/access queries and remove inaccessible billing
  data from client cache.
- Offline: account mutations and evidence access are unavailable; show
  “Reconnect to manage billing security.” Never queue privileged mutations.

## Accessibility and Input Safety

- Every input has a visible label and associated error text.
- Required state is conveyed in text/semantics, not color alone.
- Keyboard order follows the visual form order; focus returns to the triggering
  control after dialogs/sheets close.
- The first invalid field receives focus after validation.
- Critical mobile controls are at least 44×44 CSS px and remain unobscured by
  sticky/mobile navigation.
- Account and contact emails/phones use semantic input types and retain readable
  error messages at 320px.
- Status badges include readable text. Tooltips supplement, never replace,
  essential security copy.
- No two-dimensional page overflow at 320px or landscape mobile.

## Export and Telemetry Contract

- The billing-account exporter allowlists customer name, billing status,
  responsible owner display name, billing contact name/email/phone/preferred
  method, and active state.
- It excludes organization/account UUIDs unless explicitly required for an
  authorized audit export, Auth user IDs, role-assignment internals, provider
  references, evidence paths/hashes, signed URLs, tokens, and audit detail JSON.
- Billing UI analytics may record stable screen/action names and success/failure
  booleans only. Do not send contact fields, account IDs, evidence metadata,
  grant boundaries, error bodies, or provider values to PostHog.

## Rendered Surface Gate

- Source contract covers `/billing_accounts` plus one create/detail route at
  320×568 and 1280×800.
- Preview and production contracts cover 320×568, 360×800, 393×852, 430×932,
  and 740×360.
- Critical targets: “Create billing account”, mobile account detail target,
  “Add billing contact”, form primary action, and mobile back/menu controls.
- Forbidden visible conditions: unexpected modal/sheet, horizontal page
  overflow, untriggered destructive confirmation, and evidence URL/path text.
- Preview/production receipts require the exact Phase 2 freshness marker and
  expected serving/canonical policy for the deployed environment.
- Preserve receipt JSON and screenshot hashes. Manual residual coverage: one
  keyboard pass, screen-reader semantics spot-check, and real iOS Safari plus
  Android Chrome for a high-risk release.

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | Existing installed primitives only: alert, badge, button, card, dialog, select, separator, sheet, skeleton, table, tabs, tooltip | official configured registry; no new block fetched — 2026-09-01 |
| Third-party | none | PASS — no third-party registry access |

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved 2026-09-01
