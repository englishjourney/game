-- Store each author's grade on forum posts and allow only the same grade to be listed by students.
alter table public.discuss_posts
    add column if not exists author_grade text;

update public.discuss_posts as post
set author_grade = upper(btrim(student.grade))
from public.users as student
where lower(btrim(student.username)) = lower(btrim(post.author_username))
  and post.author_grade is null
  and nullif(btrim(student.grade), '') is not null;

create index if not exists discuss_posts_author_grade_created_idx
    on public.discuss_posts (author_grade, created_at desc, id desc);

-- A task can target several student grades at once.
alter table public.tasks
    add column if not exists grades text[] not null default '{}'::text[];

-- Convert existing legacy serie + team assignments into the new grade array.
update public.tasks
set grades = array[upper(btrim(serie) || btrim(team))]
where coalesce(cardinality(grades), 0) = 0
  and nullif(btrim(serie), '') is not null
  and nullif(btrim(team), '') is not null;
