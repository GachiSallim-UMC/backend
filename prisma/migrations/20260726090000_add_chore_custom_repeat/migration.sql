-- AlterEnum
ALTER TYPE "RepeatType" ADD VALUE 'CUSTOM';

-- CreateEnum
CREATE TYPE "CustomOption" AS ENUM ('EVERY_N_DAYS', 'EVERY_N_WEEKS', 'EVERY_N_MONTHS', 'SPECIFIC_DAYS');

-- AlterTable
ALTER TABLE "chores" ADD COLUMN     "custom_option" "CustomOption",
ADD COLUMN     "repeat_interval" INTEGER;
