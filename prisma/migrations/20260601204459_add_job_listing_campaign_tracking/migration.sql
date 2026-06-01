-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_JobListing" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "campaignId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'jobstreet',
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "location" TEXT,
    "salaryText" TEXT,
    "workType" TEXT,
    "url" TEXT NOT NULL,
    "description" TEXT,
    "snippet" TEXT,
    "matchScore" INTEGER,
    "matchReason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'discovered',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "JobListing_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_JobListing" ("company", "createdAt", "description", "id", "location", "matchReason", "matchScore", "salaryText", "source", "status", "title", "updatedAt", "url", "workType") SELECT "company", "createdAt", "description", "id", "location", "matchReason", "matchScore", "salaryText", "source", "status", "title", "updatedAt", "url", "workType" FROM "JobListing";
DROP TABLE "JobListing";
ALTER TABLE "new_JobListing" RENAME TO "JobListing";
CREATE UNIQUE INDEX "JobListing_url_key" ON "JobListing"("url");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
