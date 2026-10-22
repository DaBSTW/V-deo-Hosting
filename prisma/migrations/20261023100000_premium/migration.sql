-- DropIndex
DROP INDEX "EarningCredit_userId_month_country_key";

-- AlterTable
ALTER TABLE "EarningCredit" ADD COLUMN     "source" VARCHAR(8) NOT NULL DEFAULT 'ADS';

-- AlterTable
ALTER TABLE "RevenueSettlement" ADD COLUMN     "premiumCreditedMicros" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "premiumRevenueMicros" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "premiumSharePct" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "premiumViews" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "premiumUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PremiumViewDaily" (
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PremiumViewDaily_pkey" PRIMARY KEY ("userId","day")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" VARCHAR(16) NOT NULL DEFAULT 'PAYPAL',
    "providerSubscriptionId" TEXT NOT NULL,
    "plan" VARCHAR(16) NOT NULL,
    "status" VARCHAR(24) NOT NULL,
    "nextBillingAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionPayment" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerTransactionId" TEXT NOT NULL,
    "grossMicros" BIGINT NOT NULL,
    "feeMicros" BIGINT NOT NULL DEFAULT 0,
    "netMicros" BIGINT NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "periodMonths" INTEGER NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "refunded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PremiumViewDaily_day_idx" ON "PremiumViewDaily"("day");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_providerSubscriptionId_key" ON "Subscription"("providerSubscriptionId");

-- CreateIndex
CREATE INDEX "Subscription_userId_createdAt_idx" ON "Subscription"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPayment_providerTransactionId_key" ON "SubscriptionPayment"("providerTransactionId");

-- CreateIndex
CREATE INDEX "SubscriptionPayment_userId_paidAt_idx" ON "SubscriptionPayment"("userId", "paidAt");

-- CreateIndex
CREATE INDEX "SubscriptionPayment_paidAt_idx" ON "SubscriptionPayment"("paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "EarningCredit_userId_month_source_country_key" ON "EarningCredit"("userId", "month", "source", "country");

-- AddForeignKey
ALTER TABLE "PremiumViewDaily" ADD CONSTRAINT "PremiumViewDaily_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionPayment" ADD CONSTRAINT "SubscriptionPayment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

