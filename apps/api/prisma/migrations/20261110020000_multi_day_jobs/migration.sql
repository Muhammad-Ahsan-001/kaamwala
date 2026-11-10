-- CreateEnum
CREATE TYPE "JobDayStatus" AS ENUM ('scheduled', 'completed', 'skipped');

-- DropIndex
DROP INDEX "Earning_jobId_workerId_key";

-- AlterTable
ALTER TABLE "Earning" ADD COLUMN     "dayNumber" INTEGER;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "durationDays" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "startDate" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "totalPrice" INTEGER;

-- CreateTable
CREATE TABLE "JobDay" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "dayNumber" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "status" "JobDayStatus" NOT NULL DEFAULT 'scheduled',
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "JobDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobDay_jobId_dayNumber_key" ON "JobDay"("jobId", "dayNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Earning_jobId_workerId_dayNumber_key" ON "Earning"("jobId", "workerId", "dayNumber");

-- AddForeignKey
ALTER TABLE "JobDay" ADD CONSTRAINT "JobDay_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
