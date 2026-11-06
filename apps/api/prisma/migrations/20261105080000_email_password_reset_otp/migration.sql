-- Password reset OTP (email + code, then new password).

CREATE TABLE "email_password_reset_otps" (
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_password_reset_otps_pkey" PRIMARY KEY ("email")
);
