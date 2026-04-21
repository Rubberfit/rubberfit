import { createClient } from "@supabase/supabase-js"
import { jsPDF } from "jspdf"

export const dynamic = "force-dynamic"

interface RouteContext {
  params: Promise<{ partNumber: string }>
}

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

function makeReadOnlyAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return null
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function loadRoll(partNumber: string): Promise<PublicRoll | null> {
  const client = makeReadOnlyAdminClient()
  if (!client) return null

  const cleaned = partNumber.trim()
  if (!cleaned) return null

  const byPart = await client
    .from("rolls")
    .select(
      "id, part_number, material_type, width, length, thickness, remaining_length, status, color, location, date_received, is_offcut, parent_roll_id"
    )
    .eq("part_number", cleaned)
    .maybeSingle()
  if (byPart.data) return byPart.data as PublicRoll

  const uuidLike = /^[0-9a-f-]{8,}$/i.test(cleaned)
  if (!uuidLike) return null

  const byId = await client
    .from("rolls")
    .select(
      "id, part_number, material_type, width, length, thickness, remaining_length, status, color, location, date_received, is_offcut, parent_roll_id"
    )
    .eq("id", cleaned)
    .maybeSingle()

  return (byId.data as PublicRoll | null) ?? null
}

function formatDate(value: string | null): string {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleDateString()
}

function buildScanPdf(roll: PublicRoll): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "letter" })
  const pageWidth = doc.internal.pageSize.getWidth()
  let y = 72
  doc.setProperties({ title: `Rubberfit · ${roll.part_number ?? roll.id}` })

  doc.setFillColor(37, 99, 235)
  doc.rect(0, 0, pageWidth, 48, "F")
  doc.setTextColor(255, 255, 255)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(18)
  doc.text("Rubberfit", 40, 32)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  doc.text("Roll Info", pageWidth - 40, 32, { align: "right" })

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
  doc.line(40, y, pageWidth - 40, y)
  y += 20

  const rows: Array<[string, string]> = [
    ["Part number", roll.part_number ?? roll.id],
    ["Dimensions", `${roll.width}" × ${roll.length}" × ${roll.thickness}"`],
    [
      "Remaining length",
      `${roll.remaining_length}"  (${((roll.remaining_length / Math.max(roll.length, 0.0001)) * 100).toFixed(0)}%)`,
    ],
    ["Available area", `${((roll.remaining_length * roll.width) / 144).toFixed(2)} sq ft`],
    ["Status", roll.status],
    ["Location", roll.location ?? "—"],
    ["Date received", formatDate(roll.date_received)],
    ["Type", roll.is_offcut ? "Reusable offcut" : "Primary roll"],
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

  doc.setFontSize(8)
  doc.setTextColor(107, 114, 128)
  doc.text(`Generated ${new Date().toLocaleString()}`, 40, doc.internal.pageSize.getHeight() - 30)
  doc.text("rubberfit.com", pageWidth - 40, doc.internal.pageSize.getHeight() - 30, {
    align: "right",
  })

  return doc
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const { partNumber } = await context.params
  const roll = await loadRoll(partNumber)

  if (!roll) {
    return new Response("Not Found", { status: 404 })
  }

  const pdfBytes = buildScanPdf(roll).output("arraybuffer")
  const fileName = `${(roll.part_number ?? roll.id).replace(/[^A-Za-z0-9._-]/g, "_")}_info.pdf`

  return new Response(pdfBytes, {
    status: 200,
    headers: {
      "cache-control": "no-store",
      "content-disposition": `inline; filename="${fileName}"`,
      "content-type": "application/pdf",
    },
  })
}
