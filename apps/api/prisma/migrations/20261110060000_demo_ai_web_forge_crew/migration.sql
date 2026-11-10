-- Adds the AI WEB FORGE demo crew to a database that already has the seeded workers.
-- Does nothing on an empty database, and is safe if the crew already exists.
INSERT INTO "Crew" ("id", "name", "leaderId", "categoryIds", "rate", "createdAt")
SELECT 'ai-web-forge-crew', 'AI WEB FORGE', w."id", ARRAY['electrician', 'carpenter', 'plumber'], 2500, NOW()
FROM "WorkerProfile" w
JOIN "User" u ON u."id" = w."userId"
WHERE u."phone" = '+923100000003'
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "CrewMember" ("id", "crewId", "workerId", "status", "invitedAt")
SELECT 'ai-web-forge-' || u."phone", 'ai-web-forge-crew', w."id", 'accepted', NOW()
FROM "WorkerProfile" w
JOIN "User" u ON u."id" = w."userId"
WHERE u."phone" IN ('+923100000003', '+923100000018', '+923100000009')
  AND EXISTS (SELECT 1 FROM "Crew" WHERE "id" = 'ai-web-forge-crew')
ON CONFLICT ("crewId", "workerId") DO NOTHING;
