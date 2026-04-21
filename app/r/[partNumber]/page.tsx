import { notFound } from "next/navigation"
import { createClient } from "@supabase/supabase-js"

import { PublicRollScan } from "./_components/public-roll-scan"

/**
 * Public landing page for a scanned roll label. No auth required
 * — lets a shop-floor worker point a phone at the QR code and
 * see material / dimensions / status / remaining stock without
 * needing to sign in.
 *
 * Queries via the service-role client (RLS is user-scoped, but
 * the set of fields we render here is *intentionally* non-
 * sensitive: no cost, supplier, or notes). Enumeration risk is
 * acknowledged — RF- part numbers are sequential — but the
 * exposed surface is things a competitor would already see
 * picking up the roll in person.
 *
 * If an authenticated user opens this URL in their browser, a
 * button on the page deep-links them into the full inventory
 * drawer (`/dashboard/inventory?scan=<part_number>`).
 */

interface PageProps {
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

  // Match by part_number first; legacy rolls without a sequence-
  // assigned id can still be looked up by raw UUID as a fallback
  // (same shape the inventory drawer uses).
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

export default async function RollScanPage({ params }: PageProps) {
  const { partNumber } = await params
  const roll = await loadRoll(partNumber)
  if (!roll) notFound()
  return <PublicRollScan roll={roll} scannedId={partNumber} />
}
