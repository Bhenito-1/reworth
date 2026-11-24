-- Seller bank transfer after the buyer confirms delivery.
CREATE TYPE "PayoutTransferStatus" AS ENUM ('PROCESSING', 'PAID', 'FAILED');

ALTER TABLE "seller_payout_accounts"
  ADD COLUMN "paystackRecipientCode" TEXT,
  ADD COLUMN "paystackRecipientBankCode" TEXT,
  ADD COLUMN "paystackRecipientAccountNumber" TEXT;

ALTER TABLE "payouts"
  ADD COLUMN "status" "PayoutTransferStatus" NOT NULL DEFAULT 'PAID',
  ADD COLUMN "failureReason" TEXT;

CREATE INDEX "payouts_pspReference_idx" ON "payouts"("pspReference");
