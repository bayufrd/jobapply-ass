-- CreateTable
CREATE TABLE "CampaignDecisionRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "patternText" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CampaignDecisionRule_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Campaign" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "location" TEXT,
    "targetApplyCount" INTEGER NOT NULL DEFAULT 1,
    "appliedCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "submitMode" TEXT NOT NULL DEFAULT 'assisted_auto_apply',
    "matchThreshold" INTEGER NOT NULL DEFAULT 70,
    "defaultCurrentSalary" INTEGER NOT NULL DEFAULT 6000000,
    "defaultExpectedSalary" INTEGER NOT NULL DEFAULT 6000000,
    "defaultNoticePeriod" TEXT NOT NULL DEFAULT 'ASAP',
    "defaultAvailability" TEXT NOT NULL DEFAULT 'Immediate',
    "workModePreference" TEXT,
    "currentJobTitle" TEXT,
    "currentJobCompany" TEXT,
    "automationMode" TEXT NOT NULL DEFAULT 'review_each_application',
    "lowScoreMode" TEXT NOT NULL DEFAULT 'ask',
    "autoSubmitSafeOnly" BOOLEAN NOT NULL DEFAULT false,
    "currentStep" TEXT,
    "currentJobId" TEXT,
    "currentQuestion" TEXT,
    "decisionStatus" TEXT,
    "decisionPayloadJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Campaign" ("appliedCount", "createdAt", "currentJobCompany", "currentJobTitle", "defaultAvailability", "defaultCurrentSalary", "defaultExpectedSalary", "defaultNoticePeriod", "id", "keyword", "location", "matchThreshold", "name", "status", "submitMode", "targetApplyCount", "updatedAt", "workModePreference") SELECT "appliedCount", "createdAt", "currentJobCompany", "currentJobTitle", "defaultAvailability", "defaultCurrentSalary", "defaultExpectedSalary", "defaultNoticePeriod", "id", "keyword", "location", "matchThreshold", "name", "status", "submitMode", "targetApplyCount", "updatedAt", "workModePreference" FROM "Campaign";
DROP TABLE "Campaign";
ALTER TABLE "new_Campaign" RENAME TO "Campaign";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "CampaignDecisionRule_campaignId_type_idx" ON "CampaignDecisionRule"("campaignId", "type");
