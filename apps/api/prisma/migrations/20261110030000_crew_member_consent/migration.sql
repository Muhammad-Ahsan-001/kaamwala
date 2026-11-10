-- A worker now joins a crew only by accepting an invitation.
CREATE TYPE "CrewMemberStatus" AS ENUM ('invited', 'accepted');

-- Crews that already exist keep their members: every current row becomes accepted.
ALTER TABLE "CrewMember"
  ADD COLUMN "status" "CrewMemberStatus" NOT NULL DEFAULT 'accepted',
  ADD COLUMN "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- From here on a new row starts as an invitation.
ALTER TABLE "CrewMember" ALTER COLUMN "status" SET DEFAULT 'invited';

CREATE INDEX "CrewMember_workerId_status_idx" ON "CrewMember"("workerId", "status");
