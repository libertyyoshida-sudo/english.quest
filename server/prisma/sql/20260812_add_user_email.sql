ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "email" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "User_email_not_null_key"
ON "User" ("email")
WHERE "email" IS NOT NULL;
