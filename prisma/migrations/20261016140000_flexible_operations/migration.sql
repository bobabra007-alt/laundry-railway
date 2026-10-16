-- Additive only: preserve existing users, deals, payments, periods and ledgers.
ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "DealPayment" ADD COLUMN "deletedAt" TIMESTAMP(3), ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE TABLE "EmployeePayoutReceipt" (
 "id" TEXT NOT NULL, "requestId" TEXT NOT NULL, "userId" TEXT NOT NULL,
 "amount" DECIMAL(18,2) NOT NULL, "receivedOn" DATE NOT NULL,
 "balanceAfter" DECIMAL(18,2) NOT NULL, "note" TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "EmployeePayoutReceipt_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "EmployeePayoutReceipt_amount_check" CHECK ("amount" >= 0),
 CONSTRAINT "EmployeePayoutReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "EmployeePayoutReceipt_requestId_key" ON "EmployeePayoutReceipt"("requestId");
CREATE INDEX "EmployeePayoutReceipt_userId_receivedOn_idx" ON "EmployeePayoutReceipt"("userId", "receivedOn");
