"use client"

import { useEffect, useState } from "react"

import { type MaterialType } from "@/src/infrastructure/models/supabase"
import { materialTypeService } from "@/src/infrastructure/services/materialTypeService"
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card"

export function MaterialTypesOverview() {
  const [materialTypes, setMaterialTypes] = useState<MaterialType[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    materialTypeService
      .getAll()
      .then((data) => {
        if (!cancelled) setMaterialTypes(data)
      })
      .catch((error) => {
        console.error("Error fetching material types:", error)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Material types</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading…</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Material types</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        <ul className="divide-y divide-border">
          {materialTypes.slice(0, 6).map((material) => (
            <li
              key={material.id}
              className="flex items-start justify-between gap-3 px-6 py-3 first:pt-0"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{material.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {material.description || "No description"}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-mono text-sm tabular-nums text-foreground">
                  {material.default_cost != null ? `$${material.default_cost.toFixed(2)}` : "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Alert {material.min_stock_alert ?? 0} sqft
                </p>
              </div>
            </li>
          ))}
        </ul>
        {materialTypes.length > 6 && (
          <p className="border-t px-6 pt-3 text-center text-xs text-muted-foreground">
            And {materialTypes.length - 6} more
          </p>
        )}
      </CardContent>
    </Card>
  )
}
