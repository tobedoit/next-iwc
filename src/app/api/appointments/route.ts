// src/app/api/appointments/route.ts
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { withRLS } from "@/lib/drizzle/withRLS";
import { appointments } from "@/lib/drizzle/schema";
import { and, or, eq, desc, asc, ilike, lt, gt, gte, lte } from "drizzle-orm";
import { cookies } from "next/headers";

/** 공통: 인증 + org_id 파싱 (Bearer 전제) */
async function getAuth(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return { error: NextResponse.json({ error: "Missing Authorization Bearer token" }, { status: 401 }) };
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
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

/** 입력 → Drizzle 컬럼 매핑 */
function mapApptInput(input: any) {
  return {
    customerId: input.customer_id ?? input.customerId ?? null,
    staffId:    input.staff_id ?? input.staffId ?? null,
    kind:       input.kind ?? "visit",          // enum
    startAt:    input.start_at ?? input.startAt,
    endAt:      input.end_at ?? input.endAt,
    status:     input.status ?? "scheduled",    // enum
    note:       input.note ?? null,
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

    // --- enum 좁히기 (스키마 enum과 동일해야 함) ---
    const rawKind = url.searchParams.get("kind") ?? undefined;
    const allowedKinds = ["visit", "phone", "check"] as const;
    type Kind = typeof allowedKinds[number];
    const kind: Kind | undefined =
      rawKind && (allowedKinds as readonly string[]).includes(rawKind) ? (rawKind as Kind) : undefined;

    const rawStatus = url.searchParams.get("status") ?? undefined;
    const allowedStatuses = ["scheduled", "done", "canceled"] as const; // 스키마가 "cancelled"면 여기서 바꿔줘
    type Status = typeof allowedStatuses[number];
    const status: Status | undefined =
      rawStatus && (allowedStatuses as readonly string[]).includes(rawStatus) ? (rawStatus as Status) : undefined;

    const fromRaw = url.searchParams.get("from");
    const toRaw   = url.searchParams.get("to");
    const afterRaw = url.searchParams.get("after");

    const from  = fromRaw  && !Number.isNaN(Date.parse(fromRaw))  ? new Date(fromRaw)  : null;
    const to    = toRaw    && !Number.isNaN(Date.parse(toRaw))    ? new Date(toRaw)    : null;
    const after = afterRaw && !Number.isNaN(Date.parse(afterRaw)) ? new Date(afterRaw) : null;

    const sort  = (url.searchParams.get("sort") ?? "start_at.desc").toLowerCase();
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 200);
    const sortDesc = sort.endsWith(".desc");
    const orderExpr = sortDesc ? desc(appointments.startAt) : asc(appointments.startAt);

    // LIKE 검색 안전 처리
    const esc = (s: string) => s.replace(/[%_]/g, (m) => `\\${m}`);

    const conds = [
      eq(appointments.orgId, org_id),
      kind   ? eq(appointments.kind, kind)       : undefined,
      status ? eq(appointments.status, status)   : undefined,
      from   ? gte(appointments.startAt, from)   : undefined,
      to     ? lte(appointments.startAt, to)     : undefined,
      after  ? (sortDesc ? lt(appointments.startAt, after) : gt(appointments.startAt, after)) : undefined,
      q
        ? or(
            ilike(appointments.kind, `%${esc(q)}%`),
            ilike(appointments.status, `%${esc(q)}%`),
            ilike(appointments.note, `%${esc(q)}%`)
          )
        : undefined,
    ].filter(Boolean) as any[];

    const rows = await withRLS(
      { sub: user.id, role, org_id },
      (tx) =>
        tx
          .select()
          .from(appointments)
          .where(and(...conds))
          .orderBy(orderExpr)
          .limit(limit)
    );

    const last = rows.at(-1) as any;
    const nextCursor =
      rows.length === limit && last?.startAt
        ? (last.startAt instanceof Date ? last.startAt.toISOString() : String(last.startAt))
        : null;

    return NextResponse.json({ ok: true, rows, nextCursor }, { status: 200 });
  } catch (e: any) {
    console.error("GET /api/appointments error:", e);
    return NextResponse.json({ error: "Server error", detail: String(e) }, { status: 500 });
  }
}

/** POST: 생성 */
export async function POST(req: Request) {
  try {
    const auth = await getAuth(req);
    if ("error" in auth) return auth.error;
    const { user, role, org_id } = auth;

    const body = await req.json();
    const data = mapApptInput(body);

    if (!data.startAt || !data.endAt) {
      return NextResponse.json({ error: "start_at and end_at are required" }, { status: 400 });
    }
    if (new Date(data.endAt).getTime() <= new Date(data.startAt).getTime()) {
      return NextResponse.json({ error: "end_at must be after start_at" }, { status: 400 });
    }

    const [row] = await withRLS(
      { sub: user.id, role, org_id },
      (tx) => tx.insert(appointments).values({ orgId: org_id, ...data }).returning()
    );

    return NextResponse.json({ ok: true, row }, { status: 201 });
  } catch (e: any) {
    console.error("POST /api/appointments error:", e);
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
    const id = body.id ?? body.appointment_id ?? body.appt_id;
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const patchRaw = mapApptInput(body);
    if (patchRaw.startAt && patchRaw.endAt) {
      if (new Date(patchRaw.endAt).getTime() <= new Date(patchRaw.startAt).getTime()) {
        return NextResponse.json({ error: "end_at must be after start_at" }, { status: 400 });
      }
    }

    const patch = Object.fromEntries(
      Object.entries(patchRaw).filter(([_, v]) => v !== undefined)
    );

    const [row] = await withRLS(
      { sub: user.id, role, org_id },
      (tx) => tx.update(appointments).set(patch).where(eq(appointments.id, id)).returning()
    );

    return NextResponse.json({ ok: true, row }, { status: 200 });
  } catch (e: any) {
    console.error("PATCH /api/appointments error:", e);
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
      (tx) => tx.delete(appointments).where(eq(appointments.id, id)).returning()
    );

    return NextResponse.json({ ok: true, row }, { status: 200 });
  } catch (e: any) {
    console.error("DELETE /api/appointments error:", e);
    return NextResponse.json({ error: "Server error", detail: String(e) }, { status: 500 });
  }
}
