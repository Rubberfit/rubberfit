"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Download, Edit, Scissors, Share2, Trash2 } from "lucide-react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/app/components/ui/alert-dialog"
import { Badge } from "@/app/components/ui/badge"
import { Button } from "@/app/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/app/components/ui/sheet"
import { jobService } from "@/src/infrastructure/services/jobService"
import type { JobMaterialSufficiency } from "@/src/infrastructure/services/jobService"
import type {
  CutHistory,
  Job,
  JobFullDetail,
  PurchaseOrder,
} from "@/src/infrastructure/models/supabase"
import { cn } from "@/app/lib/utils"

import { useOrganizationPreferences } from "@/app/dashboard/_components/organization-preferences-provider"

import { JobAllocationsPanel } from "./job-allocations-panel"
import { JobCutsPanel } from "./job-cuts-panel"
import { JobPartsPanel } from "./job-parts-panel"
import { downloadJobPdf } from "./job-pdf"
import { JobPurchaseOrdersPanel } from "./job-purchase-orders-panel"
import { JobRosterPanel } from "./job-roster-panel"
import { JobShareLinkSheet } from "./job-share-link-sheet"
import { formatDate, STATUS_LABEL, STATUS_TONE } from "./job-status-utils"
import { JobSufficiencyPanel } from "./job-sufficiency-panel"

/**
 * Right-docked detail panel for a single job. Opens when a row
 * in the jobs list is clicked, collapses the old `/jobs/[id]`
 * route into an inline view so operators never leave the list.
 *
 * Fetches parts + assignees + allocations + sufficiency + POs +
 * cuts on open (all parallel, all `allSettled` so a partial data
 * failure still renders the header and unblocks Edit / Delete).
 *
 * `STATUS_TONE`, `STATUS_LABEL`, `formatDate` are imported from
 * `./job-status-utils` so the list page and this drawer share one
 * source of truth (a new `JobStatus` value can't silently diverge
 * between the two consumers).
 */

interface JobDetailDrawerProps {
  jobId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called when data inside the drawer mutates (so the list can refresh totals). */
  onMutated?: () => void
  /** Called when the user clicks Edit — parent opens the form dialog in edit mode. */
  onEdit?: (job: Job) => void
  /** Called after a successful delete so the list can refresh and close the drawer. */
  onDeleted?: () => void
}

export function JobDetailDrawer({
  jobId,
  open,
  onOpenChange,
  onMutated,
  onEdit,
  onDeleted,
}: JobDetailDrawerProps) {
  const router = useRouter()
  const organizationPreferences = useOrganizationPreferences()
  const [job, setJob] = useState<JobFullDetail | null>(null)
  const [sufficiency, setSufficiency] = useState<JobMaterialSufficiency[]>([])
  const [linkedPOs, setLinkedPOs] = useState<PurchaseOrder[]>([])
  const [linkedCuts, setLinkedCuts] = useState<CutHistory[]>([])
  const [loading, setLoading] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)

  const load = useCallback(async (id: string) => {
    setLoading(true)
    try {
      const data = await jobService.getFull(id)
      setJob(data)
      if (!data) return
      const [sffR, posR, cutsR] = await Promise.allSettled([
        jobService.computeSufficiency(id),
        jobService.listPurchaseOrders(id),
        jobService.listCuts(id),
      ])
      if (sffR.status === "fulfilled") setSufficiency(sffR.value)
      if (posR.status === "fulfilled") setLinkedPOs(posR.value)
      if (cutsR.status === "fulfilled") setLinkedCuts(cutsR.value)
    } catch (err) {
      const m = err instanceof Error ? err.message : "Unknown error"
      toast.error("Failed to load job", { description: m })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open || !jobId) return
    void load(jobId)
  }, [open, jobId, load])

  const handleMutated = () => {
    if (jobId) void load(jobId)
    onMutated?.()
  }

  const handleExportPdf = () => {
    if (!job) return
    try {
      // Customer-facing PDF — operator prefs govern dates/units/currency
      // per the 2026-05-14 operator-seeds-prints ruling.
      downloadJobPdf(job, { organizationPreferences })
      toast.success("PDF downloaded")
    } catch (err) {
      const m = err instanceof Error ? err.message : "Unknown error"
      toast.error("Failed to build PDF", { description: m })
    }
  }

  const handleDelete = async () => {
    if (!jobId) return
    try {
      await jobService.delete(jobId)
      toast.success("Job deleted")
      setDeleteOpen(false)
      onOpenChange(false)
      onDeleted?.()
    } catch (err) {
      const m = err instanceof Error ? err.message : "Unknown error"
      toast.error("Failed to delete job", { description: m })
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:w-full sm:max-w-3xl flex flex-col gap-0 p-0">
          {loading || !job ? (
            <>
              {/* Radix requires a DialogTitle for a11y even in
                  loading / not-found states. Hidden-but-announced
                  so screen readers still get the context. */}
              <SheetHeader className="sr-only">
                <SheetTitle>{loading ? "Loading job" : "Job not found"}</SheetTitle>
                <SheetDescription>
                  {loading
                    ? "Fetching parts, roster, and inventory sufficiency."
                    : "The selected job could not be loaded."}
                </SheetDescription>
              </SheetHeader>
              <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
                {loading ? "Loading job…" : "Job not found."}
              </div>
            </>
          ) : (
            <>
              <SheetHeader className="border-b px-6 pt-6 pb-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <SheetTitle className="truncate font-semibold text-base tracking-tight">
                        {job.name}
                      </SheetTitle>
                      <Badge
                        variant="outline"
                        className={cn("shrink-0 capitalize text-[10px]", STATUS_TONE[job.status])}
                      >
                        {STATUS_LABEL[job.status]}
                      </Badge>
                    </div>
                    <SheetDescription className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-muted-foreground text-xs">
                      <span className="font-mono text-foreground/80">{job.job_number}</span>
                      {job.customer_name && (
                        <>
                          <span>·</span>
                          <span>{job.customer_name}</span>
                        </>
                      )}
                      {job.customer_po_number && (
                        <>
                          <span>·</span>
                          <span className="font-mono">PO {job.customer_po_number}</span>
                        </>
                      )}
                      {job.due_date && (
                        <>
                          <span>·</span>
                          <span>Due {formatDate(job.due_date)}</span>
                        </>
                      )}
                    </SheetDescription>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      // Hops to the cutting engine with `?loadJob=<id>`.
                      // Engine tags every subsequent cut with this
                      // job's id so the Cuts Recorded panel below
                      // picks them up.
                      router.push(`/dashboard/cutting-engine?loadJob=${job.id}`)
                      onOpenChange(false)
                    }}
                  >
                    <Scissors className="size-3.5" />
                    Run in engine
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleExportPdf}>
                    <Download className="size-3.5" />
                    Export PDF
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShareOpen(true)}>
                    <Share2 className="size-3.5" />
                    Share link
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onEdit?.(job)
                      onOpenChange(false)
                    }}
                  >
                    <Edit className="size-3.5" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-danger-foreground hover:text-danger-foreground"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <Trash2 className="size-3.5" />
                    Delete
                  </Button>
                </div>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
                <JobPartsPanel jobId={job.id} parts={job.parts} onChanged={handleMutated} />
                <JobSufficiencyPanel jobId={job.id} rows={sufficiency} />
                <JobRosterPanel
                  jobId={job.id}
                  assignees={job.assignees}
                  onChanged={handleMutated}
                />
                <JobAllocationsPanel
                  jobId={job.id}
                  allocations={job.allocations}
                  onChanged={handleMutated}
                />
                <JobPurchaseOrdersPanel orders={linkedPOs} />
                <JobCutsPanel cuts={linkedCuts} />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {job && <JobShareLinkSheet open={shareOpen} onOpenChange={setShareOpen} job={job} />}

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this job?</AlertDialogTitle>
            <AlertDialogDescription>
              Removes the job, its parts, assignees, and roll allocations. Cuts recorded against it
              stay in cut history but lose the job link.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-danger text-danger-foreground hover:bg-danger/90"
            >
              Delete job
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
