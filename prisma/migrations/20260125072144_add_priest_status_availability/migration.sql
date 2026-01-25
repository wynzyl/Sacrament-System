-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "PriestAvailability" AS ENUM ('AVAILABLE', 'DAYOFF');

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "assignedPriestId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "availability" "PriestAvailability" NOT NULL DEFAULT 'AVAILABLE',
ADD COLUMN     "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE';

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_assignedPriestId_fkey" FOREIGN KEY ("assignedPriestId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
