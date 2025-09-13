// src/app/login/page.tsx
"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [org, setOrg] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setMsg(null);
    const supabase = supabaseBrowser();

    // 1) 로그인
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setMsg(error.message); setLoading(false); return; }

    // 2) org_id가 입력되어 있으면 메타데이터 갱신(선택)
    if (org) {
      const { error: upErr } = await supabase.auth.updateUser({ data: { org_id: org, role: "member" } });
      if (upErr) { setMsg("로그인 성공, 메타데이터 갱신 실패: " + upErr.message); setLoading(false); return; }
      // realtime 필터용 로컬스토리지도 같이 세팅
      localStorage.setItem("org_id", org);
    } else {
      // org이 이미 메타데이터에 있다면 realtime용 로컬스토리지만 싱크
      const me = (await supabase.auth.getUser()).data.user;
      const metaOrg = (me?.user_metadata as any)?.org_id;
      if (metaOrg) localStorage.setItem("org_id", metaOrg);
    }

    setMsg("로그인 완료!");
    window.location.href = "/leads"; // 바로 이동
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={onLogin} className="w-full max-w-sm space-y-3 rounded-xl border p-5 shadow-sm">
        <h1 className="text-xl font-semibold">Login</h1>
        <input className="w-full rounded border px-3 py-2" placeholder="Email"
               value={email} onChange={e=>setEmail(e.target.value)} />
        <input className="w-full rounded border px-3 py-2" placeholder="Password" type="password"
               value={password} onChange={e=>setPassword(e.target.value)} />
        <input className="w-full rounded border px-3 py-2" placeholder="(선택) org_id"
               value={org} onChange={e=>setOrg(e.target.value)} />
        <button disabled={loading} className="w-full rounded-md border px-3 py-2">
          {loading ? "Signing in..." : "Sign in"}
        </button>
        {msg && <div className="text-sm text-neutral-600">{msg}</div>}
        <div className="text-sm text-neutral-500">
          <Link href="/leads" className="underline">Go to Leads</Link>
        </div>
      </form>
    </div>
  );
}
