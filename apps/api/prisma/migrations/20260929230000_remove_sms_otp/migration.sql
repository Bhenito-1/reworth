-- Drop SMS OTP challenges and remove SMS from consent channels.

DELETE FROM "consent_records" WHERE "channel" = 'SMS';

DROP TABLE IF EXISTS "otp_challenges";

CREATE TYPE "ConsentChannel_new" AS ENUM ('MARKETING', 'EMAIL');

ALTER TABLE "consent_records"
  ALTER COLUMN "channel" TYPE "ConsentChannel_new"
  USING ("channel"::text::"ConsentChannel_new");

DROP TYPE "ConsentChannel";

ALTER TYPE "ConsentChannel_new" RENAME TO "ConsentChannel";
