// src/lib/supabase/server.ts
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

type SupabaseServerOptions = {
  allowCookieWrites?: boolean;
};

export async function supabaseServer(options: SupabaseServerOptions = {}) {
  const { allowCookieWrites = false } = options;
  const cookieStore = await cookies();

  const cookieAdapter: {
    getAll: () => ReturnType<typeof cookieStore.getAll>;
    setAll?: (cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) => void;
  } = {
    getAll() {
      return cookieStore.getAll();
    },
  };

  if (allowCookieWrites) {
    cookieAdapter.setAll = (cookiesToSet) => {
      cookiesToSet.forEach(({ name, value, options }) => {
        cookieStore.set(name, value, options as CookieOptions);
      });
    };
  }

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: cookieAdapter,
    }
  );
}
