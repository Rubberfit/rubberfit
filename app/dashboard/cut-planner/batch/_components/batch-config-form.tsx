"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/app/components/ui/card"
import { Button } from "@/app/components/ui/button"
import { Input } from "@/app/components/ui/input"
import { Label } from "@/app/components/ui/label"
import { Badge } from "@/app/components/ui/badge"
import { Plus, Trash2, Calculator, Package } from "lucide-react"
import type { MaterialType } from "@/src/infrastructure/models/supabase"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select"

interface BatchCutItem {
  id: string
  materialType: string
  width: number
  length: number
  quantity: number
  thickness?: number
}

interface BatchConfigFormProps {
  materialTypes: MaterialType[]
  rollRanges: {
    minWidth: number
    maxWidth: number
    maxLength: number
    minThickness: number
    maxThickness: number
  } | null
  newCut: Partial<BatchCutItem>
  setNewCut: React.Dispatch<React.SetStateAction<Partial<BatchCutItem>>>
  onAddCut: () => void
  cutRequests: BatchCutItem[]
  onRemoveCut: (id: string) => void
  onOptimize: () => void
  loading: boolean
}

export function BatchConfigForm({
  materialTypes,
  rollRanges,
  newCut,
  setNewCut,
  onAddCut,
  cutRequests,
  onRemoveCut,
  onOptimize,
  loading,
}: BatchConfigFormProps) {
  return (
    <>
      {/* Add Cut Form */}
      <Card>
        <CardHeader>
          <CardTitle>Add Cut to Batch</CardTitle>
          <CardDescription>Add cuts one by one, then optimize the entire batch</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-5">
            <div className="space-y-2">
              <Label>Material Type</Label>
              <Select
                value={newCut.materialType}
                onValueChange={(value) => setNewCut((prev) => ({ ...prev, materialType: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select material" />
                </SelectTrigger>
                <SelectContent>
                  {materialTypes.map((type) => (
                    <SelectItem key={type.id} value={type.name}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Width (inches)</Label>
              <Input
                type="number"
                min="0"
                step="0.001"
                value={newCut.width ?? ""}
                onChange={(e) =>
                  setNewCut((prev) => ({
                    ...prev,
                    width: e.target.value ? parseFloat(e.target.value) : undefined,
                  }))
                }
                placeholder={
                  rollRanges ? `e.g. ${rollRanges.minWidth}\u2013${rollRanges.maxWidth}` : "12"
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Length (inches)</Label>
              <Input
                type="number"
                min="0"
                step="0.001"
                value={newCut.length ?? ""}
                onChange={(e) =>
                  setNewCut((prev) => ({
                    ...prev,
                    length: e.target.value ? parseFloat(e.target.value) : undefined,
                  }))
                }
                placeholder={rollRanges ? `e.g. up to ${rollRanges.maxLength}` : "24"}
              />
            </div>

            <div className="space-y-2">
              <Label>Quantity</Label>
              <Input
                type="number"
                min="1"
                value={newCut.quantity ?? ""}
                onChange={(e) =>
                  setNewCut((prev) => ({
                    ...prev,
                    quantity: e.target.value ? parseInt(e.target.value) : undefined,
                  }))
                }
                placeholder="1"
              />
            </div>

            <div className="space-y-2">
              <Label className="invisible">Action</Label>
              <Button onClick={onAddCut} className="w-full">
                <Plus className="mr-2 h-4 w-4" />
                Add to Batch
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Batch List */}
      {cutRequests.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Batch Queue</CardTitle>
                <CardDescription>
                  {cutRequests.length} cut{cutRequests.length !== 1 ? "s" : ""} ready for
                  optimization
                </CardDescription>
              </div>
              <Button onClick={onOptimize} disabled={loading}>
                <Calculator className="mr-2 h-4 w-4" />
                {loading ? "Optimizing..." : "Optimize Batch"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {cutRequests.map((cut) => (
                <div
                  key={cut.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{cut.materialType}</span>
                    <Badge variant="outline">
                      {cut.width}" x {cut.length}" x {cut.quantity}
                    </Badge>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => onRemoveCut(cut.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </>
  )
}
