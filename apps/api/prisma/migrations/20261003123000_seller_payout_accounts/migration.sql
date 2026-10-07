-- Verified seller payout account used before a listing can be published.
CREATE TABLE "seller_payout_accounts" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "bankCode" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "middleName" TEXT NOT NULL DEFAULT '',
    "lastName" TEXT NOT NULL,
    "nibssAccountName" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seller_payout_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "seller_payout_accounts_userId_key" ON "seller_payout_accounts"("userId");

ALTER TABLE "seller_payout_accounts" ADD CONSTRAINT "seller_payout_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
