CREATE TABLE "WorkspaceField" (
  "id" TEXT PRIMARY KEY, "ownerId" TEXT NOT NULL REFERENCES "User"("id"),
  "name" TEXT NOT NULL, "kind" TEXT NOT NULL, "required" BOOLEAN NOT NULL DEFAULT true,
  "shared" BOOLEAN NOT NULL DEFAULT false, UNIQUE ("ownerId","name")
);
CREATE TABLE "WorkspaceRow" (
  "ownerId" TEXT NOT NULL REFERENCES "User"("id"), "key" TEXT NOT NULL,
  "dealId" TEXT REFERENCES "Deal"("id"), "values" JSONB NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1, PRIMARY KEY ("ownerId","key"), UNIQUE ("ownerId","dealId")
);
CREATE INDEX "WorkspaceRow_dealId_idx" ON "WorkspaceRow"("dealId");
