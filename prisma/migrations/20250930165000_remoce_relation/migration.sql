/*
  Warnings:

  - You are about to drop the column `adminId` on the `products` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."products" DROP CONSTRAINT "products_adminId_fkey";

-- AlterTable
ALTER TABLE "public"."products" DROP COLUMN "adminId";
