-- The worker feed shows the estimate the customer was given, so it is kept with the job.
ALTER TABLE "Job"
  ADD COLUMN "estimateMin" INTEGER,
  ADD COLUMN "estimateMax" INTEGER,
  ADD COLUMN "disputedAt" TIMESTAMP(3);

-- Disputes that already exist keep the last time the job changed as their opening time.
UPDATE "Job" SET "disputedAt" = "updatedAt" WHERE "disputeReason" IS NOT NULL;

-- Which skill Gemini saw in each past-work photo. A photo with no entry has no label.
ALTER TABLE "WorkerProfile" ADD COLUMN "photoSkills" JSONB NOT NULL DEFAULT '{}';

-- Shown to workers only once a booking is confirmed.
ALTER TABLE "HirerProfile" ADD COLUMN "address" TEXT;
