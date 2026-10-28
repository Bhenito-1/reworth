-- Reports filed on a listing are about that listing's seller.
CREATE TYPE "ReportAction" AS ENUM ('WARN', 'REMOVE_LISTING', 'SUSPEND_USER');

ALTER TABLE "reports" ADD COLUMN "action" "ReportAction";
ALTER TABLE "reports" ADD COLUMN "resolvedById" UUID;
ALTER TABLE "reports" ADD COLUMN "resolvedAt" TIMESTAMP(3);

UPDATE "reports" AS r
SET "reportedUserId" = l."sellerId"
FROM "listings" AS l
WHERE r."listingId" = l."id"
  AND r."reportedUserId" IS NULL
  AND l."sellerId" <> r."reporterId";

UPDATE "reports" AS r
SET
  "action" = a.action::"ReportAction",
  "resolvedById" = a."actorUserId",
  "resolvedAt" = a."createdAt"
FROM (
  SELECT DISTINCT ON ("entityId")
    "entityId",
    "actorUserId",
    "createdAt",
    "afterJson"->>'action' AS action
  FROM "audit_logs"
  WHERE "action" = 'REPORT_ACTIONED'
    AND "entityId" IS NOT NULL
    AND "afterJson"->>'action' IN ('WARN', 'REMOVE_LISTING', 'SUSPEND_USER')
  ORDER BY "entityId", "createdAt" DESC
) AS a
WHERE r."id"::text = a."entityId";

UPDATE "reports" AS r
SET
  "resolvedById" = a."actorUserId",
  "resolvedAt" = a."createdAt"
FROM (
  SELECT DISTINCT ON ("entityId")
    "entityId",
    "actorUserId",
    "createdAt"
  FROM "audit_logs"
  WHERE "action" = 'REPORT_DISMISSED'
    AND "entityId" IS NOT NULL
  ORDER BY "entityId", "createdAt" DESC
) AS a
WHERE r."id"::text = a."entityId"
  AND r."resolvedAt" IS NULL;

ALTER TABLE "user_warnings" ADD COLUMN "reportId" UUID;

CREATE INDEX "reports_resolvedById_idx" ON "reports"("resolvedById");
CREATE INDEX "user_warnings_reportId_idx" ON "user_warnings"("reportId");

ALTER TABLE "reports"
  ADD CONSTRAINT "reports_resolvedById_fkey"
  FOREIGN KEY ("resolvedById") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "user_warnings"
  ADD CONSTRAINT "user_warnings_reportId_fkey"
  FOREIGN KEY ("reportId") REFERENCES "reports"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
