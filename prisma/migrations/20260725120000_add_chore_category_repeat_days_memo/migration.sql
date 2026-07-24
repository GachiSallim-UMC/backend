-- CreateEnum
CREATE TYPE "ChoreCategory" AS ENUM ('CLEANING', 'DISHWASHING', 'LAUNDRY', 'TRASH', 'TIDYING', 'SHOPPING', 'COOKING', 'PET_PLANT', 'ETC');

-- CreateEnum
CREATE TYPE "Weekday" AS ENUM ('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN');

-- AlterTable
ALTER TABLE "chores" ADD COLUMN     "category" "ChoreCategory" NOT NULL DEFAULT 'ETC',
ADD COLUMN     "repeat_days" "Weekday"[],
ADD COLUMN     "memo" VARCHAR(255);
