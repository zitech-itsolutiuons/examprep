import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { redeemCode } from "@/server/services/guest-access";

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
        });

        if (!user || !user.isActive) return null;

        // Guest rows have no real password. Refused before the comparison so the sentinel
        // hash is never even reachable through this path.
        if (user.role === "GUEST") return null;

        const valid = await verifyPassword(credentials.password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          image: user.avatarUrl ?? undefined,
        };
      },
    }),

    /**
     * Account-free access: a shared rotating code instead of an email and password.
     *
     * Modelled as a second credentials provider so a redeemed code produces an ordinary JWT
     * session. Everything downstream — middleware, the RBAC guards, the exam engine — then
     * treats a guest like any other signed-in user, with `role` and the two guest claims
     * doing the discriminating.
     */
    CredentialsProvider({
      id: "access-code",
      name: "Access code",
      credentials: {
        code: { label: "Access code", type: "text" },
        name: { label: "Your name", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.code) return null;

        const outcome = await redeemCode(credentials.code, credentials.name ?? "");
        // Returning null collapses every failure into one "invalid" message at the form.
        // The reason is reported by /api/guest/access instead, which the form calls first.
        if (!outcome.ok) return null;

        return {
          id: outcome.userId,
          name: outcome.name,
          // Never surfaced to the user; the guest row's address is synthetic.
          email: "",
          role: "GUEST" as const,
          guestExpiresAt: outcome.expiresAt.getTime(),
          guestGeneration: outcome.generation,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role: typeof token.role }).role;

        // Carried in the token so validating a guest request needs no user-row read: the
        // expiry is self-contained, and the generation only has to be compared against a
        // process-cached integer.
        const guest = user as { guestExpiresAt?: number; guestGeneration?: number };
        if (guest.guestExpiresAt !== undefined) token.guestExpiresAt = guest.guestExpiresAt;
        if (guest.guestGeneration !== undefined) token.guestGeneration = guest.guestGeneration;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
        session.user.guestExpiresAt = token.guestExpiresAt;
        session.user.guestGeneration = token.guestGeneration;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
