// src/lib/api.ts
"use client";
import { supabaseBrowser } from "@/lib/supabase/browser";

/** 세션 토큰 헤더 생성 */
async function authHeader(): Promise<Record<string, string>> {
  const sb = supabaseBrowser();
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const auth = await authHeader();
  const headers = new Headers(init.headers);
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
  if (!headers.has("Content-Type") && !isFormData) {
    headers.set("Content-Type", "application/json");
  }
  for (const [key, value] of Object.entries(auth)) {
    headers.set(key, value);
  }

  const res = await fetch(path, {
    ...init,
    headers,
    cache: "no-store",
  });

  if (!res.ok) {
    // 에러 메시지 보기 좋게
    const text = await res.text().catch(() => "");
    throw new Error(`${init?.method ?? "GET"} ${path} failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<T>;
}

export const apiGet = <T = unknown>(path: string) => request<T>(path, { method: "GET" });

export const apiPost = <T = unknown>(path: string, body?: Record<string, unknown> | FormData) =>
  request<T>(path, { method: "POST", body: body instanceof FormData ? body : JSON.stringify(body ?? {}) });

export const apiPatch = <T = unknown>(path: string, body?: Record<string, unknown> | FormData) =>
  request<T>(path, { method: "PATCH", body: body instanceof FormData ? body : JSON.stringify(body ?? {}) });

export const apiDelete = <T = unknown>(path: string) => request<T>(path, { method: "DELETE" });
