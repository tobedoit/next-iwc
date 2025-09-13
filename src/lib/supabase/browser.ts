// src/lib/supabase/browser.ts
import { createBrowserClient } from "@supabase/ssr";

export function supabaseBrowser() {
  console.log("[supabaseBrowser] URL=", process.env.NEXT_PUBLIC_SUPABASE_URL, " KEY?", !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createBrowserClient(url, key);
}
