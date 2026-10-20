-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'REJECTED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "monetizationEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "payoutDetails" TEXT,
ADD COLUMN     "payoutMethod" TEXT;

-- AlterTable
ALTER TABLE "VideoDailyStat" ADD COLUMN     "paidViews" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "EarningDaily" (
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "tier" TEXT NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "amountMicros" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "EarningDaily_pkey" PRIMARY KEY ("userId","day","tier")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountMicros" BIGINT NOT NULL,
    "method" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "reference" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "EarningDaily_day_idx" ON "EarningDaily"("day");

-- CreateIndex
CREATE INDEX "Payout_userId_createdAt_idx" ON "Payout"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Payout_status_createdAt_idx" ON "Payout"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "EarningDaily" ADD CONSTRAINT "EarningDaily_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
