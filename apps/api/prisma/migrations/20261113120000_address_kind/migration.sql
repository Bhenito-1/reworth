-- CreateEnum
CREATE TYPE "AddressKind" AS ENUM ('PICKUP', 'DELIVERY');

-- AlterTable
ALTER TABLE "addresses" ADD COLUMN "kind" "AddressKind" NOT NULL DEFAULT 'DELIVERY';

-- AlterTable
ALTER TABLE "listings" ADD COLUMN "pickupAddressId" UUID;

-- CreateIndex
CREATE INDEX "addresses_userId_kind_idx" ON "addresses"("userId", "kind");

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_pickupAddressId_fkey" FOREIGN KEY ("pickupAddressId") REFERENCES "addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: legacy label-based delivery rows
UPDATE "addresses" SET "kind" = 'DELIVERY' WHERE "label" = 'delivery';

-- Backfill: one default pickup per seller from listing text (shared across their listings)
INSERT INTO "addresses" (
  "id", "userId", "kind", "label", "line1", "city", "community", "country",
  "geoLat", "geoLng", "isDefault", "private"
)
SELECT
  gen_random_uuid(),
  sub."sellerId",
  'PICKUP'::"AddressKind",
  'pickup',
  sub."addressPrivate",
  sub.city,
  sub.community,
  'NG',
  sub."geoLat",
  sub."geoLng",
  true,
  true
FROM (
  SELECT DISTINCT ON (l."sellerId")
    l."sellerId",
    trim(l."addressPrivate") AS "addressPrivate",
    COALESCE(NULLIF(trim(l.city), ''), 'Lagos') AS city,
    COALESCE(NULLIF(trim(l.community), ''), 'Lagos') AS community,
    l."geoLat",
    l."geoLng"
  FROM "listings" l
  WHERE l."addressPrivate" IS NOT NULL
    AND length(trim(l."addressPrivate")) >= 8
  ORDER BY l."sellerId", l."updatedAt" DESC
) sub
WHERE NOT EXISTS (
  SELECT 1 FROM "addresses" a
  WHERE a."userId" = sub."sellerId" AND a."kind" = 'PICKUP' AND a."isDefault" = true
);

UPDATE "listings" l
SET "pickupAddressId" = a."id"
FROM "addresses" a
WHERE a."userId" = l."sellerId"
  AND a."kind" = 'PICKUP'
  AND a."isDefault" = true
  AND l."addressPrivate" IS NOT NULL
  AND length(trim(l."addressPrivate")) >= 8;
