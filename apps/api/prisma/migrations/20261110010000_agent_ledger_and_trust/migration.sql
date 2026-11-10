-- CreateEnum
CREATE TYPE "AgentPaymentStatus" AS ENUM ('mock_collected');

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "engagedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "JobAssignment" ADD COLUMN     "respondedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Offer" ADD COLUMN     "acceptedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "phoneVerifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "agentSignupFee" INTEGER NOT NULL DEFAULT 200,
    "agentSharePercent" INTEGER NOT NULL DEFAULT 40,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentLedgerEntry" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "fee" INTEGER NOT NULL,
    "agentShare" INTEGER NOT NULL,
    "platformShare" INTEGER NOT NULL,
    "paymentStatus" "AgentPaymentStatus" NOT NULL DEFAULT 'mock_collected',
    "seeded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentLedgerEntry_workerId_key" ON "AgentLedgerEntry"("workerId");

-- CreateIndex
CREATE INDEX "AgentLedgerEntry_agentId_createdAt_idx" ON "AgentLedgerEntry"("agentId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentLedgerEntry_createdAt_idx" ON "AgentLedgerEntry"("createdAt");

-- AddForeignKey
ALTER TABLE "AgentLedgerEntry" ADD CONSTRAINT "AgentLedgerEntry_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentLedgerEntry" ADD CONSTRAINT "AgentLedgerEntry_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "WorkerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- AppSettings holds exactly one row.
ALTER TABLE "AppSettings" ADD CONSTRAINT "AppSettings_single_row" CHECK ("id" = 1);
ALTER TABLE "AppSettings" ADD CONSTRAINT "AppSettings_percent_range" CHECK ("agentSharePercent" BETWEEN 0 AND 100);
ALTER TABLE "AppSettings" ADD CONSTRAINT "AppSettings_fee_not_negative" CHECK ("agentSignupFee" >= 0);
INSERT INTO "AppSettings" ("id", "updatedAt") VALUES (1, NOW());

-- The two shares must always add up to the fee.
ALTER TABLE "AgentLedgerEntry" ADD CONSTRAINT "AgentLedgerEntry_shares_add_up" CHECK ("agentShare" + "platformShare" = "fee");
