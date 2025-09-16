with latest as (
  select id, email, raw_user_meta_data, created_at
  from auth.users
  order by created_at desc
  limit 5
)
select
  a.id as auth_id,
  a.email,
  a.raw_user_meta_data,
  p.org_id,
  p.name,
  p.role,
  p.created_at as public_created_at
from latest a
left join public.users p on p.id = a.id
order by a.created_at desc;

