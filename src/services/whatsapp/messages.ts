// Customer-facing copy is Odia only.

export const WELCOME_MESSAGE = `🙏 ନମସ୍କାର!

KHIRA CHOKADA ପରିବାରକୁ ସ୍ୱାଗତ। 🐄🌾

ଆମର ଉତ୍ପାଦ ଦେଖିବା ଓ ଅର୍ଡର କରିବା ପାଇଁ ତଳେ ଥିବା ବଟନ୍ ଦବାନ୍ତୁ।

ଯେକୌଣସି ସାହାଯ୍ୟ ପାଇଁ ଆମକୁ ମେସେଜ୍ କରନ୍ତୁ। 🙏`;

export const ADDRESS_PROMPT = `ଦୟାକରି ଆପଣଙ୍କ ସମ୍ପୂର୍ଣ୍ଣ ଡେଲିଭରି ଠିକଣା ପଠାନ୍ତୁ — ଗାଁ/ସହର, ବ୍ଲକ, ଜିଲ୍ଲା ଓ ପିନ୍ କୋଡ୍ ସହିତ। 🙏`;

export const ADDRESS_TOO_SHORT = ADDRESS_PROMPT;

export const ADDRESS_SAVED = `🙏 ଧନ୍ୟବାଦ! ଆପଣଙ୍କ ଠିକଣା ଆମେ ପାଇଛୁ।

ଆମ ଟିମ୍ ଶୀଘ୍ର ଆପଣଙ୍କ ସହ ଯୋଗାଯୋଗ କରି ଅର୍ଡର ନିଶ୍ଚିତ କରିବ। 🙏`;

export const ORDER_CANCELLED = `ଆପଣଙ୍କ ଅର୍ଡର ବାତିଲ୍ ହୋଇଛି। ପୁଣି ଅର୍ଡର କରିବାକୁ "Hi" ପଠାନ୍ତୁ। 🙏`;

export const FALLBACK_MESSAGE = `🙏 ଆପଣଙ୍କ ମେସେଜ୍ ପାଇଛୁ। ଆମ ଟିମ୍ ଶୀଘ୍ର ଆପଣଙ୍କ ସହ ଯୋଗାଯୋଗ କରିବ।

ଅର୍ଡର କରିବାକୁ "Hi" ପଠାନ୍ତୁ। 🙏`;

export const EMPTY_CART = `କ୍ଷମା କରନ୍ତୁ, ଆପଣଙ୍କ ଅର୍ଡରରେ କୌଣସି ସାମଗ୍ରୀ ମିଳିଲା ନାହିଁ। ଦୟାକରି କ୍ୟାଟାଲଗ୍ ରୁ ପୁଣି ଅର୍ଡର କରନ୍ତୁ। 🙏`;

export const PRODUCT_UNAVAILABLE = `କ୍ଷମା କରନ୍ତୁ, ଆପଣ ଚୟନ କରିଥିବା କିଛି ସାମଗ୍ରୀ ବର୍ତ୍ତମାନ ଉପଲବ୍ଧ ନାହିଁ। ଦୟାକରି କ୍ୟାଟାଲଗ୍ ରୁ ପୁଣି ଚେଷ୍ଟା କରନ୍ତୁ। 🙏`;

export type OrderSummaryItem = {
  name: string;
  quantity: number;
  lineTotal: string;
};

function formatItems(items: OrderSummaryItem[]): string {
  return items
    .map((item) => `• ${item.name} × ${item.quantity} = ₹${item.lineTotal}`)
    .join("\n");
}

export function orderAddressRequestMessage(input: {
  orderNumber: string;
  total: string;
  items: OrderSummaryItem[];
}): string {
  return `🙏 ଧନ୍ୟବାଦ! ଆପଣଙ୍କ ଅର୍ଡର ଆମେ ପାଇଛୁ।

📦 ଅର୍ଡର ନମ୍ବର: ${input.orderNumber}
🛒 ସାମଗ୍ରୀ:
${formatItems(input.items)}
💰 ମୋଟ ରାଶି: ₹${input.total}

ଦୟାକରି ଆପଣଙ୍କ ସମ୍ପୂର୍ଣ୍ଣ ଡେଲିଭରି ଠିକଣା ପଠାନ୍ତୁ (ଗାଁ/ସହର, ବ୍ଲକ, ଜିଲ୍ଲା ଓ ପିନ୍ କୋଡ୍)।

ଆମ ଟିମ୍ ଯାଞ୍ଚ କରି ଆପଣଙ୍କ ସହ ଯୋଗାଯୋଗ କରିବ। 🙏`;
}

export function teamOrderAlertMessage(input: {
  orderNumber: string;
  customerName: string | null;
  customerPhone: string;
  address: string;
  total: string;
  items: OrderSummaryItem[];
}): string {
  return `🆕 NEW WHATSAPP ORDER — KHIRA CHOKADA

Order: ${input.orderNumber}
Customer: ${input.customerName ?? "Unknown"} (${input.customerPhone})

Items:
${formatItems(input.items)}

Total: ₹${input.total}

Delivery address:
${input.address}

Please contact the customer manually to confirm the order.`;
}
