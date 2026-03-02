-- DropForeignKey
ALTER TABLE "HintUsage" DROP CONSTRAINT "HintUsage_studentId_fkey";

-- DropIndex
DROP INDEX "HintUsage_externalActivityId_idx";

-- DropIndex
DROP INDEX "HintUsage_studentId_idx";

-- DropIndex
DROP INDEX "QuestionProgress_externalActivityId_idx";

-- AlterTable
ALTER TABLE "HintUsage" DROP COLUMN "externalActivityId",
DROP COLUMN "studentId";

-- AlterTable
ALTER TABLE "QuestionProgress" DROP COLUMN "externalActivityId";

-- AlterTable
ALTER TABLE "Session" DROP COLUMN "completedCount",
DROP COLUMN "questionCount";
