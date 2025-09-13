-- === 성능 인덱스(있으면 생략됨) ===
create index if not exists idx_appt_org      on appointments (org_id);
create index if not exists idx_appt_customer on appointments (customer_id);
create index if not exists idx_appt_staff    on appointments (staff_id);

create index if not exists idx_customers_org on customers (org_id);

create index if not exists idx_deals_org      on deals (org_id);
create index if not exists idx_deals_customer on deals (customer_id);
create index if not exists idx_deals_planner  on deals (planner_id);

create index if not exists idx_leads_org      on leads (org_id);
create index if not exists idx_leads_customer on leads (customer_id);

-- === 일정 무결성: 종료 > 시작 ===
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public' and table_name = 'appointments'
      and constraint_name = 'appt_time_valid'
  ) then
    alter table appointments
      add constraint appt_time_valid check (end_at > start_at);
  end if;
end$$;

-- === 직원/플래너 삭제 시 참조를 null 로 (이미 no action 이면 교체) ===
do $$
begin
  -- appointments.staff_id FK 재정의
  if exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public' and table_name = 'appointments'
      and constraint_name = 'appointments_staff_id_users_id_fk'
  ) then
    alter table appointments drop constraint appointments_staff_id_users_id_fk;
  end if;
  alter table appointments
    add constraint appointments_staff_id_users_id_fk
    foreign key (staff_id) references public.users(id) on delete set null;

  -- deals.planner_id FK 재정의
  if exists (
    select 1 from information_schema.table_constraints
    where table_schema = 'public' and table_name = 'deals'
      and constraint_name = 'deals_planner_id_users_id_fk'
  ) then
    alter table deals drop constraint deals_planner_id_users_id_fk;
  end if;
  alter table deals
    add constraint deals_planner_id_users_id_fk
    foreign key (planner_id) references public.users(id) on delete set null;
end$$;

-- === (선택) deals.stage 기본값 수정: signed → lead ===
-- alter table deals alter column stage set default 'lead'::deal_stage;

-- === (선택) appointments.status 를 enum 으로 강제하고 싶다면 ===
-- 1) 타입 생성
-- do $$
-- begin
--   if not exists (select 1 from pg_type t join pg_namespace n on n.oid=t.typnamespace
--                  where n.nspname='public' and t.typname='appt_status') then
--     create type appt_status as enum ('scheduled','done','canceled');
--   end if;
-- end$$;
-- 2) 컬럼 타입 변경 (기존 값이 위 셋 외면 실패하니 먼저 데이터 정리)
-- alter table appointments
--   alter column status type appt_status using status::appt_status;
-- 3) 기본값 지정
-- alter table appointments alter column status set default 'scheduled'::appt_status;
