-- Cart (no stock hold) + per-listing unit counts + seller confirmation before payment.

CREATE TYPE "OrderConfirmationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

ALTER TABLE "listings"
  ADD COLUMN "quantityTotal" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "quantityAvailable" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "quantityReserved" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "quantitySold" INTEGER NOT NULL DEFAULT 0;

-- Listings already held or sold have nothing left to buy.
UPDATE "listings"
SET
  "quantityAvailable" = 0,
  "quantityReserved" = CASE WHEN "status" = 'RESERVED' THEN 1 ELSE 0 END,
  "quantitySold" = CASE WHEN "status" = 'SOLD' THEN 1 ELSE 0 END
WHERE "status" IN ('RESERVED', 'SOLD');

CREATE INDEX "listings_status_quantityAvailable_idx"
  ON "listings"("status", "quantityAvailable");

ALTER TABLE "orders"
  ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "unitPriceKobo" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "confirmationStatus" "OrderConfirmationStatus" NOT NULL DEFAULT 'CONFIRMED',
  ADD COLUMN "rejectionReason" TEXT,
  ADD COLUMN "sellerNote" TEXT,
  ADD COLUMN "deliveryDate" TIMESTAMP(3),
  ADD COLUMN "inventoryCommitted" BOOLEAN NOT NULL DEFAULT false;

UPDATE "orders"
SET "unitPriceKobo" = "amountKobo"
WHERE "quantity" = 1 AND "unitPriceKobo" = 0;

UPDATE "orders"
SET "inventoryCommitted" = true
WHERE "status" NOT IN ('CREATED', 'PAYMENT_PENDING', 'CANCELLED');

CREATE TABLE "cart_items" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "listingId" UUID NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cart_items_userId_listingId_key" ON "cart_items"("userId", "listingId");
CREATE INDEX "cart_items_userId_idx" ON "cart_items"("userId");

ALTER TABLE "cart_items"
  ADD CONSTRAINT "cart_items_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cart_items"
  ADD CONSTRAINT "cart_items_listingId_fkey"
  FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
