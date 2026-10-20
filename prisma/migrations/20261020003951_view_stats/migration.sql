-- AlterTable
ALTER TABLE "Video" ADD COLUMN     "downloads" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "views" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "VideoDailyStat" (
    "videoId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "downloads" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "VideoDailyStat_pkey" PRIMARY KEY ("videoId","day")
);

-- CreateIndex
CREATE INDEX "VideoDailyStat_day_idx" ON "VideoDailyStat"("day");

-- AddForeignKey
ALTER TABLE "VideoDailyStat" ADD CONSTRAINT "VideoDailyStat_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;
