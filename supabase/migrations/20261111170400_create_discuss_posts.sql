create table public.discuss_posts (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  title text not null check (length(btrim(title)) between 1 and 120),
  content text not null check (length(btrim(content)) between 1 and 6000),
  image_url text,
  author_username text not null check (length(btrim(author_username)) between 1 and 40),
  author_name text not null check (length(btrim(author_name)) between 1 and 100),
  avatar_url text,
  constraint discuss_posts_image_url_check
    check (image_url is null or image_url ~* '^https?://')
);

create index discuss_posts_created_at_idx
  on public.discuss_posts (created_at desc, id desc);

alter table public.discuss_posts enable row level security;

-- O navegador nunca acessa esta tabela diretamente. Apenas a Edge Function
-- autenticada pelo token de sessão pode ler e criar publicações.
revoke all on table public.discuss_posts from public, anon, authenticated;
grant select, insert on table public.discuss_posts to service_role;
grant usage, select on sequence public.discuss_posts_id_seq to service_role;
