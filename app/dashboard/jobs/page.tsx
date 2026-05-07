"use client"

import { useCallback, useEffect, useState } from "react"
import { ClipboardList, Edit, MoreVertical, Plus, Trash2 } from "lucide-react"
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
import { Card } from "@/app/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table"
import { EmptyState, PageHeader, PageShell, ViewToolbar } from "@/app/components/patterns"
import { jobService } from "@/src/infrastructure/services/jobService"
import type { Job, JobStatus } from "@/src/infrastructure/models/supabase"
import { cn } from "@/app/lib/utils"

import { JobDetailDrawer } from "./_components/job-detail-drawer"
import { JobFormSheet } from "./_components/job-form-sheet"

const STATUS_TONE: Record<JobStatus, string> = {
  draft: "border-border-subtle bg-muted/60 text-muted-foreground",
  scheduled: "border-info-border bg-info-bg text-info-foreground",
  in_progress: "border-warning-border bg-warning-bg text-warning-foreground",
  completed: "border-success-border bg-success-bg text-success-foreground",
  cancelled: "border-border-subtle bg-muted text-muted-foreground",
}

const STATUS_LABEL: Record<JobStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
}

function formatDate(value: string | null): string {
  if (!value) return "—"
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString()
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")

  // Form dialog — shared for create + edit.
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingJob, setEditingJob] = useState<Job | null>(null)

  // Detail drawer — clicking a row opens it. No separate /[id]
  // route; everything lives inline on the jobs list surface.
  const [drawerJobId, setDrawerJobId] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const [pendingDelete, setPendingDelete] = useState<Job | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await jobService.list()
      setJobs(data)
    } catch (err) {
      const m = err instanceof Error ? err.message : "Unknown error"
      toast.error("Failed to load jobs", { description: m })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const confirmDelete = async () => {
    if (!pendingDelete) return
    try {
      await jobService.delete(pendingDelete.id)
      toast.success("Job deleted")
      setPendingDelete(null)
      void load()
    } catch (err) {
      const m = err instanceof Error ? err.message : "Unknown error"
      toast.error("Failed to delete job", { description: m })
    }
  }

  const openDrawer = (job: Job) => {
    setDrawerJobId(job.id)
    setDrawerOpen(true)
  }

  const filtered = jobs.filter((j) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      j.name.toLowerCase().includes(q) ||
      j.job_number?.toLowerCase().includes(q) ||
      (j.customer_name ?? "").toLowerCase().includes(q) ||
      (j.customer_po_number ?? "").toLowerCase().includes(q)
    )
  })

  return (
    <PageShell variant="dense">
      <PageHeader
        crumbs={[{ label: "Operations", href: "/dashboard" }, { label: "Jobs" }]}
        title="Jobs"
        subtitle="Customer-ordered cut projects. Click a row to see parts, material sufficiency, roster, and PO status."
        actions={
          <Button
            size="sm"
            onClick={() => {
              setEditingJob(null)
              setDialogOpen(true)
            }}
          >
            <Plus className="size-3.5" />
            New job
          </Button>
        }
      />

      <Card className="overflow-hidden gap-0 p-0">
        <ViewToolbar
          searchPlaceholder="Search job, customer, PO…"
          searchValue={search}
          onSearchChange={setSearch}
        />
        {loading ? (
          <div className="px-6 py-8 text-center text-muted-foreground text-sm">Loading jobs…</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="size-5" />}
            title={jobs.length === 0 ? "No jobs yet" : "No jobs match your search"}
            description={
              jobs.length === 0
                ? "Create a job to start tracking customer-ordered cut projects."
                : "Try a different search term, or clear the filter."
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-28">Job #</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Customer PO</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((job) => (
                <TableRow
                  key={job.id}
                  data-active={drawerJobId === job.id && drawerOpen ? "" : undefined}
                  className="cursor-pointer transition-colors data-[active]:bg-muted/50"
                  onClick={() => openDrawer(job)}
                >
                  <TableCell className="font-mono text-muted-foreground text-xs">
                    {job.job_number ?? "—"}
                  </TableCell>
                  <TableCell className="font-medium text-foreground">{job.name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {job.customer_name ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground text-xs">
                    {job.customer_po_number ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn("capitalize", STATUS_TONE[job.status])}>
                      {STATUS_LABEL[job.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(job.due_date)}
                  </TableCell>
                  <TableCell className="w-10 text-right" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:text-foreground"
                        >
                          <MoreVertical className="size-4" aria-hidden="true" />
                          <span className="sr-only">Row actions</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setEditingJob(job)
                            setDialogOpen(true)
                          }}
                        >
                          <Edit className="size-3.5" aria-hidden="true" />
                          Edit job
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-danger-foreground focus:text-danger-foreground"
                          onClick={() => setPendingDelete(job)}
                        >
                          <Trash2 className="size-3.5" aria-hidden="true" />
                          Delete job
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <JobFormSheet
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditingJob(null)
        }}
        job={editingJob}
        onSuccess={(result) => {
          void load()
          if (!editingJob) {
            // Freshly-created job — pop the drawer so the operator
            // can add parts / allocate a roll immediately. No route
            // hop; everything stays on the list surface.
            toast.message("Add parts next to see material sufficiency.")
            setDrawerJobId(result.id)
            setDrawerOpen(true)
          }
        }}
      />

      <JobDetailDrawer
        jobId={drawerJobId}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onMutated={() => void load()}
        onEdit={(job) => {
          setEditingJob(job)
          setDialogOpen(true)
        }}
        onDeleted={() => {
          setDrawerJobId(null)
          void load()
        }}
      />

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this job?</AlertDialogTitle>
            <AlertDialogDescription>
              Removes {pendingDelete?.job_number ?? "the job"}
              {pendingDelete?.name ? ` — ${pendingDelete.name}` : ""} and its parts, assignees, and
              roll allocations. Cuts recorded against it stay in cut history but lose the job link.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-danger text-danger-foreground hover:bg-danger/90"
            >
              Delete job
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  )
}
