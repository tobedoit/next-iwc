// src/app/api/leads/route.ts
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { withRLS } from "@/lib/drizzle/withRLS";
import { leads } from "@/lib/drizzle/schema";
import { and, or, eq, desc, asc, ilike, lt, gt, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";

type LeadInsert = typeof leads.$inferInsert;

type AuthSuccess = { user: User; role: string; orgId: string };
type AuthResult = { error: NextResponse } | AuthSuccess;

type LeadPayload = Partial<{
  brideName: string;
  groomName: string;
  bridePhone: string | null;
  groomPhone: string | null;
  brideEmail: string | null;
  groomEmail: string | null;
  address1: string | null;
  address2: string | null;
  interests: string[] | null;
  weddingPlannedOn: string | null;
  expectedVenue: string | null;
  memo: string | null;
  source: LeadSource;
  visited: boolean;
  consent: boolean;
  consentAt: Date | null;
  customerId: string | null;
}>;

const SOURCE_ENUM = [
  "homepage","wedit","kakao","naver_talk","naver_reserve","powerlink","intro","cafe","manual","instagram","referral","etc",
] as const;
type LeadSource = typeof SOURCE_ENUM[number];

function parseString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function parseNullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  return parseString(value);
}

function parseBoolean(value: unknown): boolean | undefined {
  if (value === true || value === false) return value;
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return undefined;
}

function parseDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return undefined;
}

function parseDateOnlyString(value: unknown): string | null | undefined {
  const parsed = parseDate(value);
  if (!parsed) return value === null ? null : undefined;
  return parsed.toISOString().slice(0, 10);
}

/** 공통: 인증 + org_id 파싱 */
async function getAuth(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return { error: NextResponse.json({ error: "Missing Authorization Bearer token" }, { status: 401 }) };
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    }
  );

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    return { error: NextResponse.json({ error: "Unauthorized", detail: error?.message }, { status: 401 }) };
  }
  const metadata = user.user_metadata as Record<string, unknown> | null | undefined;
  const role = typeof metadata?.role === "string" ? metadata.role : "guest";
  const orgId = typeof metadata?.org_id === "string" ? metadata.org_id : null;
  if (!orgId) {
    return { error: NextResponse.json({ error: "Missing org_id in user metadata" }, { status: 400 }) };
  }
  return { user, role, orgId };
}

/** 입력 바디를 Drizzle 컬럼(camelCase)로 매핑 */
function mapLeadInput(input: unknown): LeadPayload {
  if (!input || typeof input !== "object") return {};
  const raw = input as Record<string, unknown>;

  const rawSource = parseString(raw.source);
  const source = rawSource && (SOURCE_ENUM as readonly string[]).includes(rawSource)
    ? (rawSource as LeadSource)
    : undefined;

  let interests: string[] | null | undefined;
  const rawInterests = raw.interests;
  if (Array.isArray(rawInterests)) {
    interests = rawInterests.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  } else if (rawInterests === null) {
    interests = null;
  }

  return {
    brideName: parseString(raw.bride_name ?? raw.brideName),
    groomName: parseString(raw.groom_name ?? raw.groomName),
    bridePhone: parseNullableString(raw.bride_phone ?? raw.bridePhone) ?? null,
    groomPhone: parseNullableString(raw.groom_phone ?? raw.groomPhone) ?? null,
    brideEmail: parseNullableString(raw.bride_email ?? raw.brideEmail) ?? null,
    groomEmail: parseNullableString(raw.groom_email ?? raw.groomEmail) ?? null,
    address1: parseNullableString(raw.address1 ?? raw.addr1) ?? null,
    address2: parseNullableString(raw.address2 ?? raw.addr2) ?? null,
    interests: interests ?? undefined,
    weddingPlannedOn: parseDateOnlyString(raw.wedding_planned_on ?? raw.weddingPlannedOn) ?? null,
    expectedVenue: parseNullableString(raw.expected_venue ?? raw.expectedVenue) ?? null,
    memo: parseNullableString(raw.memo) ?? null,
    source,
    visited: parseBoolean(raw.visited) ?? false,
    consent: parseBoolean(raw.consent) ?? false,
    consentAt: parseDate(raw.consent_at ?? raw.consentAt) ?? null,
    customerId: parseNullableString(raw.customer_id ?? raw.customerId) ?? null,
  };
}

/** GET: 서버 필터/정렬/커서 페이지네이션 */
export async function GET(req: Request) {
  try {
    const auth = await getAuth(req);
    if ("error" in auth) return auth.error;
    const { user, role, orgId } = auth;

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const visitedStr = url.searchParams.get("visited");
    const consentStr = url.searchParams.get("consent");
    const after = url.searchParams.get("after");
    const sort = (url.searchParams.get("sort") ?? "created_at.desc").toLowerCase();
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 200);
    const sortDesc = sort.endsWith(".desc");

    // --- source 필터 ---
    const source = url.searchParams.get("source") || undefined;

    // where 조건
    const conds: SQL<unknown>[] = [eq(leads.orgId, orgId)];
    if (q) {
      const like = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
      const likeClause = or(
        ilike(leads.brideName, like),
        ilike(leads.groomName, like),
        ilike(leads.bridePhone, like),
        ilike(leads.groomPhone, like),
        ilike(leads.brideEmail, like),
        ilike(leads.groomEmail, like),
        ilike(leads.expectedVenue, like),
        ilike(leads.memo, like),
        ilike(sql`${leads.source}::text`, like),
      ) as SQL<unknown>;
      conds.push(likeClause);
    }
    if (source) conds.push(eq(leads.source, source as LeadSource));
    if (visitedStr === "true") conds.push(eq(leads.visited, true));
    else if (visitedStr === "false") conds.push(eq(leads.visited, false));
    if (consentStr === "true") conds.push(eq(leads.consent, true));
    else if (consentStr === "false") conds.push(eq(leads.consent, false));
    if (after) {
      const afterDate = new Date(after);
      if (!Number.isNaN(afterDate.getTime())) {
        conds.push(sortDesc ? lt(leads.createdAt, afterDate) : gt(leads.createdAt, afterDate));
      }
    }

    const orderExpr = sortDesc ? desc(leads.createdAt) : asc(leads.createdAt);

    const whereExpr = conds.length === 1 ? conds[0] : and(...conds);

    const rows = await withRLS(
      { sub: user.id, role, orgId },
      (tx) =>
        tx
          .select()
          .from(leads)
          .where(whereExpr)
          .orderBy(orderExpr)
          .limit(limit)
    );

    const last = rows.at(-1);
    const nextCursor =
      rows.length === limit && last?.createdAt
        ? (last.createdAt instanceof Date ? last.createdAt.toISOString() : String(last.createdAt))
        : null;

    return NextResponse.json({ ok: true, rows, nextCursor });
  } catch (error) {
    console.error("GET /api/leads error:", error);
    return NextResponse.json({ error: "Server error", detail: String(error) }, { status: 500 });
  }
}

/** POST: 새 리드 생성 */
export async function POST(req: Request) {
  try {
    const auth = await getAuth(req);
    if ("error" in auth) return auth.error;
    const { user, role, orgId } = auth;

    const body = await req.json();
    const data = mapLeadInput(body);

    if (!data.brideName || !data.groomName) {
      return NextResponse.json({ error: "bride_name, groom_name are required" }, { status: 400 });
    }

    const payload: LeadInsert = {
      orgId,
      brideName: data.brideName,
      groomName: data.groomName,
      bridePhone: data.bridePhone ?? null,
      groomPhone: data.groomPhone ?? null,
      brideEmail: data.brideEmail ?? null,
      groomEmail: data.groomEmail ?? null,
      address1: data.address1 ?? null,
      address2: data.address2 ?? null,
      interests: data.interests ?? null,
      weddingPlannedOn: data.weddingPlannedOn ?? null,
      expectedVenue: data.expectedVenue ?? null,
      memo: data.memo ?? null,
      source: data.source ?? "etc",
      visited: data.visited ?? false,
      consent: data.consent ?? false,
      consentAt: data.consentAt ?? null,
      customerId: data.customerId ?? null,
    };

    const [row] = await withRLS(
      { sub: user.id, role, orgId },
      (tx) => tx.insert(leads).values(payload).returning()
    );
    return NextResponse.json({ ok: true, row }, { status: 201 });
  } catch (error) {
    console.error("POST /api/leads error:", error);
    return NextResponse.json({ error: "Server error", detail: String(error) }, { status: 500 });
  }
}

/** PATCH: 부분 수정 */
export async function PATCH(req: Request) {
  try {
    const auth = await getAuth(req);
    if ("error" in auth) return auth.error;
    const { user, role, orgId } = auth;

    const body = await req.json();
    const raw = body as Record<string, unknown>;
    const id = raw.id ?? raw.lead_id;
    if (typeof id !== "string") return NextResponse.json({ error: "id is required" }, { status: 400 });

    const patchRaw = mapLeadInput(body);
    const patch: Partial<LeadInsert> = {};
    if (patchRaw.brideName !== undefined) patch.brideName = patchRaw.brideName;
    if (patchRaw.groomName !== undefined) patch.groomName = patchRaw.groomName;
    if (patchRaw.bridePhone !== undefined) patch.bridePhone = patchRaw.bridePhone;
    if (patchRaw.groomPhone !== undefined) patch.groomPhone = patchRaw.groomPhone;
    if (patchRaw.brideEmail !== undefined) patch.brideEmail = patchRaw.brideEmail;
    if (patchRaw.groomEmail !== undefined) patch.groomEmail = patchRaw.groomEmail;
    if (patchRaw.address1 !== undefined) patch.address1 = patchRaw.address1;
    if (patchRaw.address2 !== undefined) patch.address2 = patchRaw.address2;
    if (patchRaw.interests !== undefined) patch.interests = patchRaw.interests;
    if (patchRaw.weddingPlannedOn !== undefined) patch.weddingPlannedOn = patchRaw.weddingPlannedOn;
    if (patchRaw.expectedVenue !== undefined) patch.expectedVenue = patchRaw.expectedVenue;
    if (patchRaw.memo !== undefined) patch.memo = patchRaw.memo;
    if (patchRaw.source !== undefined) patch.source = patchRaw.source;
    if (patchRaw.visited !== undefined) patch.visited = patchRaw.visited;
    if (patchRaw.consent !== undefined) patch.consent = patchRaw.consent;
    if (patchRaw.consentAt !== undefined) patch.consentAt = patchRaw.consentAt;
    if (patchRaw.customerId !== undefined) patch.customerId = patchRaw.customerId;

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "no fields to update" }, { status: 400 });
    }

    const [row] = await withRLS(
      { sub: user.id, role, orgId },
      (tx) => tx.update(leads).set(patch).where(eq(leads.id, id)).returning()
    );
    return NextResponse.json({ ok: true, row }, { status: 200 });
  } catch (error) {
    console.error("PATCH /api/leads error:", error);
    return NextResponse.json({ error: "Server error", detail: String(error) }, { status: 500 });
  }
}

/** DELETE: 삭제 (?id=...) */
export async function DELETE(req: Request) {
  try {
    const auth = await getAuth(req);
    if ("error" in auth) return auth.error;
    const { user, role, orgId } = auth;

    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const [row] = await withRLS(
      { sub: user.id, role, orgId },
      (tx) => tx.delete(leads).where(eq(leads.id, id)).returning()
    );
    return NextResponse.json({ ok: true, row }, { status: 200 });
  } catch (error) {
    console.error("DELETE /api/leads error:", error);
    return NextResponse.json({ error: "Server error", detail: String(error) }, { status: 500 });
  }
}
