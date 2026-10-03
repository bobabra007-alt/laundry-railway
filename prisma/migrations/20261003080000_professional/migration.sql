-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isReadOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "dealDate" DATE,
ADD COLUMN     "dueOn" DATE,
ADD COLUMN     "expectedPaymentOn" DATE,
ADD COLUMN     "waitingReason" TEXT;

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "dealId" TEXT;

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "Deal_dealDate_idx" ON "Deal"("dealDate");

-- CreateIndex
CREATE INDEX "Deal_closedAt_idx" ON "Deal"("closedAt");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "Deal" SET "dealDate" = ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Yekaterinburg')::date;
ALTER TABLE "Deal" ALTER COLUMN "dealDate" SET NOT NULL;
ALTER TABLE "Deal" ALTER COLUMN "dealDate" SET DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Yekaterinburg')::date;
INSERT INTO "UserPermission" ("id", "userId", "key", "enabled")
SELECT 'pro_expense_' || "id", "id", 'expenses.create', true FROM "User" WHERE "participatesInEmployeeBank" = true
ON CONFLICT ("userId", "key") DO NOTHING;
INSERT INTO "UserPermission" ("id", "userId", "key", "enabled")
SELECT 'pro_analytics_' || "userId", "userId", 'analytics.view', true FROM "UserPermission" WHERE "key" = 'banks.view' AND "enabled" = true
ON CONFLICT ("userId", "key") DO NOTHING;
CREATE INDEX "Expense_spentOn_idx" ON "Expense"("spentOn");
CREATE INDEX "Expense_dealId_idx" ON "Expense"("dealId");

-- Normalise legacy UTC-midnight windows to the team's +05:00 business day.
-- Amounts, statuses, confirmation timestamps and ledger entries are preserved.
UPDATE "EmployeePayoutPeriod" SET
 "periodStart" = "periodStart" - INTERVAL '5 hours',
 "periodEnd" = date_trunc('day', "periodEnd") + INTERVAL '1 day' - INTERVAL '5 hours' - INTERVAL '1 millisecond',
 "dueDate" = "dueDate" - INTERVAL '5 hours'
WHERE EXTRACT(HOUR FROM "periodStart") = 0 AND EXTRACT(MINUTE FROM "periodStart") = 0;
