-- Cover foreign keys that are not the leading column of an existing index.
create index if not exists tcs_sessions_user_id_idx
  on public.tcs_sessions (user_id);
create index if not exists tcs_rooms_host_user_id_idx
  on public.tcs_rooms (host_user_id);
create index if not exists tcs_players_user_id_idx
  on public.tcs_players (user_id);
create index if not exists tcs_night_actions_player_id_idx
  on public.tcs_night_actions (player_id);
create index if not exists tcs_votes_voter_player_id_idx
  on public.tcs_votes (voter_player_id);
create index if not exists tcs_votes_target_player_id_idx
  on public.tcs_votes (target_player_id);
create index if not exists tcs_private_messages_room_id_idx
  on public.tcs_private_messages (room_id);
