// src/app/api/customers/route.ts
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";
import { withRLS } from "@/lib/drizzle/withRLS";
import { customers } from "@/lib/drizzle/schema";
import { and, or, eq, ilike, desc, asc, lt, gt } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

type CustomerInsert = typeof customers.$inferInsert;

type AuthSuccess = { user: User; role: string; orgId: string };
type AuthResult = { error: NextResponse } | AuthSuccess;

type CustomerPayload = Partial<{
  name: string;
  phone: string;
  email: string | null;
  addr1: string | null;
  addr2: string | null;
  memo: string | null;
}>;

/** 공통: 인증 + org_id 파싱 (Bearer 전제) */
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

  const metadata = user.user_metadata as Record<string, unknown> | null | undefined;
  const role = typeof metadata?.role === "string" ? metadata.role : "guest";
  const orgId = typeof metadata?.org_id === "string" ? metadata.org_id : null;
  if (!orgId) {
    return { error: NextResponse.json({ error: "Missing org_id in user metadata" }, { status: 400 }) };
  }
  return { user, role, orgId };
}

/** 입력 → 스키마 매핑 */
function mapCustomerInput(input: unknown): CustomerPayload {
  if (!input || typeof input !== "object") return {};
  const raw = input as Record<string, unknown>;

  const readString = (key: keyof CustomerPayload) => {
    const value = raw[key as string];
    return typeof value === "string" ? value : undefined;
  };
  const readNullable = (key: keyof CustomerPayload) => {
    const value = raw[key as string];
    if (typeof value === "string") return value;
    if (value === null) return null;
    return undefined;
  };

  return {
    name: readString("name"),
    phone: readString("phone"),
    email: readNullable("email"),
    addr1: readNullable("addr1"),
    addr2: readNullable("addr2"),
    memo: readNullable("memo"),
  };
}

const esc = (s: string) => s.replace(/[%_]/g, (m) => `\\${m}`);

/** GET: 검색/정렬/커서 페이지네이션 */
export async function GET(req: Request) {
  try {
    const auth = await getAuth(req);
    if ("error" in auth) return auth.error;
    const { user, role, orgId } = auth;

    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const sort = (url.searchParams.get("sort") ?? "created_at.desc").toLowerCase();
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 200);

    const afterRaw = url.searchParams.get("after");
    const after = afterRaw && !Number.isNaN(Date.parse(afterRaw)) ? new Date(afterRaw) : null;
    const sortDesc = sort.endsWith(".desc");
    const like = q ? `%${esc(q)}%` : null;

    let whereExpr: SQL<unknown> = eq(customers.orgId, orgId);
    if (like) {
      const likeClause = or(
        ilike(customers.name, like),
        ilike(customers.phone, like),
        ilike(customers.email, like),
        ilike(customers.addr1, like),
        ilike(customers.addr2, like),
      );
      const combined = and(whereExpr, likeClause);
      if (combined) whereExpr = combined;
    }
    if (after) {
      const cursorClause = sortDesc ? lt(customers.createdAt, after) : gt(customers.createdAt, after);
      const combined = and(whereExpr, cursorClause);
      if (combined) whereExpr = combined;
    }

    const orderExpr = sortDesc ? desc(customers.createdAt) : asc(customers.createdAt);

    const rows = await withRLS(
      { sub: user.id, role, orgId },
      (tx) =>
        tx
          .select()
          .from(customers)
          .where(whereExpr)
          .orderBy(orderExpr)
          .limit(limit)
    );

    const last = rows.at(-1);
    const lastCreatedAt = last?.createdAt;
    const nextCursor =
      rows.length === limit && lastCreatedAt
        ? (lastCreatedAt instanceof Date ? lastCreatedAt.toISOString() : String(lastCreatedAt))
        : null;

    return NextResponse.json({ ok: true, rows, nextCursor }, { status: 200 });
  } catch (error) {
    console.error("GET /api/customers error:", error);
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
    const data = mapCustomerInput(body);

    if (!data.name || !data.phone) {
      return NextResponse.json({ error: "name and phone are required" }, { status: 400 });
    }

    const insertValues: CustomerInsert = {
      orgId,
      name: data.name,
      phone: data.phone,
      email: data.email ?? null,
      addr1: data.addr1 ?? null,
      addr2: data.addr2 ?? null,
    };

    const [row] = await withRLS(
      { sub: user.id, role, orgId },
      (tx) => tx.insert(customers).values(insertValues).returning()
    );

    return NextResponse.json({ ok: true, row }, { status: 201 });
  } catch (error) {
    console.error("POST /api/customers error:", error);
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
    const id: unknown = (body as Record<string, unknown>).id ?? (body as Record<string, unknown>).customer_id;
    if (typeof id !== "string") {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const patchRaw = mapCustomerInput(body);
    const patch: Partial<CustomerInsert> = {};
    if (patchRaw.name !== undefined) patch.name = patchRaw.name;
    if (patchRaw.phone !== undefined) patch.phone = patchRaw.phone;
    if (patchRaw.email !== undefined) patch.email = patchRaw.email;
    if (patchRaw.addr1 !== undefined) patch.addr1 = patchRaw.addr1;
    if (patchRaw.addr2 !== undefined) patch.addr2 = patchRaw.addr2;

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "no fields to update" }, { status: 400 });
    }

    const [row] = await withRLS(
      { sub: user.id, role, orgId },
      (tx) => tx.update(customers).set(patch).where(eq(customers.id, id)).returning()
    );

    return NextResponse.json({ ok: true, row }, { status: 200 });
  } catch (error) {
    console.error("PATCH /api/customers error:", error);
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
      (tx) => tx.delete(customers).where(eq(customers.id, id)).returning()
    );

    return NextResponse.json({ ok: true, row }, { status: 200 });
  } catch (error) {
    console.error("DELETE /api/customers error:", error);
    return NextResponse.json({ error: "Server error", detail: String(error) }, { status: 500 });
  }
}
