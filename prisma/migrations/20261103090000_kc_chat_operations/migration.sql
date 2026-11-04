ALTER TABLE "customer"
  ADD COLUMN "profileImage" TEXT,
  ADD COLUMN "botBlacklist" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "whatsappMessage"
  ADD COLUMN "body" TEXT,
  ADD COLUMN "mediaUrl" TEXT,
  ADD COLUMN "caption" TEXT;

CREATE TABLE "catalogProduct" (
  "id" TEXT NOT NULL,
  "retailerId" TEXT NOT NULL,
  "metaProductId" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "image" TEXT,
  "price" DECIMAL(12,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "availability" TEXT NOT NULL DEFAULT 'in stock',
  "inventory" INTEGER,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "catalogProduct_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "catalogProduct_retailerId_key" ON "catalogProduct"("retailerId");
CREATE UNIQUE INDEX "catalogProduct_metaProductId_key" ON "catalogProduct"("metaProductId");
CREATE INDEX "catalogProduct_isActive_availability_idx" ON "catalogProduct"("isActive", "availability");

ALTER TABLE "orderItem" ADD COLUMN "catalogProductId" TEXT;
ALTER TABLE "orderItem" ALTER COLUMN "productId" DROP NOT NULL;
CREATE INDEX "orderItem_catalogProductId_idx" ON "orderItem"("catalogProductId");
ALTER TABLE "orderItem" ADD CONSTRAINT "orderItem_catalogProductId_fkey"
  FOREIGN KEY ("catalogProductId") REFERENCES "catalogProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PLACED';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'DELIVERED';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'CANCELLED_BY_CUSTOMER';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'CANCELLED_BY_ADMIN';
