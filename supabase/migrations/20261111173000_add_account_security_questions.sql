create table public.account_security_answers (
  user_id bigint not null references public.users(id) on delete cascade,
  question_id smallint not null check (question_id between 1 and 4),
  answer_salt text not null,
  answer_hash text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, question_id)
);

create index account_security_answers_user_idx
  on public.account_security_answers (user_id);

alter table public.account_security_answers enable row level security;
revoke all on table public.account_security_answers from public, anon, authenticated;
grant select, insert, update, delete on table public.account_security_answers to service_role;

create policy account_security_answers_server_only
  on public.account_security_answers
  for all
  to service_role
  using (true)
  with check (true);

create table public.account_recovery_attempts (
  id bigint generated always as identity primary key,
  identifier_hash text not null,
  created_at timestamptz not null default now()
);

create index account_recovery_attempts_lookup_idx
  on public.account_recovery_attempts (identifier_hash, created_at desc);

alter table public.account_recovery_attempts enable row level security;
revoke all on table public.account_recovery_attempts from public, anon, authenticated;
grant select, insert, delete on table public.account_recovery_attempts to service_role;
grant usage, select on sequence public.account_recovery_attempts_id_seq to service_role;

create policy account_recovery_attempts_server_only
  on public.account_recovery_attempts
  for all
  to service_role
  using (true)
  with check (true);
