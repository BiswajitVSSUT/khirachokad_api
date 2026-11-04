import { AppError } from "../../utils/AppError.js";

const DEFAULT_GRAPH_VERSION = "v23.0";

export type CatalogProduct = {
  retailerId: string;
  name: string;
  price: string;
  availability: string;
  inventory: number | null;
};

function getGraphUrl(): string {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!phoneNumberId) {
    throw new AppError("WHATSAPP_PHONE_NUMBER_ID is not configured", 500);
  }
  const version = process.env.WHATSAPP_API_VERSION || DEFAULT_GRAPH_VERSION;
  return `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;
}

function normalizeNumber(number: string): string {
  return number.replace(/[^\d]/g, "");
}

async function postMessage(payload: Record<string, unknown>): Promise<unknown> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) {
    throw new AppError("WHATSAPP_ACCESS_TOKEN is not configured", 500);
  }

  const response = await fetch(getGraphUrl(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new AppError(
      `WhatsApp API error (${response.status}): ${errorBody}`,
      502
    );
  }

  return response.json();
}

/**
 * Reads products from the Meta catalog that is attached to WhatsApp.
 * The catalog remains the source of truth for price and availability.
 */
export async function getCatalogProducts(
  retailerIds: string[]
): Promise<CatalogProduct[]> {
  const catalogId = process.env.WHATSAPP_CATALOG_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!catalogId) {
    throw new AppError("WHATSAPP_CATALOG_ID is not configured", 500);
  }
  if (!token) {
    throw new AppError("WHATSAPP_ACCESS_TOKEN is not configured", 500);
  }

  const requestedIds = new Set(retailerIds);
  const version = process.env.WHATSAPP_API_VERSION || DEFAULT_GRAPH_VERSION;
  let nextUrl = new URL(`https://graph.facebook.com/${version}/${catalogId}/products`);
  nextUrl.searchParams.set(
    "fields",
    "retailer_id,name,price,availability,inventory"
  );
  nextUrl.searchParams.set("limit", "100");
  const products: CatalogProduct[] = [];

  while (nextUrl) {
    const response = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new AppError(
        `Meta catalog API error (${response.status}): ${await response.text()}`,
        502
      );
    }

    const body = (await response.json()) as {
      data?: Array<Record<string, unknown>>;
      paging?: { next?: string };
    };

    for (const product of body.data ?? []) {
      const retailerId = String(product.retailer_id ?? "").trim();
      if (!requestedIds.has(retailerId)) continue;

      const inventory = Number(product.inventory);
      products.push({
        retailerId,
        name: String(product.name ?? retailerId),
        price: String(product.price ?? ""),
        availability: String(product.availability ?? "").trim().toLowerCase(),
        inventory:
          Number.isSafeInteger(inventory) && inventory >= 0 ? inventory : null,
      });
    }

    if (products.length === requestedIds.size || !body.paging?.next) break;
    nextUrl = new URL(body.paging.next);
  }

  return products;
}

export async function sendText(to: string, body: string): Promise<unknown> {
  return postMessage({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizeNumber(to),
    type: "text",
    text: { body, preview_url: false },
  });
}

export async function sendImage(
  to: string,
  link: string,
  caption?: string
): Promise<unknown> {
  return postMessage({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizeNumber(to),
    type: "image",
    image: { link, ...(caption ? { caption } : {}) },
  });
}

export async function sendMedia(
  to: string,
  link: string,
  type: "image" | "video" | "document",
  caption?: string,
  filename?: string
): Promise<unknown> {
  const media = type === "image"
    ? { link, ...(caption ? { caption } : {}) }
    : type === "video"
      ? { link, ...(caption ? { caption } : {}) }
      : { link, ...(caption ? { caption } : {}), ...(filename ? { filename } : {}) };
  return postMessage({ messaging_product: "whatsapp", recipient_type: "individual", to: normalizeNumber(to), type, [type]: media });
}

export async function downloadWhatsAppMedia(mediaId: string): Promise<{ base64: string; mimeType: string; filename?: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) throw new AppError("WHATSAPP_ACCESS_TOKEN is not configured", 500);
  const version = process.env.WHATSAPP_API_VERSION || DEFAULT_GRAPH_VERSION;
  const metadataResponse = await fetch("https://graph.facebook.com/" + version + "/" + encodeURIComponent(mediaId), { headers: { Authorization: "Bearer " + token } });
  if (!metadataResponse.ok) throw new AppError("WhatsApp media metadata error (" + metadataResponse.status + ")", 502);
  const metadata = (await metadataResponse.json()) as { url?: string; mime_type?: string; filename?: string };
  if (!metadata.url) throw new AppError("WhatsApp media URL was not returned", 502);
  const fileResponse = await fetch(metadata.url, { headers: { Authorization: "Bearer " + token } });
  if (!fileResponse.ok) throw new AppError("WhatsApp media download error (" + fileResponse.status + ")", 502);
  const bytes = Buffer.from(await fileResponse.arrayBuffer());
  return { base64: bytes.toString("base64"), mimeType: metadata.mime_type || "application/octet-stream", ...(metadata.filename ? { filename: metadata.filename } : {}) };
}

/**
 * Sends the approved "catalog" template. The template contains a CATALOG
 * button named "View catalog" and no variables, so no components are needed.
 */
export async function sendCatalogTemplate(to: string): Promise<unknown> {
  const name = process.env.WHATSAPP_CATALOG_TEMPLATE_NAME || "catalog";
  const language =
    process.env.WHATSAPP_CATALOG_TEMPLATE_LANGUAGE || "en";
  const thumbnail = process.env.WHATSAPP_CATALOG_THUMBNAIL_ID || "";

  return postMessage({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizeNumber(to),
    type: "template",
    template: {
      name,
      language: { code: language },
      components: [
        {
          type: "button",
          sub_type: "CATALOG",
          index: 0,
          parameters: [
            {
              type: "action",
              action: { thumbnail_product_retailer_id: thumbnail },
            },
          ],
        },
      ],
    },
  });
}

/**
 * Sends the "View catalog" card. Requires the phone number to have a
 * connected WhatsApp catalog in Commerce Manager.
 */
export async function sendCatalog(
  to: string,
  body: string
): Promise<unknown> {
  const interactive: Record<string, unknown> = {
    type: "catalog_message",
    body: { text: body },
    action: { name: "catalog_message" },
  };

  const thumbnail = process.env.WHATSAPP_CATALOG_THUMBNAIL_ID;
  if (thumbnail) {
    interactive.action = {
      name: "catalog_message",
      parameters: { thumbnail_product_retailer_id: thumbnail },
    };
  }

  return postMessage({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizeNumber(to),
    type: "interactive",
    interactive,
  });
}

export async function markMessageRead(messageId: string): Promise<void> {
  await postMessage({
    messaging_product: "whatsapp",
    status: "read",
    message_id: messageId,
  });
}

/** Sends an internal alert to the team number (silently skipped if unset). */
export async function sendTeamAlert(body: string): Promise<void> {
  const teamNumber = process.env.TEAM_WHATSAPP_NUMBER;
  if (!teamNumber) return;
  await sendText(teamNumber, body);
}
