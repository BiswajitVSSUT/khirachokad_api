import crypto from "crypto";
import { Request, Response } from "express";

import { verifyWhatsAppSignature } from "../../services/whatsapp/signature.js";
import {
  processWhatsAppWebhook,
  type WhatsAppWebhookBody,
} from "../../services/whatsapp/webhook.service.js";

type RawBodyRequest = Request & { rawBody?: Buffer };

function queryString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");

  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Meta webhook verification (GET). */
export const verifyWebhook = (req: Request, res: Response) => {
  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN;
  const mode = queryString(req.query["hub.mode"]);
  const token = queryString(req.query["hub.verify_token"]);
  const challenge = queryString(req.query["hub.challenge"]);

  if (!expectedToken) {
    console.error(
      "WHATSAPP_VERIFY_TOKEN is not configured; rejecting webhook verification."
    );
    return res.sendStatus(403);
  }

  if (mode === "subscribe" && token && safeEqual(token, expectedToken)) {
    return res.status(200).send(challenge ?? "");
  }

  return res.sendStatus(403);
};

/** Incoming messages, statuses, and all other subscribed fields (POST). */
export const receiveWebhook = (req: Request, res: Response) => {
  const signature = req.headers["x-hub-signature-256"];
  const rawBody = (req as RawBodyRequest).rawBody;

  if (
    !verifyWhatsAppSignature(
      rawBody,
      typeof signature === "string" ? signature : undefined
    )
  ) {
    return res.sendStatus(401);
  }

  const body = req.body as WhatsAppWebhookBody;

  // Acknowledge quickly so Meta does not retry. Processing continues in the
  // background; in a multi-instance deployment move this to a durable queue.
  res.sendStatus(200);

  void processWhatsAppWebhook(body).catch((error) => {
    console.error("WhatsApp webhook processing failed:", error);
  });
};
