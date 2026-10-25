CREATE TABLE "User" (
  "id" UUID NOT NULL,
  "phone" VARCHAR(12) NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'customer',
  "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "User_phone_canonical" CHECK ("phone" ~ '^\+7[0-9]{10}$'),
  CONSTRAINT "User_customer_only" CHECK ("role" = 'customer'),
  CONSTRAINT "User_unverified_only" CHECK ("phoneVerified" = false)
);
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");
CREATE TABLE "AuthSession" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "tokenHash" CHAR(64) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "revokedAt" TIMESTAMPTZ(3),
  CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AuthSession_hash_hex" CHECK ("tokenHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "AuthSession_positive_lifetime" CHECK ("expiresAt" > "createdAt")
);
CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");
CREATE TABLE "AuthRateLimit" (
  "scope" TEXT NOT NULL,
  "keyHash" CHAR(64) NOT NULL,
  "windowStart" TIMESTAMPTZ(3) NOT NULL,
  "windowEnds" TIMESTAMPTZ(3) NOT NULL,
  "attempts" INTEGER NOT NULL,
  CONSTRAINT "AuthRateLimit_pkey" PRIMARY KEY ("scope", "keyHash", "windowStart"),
  CONSTRAINT "AuthRateLimit_positive_count" CHECK ("attempts" > 0),
  CONSTRAINT "AuthRateLimit_positive_window" CHECK ("windowEnds" > "windowStart")
);
CREATE INDEX "AuthRateLimit_windowEnds_idx" ON "AuthRateLimit"("windowEnds");
