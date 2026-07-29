-- Backfill: regenerate invite codes as 6-char [A-HJ-NP-Z2-9] for groups whose
-- invite_code is missing (never generated) or still the old 8-char format.
DO $$
DECLARE
  charset varchar := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  group_record RECORD;
  candidate varchar(6);
  attempt integer;
  char_index integer;
  success boolean;
BEGIN
  FOR group_record IN
    SELECT id FROM "groups"
    WHERE "is_deleted" = false
      AND ("invite_code" IS NULL OR length("invite_code") <> 6)
  LOOP
    success := false;

    FOR attempt IN 1..5 LOOP
      candidate := '';

      FOR char_index IN 1..6 LOOP
        candidate := candidate || substr(charset, (floor(random() * length(charset)) + 1)::int, 1);
      END LOOP;

      BEGIN
        UPDATE "groups"
        SET "invite_code" = candidate,
            "invite_expired_at" = CURRENT_TIMESTAMP + INTERVAL '7 days'
        WHERE "id" = group_record.id;

        success := true;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        CONTINUE;
      END;
    END LOOP;

    IF NOT success THEN
      RAISE EXCEPTION 'Failed to generate a unique invite code for group %', group_record.id;
    END IF;
  END LOOP;
END $$;
