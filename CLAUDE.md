# CLAUDE.md

## Project Overview

This is a lightweight workflow hub for a video production pipeline.

The system manages:
- Admin
- Guest (content talent)
- Video Editor

Videos are NOT stored in Supabase.
All video files are stored in Baidu 网盘.
This app only stores Baidu share links and extraction codes.

The system is:
- Task-driven
- Run-based (each workflow run has a `run_ref_id`)
- Client-side Supabase only
- Minimal and fast to build
- No heavy abstractions
- No over-engineering

---

## Core Architecture

**Frontend:**
- Next.js (App Router)
- Client-side Supabase SDK only
- No server actions required for MVP
- No Supabase Storage

**Backend:**
- Supabase Auth
- Supabase Postgres
- RLS enforced security

**External:**
- Baidu Netdisk for video file sharing

---

## Database Tables (Do Not Change Without Explicit Instruction)

Tables:
- `profiles`
- `references`
- `scripts`
- `deliverables`
- `tasks`

The schema has already been defined in SQL editor.
Never redesign schema unless explicitly instructed.

---

## Roles

There are exactly three roles:
- `admin`
- `guest`
- `editor`

Role logic must be enforced by Supabase RLS — not frontend-only checks.

---

## Workflow Model

The system is task-driven. Do NOT hardcode workflow transitions in UI logic.

Instead:
1. Mark current task DONE
2. Insert next task

**Task types:**
- `REVIEW_REFERENCE`
- `REVIEW_SCRIPT`
- `RECORD_VIDEO`
- `EDIT_VIDEO`
- `REVIEW_FINAL_CUT`

**Task status values:**
- `OPEN`
- `DONE`
- `BLOCKED`

---

## run_ref_id

Each workflow run is identified by `references.run_ref_id`.

Rules:
- Required
- Unique
- Human-readable
- Used as main operational reference

All admin UI should allow searching by `run_ref_id`.
Never rely on UUIDs for business communication.

---

## Deliverables Model

Videos are NOT uploaded to Supabase.

`deliverables` table stores:
- `type` (`'raw'` or `'final'`)
- `baidu_share_url`
- `baidu_extract_code`
- `file_label`

The system only tracks metadata.

Do not implement Supabase Storage.
Do not generate signed URLs.
Do not attempt to embed Baidu video player.

---

## UI Structure

Keep UI extremely minimal.

**Pages required:**

`/login`
- Email/password login
- Signup
- Create profile row on signup (default role = `guest`)

`/`
- Redirect by role:
  - `admin` → `/admin/inbox`
  - `guest` → `/guest/inbox`
  - `editor` → `/editor/inbox`

`/admin/inbox`
- Show OPEN tasks
- Separate: unclaimed admin tasks / my tasks
- Claim button
- Link to run detail page

`/admin/run/[run_ref_id]`
- Single control center for a run:
  - Reference info
  - Script
  - Deliverables (raw + final)
  - Tasks
- Admin actions:
  - Set reference PARSED
  - Approve reference (create script)
  - Approve script (create RECORD_VIDEO task)
  - Approve final cut (mark DONE)

`/guest/inbox`
- Show tasks assigned to guest

`/guest/record/[scriptId]`
- Teleprompter display
- Submit RAW Baidu link + extraction code
- Insert deliverable (`type=raw`)
- Mark RECORD_VIDEO task DONE
- Create EDIT_VIDEO task

`/editor/inbox`
- Show tasks assigned to editor

`/editor/edit/[scriptId]`
- Display RAW deliverable
- Submit FINAL Baidu link + extraction code
- Insert deliverable (`type=final`)
- Mark EDIT_VIDEO DONE
- Create REVIEW_FINAL_CUT task

---

## Coding Rules

### 1. Keep It Minimal
- No component libraries
- No complex state machines
- No custom hooks unless necessary
- Inline styles acceptable
- Prioritize clarity over abstraction

### 2. Client-Side Supabase Only
- Use: `createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)`
- Never use service role key in frontend
- Never bypass RLS

### 3. No Supabase Storage
Do not implement:
- `supabase.storage`
- Signed URLs
- Upload buckets

### 4. Do Not Add Features
Do NOT add:
- Multi-tenant org system
- Notifications
- Email sending
- Real-time subscriptions
- Metrics dashboards
- Publishing automation
- Payment logic
- Marketplace logic

This is 1.0 only.

---

## Security Principles

- RLS is the source of truth
- Frontend role checks are for UX only
- Assume users may manipulate client
- Never trust client for permission enforcement

---

## Future Scaling (Do Not Implement Now)

This version intentionally avoids:
- Multi-reference script fusion
- Automatic AI parsing
- Attribution tracking
- Settlement logic
- Decentralized marketplace

Those are Stage 3+ features.

---

## Coding Style

- TypeScript
- Functional components
- Minimal dependencies
- Clear naming
- No unnecessary abstraction

---

## When Modifying Workflow Logic

Always follow this pattern:
1. Update database row state
2. Mark current task DONE
3. Insert next task
4. Refresh UI

Never skip inserting next task.

---

## What This System Is

This is:
- A workflow operating system
- A metadata coordination hub
- A task-based state machine
- A lightweight content pipeline manager

This is NOT:
- A video hosting platform
- A marketplace engine
- A CRM
- A publishing tool

---

## Development Priority Order

1. Auth + profile creation
2. Admin run creation (`run_ref_id`)
3. Admin inbox + claim logic
4. Script approval flow
5. Guest RAW submission
6. Editor FINAL submission
7. Admin final approval

**Stop there. Do not build beyond this unless instructed.**
