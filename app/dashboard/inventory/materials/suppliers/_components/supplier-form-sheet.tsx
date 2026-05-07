"use client"

import { useCallback, useEffect, useState } from "react"
import { ChevronLeft, X } from "lucide-react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"

import {
  type MaterialSupplier,
  type MaterialSupplierWithDetails,
  type Supplier,
} from "@/src/infrastructure/models/supabase"
import {
  materialSuppliers as materialSuppliersSdk,
  suppliers as suppliersSdk,
} from "@/src/infrastructure/api-client/rf/inventory"
import { taxService } from "@/src/infrastructure/services/taxService"
import { Button } from "@/app/components/ui/button"
import { Form } from "@/app/components/ui/form"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/app/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/components/ui/tabs"

import { SupplierAddressFields } from "./supplier-address-fields"
import {
  buildSupplierPayload,
  DEFAULT_FORM_VALUES,
  supplierSchema,
  supplierToFormData,
  type SupplierFormData,
} from "./supplier-form-schema"
import { SupplierGeneralFields } from "./supplier-general-fields"
import { SupplierLinkedMaterials } from "./supplier-linked-materials"
import { SupplierPreferencesFields } from "./supplier-preferences-fields"
import { SupplierShippingFields } from "./supplier-shipping-fields"

interface SupplierFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  supplier?: Supplier | null
  onSuccess: () => void
}

/**
 * Supplier editor — Phase 3 PR 3h.
 *
 * Right-docked `<Sheet>` replacement for `SupplierFormModal`. Uses
 * the new wide Sheet width `sm:max-w-4xl` (Kimi K2.6's 2-tier rule:
 * `2xl` for simple forms, `4xl` for multi-tab dense forms). The
 * 5-tab strip (4 for create, 5 for edit) sticks to the top of the
 * scrollable body so dense field groups can scroll without losing
 * orientation. Sub-modal `MaterialSupplierLink` is now inlined into
 * the Materials tab as a toggle-revealed form via
 * `SupplierLinkedMaterials`.
 */
export function SupplierFormSheet({
  open,
  onOpenChange,
  supplier,
  onSuccess,
}: SupplierFormSheetProps) {
  const [submitting, setSubmitting] = useState(false)
  const [resolvedTaxRate, setResolvedTaxRate] = useState<{
    rate: number
    name: string
    level: string
  } | null>(null)
  const [loadingTaxRate, setLoadingTaxRate] = useState(false)
  const [linkedMaterials, setLinkedMaterials] = useState<MaterialSupplierWithDetails[]>([])
  const [loadingMaterials, setLoadingMaterials] = useState(false)
  const [editingLink, setEditingLink] = useState<MaterialSupplier | null>(null)
  const [showLinkForm, setShowLinkForm] = useState(false)

  const form = useForm<SupplierFormData>({
    resolver: zodResolver(supplierSchema),
    defaultValues: DEFAULT_FORM_VALUES,
  })

  const fetchLinkedMaterials = useCallback(async (supplierId: string) => {
    setLoadingMaterials(true)
    try {
      const materials = await materialSuppliersSdk.list({ supplier_id: supplierId })
      setLinkedMaterials((materials ?? []) as MaterialSupplierWithDetails[])
    } catch (error) {
      console.error("Error fetching linked materials:", error)
    } finally {
      setLoadingMaterials(false)
    }
  }, [])

  useEffect(() => {
    if (open && supplier) {
      void fetchLinkedMaterials(supplier.id)
      form.reset(supplierToFormData(supplier))
    } else if (open && !supplier) {
      setLinkedMaterials([])
      form.reset(DEFAULT_FORM_VALUES)
    }
    if (!open) {
      // Reset inline link state on every close so a re-open lands
      // on the Materials list, not on a half-typed link form.
      setShowLinkForm(false)
      setEditingLink(null)
    }
  }, [open, supplier, fetchLinkedMaterials, form])

  const watchedZip = form.watch("zip_code")
  const watchedState = form.watch("state")
  const watchedCity = form.watch("city")
  const watchedTaxExempt = form.watch("tax_exempt")

  useEffect(() => {
    if (!watchedZip || watchedTaxExempt) {
      setResolvedTaxRate(null)
      return
    }

    const timer = setTimeout(async () => {
      setLoadingTaxRate(true)
      try {
        const result = await taxService.getTaxRateForLocation(
          watchedState || null,
          watchedCity || null,
          watchedZip
        )
        setResolvedTaxRate({
          rate: result.tax_rate,
          name: result.tax_name,
          level: result.tax_level,
        })
      } catch (_error) {
        setResolvedTaxRate(null)
      } finally {
        setLoadingTaxRate(false)
      }
    }, 500)

    return () => clearTimeout(timer)
  }, [watchedZip, watchedState, watchedCity, watchedTaxExempt])

  const onSubmit = async (data: SupplierFormData) => {
    if (submitting) return
    setSubmitting(true)
    try {
      const supplierData = buildSupplierPayload(data, !!supplier)

      if (supplier) {
        await suppliersSdk.update(
          supplier.id,
          supplierData as unknown as Parameters<typeof suppliersSdk.update>[1]
        )
        toast.success("Supplier updated successfully")
      } else {
        await suppliersSdk.create(
          supplierData as unknown as Parameters<typeof suppliersSdk.create>[0]
        )
        toast.success("Supplier created successfully")
      }

      const newZip = data.zip_code?.trim()
      const oldZip = supplier?.zip_code?.trim()
      if (newZip && newZip !== oldZip && !data.tax_exempt) {
        taxService
          .getTaxRateForLocation(data.state?.trim() || null, data.city?.trim() || null, newZip)
          .catch((err) => console.warn("Proactive tax cache failed:", err))
      }

      onSuccess()
    } catch (error) {
      console.error("Error saving supplier:", error)
      toast.error(error instanceof Error ? error.message : "Failed to save supplier")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:w-full sm:max-w-4xl">
        <SheetHeader className="flex flex-row items-center justify-between gap-4 border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              aria-label="Back"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <div>
              <SheetTitle className="font-display text-base font-semibold tracking-tight">
                {supplier ? "Edit supplier" : "Add supplier"}
              </SheetTitle>
              <SheetDescription className="text-xs text-muted-foreground">
                {supplier
                  ? "Update supplier profile, address, tax, and preferences."
                  : "Add a new supplier to the vendor management system."}
              </SheetDescription>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            aria-label="Close"
          >
            <X className="size-4" />
          </Button>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
            <Tabs defaultValue="basic" className="flex min-h-0 flex-1 flex-col">
              {/* Sticky tab strip — keeps tab labels visible while
                  the dense form below scrolls. */}
              <div className="sticky top-0 z-10 border-b bg-card px-6 py-3">
                <TabsList className={`grid w-full ${supplier ? "grid-cols-5" : "grid-cols-4"}`}>
                  <TabsTrigger value="basic">Basic</TabsTrigger>
                  <TabsTrigger value="address">Address</TabsTrigger>
                  <TabsTrigger value="taxship">Tax & shipping</TabsTrigger>
                  <TabsTrigger value="preferences">Preferences</TabsTrigger>
                  {supplier && <TabsTrigger value="materials">Materials</TabsTrigger>}
                </TabsList>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-6">
                <TabsContent value="basic" className="mt-0 space-y-6">
                  <SupplierGeneralFields form={form} />
                </TabsContent>
                <TabsContent value="address" className="mt-0 space-y-6">
                  <SupplierAddressFields form={form} />
                </TabsContent>
                <TabsContent value="taxship" className="mt-0 space-y-6">
                  <SupplierShippingFields
                    form={form}
                    resolvedTaxRate={resolvedTaxRate}
                    loadingTaxRate={loadingTaxRate}
                  />
                </TabsContent>
                <TabsContent value="preferences" className="mt-0 space-y-4">
                  <SupplierPreferencesFields form={form} />
                </TabsContent>
                {supplier && (
                  <TabsContent value="materials" className="mt-0 space-y-4">
                    <SupplierLinkedMaterials
                      supplierName={supplier.name}
                      supplierId={supplier.id}
                      linkedMaterials={linkedMaterials}
                      loadingMaterials={loadingMaterials}
                      editingLink={editingLink}
                      showLinkForm={showLinkForm}
                      onShowLinkForm={(link) => {
                        setEditingLink(link ?? null)
                        setShowLinkForm(true)
                      }}
                      onCancelLinkForm={() => {
                        setShowLinkForm(false)
                        setEditingLink(null)
                      }}
                      onLinkSaved={() => {
                        setShowLinkForm(false)
                        setEditingLink(null)
                        void fetchLinkedMaterials(supplier.id)
                      }}
                      onRefresh={fetchLinkedMaterials}
                    />
                  </TabsContent>
                )}
              </div>
            </Tabs>

            <div className="flex justify-end gap-2 border-t bg-card px-6 py-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving…" : supplier ? "Save changes" : "Create supplier"}
              </Button>
            </div>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  )
}
