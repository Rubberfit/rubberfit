"use client"

import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { toast } from "sonner"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/app/components/ui/form"
import { Input } from "@/app/components/ui/input"
import { Textarea } from "@/app/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select"
import { Button } from "@/app/components/ui/button"

import { jobService } from "@/src/infrastructure/services/jobService"
import type { Job, JobStatus } from "@/src/infrastructure/models/supabase"

/**
 * Create / edit a job. Covers the parent row only — parts are
 * managed from the detail page so large cut lists don't bloat the
 * dialog. Customer info is inline (no separate customers table).
 */

const jobSchema = z.object({
  // `.trim()` on every text field so whitespace-only values don't
  // slip past `.min(1)` or persist as padded strings. The hand-
  // rolled customer_email regex below was also rejecting valid
  // addresses like `orders+plant@…` (no `+` in the charset);
  // swapping to Zod's built-in `.email()` fixes that too. Empty
  // strings are normalised to undefined so the optional check on
  // the email still passes when the field is simply blank.
  name: z.string().trim().min(1, "Job name is required"),
  description: z.string().trim().optional(),
  customer_name: z.string().trim().optional(),
  customer_email: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().email("Enter a valid email").optional()
  ),
  customer_phone: z.string().trim().optional(),
  customer_po_number: z.string().trim().optional(),
  status: z.enum(["draft", "scheduled", "in_progress", "completed", "cancelled"]),
  due_date: z.string().optional(),
  notes: z.string().trim().optional(),
})

type JobFormValues = z.infer<typeof jobSchema>

interface JobFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  job?: Job | null
  onSuccess?: (job: Job) => void
}

const STATUS_OPTIONS: Array<{ value: JobStatus; label: string }> = [
  { value: "draft", label: "Draft" },
  { value: "scheduled", label: "Scheduled" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
]

export function JobFormDialog({ open, onOpenChange, job, onSuccess }: JobFormDialogProps) {
  const [loading, setLoading] = useState(false)
  const isEdit = !!job

  const form = useForm<JobFormValues>({
    resolver: zodResolver(jobSchema),
    defaultValues: {
      name: "",
      description: "",
      customer_name: "",
      customer_email: "",
      customer_phone: "",
      customer_po_number: "",
      status: "draft",
      due_date: "",
      notes: "",
    },
  })

  useEffect(() => {
    if (!open) return
    if (job) {
      form.reset({
        name: job.name,
        description: job.description ?? "",
        customer_name: job.customer_name ?? "",
        customer_email: job.customer_email ?? "",
        customer_phone: job.customer_phone ?? "",
        customer_po_number: job.customer_po_number ?? "",
        status: job.status,
        due_date: job.due_date ?? "",
        notes: job.notes ?? "",
      })
    } else {
      form.reset({
        name: "",
        description: "",
        customer_name: "",
        customer_email: "",
        customer_phone: "",
        customer_po_number: "",
        status: "draft",
        due_date: "",
        notes: "",
      })
    }
  }, [job, open, form])

  const onSubmit = async (values: JobFormValues) => {
    setLoading(true)
    try {
      const payload = {
        name: values.name,
        description: values.description || undefined,
        customer_name: values.customer_name || undefined,
        customer_email: values.customer_email || undefined,
        customer_phone: values.customer_phone || undefined,
        customer_po_number: values.customer_po_number || undefined,
        status: values.status,
        due_date: values.due_date || undefined,
        notes: values.notes || undefined,
      }
      const result =
        isEdit && job
          ? await jobService.update(job.id, payload)
          : await jobService.create(payload)
      toast.success(isEdit ? "Job updated" : "Job created")
      onSuccess?.(result)
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error"
      toast.error(isEdit ? "Failed to update job" : "Failed to create job", {
        description: message,
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit job" : "New job"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update this job's details. Parts are managed on the detail page."
              : "Create a job first; add the parts list after it's saved."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Job name *</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. ACME Gaskets — Batch 42" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="customer_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer name</FormLabel>
                    <FormControl>
                      <Input placeholder="ACME Gaskets Inc." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="customer_po_number"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer PO #</FormLabel>
                    <FormControl>
                      <Input placeholder="PO-C8821" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="customer_email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="orders@acme.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="customer_phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer phone</FormLabel>
                    <FormControl>
                      <Input placeholder="(555) 123-4567" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {STATUS_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="due_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Due date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="What's this job for?"
                      className="resize-none"
                      rows={2}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Internal notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Shop-floor notes, special instructions…"
                      className="resize-none"
                      rows={2}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Saving…" : isEdit ? "Save changes" : "Create job"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
