import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slug";

/**
 * Builds a slug from `title` that no other subject holds, appending -2, -3, … on collision.
 * `excludeId` lets an update keep its own slug without tripping the uniqueness check.
 */
export async function uniqueSubjectSlug(title: string, excludeId?: string) {
  const base = slugify(title) || "subject";

  const taken = await prisma.subject.findMany({
    where: {
      slug: { startsWith: base },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { slug: true },
  });

  const takenSet = new Set(taken.map((s) => s.slug));
  if (!takenSet.has(base)) return base;

  let n = 2;
  while (takenSet.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/** Counts questions that would actually be served to a student for this subject. */
export function activeQuestionCount(subjectId: string) {
  return prisma.question.count({ where: { subjectId, isActive: true } });
}
