-- Offer / accept, rider-only addresses, and bulky-run bookkeeping.
-- PostgreSQL 16 allows ADD VALUE IF NOT EXISTS. New value is not used in this migration.

ALTER TYPE "DeliveryShipmentStatus" ADD VALUE IF NOT EXISTS 'OFFERED' BEFORE 'ASSIGNED';

ALTER TABLE "delivery_shipments"
  ADD COLUMN "driverAcceptedAt" TIMESTAMP(3),
  ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "declinedDriverIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "pickupLine" TEXT,
  ADD COLUMN "pickupLat" DOUBLE PRECISION,
  ADD COLUMN "pickupLng" DOUBLE PRECISION,
  ADD COLUMN "dropoffLine" TEXT,
  ADD COLUMN "dropoffLat" DOUBLE PRECISION,
  ADD COLUMN "dropoffLng" DOUBLE PRECISION,
  ADD COLUMN "dropoffArea" TEXT;
