// src/app/leads/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Shell from "@/app/components/Shell";
import { StatCard } from "@/app/components/StatCard";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { supabaseBrowser } from "@/lib/supabase/browser";

// 공통 Lead 소스 옵션 (DB enum과 동일 순서 유지)
const LEAD_SOURCES = [
  "homepage",
  "wedit",
  "kakao",
  "naver_talk",
  "naver_reserve",
  "powerlink",
  "intro",
  "cafe",
  "manual",
  "instagram",
  "referral",
  "etc",
] as const;

// --- Types ---
export type Lead = {
  id: string;
  orgId: string;
  brideName: string;
  groomName: string;
  bridePhone: string | null;
  groomPhone: string | null;
  brideEmail: string | null;
  groomEmail: string | null;
  addr1: string | null;
  addr2: string | null;
  interests: string[] | null;
  weddingPlannedOn: string | null;
  expectedVenue: string | null;
  memo: string | null;
  source: string;
  visited: boolean;
  consent: boolean;
  consentAt: string | null;
  customerId: string | null;
  createdAt: string;
};

// DB → 프런트 매핑
type RawLead = Record<string, unknown> & {
  id?: unknown;
  orgId?: unknown;
  org_id?: unknown;
  brideName?: unknown;
  bride_name?: unknown;
  groomName?: unknown;
  groom_name?: unknown;
  bridePhone?: unknown;
  bride_phone?: unknown;
  groomPhone?: unknown;
  groom_phone?: unknown;
  brideEmail?: unknown;
  bride_email?: unknown;
  groomEmail?: unknown;
  groom_email?: unknown;
  addr1?: unknown;
  addr2?: unknown;
  interests?: unknown;
  weddingPlannedOn?: unknown;
  wedding_planned_on?: unknown;
  expectedVenue?: unknown;
  expected_venue?: unknown;
  memo?: unknown;
  source?: unknown;
  visited?: unknown;
  consent?: unknown;
  consentAt?: unknown;
  consent_at?: unknown;
  customerId?: unknown;
  customer_id?: unknown;
  createdAt?: unknown;
  created_at?: unknown;
};

type NewLeadForm = { bride_name: string; groom_name: string; bride_phone: string; groom_phone: string; source: Lead["source"]; };

const INITIAL_NEW_LEAD: NewLeadForm = {
  bride_name: "",
  groom_name: "",
  bride_phone: "",
  groom_phone: "",
  source: "manual",
};

function readLeadString(raw: RawLead, ...keys: (keyof RawLead)[]): string {
  for (const key of keys) {
    const value = raw[key];
    if (value === null || value === undefined) continue;
    if (typeof value === "string") return value;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function readLeadOptionalString(raw: RawLead, ...keys: (keyof RawLead)[]): string | null {
  for (const key of keys) {
    const value = raw[key];
    if (value === null) return null;
    if (typeof value === "string") return value;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "number") return String(value);
  }
  return null;
}

function normalizeLead(row: unknown): Lead {
  if (!row || typeof row !== "object") {
    throw new Error("Invalid lead row");
  }
  const raw = row as RawLead;
  const interestsValue = Array.isArray(raw.interests)
    ? raw.interests.filter((item): item is string => typeof item === "string")
    : raw.interests === null
      ? null
      : null;
  return {
    id: readLeadString(raw, "id"),
    orgId: readLeadString(raw, "orgId", "org_id"),
    brideName: readLeadString(raw, "brideName", "bride_name"),
    groomName: readLeadString(raw, "groomName", "groom_name"),
    bridePhone: readLeadOptionalString(raw, "bridePhone", "bride_phone"),
    groomPhone: readLeadOptionalString(raw, "groomPhone", "groom_phone"),
    brideEmail: readLeadOptionalString(raw, "brideEmail", "bride_email"),
    groomEmail: readLeadOptionalString(raw, "groomEmail", "groom_email"),
    addr1: readLeadOptionalString(raw, "addr1"),
    addr2: readLeadOptionalString(raw, "addr2"),
    interests: interestsValue,
    weddingPlannedOn: readLeadOptionalString(raw, "weddingPlannedOn", "wedding_planned_on"),
    expectedVenue: readLeadOptionalString(raw, "expectedVenue", "expected_venue"),
    memo: readLeadOptionalString(raw, "memo"),
    source: readLeadString(raw, "source") || "etc",
    visited: raw.visited === true,
    consent: raw.consent === true,
    consentAt: readLeadOptionalString(raw, "consentAt", "consent_at"),
    customerId: readLeadOptionalString(raw, "customerId", "customer_id"),
    createdAt: readLeadString(raw, "createdAt", "created_at"),
  };
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

// ---- Small UI bits ----
function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={
        "rounded-md border px-3 py-2 text-sm active:scale-[0.99] cursor-pointer " +
        "bg-panel text-foreground border-panel-border " +
        (props.className ?? "")
      }
    />
  );
}
function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={
        "w-full rounded-md border px-3 py-2 text-sm outline-none " +
        "bg-panel text-foreground border-panel-border placeholder:text-muted " +
        (props.className ?? "")
      }
    />
  );
}
function Switch({
  checked,
  onChange,
  disabled,
}: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      className={`h-6 w-11 rounded-full border px-0.5 transition cursor-pointer
        ${checked ? "bg-green-500/90 border-green-600" : "bg-neutral-200 border-neutral-300 dark:bg-neutral-700 dark:border-neutral-600"}
        ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      aria-pressed={checked}
    >
      <span className={`block h-5 w-5 rounded-full bg-white shadow transition ${checked ? "translate-x-5" : "translate-x-0"}`} />
    </button>
  );
}
// Phone helpers (KR mobile)
function onlyDigits(s: string) { return s.replace(/\D/g, ""); }
function fmtPhoneKR(d: string) {
  const v = onlyDigits(d).slice(0, 11);
  if (v.length === 0) return "";
  if (v.length <= 3) {
    return v.startsWith("010") ? "010-" : v;
  }
  if (v.length <= 7) return `${v.slice(0,3)}-${v.slice(3)}`;
  return `${v.slice(0,3)}-${v.slice(3,7)}-${v.slice(7)}`;
}
// For single-field UX with fixed 010- prefix (user types last 8 digits)
function normalize010Input(s: string) {
  const d = onlyDigits(s);
  const tail = d.startsWith("010") ? d.slice(3) : d;
  const t = tail.slice(0, 8);
  if (t.length === 0) return "010-";
  if (t.length <= 4) return `010-${t}`;
  return `010-${t.slice(0,4)}-${t.slice(4,8)}`;
}
function display010(full: string | undefined) {
  if (!full) return "";
  // If already formatted, keep as is; else format from digits
  if (/^010-\d{0,4}(-\d{0,4})?$/.test(full)) return full;
  const d = onlyDigits(full);
  const tail = d.startsWith("010") ? d.slice(3) : d;
  if (tail.length === 0) return "010-";
  if (tail.length <= 4) return `010-${tail}`;
  return `010-${tail.slice(0,4)}-${tail.slice(4,8)}`;
}
function Modal({
  open, onClose, title, children,
}: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-xl p-5 shadow-xl bg-panel border border-panel-border text-foreground">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          <button onClick={onClose} className="text-muted hover:text-foreground">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---- Page ----
export default function LeadsPage() {
  // data
  const [rows, setRows] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // server filters
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("");
  const [visited, setVisited] = useState<"" | "true" | "false">("");
  const [consent, setConsent] = useState<"" | "true" | "false">("");

  // sort & pagination
  const [sort, setSort] = useState<"created_at.desc" | "created_at.asc">("created_at.desc");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // new lead modal state
  const [openNew, setOpenNew] = useState(false);
  const [savingNew, setSavingNew] = useState(false);
  const [newLead, setNewLead] = useState<NewLeadForm>(INITIAL_NEW_LEAD);

  // debounce query
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  // fetch (with filters)
  const fetchList = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams();
      if (debouncedQuery) params.set("q", debouncedQuery);
      if (source) params.set("source", source);
      if (visited) params.set("visited", visited);
      if (consent) params.set("consent", consent);
      params.set("sort", sort);
      params.set("limit", "50");

      const data = await apiGet<{ ok: boolean; rows: Lead[]; nextCursor: string | null }>(`/api/leads?${params}`);
      setRows((data.rows ?? []).map(normalizeLead));
      setNextCursor(data.nextCursor ?? null);
    } catch (error) {
      setErr(extractErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, source, visited, consent, sort]);

  // initial & when filters change
  useEffect(() => { fetchList(); }, [fetchList]);

  // load more (cursor)
  const loadMore = useCallback(async () => {
    if (!nextCursor) return;
    setIsLoadingMore(true);
    try {
      const params = new URLSearchParams();
      if (debouncedQuery) params.set("q", debouncedQuery);
      if (source) params.set("source", source);
      if (visited) params.set("visited", visited);
      if (consent) params.set("consent", consent);
      params.set("sort", sort);
      params.set("limit", "50");
      params.set("after", nextCursor);

      const data = await apiGet<{ ok: boolean; rows: Lead[]; nextCursor: string | null }>(`/api/leads?${params}`);
      setRows((prev) => [...prev, ...(data.rows ?? []).map(normalizeLead)]);
      setNextCursor(data.nextCursor ?? null);
    } catch {
      // noop
    } finally {
      setIsLoadingMore(false);
    }
  }, [debouncedQuery, source, visited, consent, sort, nextCursor]);

  // realtime (필터와 무관하게 최신 상태 반영)
  useEffect(() => {
    const supabase = supabaseBrowser();
    const orgId = typeof window !== "undefined" ? localStorage.getItem("org_id") : null;
    if (!orgId) return;

    const channel = supabase
      .channel(`leads:${orgId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leads", filter: `org_id=eq.${orgId}` },
        (payload) => {
          setRows((prev) => {
            if (payload.eventType === "INSERT") return [normalizeLead(payload.new), ...prev];
            if (payload.eventType === "UPDATE") {
              const next = normalizeLead(payload.new);
              return prev.map((r) => (r.id === next.id ? next : r));
            }
            if (payload.eventType === "DELETE") {
              const oldRecord = payload.old as Record<string, unknown> | null;
              const oldId = oldRecord && typeof oldRecord.id === "string" ? oldRecord.id : null;
              if (!oldId) return prev;
              return prev.filter((r) => r.id !== oldId);
            }
            return prev;
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // optimistic toggle
  async function toggleLead(id: string, key: "visited" | "consent", value: boolean) {
    const idx = rows.findIndex((r) => r.id === id);
    if (idx < 0) return;
    const prev = rows[idx];
    const next = { ...prev, [key]: value };
    setRows((s) => { const copy = s.slice(); copy[idx] = next; return copy; });
    try {
      await apiPatch("/api/leads", { id, [key]: value });
    } catch {
      setRows((s) => { const copy = s.slice(); copy[idx] = prev; return copy; });
      alert("업데이트 실패");
    }
  }

  // snake_case -> camelCase
  function snakeToCamel(s: string) {
    return s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
  }
  // inline save
  async function saveField(id: string, field: string, value: string) {
    try {
      // Keep hyphens for phone fields
      const isPhone = /_phone$/.test(field);
      const v = isPhone ? (/-/.test(value) ? value : fmtPhoneKR(value)) : value;
      await apiPatch("/api/leads", { id, [field]: v });
      const camel = snakeToCamel(field) as keyof Lead;
      setRows((prev) => prev.map((r) => (r.id === id ? ({ ...r, [camel]: v } as Lead) : r)));
    } catch {
      await fetchList(); // 서버와 동기화
      throw new Error("save failed");
    }
  }

  // create
  async function createLead() {
    if (!newLead.bride_name.trim() || !newLead.groom_name.trim()) {
      alert("신부/신랑 이름은 필수입니다.");
      return;
    }
    setSavingNew(true);
    try {
      const res = await apiPost<{ ok: boolean; row: Lead }>("/api/leads", newLead);
      setRows((s) => [normalizeLead(res.row), ...s]); // 응답 사용
      setOpenNew(false);
      setNewLead(INITIAL_NEW_LEAD);
    } catch {
      alert("생성 실패");
    } finally {
      setSavingNew(false);
    }
  }

  // delete
  async function removeLead(id: string) {
    if (!confirm("삭제할까요?")) return;
    const prev = rows;
    setRows((s) => s.filter((r) => r.id !== id));
    try {
      await apiDelete(`/api/leads?id=${encodeURIComponent(id)}`);
    } catch {
      setRows(prev);
      alert("삭제 실패");
    }
  }

  // stats
  const createdThisWeek = useMemo(() => {
    const weekAgo = Date.now() - 7 * 86400 * 1000;
    return rows.filter((r) => Date.parse(r.createdAt) >= weekAgo).length;
  }, [rows]);

  return (
    <Shell title="Leads">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Leads</h1>
        <div className="flex items-center gap-2">
          <Button onClick={() => setOpenNew(true)}>+ New Lead</Button>
          <Button onClick={fetchList}>Refresh</Button>
          <Button onClick={() => setSort((s) => (s === "created_at.desc" ? "created_at.asc" : "created_at.desc"))}>
            정렬: {sort === "created_at.desc" ? "최신순" : "오래된순"}
          </Button>
        </div>
      </div>

      {/* stats */}
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="총 리드" value={rows.length} />
        <StatCard label="이번주 신규" value={createdThisWeek} />
        <StatCard label="방문 완료" value={rows.filter((r) => r.visited).length} />
        <StatCard label="동의 완료" value={rows.filter((r) => r.consent).length} />
      </div>

      {/* filters */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Input
          placeholder="검색 (이름/연락처/이메일/메모/소스/장소)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select value={source} onChange={(e) => setSource(e.target.value)} className="rounded-md border px-3 py-2 text-sm bg-panel text-foreground border-panel-border cursor-pointer">
          <option value="">source: All</option>
          {LEAD_SOURCES.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
        <select
          value={visited}
          onChange={(e) => {
            const value = e.target.value;
            if (value === "" || value === "true" || value === "false") setVisited(value);
          }}
          className="rounded-md border px-3 py-2 text-sm bg-panel text-foreground border-panel-border cursor-pointer"
        >
          <option value="">visited: All</option>
          <option value="true">visited: true</option>
          <option value="false">visited: false</option>
        </select>
        <select
          value={consent}
          onChange={(e) => {
            const value = e.target.value;
            if (value === "" || value === "true" || value === "false") setConsent(value);
          }}
          className="rounded-md border px-3 py-2 text-sm bg-panel text-foreground border-panel-border cursor-pointer"
        >
          <option value="">consent: All</option>
          <option value="true">consent: true</option>
          <option value="false">consent: false</option>
        </select>
      </div>

      {/* table */}
      <div className="mt-4 overflow-x-auto rounded-lg border border-panel-border">
        <table className="min-w-[1000px] w-full text-sm">
          <thead className="text-neutral-600 bg-table-head-bg">
            <tr>
              <th className="px-4 py-3 text-left">Created</th>
              <th className="px-4 py-3 text-left">Bride</th>
              <th className="px-4 py-3 text-left">Groom</th>
              <th className="px-4 py-3 text-left">Contacts</th>
              <th className="px-4 py-3 text-left">Meta</th>
              <th className="px-4 py-3 text-left">Flags</th>
              <th className="px-4 py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={`s-${i}`} className="animate-pulse">
                  <td className="px-4 py-3"><div className="h-4 w-24 rounded bg-panel-border/60" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-32 rounded bg-panel-border/60" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-32 rounded bg-panel-border/60" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-48 rounded bg-panel-border/60" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-28 rounded bg-panel-border/60" /></td>
                  <td className="px-4 py-3"><div className="h-5 w-20 rounded bg-panel-border/60" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-16 rounded bg-panel-border/60" /></td>
                </tr>
              ))}

            {!loading && rows.map((r) => (
              <tr key={r.id} className="border-t border-panel-border align-top transition-colors">
                <td className="px-4 py-3 text-foreground">{new Date(r.createdAt).toLocaleString("ko-KR")}</td>

                <td className="px-4 py-3 text-foreground">
                  <div className="font-medium">
                    <EditableCell value={r.brideName} placeholder="신부 이름" onSave={(v) => saveField(r.id, "bride_name", v)} />
                  </div>
                  <div className="text-neutral-600 dark:text-neutral-400 text-[12px]">
                    <EditableCell value={r.bridePhone} placeholder="신부 전화번호" onSave={(v) => saveField(r.id, "bride_phone", v.replace(/[^\d]/g, ""))} />
                  </div>
                  <div className="text-neutral-600 dark:text-neutral-400 text-[12px]">
                    <EditableCell value={r.brideEmail} placeholder="신부 이메일" onSave={(v) => saveField(r.id, "bride_email", v)} />
                  </div>
                </td>

                <td className="px-4 py-3 text-foreground">
                  <div className="font-medium">
                    <EditableCell value={r.groomName} placeholder="신랑 이름" onSave={(v) => saveField(r.id, "groom_name", v)} />
                  </div>
                  <div className="text-neutral-600 dark:text-neutral-400 text-[12px]">
                    <EditableCell value={r.groomPhone} placeholder="신랑 전화번호" onSave={(v) => saveField(r.id, "groom_phone", v.replace(/[^\d]/g, ""))} />
                  </div>
                  <div className="text-neutral-600 dark:text-neutral-400 text-[12px]">
                    <EditableCell value={r.groomEmail} placeholder="신랑 이메일" onSave={(v) => saveField(r.id, "groom_email", v)} />
                  </div>
                </td>

                <td className="px-4 py-3 text-foreground">
                  <div>{r.brideEmail || r.groomEmail || "-"}</div>
                  <div className="text-neutral-600 dark:text-neutral-400 text-[12px]">{r.bridePhone || r.groomPhone || "-"}</div>
                </td>

                <td className="px-4 py-3 text-foreground">
                  <div>{r.expectedVenue || "-"}</div>
                  <div className="text-neutral-600 dark:text-neutral-400 text-[12px]">
                    {r.weddingPlannedOn ? new Date(r.weddingPlannedOn).toLocaleDateString() : "-"}
                  </div>
                  <div className="text-neutral-600 dark:text-neutral-400 text-[12px]">{r.source || "-"}</div>
                </td>

                <td className="px-4 py-3 text-foreground space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-foreground">visited</span>
                    <Switch checked={r.visited} onChange={(v) => toggleLead(r.id, "visited", v)} />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-foreground">consent</span>
                    <Switch checked={r.consent} onChange={(v) => toggleLead(r.id, "consent", v)} />
                  </div>
                </td>

                <td className="px-4 py-3">
                  <Button onClick={() => removeLead(r.id)}>삭제</Button>
                </td>
              </tr>
            ))}

            {!loading && !err && rows.length === 0 && (
              <tr>
                <td className="px-4 py-16 text-center text-neutral-600" colSpan={7}>
                  데이터가 없습니다. 첫 리드를 생성해 보세요.
                </td>
              </tr>
            )}

            {err && !loading && (
              <tr>
                <td className="px-4 py-12 text-center" colSpan={7}>
                  <div className="text-red-700 font-medium mb-2">오류가 발생했습니다</div>
                  <div className="text-red-600 text-sm mb-4">{err}</div>
                  <Button onClick={fetchList} className="text-red-700 border-red-300 hover:bg-red-50">재시도</Button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Load More */}
      <div className="flex justify-center py-4">
        <Button onClick={loadMore} disabled={!nextCursor || isLoadingMore}>
          {nextCursor ? (isLoadingMore ? "불러오는 중…" : "더 보기") : "더 없음"}
        </Button>
      </div>

      {/* New Lead Modal */}
      <Modal open={openNew} onClose={() => setOpenNew(false)} title="New Lead">
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-foreground">신부 이름 *</label>
              <Input value={newLead.bride_name} onChange={(e) => setNewLead((s) => ({ ...s, bride_name: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") createLead(); }} placeholder="예: 김하늘" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-foreground">신랑 이름 *</label>
              <Input value={newLead.groom_name} onChange={(e) => setNewLead((s) => ({ ...s, groom_name: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") createLead(); }} placeholder="예: 박서준" />
            </div>
            <div>
              <label className="mb-1 block text-sm text-foreground">신부 전화</label>
              <Input
                value={display010(newLead.bride_phone)}
                onChange={(e) => setNewLead((s) => ({ ...s, bride_phone: normalize010Input(e.target.value) }))}
                onKeyDown={(e) => { if (e.key === "Enter") createLead(); }}
                onFocus={(e) => {
                  // Ensure prefix exists on first focus
                  if (!newLead.bride_phone) {
                    setNewLead((s) => ({ ...s, bride_phone: "010-" }));
                  }
                  const el = e.currentTarget;
                  requestAnimationFrame(() => {
                    const v = el.value || "";
                    const pos = v.startsWith("010-") ? 4 : v.length;
                    try { el.setSelectionRange(pos, pos); } catch {}
                  });
                }}
                placeholder="010-"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-foreground">신랑 전화</label>
              <Input
                value={display010(newLead.groom_phone)}
                onChange={(e) => setNewLead((s) => ({ ...s, groom_phone: normalize010Input(e.target.value) }))}
                onKeyDown={(e) => { if (e.key === "Enter") createLead(); }}
                onFocus={(e) => {
                  // Ensure prefix exists on first focus
                  if (!newLead.groom_phone) {
                    setNewLead((s) => ({ ...s, groom_phone: "010-" }));
                  }
                  const el = e.currentTarget;
                  requestAnimationFrame(() => {
                    const v = el.value || "";
                    const pos = v.startsWith("010-") ? 4 : v.length;
                    try { el.setSelectionRange(pos, pos); } catch {}
                  });
                }}
                placeholder="010-"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-foreground">Source</label>
              <select
                value={newLead.source}
                onChange={(e) => setNewLead((s) => ({ ...s, source: e.target.value }))}
                className="w-full rounded-md border px-3 py-2 text-sm bg-panel text-foreground border-panel-border cursor-pointer"
              >
                {LEAD_SOURCES.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button onClick={() => setOpenNew(false)}>취소</Button>
            <Button onClick={createLead} disabled={savingNew}>{savingNew ? "저장중…" : "저장"}</Button>
          </div>
        </div>
      </Modal>
    </Shell>
  );
}

/** 인라인 편집에 쓰이는 소형 컴포넌트 */
function EditableCell({
  value, placeholder, onSave,
}: { value: string | null; placeholder?: string; onSave: (v: string) => Promise<void> }) {
  const isPhone = /전화/.test(placeholder ?? "");
  const [editing, setEditing] = useState(false);
  function formatForInput(raw: string | null) {
    const v = raw ?? "";
    if (!isPhone) return v;
    const d = v.replace(/\D/g, "");
    if (!d) return "";
    if (d.length <= 3) return d;
    if (d.length <= 7) return `${d.slice(0,3)}-${d.slice(3)}`;
    return `${d.slice(0,3)}-${d.slice(3,7)}-${d.slice(7,11)}`;
  }
  const [val, setVal] = useState(() => formatForInput(value));
  const openEditor = () => {
    setVal(formatForInput(value));
    setEditing(true);
  };

  async function commit() {
    const v = value ?? "";
    if (isPhone) {
      const digits = val.replace(/\D/g, "");
      const prevDigits = (value ?? "").replace(/\D/g, "");
      if (digits.length <= 3) {
        if (!prevDigits.length) {
          setVal("");
          setEditing(false);
          return;
        }
        try {
          await onSave("");
          setVal(formatForInput(""));
          setEditing(false);
        } catch {
          alert("저장 실패");
        }
        return;
      }

      if (digits.length !== 11 || !digits.startsWith("010")) {
        alert("전화번호는 010으로 시작하는 11자리여야 합니다.");
        const formattedPartial = fmtPhoneKR(digits);
        setVal(formattedPartial);
        return;
      }

      const formatted = fmtPhoneKR(digits);
      if (digits === prevDigits) {
        setVal(formatted);
        setEditing(false);
        return;
      }

      try {
        await onSave(formatted);
        setVal(formatted);
        setEditing(false);
      } catch {
        alert("저장 실패");
      }
      return;
    }

    const trimmed = val.trim();
    if (trimmed === (value ?? "")) { setEditing(false); return; }
    try {
      await onSave(trimmed);
      setEditing(false);
    } catch {
      alert("저장 실패");
    }
  }

  if (!editing) {
    return (
      <div className="cursor-pointer whitespace-pre-wrap rounded p-1 transition-colors" onDoubleClick={openEditor} title="더블클릭하여 수정">
        {value || <span className="text-neutral-500">{placeholder ?? "-"}</span>}
      </div>
    );
  }
  return (
    <input
      autoFocus
      value={val}
      onChange={(e) => {
        const v = e.target.value;
        if (!isPhone) { setVal(v); return; }
        const digits = v.replace(/\D/g, "").slice(0, 11);
        if (digits.length === 0) {
          setVal("");
          return;
        }
        if (!digits.startsWith("010")) {
          // Enforce local convention of 010 prefix while editing
          setVal(fmtPhoneKR(`010${digits.slice(3)}`));
          return;
        }
        if (digits.length <= 3) {
          setVal("010-");
        } else if (digits.length <= 7) {
          setVal(`${digits.slice(0,3)}-${digits.slice(3)}`);
        } else {
          setVal(`${digits.slice(0,3)}-${digits.slice(3,7)}-${digits.slice(7,11)}`);
        }
      }}
      onFocus={(e) => {
        if (isPhone && !val) {
          setVal('010-');
          const el = e.currentTarget;
          requestAnimationFrame(() => { try { el.setSelectionRange(4,4); } catch {} });
        }
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") {
          setEditing(false);
          setVal(formatForInput(value));
        }
      }}
      className="w-full rounded border px-2 py-1 text-sm outline-none transition-colors bg-panel text-foreground border-panel-border focus:ring-2 focus:ring-panel-border"
      placeholder={placeholder}
    />
  );
}
