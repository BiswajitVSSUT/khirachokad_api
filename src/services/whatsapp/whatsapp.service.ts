import { AppError } from "../../utils/AppError.js";
import { prisma } from "../../config/prisma.js";

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

  const result = await response.json();
  await storeOutboundMessage(payload, result);
  return result;
}

async function storeOutboundMessage(
  payload: Record<string, unknown>,
  result: unknown
): Promise<void> {
  const to = typeof payload.to === "string" ? normalizeNumber(payload.to) : "";
  const type = typeof payload.type === "string" ? payload.type : "";
  const messageId = (result as { messages?: Array<{ id?: string }> })?.messages?.[0]?.id;
  if (!to || !type || !messageId) return;

  const text = payload.text as { body?: unknown } | undefined;
  const interactive = payload.interactive as { body?: { text?: unknown } } | undefined;
  const template = payload.template as { name?: unknown } | undefined;
  const body =
    (typeof text?.body === "string" && text.body) ||
    (typeof interactive?.body?.text === "string" && interactive.body.text) ||
    (typeof template?.name === "string" && `[Template] ${template.name}`) ||
    null;
  const customer = await prisma.customer.findUnique({
    where: { whatsappNumber: to },
    select: { id: true },
  });

  await prisma.whatsappMessage.upsert({
    where: { waMessageId: messageId },
    update: { direction: "OUTBOUND", type, status: "sent", toNumber: to, customerId: customer?.id ?? null, body },
    create: { waMessageId: messageId, direction: "OUTBOUND", type, status: "sent", toNumber: to, customerId: customer?.id ?? null, body },
  });
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

/** A non-template welcome sent within WhatsApp's customer-service window. */
export async function sendWelcomeButtons(
  to: string,
  body: string,
  imageLink?: string
): Promise<unknown> {
  return postMessage({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizeNumber(to),
    type: "interactive",
    interactive: {
      type: "button",
      ...(imageLink ? { header: { type: "image", image: { link: imageLink } } } : {}),
      body: { text: body },
      action: {
        buttons: [
          { type: "reply", reply: { id: "kc_order_now", title: "Order Now" } },
          { type: "reply", reply: { id: "kc_visit_site", title: "Visit site" } },
        ],
      },
    },
  });
}

/** Sends the approved welcome template (ID 1122663833986353). */
export async function sendWelcomeTemplate(to: string): Promise<unknown> {
  return postMessage({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizeNumber(to),
    type: "template",
    template: {
      name: process.env.WHATSAPP_WELCOME_TEMPLATE_NAME || "welcome",
      language: { code: process.env.WHATSAPP_WELCOME_TEMPLATE_LANGUAGE || "en" },
      components: [
        {
          type: "header",
          parameters: [
            {
              type: "image",
              image: {
                link: process.env.WHATSAPP_WELCOME_IMAGE_URL || "https://res.cloudinary.com/j3jwwx4w/image/upload/v1794243011/336309a1-fde4-4608-85b9-1cb8949540a7.png",
              },
            },
          ],
        },
        // The approved welcome template's first CTA opens the configured Flow.
        // WhatsApp requires a per-send flow token even though the Flow ID is
        // stored in the template definition.
        {
          type: "button",
          sub_type: "flow",
          index: "0",
          parameters: [
            {
              type: "action",
              action: { flow_token: `welcome-${Date.now()}` },
            },
          ],
        },
      ],
    },
  });
}

/** Opens the published no-price product/quantity WhatsApp Flow. */
export async function sendOrderFlow(to: string): Promise<unknown> {
  const flowId = process.env.WHATSAPP_ORDER_FLOW_ID;
  if (!flowId) throw new AppError("WHATSAPP_ORDER_FLOW_ID is not configured", 500);

  return postMessage({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizeNumber(to),
    type: "interactive",
    interactive: {
      type: "flow",
      body: { text: "Select products and quantities to place your order." },
      action: {
        name: "flow",
        parameters: {
          flow_message_version: "3",
          flow_token: `order-${Date.now()}`,
          flow_id: flowId,
          flow_cta: "Order Now",
          flow_action: "navigate",
          flow_action_payload: { screen: process.env.WHATSAPP_ORDER_FLOW_SCREEN_ID || "PRODUCTS" },
        },
      },
    },
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
