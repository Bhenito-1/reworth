-- Public member reference (RW-MBR-*) assigned at registration.
ALTER TABLE "users" ADD COLUMN "memberReference" TEXT;

CREATE UNIQUE INDEX "users_memberReference_key" ON "users"("memberReference");
