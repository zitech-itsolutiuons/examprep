-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'GUEST';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "guestExpiresAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "guest_access_code" (
    "id" TEXT NOT NULL DEFAULT 'current',
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "code" TEXT NOT NULL,
    "generation" INTEGER NOT NULL DEFAULT 1,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "redemptions" INTEGER NOT NULL DEFAULT 0,
    "maxRedemptions" INTEGER DEFAULT 500,
    "lastPurgeAt" TIMESTAMP(3),
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guest_access_code_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "users_role_guestExpiresAt_idx" ON "users"("role", "guestExpiresAt");
