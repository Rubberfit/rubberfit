import { useState, useCallback } from "react"
import { cutService } from "@/src/infrastructure/services/cutService"
import { legacyRollService as rollService } from "@/src/infrastructure/services/legacyRollService"

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
      let cuts: Awaited<ReturnType<typeof cutService.getRecentCutsWithRolls>> | null = null
      try {
        cuts = await cutService.getRecentCutsWithRolls(10)
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

      if (cuts) {
        cuts.forEach((cut) => {
          const rollInfo = cut.roll as { material_type: string; location: string } | undefined
          formattedActivities.push({
            id: cut.id,
            type: "cut",
            description: `Cut ${cut.cut_width}" × ${cut.cut_length}" × ${cut.quantity} from ${rollInfo?.material_type || "Unknown"}`,
            timestamp: cut.created_at,
            job_reference: cut.job_reference,
            material_type: rollInfo?.material_type,
            waste_percentage: cut.waste_percentage,
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
