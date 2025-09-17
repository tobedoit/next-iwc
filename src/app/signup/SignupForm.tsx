"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

export type SignupOrgOption = {
  id: string;
  name: string;
};

export default function SignupForm({ orgs }: { orgs: SignupOrgOption[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgId, setOrgId] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const cardClass =
    "w-full max-w-sm space-y-5 rounded-2xl border border-white/12 bg-white/[0.03] p-7 shadow-[0_18px_45px_rgba(0,0,0,0.55)] backdrop-blur-sm";
  const fieldClass =
    "w-full rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-[#6c6dff] focus:outline-none focus:ring-2 focus:ring-[#6c6dff]/40";

  async function onSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);

    if (!orgId) {
      setMsg("지점을 선택해주세요.");
      setLoading(false);
      return;
    }

    const supabase = supabaseBrowser();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          org_id: orgId,
          role: "member",
        },
      },
    });

    if (error) {
      setMsg(error.message);
      setLoading(false);
      return;
    }

    const session = data.session;
    const user = session?.user ?? data.user ?? null;
    const metaOrg = (user?.user_metadata as { org_id?: string } | null)?.org_id;

    if (metaOrg) {
      try {
        localStorage.setItem("org_id", metaOrg);
      } catch (err) {
        console.warn("Failed to persist org_id", err);
      }
    }

    if (session) {
      setMsg("회원가입 완료!");
      router.replace("/leads");
      router.refresh();
    } else {
      setMsg("가입 요청이 전송되었습니다. 이메일을 확인해주세요.");
    }

    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black/80 p-6">
      <form onSubmit={onSignup} className={cardClass}>
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold text-white">Sign up</h1>
          <p className="text-sm text-white/55">조직을 선택해 새로운 콘솔 계정을 만들어 보세요.</p>
        </div>
        <input
          className={fieldClass}
          placeholder="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <input
          className={fieldClass}
          placeholder="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className={fieldClass}
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          required
        />
        <select
          className={`${fieldClass} appearance-none`}
          value={orgId}
          onChange={(e) => setOrgId(e.target.value)}
          required
        >
          <option value="">지점을 선택하세요</option>
          {orgs.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.name}
            </option>
          ))}
        </select>
        <button
          disabled={loading}
          className="w-full rounded-lg bg-[#6c6dff] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#7b7cff] disabled:opacity-60"
        >
          {loading ? "Signing up..." : "Sign up"}
        </button>
        {msg && <div className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-200">{msg}</div>}
        <div className="text-sm text-white/55">
          <Link href="/login" className="block transition hover:text-white">이미 계정이 있으신가요? Login</Link>
        </div>
      </form>
    </div>
  );
}
