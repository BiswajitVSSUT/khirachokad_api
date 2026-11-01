import crypto from "crypto";
import { Prisma, type customer } from "@prisma/client";

import { prisma } from "../../config/prisma.js";
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
    lineTotal: item.lineTotal.toFixed(2),
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

  const products = await prisma.products.findMany({
    where: {
      whatsappProductId: { in: parsed.map((item) => item.retailerId) },
    },
  });
  const productsByRetailerId = new Map(
    products.map((product) => [product.whatsappProductId, product])
  );

  let subtotal = new Prisma.Decimal(0);
  const orderItems: Array<{
    productId: string;
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
      productId: product.id,
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
        total: createdOrder.totalAmount.toFixed(2),
        items: toSummaryItems(createdOrder.items),
      })
    );
  } catch (error) {
    console.error("Failed to send address request:", error);
  }

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
        total: order.totalAmount.toFixed(2),
        items: toSummaryItems(order.items),
      })
    );
  } catch (error) {
    console.error("Failed to notify team:", error);
  }
}
