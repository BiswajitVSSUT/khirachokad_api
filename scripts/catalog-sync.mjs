/**
 * Meta catalog sync.
 *
 * Usage:
 *   node scripts/catalog-sync.mjs catalogs [--business-id=<id>]
 *   node scripts/catalog-sync.mjs list [--limit=25]
 *   node scripts/catalog-sync.mjs pull [--shop-id=<id>] [--limit=<n>]
 *   node scripts/catalog-sync.mjs push [--dry-run] [--include-inactive]
 *
 * Requires:
 *   WHATSAPP_ACCESS_TOKEN  system/user token with catalog_management
 *   WHATSAPP_CATALOG_ID    Meta product catalog ID
 *   WHATSAPP_BUSINESS_ID   business ID, for the catalogs command
 *   DATABASE_URL           Prisma connection string
 *
 * Optional:
 *   CATALOG_CURRENCY       defaults to INR
 *   CATALOG_BRAND          defaults to Khira Chokada
 *   CATALOG_STOREFRONT_URL defaults to https://khirachokada.com
 *   CATALOG_DEFAULT_SHOP_ID local shop used when importing a new product
 *   CATALOG_DEFAULT_EXPIRY expiry date for imported products, defaults to 2099-12-31
 */
import "dotenv/config";

import bizSdk from "facebook-nodejs-business-sdk";
import { PrismaClient } from "@prisma/client";

const { Business, FacebookAdsApi, ProductCatalog, ProductItem } = bizSdk;
const prisma = new PrismaClient();

const args = process.argv.slice(2);
const command = args[0] ?? "help";
const flags = new Map();

for (const arg of args.slice(1)) {
  if (!arg.startsWith("--")) continue;
  const [key, value] = arg.slice(2).split("=", 2);
  flags.set(key, value ?? "true");
}

const hasFlag = (name) => flags.has(name);

function flag(name, fallback) {
  return flags.get(name) ?? fallback;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function parseMoney(value) {
  const match = String(value ?? "").replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  return match ? match[0] : "0";
}

function toInteger(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function isStocked(availability) {
  const value = String(availability ?? "").trim().toLowerCase();
  if (!value) return true;
  return !["out of stock", "discontinued"].includes(value);
}

function fieldList() {
  return [
    ProductItem.Fields.id,
    ProductItem.Fields.retailer_id,
    ProductItem.Fields.name,
    ProductItem.Fields.description,
    ProductItem.Fields.price,
    ProductItem.Fields.image_url,
    ProductItem.Fields.url,
    ProductItem.Fields.availability,
    ProductItem.Fields.inventory,
    ProductItem.Fields.review_status,
    ProductItem.Fields.errors,
  ];
}

function initApi() {
  const accessToken = requiredEnv("WHATSAPP_ACCESS_TOKEN");
  const api = FacebookAdsApi.init(accessToken);
  api.setDebug(false);
  api.setShowHeader(false);
  return api;
}

function getCatalog() {
  initApi();
  const catalogId = flag("catalog-id", undefined) ?? requiredEnv("WHATSAPP_CATALOG_ID");
  return { catalog: new ProductCatalog(catalogId) };
}

async function fetchCatalogProducts(catalog, limit) {
  const fields = fieldList();
  const pageSize = Math.min(limit ?? 100, 100);
  let cursor = await catalog.getProducts(fields, { limit: pageSize });
  const products = [];

  while (cursor) {
    for (const product of cursor) {
      products.push(product);
      if (limit !== undefined && products.length >= limit) return products;
    }

    if (typeof cursor.hasNext !== "function" || !cursor.hasNext()) break;
    cursor = await cursor.next();
  }

  return products;
}

async function commandCatalogs() {
  initApi();
  const businessId = flag(
    "business-id",
    process.env.WHATSAPP_BUSINESS_ID || ""
  );

  if (!businessId) {
    throw new Error(
      "WHATSAPP_BUSINESS_ID is not configured. Pass --business-id=<id>."
    );
  }

  const business = new Business(businessId);
  let cursor = await business.getOwnedProductCatalogs(
    [
      ProductCatalog.Fields.id,
      ProductCatalog.Fields.name,
      ProductCatalog.Fields.product_count,
      ProductCatalog.Fields.vertical,
    ],
    { limit: 100 }
  );

  const catalogs = [];
  while (cursor) {
    catalogs.push(...cursor);
    if (typeof cursor.hasNext !== "function" || !cursor.hasNext()) break;
    cursor = await cursor.next();
  }

  if (catalogs.length === 0) {
    console.log("No owned product catalogs returned for this business.");
    return;
  }

  console.table(
    catalogs.map((catalog) => ({
      id: catalog.id,
      name: catalog.name,
      product_count: catalog.product_count,
      vertical: catalog.vertical,
    }))
  );
}

async function commandList() {
  const { catalog } = getCatalog();
  const limit = Number(flag("limit", "25"));
  const products = await fetchCatalogProducts(catalog, limit);

  if (products.length === 0) {
    console.log("No products returned by the catalog.");
    return;
  }

  console.table(
    products.map((product) => ({
      id: product.id,
      retailer_id: product.retailer_id,
      name: product.name,
      price: product.price,
      availability: product.availability,
      review_status: product.review_status,
    }))
  );
}

async function resolveShopId(explicitShopId) {
  if (explicitShopId) return explicitShopId;

  if (process.env.CATALOG_DEFAULT_SHOP_ID) {
    return process.env.CATALOG_DEFAULT_SHOP_ID;
  }

  const shop = await prisma.shop.findFirst({ select: { id: true } });
  if (!shop) {
    throw new Error(
      "No shop found. Pass --shop-id=<id> or set CATALOG_DEFAULT_SHOP_ID."
    );
  }
  return shop.id;
}

async function commandPull() {
  const { catalog } = getCatalog();
  const limit = flags.has("limit") ? Number(flag("limit", "100")) : undefined;
  const products = await fetchCatalogProducts(catalog, limit);
  let created = 0;
  let updated = 0;

  for (const remote of products) {
    const retailerId = String(remote.retailer_id ?? "").trim();
    if (!retailerId) {
      console.warn(`Skipping catalog product ${remote.id}: no retailer_id`);
      continue;
    }

    const data = {
      name: String(remote.name ?? retailerId),
      description: String(remote.description ?? remote.name ?? retailerId),
      price: parseMoney(remote.price),
      image: String(remote.image_url ?? ""),
      isActive: isStocked(remote.availability),
      availability: String(remote.availability ?? "in stock").toLowerCase(),
      inventory: toInteger(remote.inventory),
      retailerId,
      metaProductId: String(remote.id ?? "") || null,
    };

    const existing = await prisma.catalogProduct.findUnique({
      where: { retailerId },
      select: { id: true },
    });

    if (existing) {
      await prisma.catalogProduct.update({
        where: { id: existing.id },
        data,
      });
      updated += 1;
      continue;
    }

    await prisma.catalogProduct.create({ data });
    created += 1;
  }

  console.log(
    `Catalog pull complete: ${created} created, ${updated} updated, ${products.length} fetched.`
  );
}

function buildPushRequest(product) {
  const retailerId = String(product.retailerId ?? "").trim();
  const currency = flag("currency", process.env.CATALOG_CURRENCY || "INR");
  const storefront = flag(
    "storefront",
    process.env.CATALOG_STOREFRONT_URL || "https://khirachokada.com"
  ).replace(/\/+$/, "");
  const brand = flag("brand", process.env.CATALOG_BRAND || "Khira Chokada");

  const data = {
    id: retailerId,
    title: product.name,
    description: product.description || product.name,
    brand,
    price: `${Number(parseMoney(product.price)).toFixed(2)} ${currency}`,
    image_link: product.image,
    link: `${storefront}/product/${product.id}`,
    availability: product.isActive ? product.availability : "out of stock",
    condition: "new",
  };

  if (product.inventory !== null) {
    data.quantity_to_sell_on_facebook = product.inventory;
  }

  return data;
}

async function commandPush() {
  const includeInactive = hasFlag("include-inactive");
  const dryRun = hasFlag("dry-run");

  const products = await prisma.catalogProduct.findMany({
    where: {
      ...(includeInactive ? {} : { isActive: true }),
    },
    orderBy: { name: "asc" },
  });

  if (products.length === 0) {
    console.log("No catalog products found. Nothing to push.");
    return;
  }

  const requests = products.map((product) => ({
    method: "create",
    data: buildPushRequest(product),
  }));

  if (dryRun) {
    console.log(JSON.stringify(requests, null, 2));
    console.log(`Dry run: ${requests.length} product(s) would be pushed.`);
    return;
  }

  const { catalog } = getCatalog();
  const existing = await fetchCatalogProducts(catalog, undefined);
  const existingRetailerIds = new Set(
    existing.map((product) => String(product.retailer_id ?? ""))
  );

  for (const request of requests) {
    request.method = existingRetailerIds.has(request.data.id)
      ? "update"
      : "create";
  }

  const chunkSize = 50;
  for (let index = 0; index < requests.length; index += chunkSize) {
    const chunk = requests.slice(index, index + chunkSize);
    const response = await catalog.createItemsBatch([], {
      item_type: "PRODUCT_ITEM",
      requests: chunk,
    });
    const result =
      typeof response?.exportData === "function"
        ? response.exportData()
        : response?._data ?? response;
    console.log(
      `Batch ${Math.floor(index / chunkSize) + 1}:`,
      JSON.stringify(result, null, 2)
    );
  }

  console.log(`Catalog push submitted for ${requests.length} product(s).`);
}

async function main() {
  switch (command) {
    case "catalogs":
      await commandCatalogs();
      break;
    case "list":
      await commandList();
      break;
    case "pull":
      await commandPull();
      break;
    case "push":
      await commandPush();
      break;
    default:
      console.log(
        [
          "Usage:",
          "  node scripts/catalog-sync.mjs catalogs [--business-id=<id>]",
          "  node scripts/catalog-sync.mjs list [--limit=25]",
          "  node scripts/catalog-sync.mjs pull [--shop-id=<id>] [--limit=<n>]",
          "  node scripts/catalog-sync.mjs push [--dry-run] [--include-inactive]",
          "",
          "Catalog commands require a token with catalog_management.",
        ].join("\n")
      );
  }
}

main()
  .catch((error) => {
    const message = error?.message ?? String(error);
    console.error(message);

    if (/missing permissions|does not exist, cannot be loaded/i.test(message)) {
      console.error(
        "Hint: grant catalog_management to the system user in Meta Business Settings, then regenerate WHATSAPP_ACCESS_TOKEN."
      );
    } else if (/\(#200\).*not been approved/i.test(message)) {
      console.error(
        "Hint: the Meta app is not approved for this catalog API. Request catalog_management access for the app or use a token from an app that already has it."
      );
    }

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
