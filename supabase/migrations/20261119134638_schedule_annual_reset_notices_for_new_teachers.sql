CREATE OR REPLACE FUNCTION private.schedule_new_teacher_annual_reset_notices()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_next_reset_year integer :=
    EXTRACT(YEAR FROM (pg_catalog.now() AT TIME ZONE 'America/Fortaleza'))::integer + 1;
BEGIN
  PERFORM private.schedule_annual_reset_notices(v_next_reset_year);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.schedule_new_teacher_annual_reset_notices() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS teachers_schedule_annual_reset_notices ON public.teachers;

CREATE TRIGGER teachers_schedule_annual_reset_notices
AFTER INSERT ON public.teachers
FOR EACH ROW
EXECUTE FUNCTION private.schedule_new_teacher_annual_reset_notices();
