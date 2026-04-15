"use client"

import { useState, useMemo, useCallback } from "react"
import { Pencil } from "lucide-react"

import type { MaterialType, MaterialSupplierWithDetails } from "@/src/infrastructure/models/supabase"
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
import { Button } from "@/app/components/ui/button"
import { Input } from "@/app/components/ui/input"
import { materialTypeService } from "@/src/infrastructure/services/materialTypeService"
import { toast } from "sonner"

interface MaterialCostsTableProps {
  loading: boolean
  materialTypes: MaterialType[]
  materialSuppliers: MaterialSupplierWithDetails[]
  onCostUpdated: (id: string, updatedMaterial: MaterialType) => void
}

export function MaterialCostsTable({
  loading,
  materialTypes,
  materialSuppliers,
  onCostUpdated,
}: MaterialCostsTableProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const [isSaving, setIsSaving] = useState(false)

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

  const handleStartEdit = useCallback(
    (material: MaterialType) => {
      if (isSaving) return
      setEditingId(material.id)
      setEditValue(material.default_cost?.toString() ?? "")
    },
    [isSaving]
  )

  const handleCancel = useCallback(() => {
    if (isSaving) return
    setEditingId(null)
    setEditValue("")
  }, [isSaving])

  const handleSave = useCallback(
    async (materialId: string) => {
      if (isSaving) return

      const trimmed = editValue.trim()
      if (trimmed === "") {
        setEditingId(null)
        return
      }

      const parsed = parseFloat(trimmed)
      if (!Number.isFinite(parsed) || parsed < 0) {
        toast.error("Please enter a valid cost")
        return
      }

      setIsSaving(true)
      try {
        const updated = await materialTypeService.update(materialId, { default_cost: parsed })
        onCostUpdated(materialId, updated)
        toast.success("Cost updated")
        setEditingId((current) => (current === materialId ? null : current))
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to update cost")
      } finally {
        setIsSaving(false)
      }
    },
    [editValue, isSaving, onCostUpdated]
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Material Costs</CardTitle>
        <CardDescription>
          Click a cost to edit it inline. This is the primary cost used across the app.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Material</TableHead>
                <TableHead>Cost ($/sq ft)</TableHead>
                <TableHead>Cheapest Supplier</TableHead>
                <TableHead className="w-[80px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8">
                    Loading materials...
                  </TableCell>
                </TableRow>
              ) : materialTypes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8">
                    No material types found
                  </TableCell>
                </TableRow>
              ) : (
                materialTypes.map((material) => {
                  const cheapest = cheapestSupplierMap.get(material.id)
                  const isEditing = editingId === material.id
                  const isCheaper =
                    cheapest != null &&
                    material.default_cost != null &&
                    cheapest.costPerSqft < material.default_cost

                  return (
                    <TableRow key={material.id}>
                      <TableCell className="font-medium">{material.name}</TableCell>
                      <TableCell>
                        {isEditing ? (
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") e.currentTarget.blur()
                              if (e.key === "Escape") handleCancel()
                            }}
                            onBlur={() => handleSave(material.id)}
                            autoFocus
                            className="w-28 h-8"
                            disabled={isSaving}
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleStartEdit(material)}
                            className="cursor-pointer hover:opacity-80 transition-opacity"
                          >
                            {material.default_cost != null ? (
                              <Badge variant="outline" className="font-mono">
                                ${material.default_cost.toFixed(2)}
                              </Badge>
                            ) : (
                              <span className="text-sm text-muted-foreground italic">Not set</span>
                            )}
                          </button>
                        )}
                      </TableCell>
                      <TableCell>
                        {cheapest ? (
                          <div className="flex flex-col gap-1">
                            <span className="text-sm">{cheapest.name}</span>
                            {isCheaper && (
                              <Badge variant="secondary" className="text-xs text-green-600 w-fit">
                                ${cheapest.costPerSqft.toFixed(2)}/sq ft
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">&mdash;</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {!isEditing && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleStartEdit(material)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
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
