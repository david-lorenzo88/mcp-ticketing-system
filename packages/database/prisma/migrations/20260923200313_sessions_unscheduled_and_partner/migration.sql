-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "partnerUrl" VARCHAR(500),
ALTER COLUMN "day" DROP NOT NULL;
