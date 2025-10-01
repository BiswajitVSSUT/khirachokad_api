/*
  Warnings:

  - A unique constraint covering the columns `[revieweeEmail,shopId]` on the table `review` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "public"."products" DROP CONSTRAINT "products_shopId_fkey";

-- DropForeignKey
ALTER TABLE "public"."review" DROP CONSTRAINT "review_shopId_fkey";

-- DropIndex
DROP INDEX "public"."review_revieweeEmail_key";

-- CreateIndex
CREATE UNIQUE INDEX "review_revieweeEmail_shopId_key" ON "public"."review"("revieweeEmail", "shopId");

-- AddForeignKey
ALTER TABLE "public"."products" ADD CONSTRAINT "products_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "public"."shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."review" ADD CONSTRAINT "review_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "public"."shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
