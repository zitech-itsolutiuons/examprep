/**
 * Domain types — the hand-written replacement for the types Prisma used to generate.
 *
 * These mirror the Mongoose schemas in `src/models`. Keep the two in step: the schemas are
 * the runtime shape, these are the compile-time shape, and nothing checks that they agree.
 *
 * Every document type here describes a POJO as it comes back from a `.lean()` read with
 * `_id` already mapped to `id` (see `serialize` in `src/lib/serialize.ts`). Hydrated
 * Mongoose documents are deliberately never handed out past the model layer.
 */

// ---------------------------------------------------------------------------
// ENUMS
// ---------------------------------------------------------------------------
//
// Prisma generated these as real objects; the app only ever compared them to string
// literals, so string unions carry the same meaning with no runtime cost. The `*_VALUES`
// arrays exist because Mongoose needs the list at runtime for its enum validator, and
// deriving the union from the array keeps one source of truth.

export const ROLE_VALUES = ["STUDENT", "ADMIN", "GUEST"] as const;
export type Role = (typeof ROLE_VALUES)[number];

export const ATTEMPT_STATUS_VALUES = ["IN_PROGRESS", "SUBMITTED", "ABANDONED"] as const;
export type AttemptStatus = (typeof ATTEMPT_STATUS_VALUES)[number];

export const QUESTION_TYPE_VALUES = ["SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE"] as const;
export type QuestionType = (typeof QUESTION_TYPE_VALUES)[number];

export const DIFFICULTY_VALUES = ["EASY", "MEDIUM", "HARD"] as const;
export type Difficulty = (typeof DIFFICULTY_VALUES)[number];

/** Which repeated landing-page list a HomeBlock row belongs to. */
export const HOME_BLOCK_KIND_VALUES = ["STAT", "FEATURE", "STEP", "FAQ", "LINK"] as const;
export type HomeBlockKind = (typeof HOME_BLOCK_KIND_VALUES)[number];

/**
 * A STAT either shows the literal in `HomeBlock.value` (MANUAL) or a figure counted from
 * the live database at render time.
 */
export const HOME_METRIC_VALUES = [
  "MANUAL",
  "STUDENTS",
  "SUBJECTS",
  "QUESTIONS",
  "ATTEMPTS",
  "PASS_RATE",
  "AVERAGE_SCORE",
] as const;
export type HomeMetric = (typeof HOME_METRIC_VALUES)[number];

// ---------------------------------------------------------------------------
// AUTH / USERS
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  avatarUrl: string | null;
  isActive: boolean;
  emailVerified: Date | null;
  /** GUEST rows only: when their code-granted session lapses. Also drives the retention sweep. */
  guestExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Session {
  id: string;
  sessionToken: string;
  userId: string;
  expires: Date;
}

export interface PasswordResetToken {
  id: string;
  token: string;
  userId: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// CONTENT: SUBJECTS / TOPICS / QUESTIONS
// ---------------------------------------------------------------------------

export interface Subject {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  /** Exam time limit in minutes. */
  durationMin: number;
  /** Percentage required to "pass". */
  passMark: number;
  isPublished: boolean;
  isActive: boolean;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Topic {
  id: string;
  name: string;
  description: string | null;
  subjectId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Question {
  id: string;
  subjectId: string;
  topicId: string | null;
  text: string;
  type: QuestionType;
  difficulty: Difficulty;
  /** Shown on review, especially for wrong answers. */
  explanation: string | null;
  points: number;
  isActive: boolean;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface QuestionOption {
  id: string;
  questionId: string;
  text: string;
  isCorrect: boolean;
  order: number;
}

// ---------------------------------------------------------------------------
// EXAM ATTEMPTS / GRADING
// ---------------------------------------------------------------------------

export interface ExamAttempt {
  id: string;
  userId: string;
  subjectId: string;
  status: AttemptStatus;
  /** Raw points scored. */
  score: number | null;
  /** Total points possible at the time of the attempt. */
  totalPoints: number | null;
  /** score / totalPoints * 100 */
  percentage: number | null;
  correctCount: number | null;
  incorrectCount: number | null;
  unansweredCount: number | null;
  startedAt: Date;
  submittedAt: Date | null;
  timeSpentSec: number | null;
  /** True when the timer expired rather than the student submitting. */
  isAutoSubmitted: boolean;
  /** Nth attempt for this user+subject, preserved forever. */
  attemptNumber: number;
}

/**
 * One document per question per attempt, created up-front when the attempt starts. That
 * write is the question-set snapshot: deactivating or re-topic-ing a question later never
 * changes which questions a past attempt contained. `isCorrect` stays null until the
 * attempt is graded — true = right, false = answered wrong, null = unanswered.
 */
export interface UserAnswer {
  id: string;
  attemptId: string;
  questionId: string;
  /** For single-choice / true-false. */
  selectedOptionId: string | null;
  /** For multiple-choice (option ids). */
  selectedOptionIds: string[];
  isCorrect: boolean | null;
  isSkipped: boolean;
  /** Position within this attempt, fixed at start. */
  order: number;
  answeredAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FlaggedQuestion {
  id: string;
  userId: string;
  attemptId: string;
  questionId: string;
  createdAt: Date;
}

/**
 * Aggregated, denormalized per-user-per-subject stats for fast dashboard reads
 * (best score, average, attempt count, improvement trend).
 */
export interface UserProgress {
  id: string;
  userId: string;
  subjectId: string;
  attemptsCount: number;
  bestScore: number;
  bestPercentage: number;
  averagePercentage: number;
  lastPercentage: number | null;
  lastAttemptAt: Date | null;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// LANDING PAGE CONTENT (admin-editable)
// ---------------------------------------------------------------------------

/**
 * The landing page's one-off copy: a single document, always id = "home".
 *
 * Copy defaults are NOT declared on the schema. `HOME_DEFAULTS` in
 * `src/server/services/home.ts` is the single source of truth, so required fields carry no
 * schema default — that keeps the shipped wording in one place instead of two. The public
 * page never writes: with no document it renders HOME_DEFAULTS, and the admin PATCH upserts.
 */
export interface HomePage {
  id: string;

  brandLabel: string;

  /** Hero. A blank heroSecondaryLabel drops the second button rather than rendering empty. */
  heroBadge: string | null;
  heroTitle: string;
  heroSubtitle: string | null;
  heroPrimaryLabel: string;
  heroPrimaryHref: string;
  heroSecondaryLabel: string | null;
  heroSecondaryHref: string | null;

  /** Section switches + headings. Turning a section off hides it without deleting its rows. */
  statsEnabled: boolean;

  featuresEnabled: boolean;
  featuresTitle: string;
  featuresSubtitle: string | null;

  stepsEnabled: boolean;
  stepsTitle: string;
  stepsSubtitle: string | null;

  faqEnabled: boolean;
  faqTitle: string;
  faqSubtitle: string | null;

  ctaEnabled: boolean;
  ctaTitle: string;
  ctaBody: string | null;
  ctaButtonLabel: string;
  ctaButtonHref: string;

  footerTagline: string | null;

  /** Overrides the <title>/<meta description> from the root layout when set. */
  metaTitle: string | null;
  metaDescription: string | null;

  updatedById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Every repeated landing-page item — a stat, a feature card, a how-it-works step, an FAQ
 * entry, a footer link — is one document here, discriminated by `kind`. They share the same
 * shape (a heading, some body text, a position, a visibility flag), so one model keeps a
 * single admin API and one manager component instead of five near-identical copies.
 *
 * Which optional fields matter depends on `kind`; the zod schema in
 * `src/server/validators/home.ts` is what enforces that per kind.
 */
export interface HomeBlock {
  id: string;
  kind: HomeBlockKind;
  title: string;
  body: string | null;
  /** Lucide icon name, resolved through an allow-list at render time. */
  icon: string | null;
  /** STAT only. */
  metric: HomeMetric;
  /** STAT only: the literal shown when metric is MANUAL. */
  value: string | null;
  /** LINK only. */
  href: string | null;
  order: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// GUEST ACCESS (account-free practice)
// ---------------------------------------------------------------------------

/**
 * The rotating code that lets someone practise without registering. One document, id = "current".
 *
 * Two fields carry the access rules, and keeping them separate is what makes the two admin
 * actions mean different things:
 *
 *   `code` / `expiresAt` gate who can COME IN. The 12-hour roll replaces the code and pushes
 *   `expiresAt` forward, which stops new redemptions of the old code but leaves everyone
 *   already inside alone — their session runs out on its own clock.
 *
 *   `generation` is the revocation counter, bumped ONLY by an explicit admin reset. Every
 *   guest session records the generation it was minted under, so incrementing it invalidates
 *   all of them at once.
 *
 * Rolling is lazy: there is no scheduler. `getActiveCode()` notices an elapsed `expiresAt` on
 * its next read and rotates then, so an idle deployment costs nothing.
 */
export interface GuestAccessCode {
  id: string;

  /** Whether account-free access is offered at all. */
  isEnabled: boolean;

  code: string;
  /** Bumped only by an admin reset — see the note above. */
  generation: number;
  issuedAt: Date;
  expiresAt: Date;

  /** Redemptions of the CURRENT code; reset to 0 whenever the code changes. */
  redemptions: number;
  /** Cap per code, so a leaked code can't mint unbounded guest documents. Null = no cap. */
  maxRedemptions: number | null;

  /** When the retention sweep last ran; it piggybacks on the roll. */
  lastPurgeAt: Date | null;

  updatedById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// AUDIT
// ---------------------------------------------------------------------------

export interface AuditLog {
  id: string;
  userId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  metadata: unknown | null;
  createdAt: Date;
}
