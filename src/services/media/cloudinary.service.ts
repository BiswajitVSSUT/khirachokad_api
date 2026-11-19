import { v2 as cloudinary } from "cloudinary";
import { AppError } from "../../utils/AppError.js";
import { logger } from "../../config/logger.js";

function configure() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new AppError("Cloudinary is not configured", 500);
  }
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
  return cloudinary;
}

export async function uploadChatImage(input: {
  base64: string;
  mimeType: string;
  filename?: string;
}): Promise<string> {
  const encoded = input.base64.replace(/^data:[^;]+;base64,/, "");
  const dataUri = `data:${input.mimeType};base64,${encoded}`;
  const started = performance.now();
  try {
    const resourceType: "image" | "video" | "raw" = input.mimeType.startsWith("image/") ? "image" : input.mimeType.startsWith("video/") ? "video" : "raw";
    const result = await configure().uploader.upload(dataUri, {
      folder: process.env.CLOUDINARY_FOLDER || "kc-chat",
      resource_type: resourceType,
      ...(input.filename ? { public_id: input.filename.replace(/[^a-zA-Z0-9._-]/g, "-") } : {}),
    });
    logger.info({ durationMs: Math.round(performance.now() - started) }, "Cloudinary upload completed");
    return result.secure_url;
  } catch {
    throw new AppError("Cloudinary image upload failed", 502);
  }
}
