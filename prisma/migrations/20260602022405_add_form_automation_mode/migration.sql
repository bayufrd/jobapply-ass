-- CreateTable
CREATE TABLE "FormInteractionMemory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "platform" TEXT NOT NULL,
    "urlPattern" TEXT NOT NULL,
    "pageSignature" TEXT NOT NULL,
    "elementSignature" TEXT NOT NULL,
    "fieldPurpose" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "valueSource" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
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
    "formAutomationMode" TEXT NOT NULL DEFAULT 'ai_fallback',
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
INSERT INTO "new_Campaign" ("appliedCount", "autoSubmitSafeOnly", "automationMode", "createdAt", "currentJobCompany", "currentJobId", "currentJobTitle", "currentQuestion", "currentStep", "decisionPayloadJson", "decisionStatus", "defaultAvailability", "defaultCurrentSalary", "defaultExpectedSalary", "defaultNoticePeriod", "id", "keyword", "location", "lowScoreMode", "matchThreshold", "name", "status", "submitMode", "targetApplyCount", "updatedAt", "workModePreference") SELECT "appliedCount", "autoSubmitSafeOnly", "automationMode", "createdAt", "currentJobCompany", "currentJobId", "currentJobTitle", "currentQuestion", "currentStep", "decisionPayloadJson", "decisionStatus", "defaultAvailability", "defaultCurrentSalary", "defaultExpectedSalary", "defaultNoticePeriod", "id", "keyword", "location", "lowScoreMode", "matchThreshold", "name", "status", "submitMode", "targetApplyCount", "updatedAt", "workModePreference" FROM "Campaign";
DROP TABLE "Campaign";
ALTER TABLE "new_Campaign" RENAME TO "Campaign";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "FormInteractionMemory_platform_urlPattern_idx" ON "FormInteractionMemory"("platform", "urlPattern");

-- CreateIndex
CREATE INDEX "FormInteractionMemory_pageSignature_idx" ON "FormInteractionMemory"("pageSignature");
