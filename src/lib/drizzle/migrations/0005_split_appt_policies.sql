-- Split appointments policies to avoid multiple permissive SELECT policies
alter table appointments enable row level security;

-- Drop legacy policy covering all actions to avoid duplicate SELECT evaluation
drop policy if exists "apts_write_org" on appointments;

-- Enforce org scoping per action
create policy "apts_insert_org" on appointments for insert
  with check (org_id = ((select auth.jwt())->>'org_id')::uuid);

create policy "apts_update_org" on appointments for update
  using (org_id = ((select auth.jwt())->>'org_id')::uuid)
  with check (org_id = ((select auth.jwt())->>'org_id')::uuid);

create policy "apts_delete_org" on appointments for delete
  using (org_id = ((select auth.jwt())->>'org_id')::uuid);
