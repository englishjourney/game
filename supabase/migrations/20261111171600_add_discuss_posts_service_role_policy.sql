create policy "discuss_posts_server_only"
on public.discuss_posts
for all
to service_role
using (true)
with check (true);
