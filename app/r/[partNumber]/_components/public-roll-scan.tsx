"use client"

import Link from "next/link"
import { Box, Download, Layers, MapPin, Package, Recycle, Ruler } from "lucide-react"
import { toast } from "sonner"
import { jsPDF } from "jspdf"

/**
 * Public roll-scan surface. Rendered from the server-side
 * `/r/[partNumber]/page.tsx` — no auth, no Supabase client on
 * the browser bundle. Fields are pre-filtered server-side to the
 * non-sensitive set (no cost, no supplier, no notes).
 *
 * Two actions:
 *   • **Save as PDF** — client-side jsPDF; produces a single-page
 *     "what's this roll?" sheet the scanner can forward / file.
 *   • **Open in app** — deep-links to `/dashboard/inventory?scan=…`
 *     which, post-login, auto-opens the full drawer. Useful for
 *     operators who'd rather edit than just look.
 */

interface PublicRoll {
  id: string
  part_number: string | null
  material_type: string
  width: number
  length: number
  thickness: number
  remaining_length: number
  status: "active" | "depleted" | "reserved"
  color: string | null
  location: string | null
  date_received: string | null
  is_offcut: boolean
  parent_roll_id: string | null
}

interface PublicRollScanProps {
  roll: PublicRoll
  /** What the scanner put into the URL (part number or UUID). */
  scannedId: string
}

function formatDate(value: string | null): string {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString()
}

function buildScanPdf(roll: PublicRoll): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter" })
  const W = doc.internal.pageSize.getWidth()
  let y = 72
  doc.setProperties({ title: `Rubberfit · ${roll.part_number ?? roll.id}` })

  // Brand bar
  doc.setFillColor(37, 99, 235)
  doc.rect(0, 0, W, 48, "F")
  doc.setTextColor(255, 255, 255)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(18)
  doc.text("Rubberfit", 40, 32)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  doc.text("Roll Info", W - 40, 32, { align: "right" })

  // Hero
  doc.setTextColor(17, 24, 39)
  doc.setFont("courier", "bold")
  doc.setFontSize(28)
  doc.text(roll.part_number ?? `ID ${roll.id.slice(0, 8).toUpperCase()}`, 40, (y += 16))
  doc.setFont("helvetica", "bold")
  doc.setFontSize(16)
  doc.text(roll.material_type, 40, (y += 22))
  if (roll.color) {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(11)
    doc.setTextColor(107, 114, 128)
    doc.text(roll.color, 40, (y += 16))
    doc.setTextColor(17, 24, 39)
  }

  y += 18
  doc.setDrawColor(229, 231, 235)
  doc.line(40, y, W - 40, y)
  y += 20

  // Meta rows
  const rows: Array<[string, string]> = [
    ["Dimensions", `${roll.width}" × ${roll.length}" × ${roll.thickness}"`],
    [
      "Remaining length",
      `${roll.remaining_length}"  (${((roll.remaining_length / Math.max(roll.length, 0.0001)) * 100).toFixed(0)}%)`,
    ],
    [
      "Available area",
      `${((roll.remaining_length * roll.width) / 144).toFixed(2)} sq ft`,
    ],
    ["Status", roll.status],
    ["Location", roll.location ?? "—"],
    ["Date received", formatDate(roll.date_received)],
    [
      "Type",
      roll.is_offcut ? "Reusable offcut" : "Primary roll",
    ],
  ]
  doc.setFontSize(10)
  for (const [label, value] of rows) {
    doc.setFont("helvetica", "bold")
    doc.setTextColor(107, 114, 128)
    doc.text(label.toUpperCase(), 40, y)
    doc.setFont("helvetica", "normal")
    doc.setTextColor(17, 24, 39)
    doc.text(value, 180, y)
    y += 20
  }

  // Footer
  doc.setFontSize(8)
  doc.setTextColor(107, 114, 128)
  doc.text(
    `Generated ${new Date().toLocaleString()}`,
    40,
    doc.internal.pageSize.getHeight() - 30
  )
  doc.text(
    "rubberfit.com",
    W - 40,
    doc.internal.pageSize.getHeight() - 30,
    { align: "right" }
  )
  return doc
}

const STATUS_TONE: Record<PublicRoll["status"], string> = {
  active: "bg-emerald-50 text-emerald-700 border-emerald-200",
  depleted: "bg-rose-50 text-rose-700 border-rose-200",
  reserved: "bg-amber-50 text-amber-700 border-amber-200",
}

export function PublicRollScan({ roll, scannedId }: PublicRollScanProps) {
  const displayId =
    roll.part_number ?? `ID ${roll.id.slice(0, 8).toUpperCase()}`
  const remainingPct =
    roll.length > 0
      ? Math.max(0, Math.min(100, (roll.remaining_length / roll.length) * 100))
      : 0
  const remainingSqft = (roll.remaining_length * roll.width) / 144

  const handleDownloadPdf = () => {
    try {
      const doc = buildScanPdf(roll)
      doc.save(`${roll.part_number ?? roll.id}_info.pdf`)
      toast.success("PDF downloaded")
    } catch (err) {
      const m = err instanceof Error ? err.message : "Unknown error"
      toast.error("Failed to build PDF", { description: m })
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col gap-6 px-4 py-8 sm:px-8">
      <header className="flex items-center justify-between">
        <Link href="/" className="font-semibold text-lg tracking-tight">
          Rubberfit
        </Link>
        <span className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.14em]">
          Roll info
        </span>
      </header>

      <section className="rounded-lg border bg-card p-6 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="font-mono text-muted-foreground text-[11px] uppercase tracking-[0.14em]">
              Part number
            </p>
            <h1 className="truncate font-mono font-bold text-2xl text-foreground">
              {displayId}
            </h1>
          </div>
          <span
            className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 font-medium text-xs capitalize ${STATUS_TONE[roll.status]}`}
          >
            {roll.status}
          </span>
        </div>

        <div className="mt-5 flex items-center gap-2 text-foreground">
          <Package className="size-4 text-muted-foreground" aria-hidden="true" />
          <span className="font-semibold text-lg">{roll.material_type}</span>
          {roll.color ? (
            <span className="text-muted-foreground text-sm">· {roll.color}</span>
          ) : null}
          {roll.is_offcut ? (
            <span className="ml-1 inline-flex items-center gap-1 rounded-sm bg-amber-50 px-1.5 py-0.5 font-medium text-[10px] text-amber-700 uppercase tracking-wide">
              <Recycle className="size-3" aria-hidden="true" />
              Offcut
            </span>
          ) : null}
        </div>

        <dl className="mt-6 space-y-3">
          <MetaRow
            icon={<Ruler className="size-4" aria-hidden="true" />}
            label="Dimensions"
            value={`${roll.width}″ × ${roll.length}″ × ${roll.thickness}″`}
          />
          <MetaRow
            icon={<Layers className="size-4" aria-hidden="true" />}
            label="Remaining"
            value={
              <span>
                {roll.remaining_length}″{" "}
                <span className="text-muted-foreground">
                  ({remainingPct.toFixed(0)}%)
                </span>
              </span>
            }
          />
          <MetaRow
            icon={<Box className="size-4" aria-hidden="true" />}
            label="Available"
            value={
              <span>
                {remainingSqft.toFixed(1)}{" "}
                <span className="text-muted-foreground">sq ft</span>
              </span>
            }
          />
          {roll.location ? (
            <MetaRow
              icon={<MapPin className="size-4" aria-hidden="true" />}
              label="Location"
              value={roll.location}
            />
          ) : null}
        </dl>

        <div className="mt-6 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-foreground/70"
            style={{ width: `${remainingPct}%` }}
            aria-hidden="true"
          />
        </div>
      </section>

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={handleDownloadPdf}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 font-medium text-primary-foreground text-sm transition-colors hover:bg-primary/90"
        >
          <Download className="size-4" aria-hidden="true" />
          Save as PDF
        </button>
        <Link
          href={`/dashboard/inventory?scan=${encodeURIComponent(scannedId)}`}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-md border px-4 py-2.5 font-medium text-foreground text-sm transition-colors hover:bg-muted"
        >
          Open in app
        </Link>
      </div>

      <p className="mt-2 text-center text-muted-foreground text-xs">
        This is a public view. Pricing, supplier, and internal notes stay
        inside the Rubberfit app.
      </p>
    </main>
  )
}

function MetaRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-8 items-center justify-center rounded-md border border-border/60 bg-muted/40 text-muted-foreground">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <dt className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.14em]">
          {label}
        </dt>
        <dd className="text-foreground text-sm">{value}</dd>
      </div>
    </div>
  )
}
