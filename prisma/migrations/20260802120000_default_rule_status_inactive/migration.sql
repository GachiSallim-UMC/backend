ALTER TABLE "rules" ALTER COLUMN "status" SET DEFAULT 'INACTIVE';

UPDATE "rules" AS r
SET "status" = CASE
  WHEN EXISTS (
    SELECT 1 FROM "group_members" AS gm
    WHERE gm."group_id" = r."group_id" AND gm."left_at" IS NULL
  ) AND NOT EXISTS (
    SELECT 1
    FROM "group_members" AS gm
    LEFT JOIN "rule_agreements" AS ra
      ON ra."rule_id" = r."id" AND ra."user_id" = gm."user_id"
    WHERE gm."group_id" = r."group_id"
      AND gm."left_at" IS NULL
      AND (ra."status" IS NULL OR ra."status" <> 'AGREED')
  ) THEN 'ACTIVE'::"RuleStatus"
  ELSE 'INACTIVE'::"RuleStatus"
END;
