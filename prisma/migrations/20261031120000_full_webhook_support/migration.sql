-- Generalize whatsappEvent so it can deduplicate every webhook field.
ALTER TABLE "public"."whatsappEvent"
ADD COLUMN     "eventKey" TEXT,
ADD COLUMN     "field" TEXT NOT NULL DEFAULT 'messages',
ADD COLUMN     "wabaId" TEXT,
ADD COLUMN     "phoneNumberId" TEXT,
ADD COLUMN     "payload" JSONB;

UPDATE "public"."whatsappEvent"
SET "eventKey" = 'messages:message:' || "messageId"
WHERE "eventKey" IS NULL;

ALTER TABLE "public"."whatsappEvent" ALTER COLUMN "eventKey" SET NOT NULL;
ALTER TABLE "public"."whatsappEvent" ALTER COLUMN "messageId" DROP NOT NULL;

DROP INDEX IF EXISTS "public"."whatsappEvent_messageId_key";
CREATE UNIQUE INDEX "whatsappEvent_eventKey_key" ON "public"."whatsappEvent"("eventKey");
CREATE INDEX "whatsappEvent_field_receivedAt_idx" ON "public"."whatsappEvent"("field", "receivedAt");
CREATE INDEX "whatsappEvent_messageId_idx" ON "public"."whatsappEvent"("messageId");
CREATE INDEX "whatsappEvent_wabaId_idx" ON "public"."whatsappEvent"("wabaId");

-- CreateTable
CREATE TABLE "public"."whatsappMessage" (
    "id" TEXT NOT NULL,
    "waMessageId" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "type" TEXT,
    "status" TEXT,
    "fromNumber" TEXT,
    "toNumber" TEXT,
    "customerId" TEXT,
    "errorCode" TEXT,
    "errorTitle" TEXT,
    "errorMessage" TEXT,
    "pricingCategory" TEXT,
    "waTimestamp" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsappMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."whatsappTemplate" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "language" TEXT,
    "category" TEXT,
    "status" TEXT,
    "qualityScore" TEXT,
    "rejectedReason" TEXT,
    "components" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsappTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."whatsappCallEvent" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "direction" TEXT,
    "fromNumber" TEXT,
    "toNumber" TEXT,
    "status" TEXT,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "duration" INTEGER,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsappCallEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."whatsappAccountState" (
    "id" TEXT NOT NULL,
    "subjectKey" TEXT NOT NULL,
    "wabaId" TEXT,
    "phoneNumberId" TEXT,
    "displayPhoneNumber" TEXT,
    "nameStatus" TEXT,
    "nameRejectionReason" TEXT,
    "qualityRating" TEXT,
    "throughputLevel" TEXT,
    "messagingLimit" TEXT,
    "phoneNumberLimit" TEXT,
    "accountReviewStatus" TEXT,
    "accountUpdateEvent" TEXT,
    "businessVerificationStatus" TEXT,
    "officialBusinessAccountStatus" TEXT,
    "securityStatus" TEXT,
    "lastEventField" TEXT,
    "lastEventAt" TIMESTAMP(3),
    "lastEventPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsappAccountState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."whatsappUserPreference" (
    "id" TEXT NOT NULL,
    "waId" TEXT NOT NULL,
    "marketingStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsappUserPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsappMessage_waMessageId_key" ON "public"."whatsappMessage"("waMessageId");
CREATE INDEX "whatsappMessage_customerId_idx" ON "public"."whatsappMessage"("customerId");
CREATE INDEX "whatsappMessage_fromNumber_idx" ON "public"."whatsappMessage"("fromNumber");
CREATE INDEX "whatsappMessage_toNumber_idx" ON "public"."whatsappMessage"("toNumber");
CREATE INDEX "whatsappMessage_status_idx" ON "public"."whatsappMessage"("status");

-- CreateIndex
CREATE UNIQUE INDEX "whatsappTemplate_templateId_key" ON "public"."whatsappTemplate"("templateId");
CREATE INDEX "whatsappTemplate_name_idx" ON "public"."whatsappTemplate"("name");
CREATE INDEX "whatsappTemplate_status_idx" ON "public"."whatsappTemplate"("status");

-- CreateIndex
CREATE INDEX "whatsappCallEvent_callId_idx" ON "public"."whatsappCallEvent"("callId");
CREATE INDEX "whatsappCallEvent_event_idx" ON "public"."whatsappCallEvent"("event");

-- CreateIndex
CREATE UNIQUE INDEX "whatsappAccountState_subjectKey_key" ON "public"."whatsappAccountState"("subjectKey");
CREATE INDEX "whatsappAccountState_wabaId_idx" ON "public"."whatsappAccountState"("wabaId");
CREATE INDEX "whatsappAccountState_phoneNumberId_idx" ON "public"."whatsappAccountState"("phoneNumberId");

-- CreateIndex
CREATE UNIQUE INDEX "whatsappUserPreference_waId_key" ON "public"."whatsappUserPreference"("waId");
