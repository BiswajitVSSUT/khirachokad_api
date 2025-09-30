-- CreateTable
CREATE TABLE "public"."shop" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "logo" TEXT NOT NULL,
    "contactNumber" INTEGER NOT NULL,
    "contactNumber2" INTEGER,
    "contactEmail" TEXT NOT NULL,
    "contactEmail2" TEXT,
    "coordinates" TEXT NOT NULL,
    "postalCode" TEXT,
    "blockName" TEXT,
    "district" TEXT,

    CONSTRAINT "shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."admin" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "avatar" TEXT NOT NULL,

    CONSTRAINT "admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."products" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" TEXT NOT NULL,
    "image" TEXT NOT NULL,
    "image2" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "verificationId" TEXT NOT NULL,
    "expairyDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."review" (
    "id" TEXT NOT NULL,
    "revieweeName" TEXT NOT NULL,
    "revieweeEmail" TEXT NOT NULL,
    "review" TEXT NOT NULL,
    "rating" INTEGER NOT NULL DEFAULT 0,
    "shopId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_email_key" ON "public"."admin"("email");

-- CreateIndex
CREATE UNIQUE INDEX "products_verificationId_key" ON "public"."products"("verificationId");

-- CreateIndex
CREATE INDEX "products_name_price_idx" ON "public"."products"("name", "price");

-- CreateIndex
CREATE UNIQUE INDEX "review_revieweeEmail_key" ON "public"."review"("revieweeEmail");

-- CreateIndex
CREATE INDEX "review_revieweeName_revieweeEmail_rating_idx" ON "public"."review"("revieweeName", "revieweeEmail", "rating");

-- AddForeignKey
ALTER TABLE "public"."products" ADD CONSTRAINT "products_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "public"."admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."products" ADD CONSTRAINT "products_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "public"."shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."review" ADD CONSTRAINT "review_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "public"."shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
