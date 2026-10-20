-- AlterTable
ALTER TABLE "Video" ADD COLUMN     "folderId" TEXT,
ADD COLUMN     "hasThumbnail" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Folder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Folder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Folder_userId_createdAt_idx" ON "Folder"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Folder_userId_name_key" ON "Folder"("userId", "name");

-- CreateIndex
CREATE INDEX "Video_folderId_idx" ON "Video"("folderId");

-- AddForeignKey
ALTER TABLE "Folder" ADD CONSTRAINT "Folder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Video" ADD CONSTRAINT "Video_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: videos ya existentes que tienen miniatura.
UPDATE "Video" SET "hasThumbnail" = true
WHERE ("provider" = 'STREAM' AND "status" = 'READY')
   OR ("providerMeta"->>'poster') = 'true';
