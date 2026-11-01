import { PrismaClient } from "@prisma/client";

// Single Prisma client shared by the WhatsApp/order modules.
export const prisma = new PrismaClient();
