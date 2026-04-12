"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card"
import { Button } from "@/app/components/ui/button"
import { Input } from "@/app/components/ui/input"
import { Label } from "@/app/components/ui/label"
import { Save, Trash2 } from "lucide-react"
import { type MaterialType } from "@/src/infrastructure/models/supabase"

interface MaterialConfigListProps {
  materials: MaterialType[]
  editedValues: {
    [key: string]: { min_stock_alert: number; default_cost: number }
  }
  onValueChange: (
    materialId: string,
    field: "min_stock_alert" | "default_cost",
    value: number
  ) => void
  onSave: (materialId: string) => void
  onDeleteClick: (materialId: string) => void
}

export function MaterialConfigList({
  materials,
  editedValues,
  onValueChange,
  onSave,
  onDeleteClick,
}: MaterialConfigListProps) {
  return (
    <div className="grid gap-4">
      {materials.map((material) => (
        <Card key={material.id}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">{material.name}</CardTitle>
                {material.description && (
                  <CardDescription className="mt-1">{material.description}</CardDescription>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onDeleteClick(material.id)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor={`stock-${material.id}`}>Minimum Stock Alert (sqft)</Label>
                <Input
                  id={`stock-${material.id}`}
                  type="number"
                  min="0"
                  step="10"
                  value={editedValues[material.id]?.min_stock_alert || 0}
                  onChange={(e) =>
                    onValueChange(material.id, "min_stock_alert", parseFloat(e.target.value) || 0)
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Alert when stock falls below this level
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor={`cost-${material.id}`}>Default Cost per sqft ($)</Label>
                <Input
                  id={`cost-${material.id}`}
                  type="number"
                  min="0"
                  step="0.01"
                  value={editedValues[material.id]?.default_cost || 0}
                  onChange={(e) =>
                    onValueChange(material.id, "default_cost", parseFloat(e.target.value) || 0)
                  }
                />
                <p className="text-xs text-muted-foreground">Default cost for new rolls</p>
              </div>

              <div className="space-y-2">
                <Label className="invisible">Action</Label>
                <Button onClick={() => onSave(material.id)} className="w-full" variant="outline">
                  <Save className="mr-2 h-4 w-4" />
                  Save Changes
                </Button>
                <p className="text-xs text-muted-foreground invisible">Placeholder for alignment</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
