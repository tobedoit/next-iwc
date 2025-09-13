// === File: src/app/appointments/page.tsx ===
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Shell from "@/app/components/Shell";
import { StatCard } from "@/app/components/StatCard";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { supabaseBrowser } from "@/lib/supabase/browser";

export type Appointment = {
  id: string;
  orgId: string;
  customerId: string | null;
  staffId: string | null;
  kind: "visit" | "phone" | "check";
  startAt: string; // ISO
  endAt: string;   // ISO
  status: "scheduled" | "done" | "canceled";
  note: string | null;
  createdAt: string; // ISO
};

type ApptListResponse = { ok: boolean; rows: Appointment[]; nextCursor: string | null };

function normalizeAppt(row: any): Appointment {
  return {
    id: row.id,
    orgId: row.orgId ?? row.org_id,
    customerId: row.customerId ?? row.customer_id ?? null,
    staffId: row.staffId ?? row.staff_id ?? null,
    kind: row.kind,
    startAt: row.startAt ?? row.start_at,
    endAt: row.endAt ?? row.end_at,
    status: row.status,
    note: row.note ?? null,
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
        "disabled:text-[color:var(--muted)] disabled:opacity-60 disabled:cursor-not-allowed " +
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
function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={
        "rounded-md border px-3 py-2 text-sm outline-none cursor-pointer " +
        "bg-[var(--panel)] text-[var(--foreground)] border-[var(--panel-border)] focus:ring-2 focus:ring-[var(--panel-border)] " +
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
      className={`h-6 w-11 rounded-full border px-0.5 transition
        ${checked ? "bg-green-500/90 border-green-600" : "bg-neutral-200 border-neutral-300 dark:bg-neutral-700 dark:border-neutral-600"}
        ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      aria-pressed={checked}
    >
      <span className={`block h-5 w-5 rounded-full bg-white shadow transition ${checked ? "translate-x-5" : "translate-x-0"}`} />
    </button>
  );
}
function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border px-2 py-0.5 text-[11px] text-neutral-600 bg-neutral-50">
      {children}
    </span>
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
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value ?? "");
  useEffect(() => setVal(value ?? ""), [value]);

  async function commit() {
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
      onChange={(e) => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
      className="w-full rounded border px-2 py-1 text-sm outline-none transition-colors bg-[var(--panel)] text-[var(--foreground)] border-[var(--panel-border)] focus:ring-2 focus:ring-[var(--panel-border)]"
      placeholder={placeholder}
    />
  );
}

/* ---------- Page ---------- */
export default function AppointmentsPage() {
  // list
  const [rows, setRows] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // server filters
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"" | "visit" | "phone" | "check">("");
  const [status, setStatus] = useState<"" | "scheduled" | "done" | "canceled">("");
  const [from, setFrom] = useState<string>(""); // yyyy-MM-dd or yyyy-MM-ddTHH:mm
  const [to, setTo] = useState<string>("");

  // sort & pagination
  const [sort, setSort] = useState<"start_at.desc" | "start_at.asc">("start_at.desc");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // create modal
  const [openNew, setOpenNew] = useState(false);
  const [savingNew, setSavingNew] = useState(false);
  const [newAppt, setNewAppt] = useState({
    kind: "visit" as "visit" | "phone" | "check",
    status: "scheduled" as "scheduled" | "done" | "canceled",
    start_at: "",
    end_at: "",
    note: "",
    customer_id: "" as string | undefined,
    staff_id: "" as string | undefined,
  });

  // debounce search
  const [debouncedQ, setDebouncedQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  /* ----- fetch ----- */
  const fetchList = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const params = new URLSearchParams();
      if (debouncedQ) params.set("q", debouncedQ);
      if (kind) params.set("kind", kind);
      if (status) params.set("status", status);
      if (from) params.set("from", normalizeDateParam(from));
      if (to) params.set("to", normalizeDateParam(to));
      params.set("sort", sort);
      params.set("limit", "50");

      const data = await apiGet<ApptListResponse>(`/api/appointments?${params}`);
      setRows((data.rows ?? []).map(normalizeAppt));
      setNextCursor(data.nextCursor ?? null);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [debouncedQ, kind, status, from, to, sort]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const loadMore = useCallback(async () => {
    if (!nextCursor) return;
    setIsLoadingMore(true);
    try {
      const params = new URLSearchParams();
      if (debouncedQ) params.set("q", debouncedQ);
      if (kind) params.set("kind", kind);
      if (status) params.set("status", status);
      if (from) params.set("from", normalizeDateParam(from));
      if (to) params.set("to", normalizeDateParam(to));
      params.set("sort", sort);
      params.set("limit", "50");
      params.set("after", nextCursor);

      const data = await apiGet<ApptListResponse>(`/api/appointments?${params}`);
      setRows((prev) => [...prev, ...(data.rows ?? []).map(normalizeAppt)]);
      setNextCursor(data.nextCursor ?? null);
    } catch {
      // noop
    } finally {
      setIsLoadingMore(false);
    }
  }, [debouncedQ, kind, status, from, to, sort, nextCursor]);

  /* ----- realtime ----- */
  useEffect(() => {
    const supabase = supabaseBrowser();
    const orgId = typeof window !== "undefined" ? localStorage.getItem("org_id") : null;
    if (!orgId) return;

    const channel = supabase
      .channel(`appointments:${orgId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments", filter: `org_id=eq.${orgId}` },
        (payload) => {
          setRows((prev) => {
            if (payload.eventType === "INSERT") return [normalizeAppt(payload.new), ...prev];
            if (payload.eventType === "UPDATE") {
              const next = normalizeAppt(payload.new);
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
  async function createAppt() {
    if (!newAppt.start_at || !newAppt.end_at) {
      alert("시작/종료 시간을 입력하세요."); return;
    }
    setSavingNew(true);
    try {
      const res = await apiPost<{ ok: boolean; row: Appointment }>("/api/appointments", newAppt);
      setRows((s) => [normalizeAppt(res.row), ...s]);
      setOpenNew(false);
      setNewAppt({
        kind: "visit",
        status: "scheduled",
        start_at: "",
        end_at: "",
        note: "",
        customer_id: "",
        staff_id: "",
      });
    } catch {
      alert("생성 실패");
    } finally {
      setSavingNew(false);
    }
  }

  async function updateField(id: string, patch: Partial<Record<keyof Appointment, any>>) {
    try {
      await apiPatch("/api/appointments", { id, ...patchToSnake(patch) });
      setRows((prev) =>
        prev.map((r) => (r.id === id ? ({ ...r, ...patch } as Appointment) : r))
      );
    } catch {
      await fetchList();
      alert("업데이트 실패");
    }
  }

  async function removeAppt(id: string) {
    if (!confirm("삭제할까요?")) return;
    const prev = rows;
    setRows((s) => s.filter((r) => r.id !== id));
    try {
      await apiDelete(`/api/appointments?id=${encodeURIComponent(id)}`);
    } catch {
      setRows(prev);
      alert("삭제 실패");
    }
  }

  /* ----- derived stats ----- */
  const upcoming24h = useMemo(() => {
    const now = Date.now();
    const day = 24 * 3600 * 1000;
    return rows.filter((r) => {
      const start = Date.parse(r.startAt);
      return start > now && start - now < day;
    }).length;
  }, [rows]);

  /* ----- helpers ----- */
  function patchToSnake(patch: Partial<Record<keyof Appointment, any>>) {
    const out: any = {};
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue;
      if (k === "startAt") out.start_at = v;
      else if (k === "endAt") out.end_at = v;
      else out[k] = v;
    }
    return out;
  }
  function normalizeDateParam(s: string) {
    // datetime-local 값(YYYY-MM-DDTHH:mm)을 ISO로 바꾸지 않아도 서버 Date.parse 가능.
    // 단, 타임존 혼동 방지 위해 그대로 전달.
    return s;
  }

  return (
    <Shell title="Appointments">
      {/* header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">Appointments</h1>
        <div className="flex items-center gap-2">
          <Button onClick={() => setOpenNew(true)}>+ New</Button>
          <Button onClick={fetchList}>Refresh</Button>
          <Button onClick={() => setSort((s) => (s === "start_at.desc" ? "start_at.asc" : "start_at.desc"))}>
            정렬: {sort === "start_at.desc" ? "최근 일정 먼저" : "오래된 일정 먼저"}
          </Button>
        </div>
      </div>

      {/* stats */}
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="총 일정" value={rows.length} />
        <StatCard label="24시간 내 예정" value={upcoming24h} />
        <StatCard label="표시 중" value={rows.length} />
        <StatCard label="상태: 진행중" value={rows.filter((r) => r.status === "scheduled").length} />
      </div>

      {/* filters */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Input placeholder="검색(q): kind/status/note…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select value={kind} onChange={(e) => setKind(e.target.value as any)}>
          <option value="">kind: All</option>
          <option value="visit">visit</option>
          <option value="phone">phone</option>
          <option value="check">check</option>
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value as any)}>
          <option value="">status: All</option>
          <option value="scheduled">scheduled</option>
          <option value="done">done</option>
          <option value="canceled">canceled</option>
        </Select>
        <Input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
        <span>~</span>
        <Input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

      {/* table */}
      <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--panel-border)]">
        <table className="min-w-[1000px] w-full text-sm">
          <thead className="bg-[var(--table-head-bg)] text-neutral-600">
            <tr>
              <th className="px-4 py-3 text-left">When</th>
              <th className="px-4 py-3 text-left">Kind</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Note</th>
              <th className="px-4 py-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={`s-${i}`} className="animate-pulse">
                  <td className="px-4 py-3"><div className="h-4 w-52 rounded bg-[var(--panel-border)]/60" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-16 rounded bg-[var(--panel-border)]/60" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-24 rounded bg-[var(--panel-border)]/60" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-48 rounded bg-[var(--panel-border)]/60" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-24 rounded bg-[var(--panel-border)]/60" /></td>
                </tr>
              ))}

            {!loading && rows.map((r) => {
              const start = new Date(r.startAt);
              const end = new Date(r.endAt);
              const when = `${start.toLocaleString("ko-KR")} ~ ${end.toLocaleTimeString("ko-KR")}`;
              return (
                <tr key={r.id} className="border-t border-[var(--panel-border)] align-top">
                  <td className="px-4 py-3 text-[var(--foreground)]">{when}</td>

                  <td className="px-4 py-3">
                    <Select
                      value={r.kind}
                      onChange={(e) => updateField(r.id, { kind: e.target.value })}
                    >
                      <option value="visit">visit</option>
                      <option value="phone">phone</option>
                      <option value="check">check</option>
                    </Select>
                  </td>

                  <td className="px-4 py-3">
                    <Select
                      value={r.status}
                      onChange={(e) => updateField(r.id, { status: e.target.value })}
                    >
                      <option value="scheduled">scheduled</option>
                      <option value="done">done</option>
                      <option value="canceled">canceled</option>
                    </Select>
                  </td>

                  <td className="px-4 py-3 text-[var(--foreground)]">
                    <EditableCell
                      value={r.note}
                      placeholder="메모"
                      onSave={(v) => updateField(r.id, { note: v })}
                    />
                  </td>

                  <td className="px-4 py-3">
                    <Button onClick={() => removeAppt(r.id)}>삭제</Button>
                  </td>
                </tr>
              );
            })}

            {!loading && !err && rows.length === 0 && (
              <tr>
                <td className="px-4 py-16 text-center text-neutral-600" colSpan={5}>
                  데이터가 없습니다. 첫 일정을 생성해 보세요.
                </td>
              </tr>
            )}

            {err && !loading && (
              <tr>
                <td className="px-4 py-12 text-center text-red-700" colSpan={5}>
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

      {/* New Appointment Modal */}
      <Modal open={openNew} onClose={() => setOpenNew(false)} title="New Appointment">
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm text-neutral-700">Kind</label>
              <Select
                value={newAppt.kind}
                onChange={(e) => setNewAppt((s) => ({ ...s, kind: e.target.value as any }))}
              >
                <option value="visit">visit</option>
                <option value="phone">phone</option>
                <option value="check">check</option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-neutral-700">Status</label>
              <Select
                value={newAppt.status}
                onChange={(e) => setNewAppt((s) => ({ ...s, status: e.target.value as any }))}
              >
                <option value="scheduled">scheduled</option>
                <option value="done">done</option>
                <option value="canceled">canceled</option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-neutral-700">Start</label>
              <Input
                type="datetime-local"
                value={newAppt.start_at}
                onChange={(e) => setNewAppt((s) => ({ ...s, start_at: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-neutral-700">End</label>
              <Input
                type="datetime-local"
                value={newAppt.end_at}
                onChange={(e) => setNewAppt((s) => ({ ...s, end_at: e.target.value }))}
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm text-neutral-700">Note</label>
              <Input
                value={newAppt.note}
                onChange={(e) => setNewAppt((s) => ({ ...s, note: e.target.value }))}
                placeholder="간단 메모"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button onClick={() => setOpenNew(false)}>취소</Button>
            <Button onClick={createAppt} disabled={savingNew}>
              {savingNew ? "저장중…" : "저장"}
            </Button>
          </div>
        </div>
      </Modal>
    </Shell>
  );
}
