const { createClient } = require("@supabase/supabase-js")
require("dotenv").config({ path: ".env.local" })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase environment variables")
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function testConnection() {
  console.log("🔍 Testing Supabase connection...\n")
  console.log(`URL: ${supabaseUrl}`)
  console.log(`Key: ${supabaseAnonKey.substring(0, 20)}...`)
  console.log("\n-------------------\n")

  try {
    // Test 1: Check material_types table
    console.log("📦 Testing material_types table...")
    const { data: materials, error: materialsError } = await supabase
      .from("material_types")
      .select("*")
      .limit(3)

    if (materialsError) {
      console.error("❌ Error fetching material types:", materialsError.message)
    } else {
      console.log(`✅ Found ${materials?.length || 0} material types`)
      if (materials && materials.length > 0) {
        console.log("   Sample:", materials[0].name)
      }
    }

    // Test 2: Check rolls table
    console.log("\n📦 Testing rolls table...")
    const { data: rolls, error: rollsError } = await supabase.from("rolls").select("*").limit(3)

    if (rollsError) {
      console.error("❌ Error fetching rolls:", rollsError.message)
    } else {
      console.log(`✅ Found ${rolls?.length || 0} rolls`)
      if (rolls && rolls.length > 0) {
        console.log(
          "   Sample:",
          `${rolls[0].material_type} - ${rolls[0].width}" x ${rolls[0].length}"`
        )
      }
    }

    // Test 3: Check cuts table
    console.log("\n📦 Testing cuts table...")
    const { data: cuts, error: cutsError } = await supabase.from("cuts").select("*").limit(3)

    if (cutsError) {
      console.error("❌ Error fetching cuts:", cutsError.message)
    } else {
      console.log(`✅ Found ${cuts?.length || 0} cuts`)
    }

    // Test 4: Count inventory value
    console.log("\n💰 Testing inventory value calculation...")
    const { data: activeRolls, error: valueError } = await supabase
      .from("rolls")
      .select("width, remaining_length, cost_per_sqft")
      .eq("status", "active")

    if (valueError) {
      console.error("❌ Error calculating inventory value:", valueError.message)
    } else {
      const totalValue =
        activeRolls?.reduce((sum, roll) => {
          const sqft = (roll.width * roll.remaining_length) / 144
          return sum + sqft * (roll.cost_per_sqft || 0)
        }, 0) || 0
      console.log(`✅ Total inventory value: $${totalValue.toFixed(2)}`)
    }

    console.log("\n✨ Connection test complete!")
  } catch (error) {
    console.error("❌ Unexpected error:", error)
  }
}

testConnection()
