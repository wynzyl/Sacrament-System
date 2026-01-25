-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'PRIEST', 'CASHIER');

-- CreateEnum
CREATE TYPE "SacramentType" AS ENUM ('BAPTISM', 'WEDDING', 'CONFIRMATION', 'FUNERAL', 'FIRST_COMMUNION', 'ANOINTING_OF_SICK');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'GCASH');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "sacramentType" "SacramentType" NOT NULL,
    "participantName" TEXT NOT NULL,
    "participantPhone" TEXT,
    "participantEmail" TEXT,
    "scheduledDate" TIMESTAMP(3) NOT NULL,
    "scheduledTime" TEXT NOT NULL,
    "location" TEXT,
    "notes" TEXT,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'PENDING',
    "fee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "gcashRefNumber" TEXT,
    "receiptNumber" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "processedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Appointment_sacramentType_idx" ON "Appointment"("sacramentType");

-- CreateIndex
CREATE INDEX "Appointment_scheduledDate_idx" ON "Appointment"("scheduledDate");

-- CreateIndex
CREATE INDEX "Appointment_status_idx" ON "Appointment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_receiptNumber_key" ON "Payment"("receiptNumber");

-- CreateIndex
CREATE INDEX "Payment_createdAt_idx" ON "Payment"("createdAt");

-- CreateIndex
CREATE INDEX "Payment_processedById_idx" ON "Payment"("processedById");

-- CreateIndex
CREATE INDEX "Payment_paymentMethod_idx" ON "Payment"("paymentMethod");

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
