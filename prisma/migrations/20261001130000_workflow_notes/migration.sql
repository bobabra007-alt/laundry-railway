-- AlterTable
ALTER TABLE "Deal" ADD COLUMN     "allocationVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedBy" TEXT,
ADD COLUMN     "posted" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "DealAllocation" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "userId" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "DealAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Regulation" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Regulation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegulationRevision" (
    "id" TEXT NOT NULL,
    "regulationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "editedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegulationRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DealAllocation_userId_idx" ON "DealAllocation"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DealAllocation_dealId_slot_key" ON "DealAllocation"("dealId", "slot");

-- CreateIndex
CREATE UNIQUE INDEX "DealAllocation_dealId_userId_key" ON "DealAllocation"("dealId", "userId");

-- AddForeignKey
ALTER TABLE "DealAllocation" ADD CONSTRAINT "DealAllocation_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealAllocation" ADD CONSTRAINT "DealAllocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Regulation" ADD CONSTRAINT "Regulation_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegulationRevision" ADD CONSTRAINT "RegulationRevision_regulationId_fkey" FOREIGN KEY ("regulationId") REFERENCES "Regulation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

