-- AlterTable
ALTER TABLE "chat_room_members" ADD COLUMN     "is_pinned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notification_enabled" BOOLEAN NOT NULL DEFAULT true;
