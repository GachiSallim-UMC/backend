-- CreateEnum
CREATE TYPE "NotificationPushDeliveryStatus" AS ENUM ('PENDING', 'ENQUEUED', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "notification_push_deliveries" (
    "id" BIGSERIAL NOT NULL,
    "notification_id" BIGINT NOT NULL,
    "subscription_id" BIGINT NOT NULL,
    "status" "NotificationPushDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "publish_attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enqueued_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "last_error" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_push_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notification_push_deliveries_notification_id_subscription_id_key"
ON "notification_push_deliveries"("notification_id", "subscription_id");

-- CreateIndex
CREATE INDEX "notification_push_deliveries_status_next_attempt_at_idx"
ON "notification_push_deliveries"("status", "next_attempt_at");

-- AddForeignKey
ALTER TABLE "notification_push_deliveries"
ADD CONSTRAINT "notification_push_deliveries_notification_id_fkey"
FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_push_deliveries"
ADD CONSTRAINT "notification_push_deliveries_subscription_id_fkey"
FOREIGN KEY ("subscription_id") REFERENCES "notification_push_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
