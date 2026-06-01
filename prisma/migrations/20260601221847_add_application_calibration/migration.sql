-- CreateTable
CREATE TABLE "ApplicationCalibration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobListingId" TEXT NOT NULL,
    "campaignId" TEXT,
    "flowType" TEXT DEFAULT 'unknown',
    "platform" TEXT DEFAULT 'unknown',
    "currentUrl" TEXT,
    "pageTitle" TEXT,
    "detectedFieldsJson" TEXT,
    "detectedQuestionsJson" TEXT,
    "detectedButtonsJson" TEXT,
    "submitCandidatesJson" TEXT,
    "screenshotPath" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ApplicationCalibration_jobListingId_fkey" FOREIGN KEY ("jobListingId") REFERENCES "JobListing" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ApplicationCalibration_jobListingId_createdAt_idx" ON "ApplicationCalibration"("jobListingId", "createdAt");
