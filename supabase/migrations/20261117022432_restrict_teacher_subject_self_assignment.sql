-- Subject assignments control which student grades a teacher can read or update.
-- Teachers may edit their own profile details but cannot expand their own subject scope.
revoke update (subjects) on table public.teachers from authenticated;
