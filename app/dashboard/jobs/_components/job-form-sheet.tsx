"use client"

import { useEffect, useState } from "react"
import { ChevronLeft, X } from "lucide-react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { toast } from "sonner"

import { Button } from "@/app/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/app/components/ui/form"
import { Input } from "@/app/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/app/components/ui/sheet"
import { Textarea } from "@/app/components/ui/textarea"

import { jobService } from "@/src/infrastructure/services/jobService"
import type { Job, JobStatus } from "@/src/infrastructure/models/supabase"

/**
 * Create / edit a job — Phase 4.
 *
 * Right-docked `<Sheet>` replacement for the previous centered
 * `JobFormDialog`. Width `sm:max-w-2xl` matches the locked
 * simple-form drawer pattern (PRs 3a–3j + #206 notifications).
 * Covers the parent row only — parts are managed from the detail
 * drawer so large cut lists don't bloat the form.
 */

const jobSchema = z.object({
  // `.trim()` on every text field so whitespace-only values don't
  // slip past `.min(1)` or persist as padded strings. Email uses
  // Zod's built-in `.email()` after preprocessing empty → undefined
  // so the optional check still passes when the field is blank.
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

interface JobFormSheetProps {
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

const DEFAULT_VALUES: JobFormValues = {
  name: "",
  description: "",
  customer_name: "",
  customer_email: "",
  customer_phone: "",
  customer_po_number: "",
  status: "draft",
  due_date: "",
  notes: "",
}

export function JobFormSheet({ open, onOpenChange, job, onSuccess }: JobFormSheetProps) {
  const [loading, setLoading] = useState(false)
  const isEdit = !!job

  const form = useForm<JobFormValues>({
    resolver: zodResolver(jobSchema),
    defaultValues: DEFAULT_VALUES,
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
      form.reset(DEFAULT_VALUES)
    }
  }, [job, open, form])

  const onSubmit = async (values: JobFormValues) => {
    if (loading) return
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
        isEdit && job ? await jobService.update(job.id, payload) : await jobService.create(payload)
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:w-full sm:max-w-2xl">
        <SheetHeader className="flex flex-row items-center justify-between gap-4 border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              disabled={loading}
              aria-label="Back"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <div>
              <SheetTitle className="font-display text-base font-semibold tracking-tight">
                {isEdit ? "Edit job" : "New job"}
              </SheetTitle>
              <SheetDescription className="text-xs text-muted-foreground">
                {isEdit
                  ? "Update this job's details. Parts are managed in the detail drawer."
                  : "Create a job first; add the parts list after it's saved."}
              </SheetDescription>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            aria-label="Close"
          >
            <X className="size-4" />
          </Button>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Job name *</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. ACME Gaskets — Batch 42" autoFocus {...field} />
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
            </div>

            <div className="flex justify-end gap-2 border-t bg-card px-6 py-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Saving…" : isEdit ? "Save changes" : "Create job"}
              </Button>
            </div>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  )
}
