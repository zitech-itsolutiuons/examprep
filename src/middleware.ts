import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

/** Routes a guest may reach. Everything else in the matcher needs a real account. */
const GUEST_ALLOWED = ["/subjects", "/exam", "/results"];

/**
 * Route protection.
 *
 * NOTE ON LOCATION: this file must live at `src/middleware.ts`, not the repo root. Next.js
 * looks for middleware beside the `app` directory, so in a `src/`-based project a root-level
 * `middleware.ts` is silently ignored — it compiles, typechecks, and never runs. Check
 * `.next/server/middleware-manifest.json` after a build if you need to confirm it registered.
 *
 * This runs on the Edge runtime, so it deliberately does *not* import the guest service —
 * that pulls in Mongoose, which can't run here. It makes only the checks the token can answer
 * on its own: role, and a guest's own expiry. The generation check (an admin reset) needs
 * the code row, so it happens in `getCurrentUser()`, which every page and API route already
 * calls. A revoked guest therefore gets through middleware and is stopped one layer later —
 * still before any content renders.
 */
export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const { pathname } = req.nextUrl;

    // Guests are resolved first: `/admin` is not in GUEST_ALLOWED, so this also covers it and
    // sends them straight to the code screen instead of bouncing via /dashboard.
    if (token?.role === "GUEST") {
      const lapsed = !token.guestExpiresAt || token.guestExpiresAt <= Date.now();
      if (lapsed) {
        return NextResponse.redirect(new URL("/access?expired=1", req.url));
      }

      const allowed = GUEST_ALLOWED.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
      );
      if (!allowed) {
        return NextResponse.redirect(new URL("/access?from=account", req.url));
      }

      return;
    }

    if (pathname.startsWith("/admin") && token?.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
    pages: {
      signIn: "/login",
    },
  }
);

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/subjects/:path*",
    "/exam/:path*",
    "/results/:path*",
    "/history/:path*",
    "/profile/:path*",
    "/admin/:path*",
  ],
};
