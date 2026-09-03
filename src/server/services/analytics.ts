import { connectToDatabase } from "@/lib/mongoose";
import {
  ExamAttemptModel,
  QuestionModel,
  SubjectModel,
  UserAnswerModel,
  UserModel,
} from "@/models";
import { countByParent } from "@/server/services/counts";

/**
 * Attempts that count toward the reported figures.
 *
 * Guest attempts are deliberately excluded from every statistic on this screen. A demo code
 * handed out to a class would otherwise move the platform-wide averages and pass rates that
 * an admin uses to judge real student performance. The attempts themselves stay fully
 * browsable under /admin/attempts, where the Guests filter separates them out.
 *
 * Prisma expressed this as a join (`user: { role: { not: "GUEST" } }`). MongoDB has none, so
 * the guest ids are read once and negated with `$nin`. Guests are the bounded side of the
 * comparison — capped per code and swept after 30 days — so this stays far smaller than
 * listing every real account would. The same trade-off is made in `home.ts`.
 */
async function nonGuestFilter(): Promise<Record<string, unknown>> {
  const guestIds = await UserModel.distinct("_id", { role: "GUEST" });
  return guestIds.length > 0 ? { userId: { $nin: guestIds.map(String) } } : {};
}

export type PlatformOverview = {
  users: number;
  admins: number;
  students: number;
  activeUsers: number;
  subjects: number;
  publishedSubjects: number;
  questions: number;
  activeQuestions: number;
  attempts: number;
  submittedAttempts: number;
  inProgressAttempts: number;
  averagePercentage: number | null;
  passRate: number | null;
};

export type SubjectStat = {
  id: string;
  title: string;
  isPublished: boolean;
  isActive: boolean;
  passMark: number;
  questionCount: number;
  attemptCount: number;
  averagePercentage: number | null;
  bestPercentage: number | null;
  passCount: number;
  passRate: number | null;
};

export type HardQuestion = {
  id: string;
  text: string;
  subjectId: string;
  subjectTitle: string;
  answered: number;
  correct: number;
  correctRate: number;
};

export type ScoreBucket = { label: string; from: number; to: number; count: number };

function round(value: number | null | undefined, dp = 1): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return Number(value.toFixed(dp));
}

/**
 * Per-subject attempt statistics.
 *
 * Pass rate compares each attempt's percentage against its own subject's pass mark, which
 * is not expressible as a single cross-field filter — so it's one bounded count per subject
 * rather than a scan of every attempt row.
 */
export async function getSubjectStats(): Promise<SubjectStat[]> {
  await connectToDatabase();

  const subjects = await SubjectModel.find()
    .sort({ title: 1 })
    .select("title isPublished isActive passMark")
    .lean();

  if (subjects.length === 0) return [];

  const nonGuest = await nonGuestFilter();
  const subjectIds = subjects.map((subject) => String(subject._id));

  const [questionCounts, grouped, passCounts] = await Promise.all([
    countByParent(QuestionModel, "subjectId", subjectIds),
    // Was `groupBy({ by: ["subjectId"], _count, _avg, _max })`.
    ExamAttemptModel.aggregate<{ _id: string; count: number; avg: number | null; max: number | null }>([
      { $match: { status: "SUBMITTED", subjectId: { $in: subjectIds }, ...nonGuest } },
      {
        $group: {
          _id: "$subjectId",
          count: { $sum: 1 },
          avg: { $avg: "$percentage" },
          max: { $max: "$percentage" },
        },
      },
    ]),
    Promise.all(
      subjects.map((subject) =>
        ExamAttemptModel.countDocuments({
          subjectId: String(subject._id),
          status: "SUBMITTED",
          percentage: { $gte: subject.passMark },
          ...nonGuest,
        })
      )
    ),
  ]);

  const byId = new Map(grouped.map((row) => [String(row._id), row]));

  return subjects.map((subject, index) => {
    const id = String(subject._id);
    const row = byId.get(id);
    const attemptCount = row?.count ?? 0;
    const passCount = passCounts[index];

    return {
      id,
      title: subject.title,
      isPublished: subject.isPublished,
      isActive: subject.isActive,
      passMark: subject.passMark,
      questionCount: questionCounts.get(id) ?? 0,
      attemptCount,
      averagePercentage: round(row?.avg),
      bestPercentage: round(row?.max),
      passCount,
      passRate: attemptCount > 0 ? round((passCount / attemptCount) * 100) : null,
    };
  });
}

export async function getPlatformOverview(): Promise<PlatformOverview> {
  await connectToDatabase();

  const nonGuest = await nonGuestFilter();

  const [
    users,
    admins,
    activeUsers,
    subjects,
    publishedSubjects,
    questions,
    activeQuestions,
    attempts,
    submittedAttempts,
    inProgressAttempts,
    scoreAggregate,
    subjectStats,
  ] = await Promise.all([
    UserModel.countDocuments({ role: { $ne: "GUEST" } }),
    UserModel.countDocuments({ role: "ADMIN" }),
    UserModel.countDocuments({ isActive: true, role: { $ne: "GUEST" } }),
    SubjectModel.countDocuments(),
    SubjectModel.countDocuments({ isPublished: true, isActive: true }),
    QuestionModel.countDocuments(),
    QuestionModel.countDocuments({ isActive: true }),
    ExamAttemptModel.countDocuments(nonGuest),
    ExamAttemptModel.countDocuments({ status: "SUBMITTED", ...nonGuest }),
    ExamAttemptModel.countDocuments({ status: "IN_PROGRESS", ...nonGuest }),
    ExamAttemptModel.aggregate<{ avg: number | null }>([
      { $match: { status: "SUBMITTED", ...nonGuest } },
      { $group: { _id: null, avg: { $avg: "$percentage" } } },
    ]).then((rows) => rows[0]?.avg ?? null),
    getSubjectStats(),
  ]);

  const totalPasses = subjectStats.reduce((sum, stat) => sum + stat.passCount, 0);

  return {
    users,
    admins,
    students: users - admins,
    activeUsers,
    subjects,
    publishedSubjects,
    questions,
    activeQuestions,
    attempts,
    submittedAttempts,
    inProgressAttempts,
    averagePercentage: round(scoreAggregate),
    passRate: submittedAttempts > 0 ? round((totalPasses / submittedAttempts) * 100) : null,
  };
}

/**
 * Questions students get wrong most often — the signal an admin needs to spot a badly
 * worded question or a topic that needs better teaching material.
 *
 * Prisma filtered on the related attempt (`attempt: { status: "SUBMITTED" }`). Without joins
 * the qualifying attempt ids are resolved first and matched with `$in`, and the totals and
 * correct counts come back from one grouping rather than two.
 */
export async function getHardestQuestions(limit = 10, minAnswers = 3): Promise<HardQuestion[]> {
  await connectToDatabase();

  const nonGuest = await nonGuestFilter();

  const attemptIds = await ExamAttemptModel.distinct("_id", {
    status: "SUBMITTED",
    ...nonGuest,
  });

  if (attemptIds.length === 0) return [];

  const totals = await UserAnswerModel.aggregate<{
    _id: string;
    answered: number;
    correct: number;
  }>([
    { $match: { attemptId: { $in: attemptIds.map(String) } } },
    {
      $group: {
        _id: "$questionId",
        answered: { $sum: 1 },
        // One pass for both figures; `isCorrect` is null for an unanswered question, so the
        // comparison counts only genuinely correct answers.
        correct: { $sum: { $cond: [{ $eq: ["$isCorrect", true] }, 1, 0] } },
      },
    },
    { $match: { answered: { $gte: minAnswers } } },
    { $sort: { answered: -1 } },
  ]);

  if (totals.length === 0) return [];

  const ranked = totals
    .map((row) => ({
      questionId: String(row._id),
      answered: row.answered,
      correct: row.correct,
      correctRate: row.correct / row.answered,
    }))
    .sort((a, b) => a.correctRate - b.correctRate || b.answered - a.answered)
    .slice(0, limit);

  const questions = await QuestionModel.find({ _id: { $in: ranked.map((row) => row.questionId) } })
    .select("text subjectId")
    .populate({ path: "subject", select: "title" })
    .lean();

  const questionById = new Map(questions.map((question) => [String(question._id), question]));

  return ranked.flatMap((row) => {
    const question = questionById.get(row.questionId);
    if (!question) return [];

    const subject = (question as { subject?: { title?: string } | null }).subject;

    return [
      {
        id: row.questionId,
        text: question.text,
        subjectId: question.subjectId,
        subjectTitle: subject?.title ?? "—",
        answered: row.answered,
        correct: row.correct,
        correctRate: Number((row.correctRate * 100).toFixed(1)),
      },
    ];
  });
}

/** Ten-point score buckets across all submitted attempts. */
export async function getScoreDistribution(): Promise<ScoreBucket[]> {
  await connectToDatabase();

  const nonGuest = await nonGuestFilter();

  const ranges = Array.from({ length: 10 }, (_, index) => ({
    from: index * 10,
    to: index === 9 ? 100 : index * 10 + 10,
  }));

  const counts = await Promise.all(
    ranges.map((range, index) =>
      ExamAttemptModel.countDocuments({
        status: "SUBMITTED",
        ...nonGuest,
        // The top bucket is inclusive of 100 so a perfect score is counted somewhere.
        percentage:
          index === 9 ? { $gte: range.from, $lte: 100 } : { $gte: range.from, $lt: range.to },
      })
    )
  );

  return ranges.map((range, index) => ({
    label: `${range.from}–${range.to}%`,
    from: range.from,
    to: range.to,
    count: counts[index],
  }));
}
