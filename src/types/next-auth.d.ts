import { Role } from "@/types/models";
import { DefaultSession, DefaultUser } from "next-auth";
import { JWT as DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      /** GUEST sessions only: epoch ms at which this session lapses. */
      guestExpiresAt?: number;
      /** GUEST sessions only: the code generation this session was minted under. */
      guestGeneration?: number;
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
    role: Role;
    guestExpiresAt?: number;
    guestGeneration?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id: string;
    role: Role;
    guestExpiresAt?: number;
    guestGeneration?: number;
  }
}
