-- Dummy admin users for local testing.
-- Raw password for both users: KcDb_2026!
INSERT INTO "admin" ("id", "name", "email", "password", "avatar")
VALUES
  (
    '11111111-1111-1111-1111-111111111111',
    'Test Admin',
    'admin@example.com',
    -- Raw password: KcDb_2026!
    '$2b$10$5sVyGS30yy8ty5mumu6neuN0/B.oYV5mVd8mD1zkizWh6c.QtTb5C',
    'https://example.com/avatars/admin.png'
  ),
  (
    '11111111-1111-1111-1111-111111111112',
    'Second Admin',
    'admin2@example.com',
    -- Raw password: KcDb_2026!
    '$2b$10$5sVyGS30yy8ty5mumu6neuN0/B.oYV5mVd8mD1zkizWh6c.QtTb5C',
    'https://example.com/avatars/admin2.png'
  )
ON CONFLICT DO NOTHING;
