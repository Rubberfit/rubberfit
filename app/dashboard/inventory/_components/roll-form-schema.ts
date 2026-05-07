import * as z from "zod"

// Optional numeric fields need a preprocess step: `z.coerce.number()`
// on its own turns "" into 0, which would quietly persist a zero
// cost or zero remaining-length instead of leaving the field blank.
const optionalNumber = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.coerce.number().optional()
)

// Distinguish "not a number" (NaN from a non-numeric paste) from
// "negative number" so the inline error reads usefully instead of
// telling the user a `NaN` value isn't `>= 0`.
function isMeaningfulNumber(v: number | undefined): boolean {
  return v === undefined || (Number.isFinite(v) && v >= 0)
}

export const rollFormSchema = z.object({
  material_type: z.string().min(1, "Material type is required"),
  width: z.coerce.number().positive("Width must be greater than 0"),
  length: z.coerce.number().positive("Length must be greater than 0"),
  thickness: z.coerce.number().positive("Thickness must be greater than 0"),
  color: z.string().optional(),
  location: z.string().optional(),
  date_received: z.string().min(1, "Date received is required"),
  supplier: z.string().optional(),
  cost_per_sqft: optionalNumber.refine(isMeaningfulNumber, "Enter a number 0 or greater"),
  notes: z.string().optional(),
  remaining_length: optionalNumber.refine(isMeaningfulNumber, "Enter a number 0 or greater"),
})

export type RollFormValues = z.infer<typeof rollFormSchema>
