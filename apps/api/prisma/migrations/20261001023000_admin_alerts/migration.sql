-- Admin ops inbox for listings in review and other urgent queues.
CREATE TABLE "admin_alerts" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_alerts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "admin_alerts_userId_readAt_createdAt_idx" ON "admin_alerts"("userId", "readAt", "createdAt");
CREATE INDEX "admin_alerts_kind_entityId_idx" ON "admin_alerts"("kind", "entityId");

ALTER TABLE "admin_alerts" ADD CONSTRAINT "admin_alerts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
