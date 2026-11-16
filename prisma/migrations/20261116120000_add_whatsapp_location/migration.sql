ALTER TABLE "public"."whatsappMessage"
  ADD COLUMN "locationLatitude" DOUBLE PRECISION,
  ADD COLUMN "locationLongitude" DOUBLE PRECISION,
  ADD COLUMN "locationName" TEXT,
  ADD COLUMN "locationAddress" TEXT;
