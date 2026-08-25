import { randomInt } from "crypto";

import type { GuestAccessCode } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/** Single row; the table never holds more than one. */
export const GUEST_CODE_ID = "current";

/** How long an issued code stays redeemable, and how long a redeemed session lasts. */
export const CODE_TTL_HOURS = 12;

/** A guest row and its attempts are deleted this long after the session lapsed. */
export const GUEST_RETENTION_DAYS = 30;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * How long a cached code is trusted before re-reading the row.
 *
 * This is the whole load story. Redeeming is rare, but *validating* happens on every guest
 * request, so the read has to be near-free. 30s means one query per 30s per process no matter
 * how many guests are online, and it bounds how long a reset can take to propagate — see
 * `resetGuestCode`, which refreshes the cache in-process immediately, so the delay only
 * applies to other instances.
 */
const CACHE_TTL_MS = 30 * 1000;

// Module scope: one cache per server process, shared by every request it handles.
let cached: { row: GuestAccessCode; readAt: number } | null = null;

function putCache(row: GuestAccessCode) {
  cached = { row, readAt: Date.now() };
  return row;
}

/** Drops the cache so the next read hits the database. */
export function invalidateGuestCodeCache() {
  cached = null;
}

// ---------------------------------------------------------------------------
// CODE GENERATION
// ---------------------------------------------------------------------------

/**
 * Alphabet for generated codes.
 *
 * Digits and uppercase letters minus the pairs that get misread when a code is copied off a
 * whiteboard or a projector: 0/O, 1/I/L, 5/S, 8/B, 2/Z. Codes are read aloud and typed by
 * hand far more often than they are pasted.
 */
const ALPHABET = "34679ACDEFGHJKMNPQRTUVWXY";

/** `crypto.randomInt` rather than `Math.random`: this value is a credential. */
function randomSegment(length: number) {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}

/** Formatted `XXXX-XXXX` — grouped so it is easier to read back and to type. */
export function generateCode(): string {
  return `${randomSegment(4)}-${randomSegment(4)}`;
}

/**
 * Normalises user input before comparison.
 *
 * People type the code with stray spaces, in lowercase, and with or without the hyphen, so
 * all of those are folded away rather than rejected. Comparison then happens on the
 * hyphen-free uppercase form.
 */
export function normaliseCode(input: string): string {
  return input.trim().toUpperCase().replace(/[\s-]/g, "");
}

/** Timing-safe-ish equality on the normalised forms. */
function codesMatch(input: string, stored: string): boolean {
  const a = normaliseCode(input);
  const b = normaliseCode(stored);
  if (a.length !== b.length) return false;

  // Constant-time compare: a length-equal wrong guess costs the same as a right one.
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---------------------------------------------------------------------------
// READ / ROLL
// ---------------------------------------------------------------------------

function freshRow(now: Date) {
  return {
    id: GUEST_CODE_ID,
    code: generateCode(),
    issuedAt: now,
    expiresAt: new Date(now.getTime() + CODE_TTL_HOURS * HOUR_MS),
    redemptions: 0,
  };
}

/**
 * The current code, rolling it first if the window has elapsed.
 *
 * Lazy rotation instead of a scheduled job: the roll happens on whichever request first
 * notices the expiry. An idle deployment does no work at all, and there is no cron to
 * deploy, monitor, or keep in sync across instances.
 *
 * The rotation is claimed with a guarded `updateMany` — the same trick the submit path uses.
 * If several requests notice the expiry at once, exactly one wins and rotates; the others
 * see 0 rows updated and re-read the winner's code rather than each generating their own.
 */
export async function getActiveCode(): Promise<GuestAccessCode> {
  const now = Date.now();

  if (cached && now - cached.readAt < CACHE_TTL_MS && cached.row.expiresAt.getTime() > now) {
    return cached.row;
  }

  const row = await prisma.guestAccessCode.upsert({
    where: { id: GUEST_CODE_ID },
    create: freshRow(new Date(now)),
    update: {},
  });

  if (row.expiresAt.getTime() > now) return putCache(row);

  return putCache(await rollCode(row));
}

/**
 * Replaces an elapsed code.
 *
 * `generation` is deliberately untouched: a scheduled roll must not sign anyone out. Only
 * `resetGuestCode` bumps it.
 */
async function rollCode(expired: GuestAccessCode): Promise<GuestAccessCode> {
  const now = new Date();
  const next = freshRow(now);

  const claimed = await prisma.guestAccessCode.updateMany({
    // Only rotate the exact row we saw expired — a concurrent roll changes `issuedAt`,
    // so the loser matches nothing and takes the re-read path below.
    where: { id: GUEST_CODE_ID, issuedAt: expired.issuedAt },
    data: { code: next.code, issuedAt: next.issuedAt, expiresAt: next.expiresAt, redemptions: 0 },
  });

  if (claimed.count === 0) {
    return prisma.guestAccessCode.findUniqueOrThrow({ where: { id: GUEST_CODE_ID } });
  }

  // The roll is the natural place to hang retention on: it happens about twice a day, on a
  // request that is already doing a write, and never on the hot validation path. Awaited
  // rather than fired-and-forgotten, so a serverless instance can't be frozen mid-sweep —
  // and wrapped, so a retention failure never turns into a failed page render.
  try {
    await sweepExpiredGuests();
  } catch (error) {
    console.error("[guest] retention sweep failed", error);
  }

  return prisma.guestAccessCode.findUniqueOrThrow({ where: { id: GUEST_CODE_ID } });
}

// ---------------------------------------------------------------------------
// REDEMPTION
// ---------------------------------------------------------------------------

export type RedeemOutcome =
  | { ok: true; userId: string; name: string; expiresAt: Date; generation: number }
  | { ok: false; reason: "disabled" | "invalid" | "exhausted" };

/**
 * Exchanges a code for a guest user row.
 *
 * A real `User` with `role: GUEST` is minted rather than a parallel identity type, because
 * every service in the exam engine is already keyed on `userId` — attempts, autosave,
 * grading, results, and retakes all work unchanged. The alternative, threading a
 * "guest or student" union through those signatures, would touch every query for no gain.
 *
 * The row carries a `guestExpiresAt` and an unusable password hash, so it can never be
 * signed into through the credentials provider.
 */
export async function redeemCode(input: string, displayName: string): Promise<RedeemOutcome> {
  const active = await getActiveCode();

  if (!active.isEnabled) return { ok: false, reason: "disabled" };
  if (active.expiresAt.getTime() <= Date.now()) return { ok: false, reason: "invalid" };
  if (!codesMatch(input, active.code)) return { ok: false, reason: "invalid" };

  if (active.maxRedemptions !== null && active.redemptions >= active.maxRedemptions) {
    return { ok: false, reason: "exhausted" };
  }

  // Claim a redemption slot before creating anything. The guarded `updateMany` makes the
  // cap hold under concurrency: two simultaneous redemptions of the last slot can't both win.
  const claimed = await prisma.guestAccessCode.updateMany({
    where: {
      id: GUEST_CODE_ID,
      code: active.code,
      generation: active.generation,
      ...(active.maxRedemptions !== null ? { redemptions: { lt: active.maxRedemptions } } : {}),
    },
    data: { redemptions: { increment: 1 } },
  });

  if (claimed.count === 0) {
    // Either the cap filled, or the code changed underneath us. Re-read to tell which.
    invalidateGuestCodeCache();
    const now = await getActiveCode();
    return {
      ok: false,
      reason:
        now.code === active.code && now.generation === active.generation ? "exhausted" : "invalid",
    };
  }

  invalidateGuestCodeCache();

  // A guest session ends at its own 12h mark, never at the code's — so someone who redeems
  // a minute before the roll still gets a full window.
  const expiresAt = new Date(Date.now() + CODE_TTL_HOURS * HOUR_MS);
  const suffix = randomSegment(6);

  const user = await prisma.user.create({
    data: {
      name: displayName.trim() || `Guest ${suffix.slice(0, 4)}`,
      // Synthetic, unique, and in a reserved domain so it can never collide with a real
      // address or be used to request a password reset.
      email: `guest-${suffix.toLowerCase()}@guest.invalid`,
      // Not a hash of anything. bcrypt.compare against this always fails, so the credentials
      // provider can never authenticate a guest row even if the email were guessed.
      passwordHash: "!guest-no-login",
      role: "GUEST",
      guestExpiresAt: expiresAt,
    },
    select: { id: true, name: true },
  });

  return {
    ok: true,
    userId: user.id,
    name: user.name,
    expiresAt,
    generation: active.generation,
  };
}

// ---------------------------------------------------------------------------
// ADMIN ACTIONS
// ---------------------------------------------------------------------------

/**
 * Issues a new code and signs every current guest out.
 *
 * This is the hard-revoke path: bumping `generation` invalidates every issued guest token at
 * once, because `isGuestSessionValid` compares the token's generation against this number.
 * No session table is touched and no rows are deleted — one integer does it.
 */
export async function resetGuestCode(adminId: string): Promise<GuestAccessCode> {
  const now = new Date();
  const next = freshRow(now);

  const row = await prisma.guestAccessCode.upsert({
    where: { id: GUEST_CODE_ID },
    create: { ...next, generation: 1, updatedById: adminId },
    update: {
      code: next.code,
      issuedAt: next.issuedAt,
      expiresAt: next.expiresAt,
      redemptions: 0,
      generation: { increment: 1 },
      updatedById: adminId,
    },
  });

  // Guest rows are left in place so their attempts stay reviewable in the admin browser;
  // retention removes them later.
  return putCache(row);
}

/** Turns guest access on or off without changing the code. */
export async function setGuestAccessEnabled(
  isEnabled: boolean,
  adminId: string
): Promise<GuestAccessCode> {
  await getActiveCode(); // ensures the row exists

  const row = await prisma.guestAccessCode.update({
    where: { id: GUEST_CODE_ID },
    data: { isEnabled, updatedById: adminId },
  });

  return putCache(row);
}

/** Changes the per-code redemption cap. Null removes it. */
export async function setGuestRedemptionCap(
  maxRedemptions: number | null,
  adminId: string
): Promise<GuestAccessCode> {
  await getActiveCode();

  const row = await prisma.guestAccessCode.update({
    where: { id: GUEST_CODE_ID },
    data: { maxRedemptions, updatedById: adminId },
  });

  return putCache(row);
}

// ---------------------------------------------------------------------------
// SESSION VALIDITY + RETENTION
// ---------------------------------------------------------------------------

/**
 * Whether a guest token is still good.
 *
 * Two cheap checks, no database read of the *user* row: the expiry is carried in the token
 * itself, and the generation is compared against the process-cached code row. So a guest
 * request costs the same as a student request — the JWT is still the only thing consulted.
 */
export async function isGuestSessionValid(token: {
  guestExpiresAt?: number;
  guestGeneration?: number;
}): Promise<boolean> {
  if (!token.guestExpiresAt || token.guestExpiresAt <= Date.now()) return false;

  const active = await getActiveCode();
  if (!active.isEnabled) return false;

  return token.guestGeneration === active.generation;
}

/**
 * Deletes guest rows whose session lapsed more than `GUEST_RETENTION_DAYS` ago.
 *
 * Their attempts, answers, flags, and progress go with them: every one of those relations is
 * `onDelete: Cascade` from `User`, so this is a single statement rather than a traversal.
 * Called from the lazy roll, never from a request path.
 */
export async function sweepExpiredGuests(): Promise<number> {
  const cutoff = new Date(Date.now() - GUEST_RETENTION_DAYS * DAY_MS);

  const { count } = await prisma.user.deleteMany({
    where: { role: "GUEST", guestExpiresAt: { lt: cutoff } },
  });

  await prisma.guestAccessCode.update({
    where: { id: GUEST_CODE_ID },
    data: { lastPurgeAt: new Date() },
  });

  if (count > 0) console.log(`[guest] retention sweep removed ${count} expired guests`);
  return count;
}

// ---------------------------------------------------------------------------
// ADMIN READ
// ---------------------------------------------------------------------------

export type GuestAccessSummary = {
  isEnabled: boolean;
  code: string;
  issuedAt: Date;
  expiresAt: Date;
  generation: number;
  redemptions: number;
  maxRedemptions: number | null;
  lastPurgeAt: Date | null;
  /** Guests whose session is still live right now. */
  activeGuests: number;
  /** Guest rows retained but lapsed — still visible in the attempts browser. */
  lapsedGuests: number;
  guestAttempts: number;
};

export async function loadGuestAccessSummary(): Promise<GuestAccessSummary> {
  const active = await getActiveCode();
  const now = new Date();

  const [activeGuests, lapsedGuests, guestAttempts] = await Promise.all([
    prisma.user.count({ where: { role: "GUEST", guestExpiresAt: { gt: now } } }),
    prisma.user.count({ where: { role: "GUEST", guestExpiresAt: { lte: now } } }),
    prisma.examAttempt.count({ where: { user: { role: "GUEST" } } }),
  ]);

  return {
    isEnabled: active.isEnabled,
    code: active.code,
    issuedAt: active.issuedAt,
    expiresAt: active.expiresAt,
    generation: active.generation,
    redemptions: active.redemptions,
    maxRedemptions: active.maxRedemptions,
    lastPurgeAt: active.lastPurgeAt,
    activeGuests,
    lapsedGuests,
    guestAttempts,
  };
}
