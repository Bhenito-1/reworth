-- AlterTable
ALTER TABLE "users" ADD COLUMN "isDeliveryDriver" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "delivery_shipments" ADD COLUMN "assignedDriverId" UUID;

-- AlterTable
ALTER TABLE "delivery_events" ADD COLUMN "source" TEXT,
ADD COLUMN "occurredAt" TIMESTAMP(3),
ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex
CREATE INDEX "delivery_shipments_assignedDriverId_idx" ON "delivery_shipments"("assignedDriverId");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_events_idempotencyKey_key" ON "delivery_events"("idempotencyKey");

-- AddForeignKey
ALTER TABLE "delivery_shipments" ADD CONSTRAINT "delivery_shipments_assignedDriverId_fkey" FOREIGN KEY ("assignedDriverId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
