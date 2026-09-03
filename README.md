# ExamPrep

A full-stack CBT-style exam preparation platform. Students sit timed, multiple-choice
exams per subject with autosave, flagging, and server-graded results including a
per-question review and correction. Admins manage subjects, topics, questions, and
analytics.

**Stack:** Next.js 14 (App Router) · TypeScript · Tailwind CSS · shadcn/ui · MongoDB · Mongoose · NextAuth.js

## Prerequisites
- Node.js 18.18+ (20 LTS recommended)
- **A reachable MongoDB 6+ deployment** — local, Docker, or Atlas. Nothing below works until
  Mongo answers.
- It must be a **replica set**, not a standalone `mongod`. Starting an exam and submitting one
  are multi-document transactions, and transactions need a replica set. A single-node replica
  set is fine, and Atlas clusters already are one.

<details>
<summary>Quickest local MongoDB via Docker</summary>

```bash
docker run --name examprep-db -p 27017:27017 -d mongo:7 --replSet rs0
docker exec examprep-db mongosh --eval 'rs.initiate()'
```
This matches the default `MONGODB_URI` in `.env.example`. The `rs.initiate()` is what makes it
a replica set — skip it and every exam start fails with *"Transaction numbers are only allowed
on a replica set member or mongos"*.
</details>

## Setup

1. **Install dependencies**
   ```bash
   npm install
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   ```
   Fill in:
   - `MONGODB_URI` — your connection string, **including the database name** in the path.
     Without one, Mongoose silently uses a database called `test`.
   - `NEXTAUTH_SECRET` — generate with `openssl rand -base64 32`
   - `EMAIL_*` — SMTP credentials for password-reset emails. Without them the app still
     runs; reset links are logged to the server console instead of being sent.

3. **Seed demo data**
   ```bash
   npm run db:seed
   ```
   There is no schema step. MongoDB creates collections on first write, and the Mongoose
   schemas in `src/models` are enforced by the application rather than the server — so seeding
   an empty database is all the setup there is.

   `npm run db:reset` drops every collection and reseeds, for getting back to a clean demo
   state. It refuses to run against a non-local `MONGODB_URI` unless you add `-- --force`.

4. **Run the dev server**
   ```bash
   npm run dev
   ```
   App runs at http://localhost:3000


### Demo accounts

| Role    | Email                  | Password        |
|---------|------------------------|-----------------|
| Admin   | `admin@examprep.app`   | `Admin@12345`   |
| Student | `grace@example.com`    | `Student@12345` |
| Student | `daniel@example.com`   | `Student@12345` |
| Student | `amara@example.com`    | `Student@12345` |

Change the admin password before deploying anywhere real.

### What the seed creates
- **5 subjects.** Three live (General Mathematics, English Language, Basic Computer
  Science), one **draft** (Physics) and one **published-but-deactivated** (Chemistry) —
  the last two exist to prove students never see them.
- **~35 questions** across single-choice, multiple-choice, and true/false, each with a
  written explanation used as the correction on a wrong answer.
- **10 graded attempts.** Grace's three maths attempts improve deliberately, so the
  dashboard's improvement trend has a real shape, and she has one **in-progress** exam so
  the resume path is visible.
- Attempts are graded by calling the application's own `gradeAndSubmitAttempt`, so seeded
  results, `UserProgress`, and admin analytics are exactly what the app would compute.
- **The landing page content** — hero, 4 stats, 6 feature cards, 3 steps, 4 FAQ entries, and
  2 footer links — matching the wording the site ships with.
- **The guest access code**, printed in the seed output (it is otherwise only visible at
  `/admin/access`). It rotates 12 hours after it is issued.

The seed is re-runnable: users, subjects, and topics are upserted, questions are matched
by (subject, text), and a student who already has an attempt for a subject is skipped.
Landing-page blocks are only inserted when a section is completely empty, so re-seeding
never duplicates or overwrites copy an admin has edited.

## Useful scripts
| Command               | Purpose                                              |
|-----------------------|------------------------------------------------------|
| `npm run dev`         | Start the dev server                                 |
| `npm run build`       | Production build                                     |
| `npm run start`       | Run the production build                             |
| `npm run lint`        | ESLint                                               |
| `npm run db:seed`     | Seed demo data (re-runnable)                         |
| `npm run db:reset`    | Drop every collection and reseed                     |
| `npm run db:indexes`  | Build the indexes the schemas declare, and list them |

> `db:reset` is the only destructive one, and it refuses a non-local `MONGODB_URI` unless you
> pass `-- --force`. It drops *collections*, not the database, so Atlas database users and
> their grants survive.
>
> `db:indexes` is worth running once against a fresh Atlas database. Mongoose builds declared
> indexes on first use, but it reports a failure by emitting an event rather than throwing — so
> a unique index that can't be built is otherwise silent, and several of this app's guarantees
> (idempotent autosave, duplicate-email 409s, the guest redemption cap) *are* unique indexes.
>
> The scripts in `scripts/` load `.env` through `@next/env`, so they resolve the same
> connection string the app does. Prisma used to do this implicitly; nothing does it for a
> plain `tsx` process, which is what `scripts/env.ts` exists for.

## Gotchas worth knowing

- **A standalone `mongod` is not enough.** Starting and submitting an exam are multi-document
  transactions, which MongoDB only allows on a replica set. Against a plain `mongod` those two
  paths fail with *"Transaction numbers are only allowed on a replica set member or mongos"*
  while everything else appears to work. Run a single-node replica set locally, or use Atlas.
- **`MONGODB_URI` must name a database.** `mongodb://127.0.0.1:27017` without a path connects to
  a database literally called `test`. Nothing errors — you just seed and read one database while
  looking at another.
- **The in-progress demo attempt expires.** The seed leaves Grace one live Basic Computer
  Science attempt so the resume path is visible, but that subject's limit is 20 minutes —
  measured from when you seeded. Open `/exam/...` after that and the server closes the
  attempt out and redirects to its result, which is correct behaviour. Run
  `npm run db:reset` for a fresh one.
- **Password reset needs `EMAIL_SERVER_HOST` unset to log to the console.**
  `src/lib/mail.ts` only prints the reset link to the server console when that variable is
  *absent*. Leaving the `.env.example` placeholder (`smtp.example.com`) in place makes it
  attempt a real SMTP connection to a host that doesn't exist. For local development,
  comment the `EMAIL_*` lines out.
- **Don't add a `loading.tsx` above a route that calls `notFound()`** — it turns that
  route's 404 into a 200. See `PROJECT_STRUCTURE.md` for the full explanation.
- **Middleware lives at `src/middleware.ts`, not the repo root.** Because `app/` is under
  `src/`, a root-level `middleware.ts` is silently ignored — it compiles and typechecks and
  never runs. If route protection seems not to apply, check that
  `.next/server/middleware-manifest.json` is non-empty.
- **To view the landing page while signed in as an admin, use `/?preview`.** Visiting `/`
  with a session redirects you to your own dashboard, so the plain URL never shows an admin
  the page they are editing. The `/admin/home` header has a "View home page" button that
  links to it. The bypass is admin-only — a signed-in student is still redirected.

## Feature tour

**Student**
- Register, log in, log out, reset password by email, edit profile and password.
- `/subjects` — browse live subjects; `/subjects/[slug]` — pre-exam brief with your own
  attempt history, best and average score.
- `/exam/[attemptId]` — the CBT runner: numbered question palette, flag, skip, free
  navigation, arrow-key shortcuts, autosave with a visible save state, and a countdown
  that submits for you at zero.
- `/results/[attemptId]` — score, percentage, correct/wrong/unanswered counts, then every
  question with your answer, the correct answer, and an explanation where you went wrong.
  Filter to **Mistakes only**.
- `/history` — every attempt ever, filterable by subject and outcome.
- `/dashboard` — best and average score, pass rate, improvement trend, per-subject
  breakdown, and any exam still in progress.

**Guest (no account)**
- `/access` — enter the current code and an optional display name to start a 12-hour session.
- Browse published subjects, sit any timed exam, and read the full result review — the same
  engine students use, with the same server-side grading.
- Dashboard, history, and profile need a registered account; the app offers the upgrade path
  rather than the page.

**Admin**
- `/admin/subjects` — create, edit, publish, activate/deactivate subjects.
- `/admin/subjects/[id]/questions` — question and option CRUD with a correct-answer
  picker, explanations, difficulty, and per-question points; **CSV import** with an
  all-or-nothing row check.
- `/admin/topics` — topic/category management.
- `/admin/home` — edit the public landing page: hero copy and buttons, a stats band whose
  figures can be counted live from the database, feature cards, how-it-works steps, FAQ
  entries, the closing call to action, footer links, and the page's search-engine title and
  description. Every section can be reordered or switched off, and saves go live at once.
- `/admin/access` — the guest code: view and copy it, see how many guests are online, set a
  redemption cap, turn account-free access off, and **Reset & revoke** to issue a new code and
  sign every guest out at once.
- `/admin/users` — role and activation management (guest sessions are not accounts and are
  not listed here).
- `/admin/attempts` — browse all attempts; `/admin/analytics` — subject performance, pass
  rates, score distribution, and the most-missed questions.

## Project layout
See [`PROJECT_STRUCTURE.md`](./PROJECT_STRUCTURE.md) for the full route map, server module
layout, and the build plan.

## UI & theming
- **Component library:** shadcn/ui primitives in `src/components/ui` (button, input, card,
  dialog, sheet, dropdown, select, table, tabs, form, progress, toast host, …) plus
  project-level additions `empty-state` and `stat-card`. `components.json` is present so
  `npx shadcn-ui@latest add <component>` keeps generating into the same paths.
- **App shell:** `src/components/layout/app-shell.tsx` renders a fixed sidebar (desktop),
  a sticky topbar, an avatar/user dropdown, and a slide-out sheet nav below `lg`. The exam
  runner deliberately sits outside it, with its own focused chrome.
- **Theming:** light / dark / system via `next-themes`, class-based. Colour roles are HSL
  CSS variables in `src/app/globals.css` — the shadcn defaults plus `success` and
  `warning`, used for pass/fail and publish-state signalling.
- **Charts** are hand-built from divs and inline SVG (`score-distribution-chart`,
  `trend-chart`) so they render on the server with no chart library and no client JS.
- **Feedback:** `sonner` toasts mounted once in `providers.tsx`; forms use them for
  success and inline `<Alert>` for validation errors.

## Database schema
Defined as Mongoose schemas in [`src/models/index.ts`](./src/models/index.ts), with the
matching TypeScript shapes in [`src/types/models.ts`](./src/types/models.ts). The two are kept
in step by hand — the schemas are the runtime shape, the types are the compile-time shape, and
nothing checks that they agree.

- **User** — students, admins & guests, role-based (`STUDENT` / `ADMIN` / `GUEST`)
- **Session / PasswordResetToken** — auth support collections
- **Subject** — exam subjects, with publish/active flags, duration, pass mark
- **Topic** — categories within a subject
- **Question / QuestionOption** — question bank with correct-answer flags & explanations
- **ExamAttempt** — one document per attempt; retakes create new ones, old ones are preserved
- **UserAnswer** — one document per question per attempt, written when the attempt starts;
  `isCorrect` is `true` / `false` / `null` for unanswered
- **FlaggedQuestion** — questions a student marked for review mid-exam
- **UserProgress** — denormalised best/average score per user+subject for fast dashboards
- **HomePage** — the landing page's one-off copy; a single document, always id `"home"`
- **HomeBlock** — the landing page's repeated items (stats, features, steps, FAQ entries,
  footer links) in one collection, discriminated by `kind`, each with an order and a visibility flag
- **GuestAccessCode** — the rotating code for account-free practice; a single document holding
  the current code, its expiry, and the revocation counter
- **AuditLog** — admin action trail

Three conventions in `src/models/index.ts` carry the whole data layer, and breaking any of them
breaks call sites far from that file:

- **Primary keys are strings, not `ObjectId`.** Ids arrive from URL params and form bodies, and
  Mongoose throws a `CastError` on a malformed `ObjectId` — so a junk id in a URL would 500
  where a missing row should 404. A `String` `_id` cannot fail to cast.
- **Foreign keys are scalars; relations are virtuals.** `question.subjectId` stays a string and
  `.populate("subject")` fills `question.subject` alongside it, which is the shape the app was
  already written against.
- **There is no referential integrity.** MongoDB has no `ON DELETE`, so the cascades the SQL
  schema enforced live in [`src/server/services/cascade.ts`](./src/server/services/cascade.ts)
  and must be called on every delete path. Nothing catches a missed one.

## Security model

Role-based access is enforced in three layers: `middleware.ts` gates whole route trees,
`requireUser()` / `requireAdmin()` guard pages, and `requireApiUser()` / `requireApiAdmin()`
guard route handlers. On top of that:

- **No answer key ever reaches a live exam.** The exam payload selects options as
  `{ id, text }` — `QuestionOption.isCorrect` and `Question.explanation` are absent. They
  first appear in the results loader, which matches on `status: "SUBMITTED"`.
- **Scores are never accepted from the client.** `POST /api/attempts/[id]/submit` ignores
  its request body entirely and grades the stored `UserAnswer` rows on the server.
- **`isCorrect` is not written during the exam**, only at grading — so autosave responses
  can't be probed for correctness one option at a time.
- **Ownership is part of every query**, never a later `if`: an attempt belonging to another
  student is indistinguishable from one that doesn't exist.
- **A submitted attempt is immutable.** Answer and flag writes require `IN_PROGRESS`, and
  submission is claimed with a status-guarded `updateMany`, so two concurrent submits can't
  both win and a stored result can never be re-graded.
- **The clock is the server's.** Remaining time derives from `startedAt + durationMin`; a
  late save is refused (with a 10s network grace), `timeSpentSec` is capped at the limit,
  and an abandoned expired attempt is auto-graded before a retake can begin.
- **Retakes never overwrite.** Each start inserts a new `ExamAttempt` with the next
  `attemptNumber`, and the question set is snapshotted as `UserAnswer` rows with a frozen
  order — so editing the bank later cannot change a past result.
- Students only see subjects where `isPublished` **and** `isActive` are true.
- Passwords are bcrypt-hashed (cost 12); reset tokens are single-use and time-limited.
- **A guest session is validated without a database read.** The token carries its own expiry
  and the code generation it was minted under; the generation is compared against a
  process-cached row (30s TTL). An admin reset increments that generation, which invalidates
  every issued guest token at once — measured at 0 queries across 500 validations.
- **A guest row can never be signed into with a password.** It stores a synthetic
  `@guest.invalid` address and a literal non-hash, and the password provider refuses
  `role: GUEST` before any comparison happens.
- **Guest activity is excluded from every reported figure** — admin analytics and the public
  stats band both filter guests out, so a demo code cannot move real student averages.
- **A leaked code cannot mint unlimited sessions.** Each code carries a redemption cap
  (default 500), claimed with a guarded `updateMany` so it holds under concurrency.
- **Admin-authored links are validated as links, not just as text.** Every landing-page
  `href` must be a same-site path, or an absolute `http(s):`/`mailto:` URL. `javascript:` and
  protocol-relative `//host` values are rejected on write, so stored copy can't become an
  injection vector on a public page. Icons come from a fixed allow-list for the same reason.

## Marking rules
- Each question is worth its own `points` (default 1); the percentage is
  `score / totalPoints`.
- Multiple-choice is **all-or-nothing**: a partially correct selection scores zero. There
  is no negative marking.
- An unanswered question scores zero and is reported separately from a wrong answer.
- A subject's `passMark` is a percentage, compared against that attempt's own percentage.
