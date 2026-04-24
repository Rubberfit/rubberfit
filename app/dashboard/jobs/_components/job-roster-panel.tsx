"use client"

import { useState } from "react"
import { HardHat, Plus, Trash2, UserCog } from "lucide-react"
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
import { Textarea } from "@/app/components/ui/textarea"
import { jobService } from "@/src/infrastructure/services/jobService"
import type {
  JobAssignee,
  JobAssigneeRole,
} from "@/src/infrastructure/models/supabase"

/**
 * Roster panel — lead + worker assignees on the job. Appears on
 * the detail page and on the PDF. The DB enforces one-lead-per-
 * job via a partial unique index so the UI stays optimistic;
 * the insert simply fails with a toast if a second lead is
 * submitted.
 */

interface JobRosterPanelProps {
  jobId: string
  assignees: JobAssignee[]
  onChanged: () => void
}

export function JobRosterPanel({ jobId, assignees, onChanged }: JobRosterPanelProps) {
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [name, setName] = useState("")
  const [role, setRole] = useState<JobAssigneeRole>("worker")
  const [notes, setNotes] = useState("")

  const lead = assignees.find((a) => a.role === "lead") ?? null
  const workers = assignees.filter((a) => a.role === "worker")

  const reset = () => {
    setName("")
    setRole("worker")
    setNotes("")
  }

  const handleAdd = async () => {
    if (!name.trim()) {
      toast.error("Name is required")
      return
    }
    setSubmitting(true)
    try {
      await jobService.addAssignee({
        job_id: jobId,
        name: name.trim(),
        role,
        notes: notes.trim() || undefined,
      })
      toast.success(role === "lead" ? "Lead assigned" : "Worker added")
      reset()
      setOpen(false)
      onChanged()
    } catch (err) {
      const m = err instanceof Error ? err.message : "Unknown error"
      // Postgres unique violation on the one-lead-per-job partial index.
      const hint =
        role === "lead" && m.toLowerCase().includes("idx_job_assignees_one_lead")
          ? "A lead is already assigned to this job. Remove them first."
          : undefined
      toast.error("Failed to add to roster", { description: hint ?? m })
    } finally {
      setSubmitting(false)
    }
  }

  const handleRemove = async (id: string) => {
    try {
      await jobService.removeAssignee(id)
      toast.success("Removed from roster")
      onChanged()
    } catch (err) {
      const m = err instanceof Error ? err.message : "Unknown error"
      toast.error("Failed to remove", { description: m })
    }
  }

  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-foreground text-base tracking-tight">Roster</h2>
          <p className="text-muted-foreground text-xs">
            {lead ? "1 lead" : "No lead"} · {workers.length} worker{workers.length === 1 ? "" : "s"}
          </p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="size-3.5" />
          Add
        </Button>
      </header>

      <Card className="gap-0 p-0 divide-y divide-border-subtle">
        <div className="flex items-center gap-3 px-4 py-3">
          <UserCog className="size-4 text-muted-foreground" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
              Lead
            </p>
            <p className="text-foreground text-sm">
              {lead ? (
                <>
                  {lead.name}
                  {lead.notes && (
                    <span className="ml-2 text-muted-foreground text-xs">· {lead.notes}</span>
                  )}
                </>
              ) : (
                <span className="text-muted-foreground">Unassigned</span>
              )}
            </p>
          </div>
          {lead && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:text-danger-foreground"
              onClick={() => handleRemove(lead.id)}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              <span className="sr-only">Remove lead</span>
            </Button>
          )}
        </div>
        {workers.length === 0 ? (
          <div className="flex items-center gap-3 px-4 py-3">
            <HardHat className="size-4 text-muted-foreground" aria-hidden="true" />
            <p className="text-muted-foreground text-sm">No workers assigned yet.</p>
          </div>
        ) : (
          workers.map((w) => (
            <div key={w.id} className="flex items-center gap-3 px-4 py-3">
              <HardHat className="size-4 text-muted-foreground" aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
                  Worker
                </p>
                <p className="text-foreground text-sm">
                  {w.name}
                  {w.notes && (
                    <span className="ml-2 text-muted-foreground text-xs">· {w.notes}</span>
                  )}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground hover:text-danger-foreground"
                onClick={() => handleRemove(w.id)}
              >
                <Trash2 className="size-4" aria-hidden="true" />
                <span className="sr-only">Remove worker</span>
              </Button>
            </div>
          ))
        )}
      </Card>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add to roster</DialogTitle>
            <DialogDescription>
              Names print on the job sheet PDF. One lead per job is enforced at the DB.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="roster-name">Name *</Label>
              <Input
                id="roster-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Castillo"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Role *</Label>
              <Select value={role} onValueChange={(v) => setRole(v as JobAssigneeRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lead">Lead</SelectItem>
                  <SelectItem value="worker">Worker</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="roster-notes">Notes</Label>
              <Textarea
                id="roster-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="resize-none"
                placeholder="Shift, certifications, etc."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={submitting}>
              {submitting ? "Adding…" : "Add"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
