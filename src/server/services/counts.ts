import type { FilterQuery, Model } from "mongoose";

/** Any registered model — the aggregation below only needs `.aggregate()`. */
type AnyModel = Pick<Model<never>, "aggregate">;

/**
 * Relation counts — the replacement for Prisma's `_count`.
 *
 * Prisma answered `_count: { select: { questions: true } }` with a correlated subquery, so
 * a list of subjects came back with its per-subject totals already attached. MongoDB has
 * no equivalent inside a `find`, and counting per parent would mean one round trip per row
 * — the N+1 that makes admin list pages slow.
 *
 * Instead each relation is counted ONCE for the whole page with a `$group` aggregation,
 * and the totals are attached to the parents in memory. Two queries per relation-count,
 * regardless of how many rows the page shows.
 */

/**
 * Totals for `foreignField`, grouped, for the given parent ids.
 *
 * `match` carries the filtered variants — Prisma's
 * `_count: { select: { questions: { where: { isActive: true } } } }` becomes
 * `match: { isActive: true }`.
 */
export async function countByParent(
  model: AnyModel,
  foreignField: string,
  parentIds: string[],
  match: FilterQuery<unknown> = {}
): Promise<Map<string, number>> {
  if (parentIds.length === 0) return new Map();

  const rows = await model.aggregate([
    { $match: { ...match, [foreignField]: { $in: parentIds } } },
    { $group: { _id: `$${foreignField}`, n: { $sum: 1 } } },
  ]);

  return new Map(rows.map((row) => [String(row._id), row.n as number]));
}

/**
 * Attaches a `_count` object to each row, so downstream code keeps reading
 * `subject._count.questions` exactly as it did under Prisma.
 *
 * A parent with no children is absent from the aggregation result entirely, so every key
 * is defaulted to 0 — otherwise a subject with no questions would render `undefined`.
 */
export function attachCounts<T extends { id: string }>(
  rows: T[],
  counts: Record<string, Map<string, number>>
): Array<T & { _count: Record<string, number> }> {
  return rows.map((row) => {
    const _count: Record<string, number> = {};
    for (const [key, map] of Object.entries(counts)) {
      _count[key] = map.get(row.id) ?? 0;
    }
    return { ...row, _count };
  });
}

/** Single-row form of `attachCounts`, for a detail page. */
export function attachCount<T extends { id: string }>(
  row: T,
  counts: Record<string, Map<string, number>>
): T & { _count: Record<string, number> } {
  return attachCounts([row], counts)[0];
}
