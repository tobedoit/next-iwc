// src/app/api/leads/route.ts
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { withRLS } from "@/lib/drizzle/withRLS";
import { leads } from "@/lib/drizzle/schema";
import { and, or, eq, desc, asc, ilike, lt, gt, sql } from "drizzle-orm";
import { cookies } from "next/headers";

/** 공통: 인증 + org_id 파싱 */
async function getAuth(req: Request) {
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
  const role = (user.user_metadata as any)?.role ?? "guest";
  const org_id = (user.user_metadata as any)?.org_id ?? null;
  if (!org_id) {
    return { error: NextResponse.json({ error: "Missing org_id in user metadata" }, { status: 400 }) };
  }
  return { user, role, org_id };
}

/** 입력 바디를 Drizzle 컬럼(camelCase)로 매핑 */
function mapLeadInput(input: any) {
  return {
    brideName: input.bride_name ?? input.brideName,
    groomName: input.groom_name ?? input.groomName,
    bridePhone: input.bride_phone ?? input.bridePhone ?? null,
    groomPhone: input.groom_phone ?? input.groomPhone ?? null,
    brideEmail: input.bride_email ?? input.brideEmail ?? null,
    groomEmail: input.groom_email ?? input.groomEmail ?? null,
    addr1: input.addr1 ?? null,
    addr2: input.addr2 ?? null,
    interests: input.interests ?? null,
    weddingPlannedOn: input.wedding_planned_on ?? input.weddingPlannedOn ?? null,
    expectedVenue: input.expected_venue ?? input.expectedVenue ?? null,
    memo: input.memo ?? null,
    source: input.source ?? "etc",
    visited: input.visited ?? false,
    consent: input.consent ?? false,
    consentAt: input.consent_at ?? input.consentAt ?? null,
    customerId: input.customer_id ?? input.customerId ?? null,
  };
}

/** GET: 서버 필터/정렬/커서 페이지네이션 */
export async function GET(req: Request) {
  try {
    const auth = await getAuth(req);
    if ("error" in auth) return auth.error;
    const { user, role, org_id } = auth;

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
    const conds = [
      eq(leads.orgId, org_id),
      q
        ? or(
            ilike(leads.brideName, `%${q}%`),
            ilike(leads.groomName, `%${q}%`),
            ilike(leads.bridePhone, `%${q}%`),
            ilike(leads.groomPhone, `%${q}%`),
            ilike(leads.brideEmail, `%${q}%`),
            ilike(leads.groomEmail, `%${q}%`),
            ilike(leads.expectedVenue, `%${q}%`),
            ilike(leads.memo, `%${q}%`),
            // source는 DB에서 enum일 수 있어 ILIKE 시 캐스팅 필요
            ilike(sql`${leads.source}::text`, `%${q}%`)
          )
        : undefined,
      source ? eq(leads.source, source) : undefined,
      visitedStr === "true" ? eq(leads.visited, true) :
      visitedStr === "false" ? eq(leads.visited, false) : undefined,
      consentStr === "true" ? eq(leads.consent, true) :
      consentStr === "false" ? eq(leads.consent, false) : undefined,
      after
        ? (sortDesc ? lt(leads.createdAt, new Date(after)) : gt(leads.createdAt, new Date(after)))
        : undefined,
    ].filter(Boolean) as any[];

    const orderExpr = sortDesc ? desc(leads.createdAt) : asc(leads.createdAt);

    const rows = await withRLS(
      { sub: user.id, role, org_id },
      (tx) =>
        tx
          .select()
          .from(leads)
          .where(and(...conds))
          .orderBy(orderExpr)
          .limit(limit)
    );

    const last = rows.at(-1);
    const nextCursor = last ? new Date(last.createdAt as any).toISOString() : null;

    return NextResponse.json({ ok: true, rows, nextCursor });
  } catch (e: any) {
    console.error("GET /api/leads error:", e);
    return NextResponse.json({ error: "Server error", detail: String(e) }, { status: 500 });
  }
}

/** POST: 새 리드 생성 */
export async function POST(req: Request) {
  try {
    const auth = await getAuth(req);
    if ("error" in auth) return auth.error;
    const { user, role, org_id } = auth;

    const body = await req.json();
    const data = mapLeadInput(body);

    if (!data.brideName || !data.groomName) {
      return NextResponse.json({ error: "bride_name, groom_name are required" }, { status: 400 });
    }

    const [row] = await withRLS(
      { sub: user.id, role, org_id },
      (tx) => tx.insert(leads).values({ orgId: org_id, ...data }).returning()
    );
    return NextResponse.json({ ok: true, row }, { status: 201 });
  } catch (e: any) {
    console.error("POST /api/leads error:", e);
    return NextResponse.json({ error: "Server error", detail: String(e) }, { status: 500 });
  }
}

/** PATCH: 부분 수정 */
export async function PATCH(req: Request) {
  try {
    const auth = await getAuth(req);
    if ("error" in auth) return auth.error;
    const { user, role, org_id } = auth;

    const body = await req.json();
    const id = body.id ?? body.lead_id;
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const patchRaw = mapLeadInput(body);
    const patch: Record<string, any> = Object.fromEntries(Object.entries(patchRaw).filter(([_, v]) => v !== undefined));

    const [row] = await withRLS(
      { sub: user.id, role, org_id },
      (tx) => tx.update(leads).set(patch).where(eq(leads.id, id)).returning()
    );
    return NextResponse.json({ ok: true, row }, { status: 200 });
  } catch (e: any) {
    console.error("PATCH /api/leads error:", e);
    return NextResponse.json({ error: "Server error", detail: String(e) }, { status: 500 });
  }
}

/** DELETE: 삭제 (?id=...) */
export async function DELETE(req: Request) {
  try {
    const auth = await getAuth(req);
    if ("error" in auth) return auth.error;
    const { user, role, org_id } = auth;

    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const [row] = await withRLS(
      { sub: user.id, role, org_id },
      (tx) => tx.delete(leads).where(eq(leads.id, id)).returning()
    );
    return NextResponse.json({ ok: true, row }, { status: 200 });
  } catch (e: any) {
    console.error("DELETE /api/leads error:", e);
    return NextResponse.json({ error: "Server error", detail: String(e) }, { status: 500 });
  }
}
