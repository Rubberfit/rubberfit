/**
 * Demo-data seeder.
 *
 * Populates the dashboard Operations Overview with realistic
 * shape: 5 material types, 12 rolls across them, and ~42 cuts
 * spread over the last 14 days (weighted heavier in the current
 * week so the "Cuts this week" KPI + utilization chart both
 * light up). Six named operators rotate through cuts so the
 * Recent cuts table shows a real operator column.
 *
 * **Tenant/user scoping.**
 * Every data table has `user_id UUID DEFAULT auth.uid()` + RLS,
 * so rows inserted without scoping are invisible. Because the
 * primary account signs in via Google OAuth (no password), this
 * script authenticates with the Supabase **service role** key —
 * which bypasses RLS — and explicitly tags every inserted row
 * with the looked-up `user_id`.
 *
 * Config: add to `.env.local`
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ...   # from Supabase dashboard → Project Settings → API
 *   DEMO_USER_EMAIL=you@example.com    # used only to look up your auth.users id
 *
 * Usage:
 *   npm run seed:demo
 *
 * Idempotent-ish: re-running appends more cuts. Skips material
 * types + rolls insert if any already exist for this user.
 */

import { createClient } from "@supabase/supabase-js"
import * as dotenv from "dotenv"
import * as path from "node:path"

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const demoEmail = process.env.DEMO_USER_EMAIL

if (!supabaseUrl) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL in .env.local")
  process.exit(1)
}

if (!serviceRoleKey) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY in .env.local")
  console.error("Get it from Supabase dashboard → Project Settings → API → service_role key.")
  console.error("This key bypasses RLS; keep it out of any client-side code.")
  process.exit(1)
}

if (!demoEmail) {
  console.error("Missing DEMO_USER_EMAIL in .env.local")
  console.error("Set it to the email of the account you want to populate.")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const MATERIAL_TYPES = [
  { name: "EPDM 60A Black", description: "Standard EPDM rubber, 60A hardness", min_stock_alert: 200 },
  { name: "Nitrile NBR-70", description: "Oil-resistant nitrile, 70 durometer", min_stock_alert: 150 },
  { name: "Neoprene CR-65", description: "General-purpose neoprene, 65 durometer", min_stock_alert: 150 },
  { name: "Silicone VMQ-60", description: "High-temp silicone, 60 durometer", min_stock_alert: 100 },
  { name: "Viton FKM-75", description: "Fluoroelastomer, chemical-resistant", min_stock_alert: 80 },
] as const

const OPERATORS = ["D. Moreau", "R. Jameson", "K. Leung", "S. Okafor", "M. Patel", "J. Chen"] as const

const ROLL_PRESETS: Array<{
  material: string
  width: number
  length: number
  cost_per_sqft: number
  fillFactor: number
}> = [
  { material: "EPDM 60A Black", width: 48, length: 120, cost_per_sqft: 3.25, fillFactor: 0.85 },
  { material: "EPDM 60A Black", width: 60, length: 120, cost_per_sqft: 3.25, fillFactor: 0.42 },
  { material: "EPDM 60A Black", width: 36, length: 144, cost_per_sqft: 3.25, fillFactor: 0.15 },
  { material: "Nitrile NBR-70", width: 48, length: 96, cost_per_sqft: 4.1, fillFactor: 0.78 },
  { material: "Nitrile NBR-70", width: 60, length: 96, cost_per_sqft: 4.1, fillFactor: 0.52 },
  { material: "Neoprene CR-65", width: 48, length: 120, cost_per_sqft: 3.75, fillFactor: 0.9 },
  { material: "Neoprene CR-65", width: 36, length: 120, cost_per_sqft: 3.75, fillFactor: 0.28 },
  { material: "Silicone VMQ-60", width: 36, length: 144, cost_per_sqft: 6.5, fillFactor: 0.15 },
  { material: "Silicone VMQ-60", width: 48, length: 96, cost_per_sqft: 6.5, fillFactor: 0.66 },
  { material: "Viton FKM-75", width: 36, length: 72, cost_per_sqft: 14.2, fillFactor: 0.1 },
  { material: "Viton FKM-75", width: 48, length: 72, cost_per_sqft: 14.2, fillFactor: 0.48 },
  { material: "EPDM 60A Black", width: 72, length: 100, cost_per_sqft: 3.4, fillFactor: 0 },
]

function pick<T>(arr: ReadonlyArray<T>): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

async function resolveUserId(): Promise<string> {
  // Service role can list auth.users via admin API.
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 })
  if (error) {
    console.error("Could not list auth users:", error.message)
    process.exit(1)
  }
  const match = data.users.find((u) => u.email?.toLowerCase() === demoEmail!.toLowerCase())
  if (!match) {
    console.error(`No auth user found with email ${demoEmail}. Sign in once via Google first.`)
    process.exit(1)
  }
  console.log(`Resolved user: ${match.email} (${match.id.slice(0, 8)}…)`)
  return match.id
}

async function ensureMaterialTypes(userId: string): Promise<void> {
  const { data: existing, error } = await supabase
    .from("material_types")
    .select("name")
    .eq("user_id", userId)
  if (error) {
    console.error("Error reading material_types:", error.message)
    return
  }
  const existingNames = new Set((existing ?? []).map((r) => (r as { name: string }).name))
  const toInsert = MATERIAL_TYPES.filter((m) => !existingNames.has(m.name))
  if (toInsert.length === 0) {
    console.log(`Material types already present (${existingNames.size}). Skipping insert.`)
    return
  }
  const rows = toInsert.map((m) => ({ ...m, user_id: userId }))
  const { error: insertErr } = await supabase.from("material_types").insert(rows)
  if (insertErr) {
    console.error("Error inserting material_types:", insertErr.message)
    return
  }
  console.log(`Inserted ${rows.length} material types.`)
}

async function ensureRolls(userId: string): Promise<void> {
  const { data: existing, error } = await supabase
    .from("rolls")
    .select("id")
    .eq("user_id", userId)
    .limit(1)
  if (error) {
    console.error("Error reading rolls:", error.message)
    return
  }
  if (existing && existing.length > 0) {
    console.log("Rolls already exist for this user. Skipping roll insert.")
    return
  }
  const now = new Date()
  const rolls = ROLL_PRESETS.map((preset, i) => {
    const remainingLength = Math.round(preset.length * preset.fillFactor)
    const createdAt = new Date(now)
    createdAt.setDate(createdAt.getDate() - (ROLL_PRESETS.length - i) * 3)
    return {
      user_id: userId,
      material_type: preset.material,
      width: preset.width,
      length: preset.length,
      remaining_length: remainingLength,
      cost_per_sqft: preset.cost_per_sqft,
      location: `Bay-${(i % 4) + 1}`,
      status: remainingLength > 0 ? "active" : "depleted",
      created_at: createdAt.toISOString(),
    }
  })
  const { error: insertErr } = await supabase.from("rolls").insert(rolls)
  if (insertErr) {
    console.error("Error inserting rolls:", insertErr.message)
    return
  }
  console.log(`Inserted ${rolls.length} rolls.`)
}

async function seedCuts(userId: string): Promise<void> {
  const { data: rolls, error } = await supabase
    .from("rolls")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
  if (error || !rolls || rolls.length === 0) {
    console.error("No active rolls available; cannot seed cuts.", error?.message)
    return
  }
  const now = new Date()
  const cuts: Array<Record<string, unknown>> = []

  for (let i = 0; i < 42; i++) {
    const withinWeek = Math.random() < 0.6
    const daysAgo = withinWeek
      ? Math.floor(Math.random() * 7)
      : 7 + Math.floor(Math.random() * 7)
    const cutDate = new Date(now)
    cutDate.setDate(cutDate.getDate() - daysAgo)
    cutDate.setHours(8 + Math.floor(Math.random() * 10), Math.floor(Math.random() * 60), 0, 0)

    const roll = pick(rolls as Array<{ id: string; width: number }>)
    const cutWidth = Math.max(6, Math.floor(Math.random() * (roll.width * 0.85)))
    const cutLength = 12 + Math.floor(Math.random() * 60)
    const quantity = 1 + Math.floor(Math.random() * 4)

    const totalLengthNeeded = cutLength * quantity
    const materialUsedSqft = (cutWidth * totalLengthNeeded) / 144
    const totalConsumedSqft = (roll.width * totalLengthNeeded) / 144
    const wasteSqft = totalConsumedSqft - materialUsedSqft
    const wastePercentage = (wasteSqft / totalConsumedSqft) * 100

    cuts.push({
      user_id: userId,
      roll_id: roll.id,
      cut_width: cutWidth,
      cut_length: cutLength,
      quantity,
      waste_sqft: Number(wasteSqft.toFixed(2)),
      waste_percentage: Number(wastePercentage.toFixed(2)),
      total_sqft_used: Number(materialUsedSqft.toFixed(2)),
      job_reference: `JOB-${2000 + Math.floor(Math.random() * 999)}`,
      cut_by: pick(OPERATORS),
      notes: "Demo-seed data (S4 Task 5)",
      created_at: cutDate.toISOString(),
    })
  }

  const batchSize = 10
  let inserted = 0
  for (let i = 0; i < cuts.length; i += batchSize) {
    const batch = cuts.slice(i, i + batchSize)
    const { error: insertError } = await supabase.from("cuts").insert(batch)
    if (insertError) {
      console.error(`Batch ${Math.floor(i / batchSize) + 1} insert error:`, insertError.message)
    } else {
      inserted += batch.length
    }
  }
  console.log(`Inserted ${inserted} / ${cuts.length} cuts across the last 14 days.`)
}

async function main() {
  console.log("Seeding demo data...")
  const userId = await resolveUserId()
  await ensureMaterialTypes(userId)
  await ensureRolls(userId)
  await seedCuts(userId)
  console.log("Done. Refresh /dashboard to see the populated Operations Overview.")
}

main().catch((err) => {
  console.error("seed-demo-data failed:", err)
  process.exit(1)
})
