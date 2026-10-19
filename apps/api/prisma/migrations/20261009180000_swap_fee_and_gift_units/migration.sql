-- One swap has two payable orders (one per person), plus a fixed swap fee.
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "swapFeeKobo" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_swapProposalId_key";
DROP INDEX IF EXISTS "orders_swapProposalId_key";
CREATE INDEX IF NOT EXISTS "orders_swapProposalId_idx" ON "orders"("swapProposalId");
