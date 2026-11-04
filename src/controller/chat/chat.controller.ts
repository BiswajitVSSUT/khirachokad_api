import { Request, Response } from "express";
import { z } from "zod";
import crypto from "crypto";

import { prisma } from "../../config/prisma.js";
import { uploadChatImage } from "../../services/media/cloudinary.service.js";
import { downloadWhatsAppMedia, sendImage, sendText, sendMedia } from "../../services/whatsapp/whatsapp.service.js";
import { sendError, sendSuccess } from "../../utils/response.js";

const messageSchema = z.object({
  body: z.string().trim().max(4096).optional(),
  mediaBase64: z.string().optional(),
  mediaUrl: z.string().url().optional(),
  mediaMimeType: z.string().optional(),
  mediaName: z.string().max(120).optional(),
  imageBase64: z.string().optional(),
  imageUrl: z.string().url().optional(),
  imageMimeType: z.string().optional(),
  imageName: z.string().max(120).optional(),
  caption: z.string().trim().max(1024).optional(),
}).refine((data) => Boolean(data.body || data.mediaBase64 || data.mediaUrl || data.imageBase64 || data.imageUrl), "A text message or media is required")
 .refine((data) => !data.mediaBase64 && !data.imageBase64 || Boolean(data.mediaMimeType || data.imageMimeType), "Media MIME type is required");

function id(req: Request) { return req.params.customerId?.trim(); }

function responseMessageId(value: unknown): string {
  const result = value as { messages?: Array<{ id?: string }> };
  return result.messages?.[0]?.id ?? `local-${crypto.randomUUID()}`;
}

export async function listChats(_req: Request, res: Response) {
  const chats = await prisma.customer.findMany({
    include: { whatsappMessages: { orderBy: { createdAt: "desc" }, take: 1 } },
    orderBy: { updatedAt: "desc" },
  });
  return sendSuccess(res, "Chats fetched", chats.map(({ whatsappMessages, ...customer }) => ({
    ...customer, lastMessage: whatsappMessages[0] ?? null,
  })));
}

export async function getChat(req: Request, res: Response) {
  const customerId = id(req);
  if (!customerId) return sendError(res, "Customer id is required", null, 400);
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      whatsappMessages: { orderBy: { createdAt: "asc" }, take: 250 },
      orders: { include: { items: true }, orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!customer) return sendError(res, "Customer not found", null, 404);
  const whatsappMessages = await Promise.all(customer.whatsappMessages.map(async (message) => {
    if (!message.mediaUrl || message.mediaUrl.startsWith("http")) return message;
    try {
      const downloaded = await downloadWhatsAppMedia(message.mediaUrl);
      const mediaUrl = await uploadChatImage(downloaded);
      await prisma.whatsappMessage.update({ where: { id: message.id }, data: { mediaUrl } });
      return { ...message, mediaUrl };
    } catch {
      return message;
    }
  }));
  return sendSuccess(res, "Chat fetched", { ...customer, whatsappMessages });
}

export async function setBotMode(req: Request, res: Response) {
  const customerId = id(req);
  const parsed = z.object({ enabled: z.boolean() }).safeParse(req.body);
  if (!customerId || !parsed.success) return sendError(res, "A customer id and enabled flag are required", null, 400);
  const customer = await prisma.customer.update({
    where: { id: customerId }, data: { botBlacklist: parsed.data.enabled },
  }).catch(() => null);
  if (!customer) return sendError(res, "Customer not found", null, 404);
  return sendSuccess(res, parsed.data.enabled ? "Bot paused for this customer" : "Bot resumed for this customer", customer);
}

export async function clearChat(req: Request, res: Response) {
  const customerId = id(req);
  if (!customerId) return sendError(res, "Customer id is required", null, 400);
  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
  if (!customer) return sendError(res, "Customer not found", null, 404);
  const result = await prisma.whatsappMessage.deleteMany({ where: { customerId } });
  return sendSuccess(res, "Chat cleared", { deleted: result.count });
}

export async function sendChatMessage(req: Request, res: Response) {
  const customerId = id(req);
  const parsed = messageSchema.safeParse(req.body);
  if (!customerId || !parsed.success) return sendError(res, "Invalid message", parsed.error, 400);
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) return sendError(res, "Customer not found", null, 404);
  const payload = parsed.data;
  let mediaUrl: string | null = null;
  const mediaUrlInput = payload.mediaUrl || payload.imageUrl;
  const mediaBase64 = payload.mediaBase64 || payload.imageBase64;
  const mediaMimeType = payload.mediaMimeType || payload.imageMimeType;
  const mediaName = payload.mediaName || payload.imageName;
  const mediaType = payload.imageUrl && !mediaMimeType ? "image" : mediaMimeType?.startsWith("image/") ? "image" : mediaMimeType?.startsWith("video/") ? "video" : "document";
  let result: unknown;
  if (mediaUrlInput) {
    mediaUrl = mediaUrlInput;
    result = await sendMedia(customer.whatsappNumber, mediaUrl, mediaType, payload.caption, mediaName);
  } else if (mediaBase64 && mediaMimeType) {
    mediaUrl = await uploadChatImage({
      base64: mediaBase64,
      mimeType: mediaMimeType,
      ...(mediaName ? { filename: mediaName } : {}),
    });
    result = await sendMedia(customer.whatsappNumber, mediaUrl, mediaType, payload.caption, mediaName);
  } else {
    result = await sendText(customer.whatsappNumber, payload.body!);
  }
  const message = await prisma.whatsappMessage.create({ data: {
    waMessageId: responseMessageId(result), direction: "OUTBOUND", type: mediaUrl ? mediaType : "text",
    status: "sent", toNumber: customer.whatsappNumber, customerId, body: payload.body ?? payload.caption ?? null,
    caption: payload.caption ?? null, mediaUrl,
  }});
  return sendSuccess(res, "Message sent", message, 201);
}

export async function uploadChatMedia(req: Request, res: Response) {
  const parsed = z.object({ base64: z.string().min(1), mimeType: z.string().min(3), filename: z.string().max(120).optional() }).safeParse(req.body);
  if (!parsed.success) return sendError(res, "Invalid media upload", parsed.error, 400);
  const url = await uploadChatImage({
    base64: parsed.data.base64,
    mimeType: parsed.data.mimeType,
    ...(parsed.data.filename ? { filename: parsed.data.filename } : {}),
  });
  return sendSuccess(res, "Media uploaded", { url }, 201);
}

export async function listQuickReplies(_req: Request, res: Response) {
  return sendSuccess(res, "Quick replies fetched", await prisma.quickReply.findMany({ orderBy: { createdAt: "asc" } }));
}

export async function createQuickReply(req: Request, res: Response) {
  const parsed = z.object({ shortcut: z.string().trim().min(1).max(80), text: z.string().trim().min(1).max(4096), imageUrl: z.string().url().optional() }).safeParse(req.body);
  if (!parsed.success) return sendError(res, "Invalid quick reply", parsed.error, 400);
  return sendSuccess(res, "Quick reply created", await prisma.quickReply.create({ data: { shortcut: parsed.data.shortcut, text: parsed.data.text, imageUrl: parsed.data.imageUrl ?? null } }), 201);
}

export async function updateQuickReply(req: Request, res: Response) {
  const parsed = z.object({ shortcut: z.string().trim().min(1).max(80), text: z.string().trim().min(1).max(4096), imageUrl: z.string().url().nullable().optional() }).safeParse(req.body);
  if (!parsed.success) return sendError(res, "Invalid quick reply", parsed.error, 400);
  const replyId = req.params.replyId;
  if (!replyId) return sendError(res, "Reply id is required", null, 400);
  return sendSuccess(res, "Quick reply updated", await prisma.quickReply.update({ where: { id: replyId }, data: { shortcut: parsed.data.shortcut, text: parsed.data.text, ...(parsed.data.imageUrl !== undefined ? { imageUrl: parsed.data.imageUrl } : {}) } }));
}

export async function deleteQuickReply(req: Request, res: Response) {
  const replyId = req.params.replyId;
  if (!replyId) return sendError(res, "Reply id is required", null, 400);
  await prisma.quickReply.delete({ where: { id: replyId } });
  return sendSuccess(res, "Quick reply deleted", null);
}
