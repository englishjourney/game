-- Velocipastor arcade leaderboard.
-- These scores are independent from EnglishJourney missions and student score totals.
create table if not exists public.velocipastor_scores (
  id bigint generated always as identity primary key,
  player_name text not null check (char_length(btrim(player_name)) between 1 and 24),
  score integer not null check (score > 0 and score <= 20000000),
  duration_seconds integer not null check (duration_seconds >= 0 and duration_seconds <= 86400),
  created_at timestamptz not null default now()
);

create index if not exists velocipastor_scores_rank_idx
  on public.velocipastor_scores (score desc, duration_seconds desc, created_at asc);

alter table public.velocipastor_scores enable row level security;

grant select, insert on table public.velocipastor_scores to anon, authenticated;
grant usage, select on sequence public.velocipastor_scores_id_seq to anon, authenticated;

drop policy if exists "Velocipastor scores are public to read" on public.velocipastor_scores;
create policy "Velocipastor scores are public to read"
  on public.velocipastor_scores
  for select
  to anon, authenticated
  using (score > 0);

drop policy if exists "Players can submit positive Velocipastor scores" on public.velocipastor_scores;
create policy "Players can submit positive Velocipastor scores"
  on public.velocipastor_scores
  for insert
  to anon, authenticated
  with check (
    score > 0
    and score <= 20000000
    and duration_seconds between 0 and 86400
    and char_length(btrim(player_name)) between 1 and 24
  );