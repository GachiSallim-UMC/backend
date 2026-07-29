CREATE TABLE "user_notification_preferences" (
    "user_id" BIGINT NOT NULL,
    "chore_due_enabled" BOOLEAN NOT NULL DEFAULT true,
    "supply_status_changed_enabled" BOOLEAN NOT NULL DEFAULT true,
    "new_message_enabled" BOOLEAN NOT NULL DEFAULT true,
    "expense_request_enabled" BOOLEAN NOT NULL DEFAULT true,
    "rule_agreement_request_enabled" BOOLEAN NOT NULL DEFAULT true,
    "group_activity_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_notification_preferences_pkey" PRIMARY KEY ("user_id")
);

ALTER TABLE "user_notification_preferences"
ADD CONSTRAINT "user_notification_preferences_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
