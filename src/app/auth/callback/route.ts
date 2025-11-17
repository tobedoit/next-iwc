import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

function resolveNextPath(rawNext: string | null | undefined): string {
  if (!rawNext) return "/leads";
  if (!rawNext.startsWith("/")) return "/leads";
  return rawNext;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = resolveNextPath(requestUrl.searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", requestUrl.origin));
  }

  try {
    const supabase = await supabaseServer({ allowCookieWrites: true });
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error("[auth/callback] session exchange failed", error);
      return NextResponse.redirect(
        new URL("/login?error=exchange_failed", requestUrl.origin)
      );
    }
  } catch (error) {
    console.error("[auth/callback] unexpected error", error);
    return NextResponse.redirect(
      new URL("/login?error=exchange_exception", requestUrl.origin)
    );
  }

  return NextResponse.redirect(new URL(next, requestUrl.origin));
}
