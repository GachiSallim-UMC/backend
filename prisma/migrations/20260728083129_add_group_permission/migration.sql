-- CreateTable
CREATE TABLE "group_permissions" (
    "group_id" BIGINT NOT NULL,
    "allow_chore_registration" BOOLEAN NOT NULL DEFAULT true,
    "allow_settlement_registration" BOOLEAN NOT NULL DEFAULT true,
    "allow_item_status_change" BOOLEAN NOT NULL DEFAULT true,
    "auto_approve_new_members" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "group_permissions_pkey" PRIMARY KEY ("group_id")
);

-- AddForeignKey
ALTER TABLE "group_permissions" ADD CONSTRAINT "group_permissions_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: existing groups get a default permission row
INSERT INTO "group_permissions" ("group_id", "updated_at")
SELECT "id", CURRENT_TIMESTAMP FROM "groups";
