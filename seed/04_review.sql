-- Dummy reviews for the seed shops.
INSERT INTO "review" (
  "id", "revieweeName", "revieweeEmail", "review", "rating",
  "shopId", "createdAt", "updatedAt"
)
VALUES
  (
    '44444444-4444-4444-4444-444444444441',
    'Ravi Kumar',
    'ravi.kumar@example.com',
    'Great quality and quick service.',
    5,
    '22222222-2222-2222-2222-222222222221',
    NOW(),
    NOW()
  ),
  (
    '44444444-4444-4444-4444-444444444442',
    'Priya Singh',
    'priya.singh@example.com',
    'Good prices, but delivery was a bit slow.',
    4,
    '22222222-2222-2222-2222-222222222221',
    NOW(),
    NOW()
  ),
  (
    '44444444-4444-4444-4444-444444444443',
    'Amit Das',
    'amit.das@example.com',
    'Everything was fresh and well packed.',
    5,
    '22222222-2222-2222-2222-222222222222',
    NOW(),
    NOW()
  )
ON CONFLICT DO NOTHING;
