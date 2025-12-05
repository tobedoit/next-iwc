// === File: src/app/appointments/page.tsx ===
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Shell from "@/app/components/Shell";
import { StatCard } from "@/app/components/StatCard";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

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
type AppointmentPatch = Partial<Pick<Appointment, "kind" | "status" | "note" | "startAt" | "endAt" >>;
type NewApptForm = {
  kind: Appointment["kind"];
  status: Appointment["status"];
  start_at: string;
  end_at: string;
  note: string;
  customer_id: string;
  staff_id: string;
};

type RawAppointment = Record<string, unknown> & {
  id?: unknown;
  orgId?: unknown;
  org_id?: unknown;
  customerId?: unknown;
  customer_id?: unknown;
  staffId?: unknown;
  staff_id?: unknown;
  kind?: unknown;
  startAt?: unknown;
  start_at?: unknown;
  endAt?: unknown;
  end_at?: unknown;
  status?: unknown;
  note?: unknown;
  createdAt?: unknown;
  created_at?: unknown;
};

const KIND_OPTIONS: Appointment["kind"][] = ["visit", "phone", "check"];
const STATUS_OPTIONS: Appointment["status"][] = ["scheduled", "done", "canceled"];
const INITIAL_NEW_APPT: NewApptForm = {
  kind: "visit",
  status: "scheduled",
  start_at: "",
  end_at: "",
  note: "",
  customer_id: "",
  staff_id: "",
};

function isKind(value: string): value is Appointment["kind"] {
  return KIND_OPTIONS.includes(value as Appointment["kind"]);
}

function isStatus(value: string): value is Appointment["status"] {
  return STATUS_OPTIONS.includes(value as Appointment["status"]);
}

function readString(obj: RawAppointment, ...keys: (keyof RawAppointment)[]): string {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string") return value;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function readNullableString(obj: RawAppointment, ...keys: (keyof RawAppointment)[]): string | null {
  for (const key of keys) {
    const value = obj[key];
    if (value === null) return null;
    if (typeof value === "string") return value;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "number") return String(value);
  }
  return null;
}

function normalizeAppt(row: unknown): Appointment {
  if (!row || typeof row !== "object") {
    throw new Error("Invalid appointment row");
  }
  const raw = row as RawAppointment;
  const kindValue = readString(raw, "kind");
  const statusValue = readString(raw, "status");

  return {
    id: readString(raw, "id"),
    orgId: readString(raw, "orgId", "org_id"),
    customerId: readNullableString(raw, "customerId", "customer_id"),
    staffId: readNullableString(raw, "staffId", "staff_id"),
    kind: isKind(kindValue) ? kindValue : "visit",
    startAt: readString(raw, "startAt", "start_at"),
    endAt: readString(raw, "endAt", "end_at"),
    status: isStatus(statusValue) ? statusValue : "scheduled",
    note: readNullableString(raw, "note"),
    createdAt: readString(raw, "createdAt", "created_at"),
  };
}

function patchToSnake(patch: AppointmentPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (key === "startAt") out.start_at = value;
    else if (key === "endAt") out.end_at = value;
    else out[key] = value;
  }
  return out;
}

function normalizeDateParam(value: string): string {
  return value;
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

/* ---------- Small UI bits ---------- */
function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={
        "rounded-md border px-3 py-2 text-sm active:scale-[0.99] cursor-pointer " +
        "bg-panel text-foreground border-panel-border hover:bg-table-head-bg " +
        "disabled:text-muted disabled:opacity-60 disabled:cursor-not-allowed " +
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
        "bg-panel text-foreground border-panel-border placeholder:text-muted focus:ring-2 focus:ring-panel-border " +
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
        "bg-panel text-foreground border-panel-border focus:ring-2 focus:ring-panel-border " +
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl rounded-xl p-5 shadow-xl bg-panel border border-panel-border text-foreground">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          <button onClick={onClose} className="text-muted hover:text-foreground">✕</button>
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
  const [val, setVal] = useState(() => value ?? "");

  const openEditor = () => {
    setVal(value ?? "");
    setEditing(true);
  };

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
        onDoubleClick={openEditor}
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
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") {
          setEditing(false);
          setVal(value ?? "");
        }
      }}
      className="w-full rounded border px-2 py-1 text-sm outline-none transition-colors bg-panel text-foreground border-panel-border focus:ring-2 focus:ring-panel-border"
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
  const [newAppt, setNewAppt] = useState<NewApptForm>(INITIAL_NEW_APPT);

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
    } catch (error) {
      setErr(extractErrorMessage(error));
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
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          setRows((prev) => {
            if (payload.eventType === "INSERT") return [normalizeAppt(payload.new), ...prev];
            if (payload.eventType === "UPDATE") {
              const next = normalizeAppt(payload.new);
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

  /* ----- actions ----- */
  async function createAppt() {
    if (!newAppt.start_at || !newAppt.end_at) {
      alert("시작/종료 시간을 입력하세요."); return;
    }
    setSavingNew(true);
    try {
      const payload: Record<string, unknown> = {
        kind: newAppt.kind,
        status: newAppt.status,
        start_at: newAppt.start_at,
        end_at: newAppt.end_at,
        note: newAppt.note,
      };
      if (newAppt.customer_id) payload.customer_id = newAppt.customer_id;
      if (newAppt.staff_id) payload.staff_id = newAppt.staff_id;

      const res = await apiPost<{ ok: boolean; row: Appointment }>("/api/appointments", payload);
      setRows((s) => [normalizeAppt(res.row), ...s]);
      setOpenNew(false);
      setNewAppt(INITIAL_NEW_APPT);
    } catch {
      alert("생성 실패");
    } finally {
      setSavingNew(false);
    }
  }

  async function updateField(id: string, patch: AppointmentPatch) {
    try {
      await apiPatch("/api/appointments", { id, ...patchToSnake(patch) });
      setRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
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
  return (
    <Shell title="Appointments">
      {/* header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Appointments</h1>
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
        <Select
          value={kind}
          onChange={(e) => {
            const value = e.target.value;
            if (!value) { setKind(""); return; }
            if (isKind(value)) setKind(value);
          }}
        >
          <option value="">kind: All</option>
          <option value="visit">visit</option>
          <option value="phone">phone</option>
          <option value="check">check</option>
        </Select>
        <Select
          value={status}
          onChange={(e) => {
            const value = e.target.value;
            if (!value) { setStatus(""); return; }
            if (isStatus(value)) setStatus(value);
          }}
        >
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
      <div className="mt-4 overflow-x-auto rounded-lg border border-panel-border">
        <table className="min-w-[1000px] w-full text-sm">
          <thead className="bg-table-head-bg text-neutral-600">
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
                  <td className="px-4 py-3"><div className="h-4 w-52 rounded bg-panel-border/60" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-16 rounded bg-panel-border/60" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-24 rounded bg-panel-border/60" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-48 rounded bg-panel-border/60" /></td>
                  <td className="px-4 py-3"><div className="h-4 w-24 rounded bg-panel-border/60" /></td>
                </tr>
              ))}

            {!loading && rows.map((r) => {
              const start = new Date(r.startAt);
              const end = new Date(r.endAt);
              const when = `${start.toLocaleString("ko-KR")} ~ ${end.toLocaleTimeString("ko-KR")}`;
              return (
                <tr key={r.id} className="border-t border-panel-border align-top">
                  <td className="px-4 py-3 text-foreground">{when}</td>

                  <td className="px-4 py-3">
                    <Select
                      value={r.kind}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (isKind(value)) updateField(r.id, { kind: value });
                      }}
                    >
                      <option value="visit">visit</option>
                      <option value="phone">phone</option>
                      <option value="check">check</option>
                    </Select>
                  </td>

                  <td className="px-4 py-3">
                    <Select
                      value={r.status}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (isStatus(value)) updateField(r.id, { status: value });
                      }}
                    >
                      <option value="scheduled">scheduled</option>
                      <option value="done">done</option>
                      <option value="canceled">canceled</option>
                    </Select>
                  </td>

                  <td className="px-4 py-3 text-foreground">
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
                onChange={(e) => {
                  const value = e.target.value;
                  if (isKind(value)) setNewAppt((s) => ({ ...s, kind: value }));
                }}
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
                onChange={(e) => {
                  const value = e.target.value;
                  if (isStatus(value)) setNewAppt((s) => ({ ...s, status: value }));
                }}
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
