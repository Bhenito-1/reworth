-- Swap + cash is no longer offered. Fold any leftover rows into a plain swap,
-- then drop the cash columns and the enum values.

UPDATE "listings"
SET "sellingMode" = 'SWAP'
WHERE "sellingMode"::text = 'SWAP_CASH';

UPDATE "orders"
SET "transactionType" = 'SWAP'
WHERE "transactionType"::text = 'SWAP_CASH';

ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_cashRecipientId_fkey";
ALTER TABLE "orders" DROP COLUMN IF EXISTS "cashRecipientId";
ALTER TABLE "swap_proposals" DROP COLUMN IF EXISTS "cashComponentKobo";

CREATE TYPE "SellingMode_new" AS ENUM ('SELL', 'SWAP', 'GIVE_AWAY');
ALTER TABLE "listings" ALTER COLUMN "sellingMode" DROP DEFAULT;
ALTER TABLE "listings"
  ALTER COLUMN "sellingMode" TYPE "SellingMode_new"
  USING ("sellingMode"::text::"SellingMode_new");
ALTER TYPE "SellingMode" RENAME TO "SellingMode_old";
ALTER TYPE "SellingMode_new" RENAME TO "SellingMode";
DROP TYPE "SellingMode_old";
ALTER TABLE "listings" ALTER COLUMN "sellingMode" SET DEFAULT 'SELL';

CREATE TYPE "TransactionType_new" AS ENUM ('CASH', 'SWAP', 'GIVEAWAY');
ALTER TABLE "orders" ALTER COLUMN "transactionType" DROP DEFAULT;
ALTER TABLE "orders"
  ALTER COLUMN "transactionType" TYPE "TransactionType_new"
  USING ("transactionType"::text::"TransactionType_new");
ALTER TYPE "TransactionType" RENAME TO "TransactionType_old";
ALTER TYPE "TransactionType_new" RENAME TO "TransactionType";
DROP TYPE "TransactionType_old";
ALTER TABLE "orders" ALTER COLUMN "transactionType" SET DEFAULT 'CASH';
