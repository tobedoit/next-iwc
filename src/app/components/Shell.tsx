// src/app/components/Shell.tsx
"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  const pathname = usePathname();
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

  // On mount, sync DOM to current theme without overriding stored preference
  useEffect(() => {
    try {
      const de = document.documentElement;
      de.setAttribute('data-theme', theme);
      if (theme === 'dark') de.classList.add('dark'); else de.classList.remove('dark');
      localStorage.setItem('theme', theme);
    } catch {}
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

  const NavLink = ({ href, label }: { href: string; label: string }) => {
    const active = pathname === href;
    return (
      <Link
        href={href}
        className={
          "block rounded-xl px-4 py-2 text-sm transition " +
          (active
            ? "shadow bg-[var(--nav-active-bg)] text-[var(--nav-active-fg)]"
            : "text-[var(--foreground)] hover:bg-[var(--nav-hover-bg)]")
        }
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="min-h-dvh grid grid-cols-1 lg:grid-cols-[280px_1fr]">
      <aside className={`border-r border-[var(--panel-border)] ${open ? "block" : "hidden lg:block"}`}>
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
              className="rounded-md border px-2 py-1 text-xs font-medium bg-[var(--panel)] text-[var(--foreground)] border-[var(--panel-border)] hover:bg-[var(--table-head-bg)] cursor-pointer"
              aria-label="Toggle theme"
              title={hydrated ? (theme === 'light' ? 'Switch to dark' : 'Switch to light') : undefined}
              suppressHydrationWarning
            >
              {hydrated ? (theme === 'light' ? '☾ Dark' : '☀︎ Light') : ''}
            </button>
          </div>
        </div>
        <nav className="space-y-1 px-3 pb-6">
          <NavLink href="/customers" label="Customers" />
          <NavLink href="/leads" label="Leads" />
          <NavLink href="/appointments" label="Appointments" />
        </nav>
      </aside>
      <main className="p-6 lg:p-8">
        <div className="mt-6">{children}</div>
      </main>
    </div>
  );
}
