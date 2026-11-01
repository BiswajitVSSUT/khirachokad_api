import { prisma } from "../../config/prisma.js";

export async function getOrCreateCustomer(phone: string, name?: string) {
  const customer = await prisma.customer.upsert({
    where: { whatsappNumber: phone },
    update: name ? { name } : {},
    create: {
      whatsappNumber: phone,
      ...(name ? { name } : {}),
    },
  });

  await prisma.conversation.upsert({
    where: { customerId: customer.id },
    update: {},
    create: { customerId: customer.id },
  });

  return customer;
}

export async function getConversation(customerId: string) {
  return prisma.conversation.upsert({
    where: { customerId },
    update: {},
    create: { customerId },
  });
}
