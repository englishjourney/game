-- Keep one personal-best row per display name, case-insensitively.
with ranked_scores as (
  select
    id,
    row_number() over (
      partition by lower(btrim(player_name))
      order by score desc, duration_seconds desc, created_at asc, id asc
    ) as position
  from public.velocipastor_scores
)
delete from public.velocipastor_scores as scores
using ranked_scores
where scores.id = ranked_scores.id
  and ranked_scores.position > 1;

alter table public.velocipastor_scores
  add column if not exists player_key text
  generated always as (lower(btrim(player_name))) stored;

create unique index if not exists velocipastor_scores_player_key_uidx
  on public.velocipastor_scores (player_key);

create or replace function public.save_velocipastor_record(
  p_player_name text,
  p_score integer,
  p_duration_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  normalized_name text := btrim(coalesce(p_player_name, ''));
  affected_rows integer;
begin
  if char_length(normalized_name) < 1 or char_length(normalized_name) > 24 then
    raise exception 'Player name must contain between 1 and 24 characters.';
  end if;

  if p_score is null or p_score < 1 or p_score > 20000000 then
    raise exception 'Score is outside the allowed range.';
  end if;

  if p_duration_seconds is null or p_duration_seconds < 0 or p_duration_seconds > 86400 then
    raise exception 'Duration is outside the allowed range.';
  end if;

  insert into public.velocipastor_scores (
    player_name,
    score,
    duration_seconds
  )
  values (
    normalized_name,
    p_score,
    p_duration_seconds
  )
  on conflict (player_key)
  do update set
    player_name = excluded.player_name,
    score = excluded.score,
    duration_seconds = excluded.duration_seconds,
    created_at = now()
  where excluded.score > public.velocipastor_scores.score
     or (
       excluded.score = public.velocipastor_scores.score
       and excluded.duration_seconds > public.velocipastor_scores.duration_seconds
     );

  get diagnostics affected_rows = row_count;
  return affected_rows > 0;
end;
$function$;

revoke all on function public.save_velocipastor_record(text, integer, integer) from public;
grant execute on function public.save_velocipastor_record(text, integer, integer) to anon, authenticated;
