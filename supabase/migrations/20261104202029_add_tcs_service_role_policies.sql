-- Explicitly scope server-side access for the game tables.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'tcs_sessions','tcs_rooms','tcs_players','tcs_night_actions',
    'tcs_votes','tcs_news','tcs_private_messages'
  ]
  loop
    execute format(
      'create policy %I on public.%I for all to service_role using (true) with check (true)',
      table_name || '_server_only',
      table_name
    );
  end loop;
end $$;
