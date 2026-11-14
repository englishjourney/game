-- Keep the legacy ownerless schedule row and create a separate row
-- for the existing primary teacher. The two rows are independent afterwards.
do $schedule_split$
declare
    v_owner uuid := 'bcbaffcb-6dd0-4d7f-b5ef-fbec615d806a';
    v_legacy public.schedule%rowtype;
begin
    -- This migration is safe to re-run: if an ownerless legacy row already
    -- exists, do not split or duplicate the teacher row again.
    if not exists (select 1 from public.schedule where owner is null) then
        select *
          into v_legacy
          from public.schedule
         where owner = v_owner
         order by id
         limit 1
         for update;

        if found then
            update public.schedule
               set owner = null
             where id = v_legacy.id
               and owner = v_owner;

            insert into public.schedule (
                seg_mat, seg_ves,
                ter_mat, ter_ves,
                qua_mat, qua_ves,
                qui_mat, qui_ves,
                sex_mat, sex_ves,
                owner
            )
            values (
                v_legacy.seg_mat, v_legacy.seg_ves,
                v_legacy.ter_mat, v_legacy.ter_ves,
                v_legacy.qua_mat, v_legacy.qua_ves,
                v_legacy.qui_mat, v_legacy.qui_ves,
                v_legacy.sex_mat, v_legacy.sex_ves,
                v_owner
            );
        end if;
    end if;
end;
$schedule_split$;

-- A future first teacher signup must not take ownership of the legacy
-- schedule row. The original planner/tasks adoption behavior is unchanged.
create or replace function public.create_teacher_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $create_teacher_from_auth_user$
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
      from pg_catalog.jsonb_array_elements_text(v_subjects_json) as item(subject_value);

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

    if v_is_primary and not ('Inglês' = any(v_subjects)) then
        raise exception 'A primeira conta do EduPlan deve ser do professor de Inglês.';
    end if;

    insert into public.teachers (id, email, display_name, avatar_key, subjects, is_primary)
    values (new.id, lower(new.email), v_display_name, v_avatar_key, v_subjects, v_is_primary);

    if v_is_primary then
        update public.planner set owner = new.id where owner is null;
        update public.tasks set owner = new.id where owner is null;
    end if;

    return new;
end;
$create_teacher_from_auth_user$;

revoke all on function public.create_teacher_from_auth_user() from public, anon, authenticated;
