"use client"

import { useState, useEffect } from "react"
import { toast } from "sonner"
import type { MaterialType, Roll } from "@/app/lib/supabase"
import { cutService } from "@/src/infrastructure/services/cutService"
import { materialTypeService } from "@/src/infrastructure/services/materialTypeService"
import { rollService } from "@/src/infrastructure/services/rollService"
import { BatchResults } from "./_components/batch-results"
import { BatchConfigForm } from "./_components/batch-config-form"
import { BatchConfirmDialog } from "./_components/batch-confirm-dialog"

interface CutOptimization {
  roll: Roll
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

export default function BatchCutPlannerPage() {
  const [cutRequests, setCutRequests] = useState<BatchCutItem[]>([])
  const [materialTypes, setMaterialTypes] = useState<MaterialType[]>([])
  const [rollRanges, setRollRanges] = useState<{
    minWidth: number
    maxWidth: number
    maxLength: number
    minThickness: number
    maxThickness: number
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [optimizationResult, setOptimizationResult] = useState<BatchOptimizationResult | null>(null)
  const [confirmDialog, setConfirmDialog] = useState(false)
  const [processing, setProcessing] = useState(false)

  const [newCut, setNewCut] = useState<Partial<BatchCutItem>>({
    materialType: "",
  })

  useEffect(() => {
    const load = async () => {
      try {
        const [types, activeRolls] = await Promise.all([
          materialTypeService.getAll(),
          rollService.getActiveRolls(),
        ])
        setMaterialTypes(types || [])
        if (activeRolls.length > 0) {
          setRollRanges({
            minWidth: Math.min(...activeRolls.map((r) => r.width)),
            maxWidth: Math.max(...activeRolls.map((r) => r.width)),
            maxLength: Math.max(...activeRolls.map((r) => r.remaining_length)),
            minThickness: Math.min(...activeRolls.map((r) => r.thickness)),
            maxThickness: Math.max(...activeRolls.map((r) => r.thickness)),
          })
        }
      } catch (_error) {
        toast.error("Failed to load material types")
      }
    }
    load()
  }, [])

  const addCutRequest = () => {
    if (!newCut.materialType) {
      toast.error("Please select a material type")
      return
    }
    if (!newCut.width || newCut.width <= 0) {
      toast.error("Width must be greater than 0")
      return
    }
    if (!newCut.length || newCut.length <= 0) {
      toast.error("Length must be greater than 0")
      return
    }
    if (!newCut.quantity || newCut.quantity <= 0) {
      toast.error("Quantity must be greater than 0")
      return
    }

    const cutItem: BatchCutItem = {
      id: Date.now().toString(),
      materialType: newCut.materialType,
      width: newCut.width,
      length: newCut.length,
      quantity: newCut.quantity,
      thickness: newCut.thickness,
    }

    setCutRequests((prev) => [...prev, cutItem])
    setNewCut({ materialType: "" })
    toast.success("Cut added to batch")
  }

  const removeCutRequest = (id: string) => {
    setCutRequests((prev) => prev.filter((cut) => cut.id !== id))
  }

  const optimizeBatch = async () => {
    if (cutRequests.length === 0) {
      toast.error("Please add at least one cut request")
      return
    }

    setLoading(true)
    try {
      const cutsByMaterial = cutRequests.reduce(
        (acc, cut) => {
          if (!acc[cut.materialType]) {
            acc[cut.materialType] = []
          }
          acc[cut.materialType].push(cut)
          return acc
        },
        {} as Record<string, BatchCutItem[]>
      )

      const optimizationPromises = []

      for (const [_materialType, cuts] of Object.entries(cutsByMaterial)) {
        for (const cut of cuts) {
          optimizationPromises.push(
            cutService
              .optimizeCut({
                materialType: cut.materialType,
                width: cut.width,
                length: cut.length,
                quantity: cut.quantity,
                thickness: cut.thickness,
              })
              .then((result) => ({
                cutRequest: cut,
                recommendation: result.recommendations[0],
              }))
          )
        }
      }

      const results = await Promise.all(optimizationPromises)

      const totalWaste = results.reduce((sum, r) => sum + r.recommendation.waste_sqft, 0)
      const totalMaterialUsed = results.reduce(
        (sum, r) => sum + r.recommendation.material_used_sqft,
        0
      )
      const wastePercentage =
        totalMaterialUsed > 0 ? (totalWaste / (totalMaterialUsed + totalWaste)) * 100 : 0

      setOptimizationResult({
        cuts: results,
        totalWaste,
        totalMaterialUsed,
        wastePercentage,
      })
    } catch (error) {
      console.error("Failed to optimize batch:", error)
      toast.error("Failed to optimize batch cuts")
    } finally {
      setLoading(false)
    }
  }

  const confirmBatch = async () => {
    if (!optimizationResult) return

    setProcessing(true)
    try {
      for (const { cutRequest, recommendation } of optimizationResult.cuts) {
        await cutService.recordCut({
          roll_id: recommendation.roll.id,
          cut_width: cutRequest.width,
          cut_length: cutRequest.length,
          quantity: cutRequest.quantity,
          waste_sqft: recommendation.waste_sqft,
          waste_percentage: recommendation.waste_percentage,
          total_sqft_used: recommendation.material_used_sqft + recommendation.waste_sqft,
          job_reference: `BATCH-${Date.now()}`,
          cut_by: "Current User",
          notes: "Batch cut",
        })
      }

      toast.success(`Successfully processed ${optimizationResult.cuts.length} cuts!`)

      setCutRequests([])
      setOptimizationResult(null)
      setConfirmDialog(false)
    } catch (error) {
      console.error("Failed to process batch:", error)
      toast.error("Failed to process some cuts")
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div>
        <h1 className="text-2xl font-bold">Batch Cut Planner</h1>
        <p className="text-muted-foreground">
          Add multiple cuts and optimize them together for maximum efficiency
        </p>
      </div>

      <BatchConfigForm
        materialTypes={materialTypes}
        rollRanges={rollRanges}
        newCut={newCut}
        setNewCut={setNewCut}
        onAddCut={addCutRequest}
        cutRequests={cutRequests}
        onRemoveCut={removeCutRequest}
        onOptimize={optimizeBatch}
        loading={loading}
      />

      {optimizationResult && (
        <BatchResults
          optimizationResult={optimizationResult}
          onCancel={() => setOptimizationResult(null)}
          onExecute={() => setConfirmDialog(true)}
        />
      )}

      <BatchConfirmDialog
        open={confirmDialog}
        onOpenChange={setConfirmDialog}
        optimizationResult={optimizationResult}
        processing={processing}
        onConfirm={confirmBatch}
      />
    </div>
  )
}
