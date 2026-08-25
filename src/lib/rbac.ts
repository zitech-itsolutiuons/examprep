import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { isGuestSessionValid } from "@/server/services/guest-access";

type SessionUser = Session["user"];

/**
 * The session as the app should see it, plus why a guest was rejected.
 *
 * `guestRevoked` lets the guards send a lapsed or revoked guest back to the code screen
 * instead of the login form — /login is a door they never used and have no credentials for.
 */
async function readSession(): Promise<{ user: SessionUser | null; guestRevoked: boolean }> {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  if (!user) return { user: null, guestRevoked: false };

  if (user.role === "GUEST") {
    const valid = await isGuestSessionValid({
      guestExpiresAt: user.guestExpiresAt,
      guestGeneration: user.guestGeneration,
    });
    if (!valid) return { user: null, guestRevoked: true };
  }

  return { user, guestRevoked: false };
}

/**
 * The session user, with lapsed guests treated as signed out.
 *
 * A guest's session ends for one of two reasons — their own 12 hours elapsed, or an admin
 * reset bumped the code generation — and neither can be expressed by NextAuth's own expiry.
 * Checking here means every caller inherits it: every page and API route already funnels
 * through this function, so no path can see a revoked guest as valid.
 *
 * The check costs no database read of the user row; see `isGuestSessionValid`.
 */
export async function getCurrentUser() {
  return (await readSession()).user;
}

/** Redirects unauthenticated visitors away. Use at the top of a protected page/layout. */
export async function requireUser() {
  const { user, guestRevoked } = await readSession();
  // A guest whose code was reset, or whose window ran out, goes back to the code screen.
  if (!user) redirect(guestRevoked ? "/access?expired=1" : "/login");
  return user;
}

/**
 * A signed-in student or admin — guests are refused.
 *
 * Guests can sit exams and read their own results, but anything tied to a persistent
 * account (dashboard, history, profile) requires a real one.
 */
export async function requireAccount() {
  const user = await requireUser();
  if (user.role === "GUEST") redirect("/access?from=account");
  return user;
}

/** Redirects non-admins to the student dashboard. Use in the admin layout. */
export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/dashboard");
  return user;
}

// --- For API route handlers (JSON responses, no redirect) ------------------

type ApiAuthResult<T> = { user: T; error?: undefined } | { user?: undefined; error: NextResponse };

export async function requireApiUser(): Promise<ApiAuthResult<SessionUser>> {
  const { user } = await readSession();
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { user };
}

/**
 * API equivalent of `requireAccount`: rejects guests with 403.
 *
 * Used by the endpoints behind account-only screens (profile, progress) so a guest token
 * can't reach them directly even though the pages are already gated.
 */
export async function requireApiAccount(): Promise<ApiAuthResult<SessionUser>> {
  const result = await requireApiUser();
  if (result.error) return result;
  if (result.user.role === "GUEST") {
    return {
      error: NextResponse.json(
        { error: "This action needs a registered account." },
        { status: 403 }
      ),
    };
  }
  return result;
}

export async function requireApiAdmin(): Promise<ApiAuthResult<SessionUser>> {
  const result = await requireApiUser();
  if (result.error) return result;
  if (result.user.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return result;
}
