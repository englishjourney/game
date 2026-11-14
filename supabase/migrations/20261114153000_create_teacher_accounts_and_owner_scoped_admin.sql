-- Teacher accounts for the EduPlan admin panel.
-- The first account created through the verified gate becomes the primary English teacher
-- and adopts the legacy weekly schedule, planner records, and tasks.

create table if not exists public.admin_gate_config (
    singleton boolean primary key default true check (singleton = true),
    password_hash text not null,
    created_at timestamptz not null default now()
);

insert into public.admin_gate_config (singleton, password_hash)
select true, extensions.crypt(psswd, extensions.gen_salt('bf'))
from public.users
where username = 'micael.svg'
  and nullif(psswd, '') is not null
limit 1
on conflict (singleton) do nothing;

do $$
begin
    if not exists (select 1 from public.admin_gate_config where singleton = true) then
        raise exception 'Não foi possível configurar a senha geral: o registro administrativo legado não foi encontrado.';
    end if;
end;
$$;

create table if not exists public.admin_gate_tokens (
    token_hash text primary key,
    expires_at timestamptz not null,
    used_at timestamptz,
    created_at timestamptz not null default now()
);

alter table public.admin_gate_config enable row level security;
alter table public.admin_gate_tokens enable row level security;
revoke all on table public.admin_gate_config from public, anon, authenticated;
revoke all on table public.admin_gate_tokens from public, anon, authenticated;

create or replace function public.verify_admin_gate(p_password text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_token uuid;
begin
    if nullif(p_password, '') is null or not exists (
        select 1
        from public.admin_gate_config as config
        where config.singleton = true
          and config.password_hash = extensions.crypt(p_password, config.password_hash)
    ) then
        return null;
    end if;

    v_token := pg_catalog.gen_random_uuid();

    insert into public.admin_gate_tokens (token_hash, expires_at)
    values (
        pg_catalog.encode(extensions.digest(v_token::text, 'sha256'), 'hex'),
        now() + interval '15 minutes'
    );

    return v_token::text;
end;
$$;

revoke all on function public.verify_admin_gate(text) from public;
grant execute on function public.verify_admin_gate(text) to anon, authenticated;

create table if not exists public.teachers (
    id uuid primary key references auth.users(id) on delete cascade,
    email text not null unique,
    display_name text not null check (length(btrim(display_name)) between 2 and 100),
    avatar_key text not null default 'violet-book'
        check (avatar_key in (
            'violet-book',
            'blue-graduation',
            'teal-user',
            'orange-atom',
            'pink-palette',
            'indigo-globe'
        )),
    subjects text[] not null default '{}'::text[],
    is_primary boolean not null default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    check (cardinality(subjects) > 0)
);

alter table public.teachers enable row level security;
revoke all on table public.teachers from public, anon, authenticated;
grant select on table public.teachers to authenticated;
grant update (display_name, avatar_key, subjects) on table public.teachers to authenticated;

drop policy if exists "teachers_read_own_profile" on public.teachers;
create policy "teachers_read_own_profile"
    on public.teachers
    for select
    to authenticated
    using (id = (select auth.uid()));

drop policy if exists "teachers_update_own_profile" on public.teachers;
create policy "teachers_update_own_profile"
    on public.teachers
    for update
    to authenticated
    using (id = (select auth.uid()))
    with check (id = (select auth.uid()));

create or replace function public.create_teacher_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_gate_token text;
    v_subjects_json jsonb;
    v_subjects text[];
    v_avatar_key text;
    v_display_name text;
    v_is_primary boolean;
begin
    v_gate_token := coalesce(new.raw_user_meta_data ->> 'admin_gate_token', '');

    update public.admin_gate_tokens
       set used_at = now()
     where token_hash = pg_catalog.encode(extensions.digest(v_gate_token, 'sha256'), 'hex')
       and used_at is null
       and expires_at > now();

    if not found then
        raise exception 'A senha geral do painel precisa ser validada antes de criar uma conta.';
    end if;

    v_subjects_json := new.raw_user_meta_data -> 'subjects';
    if pg_catalog.jsonb_typeof(v_subjects_json) <> 'array' then
        raise exception 'Informe ao menos uma disciplina para o professor.';
    end if;

    select coalesce(array_agg(subject_value), array[]::text[])
      into v_subjects
      from pg_catalog.jsonb_array_elements_text(v_subjects_json) as subject_value;

    if cardinality(v_subjects) = 0 then
        raise exception 'Informe ao menos uma disciplina para o professor.';
    end if;

    v_display_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');
    if v_display_name is null then
        raise exception 'Informe o nome do professor.';
    end if;

    v_avatar_key := coalesce(new.raw_user_meta_data ->> 'avatar_key', 'violet-book');
    if v_avatar_key not in (
        'violet-book', 'blue-graduation', 'teal-user',
        'orange-atom', 'pink-palette', 'indigo-globe'
    ) then
        raise exception 'O avatar selecionado não é válido.';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('eduplan-primary-teacher'));
    select not exists (select 1 from public.teachers) into v_is_primary;

    insert into public.teachers (id, email, display_name, avatar_key, subjects, is_primary)
    values (new.id, lower(new.email), v_display_name, v_avatar_key, v_subjects, v_is_primary);

    if v_is_primary then
        update public.schedule set owner = new.id where owner is null;
        update public.planner set owner = new.id where owner is null;
        update public.tasks set owner = new.id where owner is null;
    end if;

    return new;
end;
$$;

drop trigger if exists on_auth_user_created_teacher on auth.users;
create trigger on_auth_user_created_teacher
    after insert on auth.users
    for each row execute function public.create_teacher_from_auth_user();

alter table public.schedule
    add column if not exists owner uuid references public.teachers(id) on delete set null;
alter table public.planner
    add column if not exists owner uuid references public.teachers(id) on delete set null;
alter table public.tasks
    add column if not exists owner uuid references public.teachers(id) on delete set null;

alter table public.schedule alter column owner set default auth.uid();
alter table public.planner alter column owner set default auth.uid();
alter table public.tasks alter column owner set default auth.uid();

create unique index if not exists schedule_owner_unique_idx on public.schedule (owner);
create index if not exists planner_owner_date_time_idx on public.planner (owner, date, time);
create index if not exists tasks_owner_deadline_idx on public.tasks (owner, deadline);

alter table public.schedule enable row level security;
alter table public.planner enable row level security;
alter table public.tasks enable row level security;

drop policy if exists "Provide all skills" on public.schedule;
drop policy if exists "Permission to dance" on public.planner;
drop policy if exists "Tasks access for app" on public.tasks;

create policy "Teachers manage own schedule"
    on public.schedule
    for all
    to authenticated
    using (owner = (select auth.uid()))
    with check (owner = (select auth.uid()));

create policy "Teachers manage own planner"
    on public.planner
    for all
    to authenticated
    using (owner = (select auth.uid()))
    with check (owner = (select auth.uid()));

create policy "Teachers manage own tasks"
    on public.tasks
    for all
    to authenticated
    using (owner = (select auth.uid()))
    with check (owner = (select auth.uid()));

grant select, insert, update, delete on public.schedule, public.planner, public.tasks to authenticated;

-- The student-facing games continue to read shared English missions and flashcards
-- with the anonymous client. Only the primary teacher can manage their contents.
drop policy if exists "Permissão para tudo" on public.missions;
drop policy if exists "Permission for all" on public.flashcards;

create policy "Students can read missions"
    on public.missions
    for select
    to anon
    using (true);

create policy "Authenticated users can read missions"
    on public.missions
    for select
    to authenticated
    using (true);

create policy "Primary teacher manages missions"
    on public.missions
    for all
    to authenticated
    using (
        exists (
            select 1 from public.teachers as teacher
            where teacher.id = (select auth.uid())
              and teacher.is_primary = true
        )
    )
    with check (
        exists (
            select 1 from public.teachers as teacher
            where teacher.id = (select auth.uid())
              and teacher.is_primary = true
        )
    );

create policy "Students can read flashcards"
    on public.flashcards
    for select
    to anon
    using (true);

create policy "Authenticated users can read flashcards"
    on public.flashcards
    for select
    to authenticated
    using (true);

create policy "Primary teacher manages flashcards"
    on public.flashcards
    for all
    to authenticated
    using (
        exists (
            select 1 from public.teachers as teacher
            where teacher.id = (select auth.uid())
              and teacher.is_primary = true
        )
    )
    with check (
        exists (
            select 1 from public.teachers as teacher
            where teacher.id = (select auth.uid())
              and teacher.is_primary = true
        )
    );

grant select on public.missions, public.flashcards to anon, authenticated;
grant insert, update, delete on public.missions, public.flashcards to authenticated;
