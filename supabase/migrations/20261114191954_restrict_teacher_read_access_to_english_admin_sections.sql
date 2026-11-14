drop policy if exists "Authenticated users can read missions" on public.missions;
drop policy if exists "Primary teacher can read missions" on public.missions;
create policy "Primary teacher can read missions"
    on public.missions
    for select
    to authenticated
    using (
        exists (
            select 1 from public.teachers as teacher
            where teacher.id = (select auth.uid())
              and teacher.is_primary = true
        )
    );

drop policy if exists "Authenticated users can read flashcards" on public.flashcards;
drop policy if exists "Primary teacher can read flashcards" on public.flashcards;
create policy "Primary teacher can read flashcards"
    on public.flashcards
    for select
    to authenticated
    using (
        exists (
            select 1 from public.teachers as teacher
            where teacher.id = (select auth.uid())
              and teacher.is_primary = true
        )
    );