select
  (select count(*) from auth.users) as auth_count,
  (select count(*) from public.users) as public_count,
  (select count(*) from public.users u left join auth.users a on a.id = u.id where a.id is null) as public_orphans,
  (select count(*) from auth.users a left join public.users u on u.id = a.id where u.id is null) as auth_missing_public;

