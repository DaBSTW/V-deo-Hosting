-- Reparto de ingresos (revenue share): las vistas monetizadas se guardan por
-- país sin importe y el dinero se calcula al cerrar cada mes con el RPM real.

-- CreateTable
CREATE TABLE "MonetizedViewDaily" (
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "country" VARCHAR(2) NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MonetizedViewDaily_pkey" PRIMARY KEY ("userId","day","country")
);

-- CreateTable
CREATE TABLE "RevenueSettlement" (
    "month" VARCHAR(7) NOT NULL,
    "sharePct" INTEGER NOT NULL,
    "rpmByCountry" JSONB NOT NULL,
    "defaultRpmMicros" BIGINT NOT NULL,
    "revenueMicros" BIGINT,
    "scale" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "views" INTEGER NOT NULL,
    "creditedMicros" BIGINT NOT NULL,
    "legacy" BOOLEAN NOT NULL DEFAULT false,
    "closedBy" TEXT,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevenueSettlement_pkey" PRIMARY KEY ("month")
);

-- CreateTable
CREATE TABLE "EarningCredit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "month" VARCHAR(7) NOT NULL,
    "country" VARCHAR(2) NOT NULL,
    "views" INTEGER NOT NULL,
    "rpmMicros" BIGINT NOT NULL,
    "amountMicros" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EarningCredit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MonetizedViewDaily_day_idx" ON "MonetizedViewDaily"("day");

-- CreateIndex
CREATE INDEX "EarningCredit_month_idx" ON "EarningCredit"("month");

-- CreateIndex
CREATE UNIQUE INDEX "EarningCredit_userId_month_country_key" ON "EarningCredit"("userId", "month", "country");

-- AddForeignKey
ALTER TABLE "MonetizedViewDaily" ADD CONSTRAINT "MonetizedViewDaily_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EarningCredit" ADD CONSTRAINT "EarningCredit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Ganancias del modelo anterior (tarifa fija): se convierten en créditos para
-- que ningún saldo cambie, y sus meses quedan marcados como ya cerrados.
INSERT INTO "EarningCredit" ("id", "userId", "month", "country", "views", "rpmMicros", "amountMicros")
SELECT 'legacy_' || md5("userId" || to_char("day", 'YYYY-MM')), "userId", to_char("day", 'YYYY-MM'), 'XX',
       SUM("views")::int, 0, SUM("amountMicros")
FROM "EarningDaily"
GROUP BY "userId", to_char("day", 'YYYY-MM')
HAVING SUM("amountMicros") > 0;

INSERT INTO "RevenueSettlement" ("month", "sharePct", "rpmByCountry", "defaultRpmMicros", "views", "creditedMicros", "legacy", "closedBy")
SELECT "month", 0, '{}'::jsonb, 0, SUM("views")::int, SUM("amountMicros"), true, 'migración'
FROM "EarningCredit"
GROUP BY "month";

-- DropForeignKey
ALTER TABLE "EarningDaily" DROP CONSTRAINT "EarningDaily_userId_fkey";

-- DropTable
DROP TABLE "EarningDaily";
