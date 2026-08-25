import crypto from "crypto";

// The raw token is emailed to the user and never stored; only its hash lives
// in the database, so a leaked DB row can't be used to reset a password.
export function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
