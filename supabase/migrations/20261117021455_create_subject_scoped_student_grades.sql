begin;

create table if not exists public.student_subject_grades (
    student_id bigint not null references public.users(id) on delete cascade,
    subject text not null check (length(btrim(subject)) > 0),
    nota1 numeric(7,2),
    nota2 numeric(7,2),
    nota3 numeric(7,2),
    nota4 numeric(7,2),
    updated_by uuid references public.teachers(id) on delete set null,
    updated_at timestamptz not null default now(),
    primary key (student_id, subject)
);

create index if not exists student_subject_grades_subject_student_idx
    on public.student_subject_grades (subject, student_id);

alter table public.student_subject_grades enable row level security;

revoke all on table public.student_subject_grades from public, anon, authenticated;
grant select, insert, update on table public.student_subject_grades to authenticated;

drop policy if exists "Teachers read grades for assigned subjects" on public.student_subject_grades;
create policy "Teachers read grades for assigned subjects"
    on public.student_subject_grades
    for select
    to authenticated
    using (
        exists (
            select 1
            from public.teachers as teacher
            where teacher.id = (select auth.uid())
              and student_subject_grades.subject = any(teacher.subjects)
        )
    );

drop policy if exists "Teachers insert grades for assigned subjects" on public.student_subject_grades;
create policy "Teachers insert grades for assigned subjects"
    on public.student_subject_grades
    for insert
    to authenticated
    with check (
        exists (
            select 1
            from public.teachers as teacher
            where teacher.id = (select auth.uid())
              and student_subject_grades.subject = any(teacher.subjects)
        )
    );

drop policy if exists "Teachers update grades for assigned subjects" on public.student_subject_grades;
create policy "Teachers update grades for assigned subjects"
    on public.student_subject_grades
    for update
    to authenticated
    using (
        exists (
            select 1
            from public.teachers as teacher
            where teacher.id = (select auth.uid())
              and student_subject_grades.subject = any(teacher.subjects)
        )
    )
    with check (
        exists (
            select 1
            from public.teachers as teacher
            where teacher.id = (select auth.uid())
              and student_subject_grades.subject = any(teacher.subjects)
        )
    );

create or replace function public.set_student_subject_grade_audit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $set_student_subject_grade_audit$
declare
    v_actor uuid;
begin
    v_actor := (select auth.uid());
    new.updated_at := pg_catalog.now();
    if v_actor is not null then
        new.updated_by := v_actor;
    end if;
    return new;
end;
$set_student_subject_grade_audit$;

revoke all on function public.set_student_subject_grade_audit() from public, anon, authenticated;
drop trigger if exists set_student_subject_grade_audit on public.student_subject_grades;
create trigger set_student_subject_grade_audit
    before insert or update on public.student_subject_grades
    for each row execute function public.set_student_subject_grade_audit();

-- Carry forward the old fourth-bimester grades into the only existing teacher subject.
-- The old grades are kept under Inglês because the current primary EduPlan account
-- is registered exclusively for this subject.
insert into public.student_subject_grades (
    student_id, subject, nota4, updated_by
)
select
    student.id,
    'Inglês',
    nullif(btrim(student.nota4), '')::numeric,
    teacher.id
from public.users as student
cross join lateral (
    select id
    from public.teachers
    where is_primary = true
      and 'Inglês' = any(subjects)
    order by created_at
    limit 1
) as teacher
where student.nota4 is not null
  and btrim(student.nota4) <> ''
on conflict (student_id, subject) do update
set nota4 = excluded.nota4,
    updated_by = excluded.updated_by,
    updated_at = pg_catalog.now();

-- Notes are now stored by student and subject in student_subject_grades.
alter table public.users
    drop column if exists auth,
    drop column if exists nota1,
    drop column if exists nota2,
    drop column if exists nota3,
    drop column if exists nota4;

commit;
