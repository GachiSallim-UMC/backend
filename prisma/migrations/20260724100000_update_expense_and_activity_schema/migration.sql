-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('FOOD', 'SHOPPING', 'UTILITIES', 'ETC');

-- AlterTable
ALTER TABLE "expenses" DROP CONSTRAINT IF EXISTS "expenses_category_id_fkey";
ALTER TABLE "expenses" DROP COLUMN IF EXISTS "category_id";
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "category" "ExpenseCategory" NOT NULL DEFAULT 'ETC';
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "memo" VARCHAR(255);

-- DropTable
DROP TABLE IF EXISTS "expense_categories";