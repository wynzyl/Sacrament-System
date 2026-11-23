-- Release 1 foundations (see docs/PRD.md): exact money, audit log, receipt
-- counter, requirement checklist, payment reversals, online bookings.
--
-- Data safety:
--   * Float -> DECIMAL(12,2) uses an explicit ROUND(..., 2); no rows are deleted.
--   * referenceNumber is added nullable, back-filled for every existing row,
--     then made NOT NULL + UNIQUE.
--   * The receipt counter is seeded above every existing receipt number so new
--     sequential receipts can never collide with legacy random ones.

-- CreateEnum
CREATE TYPE "AppointmentSource" AS ENUM ('STAFF', 'ONLINE');

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('PAYMENT', 'REVERSAL');

-- DropForeignKey
ALTER TABLE "Appointment" DROP CONSTRAINT "Appointment_createdById_fkey";

-- AlterTable: Appointment
ALTER TABLE "Appointment" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "referenceNumber" TEXT,
ADD COLUMN     "source" "AppointmentSource" NOT NULL DEFAULT 'STAFF',
ALTER COLUMN "fee" SET DATA TYPE DECIMAL(12,2) USING ROUND("fee"::numeric, 2),
ALTER COLUMN "createdById" DROP NOT NULL;

-- Back-fill reference numbers for existing appointments (SAC-YYYY-XXXXXX).
UPDATE "Appointment"
SET "referenceNumber" = 'SAC-' || to_char("createdAt" AT TIME ZONE 'Asia/Manila', 'YYYY') || '-' || upper(substr(md5("id"), 1, 6))
WHERE "referenceNumber" IS NULL;

ALTER TABLE "Appointment" ALTER COLUMN "referenceNumber" SET NOT NULL;

-- Cancelled appointments that predate this migration keep a NULL reason/time.

-- AlterTable: Payment
ALTER TABLE "Payment" ADD COLUMN     "kind" "PaymentKind" NOT NULL DEFAULT 'PAYMENT',
ADD COLUMN     "reason" TEXT,
ADD COLUMN     "reversesPaymentId" TEXT,
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(12,2) USING ROUND("amount"::numeric, 2);

-- CreateTable
CREATE TABLE "AppointmentRequirement" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isMet" BOOLEAN NOT NULL DEFAULT false,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),

    CONSTRAINT "AppointmentRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    "actorRole" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Counter" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppointmentRequirement_appointmentId_key_key" ON "AppointmentRequirement"("appointmentId", "key");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_referenceNumber_key" ON "Appointment"("referenceNumber");

-- CreateIndex
CREATE INDEX "Appointment_assignedPriestId_scheduledDate_idx" ON "Appointment"("assignedPriestId", "scheduledDate");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_reversesPaymentId_key" ON "Payment"("reversesPaymentId");

-- CreateIndex
CREATE INDEX "Payment_appointmentId_idx" ON "Payment"("appointmentId");

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey (RESTRICT: payment ledger rows are never deleted)
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_reversesPaymentId_fkey" FOREIGN KEY ("reversesPaymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentRequirement" ADD CONSTRAINT "AppointmentRequirement_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Ledger integrity: payments are >= 0, reversals are negative and reference the
-- payment they cancel.
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_kind_amount_check" CHECK (
  ("kind" = 'PAYMENT' AND "amount" >= 0 AND "reversesPaymentId" IS NULL)
  OR ("kind" = 'REVERSAL' AND "amount" < 0 AND "reversesPaymentId" IS NOT NULL)
);

-- Seed the receipt counter above the highest existing receipt number per year
-- (legacy receipts were random, e.g. RCP-2026-48213).
INSERT INTO "Counter" ("key", "value")
SELECT 'RCP-' || split_part("receiptNumber", '-', 2),
       MAX(split_part("receiptNumber", '-', 3)::int)
FROM "Payment"
WHERE "receiptNumber" ~ '^RCP-[0-9]{4}-[0-9]+$'
GROUP BY split_part("receiptNumber", '-', 2)
ON CONFLICT ("key") DO NOTHING;

-- Audit log immutability: reject UPDATE and DELETE (Constitution II).
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'AuditLog is append-only: % is not allowed', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditLog_no_update_delete"
BEFORE UPDATE OR DELETE ON "AuditLog"
FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

-- TRUNCATE bypasses row triggers, so block it too.
CREATE TRIGGER "AuditLog_no_truncate"
BEFORE TRUNCATE ON "AuditLog"
FOR EACH STATEMENT EXECUTE FUNCTION audit_log_immutable();
