-- Backfill public.users from auth.users
-- Default behavior: only rows where org_id exists in metadata

insert into public.users (id, org_id, name, role)
select u.id,
       coalesce((u.raw_user_meta_data->>'org_id')::uuid,
                '9b4944e1-5f14-424b-b7ab-c89e3f3c17c6'::uuid) as org_id,
       coalesce(u.raw_user_meta_data->>'name', u.email) as name,
       coalesce(u.raw_user_meta_data->>'role', 'staff') as role
from auth.users u
left join public.users p on p.id = u.id
where p.id is null;

-- Optional: previous strict variant (org_id required)
-- insert into public.users (id, org_id, name, role)
-- select u.id,
--        coalesce((u.user_metadata->>'org_id')::uuid,
--                 (u.raw_user_meta_data->>'org_id')::uuid) as org_id,
--        coalesce(u.user_metadata->>'name', u.raw_user_meta_data->>'name', u.email) as name,
--        coalesce(u.user_metadata->>'role', u.raw_user_meta_data->>'role', 'staff') as role
-- from auth.users u
-- left join public.users p on p.id = u.id
-- where p.id is null
--   and coalesce((u.user_metadata->>'org_id')::uuid, (u.raw_user_meta_data->>'org_id')::uuid) is not null;

-- Update existing names/roles from metadata
update public.users p
set name = coalesce(u.raw_user_meta_data->>'name', u.email),
    role = coalesce(u.raw_user_meta_data->>'role', p.role)
from auth.users u
where p.id = u.id;

-- Inspect users missing org_id in metadata
-- select id, email from auth.users
-- where (raw_user_meta_data->>'org_id') is null;
