ALTER TABLE public.reminders
  ADD COLUMN IF NOT EXISTS owner uuid;

UPDATE public.reminders
SET owner = 'bcbaffcb-6dd0-4d7f-b5ef-fbec615d806a'::uuid
WHERE owner IS NULL;

ALTER TABLE public.reminders
  ALTER COLUMN owner SET DEFAULT auth.uid();

ALTER TABLE public.reminders
  ALTER COLUMN owner SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'reminders_owner_fkey'
      AND conrelid = 'public.reminders'::regclass
  ) THEN
    ALTER TABLE public.reminders
      ADD CONSTRAINT reminders_owner_fkey
      FOREIGN KEY (owner) REFERENCES public.teachers(id);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS reminders_owner_date_idx
  ON public.reminders (owner, date);

ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permission for all" ON public.reminders;
DROP POLICY IF EXISTS "Teachers manage own reminders" ON public.reminders;

CREATE POLICY "Teachers manage own reminders"
ON public.reminders
FOR ALL
TO authenticated
USING ((SELECT auth.uid()) = owner)
WITH CHECK ((SELECT auth.uid()) = owner);
