-- AlterTable
ALTER TABLE "Partner" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "BankLedgerEntry" ADD COLUMN     "expenseId" TEXT;

-- AlterTable
ALTER TABLE "EmployeeLedgerEntry" ADD COLUMN     "expenseId" TEXT;

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "spentOn" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "authorId" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseAllocation" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "userId" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "ExpenseAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Expense_requestId_key" ON "Expense"("requestId");

-- CreateIndex
CREATE INDEX "ExpenseAllocation_userId_idx" ON "ExpenseAllocation"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseAllocation_expenseId_slot_key" ON "ExpenseAllocation"("expenseId", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseAllocation_expenseId_userId_key" ON "ExpenseAllocation"("expenseId", "userId");

-- AddForeignKey
ALTER TABLE "BankLedgerEntry" ADD CONSTRAINT "BankLedgerEntry_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeLedgerEntry" ADD CONSTRAINT "EmployeeLedgerEntry_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseAllocation" ADD CONSTRAINT "ExpenseAllocation_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseAllocation" ADD CONSTRAINT "ExpenseAllocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Positive amounts and exactly four possible allocation slots.
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "ExpenseAllocation" ADD CONSTRAINT "ExpenseAllocation_slot_range" CHECK ("slot" BETWEEN 0 AND 3);
CREATE INDEX "BankLedgerEntry_expenseId_idx" ON "BankLedgerEntry"("expenseId");
CREATE INDEX "EmployeeLedgerEntry_expenseId_idx" ON "EmployeeLedgerEntry"("expenseId");
