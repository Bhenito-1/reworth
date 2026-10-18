-- Record who paid each payment. Existing rows take the order buyer.
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "payerId" UUID;
UPDATE "payments" AS p
SET "payerId" = o."buyerId"
FROM "orders" AS o
WHERE p."orderId" = o.id
  AND p."payerId" IS NULL;
CREATE INDEX IF NOT EXISTS "payments_payerId_idx" ON "payments"("payerId");
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payments_payerId_fkey'
  ) THEN
    ALTER TABLE "payments"
      ADD CONSTRAINT "payments_payerId_fkey"
      FOREIGN KEY ("payerId") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
