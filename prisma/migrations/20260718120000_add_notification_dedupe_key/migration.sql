ALTER TABLE "notifications"
ADD COLUMN "dedupe_key" VARCHAR(255);

CREATE UNIQUE INDEX "notifications_dedupe_key_key"
ON "notifications"("dedupe_key");
