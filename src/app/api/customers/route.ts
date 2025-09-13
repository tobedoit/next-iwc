// src/app/api/customers/route.ts
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { withRLS } from "@/lib/drizzle/withRLS";
import { customers } from "@/lib/drizzle/schema";
import { and, or, eq, ilike, desc, asc, lt, gt } from "drizzle-orm";

/** 공통: 인증 + org_id 파싱 (Bearer 전제) */
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
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
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

/** 입력 → 스키마 매핑 */
function mapCustomerInput(input: any) {
  return {
    name:  input.name,
    phone: input.phone,
    email: input.email ?? null,
    addr1: input.addr1 ?? null, // addr1/addr2 사용
    addr2: input.addr2 ?? null,
    memo:  input.memo ?? null,
  };
}

const esc = (s: string) => s.replace(/[%_]/g, (m) => `\\${m}`);

/** GET: 검색/정렬/커서 페이지네이션 */
export async function GET(req: Request) {
  try {
    const auth = await getAuth(req);
    if ("error" in auth) return auth.error;
    const { user, role, org_id } = auth;

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const sort = (url.searchParams.get("sort") ?? "created_at.desc").toLowerCase();
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 200);

    const afterRaw = url.searchParams.get("after");
    const after = afterRaw && !Number.isNaN(Date.parse(afterRaw)) ? new Date(afterRaw) : null;
    const sortDesc = sort.endsWith(".desc");
    const like = q ? `%${esc(q)}%` : null;

    const conds = [
      eq(customers.orgId, org_id),
      q
        ? or(
            ilike(customers.name,  like!),
            ilike(customers.phone, like!),
            ilike(customers.email, like!),
            ilike(customers.addr1, like!),
            ilike(customers.addr2, like!),
          )
        : undefined,
      after ? (sortDesc ? lt(customers.createdAt, after) : gt(customers.createdAt, after)) : undefined,
    ].filter(Boolean) as any[];

    const orderExpr = sortDesc ? desc(customers.createdAt) : asc(customers.createdAt);

    const rows = await withRLS(
      { sub: user.id, role, org_id },
      (tx) =>
        tx
          .select()
          .from(customers)
          .where(and(...conds))
          .orderBy(orderExpr)
          .limit(limit)
    );

    const last = rows.at(-1) as any;
    const lastCreatedAt: Date | string | undefined = last?.createdAt;
    const nextCursor =
      rows.length === limit && lastCreatedAt
        ? (lastCreatedAt instanceof Date ? lastCreatedAt.toISOString() : String(lastCreatedAt))
        : null;

    return NextResponse.json({ ok: true, rows, nextCursor }, { status: 200 });
  } catch (e: any) {
    console.error("GET /api/customers error:", e);
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
    const data = mapCustomerInput(body);

    if (!data.name || !data.phone) {
      return NextResponse.json({ error: "name and phone are required" }, { status: 400 });
    }

    const [row] = await withRLS(
      { sub: user.id, role, org_id },
      (tx) => tx.insert(customers).values({ orgId: org_id, ...data }).returning()
    );

    return NextResponse.json({ ok: true, row }, { status: 201 });
  } catch (e: any) {
    console.error("POST /api/customers error:", e);
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
    const id = body.id ?? body.customer_id;
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    const patchRaw = mapCustomerInput(body);
    const patch = Object.fromEntries(Object.entries(patchRaw).filter(([_, v]) => v !== undefined));
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "no fields to update" }, { status: 400 });
    }

    const [row] = await withRLS(
      { sub: user.id, role, org_id },
      (tx) => tx.update(customers).set(patch).where(eq(customers.id, id)).returning()
    );

    return NextResponse.json({ ok: true, row }, { status: 200 });
  } catch (e: any) {
    console.error("PATCH /api/customers error:", e);
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
      (tx) => tx.delete(customers).where(eq(customers.id, id)).returning()
    );

    return NextResponse.json({ ok: true, row }, { status: 200 });
  } catch (e: any) {
    console.error("DELETE /api/customers error:", e);
    return NextResponse.json({ error: "Server error", detail: String(e) }, { status: 500 });
  }
}
