# ExamPrep — Architecture & Build Plan

This file tracks the intended structure so each step slots into the right place.
Folders already exist in the repo; files inside them are added step by step.

## Stack
Next.js 14 (App Router) · TypeScript · Tailwind CSS · shadcn/ui · PostgreSQL · Prisma · NextAuth.js

## Route map

```
src/app/
├─ (auth)/                      # public, unauthenticated
│  ├─ login/
│  ├─ register/
│  ├─ forgot-password/
│  ├─ reset-password/
│  └─ access/                    redeem the rotating guest code
├─ (student)/                   # STUDENT/ADMIN; GUEST reaches subjects/ + results/ only
│  ├─ dashboard/                 overview: progress, best/avg score, resume
│  ├─ subjects/                  browse published+active subjects
│  ├─ subjects/[slug]/           subject detail -> "Start Exam" / "Retake"
│  ├─ results/[attemptId]/       score + full review + mistake filter
│  ├─ history/                   all past attempts, trend chart
│  └─ profile/                   edit profile, change password
├─ exam/[attemptId]/            # CBT runner — deliberately OUTSIDE (student) so it
│                               #   renders its own focused chrome with no sidebar
├─ (admin)/admin/                requires ADMIN session
│  ├─ dashboard/                 KPIs: users, attempts, subjects
│  ├─ subjects/  , /[id]/        CRUD, publish/activate toggle
│  ├─ subjects/[id]/questions/   question + option CRUD, CSV import
│  ├─ topics/                    topic/category CRUD
│  ├─ home/                      landing-page CMS: copy, sections, ordering, SEO
│  ├─ access/                    guest code: view, reset/revoke, cap, retention
│  ├─ users/                     user list, role/activation management
│  ├─ attempts/                  browse all attempts
│  └─ analytics/                 subject stats, score distributions
└─ api/
   ├─ auth/[...nextauth]         NextAuth credentials provider
   ├─ auth/register              student self-registration
   ├─ auth/forgot-password       issues reset token + email
   ├─ auth/reset-password        consumes token, sets new password
   ├─ subjects, /[slug]          student-facing read endpoints (published+active only)
   ├─ attempts                   POST: start or resume an attempt
   ├─ attempts/[id]              GET: runner state (no answer key)
   ├─ attempts/[id]/answers      PUT: autosave one question's selection
   ├─ attempts/[id]/flags        PUT: flag / unflag a question
   ├─ attempts/[id]/submit       POST: server-side grading, result frozen
   ├─ user/profile, /progress    profile update, dashboard stats
   ├─ guest/access               POST: check a code and say why it failed (public)
   ├─ admin/guest-access         GET summary; POST reset / toggle / cap / purge
   ├─ admin/home                 GET/PATCH landing-page settings (partial, strict)
   ├─ admin/home/blocks          POST create, PATCH reorder one section
   ├─ admin/home/blocks/[id]     PATCH / DELETE a single block
   └─ admin/...                  admin-only CRUD + CSV import + analytics
```

## Server-side modules
```
src/server/
├─ services/       # business logic
│  ├─ attempts.ts   attempt lifecycle: start/resume, expiry, autosave, flags, runner state
│  ├─ grading.ts    server-side marking + UserProgress recalculation
│  ├─ results.ts    submitted-attempt review payload (answer key lives here, not earlier)
│  ├─ progress.ts   student dashboard + history reads (session-scoped)
│  ├─ subjects.ts   slug uniqueness, active-question counting
│  ├─ questions.ts  option reconciliation
│  ├─ home.ts       landing-page content: defaults, live stat metrics, settings upsert
│  ├─ guest-access.ts  rotating code: cached reads, lazy roll, redemption, retention
│  ├─ analytics.ts  admin statistics
│  └─ audit.ts      non-throwing AuditLog writer
└─ validators/      # zod schemas shared by API routes + forms
src/lib/
├─ prisma.ts        # PrismaClient singleton
├─ auth.ts          # NextAuth config (credentials provider, session callbacks)
├─ rbac.ts          # requireUser/requireAccount/requireAdmin (+ API equivalents)
├─ home-icons.ts    # allow-listed Lucide icons for landing-page blocks
└─ utils.ts         # cn() and small helpers
src/middleware.ts     # route protection — MUST be under src/, see the constraints below
```

## UI layer
```
src/components/
├─ ui/              # shadcn/ui primitives (button, card, dialog, table, form, …)
│                   #   plus project-level additions: empty-state, stat-card
├─ layout/          # app shell: sidebar, topbar, user menu, mobile nav, page header
│  ├─ app-shell.tsx     sidebar + sticky topbar frame (student & admin)
│  ├─ nav-items.ts      nav definitions + active-route matching
│  ├─ sidebar-nav.tsx   nav list, shared by desktop sidebar and mobile sheet
│  ├─ mobile-nav.tsx    hamburger + slide-out sheet below `lg`
│  ├─ user-menu.tsx     avatar dropdown: profile, admin/student switch, log out
│  ├─ page-header.tsx   title + description + actions row
│  ├─ guest-session-notice.tsx  standing "you're a guest, Nh left" banner
│  └─ page-skeleton.tsx group-level loading.tsx placeholder
├─ auth/            # profile + password forms, sign-out control
├─ home/            # public landing page, all copy read from the database
│  ├─ home-header.tsx            sticky nav with the editable wordmark
│  ├─ home-hero.tsx              badge, headline, sub-heading, one or two buttons
│  ├─ home-stats.tsx             figures band; values already resolved by the service
│  ├─ home-features.tsx          feature card grid
│  ├─ home-steps.tsx             numbered how-it-works row
│  ├─ home-faq.tsx               <details> accordion — no client JS, crawlable collapsed
│  ├─ home-cta.tsx               closing call-to-action panel
│  ├─ home-footer.tsx            tagline + editable link list
│  ├─ home-guest-banner.tsx      "been given a code?" entry point
│  └─ section-heading.tsx        shared heading/sub-heading pair
├─ student/         # student-side surface
│  ├─ start-exam-button.tsx      starts/resumes an attempt, then routes to the runner
│  ├─ results-review.tsx         per-question review + mistake/flag filters
│  ├─ trend-chart.tsx            score-over-time, inline SVG + no client JS
│  └─ history-table.tsx          full attempt history with subject/outcome filters
├─ exam/            # CBT runner
│  ├─ exam-runner.tsx            the engine: selection, skip, flag, autosave, submit gate
│  ├─ exam-timer.tsx             server-anchored countdown, auto-submit at zero
│  └─ question-palette.tsx       numbered grid navigator + state legend
├─ admin/           # admin CRUD surface
│  ├─ subjects-manager.tsx       subject table + search + row actions
│  ├─ subject-form-dialog.tsx    create/edit subject
│  ├─ subject-detail-actions.tsx publish / activate / edit on the detail page
│  ├─ topic-manager.tsx          inline topic add / rename / delete
│  ├─ home-content-manager.tsx   tabbed landing-page editor (one tab per section)
│  ├─ home-settings-card.tsx     per-tab settings form: dirty tracking + partial PATCH
│  ├─ home-block-manager.tsx     one section's rows: add/edit/hide/reorder/delete
│  ├─ home-block-form-dialog.tsx per-kind block editor with icon picker
│  ├─ guest-access-manager.tsx   code display, reset/revoke, cap, retention sweep
│  ├─ questions-manager.tsx      question list, filters, expandable options
│  ├─ question-form-dialog.tsx   question editor (type-aware option set)
│  ├─ csv-import-dialog.tsx      CSV upload, template download, row-error report
│  ├─ users-table.tsx            role + activation management, pagination
│  ├─ attempts-filters.tsx       subject/status/student/guest filters
│  ├─ score-distribution-chart.tsx  CSS-only histogram (no chart library)
│  └─ confirm-dialog.tsx         shared destructive-action gate
├─ theme-provider.tsx / theme-toggle.tsx   # next-themes, light/dark/system
└─ providers.tsx    # SessionProvider + ThemeProvider + Toaster
```

## Data-integrity rules enforced in the admin API
These protect the guarantee that past results stay reviewable forever:

- A subject's `slug` is generated once at creation and never regenerated, so student links keep resolving.
- Publishing is refused unless the subject has at least one **active** question.
- A subject with recorded attempts cannot be deleted (409) — deactivate it instead.
- A question's `subjectId` is immutable.
- A question that has been answered cannot be deleted (409) — deactivate it instead.
- An option referenced by a `UserAnswer` cannot be deleted when a question's options are re-synced.
- Every write is recorded in `AuditLog` through a non-throwing helper, so audit failure never masks the operation.
- An admin cannot change their own role or deactivate their own account, and the last active admin cannot be demoted.
- CSV import is all-or-nothing: any malformed row rejects the whole file with per-line reasons, so a half-imported bank is impossible.

## How the landing-page CMS is put together
Four decisions that explain the shape of the code:

- **One row for the one-off copy, one table for everything repeated.** `HomePage` is a
  singleton (`id = "home"`); stats, features, steps, FAQ entries, and footer links are all
  `HomeBlock` rows discriminated by `kind`. They share a shape — heading, body, position,
  visibility — so one table means one admin API and one manager component instead of five
  near-identical copies. Which optional columns matter per kind is enforced by zod, not by
  the schema, and `kind` is immutable: a block can't move between sections.
- **`HOME_DEFAULTS` is the only copy of the shipped wording.** The `home_page` columns carry
  no database defaults, so Prisma rejects a `create` that forgets a field. The public read is
  pure — with no row it renders `HOME_DEFAULTS` in memory rather than inserting one, so an
  anonymous page view never writes. The admin PATCH upserts, filling untouched fields from
  the same constant.
- **Settings save one tab at a time.** `PATCH /api/admin/home` takes a partial body, so an
  admin editing the hero can't overwrite the FAQ heading with a stale value from when the tab
  was opened. The body is `.strict()`, so a mistyped key is a 400 rather than a silent no-op.
  In the block update schema each per-kind rule only fires when the request actually touches
  the field it guards.
- **Stat figures are counted at render time, and only the ones in use.** A `STAT` block is
  either a literal or a live `HomeMetric`. Counts render even at zero; a percentage with no
  submitted attempts behind it falls back to the block's fixed figure, and is dropped from the
  band if that is blank too — one fewer stat reads better than a stat showing a dash.
  Un-referenced metrics are never queried, so an unused `PASS_RATE` costs nothing per request.

Two knock-on details worth knowing: admin-authored `href`s are validated as links on write
(same-site path, or absolute `http(s):`/`mailto:` — `javascript:` and `//host` are refused),
and icons come from the fixed allow-list in `src/lib/home-icons.ts` so a stored name always
resolves to a component that is actually bundled.

## Exam-engine rules enforced on the server
The exam surface is written so a hostile client gains nothing:

- **No answer key ever reaches a live exam.** `loadExamState` selects options as `{ id, text }`
  only — `QuestionOption.isCorrect` and `Question.explanation` are absent from the payload.
  They first appear in `loadAttemptResult`, which matches on `status: "SUBMITTED"`.
- **Scores are never accepted from the client.** `POST /api/attempts/[id]/submit` ignores its
  request body entirely and grades the stored `UserAnswer` rows.
- **`isCorrect` is not written during the exam**, only at grading — so autosave responses
  can't be probed for correctness one option at a time.
- **Ownership is part of every query**, never a later `if`: an attempt belonging to another
  student is indistinguishable from one that doesn't exist.
- **The question set is snapshotted** as `UserAnswer` rows when the attempt starts, with a
  frozen `order`. Editing or deactivating a question later never alters a past attempt.
- **A submitted attempt is immutable.** Answer and flag writes require `IN_PROGRESS`, and
  submission is claimed with a status-guarded `updateMany`, so concurrent submits can't
  both win and a result can't be re-graded.
- **The clock is the server's.** Remaining time is derived from `startedAt + durationMin`;
  a late save is refused (10s network grace), `timeSpentSec` is capped at the limit, and an
  abandoned expired attempt is auto-graded before a retake can start.
- **Retakes never overwrite.** Each start inserts a new `ExamAttempt` with the next
  `attemptNumber`; `UserProgress` is recomputed from all submitted attempts rather than
  folded in place.

Design tokens live in `src/app/globals.css` (HSL CSS variables, light + dark) and are
mapped to Tailwind in `tailwind.config.ts`. Beyond the shadcn defaults the palette adds
`success` and `warning` roles, used for pass/fail and publish-state signalling.

## How guest access is put together
Account-free practice runs on a shared code that rotates every 12 hours. Five decisions
explain the code:

- **A redeemed code mints a real `User` row with `role: GUEST`.** Every service in the exam
  engine is already keyed on `userId` — attempts, autosave, grading, results, retakes — so a
  guest works through all of it unchanged. The alternative, threading a "guest or student"
  union through those signatures, would have touched every query for no benefit. The row
  carries a synthetic `@guest.invalid` address and the literal `passwordHash`
  `"!guest-no-login"`, and the password provider refuses `role: GUEST` before it ever
  compares, so a guest row can never be signed into with a password.
- **`code`/`expiresAt` and `generation` are separate fields, and that is the whole feature.**
  Rotating the code stops *new* redemptions; bumping `generation` invalidates *existing*
  sessions. So the automatic 12-hour roll leaves the generation alone and lets anyone
  mid-exam finish, while **Reset & revoke** bumps it and signs everyone out at once. One
  integer does the revocation — no session table, no row deletion.
- **Validation costs no query.** A guest's token carries its own expiry and the generation it
  was minted under. The expiry is checked in-process; the generation is compared against a
  module-level cache of the code row with a 30s TTL. That is one query per 30s per server
  process no matter how many guests are online — measured at 0 queries across 500
  validations inside one window. Resetting refreshes the cache in-process immediately, so the
  TTL only bounds propagation to *other* instances.
- **Rotation and retention are lazy — there is no scheduler.** `getActiveCode()` notices an
  elapsed window on its next read and rotates then, claiming the rotation with a guarded
  `updateMany` so concurrent requests can't each generate a different code. The 30-day
  retention sweep hangs off that roll: it runs about twice a day, on a request that is
  already writing, and never on the hot path. An idle deployment does no work at all.
- **Guest activity never counts toward reported figures.** Both `analytics.ts` and the public
  stats band in `home.ts` filter on `user: { role: { not: "GUEST" } }`, so a demo code handed
  to a class cannot move platform averages or pass rates. `/admin/attempts` is the one screen
  that shows guests by default — it is a record of what happened, not a statistic — with a
  filter to separate them, and `/admin/users` excludes them entirely since none of the
  role/activation actions there apply.

Two behaviours worth knowing: disabling guest access **suspends** live sessions rather than
killing them (re-enabling restores any whose 12 hours have not run out), whereas a reset is
permanent. And a redemption cap (`maxRedemptions`, default 500 per code) is what stops a
leaked code minting unbounded guest rows; the slot is claimed with a guarded `updateMany`, so
the cap holds under concurrent redemptions.

## Three framework constraints this app is built around
All were found by running the app; none show up in `tsc`, `next lint`, or `next build`.
**1. `loading.tsx` above a `notFound()` route breaks its 404 status.**
A `loading.tsx` creates a Suspense boundary for its segment *and every segment below it*.
That makes Next flush the response early, committing `200 OK` before the page body runs —
so a later `notFound()` renders the not-found UI but can no longer change the status code.
The content is still correctly withheld, but the response says 200, which quietly breaks
monitoring, crawlers, and any programmatic client.

So `loading.tsx` exists only in segments with no `notFound()` descendants — student
`dashboard/` and `history/`, and admin `dashboard/`, `topics/`, `users/`, `attempts/`,
`analytics/`. **Do not add one to `subjects/` in either area**, or to any ancestor of
`results/[attemptId]` or `exam/[attemptId]`; it would silently turn their 404s into 200s.
To give one of those pages a skeleton, use a `<Suspense>` *inside* the page instead, which
scopes the boundary below the route.

**2. Nav icons cannot cross the server→client boundary.**
Every `NavItem.icon` is a Lucide component — a function. `AppShell` is a server component,
so passing the nav groups to `SidebarNav` / `MobileNav` (both client components) as a prop
throws *"Functions cannot be passed directly to Client Components"* and 500s every page in
the shell. Instead `AppShell` passes only `context: "student" | "admin"`, and the client
components call `navFor(context)` themselves — the icons are then a client-side import and
never get serialised.

**3. `middleware.ts` must live at `src/middleware.ts` in this project.**
Next.js looks for middleware next to the `app` directory. Because this repo keeps `app`
under `src/`, a root-level `middleware.ts` is **silently ignored** — it compiles, it
typechecks, `next lint` is happy, and it never runs. This repo shipped with it at the root,
so route protection was coming entirely from the `requireUser()` / `requireAdmin()` page
guards; nothing was exposed, but the middleware layer was dead code.

To confirm middleware is actually registered, build and check that
`.next/server/middleware-manifest.json` has a non-empty `middleware` key, or watch the dev
server for a `Compiling /src/middleware` line. An empty manifest means it is not running.

## Build order (steps)
1. ✅ Project scaffold + Prisma schema
2. ✅ Auth: NextAuth credentials provider, register/login/logout, password reset, profile
   management, RBAC guards (`requireUser`/`requireAdmin` for pages, `requireApiUser`/
   `requireApiAdmin` for API routes), middleware-based route protection
3. ✅ shadcn/ui primitives + polished app shell (sidebar nav, topbar, user menu, mobile
   sheet, light/dark theming, toasts, empty/loading/error states) — auth screens, profile
   forms, landing page, and both dashboards restyled onto the component library
4. ✅ Admin: subjects, topics, questions/options CRUD + publish/activate — zod validators,
   REST route handlers under `api/admin/*`, and the admin screens (subject table with
   publish/activate/delete, subject detail with topic manager, question editor with a
   dynamic 2–8 option set and correct-answer picker)
5. ✅ Admin: CSV question import (dependency-free RFC 4180 parser, alias-tolerant headers,
   all-or-nothing row validation, find-or-create topics, duplicate skipping), users list with
   role/activation management, attempts browser, analytics (subject performance, pass rates,
   score distribution, most-missed questions) and a live admin overview
6. ✅ Student: subject browsing (published+active only), pre-exam detail screen with per-
   student attempt history, and the CBT exam runner — question palette, flag, skip,
   free navigation, arrow-key shortcuts, server-anchored countdown with auto-submit,
   debounce-free autosave with a visible save state, and a submit gate that counts
   unanswered questions
7. ✅ Server-side grading + submit flow — `gradeAndSubmitAttempt` marks answers against the
   database, writes the frozen result, and recalculates `UserProgress`; a status-guarded
   `updateMany` makes a double submit impossible
8. ✅ Results: score summary, per-question review (your answer vs correct answer vs
   explanation), mistake filter, retake and "another subject" actions
9. ✅ Dashboard + history: headline stats (average, best, pass rate, subjects attempted),
   resumable in-progress attempts, a dependency-free improvement-trend chart, per-subject
   breakdown, and a filterable full attempt history at `/history`
10. ✅ Seed data (`prisma/seed.ts` — re-runnable, grades demo attempts through the real
    grading service, and self-checks its content against the admin validator rules) +
    README rewrite covering setup, demo accounts, marking rules, and the security model
11. ✅ Landing page rebuilt as admin-editable content — a stats band counted live from the
    database, feature cards, numbered how-it-works steps, a JS-free FAQ accordion, a closing
    call to action, and an editable footer, all reorderable and individually hideable from
    `/admin/home`, plus per-page SEO title/description and a `/?preview` bypass so an admin
    can see the page they are editing

12. ✅ Account-free access — a shared code that rotates every 12 hours, redeemable for a
    `role: GUEST` session that can browse subjects, sit timed exams, and read its own result
    review; validated with no per-request database read, revocable in one action, capped
    against leaks, excluded from every reported statistic, and swept after 30 days without a
    scheduled job

Each step will be delivered as working code on top of this structure.
