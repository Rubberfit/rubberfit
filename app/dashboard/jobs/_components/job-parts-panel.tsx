"use client"

import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/app/components/ui/form"
import { Input } from "@/app/components/ui/input"
import { Textarea } from "@/app/components/ui/textarea"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table"
import { EmptyState } from "@/app/components/patterns"
import { Package2 } from "lucide-react"
import { jobService } from "@/src/infrastructure/services/jobService"
import type { JobPart } from "@/src/infrastructure/models/supabase"

/**
 * Parts panel on the job detail page. Shows the line items and
 * surfaces an inline "Add part" dialog. Delete is inline with a
 * quick toast — not routed through AlertDialog because individual
 * part lines are cheap to re-enter; large cut lists want zero
 * friction per row.
 */

interface JobPartsPanelProps {
  jobId: string
  parts: JobPart[]
  onChanged: () => void
}

// Empty strings from cleared inputs would otherwise coerce to 0
// and trip the `.positive()` / `.min(0)` checks or silently save a
// zero price. Preprocess "" → undefined so optional stays optional.
const optionalNumber = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.coerce.number().optional()
)

const partSchema = z.object({
  material_type: z.string().trim().min(1, "Material is required"),
  part_number: z.string().trim().optional(),
  description: z.string().trim().optional(),
  width: z.coerce.number().positive("Width > 0"),
  length: z.coerce.number().positive("Length > 0"),
  thickness: optionalNumber.refine(
    (v) => v === undefined || v > 0,
    "Thickness must be greater than 0"
  ),
  quantity: z.coerce.number().int().positive("Quantity must be at least 1"),
  unit_price: optionalNumber.refine(
    (v) => v === undefined || v >= 0,
    "Unit price must be 0 or greater"
  ),
  notes: z.string().trim().optional(),
})
type PartFormValues = z.infer<typeof partSchema>

export function JobPartsPanel({ jobId, parts, onChanged }: JobPartsPanelProps) {
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const form = useForm<PartFormValues>({
    resolver: zodResolver(partSchema),
    defaultValues: {
      material_type: "",
      part_number: "",
      description: "",
      width: 0,
      length: 0,
      thickness: undefined,
      quantity: 1,
      unit_price: undefined,
      notes: "",
    },
  })

  const onSubmit = async (values: PartFormValues) => {
    setSubmitting(true)
    try {
      await jobService.addPart({
        job_id: jobId,
        material_type: values.material_type,
        part_number: values.part_number || undefined,
        description: values.description || undefined,
        width: values.width,
        length: values.length,
        thickness: values.thickness ?? undefined,
        quantity: values.quantity,
        unit_price: values.unit_price ?? undefined,
        notes: values.notes || undefined,
      })
      toast.success("Part added")
      form.reset()
      setOpen(false)
      onChanged()
    } catch (err) {
      const m = err instanceof Error ? err.message : "Unknown error"
      toast.error("Failed to add part", { description: m })
    } finally {
      setSubmitting(false)
    }
  }

  const handleRemove = async (id: string) => {
    try {
      await jobService.removePart(id)
      toast.success("Part removed")
      onChanged()
    } catch (err) {
      const m = err instanceof Error ? err.message : "Unknown error"
      toast.error("Failed to remove part", { description: m })
    }
  }

  const totalSqft = parts.reduce((sum, p) => sum + (p.width * p.length * p.quantity) / 144, 0)

  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-foreground text-base tracking-tight">Parts</h2>
          <p className="text-muted-foreground text-xs">
            {parts.length} line item{parts.length === 1 ? "" : "s"} · {totalSqft.toFixed(1)} sqft
            total
          </p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="size-3.5" />
          Add part
        </Button>
      </header>

      <Card className="overflow-hidden p-0 gap-0">
        {parts.length === 0 ? (
          <EmptyState
            icon={<Package2 className="size-5" />}
            title="No parts on this job yet"
            description="Add the cut list the customer ordered. Each row is one part spec (W × L × qty)."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Part #</TableHead>
                <TableHead>Material</TableHead>
                <TableHead>Dimensions (W × L × T)</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Sqft</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {parts.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-muted-foreground text-xs">
                    {p.part_number ?? "—"}
                  </TableCell>
                  <TableCell className="text-foreground text-sm">
                    {p.material_type ?? "—"}
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground text-xs">
                    {p.width}″ × {p.length}″{p.thickness ? ` × ${p.thickness}″` : ""}
                  </TableCell>
                  <TableCell className="text-right text-sm">{p.quantity}</TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground text-xs">
                    {((p.width * p.length * p.quantity) / 144).toFixed(1)}
                  </TableCell>
                  <TableCell className="w-10 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-danger-foreground"
                      onClick={() => handleRemove(p.id)}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                      <span className="sr-only">Remove part</span>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Add part</DialogTitle>
            <DialogDescription>
              One part = one (W × L × qty) entry. Use quantity instead of adding duplicates.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="material_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Material *</FormLabel>
                      <FormControl>
                        <Input placeholder="Butyl, EPDM…" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="part_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Part # (customer)</FormLabel>
                      <FormControl>
                        <Input placeholder="G-4501" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="width"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Width (in) *</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.001" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="length"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Length (in) *</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.001" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="thickness"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Thickness (in)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.001" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="quantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quantity *</FormLabel>
                      <FormControl>
                        <Input type="number" step="1" min="1" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="unit_price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unit price ($)</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" {...field} />
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
                      <Input placeholder="What this part is" {...field} />
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
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea rows={2} className="resize-none" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? "Adding…" : "Add part"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </section>
  )
}
