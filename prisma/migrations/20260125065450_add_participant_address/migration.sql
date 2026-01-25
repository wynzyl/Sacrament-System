-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "barangay" TEXT,
ADD COLUMN     "city" TEXT DEFAULT 'Urdaneta City',
ADD COLUMN     "province" TEXT DEFAULT 'Pangasinan';
