-- CreateEnum
CREATE TYPE "ResidenceType" AS ENUM ('ROOMMATE', 'SHARE', 'BOARDING', 'FAMILY', 'ETC');

-- AlterTable
ALTER TABLE "groups" ADD COLUMN     "residence_type" "ResidenceType";
