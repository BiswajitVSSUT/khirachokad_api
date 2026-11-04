CREATE TABLE "quickReply" (
  "id" TEXT NOT NULL,
  "shortcut" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "imageUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "adminId" TEXT,
  CONSTRAINT "quickReply_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "quickReply_adminId_idx" ON "quickReply"("adminId");
ALTER TABLE "quickReply" ADD CONSTRAINT "quickReply_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
