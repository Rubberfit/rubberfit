"use client"

import { useState, useEffect, useCallback } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { rollService } from "@/src/infrastructure/services/rollService"
import { cutService } from "@/src/infrastructure/services/cutService"
import type { Roll } from "@/app/lib/supabase"
import { RollSelectorTable, ConfirmCutDialog } from "./_components/roll-selector"
import { CutRequirementsForm } from "./_components/cut-requirements-form"

interface CutRequest {
  width: number
  length: number
  quantity: number
}

export default function ManualCutPlannerPage() {
  const [rolls, setRolls] = useState<Roll[]>([])
  const [selectedRoll, setSelectedRoll] = useState<Roll | null>(null)
  const [loading, setLoading] = useState(true)
  const [confirmDialog, setConfirmDialog] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [wasteCalculation, setWasteCalculation] = useState<{
    totalLengthNeeded: number
    materialUsedSqft: number
    totalConsumedSqft: number
    wasteSqft: number
    wastePercentage: number
    remainingAfter: number
    canFit: boolean
  } | null>(null)

  const [rollRanges, setRollRanges] = useState<{
    minWidth: number
    maxWidth: number
    maxLength: number
  } | null>(null)

  const form = useForm<CutRequest>({
    defaultValues: {
      width: undefined as unknown as number,
      length: undefined as unknown as number,
      quantity: 1,
    },
  })

  const fetchRolls = useCallback(async () => {
    try {
      setLoading(true)
      const activeRolls = await rollService.getActiveRolls()
      setRolls(activeRolls)
      if (activeRolls.length > 0) {
        setRollRanges({
          minWidth: Math.min(...activeRolls.map((r) => r.width)),
          maxWidth: Math.max(...activeRolls.map((r) => r.width)),
          maxLength: Math.max(...activeRolls.map((r) => r.remaining_length)),
        })
      }
    } catch (error) {
      console.error("Error fetching rolls:", error)
      toast.error("Failed to load inventory")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRolls()
  }, [fetchRolls])

  const calculateWaste = (roll: Roll) => {
    const values = form.getValues()
    if (values.width && values.length && values.quantity) {
      const totalLengthNeeded = values.length * values.quantity
      const materialUsedSqft = (values.width * totalLengthNeeded) / 144
      const totalConsumedSqft = (roll.width * totalLengthNeeded) / 144
      const wasteSqft = totalConsumedSqft - materialUsedSqft
      const wastePercentage = totalConsumedSqft > 0 ? (wasteSqft / totalConsumedSqft) * 100 : 0

      setWasteCalculation({
        totalLengthNeeded,
        materialUsedSqft,
        totalConsumedSqft,
        wasteSqft,
        wastePercentage,
        remainingAfter: roll.remaining_length - totalLengthNeeded,
        canFit: roll.width >= values.width && roll.remaining_length >= totalLengthNeeded,
      })
    }
  }

  const selectRoll = (roll: Roll) => {
    setSelectedRoll(roll)
    calculateWaste(roll)
  }

  const onSubmit = (data: CutRequest) => {
    if (!selectedRoll) {
      toast.error("Please select a roll first")
      return
    }

    const totalLengthNeeded = data.length * data.quantity

    if (selectedRoll.width < data.width) {
      toast.error(
        `Roll width (${selectedRoll.width}") is less than requested width (${data.width}")`
      )
      return
    }

    if (selectedRoll.remaining_length < totalLengthNeeded) {
      toast.error(
        `Not enough material. Need ${totalLengthNeeded}", but only ${selectedRoll.remaining_length}" available`
      )
      return
    }

    calculateWaste(selectedRoll)
    setConfirmDialog(true)
  }

  const confirmCut = async () => {
    if (!selectedRoll || !wasteCalculation) return

    setProcessing(true)
    try {
      const formData = form.getValues()

      await cutService.recordCut({
        roll_id: selectedRoll.id,
        cut_width: formData.width,
        cut_length: formData.length,
        quantity: formData.quantity,
        waste_sqft: wasteCalculation.wasteSqft,
        waste_percentage: wasteCalculation.wastePercentage,
        total_sqft_used: wasteCalculation.totalConsumedSqft,
        job_reference: "MANUAL",
        cut_by: "Current User",
        notes: "Manual roll selection",
      })

      toast.success("Cut recorded successfully! Inventory has been updated.")

      form.reset()
      setSelectedRoll(null)
      setWasteCalculation(null)
      setConfirmDialog(false)
      fetchRolls()
    } catch (error) {
      console.error("Failed to record cut:", error)
      toast.error("Failed to record cut")
    } finally {
      setProcessing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-4 md:gap-6">
        <div>
          <h1 className="text-2xl font-bold">Manual Roll Selection</h1>
          <p className="text-muted-foreground">Select a specific roll for your cut</p>
        </div>
        <div className="text-center py-12">Loading inventory...</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div>
        <h1 className="text-2xl font-bold">Manual Roll Selection</h1>
        <p className="text-muted-foreground">
          Select a specific roll for your cut instead of using optimization
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <CutRequirementsForm
          form={form}
          rollRanges={rollRanges}
          selectedRoll={selectedRoll}
          wasteCalculation={wasteCalculation}
          onSubmit={onSubmit}
          calculateWaste={calculateWaste}
        />

        <RollSelectorTable
          rolls={rolls}
          selectedRoll={selectedRoll}
          onSelectRoll={selectRoll}
          wasteCalculation={wasteCalculation}
          form={form}
        />
      </div>

      <ConfirmCutDialog
        open={confirmDialog}
        onOpenChange={setConfirmDialog}
        selectedRoll={selectedRoll}
        wasteCalculation={wasteCalculation}
        formValues={form.getValues()}
        processing={processing}
        onConfirm={confirmCut}
      />
    </div>
  )
}
