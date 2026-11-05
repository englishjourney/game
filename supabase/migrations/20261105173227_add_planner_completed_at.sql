ALTER TABLE public.planner
ADD COLUMN IF NOT EXISTS completed_at timestamptz;
