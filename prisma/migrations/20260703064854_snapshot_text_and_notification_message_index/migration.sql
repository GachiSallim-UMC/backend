-- AlterTable
ALTER TABLE "rule_logs" ALTER COLUMN "snapshot" SET DATA TYPE TEXT;

-- CreateIndex
CREATE INDEX "messages_chat_room_id_created_at_idx" ON "messages"("chat_room_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_idx" ON "notifications"("user_id", "is_read");
