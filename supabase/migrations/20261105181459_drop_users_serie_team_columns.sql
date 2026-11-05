-- Student profiles now store the combined series and class in users.grade.
-- planner.serie/team and tasks.serie/team are separate scheduling fields and remain unchanged.
ALTER TABLE public.users
  DROP COLUMN serie,
  DROP COLUMN team;
