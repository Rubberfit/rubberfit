"use client"

import { useEffect, useState } from "react"
import { Layers, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/app/components/ui/button"
import { Card } from "@/app/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog"
import { Input } from "@/app/components/ui/input"
import { Label } from "@/app/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select"
import { jobService } from "@/src/infrastructure/services/jobService"
import { rolls as rollsSdk } from "@/src/infrastructure/api-client/rf/inventory"
import type { JobRollAllocationWithRoll, Roll } from "@/src/infrastructure/models/supabase"

/**
 * Roll-allocation panel — lists inventory rolls earmarked to fulfil
 * the job + how much length of each. Purely informational: cuts
 * against a roll still decrement `rolls.remaining_length` through
 * the cut route; allocations are the planning document.
 */

interface JobAllocationsPanelProps {
  jobId: string
  allocations: JobRollAllocationWithRoll[]
  onChanged: () => void
}

export function JobAllocationsPanel({ jobId, allocations, onChanged }: JobAllocationsPanelProps) {
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [availableRolls, setAvailableRolls] = useState<Roll[]>([])
  const [selectedRollId, setSelectedRollId] = useState<string>("")
  const [lengthInput, setLengthInput] = useState<string>("")

  useEffect(() => {
    if (!open) return
    rollsSdk
      .list({ status: "active" })
      .then((data) => {
        const allocatedIds = new Set(allocations.map((a) => a.roll_id))
        setAvailableRolls((data ?? []).filter((r) => !allocatedIds.has(r.id)))
      })
      .catch(() => setAvailableRolls([]))
  }, [open, allocations])

  const selectedRoll = availableRolls.find((r) => r.id === selectedRollId) ?? null

  const totalSqft = allocations.reduce((sum, a) => {
    const w = a.roll?.width ?? 0
    return sum + (a.allocated_length * w) / 144
  }, 0)

  const reset = () => {
    setSelectedRollId("")
    setLengthInput("")
  }

  const handleAdd = async () => {
    if (!selectedRoll) {
      toast.error("Pick a roll")
      return
    }
    const length = Number(lengthInput)
    if (!Number.isFinite(length) || length <= 0) {
      toast.error("Enter a length > 0")
      return
    }
    if (length > selectedRoll.remaining_length) {
      toast.error("Length exceeds roll's remaining stock", {
        description: `Only ${selectedRoll.remaining_length}″ left on this roll.`,
      })
      return
    }
    setSubmitting(true)
    try {
      await jobService.addAllocation({
        job_id: jobId,
        roll_id: selectedRoll.id,
        allocated_length: length,
      })
      toast.success("Roll allocated to job")
      reset()
      setOpen(false)
      onChanged()
    } catch (err) {
      const m = err instanceof Error ? err.message : "Unknown error"
      toast.error("Failed to allocate roll", { description: m })
    } finally {
      setSubmitting(false)
    }
  }

  const handleRemove = async (id: string) => {
    try {
      await jobService.removeAllocation(id)
      toast.success("Allocation removed")
      onChanged()
    } catch (err) {
      const m = err instanceof Error ? err.message : "Unknown error"
      toast.error("Failed to remove allocation", { description: m })
    }
  }

  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-foreground text-base tracking-tight">
            Allocated rolls
          </h2>
          <p className="text-muted-foreground text-xs">
            {allocations.length} roll{allocations.length === 1 ? "" : "s"} · {totalSqft.toFixed(1)}{" "}
            sqft committed
          </p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="size-3.5" />
          Allocate roll
        </Button>
      </header>

      <Card className="gap-0 p-0 divide-y divide-border-subtle">
        {allocations.length === 0 ? (
          <div className="flex items-center gap-3 px-4 py-5">
            <Layers className="size-4 text-muted-foreground" aria-hidden="true" />
            <p className="text-muted-foreground text-sm">No rolls earmarked for this job yet.</p>
          </div>
        ) : (
          allocations.map((a) => {
            const roll = a.roll
            const sqft = roll ? (a.allocated_length * roll.width) / 144 : 0
            return (
              <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                <Layers className="size-4 text-muted-foreground" aria-hidden="true" />
                <div className="flex-1 min-w-0 space-y-0.5">
                  <p className="flex items-center gap-2">
                    <span className="font-mono text-foreground/90 text-xs">
                      {roll?.part_number ?? "—"}
                    </span>
                    <span className="text-foreground text-sm">
                      {roll?.material_type ?? "(roll missing)"}
                    </span>
                    {roll?.location && (
                      <span className="text-muted-foreground text-xs">· {roll.location}</span>
                    )}
                  </p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {a.allocated_length}″ allocated · {sqft.toFixed(1)} sqft
                    {roll && (
                      <span className="ml-2 text-muted-foreground">
                        ({roll.remaining_length}″ remaining on roll)
                      </span>
                    )}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground hover:text-danger-foreground"
                  onClick={() => handleRemove(a.id)}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                  <span className="sr-only">Remove allocation</span>
                </Button>
              </div>
            )
          })
        )}
      </Card>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v)
          if (!v) reset()
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Allocate a roll</DialogTitle>
            <DialogDescription>
              Earmark inventory for this job. Only active rolls not already allocated to this job
              are shown.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Roll *</Label>
              <Select value={selectedRollId} onValueChange={setSelectedRollId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick an active roll" />
                </SelectTrigger>
                <SelectContent>
                  {availableRolls.length === 0 ? (
                    <div className="px-2 py-1.5 text-muted-foreground text-xs">
                      No eligible rolls available.
                    </div>
                  ) : (
                    availableRolls.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        <span className="font-mono text-xs">{r.part_number ?? "—"}</span>
                        <span className="ml-2">
                          {r.material_type} · {r.width}″ × {r.remaining_length}″
                        </span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="alloc-length">Length to allocate (in) *</Label>
              <Input
                id="alloc-length"
                type="number"
                step="0.001"
                min="0.001"
                value={lengthInput}
                onChange={(e) => setLengthInput(e.target.value)}
                placeholder={
                  selectedRoll ? `up to ${selectedRoll.remaining_length}″` : "length in inches"
                }
              />
              {selectedRoll && (
                <p className="text-muted-foreground text-[11px]">
                  {selectedRoll.width}″ width · {selectedRoll.remaining_length}″ remaining
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={submitting}>
              {submitting ? "Allocating…" : "Allocate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
