// src/app/api/appointments/route.ts
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { withRLS } from "@/lib/drizzle/withRLS";
import { appointments } from "@/lib/drizzle/schema";
import { and, or, eq, desc, asc, ilike, lt, gt, gte, lte } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";

type AppointmentInsert = typeof appointments.$inferInsert;

type AuthSuccess = { user: User; role: string; orgId: string };
type AuthResult = { error: NextResponse } | AuthSuccess;

const ALLOWED_KINDS = ["visit", "phone", "check"] as const;
const ALLOWED_STATUSES = ["scheduled", "done", "canceled"] as const;
type Kind = typeof ALLOWED_KINDS[number];
type Status = typeof ALLOWED_STATUSES[number];

type AppointmentPayload = Partial<{
  customerId: string | null;
  staffId: string | null;
  kind: Kind;
  startAt: Date;
  endAt: Date;
  status: Status;
  note: string | null;
}>;

function parseDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return undefined;
}

function parseString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function parseNullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  return parseString(value);
}

/** 공통: 인증 + org_id 파싱 (Bearer 전제) */
async function getAuth(req: Request): Promise<AuthResult> {
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

  const metadata = user.user_metadata as Record<string, unknown> | null | undefined;
  const role = typeof metadata?.role === "string" ? metadata.role : "guest";
  const orgId = typeof metadata?.org_id === "string" ? metadata.org_id : null;
  if (!orgId) {
    return { error: NextResponse.json({ error: "Missing org_id in user metadata" }, { status: 400 }) };
  }
  return { user, role, orgId };
}

/** 입력 → Drizzle 컬럼 매핑 */
function mapApptInput(input: unknown): AppointmentPayload {
  if (!input || typeof input !== "object") return {};
  const raw = input as Record<string, unknown>;

  const rawKind = parseString(raw.kind);
  const kind = rawKind && (ALLOWED_KINDS as readonly string[]).includes(rawKind)
    ? (rawKind as Kind)
    : undefined;

  const rawStatus = parseString(raw.status);
  const status = rawStatus && (ALLOWED_STATUSES as readonly string[]).includes(rawStatus)
    ? (rawStatus as Status)
    : undefined;

  return {
    customerId: parseString(raw.customer_id ?? raw.customerId) ?? null,
    staffId: parseString(raw.staff_id ?? raw.staffId) ?? null,
    kind,
    startAt: parseDate(raw.start_at ?? raw.startAt),
    endAt: parseDate(raw.end_at ?? raw.endAt),
    status,
    note: parseNullableString(raw.note) ?? null,
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

    // --- enum 좁히기 (스키마 enum과 동일해야 함) ---
    const rawKind = url.searchParams.get("kind") ?? undefined;
    const kind: Kind | undefined =
      rawKind && (ALLOWED_KINDS as readonly string[]).includes(rawKind) ? (rawKind as Kind) : undefined;

    const rawStatus = url.searchParams.get("status") ?? undefined;
    const status: Status | undefined =
      rawStatus && (ALLOWED_STATUSES as readonly string[]).includes(rawStatus) ? (rawStatus as Status) : undefined;

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

    const conds: SQL<unknown>[] = [eq(appointments.orgId, orgId)];
    if (kind) conds.push(eq(appointments.kind, kind));
    if (status) conds.push(eq(appointments.status, status));
    if (from) conds.push(gte(appointments.startAt, from));
    if (to) conds.push(lte(appointments.startAt, to));
    if (after) conds.push(sortDesc ? lt(appointments.startAt, after) : gt(appointments.startAt, after));
    if (q) {
      const like = `%${esc(q)}%`;
      const likeClause = or(
        ilike(appointments.kind, like),
        ilike(appointments.status, like),
        ilike(appointments.note, like),
      ) as SQL<unknown>;
      conds.push(likeClause);
    }

    const whereExpr = conds.length === 1 ? conds[0] : and(...conds);

    const rows = await withRLS(
      { sub: user.id, role, orgId },
      (tx) =>
        tx
          .select()
          .from(appointments)
          .where(whereExpr)
          .orderBy(orderExpr)
          .limit(limit)
    );

    const last = rows.at(-1);
    const nextCursor =
      rows.length === limit && last?.startAt
        ? (last.startAt instanceof Date ? last.startAt.toISOString() : String(last.startAt))
        : null;

    return NextResponse.json({ ok: true, rows, nextCursor }, { status: 200 });
  } catch (error) {
    console.error("GET /api/appointments error:", error);
    return NextResponse.json({ error: "Server error", detail: String(error) }, { status: 500 });
  }
}

/** POST: 생성 */
export async function POST(req: Request) {
  try {
    const auth = await getAuth(req);
    if ("error" in auth) return auth.error;
    const { user, role, orgId } = auth;

    const body = await req.json();
    const data = mapApptInput(body);

    if (!data.startAt || !data.endAt) {
      return NextResponse.json({ error: "start_at and end_at are required" }, { status: 400 });
    }
    if (new Date(data.endAt).getTime() <= new Date(data.startAt).getTime()) {
      return NextResponse.json({ error: "end_at must be after start_at" }, { status: 400 });
    }

    const payload: AppointmentInsert = {
      orgId,
      customerId: data.customerId ?? null,
      staffId: data.staffId ?? null,
      kind: data.kind ?? "visit",
      startAt: data.startAt,
      endAt: data.endAt,
      status: data.status ?? "scheduled",
      note: data.note ?? null,
    };

    const [row] = await withRLS(
      { sub: user.id, role, orgId },
      (tx) => tx.insert(appointments).values(payload).returning()
    );

    return NextResponse.json({ ok: true, row }, { status: 201 });
  } catch (error) {
    console.error("POST /api/appointments error:", error);
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
    const id = raw.id ?? raw.appointment_id ?? raw.appt_id;
    if (typeof id !== "string") return NextResponse.json({ error: "id is required" }, { status: 400 });

    const patchRaw = mapApptInput(body);
    if (patchRaw.startAt && patchRaw.endAt) {
      if (patchRaw.endAt.getTime() <= patchRaw.startAt.getTime()) {
        return NextResponse.json({ error: "end_at must be after start_at" }, { status: 400 });
      }
    }

    const patch: Partial<AppointmentInsert> = {};
    if (patchRaw.customerId !== undefined) patch.customerId = patchRaw.customerId;
    if (patchRaw.staffId !== undefined) patch.staffId = patchRaw.staffId;
    if (patchRaw.kind) patch.kind = patchRaw.kind;
    if (patchRaw.startAt) patch.startAt = patchRaw.startAt;
    if (patchRaw.endAt) patch.endAt = patchRaw.endAt;
    if (patchRaw.status) patch.status = patchRaw.status;
    if (patchRaw.note !== undefined) patch.note = patchRaw.note;

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "no fields to update" }, { status: 400 });
    }

    const [row] = await withRLS(
      { sub: user.id, role, orgId },
      (tx) => tx.update(appointments).set(patch).where(eq(appointments.id, id)).returning()
    );

    return NextResponse.json({ ok: true, row }, { status: 200 });
  } catch (error) {
    console.error("PATCH /api/appointments error:", error);
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
      (tx) => tx.delete(appointments).where(eq(appointments.id, id)).returning()
    );

    return NextResponse.json({ ok: true, row }, { status: 200 });
  } catch (error) {
    console.error("DELETE /api/appointments error:", error);
    return NextResponse.json({ error: "Server error", detail: String(error) }, { status: 500 });
  }
}
