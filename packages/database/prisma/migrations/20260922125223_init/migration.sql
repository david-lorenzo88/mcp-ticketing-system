-- CreateEnum
CREATE TYPE "TicketType" AS ENUM ('FULL_PASS', 'CONFERENCE', 'WORKSHOP', 'SPEAKER', 'SPONSOR', 'VOLUNTEER', 'STUDENT');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('RESERVED', 'CONFIRMED', 'CHECKED_IN', 'CANCELLED');

-- CreateTable
CREATE TABLE "tickets" (
    "id" TEXT NOT NULL,
    "reference" SERIAL NOT NULL,
    "firstName" VARCHAR(100) NOT NULL,
    "lastName" VARCHAR(100) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(50),
    "company" VARCHAR(150),
    "jobTitle" VARCHAR(150),
    "ticketType" "TicketType" NOT NULL DEFAULT 'CONFERENCE',
    "status" "TicketStatus" NOT NULL DEFAULT 'RESERVED',
    "priceAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'PLN',
    "dietaryRequirements" VARCHAR(500),
    "notes" VARCHAR(2000),
    "checkedInAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tickets_reference_key" ON "tickets"("reference");

-- CreateIndex
CREATE INDEX "tickets_status_idx" ON "tickets"("status");

-- CreateIndex
CREATE INDEX "tickets_ticketType_idx" ON "tickets"("ticketType");

-- CreateIndex
CREATE INDEX "tickets_email_idx" ON "tickets"("email");

-- CreateIndex
CREATE INDEX "tickets_createdAt_idx" ON "tickets"("createdAt");
