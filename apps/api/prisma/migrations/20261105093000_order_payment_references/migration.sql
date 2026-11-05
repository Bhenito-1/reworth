-- Order public references, order↔payment link, payment payee id.

ALTER TABLE "orders" ADD COLUMN "reference" TEXT;
ALTER TABLE "orders" ADD COLUMN "paymentId" UUID;

UPDATE "orders"
SET "reference" = 'RW-ORD-' || UPPER(SUBSTRING(REPLACE("id"::text, '-', ''), 1, 12))
WHERE "reference" IS NULL;

ALTER TABLE "orders" ALTER COLUMN "reference" SET NOT NULL;
CREATE UNIQUE INDEX "orders_reference_key" ON "orders"("reference");

ALTER TABLE "payments" ADD COLUMN "payeeId" UUID;

UPDATE "payments" AS p
SET "payeeId" = o."sellerId"
FROM "orders" AS o
WHERE p."orderId" = o."id" AND p."payeeId" IS NULL;

UPDATE "payments" SET "payerId" = (
  SELECT o."buyerId" FROM "orders" o WHERE o."id" = "payments"."orderId"
)
WHERE "payerId" IS NULL;

ALTER TABLE "payments" ALTER COLUMN "payerId" SET NOT NULL;
ALTER TABLE "payments" ALTER COLUMN "payeeId" SET NOT NULL;

UPDATE "orders" AS o
SET "paymentId" = sub."pid"
FROM (
  SELECT DISTINCT ON ("orderId") "orderId", "id" AS pid
  FROM "payments"
  ORDER BY "orderId", "createdAt" DESC
) AS sub
WHERE o."id" = sub."orderId" AND o."paymentId" IS NULL;

CREATE UNIQUE INDEX "orders_paymentId_key" ON "orders"("paymentId");

ALTER TABLE "orders" ADD CONSTRAINT "orders_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payments" ADD CONSTRAINT "payments_payeeId_fkey"
  FOREIGN KEY ("payeeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "payments_payeeId_idx" ON "payments"("payeeId");
