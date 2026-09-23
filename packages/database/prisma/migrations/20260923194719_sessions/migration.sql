-- CreateEnum
CREATE TYPE "SessionFormat" AS ENUM ('KEYNOTE', 'TALK', 'WORKSHOP', 'PANEL', 'LIGHTNING', 'BREAK', 'OTHER');

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "externalId" VARCHAR(100) NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "description" TEXT,
    "day" DATE NOT NULL,
    "startsAt" TIMESTAMPTZ(6),
    "endsAt" TIMESTAMPTZ(6),
    "room" VARCHAR(100),
    "format" "SessionFormat" NOT NULL DEFAULT 'TALK',
    "formatLabel" VARCHAR(100),
    "track" VARCHAR(100),
    "level" VARCHAR(50),
    "language" VARCHAR(50),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "url" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "speakers" (
    "id" TEXT NOT NULL,
    "externalId" VARCHAR(100) NOT NULL,
    "fullName" VARCHAR(150) NOT NULL,
    "company" VARCHAR(150),
    "jobTitle" VARCHAR(150),
    "bio" TEXT,
    "photoUrl" VARCHAR(500),
    "links" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "speakers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_speakers" (
    "sessionId" TEXT NOT NULL,
    "speakerId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "session_speakers_pkey" PRIMARY KEY ("sessionId","speakerId")
);

-- CreateIndex
CREATE UNIQUE INDEX "sessions_externalId_key" ON "sessions"("externalId");

-- CreateIndex
CREATE INDEX "sessions_day_startsAt_idx" ON "sessions"("day", "startsAt");

-- CreateIndex
CREATE INDEX "sessions_room_idx" ON "sessions"("room");

-- CreateIndex
CREATE INDEX "sessions_track_idx" ON "sessions"("track");

-- CreateIndex
CREATE INDEX "sessions_format_idx" ON "sessions"("format");

-- CreateIndex
CREATE UNIQUE INDEX "speakers_externalId_key" ON "speakers"("externalId");

-- CreateIndex
CREATE INDEX "speakers_fullName_idx" ON "speakers"("fullName");

-- CreateIndex
CREATE INDEX "session_speakers_speakerId_idx" ON "session_speakers"("speakerId");

-- AddForeignKey
ALTER TABLE "session_speakers" ADD CONSTRAINT "session_speakers_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_speakers" ADD CONSTRAINT "session_speakers_speakerId_fkey" FOREIGN KEY ("speakerId") REFERENCES "speakers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
