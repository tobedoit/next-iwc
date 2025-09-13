// src/lib/drizzle/schema.ts
import { pgTable, uuid, text, timestamp, integer, pgEnum, date, uniqueIndex, boolean as bool } from "drizzle-orm/pg-core"

// --- Enums ---
export const dealStage = pgEnum("deal_stage", ["lead","consulting","proposal","signed","lost"]);
export const apptKind = pgEnum("appt_kind", ["visit","phone","check"]);
export const leadSource = pgEnum("lead_source", ["homepage","wedit","kakao","naver_talk","naver_reserve","powerlink","intro","cafe","manual","instagram","referral","etc"]);

// --- Table ---
export const orgs = pgTable("orgs", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const users = pgTable("users", {
  // Supabase auth.uid와 동일하게 사용
  id: uuid("id").primaryKey(),
  orgId: uuid("org_id").references(() => orgs.id, { onDelete: "cascade" }).notNull(),
  name: text("name"),
  role: text("role").default("staff").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const customers = pgTable("customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").references(() => orgs.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  addr1: text("addr1"),
  addr2: text("addr2"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => ({
    // 같은 지점에서 동일번호 중복 등록방지
    u_org_phone: uniqueIndex("u_customers_org_phone").on(t.orgId, t.phone),
  })
);

export const deals = pgTable("deals", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").references(() => orgs.id, { onDelete: "cascade" }).notNull(),
  customerId: uuid("customer_id").references(() => customers.id, { onDelete: "cascade" }).notNull(),
  plannerId: uuid("planner_id").references(() => users.id),
  stage: dealStage("stage").default("signed").notNull(),
  amount: integer("amount").default(0), // 총 계약금액
  contractDate: date("contract_date"),
  memo: text("memo"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const appointments = pgTable("appointments", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").references(() => orgs.id, { onDelete: "cascade" }).notNull(),
  customerId: uuid("customer_id").references(() => customers.id, { onDelete: "cascade" }),
  staffId: uuid("staff_id").references(() => users.id),
  kind: apptKind("kind").default("visit").notNull(), // visit/phone/check
  startAt: timestamp("start_at", { withTimezone: true }).notNull(),
  endAt: timestamp("end_at", { withTimezone: true }).notNull(),
  status: text("status").default("scheduled"), // scheduled/done/canceled
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").references(() => orgs.id, { onDelete: "cascade" }).notNull(),
    // 신랑/신부 기본정보
    brideName: text("bride_name").notNull(),
    groomName: text("groom_name").notNull(),
    bridePhone: text("bride_phone"),
    groomPhone: text("groom_phone"),
    brideEmail: text("bride_email"),
    groomEmail: text("groom_email"),

    address1: text("addr1"),
    address2: text("addr2"),

    // 관심분야: ["웨딩홀","촬영","드레스","헤어","메이크업","허니문","혼수"]
    interests: text("interests").array(),
    weddingPlannedOn: date("wedding_planned_on"),
    expectedVenue: text("expected_venue"),
    memo: text("memo"),
    source: text("source").default("etc").notNull(),
    visited: bool("visited").default(false).notNull(),
    consent: bool("consent").default(false).notNull(),
    consentAt: timestamp("consent_at", { withTimezone: true }),
    customerId: uuid("customer_id").references(() => customers.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    // 전화 중복을 느슨하게 방지 (null 허용, org 범위)
    u_org_bride: uniqueIndex("u_leads_org_bride_phone").on(t.orgId, t.bridePhone),
    u_org_groom: uniqueIndex("u_leads_org_groom_phone").on(t.orgId, t.groomPhone),
  })
);
