-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CandidateProfile" (
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
    "sourceType" TEXT DEFAULT 'uploaded_file',
    "manualTextUsed" BOOLEAN NOT NULL DEFAULT false,
    "sourceUploadedCvId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_CandidateProfile" ("certificationsJson", "createdAt", "educationJson", "email", "experienceJson", "fullName", "id", "location", "phone", "projectsJson", "rawCvText", "skillsJson", "summary", "updatedAt") SELECT "certificationsJson", "createdAt", "educationJson", "email", "experienceJson", "fullName", "id", "location", "phone", "projectsJson", "rawCvText", "skillsJson", "summary", "updatedAt" FROM "CandidateProfile";
DROP TABLE "CandidateProfile";
ALTER TABLE "new_CandidateProfile" RENAME TO "CandidateProfile";
CREATE TABLE "new_UploadedCV" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "extractedText" TEXT,
    "sourceType" TEXT DEFAULT 'uploaded_file',
    "manualTextUsed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_UploadedCV" ("createdAt", "extractedText", "fileName", "filePath", "fileType", "id") SELECT "createdAt", "extractedText", "fileName", "filePath", "fileType", "id" FROM "UploadedCV";
DROP TABLE "UploadedCV";
ALTER TABLE "new_UploadedCV" RENAME TO "UploadedCV";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
