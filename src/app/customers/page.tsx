// === File: src/app/customers/page.tsx ===
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Shell from "@/app/components/Shell";
import { StatCard } from "@/app/components/StatCard";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { supabaseBrowser } from "@/lib/supabase/browser";

/* ---------- Types ---------- */
type Customer = {
  id: string;
  orgId: string;
  name: string;
  phone: string;
  email: string | null;
  addr1: string | null;
  addr2: string | null;
  createdAt: string;
};
type CustomerListResponse = { ok: boolean; rows: Customer[]; nextCursor: string | null };

function normalizeCustomer(row: any): Customer {
  return {
    id: row.id,
    orgId: row.orgId ?? row.org_id,
    name: row.name,
    phone: String(row.phone ?? ""),
    email: row.email ?? null,
    addr1: row.addr1 ?? null,
    addr2: row.addr2 ?? null,
    createdAt: row.createdAt ?? row.created_at,
  };
}

/* ---------- Small UI bits ---------- */
function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={
        "rounded-md border px-3 py-2 text-sm active:scale-[0.99] cursor-pointer " +
        "bg-[var(--panel)] text-[var(--foreground)] border-[var(--panel-border)] hover:bg-[var(--table-head-bg)] " +
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
        "bg-[var(--panel)] text-[var(--foreground)] border-[var(--panel-border)] placeholder:[color:var(--muted)] focus:ring-2 focus:ring-[var(--panel-border)] " +
        (props.className ?? "")
      }
    />
  );
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-xl rounded-xl p-5 shadow-xl bg-[var(--panel)] border border-[var(--panel-border)] text-[var(--foreground)]">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-[var(--foreground)]">{title}</h3>
          <button onClick={onClose} className="text-[color:var(--muted)] hover:text-[var(--foreground)]">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
function EditableCell({
  value, placeholder, onSave,
}: { value: string | null; placeholder?: string; onSave: (v: string) => Promise<void> }) {
  const isPhone = /전화/.test(placeholder ?? "");
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(() => {
    const v = value ?? "";
    if (!isPhone) return v;
    const d = v.replace(/\D/g, "");
    if (!d) return "";
    if (d.length <= 3) return d;
    if (d.length <= 7) return `${d.slice(0,3)}-${d.slice(3)}`;
    return `${d.slice(0,3)}-${d.slice(3,7)}-${d.slice(7,11)}`;
  });
  useEffect(() => {
    const v = value ?? "";
    if (!isPhone) { setVal(v); return; }
    const d = v.replace(/\D/g, "");
    if (!d) { setVal(""); return; }
    if (d.length <= 3) setVal(d);
    else if (d.length <= 7) setVal(`${d.slice(0,3)}-${d.slice(3)}`);
    else setVal(`${d.slice(0,3)}-${d.slice(3,7)}-${d.slice(7,11)}`);
  }, [value, isPhone]);

  async function commit() {
    const out = isPhone ? val.replace(/\D/g, "") : val.trim();
    if (out === (isPhone ? (value ?? "").replace(/\D/g, "") : (value ?? "").trim())) { setEditing(false); return; }
    try {
      await onSave(out);
      setEditing(false);
    } catch {
      alert("저장 실패");
    }
  }

  if (!editing) {
    return (
      <div
        className="cursor-pointer whitespace-pre-wrap rounded p-1"
        onDoubleClick={() => setEditing(true)}
        title="더블클릭하여 수정"
      >
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
        const d = v.replace(/\D/g, "").slice(0,11);
        if (d.length <= 3) setVal(d);
        else if (d.length <= 7) setVal(`${d.slice(0,3)}-${d.slice(3)}`);
        else setVal(`${d.slice(0,3)}-${d.slice(3,7)}-${d.slice(7,11)}`);
      }}
      onFocus={(e) => {
        if (isPhone && !val) {
          setVal('010-');
          const el = e.currentTarget;
          requestAnimationFrame(() => { try { el.setSelectionRange(4,4); } catch {} });
        }
      }}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
      className="w-full rounded border px-2 py-1 text-sm outline-none transition-colors bg-[var(--panel)] text-[var(--foreground)] border-[var(--panel-border)] focus:ring-2 focus:ring-[var(--panel-border)]"
      placeholder={placeholder}
    />
  );
}

// Phone helpers for single-field UX with fixed 010- prefix
function onlyDigits(s: string) { return s.replace(/\D/g, ""); }
function normalize010Input(s: string) {
  const d = onlyDigits(s);
  const tail = d.startsWith("010") ? d.slice(3) : d;
  return `010${tail.slice(0,8)}`;
}
function display010(full?: string | null) {
  const d = onlyDigits(full || "");
  if (!d) return "";
  const tail = d.startsWith("010") ? d.slice(3) : d;
  if (tail.length === 0) return "010-";
  if (tail.length <= 4) return `010-${tail}`;
  return `010-${tail.slice(0,4)}-${tail.slice(4,8)}`;
}
/* ---------- Page ---------- */
export default function CustomersPage() {
  // list & errors
  const [rows, setRows] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // server filters
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

  // sort & pagination
  const [sort, setSort] = useState<"created_at.desc" | "created_at.asc">("created_at.desc");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // new customer modal
  const [openNew, setOpenNew] = useState(false);
  const [savingNew, setSavingNew] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    name: "",
    phone: "",
    email: "",
    addr1: "",
    addr2: "",
    memo: "",
  });

  // debounce q
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  /* ----- fetch list ----- */
  const fetchList = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const params = new URLSearchParams();
      if (debouncedQ) params.set("q", debouncedQ);
      params.set("sort", sort);
      params.set("limit", "50");

      const data = await apiGet<CustomerListResponse>(`/api/customers?${params}`);
      setRows((data.rows ?? []).map(normalizeCustomer));
      setNextCursor(data.nextCursor ?? null);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [debouncedQ, sort]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const loadMore = useCallback(async () => {
    if (!nextCursor) return;
    setIsLoadingMore(true);
    try {
      const params = new URLSearchParams();
      if (debouncedQ) params.set("q", debouncedQ);
      params.set("sort", sort);
      params.set("limit", "50");
      params.set("after", nextCursor);

      const data = await apiGet<CustomerListResponse>(`/api/customers?${params}`);
      setRows((prev) => [...prev, ...(data.rows ?? []).map(normalizeCustomer)]);
      setNextCursor(data.nextCursor ?? null);
    } catch {
      // noop
    } finally {
      setIsLoadingMore(false);
    }
  }, [debouncedQ, sort, nextCursor]);

  /* ----- realtime ----- */
  useEffect(() => {
    const supabase = supabaseBrowser();
    const orgId = typeof window !== "undefined" ? localStorage.getItem("org_id") : null;

    const channel = supabase
      .channel(`customers:${orgId ?? "all"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "customers", filter: orgId ? `org_id=eq.${orgId}` : undefined },
        (payload) => {
          setRows((prev) => {
            if (payload.eventType === "INSERT") return [normalizeCustomer(payload.new), ...prev];
            if (payload.eventType === "UPDATE") {
              const next = normalizeCustomer(payload.new);
              return prev.map((r) => (r.id === next.id ? next : r));
            }
            if (payload.eventType === "DELETE") {
              const oldId = (payload.old as any).id;
              return prev.filter((r) => r.id !== oldId);
            }
            return prev;
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  /* ----- actions ----- */
  async function createCustomer() {
    if (!newCustomer.name.trim() || !newCustomer.phone.trim()) {
      alert("이름/전화는 필수입니다.");
      return;
    }
    // 전화는 하이픈 포함 포맷으로 저장
    const payload = { ...newCustomer, phone: display010(newCustomer.phone) };
    setSavingNew(true);
    try {
      const res = await apiPost<{ ok: boolean; row: Customer }>("/api/customers", payload);
      setRows((s) => [normalizeCustomer(res.row), ...s]);
      setOpenNew(false);
      setNewCustomer({ name: "", phone: "", email: "", addr1: "", addr2: "", memo: "" });
    } catch {
      alert("생성 실패");
    } finally {
      setSavingNew(false);
    }
  }

  async function updateField(id: string, patch: Partial<Record<keyof Customer, any>>) {
    try {
      const body: any = {};
      for (const [k, v] of Object.entries(patch)) {
        if (k === "phone" && typeof v === "string") body.phone = display010(v);
        else body[k] = v;
      }
      await apiPatch("/api/customers", { id, ...body });
      setRows((prev) => prev.map((r) => (r.id === id ? ({ ...r, ...body } as Customer) : r)));
    } catch {
      await fetchList();
      alert("업데이트 실패");
    }
  }

  async function removeCustomer(id: string) {
    if (!confirm("삭제할까요?")) return;
    const prev = rows;
    setRows((s) => s.filter((r) => r.id !== id));
    try {
      await apiDelete(`/api/customers?id=${encodeURIComponent(id)}`);
    } catch {
      setRows(prev);
      alert("삭제 실패");
    }
  }

  /* ----- derived ----- */
  const new7d = useMemo(
    () => rows.filter(r => Date.now() - Date.parse(r.createdAt) < 7 * 24 * 3600 * 1000).length,
    [rows]
  );

  return (
    <Shell title="Customers">
      {/* header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">Customers</h1>
        <div className="flex items-center gap-2">
          <Button onClick={() => setOpenNew(true)}>+ New Customer</Button>
          <Button onClick={fetchList}>Refresh</Button>
          <Button onClick={() => setSort((s) => (s === "created_at.desc" ? "created_at.asc" : "created_at.desc"))}>
            정렬: {sort === "created_at.desc" ? "최신순" : "오래된순"}
          </Button>
        </div>
      </div>

      {/* stats */}
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="총 고객" value={rows.length} />
        <StatCard label="이번주 신규" value={new7d} />
        <StatCard label="표시 중" value={rows.length} />
      </div>

      {/* search */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md">
          <Input
            placeholder="Search name / email / phone / addr..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="text-sm [color:var(--muted)]">
          {loading ? "Loading..." : `${rows.length} results`}
        </div>
      </div>

      {/* table */}
      <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--panel-border)]">
        <table className="min-w-[900px] w-full text-sm">
          <thead className="bg-[var(--table-head-bg)] text-neutral-600">
            <tr>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Phone</th>
              <th className="px-4 py-3 text-left">Email</th>
              <th className="px-4 py-3 text-left">Address</th>
              <th className="px-4 py-3 text-left">Created</th>
              <th className="px-4 py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={`s-${i}`} className="animate-pulse">
                  <td className="px-4 py-3"><div className="h-4 w-32 rounded bg-neutral-200" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-28 rounded bg-neutral-200" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-44 rounded bg-neutral-200" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-40 rounded bg-neutral-200" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-24 rounded bg-neutral-200" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-16 rounded bg-neutral-200" /></td>
                </tr>
              ))}

            {!loading &&
              rows
                .filter((r) => {
                  if (!debouncedQ) return true;
                  const s = debouncedQ.toLowerCase();
                  return [r.name, r.email, r.phone, r.addr1, r.addr2]
                    .some((x) => (x ?? "").toLowerCase().includes(s));
                })
                .map((c) => (
                  <tr key={c.id} className="border-t border-[var(--panel-border)]">
                    <td className="px-4 py-3 font-medium text-[var(--foreground)]">
                      <EditableCell
                        value={c.name}
                        placeholder="이름"
                        onSave={(v) => updateField(c.id, { name: v })}
                      />
                    </td>
                    <td className="px-4 py-3 text-[var(--foreground)]">
                      <EditableCell
                        value={c.phone ? (String(c.phone).replace(/\D/g, "").length ? (String(c.phone).replace(/\D/g, "").length<=3 ? String(c.phone).replace(/\D/g, "") : String(c.phone).replace(/\D/g, "").length<=7 ? `${String(c.phone).replace(/\D/g, "").slice(0,3)}-${String(c.phone).replace(/\D/g, "").slice(3)}` : `${String(c.phone).replace(/\D/g, "").slice(0,3)}-${String(c.phone).replace(/\D/g, "").slice(3,7)}-${String(c.phone).replace(/\D/g, "").slice(7,11)}`) : c.phone) : c.phone}
                        placeholder="전화번호"
                        onSave={(v) => updateField(c.id, { phone: v })}
                      />
                    </td>
                    <td className="px-4 py-3 text-[var(--foreground)]">
                      <EditableCell
                        value={c.email}
                        placeholder="email"
                        onSave={(v) => updateField(c.id, { email: v })}
                      />
                    </td>
                    <td className="px-4 py-3 text-[var(--foreground)]">
                      <div className="grid grid-cols-1 gap-1">
                        <EditableCell
                          value={c.addr1}
                          placeholder="addr1"
                          onSave={(v) => updateField(c.id, { addr1: v })}
                        />
                        <EditableCell
                          value={c.addr2}
                          placeholder="addr2"
                          onSave={(v) => updateField(c.id, { addr2: v })}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 [color:var(--muted)]">
                      {new Date(c.createdAt).toLocaleDateString("ko-KR")}
                    </td>
                    <td className="px-4 py-3">
                      <Button onClick={() => removeCustomer(c.id)}>삭제</Button>
                    </td>
                  </tr>
                ))}

            {!loading && !err && rows.length === 0 && (
              <tr>
                <td className="px-4 py-16 text-center text-neutral-600" colSpan={6}>
                  데이터가 없습니다. 첫 고객을 생성해 보세요.
                </td>
              </tr>
            )}

            {err && !loading && (
              <tr>
                <td className="px-4 py-12 text-center text-red-700" colSpan={6}>
                  {err} <Button onClick={fetchList} className="ml-2">재시도</Button>
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

      {/* New Customer Modal */}
      <Modal open={openNew} onClose={() => setOpenNew(false)} title="New Customer">
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-neutral-700">이름 *</label>
              <Input
                value={newCustomer.name}
                onChange={(e) => setNewCustomer((s) => ({ ...s, name: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") createCustomer(); }}
                placeholder="예: 김하늘"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-neutral-700">전화 *</label>
              <Input
                value={display010(newCustomer.phone)}
                onChange={(e) => setNewCustomer((s) => ({ ...s, phone: normalize010Input(e.target.value) }))}
                onKeyDown={(e) => { if (e.key === "Enter") createCustomer(); }}
                onFocus={(e) => {
                  if (!newCustomer.phone) {
                    setNewCustomer((s) => ({ ...s, phone: "010" }));
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
              <label className="mb-1 block text-sm text-neutral-700">이메일</label>
              <Input
                value={newCustomer.email}
                onChange={(e) => setNewCustomer((s) => ({ ...s, email: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") createCustomer(); }}
                placeholder="name@example.com"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-neutral-700">주소 1</label>
              <Input
                value={newCustomer.addr1}
                onChange={(e) => setNewCustomer((s) => ({ ...s, addr1: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") createCustomer(); }}
                placeholder="시/군/구"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-neutral-700">주소 2</label>
              <Input
                value={newCustomer.addr2}
                onChange={(e) => setNewCustomer((s) => ({ ...s, addr2: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") createCustomer(); }}
                placeholder="상세 주소"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button onClick={() => setOpenNew(false)}>취소</Button>
            <Button onClick={createCustomer} disabled={savingNew}>
              {savingNew ? "저장중…" : "저장"}
            </Button>
          </div>
        </div>
      </Modal>
    </Shell>
  );
}
