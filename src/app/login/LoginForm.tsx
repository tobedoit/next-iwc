"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const cardClass =
    "w-full max-w-sm space-y-5 rounded-2xl border border-white/12 bg-white/[0.03] p-7 shadow-[0_18px_45px_rgba(0,0,0,0.55)] backdrop-blur-sm";
  const fieldClass =
    "w-full rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-[#6c6dff] focus:outline-none focus:ring-2 focus:ring-[#6c6dff]/40";

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    const supabase = supabaseBrowser();

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMsg(error.message);
      setLoading(false);
      return;
    }

    const user = data.user;
    const metaOrg = (user?.user_metadata as { org_id?: string } | null)?.org_id;
    if (!metaOrg) {
      setMsg("이 계정에는 org 설정이 없습니다. 관리자에게 문의해주세요.");
      setLoading(false);
      return;
    }

    try {
      localStorage.setItem("org_id", metaOrg);
    } catch (err) {
      console.warn("Failed to persist org_id", err);
    }

    setMsg("로그인 완료!");
    router.replace("/leads");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black/80 p-6">
      <form onSubmit={onLogin} className={cardClass}>
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold text-white">Login</h1>
          <p className="text-sm text-white/55">팀 계정으로 로그인해 콘솔을 관리하세요.</p>
        </div>
        <input
          className={fieldClass}
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          required
        />
        <input
          className={fieldClass}
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button
          disabled={loading}
          className="w-full rounded-lg bg-[#6c6dff] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#7b7cff] disabled:opacity-60"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
        {msg && <div className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-200">{msg}</div>}
        <div className="text-sm text-white/55">
          <Link href="/signup" className="block transition hover:text-white">
            계정이 없으신가요? Sign up
          </Link>
          <Link href="/leads" className="mt-1 block transition hover:text-white">
            Leads 보기
          </Link>
        </div>
      </form>
    </div>
  );
}
