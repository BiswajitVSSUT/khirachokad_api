-- Dummy products for the seed shops.
-- "whatsappProductId" must match the product retailer ID configured in
-- Meta Commerce Manager for the WhatsApp catalog.
INSERT INTO "products" (
  "id", "name", "description", "price", "image", "shopId",
  "verificationId", "expiryDate", "createdAt", "updatedAt",
  "sku", "whatsappProductId", "unit", "isActive"
)
VALUES
  (
    '33333333-3333-3333-3333-333333333331',
    'Cucumber',
    'Fresh cucumber, 1 kg.',
    '40',
    'https://example.com/products/cucumber.png',
    '22222222-2222-2222-2222-222222222221',
    'KC-VERIFY-0001',
    '2027-01-31T00:00:00Z',
    NOW(),
    NOW(),
    'KC-CUCUMBER-1KG',
    'KC-CUCUMBER-1KG',
    'kg',
    TRUE
  ),
  (
    '33333333-3333-3333-3333-333333333332',
    'Tomato',
    'Ripe tomato, 1 kg.',
    '60',
    'https://example.com/products/tomato.png',
    '22222222-2222-2222-2222-222222222221',
    'KC-VERIFY-0002',
    '2027-02-15T00:00:00Z',
    NOW(),
    NOW(),
    'KC-TOMATO-1KG',
    'KC-TOMATO-1KG',
    'kg',
    TRUE
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    'Potato Chips',
    'Salted potato chips, 100 g.',
    '30',
    'https://example.com/products/chips.png',
    '22222222-2222-2222-2222-222222222222',
    'KC-VERIFY-0003',
    '2027-06-30T00:00:00Z',
    NOW(),
    NOW(),
    'KC-CHIPS-100G',
    'KC-CHIPS-100G',
    'pack',
    TRUE
  )
ON CONFLICT ("id") DO UPDATE SET
  "sku" = EXCLUDED."sku",
  "whatsappProductId" = EXCLUDED."whatsappProductId",
  "unit" = EXCLUDED."unit",
  "isActive" = EXCLUDED."isActive";
