"use client"

import { useRef } from "react"
import type { UseFormReturn } from "react-hook-form"
import { toast } from "sonner"

import { Input } from "@/app/components/ui/input"
import { Textarea } from "@/app/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select"
import {
  FormField as FormFieldShell,
  FormFieldGroup,
  FormFieldRow,
  FormFieldset,
  FormSectionHeader,
} from "@/app/components/ui/forms"

import type { MaterialType } from "@/src/infrastructure/models/supabase"
import { SupplierSelect } from "@/app/dashboard/inventory/materials/suppliers/_components/supplier-selection"
import { legacySupplierService as supplierService } from "@/src/infrastructure/services/legacySupplierService"

import type { RollFormValues } from "./roll-form-schema"

interface RollFormFieldsProps {
  form: UseFormReturn<RollFormValues>
  materialTypes: MaterialType[]
  isEdit: boolean
}

/**
 * Roll create/edit form body. Phase 2 form primitives wrap RHF
 * `register()` calls — the schema + validation logic stays in
 * `roll-form-schema.ts`. Phase 2's `<FormField>` is imported as
 * `FormFieldShell` here to avoid the name collision with shadcn's
 * RHF-aware `<FormField>` (we don't use the RHF one anymore).
 */
export function RollFormFields({ form, materialTypes, isEdit }: RollFormFieldsProps) {
  const { register, formState, setValue, watch } = form
  const { errors } = formState
  // Sequence guard for the supplier-name resolution. The select
  // surfaces an ID that we resolve to a name asynchronously; if
  // the user picks B before A's resolution returns, A's name
  // would otherwise overwrite the newer B selection. Bumping a
  // local counter on each pick + comparing against it before
  // setValue keeps the form in sync with the latest choice.
  // (The deeper fix — store `supplier_id` instead of the
  // denormalized name on the Roll — needs a schema + API
  // change; tracked alongside the supplier subtree refactor in
  // PR 3h.)
  const supplierPickRef = useRef(0)

  return (
    <div className="flex flex-col gap-6">
      <FormFieldset isFirst>
        <FormSectionHeader title="Basics" />
        <FormFieldGroup>
          <FormFieldRow>
            <FormFieldShell
              label="Material type"
              htmlFor="roll-material-type"
              required
              errorText={errors.material_type?.message}
            >
              <Select
                value={watch("material_type")}
                onValueChange={(value) =>
                  setValue("material_type", value, { shouldDirty: true, shouldValidate: true })
                }
              >
                <SelectTrigger id="roll-material-type" aria-label="Material type">
                  <SelectValue placeholder="Select material type" />
                </SelectTrigger>
                <SelectContent>
                  {materialTypes.map((type) => (
                    <SelectItem key={type.id} value={type.name}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormFieldShell>

            <FormFieldShell label="Color" htmlFor="roll-color" errorText={errors.color?.message}>
              <Input id="roll-color" placeholder="e.g., Black, Red" {...register("color")} />
            </FormFieldShell>
          </FormFieldRow>

          <FormFieldRow>
            <FormFieldShell
              label="Width"
              htmlFor="roll-width"
              required
              helperText="inches"
              errorText={errors.width?.message}
            >
              <Input
                id="roll-width"
                type="number"
                step="0.001"
                placeholder="48"
                {...register("width")}
              />
            </FormFieldShell>

            <FormFieldShell
              label="Length"
              htmlFor="roll-length"
              required
              helperText="inches"
              errorText={errors.length?.message}
            >
              <Input
                id="roll-length"
                type="number"
                step="0.001"
                placeholder="600"
                {...register("length")}
              />
            </FormFieldShell>
          </FormFieldRow>

          <FormFieldRow>
            <FormFieldShell
              label="Thickness"
              htmlFor="roll-thickness"
              required
              helperText="inches"
              errorText={errors.thickness?.message}
            >
              <Input
                id="roll-thickness"
                type="number"
                step="0.001"
                placeholder="0.25"
                {...register("thickness")}
              />
            </FormFieldShell>

            {isEdit && (
              <FormFieldShell
                label="Remaining length"
                htmlFor="roll-remaining-length"
                helperText="inches — adjust for manual corrections"
                errorText={errors.remaining_length?.message}
              >
                <Input
                  id="roll-remaining-length"
                  type="number"
                  step="0.001"
                  placeholder="Remaining length"
                  {...register("remaining_length")}
                />
              </FormFieldShell>
            )}
          </FormFieldRow>
        </FormFieldGroup>
      </FormFieldset>

      <FormFieldset>
        <FormSectionHeader title="Stock" />
        <FormFieldGroup>
          <FormFieldRow>
            <FormFieldShell
              label="Location"
              htmlFor="roll-location"
              errorText={errors.location?.message}
            >
              <Input
                id="roll-location"
                placeholder="e.g., Rack A1, Warehouse B"
                {...register("location")}
              />
            </FormFieldShell>

            <FormFieldShell
              label="Date received"
              htmlFor="roll-date-received"
              required
              errorText={errors.date_received?.message}
            >
              <Input id="roll-date-received" type="date" {...register("date_received")} />
            </FormFieldShell>
          </FormFieldRow>
        </FormFieldGroup>
      </FormFieldset>

      <FormFieldset>
        <FormSectionHeader title="Sourcing" />
        <FormFieldGroup>
          <FormFieldRow>
            <FormFieldShell
              label="Supplier"
              htmlFor="roll-supplier"
              errorText={errors.supplier?.message}
            >
              <SupplierSelect
                value={watch("supplier")}
                onValueChange={(value) => {
                  supplierPickRef.current += 1
                  const pickId = supplierPickRef.current
                  supplierService
                    .getSupplierById(value)
                    .then((supplier) => {
                      // Drop the response if the user has already
                      // moved on to a newer pick.
                      if (supplierPickRef.current !== pickId) return
                      setValue("supplier", supplier?.name ?? "", {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                    })
                    .catch((error) => {
                      if (supplierPickRef.current !== pickId) return
                      console.error("Error resolving supplier name:", error)
                      // Don't leave the user staring at an unset
                      // field after a network blip — clear and tell
                      // them so they can retry the pick.
                      setValue("supplier", "", {
                        shouldDirty: true,
                        shouldValidate: true,
                      })
                      toast.error("Couldn't load that supplier — please try again")
                    })
                }}
                placeholder="Select supplier"
              />
            </FormFieldShell>

            <FormFieldShell
              label="Cost per sqft"
              htmlFor="roll-cost"
              helperText="USD"
              errorText={errors.cost_per_sqft?.message}
            >
              <Input
                id="roll-cost"
                type="number"
                step="0.01"
                placeholder="2.50"
                {...register("cost_per_sqft")}
              />
            </FormFieldShell>
          </FormFieldRow>

          <FormFieldShell label="Notes" htmlFor="roll-notes" errorText={errors.notes?.message}>
            <Textarea
              id="roll-notes"
              placeholder="Any additional notes…"
              className="resize-none"
              {...register("notes")}
            />
          </FormFieldShell>
        </FormFieldGroup>
      </FormFieldset>
    </div>
  )
}
