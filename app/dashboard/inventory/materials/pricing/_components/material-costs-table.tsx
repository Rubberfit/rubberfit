"use client"

import { useMemo } from "react"

import type {
  MaterialType,
  MaterialSupplierWithDetails,
} from "@/src/infrastructure/models/supabase"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card"
import { Badge } from "@/app/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table"

interface MaterialCostsTableProps {
  loading: boolean
  materialTypes: MaterialType[]
  materialSuppliers: MaterialSupplierWithDetails[]
}

export function MaterialCostsTable({
  loading,
  materialTypes,
  materialSuppliers,
}: MaterialCostsTableProps) {
  const cheapestSupplierMap = useMemo(() => {
    const map = new Map<string, { name: string; costPerSqft: number }>()

    for (const mt of materialTypes) {
      const sorted = materialSuppliers
        .filter((ms) => ms.material_type_id === mt.id)
        .sort((a, b) => a.cost_per_sqft - b.cost_per_sqft)

      if (sorted.length > 0) {
        const cheapest = sorted[0]
        map.set(mt.id, {
          name: cheapest.supplier?.name ?? "Unknown",
          costPerSqft: cheapest.cost_per_sqft,
        })
      }
    }

    return map
  }, [materialTypes, materialSuppliers])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Material costs</CardTitle>
        <CardDescription>
          Cheapest current supplier per material. Pricing is sourced from the
          material-supplier links — see the Price comparison tab for full
          breakdowns.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Material</TableHead>
                <TableHead>Cheapest supplier</TableHead>
                <TableHead className="text-right">Cost ($/sq ft)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8">
                    Loading materials...
                  </TableCell>
                </TableRow>
              ) : materialTypes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8">
                    No material types found
                  </TableCell>
                </TableRow>
              ) : (
                materialTypes.map((material) => {
                  const cheapest = cheapestSupplierMap.get(material.id)
                  return (
                    <TableRow key={material.id}>
                      <TableCell className="font-medium">{material.name}</TableCell>
                      <TableCell>
                        {cheapest ? (
                          cheapest.name
                        ) : (
                          <span className="text-muted-foreground">No supplier linked</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {cheapest ? (
                          <Badge variant="outline" className="font-mono">
                            ${cheapest.costPerSqft.toFixed(2)}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">&mdash;</span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
