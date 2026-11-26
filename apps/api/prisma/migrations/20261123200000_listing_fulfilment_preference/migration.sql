CREATE TYPE "FulfilmentPreference" AS ENUM ('DELIVERY', 'MEET_POINT', 'EITHER');

ALTER TABLE "listings"
  ADD COLUMN "fulfilmentPreference" "FulfilmentPreference" NOT NULL DEFAULT 'EITHER';

UPDATE "listings"
SET "fulfilmentPreference" = 'DELIVERY'
WHERE "fulfilmentDelivery" = true AND "fulfilmentMeet" = false;

UPDATE "listings"
SET "fulfilmentPreference" = 'MEET_POINT'
WHERE "fulfilmentDelivery" = false AND "fulfilmentMeet" = true;

UPDATE "listings"
SET "fulfilmentMeet" = true,
    "fulfilmentDelivery" = true;

ALTER TABLE "listings" ALTER COLUMN "fulfilmentDelivery" SET DEFAULT true;