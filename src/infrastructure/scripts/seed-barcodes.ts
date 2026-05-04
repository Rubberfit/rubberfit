/**
 * Barcode-verification seed.
 *
 * Creates a focused set of rolls with varied dimensions, materials,
 * and statuses so the operator can exercise the printed-label scan
 * flow end-to-end:
 *
 *   1. `part_number` is assigned by the `rolls_assign_part_number`
 *      DB trigger on insert (RF-000001, RF-000002, …)
 *   2. Scanning the printed Code128 label yields that part_number
 *   3. `/r/<part_number>` redirects to `/r/<part_number>/pdf`
 *   4. The inline PDF shows roll info (dimensions, material, status,
 *      cost, remaining length) — no login required
 *
 * The stored-barcode PNG is NOT generated here. That happens in the
 * browser via bwip-js when the operator hits "Print Label" (the
 * scan PDF itself reads directly from DB, so the PNG isn't needed
 * to verify the flow).
 *
 * Idempotent: re-running skips existing seed rolls (detected via
 * the BARCODE_SEED_MARKER in `notes`).
 *
 * Config: add to `.env.local`
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ...
 *   DEMO_USER_EMAIL=you@example.com
 *   NEXT_PUBLIC_APP_URL=http://localhost:3000   # optional, defaults to localhost:3000
 *
 * Usage:
 *   npm run seed:barcodes
 */

import { createClient } from "@supabase/supabase-js"
import * as dotenv from "dotenv"
import * as path from "node:path"

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const demoEmail = process.env.DEMO_USER_EMAIL
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

if (!supabaseUrl) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL in .env.local")
  process.exit(1)
}
if (!serviceRoleKey) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY in .env.local")
  process.exit(1)
}
if (!demoEmail) {
  console.error("Missing DEMO_USER_EMAIL in .env.local")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// Marker in the notes column so we can detect already-seeded rows
// without adding schema. Cheap idempotency for a dev-only script.
const BARCODE_SEED_MARKER = "[barcode-seed]"

interface SeedRoll {
  material_type: string
  width: number
  length: number
  thickness: number
  remaining_length: number
  cost_per_sqft: number
  location: string
  status: "active" | "depleted" | "reserved"
  notes: string
  is_offcut?: boolean
  date_received?: string
}

const SEED_ROLLS: SeedRoll[] = [
  {
    material_type: "EPDM 60A Black",
    width: 48,
    length: 120,
    thickness: 0.5,
    remaining_length: 96,
    cost_per_sqft: 3.25,
    location: "Bay-1",
    status: "active",
    notes: `${BARCODE_SEED_MARKER} Fresh stock, standard size`,
  },
  {
    material_type: "Nitrile NBR-70",
    width: 60,
    length: 96,
    thickness: 0.375,
    remaining_length: 62,
    cost_per_sqft: 4.1,
    location: "Bay-2",
    status: "active",
    notes: `${BARCODE_SEED_MARKER} Partial — oil-resistant stock`,
  },
  {
    material_type: "Neoprene CR-65",
    width: 36,
    length: 144,
    thickness: 0.25,
    remaining_length: 14,
    cost_per_sqft: 3.75,
    location: "Bay-3",
    status: "active",
    notes: `${BARCODE_SEED_MARKER} Low-stock, nearly depleted`,
  },
  {
    material_type: "Silicone VMQ-60",
    width: 48,
    length: 72,
    thickness: 0.125,
    remaining_length: 72,
    cost_per_sqft: 6.5,
    location: "Bay-4",
    status: "reserved",
    notes: `${BARCODE_SEED_MARKER} Reserved for job`,
  },
  {
    material_type: "Viton FKM-75",
    width: 36,
    length: 72,
    thickness: 0.125,
    remaining_length: 0,
    cost_per_sqft: 14.2,
    location: "Bay-4",
    status: "depleted",
    notes: `${BARCODE_SEED_MARKER} Depleted — verify PDF handles zero remaining`,
  },
  {
    material_type: "EPDM 60A Black",
    width: 18,
    length: 48,
    thickness: 0.5,
    remaining_length: 48,
    cost_per_sqft: 3.25,
    location: "Bay-1",
    status: "active",
    notes: `${BARCODE_SEED_MARKER} Offcut — verify PDF shows lineage marker`,
    is_offcut: true,
  },
]

async function resolveUserId(): Promise<string> {
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 })
  if (error) {
    console.error("Could not list auth users:", error.message)
    process.exit(1)
  }
  const match = data.users.find((u) => u.email?.toLowerCase() === demoEmail!.toLowerCase())
  if (!match) {
    console.error(`No auth user found with email ${demoEmail}. Sign in once first.`)
    process.exit(1)
  }
  console.log(`Resolved user: ${match.email} (${match.id.slice(0, 8)}…)`)
  return match.id
}

async function ensureMaterialType(userId: string, name: string): Promise<void> {
  const { data: existing } = await supabase
    .from("material_types")
    .select("name")
    .eq("user_id", userId)
    .eq("name", name)
    .maybeSingle()
  if (existing) return
  const { error } = await supabase
    .from("material_types")
    .insert({ name, user_id: userId, description: `Auto-created by barcode seed` })
  if (error) {
    console.error(`Could not create material_type "${name}":`, error.message)
  }
}

async function seedBarcodeRolls(userId: string): Promise<void> {
  // Make sure every referenced material_type exists; otherwise the
  // roll-type-matching in the PDF will show "—" for Material.
  const uniqueMaterials = Array.from(new Set(SEED_ROLLS.map((r) => r.material_type)))
  for (const m of uniqueMaterials) {
    await ensureMaterialType(userId, m)
  }

  // Skip rows that are already present from a prior run (detected
  // via the seed marker in notes).
  const { data: existing, error: readErr } = await supabase
    .from("rolls")
    .select("id, part_number, notes")
    .eq("user_id", userId)
    .like("notes", `%${BARCODE_SEED_MARKER}%`)
  if (readErr) {
    console.error("Error reading existing rolls:", readErr.message)
    return
  }
  if (existing && existing.length >= SEED_ROLLS.length) {
    console.log(`Barcode-seed rolls already present (${existing.length}). Skipping insert.`)
    printScanTable(
      existing as Array<{ id: string; part_number: string | null; notes: string | null }>
    )
    return
  }

  // Explicit false for is_offcut: supabase-js omits undefined keys,
  // but the `rolls.is_offcut` column is NOT NULL and the default is
  // only applied when the column is absent from the statement — which
  // it won't be if we spread a partial object through supabase-js.
  const rows = SEED_ROLLS.map((roll) => ({
    ...roll,
    is_offcut: roll.is_offcut ?? false,
    user_id: userId,
    date_received: roll.date_received ?? new Date().toISOString(),
  }))

  const { data: inserted, error: insertErr } = await supabase
    .from("rolls")
    .insert(rows)
    .select("id, part_number, notes, material_type, width, length, status")

  if (insertErr) {
    console.error("Error inserting rolls:", insertErr.message)
    return
  }
  const count = inserted?.length ?? 0
  console.log(`Inserted ${count} barcode-seed rolls.`)
  if (inserted) {
    printScanTable(
      inserted as Array<{ id: string; part_number: string | null; notes: string | null }>
    )
  }
}

function printScanTable(
  rolls: Array<{ id: string; part_number: string | null; notes: string | null }>
): void {
  if (rolls.length === 0) return
  console.log("")
  console.log("Scan these URLs in a browser or mobile scanner app:")
  console.log("")
  const maxPart = Math.max(...rolls.map((r) => (r.part_number ?? "").length), 12)
  const maxNote = Math.max(...rolls.map((r) => (r.notes ?? "").length), 30)
  const header = `  ${"PART_NUMBER".padEnd(maxPart)}  ${"NOTE".padEnd(maxNote)}  URL`
  console.log(header)
  console.log("  " + "-".repeat(header.length - 2))
  for (const r of rolls) {
    const part = r.part_number ?? "(none)"
    const note = (r.notes ?? "").replace(BARCODE_SEED_MARKER, "").trim() || "—"
    const url = `${appUrl}/r/${part}`
    console.log(`  ${part.padEnd(maxPart)}  ${note.padEnd(maxNote)}  ${url}`)
  }
  console.log("")
  console.log("Each URL redirects to /r/<part>/pdf — verify the PDF shows roll details.")
}

async function main() {
  console.log("Seeding barcode-verification rolls…")
  const userId = await resolveUserId()
  await seedBarcodeRolls(userId)
  console.log("Done.")
}

main().catch((err) => {
  console.error("seed-barcodes failed:", err)
  process.exit(1)
})
