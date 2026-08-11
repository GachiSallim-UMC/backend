-- CreateEnum
CREATE TYPE "Bank" AS ENUM ('KB', 'SHINHAN', 'WOORI', 'HANA', 'NH', 'IBK', 'KDB', 'SC', 'CITI', 'KAKAOBANK', 'TOSSBANK', 'SUHYUP', 'POST', 'SAEMAUL', 'SINHYUP', 'DGB', 'BNK');

-- CreateTable
CREATE TABLE "user_bank_accounts" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "bank_name" "Bank" NOT NULL,
    "account_number" VARCHAR(30) NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_bank_accounts_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "user_bank_accounts" ADD CONSTRAINT "user_bank_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
