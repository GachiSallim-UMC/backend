-- CreateEnum
CREATE TYPE "ChatRoomType" AS ENUM ('GROUP', 'NOTICE', 'DM');

-- AlterTable
ALTER TABLE "chat_rooms" ADD COLUMN     "type" "ChatRoomType" NOT NULL DEFAULT 'GROUP';
