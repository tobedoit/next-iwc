// src/lib/supabase/browser.ts
import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseStorage } from "@/lib/supabase/storage";

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function supabaseBrowser() {
  console.log("[supabaseBrowser] URL=", process.env.NEXT_PUBLIC_SUPABASE_URL, " KEY?", !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (browserClient) return browserClient;

  // Safari(특히 시크릿 모드)에서 localStorage 접근이 거부되는 경우가 있어
  // 스토리지를 안전하게 감싸준다. (쿠키 → 메모리 순으로 대체)
  const storage = getSupabaseStorage();
  browserClient = createBrowserClient(url, key, {
    auth: {
      storage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });

  return browserClient;
}
