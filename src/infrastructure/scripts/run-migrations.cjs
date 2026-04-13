const { createClient } = require("@supabase/supabase-js")
const fs = require("fs")
const path = require("path")

// Load environment variables
require("dotenv").config({ path: ".env.local" })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing Supabase environment variables")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function runMigrations() {
  const migrationsDir = path.join(__dirname, "..", "supabase", "migrations")
  const files = fs.readdirSync(migrationsDir).sort()

  console.log("🚀 Running migrations...\n")

  for (const file of files) {
    if (!file.endsWith(".sql")) continue

    const filePath = path.join(migrationsDir, file)
    const sql = fs.readFileSync(filePath, "utf8")

    console.log(`📝 Running migration: ${file}`)

    try {
      const { error } = await supabase.rpc("exec_sql", { sql_query: sql }).single()

      if (error) {
        // If RPC doesn't exist, try direct execution (this won't work with anon key)
        console.log(`⚠️  Note: Direct SQL execution requires service role key`)
        console.log(`   Please run this migration manually in Supabase Dashboard:`)
        console.log(`   ${file}\n`)
      } else {
        console.log(`✅ Successfully applied: ${file}\n`)
      }
    } catch (err) {
      console.log(`⚠️  Could not auto-apply ${file}`)
      console.log(`   Please run manually in SQL Editor\n`)
    }
  }

  console.log("\n✨ Migration process complete!")
  console.log("\nTo apply migrations manually:")
  console.log("1. Go to your Supabase Dashboard")
  console.log("2. Navigate to SQL Editor")
  console.log("3. Run each migration file in order\n")
}

runMigrations().catch(console.error)
