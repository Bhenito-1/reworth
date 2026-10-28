-- ListingModeration: canonical publish-time risk + content assessment snapshot
CREATE TABLE "listing_moderations" (
    "id" UUID NOT NULL,
    "listingId" UUID NOT NULL,
    "imageScore" INTEGER NOT NULL DEFAULT 0,
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "riskLevel" "RiskLevel" NOT NULL DEFAULT 'LOW',
    "signals" JSONB NOT NULL DEFAULT '[]',
    "decision" "ModerationOutcome" NOT NULL,
    "policyViolations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "rejectionReason" TEXT,
    "imageFitScore" INTEGER NOT NULL DEFAULT 0,
    "readyImageCount" INTEGER NOT NULL DEFAULT 0,
    "detail" JSONB,
    "assessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_moderations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "listing_moderations_listingId_assessedAt_idx" ON "listing_moderations"("listingId", "assessedAt");
CREATE INDEX "listing_moderations_decision_idx" ON "listing_moderations"("decision");
CREATE INDEX "listing_moderations_assessedAt_idx" ON "listing_moderations"("assessedAt");

ALTER TABLE "listing_moderations" ADD CONSTRAINT "listing_moderations_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
