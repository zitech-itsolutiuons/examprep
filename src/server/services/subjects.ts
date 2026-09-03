import { connectToDatabase } from "@/lib/mongoose";
import { slugify } from "@/lib/slug";
import { QuestionModel, SubjectModel } from "@/models";

/** Escapes regex metacharacters so a slug prefix is matched literally. */
function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Builds a slug from `title` that no other subject holds, appending -2, -3, … on collision.
 * `excludeId` lets an update keep its own slug without tripping the uniqueness check.
 */
export async function uniqueSubjectSlug(title: string, excludeId?: string) {
  const base = slugify(title) || "subject";

  await connectToDatabase();

  // Prisma's `startsWith` becomes an anchored regex. `slugify` only ever emits [a-z0-9-],
  // but the input is escaped anyway so a future change to slugify can't turn a title into
  // a pattern that matches unrelated slugs.
  const taken = await SubjectModel.find({
    slug: { $regex: `^${escapeRegex(base)}` },
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  })
    .select("slug")
    .lean();

  const takenSet = new Set(taken.map((s) => s.slug));
  if (!takenSet.has(base)) return base;

  let n = 2;
  while (takenSet.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/** Counts questions that would actually be served to a student for this subject. */
export async function activeQuestionCount(subjectId: string) {
  await connectToDatabase();
  return QuestionModel.countDocuments({ subjectId, isActive: true });
}
