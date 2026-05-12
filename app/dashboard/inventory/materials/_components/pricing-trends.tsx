"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card"
import { type MaterialType } from "@/src/infrastructure/models/supabase"
import { legacyMaterialTypeService as materialTypeService } from "@/src/infrastructure/services/legacyMaterialTypeService"

export function PricingTrends() {
  const [materialTypes, setMaterialTypes] = useState<MaterialType[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchMaterialTypes = async () => {
      try {
        const data = await materialTypeService.getTopByCost(5)
        setMaterialTypes(data)
      } catch (error) {
        console.error("Error fetching material types:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchMaterialTypes()
  }, [])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pricing Trends</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading pricing data...</p>
        ) : materialTypes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No material types available</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <h4 className="text-sm font-medium">Current Pricing</h4>
              {materialTypes.map((material) => (
                <div key={material.id} className="flex justify-between text-sm">
                  <span className="font-medium">{material.name}</span>
                  <span className="font-mono">
                    ${material.default_cost?.toFixed(2) || "N/A"}/sq ft
                  </span>
                </div>
              ))}
            </div>

            <div>
              <h4 className="text-sm font-medium mb-3">Price Range Distribution</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Low-cost materials</span>
                  <span>$1.50 - $3.00</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full"
                    style={{
                      width: `${(materialTypes.filter((m) => (m.default_cost || 0) <= 3).length / Math.max(materialTypes.length, 1)) * 100}%`,
                    }}
                  ></div>
                </div>

                <div className="flex justify-between text-xs text-muted-foreground mt-3">
                  <span>Mid-range materials</span>
                  <span>$3.00 - $6.00</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-green-600 h-2 rounded-full"
                    style={{
                      width: `${(materialTypes.filter((m) => (m.default_cost || 0) > 3 && (m.default_cost || 0) <= 6).length / Math.max(materialTypes.length, 1)) * 100}%`,
                    }}
                  ></div>
                </div>

                <div className="flex justify-between text-xs text-muted-foreground mt-3">
                  <span>Premium materials</span>
                  <span>$6.00+</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-orange-600 h-2 rounded-full"
                    style={{
                      width: `${(materialTypes.filter((m) => (m.default_cost || 0) > 6).length / Math.max(materialTypes.length, 1)) * 100}%`,
                    }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 pt-4 border-t">
          <p className="text-xs text-muted-foreground">
            Historical pricing trends will be available once price tracking is implemented. Current
            prices are based on default cost settings.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
