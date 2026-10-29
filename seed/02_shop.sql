-- Dummy shops owned by the seed admins.
INSERT INTO "shop" (
  "id", "userId", "name", "description", "logo", "contactNumber",
  "contactNumber2", "contactEmail", "postalCode", "blockName", "district"
)
VALUES
  (
    '22222222-2222-2222-2222-222222222221',
    '11111111-1111-1111-1111-111111111111',
    'Khira Chokada',
    'Fresh groceries and daily essentials.',
    'https://example.com/logos/khira-chokada.png',
    '9876543210',
    '9876543211',
    'khira@example.com',
    '700001',
    'Block A',
    'Kolkata'
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    '11111111-1111-1111-1111-111111111112',
    'Corner Mart',
    'Snacks, beverages and household items.',
    'https://example.com/logos/corner-mart.png',
    '9123456780',
    NULL,
    'cornermart@example.com',
    '700002',
    'Block B',
    'Howrah'
  )
ON CONFLICT DO NOTHING;
