# Meta catalog support report

## Summary

WhatsApp catalog messages and product messages fail with `131009`, even though
Commerce Manager shows catalog `1621989312756946` (`Catalogue_Products`) as
healthy, with 5 products in the `All Products` set.

The WhatsApp Business Account's connected-catalog endpoint returns an empty
list, but the token does **not** include `catalog_management`, which Meta's
documentation lists as a requirement for this endpoint. The empty list is
therefore **not conclusive** that no catalog is connected.

The catalog API calls return Graph error subcode `33`, and the business catalog
list returns app error `200` (app not approved for this API).

## Identifiers

| Item | Value |
|---|---|
| Graph API version | `v25.0` |
| App ID | `971510999360727` |
| App name | `Khirachokada` |
| Business ID | `1632813028489862` |
| WABA ID | `4744484355875203` |
| Phone number ID | `1359719267228440` |
| Display number | `+91 76820 04594` |
| Catalog ID | `1621989312756946` |
| Catalog name | `Catalogue_Products` |

## Token

The token is a `SYSTEM_USER` token for the Khirachokada app. It is valid and
does not expire. It has these scopes:

```text
business_management
whatsapp_business_management
whatsapp_business_messaging
public_profile
```

It does **not** have `catalog_management`.

## Reproduction code

Set these environment variables first. Do not commit the token.

```bash
WHATSAPP_ACCESS_TOKEN="..."
WHATSAPP_APP_SECRET="..."
WHATSAPP_API_VERSION="v25.0"
WHATSAPP_PHONE_NUMBER_ID="1359719267228440"
WHATSAPP_CATALOG_ID="1621989312756946"
WHATSAPP_BUSINESS_ID="1632813028489862"
```

```js
const VERSION = process.env.WHATSAPP_API_VERSION;
const TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const APP_ID = "971510999360727";
const APP_SECRET = process.env.WHATSAPP_APP_SECRET;

const WABA_ID = "4744484355875203";
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const CATALOG_ID = process.env.WHATSAPP_CATALOG_ID;
const BUSINESS_ID = process.env.WHATSAPP_BUSINESS_ID;

async function graph(path, { method = "GET", body } = {}) {
  const response = await fetch(`https://graph.facebook.com/${VERSION}/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }

  return { status: response.status, body: parsed };
}

// 1. Inspect token
async function debugToken() {
  const url = new URL(`https://graph.facebook.com/${VERSION}/debug_token`);
  url.searchParams.set("input_token", TOKEN);
  url.searchParams.set("access_token", `${APP_ID}|${APP_SECRET}`);
  const response = await fetch(url);
  return { status: response.status, body: await response.json() };
}

// 2. WABA and connected catalogs
await graph(`${WABA_ID}?fields=id,name,account_review_status,business_verification_status,ownership_type`);
await graph(`${WABA_ID}/product_catalogs`);

// 3. Phone number
await graph(`${PHONE_NUMBER_ID}?fields=id,display_phone_number,verified_name,quality_rating,platform_type`);

// 4. Catalog
await graph(`${CATALOG_ID}?fields=id,name,product_count,vertical`);
await graph(`${CATALOG_ID}/products?fields=id,retailer_id,name,price,availability,review_status&limit=5`);

// 5. Catalog_message
await graph(`${PHONE_NUMBER_ID}/messages`, {
  method: "POST",
  body: {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: "<business test recipient>",
    type: "interactive",
    interactive: {
      type: "catalog_message",
      body: { text: "Catalog test from KHIRA CHOKADA backend" },
      action: { name: "catalog_message" },
    },
  },
});

// 6. Product message
await graph(`${PHONE_NUMBER_ID}/messages`, {
  method: "POST",
  body: {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: "<business test recipient>",
    type: "interactive",
    interactive: {
      type: "product",
      body: { text: "Product test from KHIRA CHOKADA backend" },
      action: {
        catalog_id: CATALOG_ID,
        product_retailer_id: "rieyuawu46",
      },
    },
  },
});
```

## Exact responses

### 1. `debug_token`

Request:

```text
GET /v25.0/debug_token?input_token=<token>&access_token=<app-id>|<app-secret>
```

Response: `200`

```json
{
  "data": {
    "app_id": "971510999360727",
    "type": "SYSTEM_USER",
    "application": "Khirachokada",
    "data_access_expires_at": 0,
    "expires_at": 0,
    "is_valid": true,
    "issued_at": 1793473380,
    "scopes": [
      "business_management",
      "whatsapp_business_management",
      "whatsapp_business_messaging",
      "public_profile"
    ],
    "granular_scopes": [
      { "scope": "business_management" },
      { "scope": "whatsapp_business_management" },
      { "scope": "whatsapp_business_messaging" }
    ],
    "user_id": "122098112139535768"
  }
}
```

### 2. WABA

Request:

```text
GET /v25.0/4744484355875203?fields=id,name,account_review_status,business_verification_status,ownership_type
```

Response: `200`

```json
{
  "id": "4744484355875203",
  "name": "Khirachokada",
  "account_review_status": "APPROVED",
  "business_verification_status": "verified",
  "ownership_type": "SELF"
}
```

### 3. Connected catalogs

Request:

```text
GET /v25.0/4744484355875203/product_catalogs
```

Response: `200`

```json
{
  "data": []
}
```

Note: Meta's documentation lists `catalog_management` as a required permission
for this endpoint. The token used here does not have that scope, so this empty
response cannot be treated as proof that the catalog is disconnected.

### 4. Phone number

Request:

```text
GET /v25.0/1359719267228440?fields=id,display_phone_number,verified_name,quality_rating,platform_type
```

Response: `200`

```json
{
  "id": "1359719267228440",
  "display_phone_number": "+91 76820 04594",
  "verified_name": "Khirachokada",
  "quality_rating": "GREEN",
  "platform_type": "CLOUD_API"
}
```

### 4a. Account-level status

Request:

```text
GET /v25.0/1359719267228440?fields=id,display_phone_number,verified_name,quality_rating,status,code_verification_status,is_official_business_account,account_mode,messaging_limit_tier,platform_type
```

Response: `200`

```json
{
  "id": "1359719267228440",
  "display_phone_number": "+91 76820 04594",
  "verified_name": "Khirachokada",
  "quality_rating": "GREEN",
  "status": "CONNECTED",
  "code_verification_status": "VERIFIED",
  "is_official_business_account": false,
  "account_mode": "LIVE",
  "platform_type": "CLOUD_API"
}
```

WABA account review:

```json
{
  "id": "4744484355875203",
  "name": "Khirachokada",
  "account_review_status": "APPROVED",
  "business_verification_status": "verified",
  "ownership_type": "SELF"
}
```

This shows the WABA is approved, the business is verified, the phone number is
connected, verified, live, and has GREEN quality. The failure is not an
account-level review failure.

### 5. Catalog lookup

Request:

```text
GET /v25.0/1621989312756946?fields=id,name,product_count,vertical
```

Response: `400`

```json
{
  "error": {
    "message": "Unsupported get request. Please read the Graph API documentation at https://developers.facebook.com/docs/graph-api",
    "code": 100,
    "type": "GraphMethodException",
    "error_subcode": 33,
    "fbtrace_id": "A_S8UJS7dnSFgLlMmKTxZ-8"
  }
}
```

### 6. Catalog products

Request:

```text
GET /v25.0/1621989312756946/products?fields=id,retailer_id,name,price,availability,review_status&limit=5
```

Response: `400`

```json
{
  "error": {
    "message": "Unsupported get request. Object with ID '1621989312756946' does not exist, cannot be loaded due to missing permissions, or does not support this operation. Please read the Graph API documentation at https://developers.facebook.com/docs/graph-api",
    "code": 100,
    "type": "GraphMethodException",
    "error_subcode": 33,
    "fbtrace_id": "A-NRvC83yw3Yn-jCmGgw2wE"
  }
}
```

### 7. Business-owned catalogs

Request:

```text
GET /v25.0/1632813028489862/owned_product_catalogs?fields=id,name,product_count,vertical
```

Response: `403`

```json
{
  "error": {
    "message": "(#200) This application has not been approved to use this API.",
    "type": "OAuthException",
    "code": 200,
    "fbtrace_id": "A8dpR0lmiywvNMaCHb4s6Gy"
  }
}
```

### 8. WhatsApp `catalog_message`

Request:

```text
POST /v25.0/1359719267228440/messages
```

Body:

```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "<business test recipient>",
  "type": "interactive",
  "interactive": {
    "type": "catalog_message",
    "body": { "text": "Catalog test from KHIRA CHOKADA backend" },
    "action": { "name": "catalog_message" }
  }
}
```

Response: `400`

```json
{
  "error": {
    "message": "(#131009) Parameter value is not valid",
    "code": 131009,
    "type": "OAuthException",
    "error_data": {
      "messaging_product": "whatsapp",
      "details": "Products not found in FB catalog"
    },
    "fbtrace_id": "ALGnY4xADf7dm0sgnSB9CEj"
  }
}
```

### 9. WhatsApp product message

Request:

```text
POST /v25.0/1359719267228440/messages
```

Body:

```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "<business test recipient>",
  "type": "interactive",
  "interactive": {
    "type": "product",
    "body": { "text": "Product test from KHIRA CHOKADA backend" },
    "action": {
      "catalog_id": "1621989312756946",
      "product_retailer_id": "rieyuawu46"
    }
  }
}
```

Response: `400`

```json
{
  "error": {
    "message": "(#131009) Parameter value is not valid",
    "code": 131009,
    "type": "OAuthException",
    "error_data": {
      "messaging_product": "whatsapp",
      "details": "product not found for product_retailer_id, rieyuawu46, in catalog_id, 1621989312756946"
    },
    "fbtrace_id": "ACsVN9tRa74r0iR0ewwnDb4"
  }
}
```

### 10. WhatsApp catalog template message

Template `catalog` (`4138468179623714`), language `en`, with a `CATALOG`
button.

Request:

```text
POST /v25.0/1359719267228440/messages
```

Body:

```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "<business test recipient>",
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

Response: `404`

```json
{
  "error": {
    "message": "(#131006) Resource not found",
    "code": 131006,
    "type": "OAuthException",
    "error_data": {
      "messaging_product": "whatsapp",
      "details": "Empty product list retrieved. Atleast 1 product is required"
    },
    "fbtrace_id": "Av8zzEz968RxZytVkSYJYhG"
  }
}
```

This confirms that the approved template is valid but WhatsApp sees no
available products in the catalog attached to the WABA.

## Questions for Meta

1. Is catalog `1621989312756946` connected to WABA `4744484355875203` and phone
   number `1359719267228440`? Why does `GET /4744484355875203/product_catalogs`
   return `{ "data": [] }` while Commerce Manager shows the catalog as healthy?
2. Why does `catalog_message` return `131009` / `Products not found in FB
   catalog` when the catalog shows 5 products in Commerce Manager?
3. Are the 5 products in catalog `1621989312756946` approved for the
   **WhatsApp capability**, or only for ads? Commerce Manager shows them as
   ads-eligible. Should `GET /{catalog-id}/products?return_only_approved_products=true`
   be used to check WhatsApp approval?
4. Why does the approved `catalog` template (`4138468179623714`) return `131006`
   / `Empty product list retrieved. Atleast 1 product is required` when
   Commerce Manager shows 5 products in catalog `1621989312756946`?
5. Why does the product message report `product_retailer_id rieyuawu46` not
   found? What are the actual retailer IDs for the 5 products in this catalog?
6. Why do catalog API calls return error subcode `33`, and why does
   `owned_product_catalogs` return `(#200) This application has not been
   approved to use this API`, despite the catalog being visible in Commerce
   Manager?
7. Does `catalog_management` need to be added to the system-user token before
   `GET /{waba-id}/product_catalogs` will return the connected catalog, or
   should an empty list only mean the catalog is not connected?
8. Confirm the correct API to connect the catalog:

   ```text
   POST /v25.0/4744484355875203/product_catalogs
   { "catalog_id": "1621989312756946" }
   ```

   Is `catalog_management` required in addition to
   `whatsapp_business_management`?

## Commerce Manager evidence

Screenshot supplied by the business shows:

- Business portfolio: `Khirachokada`
- Catalog: `Catalogue_Products`
- Catalog ID: `1621989312756946`
- Products: 5
- Product set: `All Products`
- Catalog health: no blocking issues, products ads-eligible

This is catalog health for ads, not confirmation that the catalog is connected
to the WhatsApp Business Account.

## Official documentation

- WABA connected catalog:
  <https://developers.facebook.com/docs/graph-api/reference/whats-app-business-account/product_catalogs/>
- Catalog products:
  <https://developers.facebook.com/docs/marketing-api/reference/product-catalog/products/>
