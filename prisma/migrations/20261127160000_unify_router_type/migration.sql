-- Unify Home/Office broadband routers into a single "router" type with category attribute.

INSERT INTO "stock_item_types" (
  "id",
  "key",
  "label",
  "description",
  "attributes_schema",
  "low_stock_threshold",
  "enabled",
  "sort_order",
  "created_at",
  "updated_at"
)
SELECT
  'cmrouterunified00000000001',
  'router',
  'Router',
  'Broadband routers tracked by category (HBB / OBB) through intake, assignment, sale, and returns.',
  '{"fields":[{"key":"category","label":"Category","type":"select","required":true,"options":[{"value":"HBB","label":"HBB — Home Broadband"},{"value":"OBB","label":"OBB — Office Broadband"}]}]}'::jsonb,
  10,
  true,
  20,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "stock_item_types" WHERE "key" = 'router'
);

UPDATE "stock_units" AS u
SET
  "type_id" = r."id",
  "attributes" = COALESCE(u."attributes", '{}'::jsonb) || '{"category":"HBB"}'::jsonb,
  "updated_at" = CURRENT_TIMESTAMP
FROM "stock_item_types" AS old
CROSS JOIN "stock_item_types" AS r
WHERE old."key" = 'router_hbb'
  AND r."key" = 'router'
  AND u."type_id" = old."id";

UPDATE "stock_units" AS u
SET
  "type_id" = r."id",
  "attributes" = COALESCE(u."attributes", '{}'::jsonb) || '{"category":"OBB"}'::jsonb,
  "updated_at" = CURRENT_TIMESTAMP
FROM "stock_item_types" AS old
CROSS JOIN "stock_item_types" AS r
WHERE old."key" = 'router_obb'
  AND r."key" = 'router'
  AND u."type_id" = old."id";

UPDATE "stock_intake_batches" AS b
SET
  "type_id" = r."id",
  "updated_at" = CURRENT_TIMESTAMP
FROM "stock_item_types" AS old
CROSS JOIN "stock_item_types" AS r
WHERE old."key" IN ('router_hbb', 'router_obb')
  AND r."key" = 'router'
  AND b."type_id" = old."id";

UPDATE "stock_item_types"
SET
  "enabled" = false,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "key" IN ('router_hbb', 'router_obb');
