import { z } from "zod";

/**
 * The shared id validator.
 *
 * Prisma filled every primary key with `cuid()`, so the schemas here used `z.string().cuid()`.
 * The Mongoose models generate `randomUUID()` instead (see `newId` in `src/models/index.ts`),
 * and a UUID does NOT satisfy zod's `.cuid()` check — it rejects anything that isn't
 * `c` + base36. Left as `.cuid()`, every id-carrying request body would 400: starting an
 * attempt, saving an answer, flagging a question, creating a question or topic.
 *
 * This is deliberately permissive rather than `.uuid()`. Documents seeded under Prisma keep
 * their cuid ids after the data migration, so both shapes must pass — and a bad id is
 * already handled downstream, where the lookup simply misses and the route returns its 404.
 * The only job here is to reject junk long before it reaches a query.
 */
export const id = (message = "Invalid id") =>
  z
    .string()
    .trim()
    .min(1, message)
    .max(64, message)
    // cuid, uuid (with or without dashes), and Mongo's own 24-char hex ObjectId.
    .regex(/^[A-Za-z0-9_-]+$/, message);
