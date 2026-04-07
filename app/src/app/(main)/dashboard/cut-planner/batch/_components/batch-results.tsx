"use client"

import { Scissors } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

interface CutOptimization {
  roll: { id: string; location?: string }
  total_length_needed: number
  material_used_sqft: number
  waste_sqft: number
  waste_percentage: number
  remaining_length_after: number
  remaining_value_after: number
  score: number
}

interface BatchCutItem {
  id: string
  materialType: string
  width: number
  length: number
  quantity: number
  thickness?: number
}

interface BatchOptimizationResult {
  cuts: Array<{
    cutRequest: BatchCutItem
    recommendation: CutOptimization
  }>
  totalWaste: number
  totalMaterialUsed: number
  wastePercentage: number
}

interface BatchResultsProps {
  optimizationResult: BatchOptimizationResult
  onCancel: () => void
  onExecute: () => void
}

export function BatchResults({ optimizationResult, onCancel, onExecute }: BatchResultsProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Optimization Results</CardTitle>
            <CardDescription>Optimized placement for all cuts in the batch</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={onExecute}>
              <Scissors className="mr-2 h-4 w-4" />
              Execute Batch
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Summary */}
        <div className="grid gap-4 md:grid-cols-3 mb-6">
          <div className="p-4 border rounded-lg">
            <div className="text-sm text-muted-foreground">Total Cuts</div>
            <div className="text-2xl font-bold">{optimizationResult.cuts.length}</div>
          </div>
          <div className="p-4 border rounded-lg">
            <div className="text-sm text-muted-foreground">Total Material Used</div>
            <div className="text-2xl font-bold">
              {optimizationResult.totalMaterialUsed.toFixed(2)} sqft
            </div>
          </div>
          <div className="p-4 border rounded-lg">
            <div className="text-sm text-muted-foreground">Overall Waste</div>
            <div className="text-2xl font-bold flex items-center gap-2">
              {optimizationResult.wastePercentage.toFixed(1)}%
              {optimizationResult.wastePercentage < 10 && (
                <Badge variant="default" className="bg-green-500">
                  Excellent
                </Badge>
              )}
              {optimizationResult.wastePercentage >= 10 &&
                optimizationResult.wastePercentage < 20 && (
                  <Badge variant="default" className="bg-amber-500">
                    Good
                  </Badge>
                )}
              {optimizationResult.wastePercentage >= 20 && (
                <Badge variant="destructive">High</Badge>
              )}
            </div>
          </div>
        </div>

        {/* Individual Cuts */}
        <div className="space-y-2">
          {optimizationResult.cuts.map((result, index) => (
            <div key={index} className="p-3 border rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="font-medium">Cut {index + 1}:</span>
                  <Badge variant="outline">
                    {result.cutRequest.width}" x {result.cutRequest.length}" x{" "}
                    {result.cutRequest.quantity}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    from {result.cutRequest.materialType}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm">
                    Roll:{" "}
                    {result.recommendation.roll.location ||
                      `#${result.recommendation.roll.id.slice(0, 8)}`}
                  </span>
                  <Badge
                    variant={
                      result.recommendation.waste_percentage < 10
                        ? "default"
                        : result.recommendation.waste_percentage < 20
                          ? "secondary"
                          : "destructive"
                    }
                  >
                    {result.recommendation.waste_percentage.toFixed(1)}% waste
                  </Badge>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
