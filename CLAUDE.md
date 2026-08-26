@AGENTS.md

# RC Digital LLC — Custom CRM

## Project Overview
Custom CRM for RC Digital LLC, a website and app development agency. Built by forking Atomic CRM (marmelab/atomic-crm) with Twenty CRM-inspired UI design.

## Tech Stack
- **Frontend:** React 19 + TypeScript + Vite + TailwindCSS v4 + shadcn/ui
- **CRM Framework:** react-admin (ra-core 5.x) with ra-supabase-core
- **Backend:** Supabase (PostgreSQL 15 + Auth + Storage + Edge Functions + Realtime)
- **Deployment:** Vercel (SPA with SPA rewrites)
- **Analytics:** PostHog
- **Drag/Drop:** @hello-pangea/dnd (Kanban board)
- **Charts:** @nivo/bar

## Key Architecture
- This is a fork of github.com/marmelab/atomic-crm
- Main CRM code lives in `src/components/atomic-crm/`
- Supabase migrations in `supabase/migrations/`
- Edge Functions in `supabase/functions/`
- Data provider uses ra-supabase-core (NOT raw Supabase client for CRUD)

## Custom Tables (Added by RC Digital)
- `projects` — Tracks what we're building for each client
- `project_analytics` — Daily SEO, leads, revenue data per project
- `invoices` — Billing and payment tracking

## Pipeline Stages
Lead → Discovery Call → Proposal Sent → Signed → In Build → Review → Delivered → Paid

## Deal Categories
Website Build, App Development, Redesign, Maintenance, Consulting

## Brand
- Company: RC Digital LLC
- Primary color: #1a1a2e (deep navy)
- Accent: #0f3460 (rich blue)
- Highlight: #e94560 (red-pink for CTAs)
- Font: Inter

## Commands
- `npm run dev` — Start dev server
- `npm run build` — Production build
- `npm run lint` — Run linter
- `supabase db push` — Push migrations to Supabase
- `supabase functions deploy` — Deploy Edge Functions

## Important Patterns
- All DB tables use Row-Level Security (RLS) — never bypass
- Auth uses Supabase Auth with Google OAuth SSO
- react-admin resources use lifecycle callbacks for side effects
- Never use WidthType.PERCENTAGE in tables (breaks Google Docs export)
- Edge Functions use Deno runtime with `@supabase/supabase-js`

## File Structure
```
src/components/atomic-crm/
├── companies/    # Client account management
├── contacts/     # Contact people at companies
├── deals/        # Deal pipeline (Kanban + list views)
├── projects/     # NEW: Project tracking (to build)
├── invoices/     # NEW: Billing (to build)
├── dashboard/    # Dashboard widgets
├── activity/     # Activity timeline
├── notes/        # Contact & deal notes
├── tasks/        # Task management
├── settings/     # App settings
├── providers/    # Data, auth, realtime providers
└── login/        # Auth pages
```

## Active Skills
<!-- Auto-detected by ~/.claude/scripts/select-skills.py — update as the project evolves -->
- react-patterns — component structure and state management
- javascript-testing-patterns — test organization
- frontend-dev-guidelines — UI consistency

## Custom Slash Commands

All custom build commands live in `.claude/commands/`.

### Build Phases (Lead Management + Attribution)

- `/phase10` — Lead Management Database & Backend
- `/phase11` — Lead Management UI
- `/phase12` — Attribution Engine Backend
- `/phase13` — Attribution Dashboard UI
- `/phase14` — Lead + Attribution Testing & Hardening

### Utilities

- `/catchup` — Summarize recent changes
- `/deploy-check` — Pre-deployment verification
- `/pr` — Create a pull request
- `/debug` — Debug issues
- `/refactor` — Refactor code
- `/architecture` — Architecture review
- `/spec` — Write feature specs
- `/resource` — Generate a CRM resource
- `/meeting-prep` — Prep for sales meetings
- `/deal-review` — Review the deal pipeline
- `/email-sequence` — Generate email sequences
- `/battle-card` — Generate battle cards
