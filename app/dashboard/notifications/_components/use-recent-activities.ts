import { useState, useCallback } from "react"

import { fetchRecentCuts } from "@/app/actions/cuts"
import { rollService } from "@/src/infrastructure/services/rollService"
import type { Roll } from "@/src/infrastructure/models/supabase"

export interface Activity {
  id: string
  type: "cut" | "roll_added" | "roll_depleted"
  description: string
  timestamp: string
  job_reference?: string
  material_type?: string
  waste_percentage?: number
}

export function useRecentActivities() {
  const [activities, setActivities] = useState<Activity[]>([])

  const fetchRecentActivities = useCallback(async () => {
    try {
      let cuts: Awaited<ReturnType<typeof fetchRecentCuts>> | null = null
      try {
        cuts = await fetchRecentCuts(10)
      } catch (cutsError) {
        if ((cutsError as Record<string, unknown>)?.code !== "PGRST116") {
          console.error("Error fetching cuts:", cutsError)
        }
      }

      let rolls: Awaited<ReturnType<typeof rollService.getRecentlyUpdatedRolls>> | null = null
      try {
        rolls = await rollService.getRecentlyUpdatedRolls(10)
      } catch (rollsError) {
        if ((rollsError as Record<string, unknown>)?.code !== "PGRST116") {
          console.error("Error fetching rolls:", rollsError)
        }
      }

      const formattedActivities: Activity[] = []

      // Build a roll lookup from the rolls fetch so cuts can show their
      // material type. Cuts whose roll fell out of the recent window
      // surface as "Unknown" — same string the legacy code already used.
      const rollById = new Map<string, Roll>()
      if (rolls) {
        for (const r of rolls) rollById.set(r.id, r)
      }

      if (cuts) {
        cuts.forEach((cut) => {
          const roll = cut.roll_id ? rollById.get(cut.roll_id) : undefined
          const materialType = roll?.material_type ?? "Unknown"
          const used = cut.material_used_sqft
          const scrap = cut.scrap_sqft
          const total = scrap + used
          const wastePercentage = total > 0 ? (scrap / total) * 100 : undefined
          formattedActivities.push({
            id: cut.id,
            type: "cut",
            description: `Cut ${cut.cut_width}" × ${cut.cut_length}" × ${cut.cut_amount} from ${materialType}`,
            timestamp: cut.cut_date ?? cut.created_at,
            material_type: materialType,
            waste_percentage: wastePercentage,
          })
        })
      }

      if (rolls) {
        rolls.forEach((roll) => {
          if (roll.status === "depleted") {
            formattedActivities.push({
              id: roll.id,
              type: "roll_depleted",
              description: `${roll.material_type} roll ${roll.width}" × ${roll.length}" depleted`,
              timestamp: roll.updated_at,
              material_type: roll.material_type,
            })
          } else if (new Date(roll.created_at).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000) {
            formattedActivities.push({
              id: roll.id,
              type: "roll_added",
              description: `New ${roll.material_type} roll ${roll.width}" × ${roll.length}" added`,
              timestamp: roll.created_at,
              material_type: roll.material_type,
            })
          }
        })
      }

      formattedActivities.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )

      setActivities(formattedActivities.slice(0, 10))
    } catch (error) {
      console.error("Error fetching activities:", error)
    }
  }, [])

  return { activities, fetchRecentActivities }
}
