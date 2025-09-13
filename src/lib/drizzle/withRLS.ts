// src/lib/drizzle.withRLS.ts
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { NodePgDatabase } from "drizzle-orm/node-postgres";

type JwtClaims = {
  sub: string;
  role?: string;
  org_id?: string;
  [k: string]: unknown;
};

// fn에 트랜잭션 핸들(tx)을 넘겨서 그 안에서 쿼리하게 하는 형태가 가장 안전합니다.
export async function withRLS<T>(
  claims: JwtClaims,
  fn: (tx: NodePgDatabase) => Promise<T>
) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`
    );
    return fn(tx); // ← 여기서 tx 사용
  });
}
