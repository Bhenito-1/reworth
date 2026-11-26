-- Meetup negotiation + checkout
ALTER TYPE "MessageType" ADD VALUE IF NOT EXISTS 'MEETUP_CARD';

CREATE TABLE "meetup_proposals" (
    "id" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "conversationId" UUID,
    "buyerId" UUID NOT NULL,
    "sellerId" UUID NOT NULL,
    "locationText" TEXT NOT NULL,
    "status" "OfferStatus" NOT NULL DEFAULT 'PENDING',
    "parentId" UUID,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meetup_proposals_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "meetupProposalId" UUID;

ALTER TABLE "order_intents" ADD COLUMN IF NOT EXISTS "meetupProposalId" UUID;
ALTER TABLE "order_intents" ADD COLUMN IF NOT EXISTS "fulfilmentMethod" "FulfilmentMethod";
ALTER TABLE "order_intents" ADD COLUMN IF NOT EXISTS "meetupLocationText" TEXT;

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "meetupLocationText" TEXT;

CREATE INDEX "meetup_proposals_listingId_status_idx" ON "meetup_proposals"("listingId", "status");
CREATE INDEX "meetup_proposals_buyerId_listingId_status_idx" ON "meetup_proposals"("buyerId", "listingId", "status");
CREATE INDEX "meetup_proposals_expiresAt_idx" ON "meetup_proposals"("expiresAt");

ALTER TABLE "meetup_proposals" ADD CONSTRAINT "meetup_proposals_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "meetup_proposals" ADD CONSTRAINT "meetup_proposals_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "meetup_proposals" ADD CONSTRAINT "meetup_proposals_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "meetup_proposals" ADD CONSTRAINT "meetup_proposals_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "meetup_proposals" ADD CONSTRAINT "meetup_proposals_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "meetup_proposals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "messages" ADD CONSTRAINT "messages_meetupProposalId_fkey" FOREIGN KEY ("meetupProposalId") REFERENCES "meetup_proposals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "order_intents" ADD CONSTRAINT "order_intents_meetupProposalId_fkey" FOREIGN KEY ("meetupProposalId") REFERENCES "meetup_proposals"("id") ON DELETE SET NULL ON UPDATE CASCADE;