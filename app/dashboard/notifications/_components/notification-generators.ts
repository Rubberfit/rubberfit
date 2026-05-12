import { notificationCrudService } from "@/src/infrastructure/services/notificationCrudService"
import { legacyMaterialTypeService as materialTypeService } from "@/src/infrastructure/services/legacyMaterialTypeService"
import { legacyRollService as rollService } from "@/src/infrastructure/services/legacyRollService"

export async function generateLowStockNotifications() {
  // First check if notifications table exists
  const tableExists = await notificationCrudService.exists()

  // If table doesn't exist, skip generation
  if (!tableExists) {
    console.log("Notifications table not yet created, skipping generation")
    return
  }

  // Check and generate low stock notifications
  const materialTypes = await materialTypeService.getAll()
  const rolls = await rollService.getActiveRolls()

  // Calculate stock levels
  const stockLevels = new Map<string, number>()
  if (rolls) {
    rolls.forEach((roll) => {
      const sqft = (roll.remaining_length * roll.width) / 144
      const current = stockLevels.get(roll.material_type) || 0
      stockLevels.set(roll.material_type, current + sqft)
    })
  }

  // First, get all existing low stock notifications to prevent duplicates
  const existingNotifications = await notificationCrudService.getByType("low_stock")

  const existingByMaterial = new Map<string, string>()
  if (existingNotifications) {
    existingNotifications.forEach((n) => {
      if (n.material_type) existingByMaterial.set(n.material_type, n.id)
    })
  }

  // Batch process notifications
  const notificationsToInsert: Array<{
    type: string
    title: string
    description: string
    material_type: string
    current_value: number
    threshold_value: number
    is_read: boolean
  }> = []
  const notificationsToUpdate: Array<{
    id: string
    current_value: number
    description: string
    updated_at: string
  }> = []
  const materialsWithLowStock = new Set<string>()

  if (materialTypes) {
    for (const materialType of materialTypes) {
      const currentStock = stockLevels.get(materialType.name) || 0
      const threshold = materialType.min_stock_alert || 0

      if (currentStock < threshold && threshold > 0) {
        materialsWithLowStock.add(materialType.name)

        const existingId = existingByMaterial.get(materialType.name)

        if (existingId) {
          // Only update existing notification if stock got worse or if it's currently unread
          // Don't resurrect cleared/deleted notifications
          const existingNotif = existingNotifications?.find((n) => n.id === existingId)
          if (existingNotif) {
            notificationsToUpdate.push({
              id: existingId,
              current_value: currentStock,
              description: `Current stock (${currentStock.toFixed(1)} sqft) is below threshold (${threshold} sqft)`,
              // Don't change read status - keep it as is
              updated_at: new Date().toISOString(),
            })
          }
        } else {
          // Create new notification (only if it doesn't exist)
          notificationsToInsert.push({
            type: "low_stock",
            title: `${materialType.name} Low Stock Alert`,
            description: `Current stock (${currentStock.toFixed(1)} sqft) is below threshold (${threshold} sqft)`,
            material_type: materialType.name,
            current_value: currentStock,
            threshold_value: threshold,
            is_read: false,
          })
        }
      }
    }

    // Update existing notifications (only update values, not read status)
    for (const update of notificationsToUpdate) {
      await notificationCrudService.update(update.id, {
        current_value: update.current_value,
        description: update.description,
        // Don't update is_read - leave it as is
        updated_at: update.updated_at,
      })
    }

    // Insert only truly new notifications
    if (notificationsToInsert.length > 0) {
      console.log(`Creating ${notificationsToInsert.length} new notifications`)
      try {
        await notificationCrudService.bulkCreate(notificationsToInsert)
      } catch (insertError) {
        console.error("Error inserting notifications:", insertError)
      }
    } else {
      console.log("No new notifications to create")
    }

    // Remove notifications for materials that are no longer low on stock
    const allLowStockNotifs = await notificationCrudService.getByType("low_stock")

    if (allLowStockNotifs) {
      const toDelete = allLowStockNotifs
        .filter((n) => !materialsWithLowStock.has(n.material_type ?? ""))
        .map((n) => n.id)

      if (toDelete.length > 0) {
        await notificationCrudService.deleteByIds(toDelete)
      }
    }
  }
}
