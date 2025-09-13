// src/lib/api.ts
"use client";
import { supabaseBrowser } from "@/lib/supabase/browser";

/** 세션 토큰 헤더 생성 */
async function authHeader() {
  const sb = supabaseBrowser();
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = await authHeader();
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...headers,
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    // 에러 메시지 보기 좋게
    const text = await res.text().catch(() => "");
    throw new Error(`${init?.method ?? "GET"} ${path} failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

export const apiGet = <T = any>(path: string) =>
  request<T>(path, { method: "GET" });

export const apiPost = <T = any>(path: string, body?: any) =>
  request<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) });

export const apiPatch = <T = any>(path: string, body?: any) =>
  request<T>(path, { method: "PATCH", body: JSON.stringify(body ?? {}) });

export const apiDelete = <T = any>(path: string) =>
  request<T>(path, { method: "DELETE" });
