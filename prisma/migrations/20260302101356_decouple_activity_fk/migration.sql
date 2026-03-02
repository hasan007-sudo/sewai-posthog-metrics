-- DropForeignKey
ALTER TABLE "HintUsage" DROP CONSTRAINT "HintUsage_activityId_fkey";

-- DropForeignKey
ALTER TABLE "QuestionProgress" DROP CONSTRAINT "QuestionProgress_activityId_fkey";

-- DropIndex
DROP INDEX "HintUsage_activityId_idx";

-- DropIndex
DROP INDEX "QuestionProgress_activityId_idx";

-- Add new column (nullable first)
ALTER TABLE "HintUsage" ADD COLUMN "externalActivityId" TEXT;
ALTER TABLE "QuestionProgress" ADD COLUMN "externalActivityId" TEXT;

-- Backfill from Activity.externalId
UPDATE "HintUsage" h
SET "externalActivityId" = a."externalId"
FROM "Activity" a
WHERE h."activityId" = a."id";

UPDATE "QuestionProgress" qp
SET "externalActivityId" = a."externalId"
FROM "Activity" a
WHERE qp."activityId" = a."id";

-- Set NOT NULL after backfill (rows without a matching Activity get a fallback)
UPDATE "HintUsage" SET "externalActivityId" = 'unknown' WHERE "externalActivityId" IS NULL;
UPDATE "QuestionProgress" SET "externalActivityId" = 'unknown' WHERE "externalActivityId" IS NULL;

ALTER TABLE "HintUsage" ALTER COLUMN "externalActivityId" SET NOT NULL;
ALTER TABLE "QuestionProgress" ALTER COLUMN "externalActivityId" SET NOT NULL;

-- Drop old column
ALTER TABLE "HintUsage" DROP COLUMN "activityId";
ALTER TABLE "QuestionProgress" DROP COLUMN "activityId";

-- CreateIndex
CREATE INDEX "HintUsage_externalActivityId_idx" ON "HintUsage"("externalActivityId");
CREATE INDEX "QuestionProgress_externalActivityId_idx" ON "QuestionProgress"("externalActivityId");
