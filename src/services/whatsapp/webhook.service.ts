import crypto from "crypto";
import { Prisma } from "@prisma/client";

import { prisma } from "../../config/prisma.js";
import { logger } from "../../config/logger.js";
import {
  handleIncomingMessage,
  type InboundMessage,
} from "./conversation.service.js";
import type { CatalogOrderInput } from "./order.service.js";
import { markMessageRead } from "./whatsapp.service.js";

type JsonObject = Record<string, unknown>;

export type WhatsAppWebhookBody = {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{ field?: string; value?: unknown }>;
  }>;
};

type ChangeContext = {
  field: string;
  value: JsonObject;
  wabaId: string | undefined;
};

type EventInput = {
  eventKey: string;
  field: string;
  eventType: string;
  payload: unknown;
  messageId?: string | null | undefined;
  wabaId?: string | null | undefined;
  phoneNumberId?: string | null | undefined;
};

// ---------------------------------------------------------------------------
// Payload helpers. Meta adds fields over time, so every handler reads the
// payload defensively and stores the raw value as well.
// ---------------------------------------------------------------------------

function asRecord(value: unknown): JsonObject | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string") return value.length > 0 ? value : undefined;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function asInteger(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(asString(value));
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function parseTimestamp(value: unknown): Date | undefined {
  const raw = asString(value);
  if (!raw) return undefined;

  if (/^\d+$/.test(raw)) {
    return new Date(Number(raw) * 1000);
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function payloadHash(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function getPhoneNumberId(value: JsonObject): string | undefined {
  const metadata = asRecord(value.metadata);
  return (
    asString(value.phone_number_id) ?? asString(metadata?.phone_number_id)
  );
}

function getDisplayPhoneNumber(value: JsonObject): string | undefined {
  const metadata = asRecord(value.metadata);
  return (
    asString(value.display_phone_number) ??
    asString(metadata?.display_phone_number)
  );
}

// ---------------------------------------------------------------------------
// Idempotency. Meta retries failed deliveries for up to 7 days, so every
// message, status, call, and change payload is recorded before it is handled.
// ---------------------------------------------------------------------------

async function registerEvent(input: EventInput): Promise<boolean> {
  try {
    await prisma.whatsappEvent.create({
      data: {
        eventKey: input.eventKey,
        messageId: input.messageId ?? null,
        field: input.field,
        eventType: input.eventType,
        wabaId: input.wabaId ?? null,
        phoneNumberId: input.phoneNumberId ?? null,
        payload: toJson(input.payload),
      },
    });
    return true;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      // Meta retried an event we already processed.
      return false;
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Entry point.
// ---------------------------------------------------------------------------

export async function processWhatsAppWebhook(
  body: WhatsAppWebhookBody
): Promise<void> {
  if (body.object !== "whatsapp_business_account") return;

  for (const entry of body.entry ?? []) {
    const wabaId = asString(entry.id);

    for (const change of entry.changes ?? []) {
      const field = asString(change.field);
      const value = asRecord(change.value);
      if (!field || !value) continue;

      try {
        await handleChange({ field, value, wabaId });
      } catch (error) {
        // Keep processing the remaining changes. The event stays registered so
        // a retry cannot duplicate an order or outbound message.
        logger.error({ err: error, field, wabaId }, "WhatsApp webhook change failed");
      }
    }
  }
}

async function handleChange(ctx: ChangeContext): Promise<void> {
  switch (ctx.field) {
    case "messages":
      await handleMessages(ctx);
      return;

    case "smb_message_echoes":
      await handleMessageEchoes(ctx);
      return;

    case "message_template_status_update":
    case "message_template_quality_update":
    case "template_category_update":
    case "message_template_components_update":
      await handleTemplate(ctx);
      return;

    case "calls":
      await handleCalls(ctx);
      return;

    case "account_alerts":
    case "account_review_update":
    case "account_update":
    case "business_capability_update":
    case "phone_number_name_update":
    case "phone_number_quality_update":
    case "security":
      await handleAccountUpdate(ctx);
      return;

    case "user_preferences":
      await handleUserPreferences(ctx);
      return;

    // history, smb_app_state_sync, partner_solutions,
    // payment_configuration_update, automatic_events and any future field are
    // retained in whatsappEvent for later processing.
    default:
      await recordRawChange(ctx);
  }
}

async function recordRawChange(ctx: ChangeContext): Promise<void> {
  await registerEvent({
    eventKey: `${ctx.field}:${payloadHash(ctx.value)}`,
    field: ctx.field,
    eventType: ctx.field,
    wabaId: ctx.wabaId,
    phoneNumberId: getPhoneNumberId(ctx.value),
    payload: ctx.value,
  });
}

// ---------------------------------------------------------------------------
// messages: inbound user messages and outbound delivery statuses.
// ---------------------------------------------------------------------------

async function handleMessages(ctx: ChangeContext): Promise<void> {
  const { value, wabaId } = ctx;
  const phoneNumberId = getPhoneNumberId(value);
  const contact = asRecord(asArray(value.contacts)[0]);
  const contactName = asString(asRecord(contact?.profile)?.name);

  for (const raw of asArray(value.messages)) {
    const message = asRecord(raw);
    if (!message) continue;

    const messageId = asString(message.id);
    const from = asString(message.from);
    if (!messageId || !from) continue;

    const type = asString(message.type) ?? "unknown";
    const isNew = await registerEvent({
      eventKey: `messages:message:${messageId}`,
      messageId,
      field: ctx.field,
      eventType: `message.${type}`,
      wabaId,
      phoneNumberId,
      payload: message,
    });
    if (!isNew) continue;

    await upsertInboundMessage({ messageId, from, type, message });

    await markMessageRead(messageId).catch((error) => {
      logger.error({ err: error, messageId }, "Failed to mark WhatsApp message as read");
    });

    const inbound: InboundMessage = { id: messageId, type };
    const textBody = asString(asRecord(message.text)?.body);
    if (textBody !== undefined) inbound.text = textBody;

    const interactive = asRecord(message.interactive);
    if (interactive) {
      inbound.interactive =
        interactive as NonNullable<InboundMessage["interactive"]>;
    }

    const order = asRecord(message.order);
    if (type === "order" && order) {
      inbound.order = order as CatalogOrderInput;
    }

    await handleIncomingMessage({
      phone: from,
      ...(contactName !== undefined ? { name: contactName } : {}),
      message: inbound,
    });
  }

  for (const raw of asArray(value.statuses)) {
    const status = asRecord(raw);
    if (!status) continue;

    const messageId = asString(status.id);
    const state = asString(status.status);
    if (!messageId || !state) continue;

    const timestamp = asString(status.timestamp);
    const isNew = await registerEvent({
      eventKey: `messages:status:${messageId}:${state}:${
        timestamp ?? payloadHash(status)
      }`,
      messageId,
      field: ctx.field,
      eventType: `status.${state}`,
      wabaId,
      phoneNumberId,
      payload: status,
    });
    if (!isNew) continue;

    await applyMessageStatus({ messageId, state, status });
  }
}

async function upsertInboundMessage(input: {
  messageId: string;
  from: string;
  type: string;
  message: JsonObject;
}): Promise<void> {
  const customer = await prisma.customer.findUnique({
    where: { whatsappNumber: input.from },
    select: { id: true },
  });
  const timestamp = parseTimestamp(input.message.timestamp);

  await prisma.whatsappMessage.upsert({
    where: { waMessageId: input.messageId },
    update: {
      type: input.type,
      fromNumber: input.from,
      customerId: customer?.id ?? null,
      waTimestamp: timestamp ?? null,
    },
    create: {
      waMessageId: input.messageId,
      direction: "INBOUND",
      type: input.type,
      status: "received",
      fromNumber: input.from,
      customerId: customer?.id ?? null,
      waTimestamp: timestamp ?? null,
    },
  });
}

async function applyMessageStatus(input: {
  messageId: string;
  state: string;
  status: JsonObject;
}): Promise<void> {
  const { status } = input;
  const pricing = asRecord(status.pricing);
  const error = asRecord(asArray(status.errors)[0]);
  const timestamp = parseTimestamp(status.timestamp);

  const data = {
    status: input.state,
    toNumber: asString(status.recipient_id) ?? null,
    pricingCategory: asString(pricing?.category) ?? null,
    errorCode: asString(error?.code) ?? null,
    errorTitle: asString(error?.title) ?? null,
    errorMessage: asString(error?.message) ?? null,
    waTimestamp: timestamp ?? null,
  };

  await prisma.whatsappMessage.upsert({
    where: { waMessageId: input.messageId },
    update: data,
    create: {
      waMessageId: input.messageId,
      direction: "OUTBOUND",
      ...data,
    },
  });
}

// ---------------------------------------------------------------------------
// smb_message_echoes: messages sent from the WhatsApp Business app or a
// linked device after onboarding. Store them so the thread stays complete.
// ---------------------------------------------------------------------------

async function handleMessageEchoes(ctx: ChangeContext): Promise<void> {
  const { value, wabaId } = ctx;
  const phoneNumberId = getPhoneNumberId(value);

  for (const raw of asArray(value.message_echoes)) {
    const echo = asRecord(raw);
    if (!echo) continue;

    const messageId = asString(echo.id);
    if (!messageId) continue;

    const isNew = await registerEvent({
      eventKey: `smb_message_echoes:${messageId}`,
      messageId,
      field: ctx.field,
      eventType: "smb_message_echo",
      wabaId,
      phoneNumberId,
      payload: echo,
    });
    if (!isNew) continue;

    const from = asString(echo.from);
    const to = asString(echo.to);
    const customer = to
      ? await prisma.customer.findUnique({
          where: { whatsappNumber: to },
          select: { id: true },
        })
      : null;
    const timestamp = parseTimestamp(echo.timestamp);

    await prisma.whatsappMessage.upsert({
      where: { waMessageId: messageId },
      update: {
        type: asString(echo.type) ?? null,
        fromNumber: from ?? null,
        toNumber: to ?? null,
        customerId: customer?.id ?? null,
        waTimestamp: timestamp ?? null,
      },
      create: {
        waMessageId: messageId,
        direction: "OUTBOUND",
        type: asString(echo.type) ?? null,
        status: "sent",
        fromNumber: from ?? null,
        toNumber: to ?? null,
        customerId: customer?.id ?? null,
        waTimestamp: timestamp ?? null,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Templates: status, quality score, category, and components.
// ---------------------------------------------------------------------------

async function handleTemplate(ctx: ChangeContext): Promise<void> {
  const { field, value, wabaId } = ctx;
  const templateId = asString(value.message_template_id);

  if (!templateId) {
    await recordRawChange(ctx);
    return;
  }

  const templateName = asString(value.message_template_name);
  const language = asString(value.message_template_language);

  const isNew = await registerEvent({
    eventKey: `${field}:${templateId}:${payloadHash(value)}`,
    field,
    eventType: field,
    wabaId,
    phoneNumberId: getPhoneNumberId(value),
    payload: value,
  });
  if (!isNew) return;

  const createData: Prisma.whatsappTemplateCreateInput = {
    templateId,
    name: templateName ?? templateId,
    language: language ?? null,
  };
  const updateData: Prisma.whatsappTemplateUpdateInput = {};

  switch (field) {
    case "message_template_status_update": {
      const status = asString(value.event);
      if (status) {
        createData.status = status;
        updateData.status = status;
      }

      const reason = asString(value.reason);
      if (reason) {
        createData.rejectedReason = reason;
        updateData.rejectedReason = reason;
      }
      break;
    }

    case "message_template_quality_update": {
      const score = asString(value.new_quality_score);
      if (score) {
        createData.qualityScore = score;
        updateData.qualityScore = score;
      }
      break;
    }

    case "template_category_update": {
      const category = asString(value.new_category);
      if (category) {
        createData.category = category;
        updateData.category = category;
      }
      break;
    }

    case "message_template_components_update": {
      const components = value.new_components ?? value.components;
      if (components !== undefined) {
        const json = toJson(components);
        createData.components = json;
        updateData.components = json;
      }
      break;
    }
  }

  await prisma.whatsappTemplate.upsert({
    where: { templateId },
    create: createData,
    update: updateData,
  });
}

// ---------------------------------------------------------------------------
// Calls: user-initiated and business-initiated call events.
// ---------------------------------------------------------------------------

async function handleCalls(ctx: ChangeContext): Promise<void> {
  const { value, wabaId } = ctx;
  const phoneNumberId = getPhoneNumberId(value);

  for (const raw of asArray(value.calls)) {
    const call = asRecord(raw);
    if (!call) continue;

    const callId = asString(call.id);
    const event = asString(call.event) ?? asString(call.status);
    if (!callId || !event) continue;

    const timestamp = asString(call.timestamp);
    const isNew = await registerEvent({
      eventKey: `calls:${callId}:${event}:${
        timestamp ?? payloadHash(call)
      }`,
      field: ctx.field,
      eventType: `call.${event}`,
      wabaId,
      phoneNumberId,
      payload: call,
    });
    if (!isNew) continue;

    await prisma.whatsappCallEvent.create({
      data: {
        callId,
        event,
        direction: asString(call.direction) ?? null,
        fromNumber: asString(call.from) ?? null,
        toNumber: asString(call.to) ?? null,
        status: asString(call.status) ?? event,
        startTime: parseTimestamp(call.start_time) ?? null,
        endTime: parseTimestamp(call.end_time) ?? null,
        duration: asInteger(call.duration) ?? null,
        payload: toJson(call),
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Account, phone number, and security events.
// ---------------------------------------------------------------------------

type AccountStatePatch = {
  wabaId?: string;
  phoneNumberId?: string;
  displayPhoneNumber?: string;
  nameStatus?: string;
  nameRejectionReason?: string;
  qualityRating?: string;
  throughputLevel?: string;
  messagingLimit?: string;
  phoneNumberLimit?: string;
  accountReviewStatus?: string;
  accountUpdateEvent?: string;
  businessVerificationStatus?: string;
  officialBusinessAccountStatus?: string;
  securityStatus?: string;
  lastEventField: string;
  lastEventAt: Date;
  lastEventPayload: Prisma.InputJsonValue;
};

async function handleAccountUpdate(ctx: ChangeContext): Promise<void> {
  const { field, value, wabaId } = ctx;
  const phoneNumberId = getPhoneNumberId(value);
  const displayPhoneNumber = getDisplayPhoneNumber(value);
  const subjectKey = phoneNumberId ?? wabaId;

  const isNew = await registerEvent({
    eventKey: `${field}:${payloadHash(value)}`,
    field,
    eventType: field,
    wabaId,
    phoneNumberId,
    payload: value,
  });
  if (!isNew) return;
  if (!subjectKey) return;

  const patch: AccountStatePatch = {
    lastEventField: field,
    lastEventAt: new Date(),
    lastEventPayload: toJson(value),
  };

  if (wabaId !== undefined) patch.wabaId = wabaId;
  if (phoneNumberId !== undefined) patch.phoneNumberId = phoneNumberId;
  if (displayPhoneNumber !== undefined) {
    patch.displayPhoneNumber = displayPhoneNumber;
  }

  switch (field) {
    case "account_alerts": {
      const alert = asRecord(value.alert_info);
      const alertType = asString(alert?.alert_type);
      const info = asRecord(alert?.alert_info) ?? alert;

      if (alertType === "MESSAGING_LIMIT") {
        const limit =
          asString(info?.current_limit) ?? asString(info?.messaging_limit);
        if (limit !== undefined) patch.messagingLimit = limit;
      }

      if (alertType === "OFFICIAL_BUSINESS_ACCOUNT") {
        const status = asString(info?.status) ?? asString(info?.decision);
        if (status !== undefined) {
          patch.officialBusinessAccountStatus = status;
        }
      }

      if (alertType === "BUSINESS_PROFILE") {
        const status = asString(info?.status);
        if (status !== undefined) {
          patch.businessVerificationStatus = status;
        }
      }
      break;
    }

    case "account_review_update": {
      const status = asString(value.decision) ?? asString(value.event);
      if (status !== undefined) patch.accountReviewStatus = status;
      break;
    }

    case "account_update": {
      const event = asString(value.event);
      if (event !== undefined) patch.accountUpdateEvent = event;
      break;
    }

    case "business_capability_update": {
      const messagingLimit =
        asString(value.max_daily_conversations_per_phone_number) ??
        asString(value.messaging_limit);
      if (messagingLimit !== undefined) patch.messagingLimit = messagingLimit;

      const phoneLimit =
        asString(value.max_phone_numbers_per_waba) ??
        asString(value.phone_number_limit);
      if (phoneLimit !== undefined) patch.phoneNumberLimit = phoneLimit;
      break;
    }

    case "phone_number_name_update": {
      const status = asString(value.decision) ?? asString(value.status);
      if (status !== undefined) patch.nameStatus = status;

      const reason = asString(value.rejection_reason);
      if (reason !== undefined) patch.nameRejectionReason = reason;
      break;
    }

    case "phone_number_quality_update": {
      const quality =
        asString(value.current_quality_score) ??
        asString(value.quality_rating) ??
        asString(value.event);
      if (quality !== undefined) patch.qualityRating = quality;

      const throughput =
        asString(value.current_limit) ?? asString(value.throughput_level);
      if (throughput !== undefined) patch.throughputLevel = throughput;
      break;
    }

    case "security": {
      const status = asString(value.event) ?? asString(value.status);
      if (status !== undefined) patch.securityStatus = status;
      break;
    }
  }

  await prisma.whatsappAccountState.upsert({
    where: { subjectKey },
    update: patch,
    create: { subjectKey, ...patch },
  });
}

// ---------------------------------------------------------------------------
// Marketing preferences.
// ---------------------------------------------------------------------------

async function handleUserPreferences(ctx: ChangeContext): Promise<void> {
  const { field, value, wabaId } = ctx;

  const isNew = await registerEvent({
    eventKey: `${field}:${payloadHash(value)}`,
    field,
    eventType: field,
    wabaId,
    phoneNumberId: getPhoneNumberId(value),
    payload: value,
  });
  if (!isNew) return;

  for (const raw of asArray(value.user_preferences)) {
    const preference = asRecord(raw);
    const waId = asString(preference?.wa_id);
    if (!waId) continue;

    let marketingStatus: string | undefined;
    for (const rawEntry of asArray(preference?.preferences)) {
      const entry = asRecord(rawEntry);
      if (asString(entry?.type)?.toLowerCase() !== "marketing") continue;

      marketingStatus = asString(entry?.status) ?? asString(entry?.value);
    }
    if (marketingStatus === undefined) continue;

    await prisma.whatsappUserPreference.upsert({
      where: { waId },
      update: { marketingStatus },
      create: { waId, marketingStatus },
    });
  }
}
