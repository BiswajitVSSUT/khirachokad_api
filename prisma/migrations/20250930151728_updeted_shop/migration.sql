/*
  Warnings:

  - You are about to drop the column `contactEmail2` on the `shop` table. All the data in the column will be lost.
  - You are about to drop the column `coordinates` on the `shop` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "public"."shop" DROP COLUMN "contactEmail2",
DROP COLUMN "coordinates";
