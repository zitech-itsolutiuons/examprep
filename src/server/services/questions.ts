import type { ClientSession } from "mongoose";

import { connectToDatabase } from "@/lib/mongoose";
import { normalizeIds } from "@/lib/serialize";
import { QuestionModel, QuestionOptionModel, TopicModel, UserAnswerModel } from "@/models";
import { countByParent } from "@/server/services/counts";
import type { QuestionOptionInput } from "@/server/validators/question";

/** Thrown when an option can't be removed because students already selected it. */
export class OptionInUseError extends Error {
  constructor(public count: number) {
    super(
      `Cannot remove an option that ${count} recorded answer(s) point to. Edit its text instead, or deactivate the question.`
    );
    this.name = "OptionInUseError";
  }
}

/**
 * Reconciles a question's options against the submitted set.
 *
 * Options carrying an `id` are updated in place; new ones are created; ones dropped from
 * the payload are deleted — but only when no `UserAnswer` references them, so historical
 * result reviews never lose the answer a student actually picked.
 *
 * Takes the Mongoose `ClientSession` where it used to take a Prisma transaction client, so
 * the whole reconciliation still commits or rolls back as one unit.
 */
export async function syncQuestionOptions(
  session: ClientSession | null,
  questionId: string,
  options: QuestionOptionInput[]
) {
  // Mongoose's option types accept `undefined` but not `null` for a session.
  const ses = session ?? undefined;

  const existing = await QuestionOptionModel.find({ questionId })
    .select("_id")
    .session(session)
    .lean();

  const existingIds = new Set(existing.map((o) => String(o._id)));
  const incomingIds = new Set(options.map((o) => o.id).filter((id): id is string => !!id));
  const removedIds = [...existingIds].filter((id) => !incomingIds.has(id));

  if (removedIds.length > 0) {
    const referenced = await UserAnswerModel.countDocuments({
      selectedOptionId: { $in: removedIds },
    }).session(session);
    if (referenced > 0) throw new OptionInUseError(referenced);

    await QuestionOptionModel.deleteMany({ _id: { $in: removedIds } }, { session: ses });
  }

  // `order` follows the position in the submitted array so admins control display order.
  for (const [index, option] of options.entries()) {
    if (option.id && existingIds.has(option.id)) {
      await QuestionOptionModel.updateOne(
        { _id: option.id },
        { $set: { text: option.text, isCorrect: option.isCorrect, order: index } },
        { session: ses }
      );
    } else {
      await QuestionOptionModel.create(
        [
          {
            questionId,
            text: option.text,
            isCorrect: option.isCorrect,
            order: index,
          },
        ],
        { session: ses }
      );
    }
  }
}

/** Verifies a topic exists and belongs to the given subject. */
export async function topicBelongsToSubject(topicId: string, subjectId: string) {
  await connectToDatabase();
  const topic = await TopicModel.findOne({ _id: topicId }).select("subjectId").lean();
  return !!topic && topic.subjectId === subjectId;
}

/**
 * Relations loaded alongside a question by both admin question endpoints and the admin
 * question list. Was `Prisma.QuestionInclude`; the `_count.userAnswers` half of it is no
 * longer expressible in the read itself and is attached separately via
 * `countByParent(UserAnswerModel, "questionId", ids)`.
 */
export const questionPopulate = [
  { path: "options", options: { sort: { order: 1 } } },
  { path: "topic", select: "name" },
] as const;

/** A question with its options, topic, and the `_count` shape the admin UI reads. */
export type AdminQuestion = Record<string, unknown> & {
  id: string;
  _count: { userAnswers: number };
};

/**
 * Attaches `_count.userAnswers` to questions read with `questionPopulate`.
 *
 * Prisma returned this inside the query; here it is one grouped count for the whole list,
 * so an admin page of 200 questions still costs a single extra round trip rather than 200.
 */
async function withAnswerCounts(rows: unknown[]): Promise<AdminQuestion[]> {
  const questions = normalizeIds(rows) as unknown as Array<Record<string, unknown> & { id: string }>;

  const counts = await countByParent(
    UserAnswerModel,
    "questionId",
    questions.map((question) => question.id)
  );

  return questions.map((question) => ({
    ...question,
    _count: { userAnswers: counts.get(question.id) ?? 0 },
  }));
}

/** One question in the admin shape, or null. */
export async function loadAdminQuestion(questionId: string): Promise<AdminQuestion | null> {
  await connectToDatabase();

  const row = await QuestionModel.findOne({ _id: questionId })
    .populate(questionPopulate as unknown as string[])
    .lean();

  if (!row) return null;
  return (await withAnswerCounts([row]))[0];
}

/**
 * The admin question list for one subject, oldest first — the order the bank is served in.
 *
 * `search` is matched case-insensitively against the question text, which was Prisma's
 * `contains` with `mode: "insensitive"`; Mongo expresses it as an escaped `$regex` with
 * the `i` flag.
 */
export async function loadAdminQuestions(filter: {
  subjectId: string;
  topicId?: string | null;
  search?: string | null;
}): Promise<AdminQuestion[]> {
  await connectToDatabase();

  const rows = await QuestionModel.find({
    subjectId: filter.subjectId,
    ...(filter.topicId ? { topicId: filter.topicId } : {}),
    ...(filter.search
      ? { text: { $regex: escapeRegex(filter.search), $options: "i" } }
      : {}),
  })
    .sort({ createdAt: 1, _id: 1 })
    .populate(questionPopulate as unknown as string[])
    .lean();

  return withAnswerCounts(rows);
}

/** Escapes regex metacharacters so a search term is matched literally. */
function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
