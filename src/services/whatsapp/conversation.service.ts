import {
  Prisma,
  type ConversationState,
  type customer,
} from "@prisma/client";

import { prisma } from "../../config/prisma.js";
import { AppError } from "../../utils/AppError.js";
import { getConversation, getOrCreateCustomer } from "./customer.service.js";
import {
  ADDRESS_PROMPT,
  ADDRESS_SAVED,
  ADDRESS_TOO_SHORT,
  EMPTY_CART,
  FALLBACK_MESSAGE,
  ORDER_CANCELLED,
  PRODUCT_UNAVAILABLE,
  WELCOME_MESSAGE,
} from "./messages.js";
import {
  cancelAwaitingAddressOrder,
  createOrderFromCatalog,
  notifyTeamNewOrder,
  saveDeliveryAddress,
  type CatalogOrderInput,
} from "./order.service.js";
import { sendCatalogTemplate, sendText } from "./whatsapp.service.js";

export type InboundMessage = {
  id: string;
  type: string;
  text?: string;
  interactive?: {
    button_reply?: { title?: string };
    list_reply?: { title?: string };
  };
  order?: CatalogOrderInput;
};

const GREETINGS = new Set([
  "hi",
  "hii",
  "hiii",
  "hello",
  "hey",
  "namaskar",
  "namaste",
  "start",
  "menu",
  "catalog",
  "order",
  "ନମସ୍କାର",
  "ହେଲୋ",
  "ହାଏ",
  "ଅର୍ଡର",
]);

const CANCEL_WORDS = new Set([
  "cancel",
  "cancel order",
  "stop",
  "ବାତିଲ୍",
  "ବାତିଲ",
  "ବାତିଲ କର",
]);

function extractText(message: InboundMessage): string {
  if (message.type === "text") return message.text ?? "";

  return (
    message.interactive?.button_reply?.title ??
    message.interactive?.list_reply?.title ??
    ""
  );
}

function isGreeting(text: string): boolean {
  return GREETINGS.has(text);
}

function isCancel(text: string): boolean {
  return CANCEL_WORDS.has(text);
}

async function setState(
  customerId: string,
  state: ConversationState,
  context: Prisma.InputJsonValue
): Promise<void> {
  await prisma.conversation.update({
    where: { customerId },
    data: { state, context },
  });
}

async function sendWelcome(customer: customer): Promise<void> {
  try {
    await sendCatalogTemplate(customer.whatsappNumber);
  } catch (error) {
    // The template may not be available; still greet the customer.
    console.error("Failed to send catalog template, falling back to text:", error);
    try {
      await sendText(customer.whatsappNumber, WELCOME_MESSAGE);
    } catch (fallbackError) {
      console.error("Failed to send welcome message:", fallbackError);
    }
  }
}

async function handleCatalogOrder(
  customer: customer,
  order: CatalogOrderInput | undefined
): Promise<void> {
  try {
    await createOrderFromCatalog(customer, order ?? {});
  } catch (error) {
    if (!(error instanceof AppError)) throw error;

    console.error("Could not create order from catalog:", error.message);
    const message =
      error.message === "The submitted cart is empty"
        ? EMPTY_CART
        : PRODUCT_UNAVAILABLE;

    await sendText(customer.whatsappNumber, message);
  }
}

/**
 * Entry point for every inbound WhatsApp message.
 * Messages from the same customer are serialized in-process so a webhook
 * retry cannot interleave with a normal message.
 */
export async function handleIncomingMessage(input: {
  phone: string;
  name?: string;
  message: InboundMessage;
}): Promise<void> {
  await withCustomerLock(input.phone, async () => {
    const customer = await getOrCreateCustomer(input.phone, input.name);
    const conversation = await getConversation(customer.id);
    const context = (conversation.context ?? {}) as Record<string, unknown>;

    if (input.message.type === "order") {
      await handleCatalogOrder(customer, input.message.order);
      return;
    }

    const text = extractText(input.message).trim();
    const normalized = text.toLowerCase();

    if (conversation.state === "AWAITING_ADDRESS") {
      const orderId =
        typeof context.orderId === "string" ? context.orderId : null;

      if (isCancel(normalized)) {
        if (orderId) {
          await cancelAwaitingAddressOrder(customer.id, orderId);
        } else {
          await setState(customer.id, "IDLE", {});
        }
        await sendText(customer.whatsappNumber, ORDER_CANCELLED);
        return;
      }

      if (!orderId) {
        await setState(customer.id, "IDLE", {});
        await sendWelcome(customer);
        return;
      }

      if (isGreeting(normalized)) {
        await sendText(customer.whatsappNumber, ADDRESS_PROMPT);
        return;
      }

      if (text.length < 10) {
        await sendText(customer.whatsappNumber, ADDRESS_TOO_SHORT);
        return;
      }

      const order = await saveDeliveryAddress(customer.id, orderId, text);
      if (!order) {
        await setState(customer.id, "IDLE", {});
        await sendText(customer.whatsappNumber, FALLBACK_MESSAGE);
        return;
      }

      await notifyTeamNewOrder(order, customer.whatsappNumber);

      try {
        await sendText(customer.whatsappNumber, ADDRESS_SAVED);
      } catch (error) {
        console.error("Failed to send address confirmation:", error);
      }
      return;
    }

    if (isGreeting(normalized) || conversation.state === "IDLE") {
      await setState(customer.id, "WELCOME_SENT", {});
      await sendWelcome(customer);
      return;
    }

    await setState(customer.id, "NEEDS_HUMAN", context as Prisma.InputJsonValue);
    await sendText(customer.whatsappNumber, FALLBACK_MESSAGE);
  });
}

// ---------------------------------------------------------------------------
// In-process per-customer lock.
// For multiple app instances, replace this with a Postgres advisory lock.
// ---------------------------------------------------------------------------

const customerLocks = new Map<string, Promise<unknown>>();

function withCustomerLock<T>(
  key: string,
  task: () => Promise<T>
): Promise<T> {
  const previous = customerLocks.get(key) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(task);
  const guard = current.finally(() => {
    if (customerLocks.get(key) === guard) {
      customerLocks.delete(key);
    }
  });

  // The map holds `guard`, which is not awaited by callers. Mark it handled so
  // a failed task never becomes an unhandled rejection.
  guard.catch(() => undefined);
  customerLocks.set(key, guard);

  return current;
}
