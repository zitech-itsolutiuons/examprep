/**
 * `_id` → `id` normalisation.
 *
 * The app was written against Prisma, where every document exposes `id`. MongoDB stores the
 * primary key as `_id`, and `.lean()` reads hand back the raw shape — so without this the
 * rename would have to be repeated at all ~140 read sites, and every one of them would be a
 * chance to forget.
 *
 * Two mechanisms cover it between them:
 *
 *   - The `idPlugin` in `src/models/index.ts` registers post-hooks on the query methods, so
 *     ordinary `.lean()` reads come back already carrying `id`. That is the common path and
 *     needs nothing at the call site.
 *
 *   - `serialize()` here is the manual escape hatch for results the hooks never see:
 *     `.aggregate()` pipelines, and hydrated documents returned by `create()`.
 *
 * Both are idempotent, so running one over the other's output is harmless.
 *
 * NOTE ON DATES: nothing here JSON round-trips. `Date` values must survive as `Date` —
 * callers do real date arithmetic on them (`row.expiresAt.getTime()` in the guest-access
 * service, `lastAttemptAt` comparisons in progress). Stringifying them would typecheck
 * fine and fail at runtime.
 */

type WithId = { id: string };

/** True for a plain object — not a Date, array, ObjectId, or Mongoose document. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return false;
  if (value instanceof Date) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Copies `_id` to `id` throughout a lean result, in place.
 *
 * Recurses so populated relations are covered too: a question read with its options gets
 * `id` on the question AND on every option. `_id` is deliberately left in place rather than
 * deleted — removing it would break any code that round-trips a document back into a query.
 */
export function normalizeIds<T>(value: T): T {
  if (Array.isArray(value)) {
    for (const entry of value) normalizeIds(entry);
    return value;
  }

  if (!isPlainObject(value)) return value;

  if ("_id" in value && value._id != null && !("id" in value)) {
    (value as Record<string, unknown>).id = String(value._id);
  }

  for (const key of Object.keys(value)) {
    if (key === "_id" || key === "id") continue;
    normalizeIds(value[key]);
  }

  return value;
}

/**
 * Normalises a result the query hooks did not touch, and types it as the domain shape.
 *
 * Use after `.aggregate()` and after `create()`. A hydrated Mongoose document is converted
 * to a POJO first — handing one straight to a React Server Component would otherwise fail
 * serialisation at the server/client boundary. `toObject` is given `flattenMaps` so nested
 * Maps become plain objects, and `depopulate: false` so populated relations are kept.
 */
export function serialize<T>(doc: null | undefined): null;
export function serialize<T>(doc: unknown): T & WithId;
export function serialize<T>(doc: unknown): (T & WithId) | null {
  if (doc == null) return null;

  const plain =
    typeof (doc as { toObject?: unknown }).toObject === "function"
      ? (doc as { toObject: (opts?: Record<string, unknown>) => unknown }).toObject({
          flattenMaps: true,
          depopulate: false,
        })
      : doc;

  return normalizeIds(plain) as T & WithId;
}

/** Same, for a list. */
export function serializeMany<T>(docs: unknown[]): Array<T & WithId> {
  return docs.map((doc) => serialize<T>(doc));
}
