-- Online payment provider support: Online Wallet & Bank Transfer methods,
-- provider metadata on Payment, nullable processedById for webhook-settled
-- online payments, and OnlinePaymentIntent for hosted checkout sessions.

-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'ONLINE_WALLET';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'BANK_TRANSFER';

-- CreateEnum
CREATE TYPE "OnlinePaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED');

-- DropForeignKey
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_processedById_fkey";

-- AlterTable: Payment
ALTER TABLE "Payment" ADD COLUMN     "provider" TEXT,
ADD COLUMN     "providerChannel" TEXT,
ADD COLUMN     "providerRef" TEXT,
ALTER COLUMN "processedById" DROP NOT NULL;

-- CreateTable: OnlinePaymentIntent
CREATE TABLE "OnlinePaymentIntent" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "provider" TEXT NOT NULL,
    "providerChannel" TEXT NOT NULL,
    "providerIntentId" TEXT NOT NULL,
    "referenceNumber" TEXT,
    "status" "OnlinePaymentStatus" NOT NULL DEFAULT 'PENDING',
    "webhookEventId" TEXT,
    "paymentId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnlinePaymentIntent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerRef_key" ON "Payment"("providerRef");

-- CreateIndex
CREATE UNIQUE INDEX "OnlinePaymentIntent_providerIntentId_key" ON "OnlinePaymentIntent"("providerIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "OnlinePaymentIntent_webhookEventId_key" ON "OnlinePaymentIntent"("webhookEventId");

-- CreateIndex
CREATE UNIQUE INDEX "OnlinePaymentIntent_paymentId_key" ON "OnlinePaymentIntent"("paymentId");

-- CreateIndex
CREATE INDEX "OnlinePaymentIntent_appointmentId_idx" ON "OnlinePaymentIntent"("appointmentId");

-- CreateIndex
CREATE INDEX "OnlinePaymentIntent_status_idx" ON "OnlinePaymentIntent"("status");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnlinePaymentIntent" ADD CONSTRAINT "OnlinePaymentIntent_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnlinePaymentIntent" ADD CONSTRAINT "OnlinePaymentIntent_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
