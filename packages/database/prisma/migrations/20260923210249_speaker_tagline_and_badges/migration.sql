-- AlterTable
ALTER TABLE "speakers" ADD COLUMN     "badges" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "tagline" TEXT;
