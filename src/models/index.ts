import { randomUUID } from "crypto";
import { Schema, model, models, type Model } from "mongoose";

import { normalizeIds } from "@/lib/serialize";
import {
  ATTEMPT_STATUS_VALUES,
  DIFFICULTY_VALUES,
  HOME_BLOCK_KIND_VALUES,
  HOME_METRIC_VALUES,
  QUESTION_TYPE_VALUES,
  ROLE_VALUES,
  type AuditLog,
  type ExamAttempt,
  type FlaggedQuestion,
  type GuestAccessCode,
  type HomeBlock,
  type HomePage,
  type PasswordResetToken,
  type Question,
  type QuestionOption,
  type Session,
  type Subject,
  type Topic,
  type User,
  type UserAnswer,
  type UserProgress,
} from "@/types/models";

/**
 * Mongoose schemas — the replacement for prisma/schema.prisma.
 *
 * Three conventions here carry the migration, and changing any of them will break call
 * sites far away from this file:
 *
 * 1. STRING PRIMARY KEYS, NOT ObjectId.
 *    Ids arrive from URL params (`/subjects/[slug]`, `/exam/[attemptId]`) and from form
 *    bodies. Mongoose CASTS a malformed ObjectId by throwing a CastError, so a junk id in
 *    the URL would produce a 500 where Prisma returned null and the route rendered its 404.
 *    A String `_id` cannot fail to cast, which preserves the existing not-found behaviour
 *    everywhere without a single guard.
 *
 * 2. SCALAR FOREIGN KEYS + VIRTUAL POPULATE.
 *    Prisma gave you both `question.subjectId` (a string) and, under `include`,
 *    `question.subject` (the row). Populating the scalar field directly would destroy the
 *    first to produce the second. Instead every relation is a VIRTUAL whose `localField` is
 *    the scalar — so `.populate("subject")` fills `question.subject` and leaves
 *    `question.subjectId` a string, exactly as before.
 *
 * 3. NO REFERENTIAL INTEGRITY.
 *    MongoDB has no foreign keys and no ON DELETE. The 16 cascades the SQL schema enforced
 *    are reimplemented in `src/server/services/cascade.ts` and must be called explicitly on
 *    every delete path. There is no safety net if one is missed.
 */

/** Matches the shape Prisma's `cuid()` filled: opaque, collision-resistant, URL-safe. */
const newId = () => randomUUID();

/**
 * Copies `_id` onto `id` for every lean read.
 *
 * Post-hooks fire for `.lean()` results (where Mongoose's own `id` virtual does not exist),
 * which is what lets ~140 call sites keep reading `.id` untouched. Hydrated documents
 * already have the virtual, and `normalizeIds` skips them since they are not plain objects.
 */
function idPlugin(schema: Schema) {
  const hooks = [
    "find",
    "findOne",
    "findOneAndUpdate",
    "findOneAndReplace",
    "findOneAndDelete",
  ] as const;

  for (const hook of hooks) {
    schema.post(hook, function (result: unknown) {
      if (result) normalizeIds(result);
    });
  }
}

/** Shared options: string `_id`, automatic timestamps, and the id normaliser. */
function makeSchema<T>(
  definition: Record<string, unknown>,
  options: { collection: string; timestamps?: boolean | Record<string, unknown> }
) {
  const schema = new Schema<T>(
    {
      _id: { type: String, default: newId },
      ...definition,
    } as never,
    {
      collection: options.collection,
      timestamps: options.timestamps ?? true,
      // Virtuals are how relations are exposed; without this they vanish from `toObject`.
      toObject: { virtuals: true },
      toJSON: { virtuals: true },
      // The app validates with zod at the edges. A second, divergent set of rules here
      // would reject payloads the validators already accepted.
      strict: true,
      versionKey: false,
    }
  );

  schema.plugin(idPlugin);
  return schema;
}

/** Declares a to-one relation under `name`, backed by the scalar `localField`. */
function belongsTo(schema: Schema, name: string, ref: string, localField: string) {
  schema.virtual(name, { ref, localField, foreignField: "_id", justOne: true });
}

/** Declares a to-many relation under `name`, the inverse side of `foreignField`. */
function hasMany(schema: Schema, name: string, ref: string, foreignField: string) {
  schema.virtual(name, { ref, localField: "_id", foreignField, justOne: false });
}

// ---------------------------------------------------------------------------
// AUTH / USERS
// ---------------------------------------------------------------------------

const userSchema = makeSchema<User>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ROLE_VALUES, default: "STUDENT" },
    avatarUrl: { type: String, default: null },
    isActive: { type: Boolean, default: true },
    emailVerified: { type: Date, default: null },
    guestExpiresAt: { type: Date, default: null },
  },
  { collection: "users" }
);

// Drives the retention sweep that deletes lapsed guests.
userSchema.index({ role: 1, guestExpiresAt: 1 });

hasMany(userSchema, "attempts", "ExamAttempt", "userId");
hasMany(userSchema, "flaggedQuestions", "FlaggedQuestion", "userId");
hasMany(userSchema, "progress", "UserProgress", "userId");
hasMany(userSchema, "resetTokens", "PasswordResetToken", "userId");
hasMany(userSchema, "sessions", "Session", "userId");
hasMany(userSchema, "createdSubjects", "Subject", "createdById");
hasMany(userSchema, "createdQuestions", "Question", "createdById");
hasMany(userSchema, "homePageEdits", "HomePage", "updatedById");
hasMany(userSchema, "auditLogs", "AuditLog", "userId");

const sessionSchema = makeSchema<Session>(
  {
    sessionToken: { type: String, required: true, unique: true },
    userId: { type: String, required: true, index: true },
    expires: { type: Date, required: true },
  },
  { collection: "sessions", timestamps: false }
);

belongsTo(sessionSchema, "user", "User", "userId");

const passwordResetTokenSchema = makeSchema<PasswordResetToken>(
  {
    token: { type: String, required: true, unique: true },
    userId: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { collection: "password_reset_tokens", timestamps: { createdAt: true, updatedAt: false } }
);

belongsTo(passwordResetTokenSchema, "user", "User", "userId");

// ---------------------------------------------------------------------------
// CONTENT: SUBJECTS / TOPICS / QUESTIONS
// ---------------------------------------------------------------------------

const subjectSchema = makeSchema<Subject>(
  {
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String, default: null },
    imageUrl: { type: String, default: null },
    durationMin: { type: Number, default: 30 },
    passMark: { type: Number, default: 50 },
    isPublished: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    createdById: { type: String, required: true, index: true },
  },
  { collection: "subjects" }
);

subjectSchema.index({ isPublished: 1, isActive: 1 });

belongsTo(subjectSchema, "createdBy", "User", "createdById");
hasMany(subjectSchema, "topics", "Topic", "subjectId");
hasMany(subjectSchema, "questions", "Question", "subjectId");
hasMany(subjectSchema, "attempts", "ExamAttempt", "subjectId");

const topicSchema = makeSchema<Topic>(
  {
    name: { type: String, required: true },
    description: { type: String, default: null },
    subjectId: { type: String, required: true, index: true },
  },
  { collection: "topics" }
);

// Was @@unique([subjectId, name]) — two topics of the same name under one subject.
topicSchema.index({ subjectId: 1, name: 1 }, { unique: true });

belongsTo(topicSchema, "subject", "Subject", "subjectId");
hasMany(topicSchema, "questions", "Question", "topicId");

const questionSchema = makeSchema<Question>(
  {
    subjectId: { type: String, required: true, index: true },
    topicId: { type: String, default: null, index: true },
    text: { type: String, required: true },
    type: { type: String, enum: QUESTION_TYPE_VALUES, default: "SINGLE_CHOICE" },
    difficulty: { type: String, enum: DIFFICULTY_VALUES, default: "MEDIUM" },
    explanation: { type: String, default: null },
    points: { type: Number, default: 1 },
    isActive: { type: Boolean, default: true },
    createdById: { type: String, required: true },
  },
  { collection: "questions" }
);

belongsTo(questionSchema, "subject", "Subject", "subjectId");
belongsTo(questionSchema, "topic", "Topic", "topicId");
belongsTo(questionSchema, "createdBy", "User", "createdById");
hasMany(questionSchema, "options", "QuestionOption", "questionId");
hasMany(questionSchema, "userAnswers", "UserAnswer", "questionId");
hasMany(questionSchema, "flaggedBy", "FlaggedQuestion", "questionId");

const questionOptionSchema = makeSchema<QuestionOption>(
  {
    questionId: { type: String, required: true, index: true },
    text: { type: String, required: true },
    isCorrect: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
  },
  { collection: "question_options", timestamps: false }
);

belongsTo(questionOptionSchema, "question", "Question", "questionId");
hasMany(questionOptionSchema, "userAnswers", "UserAnswer", "selectedOptionId");

// ---------------------------------------------------------------------------
// EXAM ATTEMPTS / GRADING
// ---------------------------------------------------------------------------

const examAttemptSchema = makeSchema<ExamAttempt>(
  {
    userId: { type: String, required: true },
    subjectId: { type: String, required: true },
    status: { type: String, enum: ATTEMPT_STATUS_VALUES, default: "IN_PROGRESS", index: true },
    score: { type: Number, default: null },
    totalPoints: { type: Number, default: null },
    percentage: { type: Number, default: null },
    correctCount: { type: Number, default: null },
    incorrectCount: { type: Number, default: null },
    unansweredCount: { type: Number, default: null },
    startedAt: { type: Date, default: () => new Date() },
    submittedAt: { type: Date, default: null },
    timeSpentSec: { type: Number, default: null },
    isAutoSubmitted: { type: Boolean, default: false },
    attemptNumber: { type: Number, required: true },
  },
  { collection: "exam_attempts", timestamps: false }
);

examAttemptSchema.index({ userId: 1, subjectId: 1 });

belongsTo(examAttemptSchema, "user", "User", "userId");
belongsTo(examAttemptSchema, "subject", "Subject", "subjectId");
hasMany(examAttemptSchema, "answers", "UserAnswer", "attemptId");
hasMany(examAttemptSchema, "flags", "FlaggedQuestion", "attemptId");

const userAnswerSchema = makeSchema<UserAnswer>(
  {
    attemptId: { type: String, required: true, index: true },
    questionId: { type: String, required: true },
    selectedOptionId: { type: String, default: null },
    selectedOptionIds: { type: [String], default: () => [] },
    isCorrect: { type: Boolean, default: null },
    isSkipped: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
    answeredAt: { type: Date, default: null },
  },
  { collection: "user_answers" }
);

// Was @@unique([attemptId, questionId]) — one answer row per question per attempt. This is
// what makes the answer-saving endpoint idempotent under a double-submit.
userAnswerSchema.index({ attemptId: 1, questionId: 1 }, { unique: true });

belongsTo(userAnswerSchema, "attempt", "ExamAttempt", "attemptId");
belongsTo(userAnswerSchema, "question", "Question", "questionId");
belongsTo(userAnswerSchema, "selectedOption", "QuestionOption", "selectedOptionId");

const flaggedQuestionSchema = makeSchema<FlaggedQuestion>(
  {
    userId: { type: String, required: true, index: true },
    attemptId: { type: String, required: true },
    questionId: { type: String, required: true },
  },
  { collection: "flagged_questions", timestamps: { createdAt: true, updatedAt: false } }
);

flaggedQuestionSchema.index({ attemptId: 1, questionId: 1 }, { unique: true });

belongsTo(flaggedQuestionSchema, "user", "User", "userId");
belongsTo(flaggedQuestionSchema, "attempt", "ExamAttempt", "attemptId");
belongsTo(flaggedQuestionSchema, "question", "Question", "questionId");

const userProgressSchema = makeSchema<UserProgress>(
  {
    userId: { type: String, required: true },
    subjectId: { type: String, required: true },
    attemptsCount: { type: Number, default: 0 },
    bestScore: { type: Number, default: 0 },
    bestPercentage: { type: Number, default: 0 },
    averagePercentage: { type: Number, default: 0 },
    lastPercentage: { type: Number, default: null },
    lastAttemptAt: { type: Date, default: null },
  },
  { collection: "user_progress", timestamps: { createdAt: false, updatedAt: true } }
);

// Was @@unique([userId, subjectId]) — the upsert key the grading service relies on.
userProgressSchema.index({ userId: 1, subjectId: 1 }, { unique: true });

belongsTo(userProgressSchema, "user", "User", "userId");

// ---------------------------------------------------------------------------
// LANDING PAGE CONTENT (admin-editable)
// ---------------------------------------------------------------------------

const homePageSchema = makeSchema<HomePage>(
  {
    // Always the single document "home"; see HOME_DEFAULTS for why no copy defaults live here.
    _id: { type: String, default: "home" },

    brandLabel: { type: String, required: true },

    heroBadge: { type: String, default: null },
    heroTitle: { type: String, required: true },
    heroSubtitle: { type: String, default: null },
    heroPrimaryLabel: { type: String, required: true },
    heroPrimaryHref: { type: String, required: true },
    heroSecondaryLabel: { type: String, default: null },
    heroSecondaryHref: { type: String, default: null },

    statsEnabled: { type: Boolean, default: true },

    featuresEnabled: { type: Boolean, default: true },
    featuresTitle: { type: String, required: true },
    featuresSubtitle: { type: String, default: null },

    stepsEnabled: { type: Boolean, default: true },
    stepsTitle: { type: String, required: true },
    stepsSubtitle: { type: String, default: null },

    faqEnabled: { type: Boolean, default: true },
    faqTitle: { type: String, required: true },
    faqSubtitle: { type: String, default: null },

    ctaEnabled: { type: Boolean, default: true },
    ctaTitle: { type: String, required: true },
    ctaBody: { type: String, default: null },
    ctaButtonLabel: { type: String, required: true },
    ctaButtonHref: { type: String, required: true },

    footerTagline: { type: String, default: null },

    metaTitle: { type: String, default: null },
    metaDescription: { type: String, default: null },

    updatedById: { type: String, default: null },
  },
  { collection: "home_page" }
);

belongsTo(homePageSchema, "updatedBy", "User", "updatedById");

const homeBlockSchema = makeSchema<HomeBlock>(
  {
    kind: { type: String, enum: HOME_BLOCK_KIND_VALUES, required: true },
    title: { type: String, required: true },
    body: { type: String, default: null },
    icon: { type: String, default: null },
    metric: { type: String, enum: HOME_METRIC_VALUES, default: "MANUAL" },
    value: { type: String, default: null },
    href: { type: String, default: null },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { collection: "home_blocks" }
);

homeBlockSchema.index({ kind: 1, order: 1 });

// ---------------------------------------------------------------------------
// GUEST ACCESS (account-free practice)
// ---------------------------------------------------------------------------

const guestAccessCodeSchema = makeSchema<GuestAccessCode>(
  {
    // Always the single document "current".
    _id: { type: String, default: "current" },

    isEnabled: { type: Boolean, default: true },

    code: { type: String, required: true },
    generation: { type: Number, default: 1 },
    issuedAt: { type: Date, default: () => new Date() },
    expiresAt: { type: Date, required: true },

    redemptions: { type: Number, default: 0 },
    maxRedemptions: { type: Number, default: 500 },

    lastPurgeAt: { type: Date, default: null },

    updatedById: { type: String, default: null },
  },
  { collection: "guest_access_code" }
);

// ---------------------------------------------------------------------------
// AUDIT
// ---------------------------------------------------------------------------

const auditLogSchema = makeSchema<AuditLog>(
  {
    userId: { type: String, default: null, index: true },
    action: { type: String, required: true },
    entity: { type: String, required: true },
    entityId: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed, default: null },
  },
  { collection: "audit_logs", timestamps: { createdAt: true, updatedAt: false } }
);

belongsTo(auditLogSchema, "user", "User", "userId");

// ---------------------------------------------------------------------------
// MODEL REGISTRATION
// ---------------------------------------------------------------------------
//
// `models.X ?? model(...)` is required, not defensive: Next.js re-evaluates this module on
// every hot reload in dev, and a second `model("User", ...)` throws OverwriteModelError.

function register<T>(name: string, schema: Schema): Model<T> {
  return (models[name] as Model<T>) ?? model<T>(name, schema);
}

export const UserModel = register<User>("User", userSchema);
export const SessionModel = register<Session>("Session", sessionSchema);
export const PasswordResetTokenModel = register<PasswordResetToken>(
  "PasswordResetToken",
  passwordResetTokenSchema
);
export const SubjectModel = register<Subject>("Subject", subjectSchema);
export const TopicModel = register<Topic>("Topic", topicSchema);
export const QuestionModel = register<Question>("Question", questionSchema);
export const QuestionOptionModel = register<QuestionOption>(
  "QuestionOption",
  questionOptionSchema
);
export const ExamAttemptModel = register<ExamAttempt>("ExamAttempt", examAttemptSchema);
export const UserAnswerModel = register<UserAnswer>("UserAnswer", userAnswerSchema);
export const FlaggedQuestionModel = register<FlaggedQuestion>(
  "FlaggedQuestion",
  flaggedQuestionSchema
);
export const UserProgressModel = register<UserProgress>("UserProgress", userProgressSchema);
export const HomePageModel = register<HomePage>("HomePage", homePageSchema);
export const HomeBlockModel = register<HomeBlock>("HomeBlock", homeBlockSchema);
export const GuestAccessCodeModel = register<GuestAccessCode>(
  "GuestAccessCode",
  guestAccessCodeSchema
);
export const AuditLogModel = register<AuditLog>("AuditLog", auditLogSchema);
