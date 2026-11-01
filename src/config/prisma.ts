import { PrismaClient } from "@prisma/client";

/**
 * Keep one client (and therefore one connection pool) per running Node.js
 * process. Serverless runtimes may reuse a warm process for many requests;
 * recreating the client would create an additional pool on every reload.
 */
const globalForPrisma = globalThis as typeof globalThis & {
  prisma?: PrismaClient;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

globalForPrisma.prisma = prisma;
