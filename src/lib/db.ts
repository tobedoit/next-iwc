// src/lib/db.ts
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 3, // 서버리스는 낮게 유지
  idleTimeoutMillis: 0,
  allowExitOnIdle: true,
});

export const db = drizzle(pool);
