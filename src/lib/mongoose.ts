import mongoose from "mongoose";

/**
 * The MongoDB connection, cached across serverless invocations.
 *
 * WHY THE GLOBAL: on Vercel every request may land on a warm Lambda that already ran this
 * module. Calling `mongoose.connect()` per request would open a new pool each time and
 * exhaust Atlas's connection limit within minutes. Stashing the connection on `globalThis`
 * means a warm instance reuses the pool it already has, and only a cold start dials out.
 *
 * The in-flight PROMISE is cached too, not just the resolved connection. Two requests can
 * arrive on the same instance before the first connect settles; caching the promise makes
 * the second await the first rather than opening a competing pool.
 */

type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

const globalForMongoose = globalThis as unknown as {
  mongoose: MongooseCache | undefined;
};

const cached: MongooseCache = globalForMongoose.mongoose ?? { conn: null, promise: null };

if (!globalForMongoose.mongoose) {
  globalForMongoose.mongoose = cached;
}

/**
 * Resolves to a live Mongoose connection, dialling only on a cold start.
 *
 * Every model call must be preceded by this — Mongoose would otherwise buffer the operation
 * and, with `bufferCommands` off, throw instead. `withDb()` below is the ergonomic wrapper.
 */
export async function connectToDatabase(): Promise<typeof mongoose> {
  if (cached.conn) return cached.conn;

  // Read at call time, not at module scope. Next.js has already populated `process.env` by
  // the time a request runs, but the standalone scripts in `scripts/` load `.env` themselves
  // and import this module in the same tick — a module-scope capture would read `undefined`
  // there and every `npm run db:*` command would fail with the error below.
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error(
      "MONGODB_URI is not set. Add it to .env locally and to the Vercel project's " +
        "environment variables — every page below / reads the database on request."
    );
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(uri, {
      // Fail fast rather than hanging a request for the default 30s when Atlas is
      // unreachable or the IP is not allow-listed — the usual first-deploy mistake.
      serverSelectionTimeoutMS: 10_000,
      // Left ON deliberately. Every entry point calls `connectToDatabase()` first, but this
      // migration touches ~140 call sites and missing one is plausible; with buffering a
      // stray query waits for the pool instead of throwing. Queries still fail fast if the
      // connection itself never comes up, because of the timeout above.
      bufferCommands: true,
      // One pool per Lambda instance; Atlas's free tier caps total connections at 500 and
      // Vercel can hold many warm instances at once.
      maxPoolSize: 10,
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (error) {
    // Clear the rejected promise so the next request retries instead of re-awaiting a
    // permanently failed connect for the life of the instance.
    cached.promise = null;
    throw error;
  }

  return cached.conn;
}

/** Ensures the connection is up, then runs `fn`. The normal way to reach a model. */
export async function withDb<T>(fn: () => Promise<T>): Promise<T> {
  await connectToDatabase();
  return fn();
}

/**
 * True for a unique-index violation — the replacement for Prisma's `P2002`.
 *
 * MongoDB reports these as error code 11000 ("E11000 duplicate key error"). Routes that
 * relied on catching P2002 (a duplicate topic name, a re-used email) must test for this
 * instead, or the conflict surfaces as an unhandled 500 rather than the intended 409.
 *
 * Mongoose surfaces the driver's code on the error object rather than in a subclass, and
 * `insertMany` wraps it, so the nested `writeErrors` are checked too.
 */
export function isDuplicateKeyError(error: unknown): boolean {
  if (error === null || typeof error !== "object") return false;

  const candidate = error as {
    code?: unknown;
    writeErrors?: Array<{ code?: unknown; err?: { code?: unknown } }>;
  };

  if (candidate.code === 11000 || candidate.code === 11001) return true;

  return (
    candidate.writeErrors?.some(
      (writeError) =>
        writeError?.code === 11000 ||
        writeError?.err?.code === 11000 ||
        writeError?.code === 11001
    ) ?? false
  );
}

export { mongoose };
