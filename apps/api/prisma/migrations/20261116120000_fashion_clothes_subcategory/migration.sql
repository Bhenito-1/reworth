-- Fashion → Clothes subcategory (search slug fashion--clothes)
INSERT INTO "categories" ("id", "slug", "name", "parentId", "sortOrder", "createdAt")
SELECT gen_random_uuid(), 'fashion--clothes', 'Clothes', p."id", 2, NOW()
FROM "categories" p
WHERE p."slug" = 'fashion'
ON CONFLICT ("slug") DO UPDATE
SET
  "name" = EXCLUDED."name",
  "parentId" = EXCLUDED."parentId",
  "sortOrder" = EXCLUDED."sortOrder";