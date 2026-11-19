import { Prisma } from "@prisma/client";

import { prisma } from "../../config/prisma.js";
import { logger } from "../../config/logger.js";
import { uploadChatImage } from "../media/cloudinary.service.js";
import { downloadWhatsAppMedia, getTeamWhatsAppNumbers, markMessageRead, sendTeamAlert, sendTeamAlertTo } from "./whatsapp.service.js";

export const OUTBOX = {
  TEAM_ALERT: "TEAM_ALERT",
  MARK_READ: "MARK_READ",
  TRANSFER_MEDIA: "TRANSFER_MEDIA",
} as const;

type OutboxType = (typeof OUTBOX)[keyof typeof OUTBOX];

export function enqueueOutbox(
  tx: Prisma.TransactionClient,
  type: OutboxType,
  payload: Prisma.InputJsonValue,
  delayMs = 0
) {
  return tx.whatsappOutbox.create({ data: { type, payload, availableAt: new Date(Date.now() + delayMs) } });
}

/** Queue one independent delivery per team number so one failed recipient
 * neither blocks nor duplicates the alert for the other recipients. */
export async function enqueueTeamAlerts(
  tx: Prisma.TransactionClient,
  body: string,
  delayMs = 0
): Promise<void> {
  const teamNumbers = getTeamWhatsAppNumbers();
  await Promise.all(teamNumbers.map((recipient) => enqueueOutbox(tx, OUTBOX.TEAM_ALERT, { body, recipient }, delayMs)));
}

const RETRY_LIMIT = Number(process.env.WHATSAPP_OUTBOX_RETRY_LIMIT ?? 8);
let timer: NodeJS.Timeout | undefined;
let draining = false;

function retryDelay(attempt: number): number {
  return Math.min(15 * 60_000, 1_000 * 2 ** Math.min(attempt, 8));
}

function recipientLogValue(payload: Record<string, unknown>): string | undefined {
  if (typeof payload.recipient !== "string") return undefined;
  return `***${payload.recipient.slice(-4)}`;
}

function isTransient(error: unknown): boolean {
  if (error instanceof Error) {
    const status = Number(error.message.match(/\((\d{3})\)/)?.[1]);
    if (status) return status === 408 || status === 429 || status >= 500;
    // Abort/network errors and our gateway errors have no stable HTTP code.
    return error.name === "AbortError" || /network|timeout|gateway|Cloudinary/i.test(error.message);
  }
  return false;
}

async function execute(type: string, payload: Record<string, unknown>): Promise<void> {
  if (type === OUTBOX.TEAM_ALERT) {
    if (typeof payload.body !== "string") throw new Error("Invalid team alert payload");
    if (typeof payload.recipient === "string") {
      await sendTeamAlertTo(payload.recipient, payload.body);
      return;
    }
    // Compatibility for jobs created before alerts became per-recipient.
    await sendTeamAlert(payload.body);
    return;
  }
  if (type === OUTBOX.MARK_READ) {
    if (typeof payload.messageId !== "string") throw new Error("Invalid read receipt payload");
    await markMessageRead(payload.messageId);
    return;
  }
  if (type === OUTBOX.TRANSFER_MEDIA) {
    if (typeof payload.mediaId !== "string" || typeof payload.waMessageId !== "string") {
      throw new Error("Invalid media transfer payload");
    }
    const media = await downloadWhatsAppMedia(payload.mediaId);
    const mediaUrl = await uploadChatImage(media);
    await prisma.whatsappMessage.update({ where: { waMessageId: payload.waMessageId }, data: { mediaUrl } });
    return;
  }
  throw new Error(`Unknown WhatsApp outbox type: ${type}`);
}

export async function drainWhatsAppOutbox(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    // A process can be stopped midway through a job. Release old leases so a
    // healthy worker can retry them rather than leaving work stranded.
    await prisma.whatsappOutbox.updateMany({
      where: { status: "RUNNING", lockedAt: { lt: new Date(Date.now() - 15 * 60_000) } },
      data: { status: "RETRY", availableAt: new Date() },
    });
    while (true) {
      const job = await prisma.whatsappOutbox.findFirst({
        where: { status: { in: ["PENDING", "RETRY"] }, availableAt: { lte: new Date() } },
        orderBy: { createdAt: "asc" },
      });
      if (!job) return;
      const claimed = await prisma.whatsappOutbox.updateMany({
        where: { id: job.id, status: job.status },
        data: { status: "RUNNING", lockedAt: new Date(), attempts: { increment: 1 } },
      });
      if (!claimed.count) continue;
      const started = performance.now();
      try {
        await execute(job.type, job.payload as Record<string, unknown>);
        await prisma.whatsappOutbox.update({ where: { id: job.id }, data: { status: "DONE", lastError: null } });
        logger.info({ outboxId: job.id, type: job.type, recipient: recipientLogValue(job.payload as Record<string, unknown>), durationMs: Math.round(performance.now() - started) }, "WhatsApp outbox job completed");
      } catch (error) {
        const attempts = job.attempts + 1;
        const exhausted = attempts >= RETRY_LIMIT || !isTransient(error);
        await prisma.whatsappOutbox.update({
          where: { id: job.id },
          data: exhausted
            ? { status: "FAILED", lastError: error instanceof Error ? error.message.slice(0, 2_000) : String(error) }
            : { status: "RETRY", availableAt: new Date(Date.now() + retryDelay(attempts)), lastError: error instanceof Error ? error.message.slice(0, 2_000) : String(error) },
        });
        logger.warn({ err: error, outboxId: job.id, type: job.type, recipient: recipientLogValue(job.payload as Record<string, unknown>), attempts }, "WhatsApp outbox job failed");
      }
    }
  } finally {
    draining = false;
  }
}

export function startWhatsAppOutboxWorker(): void {
  if (timer) return;
  const intervalMs = Number(process.env.WHATSAPP_OUTBOX_POLL_MS ?? 1_000);
  void drainWhatsAppOutbox().catch((error) => logger.error({ err: error }, "WhatsApp outbox drain failed"));
  timer = setInterval(() => void drainWhatsAppOutbox().catch((error) => logger.error({ err: error }, "WhatsApp outbox drain failed")), intervalMs);
  timer.unref();
}
