"use client"

interface SeatMeterProps {
  used: number
  total: number
  onManageSeats: () => void
  showManage?: boolean
}

export function SeatMeter({ used, total, onManageSeats, showManage = true }: SeatMeterProps) {
  const pct = total > 0 ? Math.min(100, Math.max(0, (used / total) * 100)) : 0

  return (
    <div className="rounded-xl border border-border-subtle bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            Seat usage
          </p>
          <p className="font-mono text-sm text-foreground">
            <span className="font-medium">{used}</span>{" "}
            <span className="text-muted-foreground">of</span>{" "}
            <span className="font-medium">{total}</span>{" "}
            <span className="text-muted-foreground">seats used</span>
          </p>
        </div>
        {showManage && (
          <button
            type="button"
            onClick={onManageSeats}
            className="text-sm font-medium text-[var(--accent-fg)] hover:underline"
          >
            Manage seats
          </button>
        )}
      </div>
      <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-[var(--accent-fg)] transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
