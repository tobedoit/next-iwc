// src/app/components/StatCard.tsx
export function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-2xl border-2 p-5 shadow-sm bg-[var(--panel)] border-[var(--panel-border)]">
      <div className="text-sm [color:var(--muted)]">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight text-[var(--foreground)]">{value}</div>
      {hint ? <div className="mt-1 text-xs [color:var(--muted)]">{hint}</div> : null}
    </div>
  )
}
