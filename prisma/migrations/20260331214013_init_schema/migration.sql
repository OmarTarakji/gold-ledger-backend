-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('BASIC', 'GROUP', 'QUICK_GROUP', 'QUICK_ACCOUNT');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "FinalState" AS ENUM ('BALANCED', 'SUPPRESSED_WARNING', 'OUTLIER');

-- CreateEnum
CREATE TYPE "ThresholdType" AS ENUM ('PERCENTAGE', 'FIXED');

-- CreateEnum
CREATE TYPE "TransactionSource" AS ENUM ('MANUAL', 'SCALE_CAMERA');

-- CreateTable
CREATE TABLE "Account" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "parentAccountId" UUID,
    "lossThresholdType" "ThresholdType",
    "lossThresholdValue" DECIMAL(65,30),
    "excessThresholdType" "ThresholdType",
    "excessThresholdValue" DECIMAL(65,30),
    "status" "AccountStatus" NOT NULL DEFAULT 'OPEN',
    "finalState" "FinalState",
    "cachedNetDifference" DECIMAL(65,30),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "weight" DECIMAL(65,30) NOT NULL,
    "karat" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fromAccountId" UUID,
    "toAccountId" UUID,
    "source" "TransactionSource" NOT NULL,
    "numOfPieces" INTEGER,
    "isVoided" BOOLEAN NOT NULL DEFAULT false,
    "voidReason" TEXT,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutlierData" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "expectedNetDifference" DECIMAL(65,30) NOT NULL,
    "explanation" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutlierData_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Account_parentAccountId_idx" ON "Account"("parentAccountId");

-- CreateIndex
CREATE INDEX "Account_status_idx" ON "Account"("status");

-- CreateIndex
CREATE INDEX "Account_type_idx" ON "Account"("type");

-- CreateIndex
CREATE INDEX "Transaction_fromAccountId_idx" ON "Transaction"("fromAccountId");

-- CreateIndex
CREATE INDEX "Transaction_toAccountId_idx" ON "Transaction"("toAccountId");

-- CreateIndex
CREATE INDEX "Transaction_timestamp_idx" ON "Transaction"("timestamp");

-- CreateIndex
CREATE INDEX "Transaction_isVoided_idx" ON "Transaction"("isVoided");

-- CreateIndex
CREATE UNIQUE INDEX "OutlierData_accountId_key" ON "OutlierData"("accountId");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_parentAccountId_fkey" FOREIGN KEY ("parentAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_fromAccountId_fkey" FOREIGN KEY ("fromAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutlierData" ADD CONSTRAINT "OutlierData_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
