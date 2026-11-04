import { Request, Response } from "express";
import { OrderStatus, Prisma } from "@prisma/client";
import { z } from "zod";

import { prisma } from "../../config/prisma.js";
import { sendError, sendSuccess } from "../../utils/response.js";

function isOrderStatus(value: string): value is OrderStatus {
  return (Object.values(OrderStatus) as string[]).includes(value);
}

function orderId(req: Request): string | null {
  return req.params.id?.trim() || null;
}

const editableOrderSchema = z.object({
  customerName: z.string().trim().min(1).max(120).optional(),
  phoneNumber: z.string().trim().min(7).max(20).optional(),
  deliveryAddress: z.string().trim().max(500).optional(),
  items: z.array(z.object({
    catalogProductId: z.string().uuid().optional(), productName: z.string().trim().min(1).max(160),
    quantity: z.number().int().positive(), unitPrice: z.number().nonnegative(),
  })).min(1).optional(),
  status: z.string().optional(),
});

export const listOrders = async (req: Request, res: Response) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const cursor = typeof req.query.cursor === "string" ? req.query.cursor.trim() : undefined;
  const statusParam =
    typeof req.query.status === "string" ? req.query.status : undefined;
  const dateFrom = typeof req.query.dateFrom === "string" ? new Date(req.query.dateFrom) : undefined;
  const dateTo = typeof req.query.dateTo === "string" ? new Date(req.query.dateTo) : undefined;

  const where: Prisma.orderWhereInput = {};

  if (statusParam) {
    if (!isOrderStatus(statusParam)) {
      return sendError(res, "Invalid order status", null, 400);
    }
    where.status = statusParam;
  }

  if (dateFrom && Number.isNaN(dateFrom.getTime())) return sendError(res, "Invalid dateFrom", null, 400);
  if (dateTo && Number.isNaN(dateTo.getTime())) return sendError(res, "Invalid dateTo", null, 400);
  if (dateFrom || dateTo) {
    where.createdAt = {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lte: dateTo } : {}),
    };
  }

  const orders = await prisma.order.findMany({
    where,
    include: { items: true, customer: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    take: limit + 1,
  });
  const hasMore = orders.length > limit;
  const page = hasMore ? orders.slice(0, limit) : orders;
  const nextCursor = hasMore ? page[page.length - 1]?.id ?? null : null;

  return sendSuccess(res, "Orders fetched", {
    orders: page,
    limit,
    nextCursor,
    hasMore,
  });
};

export const listCatalogProducts = async (_req: Request, res: Response) => {
  const products = await prisma.catalogProduct.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, retailerId: true, name: true, price: true, currency: true },
  });
  return sendSuccess(res, "Catalog products fetched", products);
};

export const getOrder = async (req: Request, res: Response) => {
  const id = orderId(req);
  if (!id) return sendError(res, "Order id is required", null, 400);

  const order = await prisma.order.findUnique({
    where: { id },
    include: { items: true, customer: true },
  });

  if (!order) return sendError(res, "Order not found", null, 404);

  return sendSuccess(res, "Order fetched", order);
};

export const confirmOrder = async (req: Request, res: Response) => {
  const id = orderId(req);
  if (!id) return sendError(res, "Order id is required", null, 400);

  const updated = await prisma.order.updateMany({
    where: { id, status: "PENDING_CONFIRMATION" },
    data: { status: "CONFIRMED" },
  });

  if (updated.count === 0) {
    return sendError(
      res,
      "Order not found or is not awaiting confirmation",
      null,
      409
    );
  }

  const order = await prisma.order.findUnique({
    where: { id },
    include: { items: true, customer: true },
  });

  return sendSuccess(res, "Order confirmed", order);
};

export const rejectOrder = async (req: Request, res: Response) => {
  const id = orderId(req);
  if (!id) return sendError(res, "Order id is required", null, 400);

  const reason =
    typeof req.body?.reason === "string" && req.body.reason.trim()
      ? req.body.reason.trim()
      : null;

  const updated = await prisma.order.updateMany({
    where: {
      id,
      status: { in: ["PENDING_CONFIRMATION", "CONFIRMED"] },
    },
    data: { status: "REJECTED", rejectionReason: reason },
  });

  if (updated.count === 0) {
    return sendError(
      res,
      "Order not found or cannot be rejected in its current state",
      null,
      409
    );
  }

  const order = await prisma.order.findUnique({
    where: { id },
    include: { items: true, customer: true },
  });

  return sendSuccess(res, "Order rejected", order);
};

export const completeOrder = async (req: Request, res: Response) => {
  const id = orderId(req);
  if (!id) return sendError(res, "Order id is required", null, 400);

  const updated = await prisma.order.updateMany({
    where: { id, status: "CONFIRMED" },
    data: { status: "COMPLETED" },
  });

  if (updated.count === 0) {
    return sendError(
      res,
      "Order not found or is not confirmed",
      null,
      409
    );
  }

  const order = await prisma.order.findUnique({
    where: { id },
    include: { items: true, customer: true },
  });

  return sendSuccess(res, "Order completed", order);
};

export const updateOrder = async (req: Request, res: Response) => {
  const id = orderId(req);
  const parsed = editableOrderSchema.safeParse(req.body);
  if (!id || !parsed.success) return sendError(res, "Invalid order update", parsed.error, 400);
  const input = parsed.data;
  if (input.status && !isOrderStatus(input.status)) return sendError(res, "Invalid order status", null, 400);
  const existing = await prisma.order.findUnique({ where: { id }, include: { customer: true } });
  if (!existing) return sendError(res, "Order not found", null, 404);
  const order = await prisma.$transaction(async (tx) => {
    if (input.phoneNumber || input.customerName) {
      await tx.customer.update({ where: { id: existing.customerId }, data: {
        ...(input.phoneNumber ? { whatsappNumber: input.phoneNumber.replace(/[^\d]/g, "") } : {}),
        ...(input.customerName ? { name: input.customerName } : {}),
      }});
    }
    const itemData = input.items?.map((item) => ({
      ...(item.catalogProductId ? { catalogProductId: item.catalogProductId } : {}),
      productName: item.productName, quantity: item.quantity,
      unitPrice: new Prisma.Decimal(item.unitPrice), lineTotal: new Prisma.Decimal(item.unitPrice).mul(item.quantity),
    }));
    const subtotal = itemData?.reduce((total, item) => total.add(item.lineTotal), new Prisma.Decimal(0));
    return tx.order.update({ where: { id }, data: {
      ...(input.customerName ? { customerName: input.customerName } : {}),
      ...(input.deliveryAddress ? { deliveryAddress: input.deliveryAddress } : {}),
      ...(input.status ? { status: input.status as OrderStatus } : {}),
      ...(subtotal ? { subtotal, totalAmount: subtotal.add(existing.deliveryCharge) } : {}),
      ...(itemData ? { items: { deleteMany: {}, create: itemData } } : {}),
    }, include: { items: true, customer: true } });
  });
  return sendSuccess(res, "Order updated", order);
};
