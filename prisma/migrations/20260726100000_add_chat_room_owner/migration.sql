-- AlterTable
ALTER TABLE "chat_rooms" ADD COLUMN "owner_id" BIGINT;

-- Backfill: existing rooms default to their creator as owner
UPDATE "chat_rooms" SET "owner_id" = "created_by" WHERE "owner_id" IS NULL;

-- Enforce NOT NULL now that all rows are backfilled
ALTER TABLE "chat_rooms" ALTER COLUMN "owner_id" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "chat_rooms" ADD CONSTRAINT "chat_rooms_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
