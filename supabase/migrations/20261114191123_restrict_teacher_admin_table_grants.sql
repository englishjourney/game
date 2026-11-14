-- Keep only the table privileges required by the teacher admin.
-- RLS filters rows, but it does not protect TRUNCATE, REFERENCES or TRIGGER.
revoke all privileges on table public.schedule, public.planner, public.tasks
    from anon, authenticated;
grant select, insert, update, delete on table public.schedule, public.planner, public.tasks
    to authenticated;

-- Missions and flashcards remain readable by student clients. Only authenticated
-- primary-teacher management is permitted by the table's RLS policies.
revoke all privileges on table public.missions, public.flashcards
    from anon, authenticated;
grant select on table public.missions, public.flashcards to anon;
grant select, insert, update, delete on table public.missions, public.flashcards
    to authenticated;
