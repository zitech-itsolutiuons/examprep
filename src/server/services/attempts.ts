import { connectToDatabase, mongoose } from "@/lib/mongoose";
import { normalizeIds } from "@/lib/serialize";
import {
  ExamAttemptModel,
  FlaggedQuestionModel,
  QuestionModel,
  SubjectModel,
  UserAnswerModel,
} from "@/models";
import { gradeAndSubmitAttempt } from "@/server/services/grading";
import type { AttemptStatus, QuestionType } from "@/types/models";

/**
 * Attempt lifecycle: starting, resuming, autosaving, flagging, and expiry.
 *
 * Two rules shape everything here:
 *   1. A student can only ever touch their own attempts — every loader takes a `userId`
 *      and filters on it, so an unknown attempt and someone else's attempt are
 *      indistinguishable from the outside.
 *   2. A SUBMITTED attempt is immutable. Answers and flags are writable only while the
 *      attempt is IN_PROGRESS and inside its time limit.
 */

/** The only subjects a student may see or sit. */
export const STUDENT_SUBJECT_FILTER = { isPublished: true, isActive: true } as const;

/**
 * Slack allowed on top of the time limit when accepting a save, so the answer a student
 * picks as the clock hits zero isn't lost to network latency or a slightly fast client.
 * It does not extend the exam: `timeSpentSec` is still capped at the real limit.
 */
const SAVE_GRACE_SEC = 10;

export type SaveOutcome =
  | { ok: true; expired?: false }
  | { ok: false; reason: "NOT_FOUND" | "SUBMITTED" | "EXPIRED" | "BAD_OPTION" | "TOO_MANY" };

/** Wall-clock instant at which an attempt stops accepting writes. */
export function deadlineFor(startedAt: Date, durationMin: number) {
  return new Date(startedAt.getTime() + durationMin * 60_000);
}

export function secondsRemaining(startedAt: Date, durationMin: number) {
  const ms = deadlineFor(startedAt, durationMin).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 1000));
}

function isPastDeadline(startedAt: Date, durationMin: number, graceSec = 0) {
  return Date.now() > deadlineFor(startedAt, durationMin).getTime() + graceSec * 1000;
}

export type OwnedAttempt = {
  id: string;
  userId: string;
  subjectId: string;
  status: AttemptStatus;
  startedAt: Date;
  submittedAt: Date | null;
  attemptNumber: number;
  subject: { id: string; slug: string; title: string; durationMin: number; passMark: number };
};

/**
 * Loads an attempt the given user owns, or null. Used as the guard in front of every
 * attempt route — the ownership check is part of the query, never a later `if`.
 */
export async function loadOwnedAttempt(
  attemptId: string,
  userId: string
): Promise<OwnedAttempt | null> {
  await connectToDatabase();

  const attempt = await ExamAttemptModel.findOne({ _id: attemptId, userId })
    .populate({ path: "subject", select: "slug title durationMin passMark" })
    .lean();

  if (!attempt || !(attempt as { subject?: unknown }).subject) return null;

  return normalizeIds(attempt) as unknown as OwnedAttempt;
}

export type StartAttemptResult =
  | { ok: true; attemptId: string; resumed: boolean }
  | { ok: false; reason: "SUBJECT_UNAVAILABLE" | "NO_QUESTIONS" };

/**
 * Starts a fresh attempt, or hands back the one already in progress.
 *
 * A retake always creates a new `ExamAttempt` document with the next `attemptNumber`;
 * earlier attempts and their answers are never touched, so history and past results
 * survive every retake. If the in-progress attempt found here has already run out of time
 * it is graded and submitted first, so an abandoned exam can't be resumed hours later.
 */
export async function startOrResumeAttempt(
  userId: string,
  subjectId: string
): Promise<StartAttemptResult> {
  await connectToDatabase();

  const subject = await SubjectModel.findOne({ _id: subjectId, ...STUDENT_SUBJECT_FILTER })
    .select("durationMin")
    .lean();
  if (!subject) return { ok: false, reason: "SUBJECT_UNAVAILABLE" };

  const stale = await ExamAttemptModel.findOne({ userId, subjectId, status: "IN_PROGRESS" })
    .sort({ startedAt: -1 })
    .select("startedAt")
    .lean();

  if (stale) {
    if (!isPastDeadline(stale.startedAt, subject.durationMin)) {
      return { ok: true, attemptId: String(stale._id), resumed: true };
    }
    // Out of time: bank the result before letting the student start again.
    await gradeAndSubmitAttempt(String(stale._id), { autoSubmitted: true }).catch(() => undefined);
  }

  // Snapshot the live question set. Ordering is the bank's own order so admins control
  // it; the `order` field freezes it for this attempt.
  const questions = await QuestionModel.find({ subjectId, isActive: true })
    .sort({ createdAt: 1, _id: 1 })
    .select("_id")
    .lean();
  if (questions.length === 0) return { ok: false, reason: "NO_QUESTIONS" };

  // The attempt and its answer snapshot must land together — a half-written attempt would
  // show a student an exam with missing questions. Requires a replica set (Atlas is one).
  const session = await mongoose.startSession();
  let result: { id: string; resumed: boolean };

  try {
    result = await session.withTransaction(async () => {
      // Re-checked inside the transaction so two rapid "Start" clicks resume one attempt
      // instead of racing to create two.
      const existing = await ExamAttemptModel.findOne({
        userId,
        subjectId,
        status: "IN_PROGRESS",
      })
        .sort({ startedAt: -1 })
        .select("_id")
        .session(session)
        .lean();
      if (existing) return { id: String(existing._id), resumed: true };

      const priorAttempts = await ExamAttemptModel.countDocuments({ userId, subjectId }).session(
        session
      );

      const [created] = await ExamAttemptModel.create(
        [
          {
            userId,
            subjectId,
            status: "IN_PROGRESS",
            attemptNumber: priorAttempts + 1,
          },
        ],
        { session }
      );

      // Prisma's nested `answers.create` becomes an explicit insert of the snapshot.
      await UserAnswerModel.insertMany(
        questions.map((question, index) => ({
          attemptId: String(created._id),
          questionId: String(question._id),
          order: index,
        })),
        { session }
      );

      return { id: String(created._id), resumed: false };
    });
  } finally {
    await session.endSession();
  }

  return { ok: true, attemptId: result.id, resumed: result.resumed };
}

export type ExamQuestion = {
  id: string;
  order: number;
  text: string;
  type: QuestionType;
  points: number;
  topicName: string | null;
  /** Option text only — `isCorrect` is deliberately absent from this payload. */
  options: { id: string; text: string }[];
  selectedOptionIds: string[];
  isSkipped: boolean;
  isFlagged: boolean;
};

export type ExamState = {
  attemptId: string;
  attemptNumber: number;
  subject: { slug: string; title: string; durationMin: number; passMark: number };
  startedAt: string;
  secondsRemaining: number;
  totalPoints: number;
  questions: ExamQuestion[];
};

/** The populated shape `loadExamState` reads. Declared because `.lean()` can't infer virtuals. */
type ExamStateRow = {
  _id: string;
  attemptNumber: number;
  startedAt: Date;
  subject: { slug: string; title: string; durationMin: number; passMark: number };
  answers: Array<{
    order: number;
    selectedOptionId: string | null;
    selectedOptionIds: string[];
    isSkipped: boolean;
    question: {
      id: string;
      text: string;
      type: QuestionType;
      points: number;
      topic: { name: string } | null;
      options: Array<{ id: string; text: string }>;
    } | null;
  }>;
  flags: Array<{ questionId: string }>;
};

/**
 * Builds the runner payload for an in-progress attempt.
 *
 * This is the response a student's browser receives, so it carries no correctness data at
 * all: options are selected as `text` only and mapped to `{ id, text }` below, and neither
 * `isCorrect` nor `explanation` is ever projected. Grading reads those straight from the
 * database at submit time instead. Widening either `select` here would leak the answer key
 * into a payload the student can read.
 */
export async function loadExamState(attemptId: string, userId: string): Promise<ExamState | null> {
  await connectToDatabase();

  const raw = await ExamAttemptModel.findOne({
    _id: attemptId,
    userId,
    status: "IN_PROGRESS",
  })
    .populate({ path: "subject", select: "slug title durationMin passMark" })
    .populate({
      path: "answers",
      options: { sort: { order: 1 } },
      select: "order selectedOptionId selectedOptionIds isSkipped questionId",
      populate: {
        path: "question",
        select: "text type points topicId",
        populate: [
          { path: "topic", select: "name" },
          { path: "options", select: "text order", options: { sort: { order: 1 } } },
        ],
      },
    })
    .populate({ path: "flags", select: "questionId" })
    .lean();

  if (!raw) return null;

  const attempt = normalizeIds(raw) as unknown as ExamStateRow;
  if (!attempt.subject) return null;

  const flagged = new Set(attempt.flags.map((flag) => flag.questionId));

  const questions: ExamQuestion[] = attempt.answers
    // A question deleted from the bank after the attempt started leaves its snapshot row
    // with nothing to populate; skip it rather than rendering a blank card.
    .filter((answer) => answer.question !== null)
    .map((answer) => {
      const question = answer.question!;
      const selected = new Set((answer.selectedOptionIds ?? []).filter(Boolean));
      if (answer.selectedOptionId) selected.add(answer.selectedOptionId);

      return {
        id: question.id,
        order: answer.order,
        text: question.text,
        type: question.type,
        points: question.points,
        topicName: question.topic?.name ?? null,
        // Mapped rather than passed through, so no field added to the option schema later
        // can silently reach the client.
        options: (question.options ?? []).map((option) => ({
          id: option.id,
          text: option.text,
        })),
        selectedOptionIds: [...selected],
        isSkipped: answer.isSkipped,
        isFlagged: flagged.has(question.id),
      };
    });

  return {
    attemptId: String(attempt._id),
    attemptNumber: attempt.attemptNumber,
    subject: attempt.subject,
    startedAt: attempt.startedAt.toISOString(),
    secondsRemaining: secondsRemaining(attempt.startedAt, attempt.subject.durationMin),
    totalPoints: questions.reduce((sum, question) => sum + question.points, 0),
    questions,
  };
}

/**
 * Records a student's selection for one question.
 *
 * The `UserAnswer` document must already exist — it was created when the attempt started —
 * so a questionId outside this attempt's snapshot is rejected rather than inserted.
 * Every submitted option id is checked to belong to that same question, and the
 * question's type decides how many selections are allowed. Correctness is *not*
 * evaluated or stored here; `isCorrect` stays null until the attempt is graded.
 */
export async function saveAnswer(
  attemptId: string,
  userId: string,
  input: { questionId: string; selectedOptionIds: string[]; isSkipped: boolean }
): Promise<SaveOutcome> {
  const attempt = await loadOwnedAttempt(attemptId, userId);
  if (!attempt) return { ok: false, reason: "NOT_FOUND" };
  if (attempt.status !== "IN_PROGRESS") return { ok: false, reason: "SUBMITTED" };
  if (isPastDeadline(attempt.startedAt, attempt.subject.durationMin, SAVE_GRACE_SEC)) {
    return { ok: false, reason: "EXPIRED" };
  }

  // Was findUnique on the @@unique([attemptId, questionId]) key; the same pair is now a
  // unique compound index, so this still matches at most one document.
  const answerRaw = await UserAnswerModel.findOne({ attemptId, questionId: input.questionId })
    .select("questionId")
    .populate({
      path: "question",
      select: "type",
      populate: { path: "options", select: "_id" },
    })
    .lean();
  if (!answerRaw) return { ok: false, reason: "NOT_FOUND" };

  const answer = normalizeIds(answerRaw) as unknown as {
    id: string;
    question: { type: QuestionType; options: Array<{ id: string }> } | null;
  };
  if (!answer.question) return { ok: false, reason: "NOT_FOUND" };

  const validIds = new Set(answer.question.options.map((option) => option.id));
  const selected = [...new Set(input.selectedOptionIds)];

  if (selected.some((id) => !validIds.has(id))) return { ok: false, reason: "BAD_OPTION" };
  if (answer.question.type !== "MULTIPLE_CHOICE" && selected.length > 1) {
    return { ok: false, reason: "TOO_MANY" };
  }

  const isMultiSelect = answer.question.type === "MULTIPLE_CHOICE";
  const answered = selected.length > 0;

  await UserAnswerModel.updateOne(
    { _id: answer.id },
    {
      $set: {
        // Single-answer types also populate the scalar relation so result review can join
        // straight to the chosen option; multiple-choice keeps the array only.
        selectedOptionId: isMultiSelect ? null : selected[0] ?? null,
        selectedOptionIds: selected,
        // Choosing an answer clears a previous skip; an explicit skip only sticks while
        // nothing is selected.
        isSkipped: answered ? false : input.isSkipped,
        answeredAt: answered ? new Date() : null,
      },
    }
  );

  return { ok: true };
}

/** Adds or removes a flag for one question in an attempt. Flags are per attempt. */
export async function setFlag(
  attemptId: string,
  userId: string,
  input: { questionId: string; flagged: boolean }
): Promise<SaveOutcome> {
  const attempt = await loadOwnedAttempt(attemptId, userId);
  if (!attempt) return { ok: false, reason: "NOT_FOUND" };
  if (attempt.status !== "IN_PROGRESS") return { ok: false, reason: "SUBMITTED" };

  const inAttempt = await UserAnswerModel.findOne({ attemptId, questionId: input.questionId })
    .select("_id")
    .lean();
  if (!inAttempt) return { ok: false, reason: "NOT_FOUND" };

  if (input.flagged) {
    // `$setOnInsert` reproduces Prisma's `update: {}` — re-flagging an already-flagged
    // question must not move its createdAt.
    await FlaggedQuestionModel.updateOne(
      { attemptId, questionId: input.questionId },
      { $setOnInsert: { attemptId, questionId: input.questionId, userId } },
      { upsert: true }
    );
  } else {
    await FlaggedQuestionModel.deleteMany({ attemptId, questionId: input.questionId });
  }

  return { ok: true };
}
