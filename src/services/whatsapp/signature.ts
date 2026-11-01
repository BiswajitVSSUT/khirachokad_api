import crypto from "crypto";
import { logger } from "../../config/logger.js";

/**
 * Verifies Meta's X-Hub-Signature-256 header against the raw request body.
 * If WHATSAPP_APP_SECRET is not configured (local development), verification
 * is skipped.
 */
export function verifyWhatsAppSignature(
  rawBody: Buffer | undefined,
  signature: string | undefined
): boolean {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    if (process.env.NODE_ENV === "production") {
      logger.error("WHATSAPP_APP_SECRET is not configured; rejecting WhatsApp webhook.");
      return false;
    }
    return true;
  }

  if (!rawBody || !signature || !signature.startsWith("sha256=")) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex");
  const received = signature.slice("sha256=".length);

  if (expected.length !== received.length) return false;

  return crypto.timingSafeEqual(
    Buffer.from(expected, "utf8"),
    Buffer.from(received, "utf8")
  );
}
