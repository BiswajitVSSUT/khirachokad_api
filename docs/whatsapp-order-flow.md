# WhatsApp no-price order Flow

Set `WHATSAPP_ORDER_FLOW_ID` to the ID of a published WhatsApp Flow. The bot
sends this Flow after the customer taps **Order Now** in the welcome message.

The Flow should show a standalone image, product name, and quantity control for
each product. WhatsApp Flows render these vertically; a custom horizontal
product-card layout is not supported.

Use one of the following completion payload shapes. The application validates
the product against `catalogProduct`, creates the order, and asks for delivery
address. Customer messages do not show item price or total.

```json
{
  "qty_uwb6wnx0ej": "2",
  "qty_8w19oji9vi": "1",
  "qty_n48k3wa2ry": "0"
}
```

Alternatively, submit a product array:

```json
{
  "product_items": [
    { "product_retailer_id": "uwb6wnx0ej", "quantity": 2 },
    { "product_retailer_id": "8w19oji9vi", "quantity": 1 }
  ]
}
```

Use `0` for an item the customer does not want. The backend rejects missing,
inactive, out-of-stock, and over-inventory selections. It keeps the local price
only for internal order records; the bot and team notification deliberately do
not display it.
