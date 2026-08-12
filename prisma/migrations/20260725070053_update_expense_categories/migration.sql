-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ExpenseCategory" ADD VALUE 'FINANCE';
ALTER TYPE "ExpenseCategory" ADD VALUE 'EDUCATION';
ALTER TYPE "ExpenseCategory" ADD VALUE 'GROCERY';
ALTER TYPE "ExpenseCategory" ADD VALUE 'TRANSPORT';
ALTER TYPE "ExpenseCategory" ADD VALUE 'LEISURE';
ALTER TYPE "ExpenseCategory" ADD VALUE 'CAFE';

-- RenameIndex
ALTER INDEX "notification_push_deliveries_notification_id_subscription_id_ke" RENAME TO "notification_push_deliveries_notification_id_subscription_i_key";
