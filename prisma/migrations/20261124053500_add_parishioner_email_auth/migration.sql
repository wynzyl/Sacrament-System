-- Parishioner OAuth-like Email Authentication & Confirmation Links
-- Adds PARISHIONER role, User profile & emailVerifiedAt columns, and EmailVerificationToken table.

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'PARISHIONER';

-- AlterTable: User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "phone" TEXT,
ADD COLUMN IF NOT EXISTS "barangay" TEXT,
ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP(3);

-- Backfill existing staff users as email-verified
UPDATE "User"
SET "emailVerifiedAt" = "createdAt"
WHERE "emailVerifiedAt" IS NULL AND "role" IN ('ADMIN', 'PRIEST', 'CASHIER');

-- CreateTable: EmailVerificationToken
CREATE TABLE IF NOT EXISTS "EmailVerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'EMAIL_CONFIRMATION',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "EmailVerificationToken_token_key" ON "EmailVerificationToken"("token");
CREATE INDEX IF NOT EXISTS "EmailVerificationToken_token_idx" ON "EmailVerificationToken"("token");
CREATE INDEX IF NOT EXISTS "EmailVerificationToken_userId_idx" ON "EmailVerificationToken"("userId");
CREATE INDEX IF NOT EXISTS "EmailVerificationToken_email_idx" ON "EmailVerificationToken"("email");

-- AddForeignKey
ALTER TABLE "EmailVerificationToken" ADD CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
