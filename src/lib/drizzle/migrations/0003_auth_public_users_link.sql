-- Link public.users.id ↔ auth.users.id with FK (cascade) and sync triggers
-- Requirements: public.users.id = auth.users.id, FK on delete cascade,
--               signup/update triggers, initial backfill handled separately.

-- 1) Add FK from public.users(id) → auth.users(id) with ON DELETE CASCADE (idempotent)
do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints c
    where c.constraint_schema = 'public'
      and c.table_name = 'users'
      and c.constraint_name = 'users_id_auth_users_id_fk'
  ) then
    alter table public.users
      add constraint users_id_auth_users_id_fk
      foreign key (id) references auth.users(id) on delete cascade;
  end if;
end$$;

-- Ensure default org exists (idempotent)
insert into public.orgs (id, name)
values ('9b4944e1-5f14-424b-b7ab-c89e3f3c17c6', 'Default')
on conflict (id) do nothing;

create or replace function public.sync_user_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org  uuid;
  v_name text;
  v_role text;
begin
  -- Use raw_user_meta_data and default to the given org when missing
  v_org  := coalesce((new.raw_user_meta_data->>'org_id')::uuid,
                     '9b4944e1-5f14-424b-b7ab-c89e3f3c17c6'::uuid);
  v_name := coalesce(new.raw_user_meta_data->>'name', new.email);
  v_role := coalesce(new.raw_user_meta_data->>'role', 'staff');

  insert into public.users (id, org_id, name, role)
  values (new.id, v_org, v_name, v_role)
  on conflict (id) do update
    set org_id = coalesce(excluded.org_id, public.users.org_id),
        name   = excluded.name,
        role   = coalesce(excluded.role, public.users.role);
  return new;
end$$;

-- 3) Create trigger on auth.users for INSERT/UPDATE (idempotent)
do $$
begin
  if exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'auth' and c.relname = 'users' and t.tgname = 'tr_sync_user_from_auth'
  ) then
    drop trigger tr_sync_user_from_auth on auth.users;
  end if;

  create trigger tr_sync_user_from_auth
  after insert or update on auth.users
  for each row execute function public.sync_user_from_auth();
end$$;

-- Note: Deletion is handled by FK ON DELETE CASCADE; no delete trigger required.
