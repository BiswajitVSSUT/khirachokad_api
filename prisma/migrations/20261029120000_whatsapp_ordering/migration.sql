-- CreateEnum
CREATE TYPE "public"."ConversationState" AS ENUM ('IDLE', 'WELCOME_SENT', 'BROWSING_PRODUCTS', 'AWAITING_ADDRESS', 'ORDER_PENDING_CONFIRMATION', 'NEEDS_HUMAN');

-- CreateEnum
CREATE TYPE "public"."OrderStatus" AS ENUM ('AWAITING_ADDRESS', 'PENDING_CONFIRMATION', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'COMPLETED');

-- AlterTable
ALTER TABLE "public"."products" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sku" TEXT,
ADD COLUMN     "stockQuantity" INTEGER,
ADD COLUMN     "unit" TEXT NOT NULL DEFAULT 'bag',
ADD COLUMN     "whatsappProductId" TEXT;

-- CreateTable
CREATE TABLE "public"."customer" (
    "id" TEXT NOT NULL,
    "whatsappNumber" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."conversation" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "state" "public"."ConversationState" NOT NULL DEFAULT 'IDLE',
    "context" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."order" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "public"."OrderStatus" NOT NULL DEFAULT 'AWAITING_ADDRESS',
    "customerName" TEXT,
    "deliveryAddress" TEXT,
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "deliveryCharge" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."orderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "lineTotal" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "orderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."whatsappEvent" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsappEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_whatsappNumber_key" ON "public"."customer"("whatsappNumber");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_customerId_key" ON "public"."conversation"("customerId");

-- CreateIndex
CREATE INDEX "conversation_state_idx" ON "public"."conversation"("state");

-- CreateIndex
CREATE UNIQUE INDEX "order_orderNumber_key" ON "public"."order"("orderNumber");

-- CreateIndex
CREATE INDEX "order_customerId_idx" ON "public"."order"("customerId");

-- CreateIndex
CREATE INDEX "order_status_idx" ON "public"."order"("status");

-- CreateIndex
CREATE INDEX "orderItem_orderId_idx" ON "public"."orderItem"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "whatsappEvent_messageId_key" ON "public"."whatsappEvent"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "public"."products"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "products_whatsappProductId_key" ON "public"."products"("whatsappProductId");

-- AddForeignKey
ALTER TABLE "public"."conversation" ADD CONSTRAINT "conversation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."order" ADD CONSTRAINT "order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."orderItem" ADD CONSTRAINT "orderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."orderItem" ADD CONSTRAINT "orderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

