DROP TABLE IF EXISTS "instant_buy_fulfilments";
DROP TYPE IF EXISTS "InstantBuyFulfilmentStatus";
DROP INDEX IF EXISTS "listings_instantBuyEligible_idx";
ALTER TABLE "listings" DROP COLUMN IF EXISTS "instantBuyEligible";
