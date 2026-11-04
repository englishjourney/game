-- The City Sleeps: private game state is accessible through the Edge Function only.
create table if not exists public.tcs_sessions (
  token_hash text primary key,
  user_id bigint not null references public.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists tcs_sessions_expiry_idx on public.tcs_sessions (expires_at);

create table if not exists public.tcs_rooms (
  id uuid primary key default gen_random_uuid(),
  code varchar(4) not null unique check (code ~ '^[A-Z0-9]{4}$'),
  host_user_id bigint not null references public.users(id) on delete cascade,
  status text not null default 'waiting' check (status in ('waiting','starting','active','finished','closed')),
  phase text not null default 'lobby' check (phase in ('lobby','role_reveal','night','resolving_night','dawn','discussion','voting','resolving_vote','vote_result','finished')),
  is_public boolean not null default true,
  password_hash text,
  password_salt text,
  round_no integer not null default 0 check (round_no >= 0),
  phase_started_at timestamptz,
  phase_ends_at timestamptz,
  winner_category text,
  winner_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((is_public and password_hash is null and password_salt is null) or
         (not is_public and password_hash is not null and password_salt is not null))
);
create index if not exists tcs_rooms_status_created_idx on public.tcs_rooms (status, created_at desc);

create table if not exists public.tcs_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.tcs_rooms(id) on delete cascade,
  user_id bigint not null references public.users(id) on delete cascade,
  username text not null,
  avatar_url text,
  role_key text,
  category text check (category is null or category in ('Villain','Neutral','Citizen')),
  is_alive boolean not null default true,
  is_puppet boolean not null default false,
  puppet_kills integer not null default 0 check (puppet_kills >= 0),
  role_ready boolean not null default false,
  phase_ready boolean not null default false,
  revealed_role boolean not null default false,
  witch_heals_left integer not null default 2 check (witch_heals_left between 0 and 2),
  witch_poisons_left integer not null default 2 check (witch_poisons_left between 0 and 2),
  oracle_uses_left integer not null default 2 check (oracle_uses_left between 0 and 2),
  angel_last_used_round integer,
  dwarf_last_used_round integer,
  shields integer not null default 0 check (shields >= 0),
  in_cult boolean not null default false,
  syren_seduction_count integer not null default 0 check (syren_seduction_count >= 0),
  last_house_id uuid,
  joined_at timestamptz not null default now(),
  unique (room_id, user_id),
  unique (room_id, id)
);
create index if not exists tcs_players_room_alive_idx on public.tcs_players (room_id, is_alive);

create table if not exists public.tcs_night_actions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.tcs_rooms(id) on delete cascade,
  player_id uuid not null references public.tcs_players(id) on delete cascade,
  round_no integer not null,
  action text not null,
  target_player_ids jsonb not null default '[]'::jsonb,
  mini_game text,
  created_at timestamptz not null default now(),
  unique (room_id, player_id, round_no)
);
create index if not exists tcs_night_actions_room_round_idx on public.tcs_night_actions (room_id, round_no);

create table if not exists public.tcs_votes (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.tcs_rooms(id) on delete cascade,
  round_no integer not null,
  voter_player_id uuid not null references public.tcs_players(id) on delete cascade,
  target_player_id uuid not null references public.tcs_players(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (room_id, round_no, voter_player_id),
  check (voter_player_id <> target_player_id)
);
create index if not exists tcs_votes_room_round_idx on public.tcs_votes (room_id, round_no);

create table if not exists public.tcs_news (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.tcs_rooms(id) on delete cascade,
  round_no integer not null default 0,
  event_type text not null default 'announcement',
  message text not null,
  created_at timestamptz not null default now()
);
create index if not exists tcs_news_room_round_idx on public.tcs_news (room_id, round_no, id);

create table if not exists public.tcs_private_messages (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.tcs_rooms(id) on delete cascade,
  player_id uuid not null references public.tcs_players(id) on delete cascade,
  message text not null,
  message_type text not null default 'info',
  created_at timestamptz not null default now()
);
create index if not exists tcs_private_messages_player_idx on public.tcs_private_messages (player_id, id desc);

alter table public.tcs_sessions enable row level security;
alter table public.tcs_rooms enable row level security;
alter table public.tcs_players enable row level security;
alter table public.tcs_night_actions enable row level security;
alter table public.tcs_votes enable row level security;
alter table public.tcs_news enable row level security;
alter table public.tcs_private_messages enable row level security;

revoke all on table public.tcs_sessions, public.tcs_rooms, public.tcs_players,
  public.tcs_night_actions, public.tcs_votes, public.tcs_news,
  public.tcs_private_messages from anon, authenticated, public;
grant all on table public.tcs_sessions, public.tcs_rooms, public.tcs_players,
  public.tcs_night_actions, public.tcs_votes, public.tcs_news,
  public.tcs_private_messages to service_role;
