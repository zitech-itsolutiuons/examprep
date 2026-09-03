import type { ClientSession } from "mongoose";

import {
  ExamAttemptModel,
  FlaggedQuestionModel,
  HomePageModel,
  PasswordResetTokenModel,
  QuestionModel,
  QuestionOptionModel,
  SessionModel,
  SubjectModel,
  TopicModel,
  UserAnswerModel,
  UserProgressModel,
  AuditLogModel,
  UserModel,
} from "@/models";

/**
 * Referential integrity, by hand.
 *
 * The SQL schema declared 16 `onDelete` rules and Postgres enforced them; MongoDB has no
 * foreign keys, so deleting a document leaves every reference to it dangling. These
 * functions reimplement those rules and MUST be called instead of a bare `deleteOne` /
 * `deleteMany` on any of these collections. Nothing enforces that — a missed call shows up
 * later as orphaned answers or a results page that renders half a question set.
 *
 * The cascades are deliberately written as explicit functions rather than Mongoose
 * `pre('remove')` middleware: document middleware does not fire for `deleteMany`, which is
 * exactly the path the retention sweep uses, so hooks would have given a false sense of
 * cover on the one call that deletes in bulk.
 *
 * Every function takes an optional session so a cascade can join the caller's transaction.
 */

type Opts = { session?: ClientSession | null };

function s(opts?: Opts) {
  return opts?.session ? { session: opts.session } : {};
}

/**
 * ExamAttempt → UserAnswer, FlaggedQuestion.
 * Was: `onDelete: Cascade` on UserAnswer.attempt and FlaggedQuestion.attempt.
 */
export async function deleteAttempts(attemptIds: string[], opts?: Opts) {
  if (attemptIds.length === 0) return;

  await UserAnswerModel.deleteMany({ attemptId: { $in: attemptIds } }, s(opts));
  await FlaggedQuestionModel.deleteMany({ attemptId: { $in: attemptIds } }, s(opts));
  await ExamAttemptModel.deleteMany({ _id: { $in: attemptIds } }, s(opts));
}

/**
 * Question → QuestionOption, UserAnswer, FlaggedQuestion.
 * Was: `onDelete: Cascade` on all three.
 */
export async function deleteQuestions(questionIds: string[], opts?: Opts) {
  if (questionIds.length === 0) return;

  await QuestionOptionModel.deleteMany({ questionId: { $in: questionIds } }, s(opts));
  await UserAnswerModel.deleteMany({ questionId: { $in: questionIds } }, s(opts));
  await FlaggedQuestionModel.deleteMany({ questionId: { $in: questionIds } }, s(opts));
  await QuestionModel.deleteMany({ _id: { $in: questionIds } }, s(opts));
}

/**
 * Topic → Question.topicId set to null.
 * Was: `onDelete: SetNull` on Question.topic — questions outlive their topic.
 */
export async function deleteTopics(topicIds: string[], opts?: Opts) {
  if (topicIds.length === 0) return;

  await QuestionModel.updateMany(
    { topicId: { $in: topicIds } },
    { $set: { topicId: null } },
    s(opts)
  );
  await TopicModel.deleteMany({ _id: { $in: topicIds } }, s(opts));
}

/**
 * Subject → Topic, Question (and their cascades), ExamAttempt (and its cascades).
 * Was: `onDelete: Cascade` on Topic.subject, Question.subject, ExamAttempt.subject.
 */
export async function deleteSubjects(subjectIds: string[], opts?: Opts) {
  if (subjectIds.length === 0) return;

  const questionIds = await QuestionModel.distinct("_id", { subjectId: { $in: subjectIds } });
  await deleteQuestions(questionIds.map(String), opts);

  const attemptIds = await ExamAttemptModel.distinct("_id", { subjectId: { $in: subjectIds } });
  await deleteAttempts(attemptIds.map(String), opts);

  // After deleteQuestions, so the SetNull pass has nothing left to touch.
  await TopicModel.deleteMany({ subjectId: { $in: subjectIds } }, s(opts));
  await SubjectModel.deleteMany({ _id: { $in: subjectIds } }, s(opts));
}

/**
 * User → ExamAttempt (and its cascades), FlaggedQuestion, UserProgress,
 * PasswordResetToken, Session; AuditLog.userId and HomePage.updatedById set to null.
 *
 * This is the one the guest retention sweep relies on. Under Postgres it was a single
 * `DELETE FROM users`, and everything below happened inside the database.
 *
 * Subject.createdById and Question.createdById are deliberately NOT cascaded — Prisma
 * declared no referential action on them, so authored content outlives its author, and
 * deleting a guest must never remove a subject an admin wrote.
 */
export async function deleteUsers(userIds: string[], opts?: Opts) {
  if (userIds.length === 0) return;

  const attemptIds = await ExamAttemptModel.distinct("_id", { userId: { $in: userIds } });
  await deleteAttempts(attemptIds.map(String), opts);

  await FlaggedQuestionModel.deleteMany({ userId: { $in: userIds } }, s(opts));
  await UserProgressModel.deleteMany({ userId: { $in: userIds } }, s(opts));
  await PasswordResetTokenModel.deleteMany({ userId: { $in: userIds } }, s(opts));
  await SessionModel.deleteMany({ userId: { $in: userIds } }, s(opts));

  // SetNull, not Cascade: the audit trail and the landing-page edit stamp survive the
  // author's deletion.
  await AuditLogModel.updateMany({ userId: { $in: userIds } }, { $set: { userId: null } }, s(opts));
  await HomePageModel.updateMany(
    { updatedById: { $in: userIds } },
    { $set: { updatedById: null } },
    s(opts)
  );

  await UserModel.deleteMany({ _id: { $in: userIds } }, s(opts));
}
