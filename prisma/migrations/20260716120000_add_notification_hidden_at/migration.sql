ALTER TABLE "notifications" ADD COLUMN "hidden_at" TIMESTAMP(3);

CREATE INDEX "notifications_user_id_hidden_at_created_at_idx"
ON "notifications"("user_id", "hidden_at", "created_at");
