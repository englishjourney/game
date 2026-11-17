begin;

-- Troca os antigos ícones genéricos pelos avatares correspondentes às disciplinas.
alter table public.teachers
    drop constraint if exists teachers_avatar_key_check;

update public.teachers
set avatar_key = case
    when 'Inglês' = any(subjects) then 'english'
    when 'Português' = any(subjects) then 'portuguese'
    when 'Matemática' = any(subjects) then 'math'
    when 'Produção textual' = any(subjects) then 'text'
    when 'Ciências' = any(subjects) then 'science'
    when 'Biologia' = any(subjects) then 'biology'
    when 'Química' = any(subjects) then 'chemestry'
    when 'Física' = any(subjects) then 'physics'
    when 'História' = any(subjects) then 'history'
    when 'Geografia' = any(subjects) then 'geography'
    when 'Educação digital' = any(subjects) then 'digital'
    when 'Artes' = any(subjects) then 'art'
    when 'Filosofia' = any(subjects) then 'philosophy'
    when 'Sociologia' = any(subjects) then 'sociology'
    when 'Educação Física' = any(subjects) then 'physical'
    when 'Projeto de vida' = any(subjects) then 'project-life'
    else 'violet-book'
end;

alter table public.teachers
    add constraint teachers_avatar_key_subject_images_check
    check (avatar_key in (
        'english', 'portuguese', 'math', 'text', 'science', 'biology',
        'chemestry', 'physics', 'history', 'geography', 'digital', 'art',
        'philosophy', 'sociology', 'physical', 'project-life', 'violet-book'
    ));

-- O trigger de criação de contas também precisa aceitar as novas chaves de avatar.
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
        'english', 'portuguese', 'math', 'text', 'science', 'biology',
        'chemestry', 'physics', 'history', 'geography', 'digital', 'art',
        'philosophy', 'sociology', 'physical', 'project-life', 'violet-book'
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
        update public.schedule set owner = new.id where owner is null;
        update public.planner set owner = new.id where owner is null;
        update public.tasks set owner = new.id where owner is null;
    end if;

    return new;
end;
$create_teacher_from_auth_user$;

commit;
