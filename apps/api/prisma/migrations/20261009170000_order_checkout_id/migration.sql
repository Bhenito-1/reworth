-- Orders from one cart checkout share checkoutId so a seller rating
-- can count that checkout as one unit.
ALTER TABLE "orders" ADD COLUMN "checkoutId" UUID;

CREATE INDEX "orders_checkoutId_idx" ON "orders"("checkoutId");
