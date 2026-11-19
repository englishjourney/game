ALTER TABLE public.reminders
  ADD COLUMN IF NOT EXISTS task_id bigint,
  ADD COLUMN IF NOT EXISTS notification_type text,
  ADD COLUMN IF NOT EXISTS notified_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reminders_task_id_fkey'
      AND conrelid = 'public.reminders'::regclass
  ) THEN
    ALTER TABLE public.reminders
      ADD CONSTRAINT reminders_task_id_fkey
      FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'reminders_task_notification_type_check'
      AND conrelid = 'public.reminders'::regclass
  ) THEN
    ALTER TABLE public.reminders
      ADD CONSTRAINT reminders_task_notification_type_check
      CHECK (
        (task_id IS NULL AND notification_type IS NULL)
        OR
        (task_id IS NOT NULL AND notification_type IN ('day_before', 'deadline_day'))
      );
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS reminders_task_notification_unique
  ON public.reminders (task_id, notification_type);

CREATE INDEX IF NOT EXISTS reminders_owner_unnotified_schedule_idx
  ON public.reminders (owner, date, time)
  WHERE task_id IS NOT NULL AND notified_at IS NULL;

CREATE OR REPLACE FUNCTION public.sync_task_deadline_reminders()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  local_deadline timestamp without time zone;
  local_now timestamp without time zone;
  reminder_at timestamp without time zone;
BEGIN
  IF NEW.owner IS NULL THEN
    DELETE FROM public.reminders WHERE task_id = NEW.id;
    RETURN NEW;
  END IF;

  DELETE FROM public.reminders WHERE task_id = NEW.id;

  local_deadline := NEW.deadline AT TIME ZONE 'America/Fortaleza';
  local_now := now() AT TIME ZONE 'America/Fortaleza';

  reminder_at := local_deadline - interval '1 day';
  IF reminder_at >= local_now THEN
    INSERT INTO public.reminders (
      owner, task_id, notification_type, "remindMeTo", date, time
    )
    VALUES (
      NEW.owner, NEW.id, 'day_before',
      'Prazo amanhã: ' || NEW.title,
      reminder_at::date, reminder_at::time
    );
  END IF;

  reminder_at := local_deadline;
  IF reminder_at >= local_now THEN
    INSERT INTO public.reminders (
      owner, task_id, notification_type, "remindMeTo", date, time
    )
    VALUES (
      NEW.owner, NEW.id, 'deadline_day',
      'Prazo hoje: ' || NEW.title,
      reminder_at::date, reminder_at::time
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tasks_sync_deadline_reminders ON public.tasks;

CREATE TRIGGER tasks_sync_deadline_reminders
AFTER INSERT OR UPDATE OF title, deadline, owner
ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.sync_task_deadline_reminders();

UPDATE public.tasks
SET title = title
WHERE deadline >= now();
