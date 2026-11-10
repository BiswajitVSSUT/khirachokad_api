import crypto from "crypto";
import { Prisma, type customer } from "@prisma/client";

import { prisma } from "../../config/prisma.js";
import { logger } from "../../config/logger.js";
import { AppError } from "../../utils/AppError.js";
import {
  orderAddressRequestMessage,
  teamOrderAlertMessage,
  type OrderSummaryItem,
} from "./messages.js";
import {
  getCatalogProducts,
  sendTeamAlert,
  sendText,
} from "./whatsapp.service.js";

export type CatalogOrderItemInput = {
  product_retailer_id?: string;
  quantity?: number;
  item_price?: number;
  currency?: string;
};

export type CatalogOrderInput = {
  catalog_id?: string;
  product_items?: CatalogOrderItemInput[];
};

function createOrderNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const random = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `KC-${date}-${random}`;
}

function toSummaryItems(
  items: Array<{
    productName: string;
    quantity: number;
    lineTotal: Prisma.Decimal;
  }>
): OrderSummaryItem[] {
  return items.map((item) => ({
    name: item.productName,
    quantity: item.quantity,
  }));
}

function isAvailable(availability: string): boolean {
  return !["out of stock", "discontinued"].includes(availability);
}

function parseCatalogPrice(value: string): Prisma.Decimal {
  const match = value.replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  if (!match) throw new AppError("Invalid catalog price", 502);
  return new Prisma.Decimal(match[0]);
}

/**
 * Creates an order from a native WhatsApp catalog submission.
 * Prices and availability come from Meta's catalog, never from the webhook payload.
 */
export async function createOrderFromCatalog(
  customer: customer,
  order: CatalogOrderInput
) {
  const rawItems = order.product_items ?? [];
  if (rawItems.length === 0) {
    throw new AppError("The submitted cart is empty", 400);
  }

  const parsed: Array<{ retailerId: string; quantity: number }> = rawItems.map(
    (item) => {
      const retailerId = item.product_retailer_id?.trim();
      const quantity = Number(item.quantity);

      if (!retailerId || !Number.isSafeInteger(quantity) || quantity <= 0) {
        throw new AppError("Invalid cart item", 400);
      }

      return { retailerId, quantity };
    }
  );

  const catalogProducts = await getCatalogProducts(
    parsed.map((item) => item.retailerId)
  );
  const catalogProductsByRetailerId = new Map(
    catalogProducts.map((product) => [product.retailerId, product])
  );

  const products = await prisma.catalogProduct.findMany({
    where: {
      retailerId: { in: parsed.map((item) => item.retailerId) },
    },
  });
  const productsByRetailerId = new Map(
    products.map((product) => [product.retailerId, product])
  );

  let subtotal = new Prisma.Decimal(0);
  const orderItems: Array<{
      catalogProductId: string;
    productName: string;
    quantity: number;
    unitPrice: Prisma.Decimal;
    lineTotal: Prisma.Decimal;
  }> = [];

  for (const item of parsed) {
    const product = productsByRetailerId.get(item.retailerId);
    const catalogProduct = catalogProductsByRetailerId.get(item.retailerId);

    if (!catalogProduct || !isAvailable(catalogProduct.availability)) {
      throw new AppError("Product unavailable", 409);
    }

    if (
      catalogProduct.inventory !== null &&
      catalogProduct.inventory < item.quantity
    ) {
      throw new AppError(`Insufficient stock for ${catalogProduct.name}`, 409);
    }

    if (!product) {
      throw new AppError("Product is not configured for order storage", 500);
    }

    let unitPrice: Prisma.Decimal;
    try {
      unitPrice = parseCatalogPrice(catalogProduct.price);
    } catch {
      throw new AppError(`Invalid catalog price for ${catalogProduct.name}`, 502);
    }

    if (unitPrice.isNegative()) {
      throw new AppError(`Invalid price for ${product.name}`, 500);
    }

    const lineTotal = unitPrice.mul(item.quantity);
    subtotal = subtotal.add(lineTotal);

    orderItems.push({
      catalogProductId: product.id,
      productName: catalogProduct.name,
      quantity: item.quantity,
      unitPrice,
      lineTotal,
    });
  }

  const createdOrder = await prisma.$transaction(async (tx) => {
    // If the customer was still giving an address for a previous cart,
    // treat the new catalog submission as a replacement.
    await tx.order.updateMany({
      where: { customerId: customer.id, status: "AWAITING_ADDRESS" },
      data: { status: "CANCELLED" },
    });

    const newOrder = await tx.order.create({
      data: {
        orderNumber: createOrderNumber(),
        customerId: customer.id,
        status: "AWAITING_ADDRESS",
        customerName: customer.name,
        subtotal,
        deliveryCharge: new Prisma.Decimal(0),
        totalAmount: subtotal,
        items: { create: orderItems },
      },
      include: { items: true },
    });

    await tx.conversation.update({
      where: { customerId: customer.id },
      data: {
        state: "AWAITING_ADDRESS",
        context: {
          orderId: newOrder.id,
          orderNumber: newOrder.orderNumber,
        },
      },
    });

    return newOrder;
  });

  try {
    await sendText(
      customer.whatsappNumber,
      orderAddressRequestMessage({
        orderNumber: createdOrder.orderNumber,
        items: toSummaryItems(createdOrder.items),
      })
    );
  } catch (error) {
    logger.error({ err: error, orderId: createdOrder.id }, "Failed to send address request");
  }

  return createdOrder;
}

/**
 * Creates an order from a custom WhatsApp Flow. Prices are retained internally
 * for order records but are never returned to the customer in bot messages.
 */
export async function createOrderFromFlow(
  customer: customer,
  rawItems: Array<{ retailerId: string; quantity: number }>
) {
  const requested = rawItems.filter(
    (item) => item.retailerId && Number.isSafeInteger(item.quantity) && item.quantity > 0
  );
  if (requested.length === 0) throw new AppError("The submitted cart is empty", 400);

  const products = await prisma.catalogProduct.findMany({
    where: { retailerId: { in: requested.map((item) => item.retailerId) }, isActive: true },
  });
  const byRetailerId = new Map(products.map((product) => [product.retailerId, product]));
  let subtotal = new Prisma.Decimal(0);
  const items: Array<{
    catalogProductId: string;
    productName: string;
    quantity: number;
    unitPrice: Prisma.Decimal;
    lineTotal: Prisma.Decimal;
  }> = [];

  for (const item of requested) {
    const product = byRetailerId.get(item.retailerId);
    if (!product || !isAvailable(product.availability)) throw new AppError("Product unavailable", 409);
    if (product.inventory !== null && product.inventory < item.quantity) {
      throw new AppError(`Insufficient stock for ${product.name}`, 409);
    }
    const unitPrice = new Prisma.Decimal(product.price);
    const lineTotal = unitPrice.mul(item.quantity);
    subtotal = subtotal.add(lineTotal);
    items.push({ catalogProductId: product.id, productName: product.name, quantity: item.quantity, unitPrice, lineTotal });
  }

  const createdOrder = await prisma.$transaction(async (tx) => {
    await tx.order.updateMany({
      where: { customerId: customer.id, status: "AWAITING_ADDRESS" },
      data: { status: "CANCELLED" },
    });
    const order = await tx.order.create({
      data: {
        orderNumber: createOrderNumber(),
        customerId: customer.id,
        status: "AWAITING_ADDRESS",
        customerName: customer.name,
        subtotal,
        deliveryCharge: new Prisma.Decimal(0),
        totalAmount: subtotal,
        items: { create: items },
      },
      include: { items: true },
    });
    await tx.conversation.update({
      where: { customerId: customer.id },
      data: { state: "AWAITING_ADDRESS", context: { orderId: order.id, orderNumber: order.orderNumber } },
    });
    return order;
  });

  await sendText(customer.whatsappNumber, orderAddressRequestMessage({
    orderNumber: createdOrder.orderNumber,
    items: toSummaryItems(createdOrder.items),
  })).catch((error) => logger.error({ err: error, orderId: createdOrder.id }, "Failed to send address request"));
  return createdOrder;
}

/**
 * Saves the delivery address and moves the order to manual confirmation.
 * Returns null when no order is awaiting an address.
 */
export async function saveDeliveryAddress(
  customerId: string,
  orderId: string,
  address: string
) {
  return prisma.$transaction(async (tx) => {
    const updated = await tx.order.updateMany({
      where: {
        id: orderId,
        customerId,
        status: "AWAITING_ADDRESS",
      },
      data: {
        deliveryAddress: address,
        status: "PENDING_CONFIRMATION",
      },
    });

    if (updated.count === 0) return null;

    await tx.conversation.update({
      where: { customerId },
      data: {
        state: "ORDER_PENDING_CONFIRMATION",
        context: { orderId },
      },
    });

    // Hand this conversation to a human as soon as a complete order/address
    // has been captured. The admin toggle remains available to override this.
    await tx.customer.update({
      where: { id: customerId },
      data: { botBlacklist: true },
    });

    return tx.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
  });
}

export async function cancelAwaitingAddressOrder(
  customerId: string,
  orderId: string
): Promise<boolean> {
  const updated = await prisma.order.updateMany({
    where: { id: orderId, customerId, status: "AWAITING_ADDRESS" },
    data: { status: "CANCELLED" },
  });

  await prisma.conversation.update({
    where: { customerId },
    data: { state: "IDLE", context: {} },
  });

  return updated.count > 0;
}

export async function notifyTeamNewOrder(
  order: {
    orderNumber: string;
    customerName: string | null;
    deliveryAddress: string | null;
    totalAmount: Prisma.Decimal;
    items: Array<{
      productName: string;
      quantity: number;
      lineTotal: Prisma.Decimal;
    }>;
  },
  customerPhone: string
): Promise<void> {
  try {
    await sendTeamAlert(
      teamOrderAlertMessage({
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        customerPhone,
        address: order.deliveryAddress ?? "-",
        items: toSummaryItems(order.items),
      })
    );
  } catch (error) {
    logger.error({ err: error, orderNumber: order.orderNumber }, "Failed to notify team");
  }
}
