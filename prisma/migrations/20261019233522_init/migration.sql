-- CreateEnum
CREATE TYPE "MediaProvider" AS ENUM ('R2', 'STREAM');

-- CreateEnum
CREATE TYPE "VideoStatus" AS ENUM ('PENDING_UPLOAD', 'PROCESSING', 'READY', 'ERROR');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Video" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "VideoStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "durationSec" DOUBLE PRECISION,
    "sizeBytes" BIGINT NOT NULL DEFAULT 0,
    "mimeType" TEXT,
    "provider" "MediaProvider" NOT NULL,
    "providerVideoId" TEXT NOT NULL,
    "providerMeta" JSONB,
    "errorReason" TEXT,
    "postProcessPending" BOOLEAN NOT NULL DEFAULT false,
    "jobLockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "readyAt" TIMESTAMP(3),

    CONSTRAINT "Video_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Video_publicId_key" ON "Video"("publicId");

-- CreateIndex
CREATE INDEX "Video_userId_createdAt_idx" ON "Video"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Video_status_updatedAt_idx" ON "Video"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "Video_provider_postProcessPending_idx" ON "Video"("provider", "postProcessPending");

-- CreateIndex
CREATE UNIQUE INDEX "Video_provider_providerVideoId_key" ON "Video"("provider", "providerVideoId");

-- AddForeignKey
ALTER TABLE "Video" ADD CONSTRAINT "Video_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
