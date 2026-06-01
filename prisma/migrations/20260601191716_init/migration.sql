-- CreateTable
CREATE TABLE "CandidateProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fullName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "location" TEXT,
    "summary" TEXT,
    "skillsJson" TEXT,
    "experienceJson" TEXT,
    "educationJson" TEXT,
    "projectsJson" TEXT,
    "certificationsJson" TEXT,
    "rawCvText" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UploadedCV" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "extractedText" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Campaign" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "JobListing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL DEFAULT 'jobstreet',
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "location" TEXT,
    "salaryText" TEXT,
    "workType" TEXT,
    "url" TEXT NOT NULL,
    "description" TEXT,
    "matchScore" INTEGER,
    "matchReason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'discovered',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT NOT NULL,
    "jobListingId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_review',
    "submitMode" TEXT NOT NULL DEFAULT 'assisted_auto_apply',
    "submittedAt" DATETIME,
    "skippedReason" TEXT,
    "userApproved" BOOLEAN NOT NULL DEFAULT false,
    "screenshotPath" TEXT,
    "notes" TEXT,
    "answersJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Application_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Application_jobListingId_fkey" FOREIGN KEY ("jobListingId") REFERENCES "JobListing" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuestionMemory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "questionRaw" TEXT NOT NULL,
    "questionNormalized" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "confidence" REAL NOT NULL,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AutomationLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT,
    "jobListingId" TEXT,
    "level" TEXT NOT NULL DEFAULT 'info',
    "event" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AutomationLog_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AutomationLog_jobListingId_fkey" FOREIGN KEY ("jobListingId") REFERENCES "JobListing" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BrowserSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "sessionPath" TEXT NOT NULL,
    "isValid" BOOLEAN NOT NULL DEFAULT false,
    "lastCheckedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "JobListing_url_key" ON "JobListing"("url");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionMemory_questionNormalized_key" ON "QuestionMemory"("questionNormalized");

-- CreateIndex
CREATE INDEX "AutomationLog_campaignId_createdAt_idx" ON "AutomationLog"("campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "AutomationLog_jobListingId_createdAt_idx" ON "AutomationLog"("jobListingId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BrowserSession_provider_key" ON "BrowserSession"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "UserSetting_key_key" ON "UserSetting"("key");
