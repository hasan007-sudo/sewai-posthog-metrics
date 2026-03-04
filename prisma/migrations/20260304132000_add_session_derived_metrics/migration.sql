ALTER TABLE "Session"
ADD COLUMN "translatedClicksEvents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "orgName" TEXT NOT NULL DEFAULT 'unknown';

CREATE INDEX "Session_orgName_idx" ON "Session"("orgName");
