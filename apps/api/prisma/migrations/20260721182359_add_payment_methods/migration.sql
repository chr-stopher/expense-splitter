-- AlterTable
ALTER TABLE "User" ADD COLUMN     "acceptsCash" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cashappTag" TEXT,
ADD COLUMN     "venmoHandle" TEXT,
ADD COLUMN     "zellePhone" TEXT;
