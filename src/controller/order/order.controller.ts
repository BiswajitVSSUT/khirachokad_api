import { Request, Response } from "express";
import { OrderStatus, Prisma } from "@prisma/client";

import { prisma } from "../../config/prisma.js";
import { sendError, sendSuccess } from "../../utils/response.js";

function isOrderStatus(value: string): value is OrderStatus {
  return (Object.values(OrderStatus) as string[]).includes(value);
}

function orderId(req: Request): string | null {
  return req.params.id?.trim() || null;
}

export const listOrders = async (req: Request, res: Response) => {
  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const statusParam =
    typeof req.query.status === "string" ? req.query.status : undefined;

  const where: Prisma.orderWhereInput = {};

  if (statusParam) {
    if (!isOrderStatus(statusParam)) {
      return sendError(res, "Invalid order status", null, 400);
    }
    where.status = statusParam;
  }

  const [orders, total] = await prisma.$transaction([
    prisma.order.findMany({
      where,
      include: { items: true, customer: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.order.count({ where }),
  ]);

  return sendSuccess(res, "Orders fetched", {
    orders,
    total,
    page,
    limit,
  });
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
