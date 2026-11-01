# WhatsApp ordering backend

Rule-based WhatsApp ordering for KHIRA CHOKADA. No LLM involved.

## Flow

```
Customer "Hi"
   -> bot sends approved "catalog" template with a "View catalog" button
Customer opens catalog and submits a cart
   -> webhook message type "order"
   -> order saved in PostgreSQL (status AWAITING_ADDRESS)
   -> bot asks for the delivery address
Customer sends address
   -> address saved (status PENDING_CONFIRMATION)
   -> team number receives a WhatsApp alert
   -> admin API can confirm / reject / complete
```

All customer-facing copy is Odia and lives in
`src/services/whatsapp/messages.ts`.

## Added files

| Path | Purpose |
|---|---|
| `src/routes/whatsapp/whatsapp.routes.ts` | `GET/POST /api/v1/whatsapp/webhook` |
| `src/controller/whatsapp/whatsapp.controller.ts` | verification, signature check, fast acknowledgement |
| `src/services/whatsapp/webhook.service.ts` | field dispatch, idempotency, status/template/account/call handlers |
| `src/services/whatsapp/whatsapp.service.ts` | Graph API text/catalog/read calls |
| `src/services/whatsapp/conversation.service.ts` | state machine |
| `src/services/whatsapp/order.service.ts` | order creation, address, team alert |
| `src/services/whatsapp/customer.service.ts` | customer + conversation upsert |
| `src/services/whatsapp/signature.ts` | `X-Hub-Signature-256` verification |
| `src/services/whatsapp/messages.ts` | Odia copy |
| `src/controller/order/order.controller.ts` | admin order endpoints |
| `src/routes/order/order.routes.ts` | `/api/v1/admin/orders` |
| `scripts/catalog-sync.mjs` | Meta catalog list/pull/push sync |

## Webhook fields

The endpoint accepts every field Meta documents for
`whatsapp_business_account`. Every change is recorded in `whatsappEvent` (with
its raw payload) before it is handled, so Meta retries are idempotent.

| Field | Handling |
|---|---|
| `messages` | inbound user messages feed the ordering state machine; outbound `statuses` (`sent`, `delivered`, `read`, `failed`) update `whatsappMessage` |
| `smb_message_echoes` | stored as outbound `whatsappMessage` rows |
| `message_template_status_update` | upserts template `status` and rejection reason |
| `message_template_quality_update` | upserts template `qualityScore` |
| `template_category_update` | upserts template `category` |
| `message_template_components_update` | upserts template `components` JSON |
| `calls` | appended to `whatsappCallEvent` |
| `account_alerts`, `account_review_update`, `account_update`, `business_capability_update`, `phone_number_name_update`, `phone_number_quality_update`, `security` | upserts `whatsappAccountState` (quality, limits, name verification, review, security) |
| `user_preferences` | upserts `whatsappUserPreference.marketingStatus` |
| `history`, `smb_app_state_sync`, `partner_solutions`, `payment_configuration_update`, `automatic_events` | recorded in `whatsappEvent` for later processing |

Meta can send payloads up to 3 MB, so the JSON body limit is set to `3mb`.
Signature verification is skipped only when `WHATSAPP_APP_SECRET` is empty and
`NODE_ENV` is not `production`; production requests are rejected without it.

## Database

Migrations:

- `prisma/migrations/20261029120000_whatsapp_ordering/migration.sql`
- `prisma/migrations/20261031120000_full_webhook_support/migration.sql`

New tables: `customer`, `conversation`, `order`, `orderItem`,
`whatsappEvent` (webhook idempotency and raw event log), `whatsappMessage`
(inbound/outbound status), `whatsappTemplate`, `whatsappCallEvent`,
`whatsappAccountState`, `whatsappUserPreference`. New columns on `products`:
`sku`, `whatsappProductId`, `unit`, `isActive`, `stockQuantity`.

`orderItem` stores `productName` and `unitPrice` snapshots so historical
orders keep their original price.

## Environment

Copy `.env.example` and fill in the WhatsApp values:

```env
DATABASE_URL="postgresql://user:KcDb_2026!@localhost:5434/kc_db?schema=public"
WHATSAPP_API_VERSION="v25.0"
WHATSAPP_ACCESS_TOKEN="..."
WHATSAPP_PHONE_NUMBER_ID="..."
WHATSAPP_VERIFY_TOKEN="..."
WHATSAPP_APP_SECRET="..."
WHATSAPP_CATALOG_ID="..."
WHATSAPP_CATALOG_THUMBNAIL_ID="..."
WHATSAPP_CATALOG_TEMPLATE_NAME="catalog"
WHATSAPP_CATALOG_TEMPLATE_LANGUAGE="en"
TEAM_WHATSAPP_NUMBER="91XXXXXXXXXX"
```

Signature verification is skipped only when `WHATSAPP_APP_SECRET` is empty
(development). Set it in production.

## Meta setup

1. Create a Meta app with the WhatsApp product and a business phone number.
2. In Commerce Manager, connect a catalog to the WhatsApp Business Account
   and add products. The live Meta catalog is the source of truth for price,
   availability, and inventory when an order is submitted. The **product
   retailer ID** in Meta must equal `products.whatsappProductId` in this
   database so the completed order can retain its local product relationship.
3. Configure the webhook URL as
   `https://<public-host>/api/v1/whatsapp/webhook`, using
   `WHATSAPP_VERIFY_TOKEN`, and subscribe to `messages` plus any other fields
   you need (templates, account alerts, calls, and so on).
4. Subscribe the business number to the app and add a test recipient while in
   development. Use an HTTPS tunnel (for example a reverse proxy or ngrok) for
   local testing.

If the catalog card fails (catalog not connected), the bot falls back to
sending the same greeting as plain text, so the customer is never left without
a reply.

## Catalog template

The greeting uses the approved template:

- Name: `catalog`
- Language: `en`
- Template ID: `4138468179623714`
- Category: `MARKETING`
- Button: `CATALOG` / “View catalog”

The send payload must include the catalog button component, even though the
body has no variables:

```json
{
  "type": "template",
  "template": {
    "name": "catalog",
    "language": { "code": "en" },
    "components": [
      {
        "type": "button",
        "sub_type": "CATALOG",
        "index": 0,
        "parameters": [
          {
            "type": "action",
            "action": { "thumbnail_product_retailer_id": "" }
          }
        ]
      }
    ]
  }
}
```

If `WHATSAPP_CATALOG_THUMBNAIL_ID` is set, it is used as the thumbnail
retailer ID. Otherwise Meta uses the first product in the connected catalog.

The template does **not** bypass the catalog requirement. WhatsApp still reads
the WABA’s connected catalog. If the catalog is missing or has no available
products, Meta returns:

```json
{
  "error": {
    "code": 131006,
    "message": "(#131006) Resource not found",
    "error_data": {
      "details": "Empty product list retrieved. Atleast 1 product is required"
    }
  }
}
```

If the template send fails, the backend falls back to the plain-text greeting.

## Catalog sync

`scripts/catalog-sync.mjs` uses the Meta Business SDK to read and write the
product catalog.

The access token needs the `catalog_management` scope in addition to the
WhatsApp scopes. Grant it to the system user in Meta Business Settings, then
regenerate `WHATSAPP_ACCESS_TOKEN`. The Meta app must also be approved for the
catalog API; otherwise Graph returns `(#200) This application has not been
approved to use this API`.

If the app cannot be approved for `catalog_management`, the WhatsApp ordering
flow still works. Connect the catalog in WhatsApp Manager and read each
product's **Content ID** from Commerce Manager. The catalog sync commands are
only a convenience; they are not required to send catalog messages.

```bash
# List catalogs owned by the business (find the real catalog ID)
npm run catalog:catalogs

# List catalog products (retailer IDs, prices, availability)
npm run catalog:list

# Import catalog products into the local products table
npm run catalog:pull

# Import and choose the local shop for new rows
npm run catalog:pull -- --shop-id=<shop-id>

# Preview the payload for pushing local products
npm run catalog:push -- --dry-run

# Create/update local products in the catalog
npm run catalog:push

# Include inactive products as "out of stock"
npm run catalog:push -- --include-inactive
```

Direction and field mapping:

- `pull` maps Meta `retailer_id` -> `products.whatsappProductId`, `name` ->
  `name`, `description`, `price` (numeric part), `image_url` -> `image`,
  `availability` -> `isActive`, and `inventory` -> `stockQuantity`.
- `push` maps `products.whatsappProductId` -> retailer ID and sends
  `name`, `description`, `price`, `image`, and stock status. `image` must be a
  public HTTPS URL. The product link is built from
  `CATALOG_STOREFRONT_URL`, so set it to the real storefront before pushing.
- New rows created by `pull` use `CATALOG_DEFAULT_SHOP_ID` (or the first shop)
  and `CATALOG_DEFAULT_EXPIRY`.

Optional environment values:

```env
CATALOG_CURRENCY="INR"
CATALOG_BRAND="Khira Chokada"
CATALOG_STOREFRONT_URL="https://example.com"
CATALOG_DEFAULT_SHOP_ID=""
CATALOG_DEFAULT_EXPIRY="2099-12-31"
```

The thumbnail value for the catalog card must be a product retailer ID, not the
catalog ID.

## Admin API

All routes require `Authorization: Bearer <admin JWT>` from
`POST /api/v1/auth/sign-in`.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/admin/orders?status=PENDING_CONFIRMATION&page=1&limit=20` | list |
| GET | `/api/v1/admin/orders/:id` | details |
| POST | `/api/v1/admin/orders/:id/confirm` | `PENDING_CONFIRMATION -> CONFIRMED` |
| POST | `/api/v1/admin/orders/:id/reject` | body `{ "reason": "..." }` |
| POST | `/api/v1/admin/orders/:id/complete` | `CONFIRMED -> COMPLETED` |

Statuses: `AWAITING_ADDRESS`, `PENDING_CONFIRMATION`, `CONFIRMED`,
`REJECTED`, `CANCELLED`, `COMPLETED`.

## Testing the webhook locally

With `WHATSAPP_APP_SECRET` empty, signature verification is skipped, so you can
post a fake event:

```bash
curl -X POST http://localhost:8000/api/v1/whatsapp/webhook \
  -H 'Content-Type: application/json' \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "changes": [{
        "field": "messages",
        "value": {
          "contacts": [{ "profile": { "name": "Test Customer" } }],
          "messages": [{
            "id": "wamid.test-1",
            "from": "919999999999",
            "type": "text",
            "text": { "body": "hi" }
          }]
        }
      }]
    }]
  }'
```

Sending replies still requires valid Graph API credentials, so without them the
outgoing call is logged as an error but the conversation/order rows are still
written. Re-posting the same `wamid` is ignored (`whatsappEvent` unique key).

Simulating a catalog order: send `"type": "order"` with
`"order": { "product_items": [{ "product_retailer_id": "KC-CUCUMBER-1KG", "quantity": 2 }] }`
using a retailer ID present in `products.whatsappProductId`.

Simulating an outbound status update: add a `statuses` array to the `messages`
change:

```json
"statuses": [{
  "id": "wamid.outbound-1",
  "status": "delivered",
  "timestamp": "1749416390",
  "recipient_id": "919999999999"
}]
```

This upserts `whatsappMessage.status`. Template, account, phone number, and
security payloads follow the same pattern; inspect the stored `payload` column
in `whatsappEvent` when adding support for a new field.

## Known limitations

- Webhook acknowledgement happens before processing; use a durable queue
  (for example BullMQ/SQS) before running multiple app instances.
- Per-customer serialization uses an in-process map. Replace with a Postgres
  advisory lock when scaling horizontally.
- Business-initiated messages (team alerts, any message after the 24-hour
  customer service window) require approved WhatsApp templates in production.
  The team number should message the business first, or the alert should become
  an approved utility template.
- No payment integration yet; the team confirms manually, matching the current
  requirement.
