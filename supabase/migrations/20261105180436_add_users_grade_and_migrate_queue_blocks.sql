-- Add the consolidated class identifier to student profiles.
-- Keep the source columns temporarily while application consumers are migrated.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS grade text;

UPDATE public.users
SET grade = CASE
  WHEN NULLIF(BTRIM(serie), '') IS NULL
   AND NULLIF(BTRIM(team), '') IS NULL
    THEN NULL
  ELSE COALESCE(NULLIF(BTRIM(serie), ''), '')
       || UPPER(COALESCE(NULLIF(BTRIM(team), ''), ''))
END;

-- Keep existing virtual-queue blocks active under the consolidated class key.
UPDATE public.queue AS q
SET name = 'BLOCK:' || u.grade
FROM public.users AS u
WHERE q.name = 'BLOCK:' || u.serie || ' - ' || u.team
  AND u.grade IS NOT NULL;

DO $$
DECLARE
  invalid_rows integer;
BEGIN
  SELECT COUNT(*) INTO invalid_rows
  FROM public.users
  WHERE grade IS DISTINCT FROM CASE
    WHEN NULLIF(BTRIM(serie), '') IS NULL
     AND NULLIF(BTRIM(team), '') IS NULL
      THEN NULL
    ELSE COALESCE(NULLIF(BTRIM(serie), ''), '')
         || UPPER(COALESCE(NULLIF(BTRIM(team), ''), ''))
  END;

  IF invalid_rows <> 0 THEN
    RAISE EXCEPTION 'Grade migration validation failed for % user rows', invalid_rows;
  END IF;
END $$;
