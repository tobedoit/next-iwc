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

type RawCustomer = Record<string, unknown> & {
  id?: unknown;
  orgId?: unknown;
  org_id?: unknown;
  name?: unknown;
  phone?: unknown;
  email?: unknown;
  addr1?: unknown;
  addr2?: unknown;
  createdAt?: unknown;
  created_at?: unknown;
};

type CustomerPatch = Partial<Pick<Customer, "name" | "phone" | "email" | "addr1" | "addr2">>;

const INITIAL_DETAIL_FORM = { name: "", phone: "", email: "", addr1: "", addr2: "" };
const INITIAL_NEW_CUSTOMER = { name: "", phone: "", email: "", addr1: "", addr2: "", memo: "" };
type DetailForm = typeof INITIAL_DETAIL_FORM;
type NewCustomerForm = typeof INITIAL_NEW_CUSTOMER;

function readRequiredString(raw: RawCustomer, ...keys: (keyof RawCustomer)[]): string {
  for (const key of keys) {
    const value = raw[key];
    if (typeof value === "string") return value;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function readOptionalString(raw: RawCustomer, ...keys: (keyof RawCustomer)[]): string | null {
  for (const key of keys) {
    const value = raw[key];
    if (value === null) return null;
    if (typeof value === "string") return value;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "number") return String(value);
  }
  return null;
}

function normalizeCustomer(row: unknown): Customer {
  if (!row || typeof row !== "object") {
    throw new Error("Invalid customer row");
  }
  const raw = row as RawCustomer;
  return {
    id: readRequiredString(raw, "id"),
    orgId: readRequiredString(raw, "orgId", "org_id"),
    name: readRequiredString(raw, "name"),
    phone: readRequiredString(raw, "phone"),
    email: readOptionalString(raw, "email"),
    addr1: readOptionalString(raw, "addr1"),
    addr2: readOptionalString(raw, "addr2"),
    createdAt: readRequiredString(raw, "createdAt", "created_at"),
  };
}

function prepareCustomerPatch(patch: CustomerPatch): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (patch.name !== undefined) body.name = patch.name;
  if (patch.phone !== undefined) body.phone = display010(patch.phone);
  if (patch.email !== undefined) body.email = patch.email ?? null;
  if (patch.addr1 !== undefined) body.addr1 = patch.addr1 ?? null;
  if (patch.addr2 !== undefined) body.addr2 = patch.addr2 ?? null;
  return body;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
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
function formatPhone(value?: string | null) {
  const digits = (value ?? "").replace(/\D/g, "").slice(0, 11);
  if (!digits) return "";
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function EditableCell({
  value, placeholder, onSave,
}: { value: string | null; placeholder?: string; onSave: (v: string) => Promise<void> }) {
  const isPhone = /전화/.test(placeholder ?? "");
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(() => (isPhone ? formatPhone(value) : (value ?? "")));
  const openEditor = () => {
    setVal(isPhone ? formatPhone(value) : (value ?? ""));
    setEditing(true);
  };

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
      onChange={(e) => {
        const v = e.target.value;
        if (!isPhone) { setVal(v); return; }
        const d = onlyDigits(v).slice(0, 11);
        setVal(formatPhone(d));
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
          setVal(isPhone ? formatPhone(value) : (value ?? ""));
        }
      }}
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

  // detail modal
  const [detailId, setDetailId] = useState<string | null>(null);
  const detailCustomer = useMemo(
    () => (detailId ? rows.find((r) => r.id === detailId) ?? null : null),
    [rows, detailId]
  );
  const [detailForm, setDetailForm] = useState<DetailForm>(INITIAL_DETAIL_FORM);
  const [detailDirty, setDetailDirty] = useState(false);
  const [detailSaving, setDetailSaving] = useState(false);

  // new customer modal
  const [openNew, setOpenNew] = useState(false);
  const [savingNew, setSavingNew] = useState(false);
  const [newCustomer, setNewCustomer] = useState<NewCustomerForm>(INITIAL_NEW_CUSTOMER);

  // debounce q
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!detailId) {
      setDetailForm(INITIAL_DETAIL_FORM);
      setDetailDirty(false);
      return;
    }
    if (!detailCustomer) {
      setDetailId(null);
      return;
    }
    setDetailForm({
      name: detailCustomer.name ?? "",
      phone: formatPhone(detailCustomer.phone),
      email: detailCustomer.email ?? "",
      addr1: detailCustomer.addr1 ?? "",
      addr2: detailCustomer.addr2 ?? "",
    });
    setDetailDirty(false);
  }, [detailId, detailCustomer]);

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
    } catch (error) {
      setErr(extractErrorMessage(error));
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

  const closeDetail = () => setDetailId(null);

  const applyDetailChange = (field: "name" | "phone" | "email" | "addr1" | "addr2", value: string) => {
    setDetailForm((prev) => ({ ...prev, [field]: value }));
    setDetailDirty(true);
  };

  async function saveDetail() {
    if (!detailCustomer) return;
    const patch: CustomerPatch = {};
    const trimmedName = detailForm.name.trim();
    if (trimmedName !== detailCustomer.name) patch.name = trimmedName;

    const digitsPhone = onlyDigits(detailForm.phone);
    const prevDigitsPhone = onlyDigits(detailCustomer.phone ?? "");
    if (digitsPhone !== prevDigitsPhone) patch.phone = digitsPhone;

    const trimmedEmail = detailForm.email.trim();
    if ((detailCustomer.email ?? "") !== trimmedEmail) patch.email = trimmedEmail || null;

    const addr1 = detailForm.addr1.trim();
    if ((detailCustomer.addr1 ?? "") !== addr1) patch.addr1 = addr1 || null;

    const addr2 = detailForm.addr2.trim();
    if ((detailCustomer.addr2 ?? "") !== addr2) patch.addr2 = addr2 || null;

    if (Object.keys(patch).length === 0) {
      closeDetail();
      return;
    }

    setDetailSaving(true);
    try {
      await updateField(detailCustomer.id, patch);
      setDetailDirty(false);
      closeDetail();
    } catch {
      // 실패시 updateField 내부에서 fetchList 호출
    } finally {
      setDetailSaving(false);
    }
  }

  async function removeFromDetail() {
    if (!detailCustomer) return;
    const deleted = await removeCustomer(detailCustomer.id);
    if (deleted) closeDetail();
  }

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
      setNewCustomer(INITIAL_NEW_CUSTOMER);
    } catch {
      alert("생성 실패");
    } finally {
      setSavingNew(false);
    }
  }

  async function updateField(id: string, patch: CustomerPatch) {
    try {
      const apiPayload = prepareCustomerPatch(patch);
      await apiPatch("/api/customers", { id, ...apiPayload });

      const statePatch: Partial<Customer> = {};
      if (patch.name !== undefined) statePatch.name = patch.name ?? "";
      if (patch.phone !== undefined) statePatch.phone = display010(patch.phone ?? "");
      if (patch.email !== undefined) statePatch.email = patch.email ?? null;
      if (patch.addr1 !== undefined) statePatch.addr1 = patch.addr1 ?? null;
      if (patch.addr2 !== undefined) statePatch.addr2 = patch.addr2 ?? null;

      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...statePatch } : r)));
    } catch {
      await fetchList();
      alert("업데이트 실패");
    }
  }

  async function removeCustomer(id: string): Promise<boolean> {
    if (!confirm("삭제할까요?")) return false;
    const prev = rows;
    setRows((s) => s.filter((r) => r.id !== id));
    try {
      await apiDelete(`/api/customers?id=${encodeURIComponent(id)}`);
      return true;
    } catch {
      setRows(prev);
      alert("삭제 실패");
      return false;
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
                        value={c.phone}
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
                      <div className="flex items-center gap-2">
                        <Button onClick={() => setDetailId(c.id)}>상세</Button>
                        <Button onClick={() => removeCustomer(c.id)} className="border-red-500 text-red-500">삭제</Button>
                      </div>
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

      {/* Detail Modal */}
      <Modal open={detailId !== null} onClose={closeDetail} title="고객 상세">
        {detailCustomer ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm text-neutral-600">이름</label>
                <Input
                  value={detailForm.name}
                  onChange={(e) => applyDetailChange("name", e.target.value)}
                  placeholder="이름"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-neutral-600">전화번호</label>
                <Input
                  value={detailForm.phone}
                  onChange={(e) => applyDetailChange("phone", formatPhone(e.target.value))}
                  placeholder="010-0000-0000"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-neutral-600">이메일</label>
                <Input
                  value={detailForm.email}
                  onChange={(e) => applyDetailChange("email", e.target.value)}
                  placeholder="name@example.com"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-neutral-600">주소 1</label>
                <Input
                  value={detailForm.addr1}
                  onChange={(e) => applyDetailChange("addr1", e.target.value)}
                  placeholder="시/군/구"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-neutral-600">주소 2</label>
                <Input
                  value={detailForm.addr2}
                  onChange={(e) => applyDetailChange("addr2", e.target.value)}
                  placeholder="상세 주소"
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 rounded-md bg-[var(--table-head-bg)] px-3 py-2 text-sm text-[color:var(--muted)]">
              <span>등록일: {new Date(detailCustomer.createdAt).toLocaleString("ko-KR")}</span>
              <span>고객 ID: {detailCustomer.id}</span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <Button onClick={removeFromDetail} className="border-red-500 text-red-500">
                삭제
              </Button>
              <div className="flex gap-2">
                <Button onClick={closeDetail} disabled={detailSaving}>
                  닫기
                </Button>
                <Button onClick={saveDetail} disabled={!detailDirty || detailSaving}>
                  {detailSaving ? "저장중…" : "변경 저장"}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-10 text-center text-sm text-neutral-500">
            선택된 고객 정보를 불러오지 못했습니다.
          </div>
        )}
      </Modal>

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
