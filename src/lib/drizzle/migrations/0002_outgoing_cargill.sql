-- 모든 테이블 RLS ON
alter table orgs enable row level security;
alter table users enable row level security;
alter table customers enable row level security;
alter table deals enable row level security;
alter table appointments enable row level security;
alter table leads enable row level security;

-- orgs/users는 관리용으로 최소 권한만
create policy "orgs_read" on orgs for select using (true);
create policy "users_read_own_org" on users for select
    using (org_id = ((select auth.jwt())->>'org_id')::uuid);
create policy "users_insert_own_org" on users for insert
    with check (org_id = ((select auth.jwt())->>'org_id')::uuid);

-- 공통: 같은 org만 접근
create policy "customers_read_org" on customers for select using (org_id = ((select auth.jwt())->>'org_id')::uuid);
create policy "customers_insert_org" on customers for insert with check (org_id = ((select auth.jwt())->>'org_id')::uuid);
create policy "customers_update_mgr" on customers for update
    using (org_id = ((select auth.jwt())->>'org_id')::uuid and ((select auth.jwt())->>'role') in ('admin', 'manager'));

create policy "deals_read_org" on deals for select using (org_id = ((select auth.jwt())->>'org_id')::uuid);
create policy "deals_insert_org" on deals for insert with check (org_id = ((select auth.jwt())->>'org_id')::uuid);
create policy "deals_update_mgr" on deals for update
    using (org_id = ((select auth.jwt())->>'org_id')::uuid and ((select auth.jwt())->>'role') in ('admin', 'manager'));

create policy "apts_read_org" on appointments for select using (org_id = ((select auth.jwt())->>'org_id')::uuid);
create policy "apts_write_org" on appointments for all
    using (org_id = ((select auth.jwt())->>'org_id')::uuid)
    with check (org_id = ((select auth.jwt())->>'org_id')::uuid);

create policy "leads_read_org" on leads for select using (org_id = ((select auth.jwt())->>'org_id')::uuid);
create policy "leads_insert_org" on leads for insert with check (org_id = ((select auth.jwt())->>'org_id')::uuid);
create policy "leads_update_mgr" on leads for update
    using (org_id = ((select auth.jwt())->>'org_id')::uuid and ((select auth.jwt())->>'role') in ('admin', 'manager'));
