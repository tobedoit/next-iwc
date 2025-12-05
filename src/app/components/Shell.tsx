// src/app/components/Shell.tsx
"use client";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { User } from "@supabase/supabase-js";

export default function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [open, setOpen] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof document !== 'undefined') {
      const de = document.documentElement;
      const fromDom = de.getAttribute('data-theme');
      if (fromDom === 'dark' || fromDom === 'light') return fromDom;
      const saved = (typeof localStorage !== 'undefined'
        ? (localStorage.getItem('theme') as 'light' | 'dark' | null)
        : null);
      if (saved === 'dark' || saved === 'light') return saved;
    }
    return 'light';
  });
  const [hydrated, setHydrated] = useState(false);
  const [sessionUser, setSessionUser] = useState<User | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement | null>(null);

  // Hydration 플래그만 초기화 (테마 동기화는 아래 effect에서 처리)
  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    try {
      const de = document.documentElement;
      de.setAttribute('data-theme', theme);
      if (theme === 'dark') de.classList.add('dark'); else de.classList.remove('dark');
      localStorage.setItem('theme', theme);
    } catch {}
  }, [theme]);

  useEffect(() => {
    let active = true;

    async function loadSession() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!active) return;
        if (data.session?.user) {
          setSessionUser(data.session.user);
          return;
        }
        if (error) console.warn("세션 정보를 불러오지 못했습니다.", error);
        // 세션이 없으면 한 번 더 리프레시 시도 (사파리 스토리지 차단 대비)
        const refreshed = await supabase.auth.refreshSession();
        if (!active) return;
        if (refreshed.data.session?.user) {
          setSessionUser(refreshed.data.session.user);
        }
      } catch (error) {
        console.warn("세션 정보를 불러오지 못했습니다.", error);
      }
    }

    loadSession();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionUser(session?.user ?? null);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!accountOpen) return;
    function handleClick(e: MouseEvent) {
      if (!accountRef.current) return;
      if (!accountRef.current.contains(e.target as Node)) setAccountOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [accountOpen]);

  async function onLogout() {
    try {
      await supabase.auth.signOut();
      try {
        localStorage.removeItem("org_id");
      } catch {}
    } finally {
      setAccountOpen(false);
      router.replace("/login");
      router.refresh();
    }
  }

  const accountName = useMemo(() => {
    if (!sessionUser) return "로그인이 필요합니다";
    const metadata = (sessionUser.user_metadata as { name?: string; username?: string } | null) ?? null;
    return metadata?.name || metadata?.username || sessionUser.email || "회원";
  }, [sessionUser]);

  const accountInitial = useMemo(() => {
    if (!sessionUser) return "?";
    const base = accountName.trim();
    const firstChar = base.charAt(0);
    return firstChar ? firstChar.toUpperCase() : "?";
  }, [accountName, sessionUser]);

  const accountEmail = useMemo(() => {
    if (!sessionUser) return null;
    return sessionUser.email && sessionUser.email !== accountName ? sessionUser.email : null;
  }, [accountName, sessionUser]);

  const logoutButtonStyle = useMemo<CSSProperties>(() => {
    if (theme === 'dark') {
      return {
        backgroundColor: 'rgba(239, 68, 68, 0.2)',
        color: '#fecaca',
      };
    }
    return {
      backgroundColor: '#ef4444',
      color: '#ffffff',
    };
  }, [theme]);

  const NavLink = ({ href, label }: { href: string; label: string }) => {
    const active = pathname === href;
    return (
      <Link
        href={href}
        className={
          "block rounded-xl px-4 py-2 text-sm transition " +
          (active
            ? "shadow bg-nav-active-bg text-nav-active-fg"
            : "text-foreground hover:bg-nav-hover-bg")
        }
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="min-h-dvh grid grid-cols-1 lg:grid-cols-[280px_1fr]">
      <aside className={`border-r border-panel-border ${open ? "block" : "hidden lg:block"}`}>
        <div className="flex h-full flex-col">
          <div className="px-4 py-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-lg font-semibold tracking-tight">IWC Console</div>
              <button
                onClick={() => setOpen(!open)}
                className="lg:hidden rounded-lg border px-2 py-1 text-xs hover:bg-neutral-100"
              >
                {open ? "Hide" : "Menu"}
              </button>
            </div>
            {/* Theme toggle under the title */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
                className="rounded-md border px-2 py-1 text-xs font-medium bg-panel text-foreground border-panel-border hover:bg-table-head-bg cursor-pointer"
                aria-label="Toggle theme"
                title={hydrated ? (theme === 'light' ? 'Switch to dark' : 'Switch to light') : undefined}
                suppressHydrationWarning
              >
                {hydrated ? (theme === 'light' ? '☾ Dark' : '☀︎ Light') : ''}
              </button>
            </div>
          </div>
          <nav className="flex-1 space-y-1 px-3 pb-6">
            <NavLink href="/customers" label="Customers" />
            <NavLink href="/leads" label="Leads" />
            <NavLink href="/appointments" label="Appointments" />
          </nav>
          <div ref={accountRef} className="relative px-3 pb-4">
            <button
              onClick={() => setAccountOpen((v) => !v)}
              className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-panel-border bg-panel px-3 py-2 text-left text-foreground transition hover:bg-table-head-bg"
              aria-haspopup="true"
              aria-expanded={accountOpen}
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-table-head-bg text-sm font-semibold">
                {accountInitial}
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium leading-tight">{accountName}</div>
                {accountEmail && (
                  <div className="text-xs leading-tight text-muted">{accountEmail}</div>
                )}
              </div>
              <span className="text-xs text-muted">{accountOpen ? "▲" : "▼"}</span>
            </button>
            {accountOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-2 rounded-xl border border-panel-border bg-panel p-2 shadow-lg">
                <button
                  onClick={onLogout}
                  className="w-full cursor-pointer rounded-lg px-3 py-2 text-sm font-medium transition hover:bg-red-600/90"
                  style={logoutButtonStyle}
                >
                  로그아웃
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>
      <main className="p-6 lg:p-8" aria-label={title}>
        <div className="mt-6">{children}</div>
      </main>
    </div>
  );
}
