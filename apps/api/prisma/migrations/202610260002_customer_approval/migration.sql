-- Fail closed for existing and future accounts: registration alone never opens offers.
CREATE TYPE "CommercialAccessStatus" AS ENUM ('pending', 'approved', 'rejected', 'revoked');
ALTER TABLE "User" ADD COLUMN "commercialAccessStatus" "CommercialAccessStatus" NOT NULL DEFAULT 'pending';
