-- Range filters for the admin dashboard (30-day MAU, listings, completed orders).
CREATE INDEX "listings_createdAt_idx" ON "listings"("createdAt");
CREATE INDEX "listing_events_createdAt_idx" ON "listing_events"("createdAt");
CREATE INDEX "risk_events_createdAt_idx" ON "risk_events"("createdAt");
CREATE INDEX "messages_createdAt_idx" ON "messages"("createdAt");
CREATE INDEX "orders_createdAt_idx" ON "orders"("createdAt");
CREATE INDEX "orders_status_completedAt_idx" ON "orders"("status", "completedAt");
