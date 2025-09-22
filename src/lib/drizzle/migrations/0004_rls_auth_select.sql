-- Optimize RLS policies to avoid re-evaluating auth.jwt() per row
alter policy "users_read_own_org" on users
  using (org_id = ((select auth.jwt())->>'org_id')::uuid);

alter policy "users_insert_own_org" on users
  with check (org_id = ((select auth.jwt())->>'org_id')::uuid);

alter policy "customers_read_org" on customers
  using (org_id = ((select auth.jwt())->>'org_id')::uuid);

alter policy "customers_insert_org" on customers
  with check (org_id = ((select auth.jwt())->>'org_id')::uuid);

alter policy "customers_update_mgr" on customers
  using (org_id = ((select auth.jwt())->>'org_id')::uuid and ((select auth.jwt())->>'role') in ('admin', 'manager'));

alter policy "deals_read_org" on deals
  using (org_id = ((select auth.jwt())->>'org_id')::uuid);

alter policy "deals_insert_org" on deals
  with check (org_id = ((select auth.jwt())->>'org_id')::uuid);

alter policy "deals_update_mgr" on deals
  using (org_id = ((select auth.jwt())->>'org_id')::uuid and ((select auth.jwt())->>'role') in ('admin', 'manager'));

alter policy "apts_read_org" on appointments
  using (org_id = ((select auth.jwt())->>'org_id')::uuid);

alter policy "apts_write_org" on appointments
  using (org_id = ((select auth.jwt())->>'org_id')::uuid)
  with check (org_id = ((select auth.jwt())->>'org_id')::uuid);

alter policy "leads_read_org" on leads
  using (org_id = ((select auth.jwt())->>'org_id')::uuid);

alter policy "leads_insert_org" on leads
  with check (org_id = ((select auth.jwt())->>'org_id')::uuid);

alter policy "leads_update_mgr" on leads
  using (org_id = ((select auth.jwt())->>'org_id')::uuid and ((select auth.jwt())->>'role') in ('admin', 'manager'));
