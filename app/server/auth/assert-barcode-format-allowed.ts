import type { ActionActor } from "@/src/application/types/action-actor"

import { requireFeature } from "./require-feature"

/**
 * The only barcode format the DB currently accepts (per migration
 * `20260421000002_roll_barcodes_and_scan_pdf.sql`'s CHECK constraint).
 * Every roll today is created with this format; the gate becomes
 * meaningful only when a follow-up migration widens the CHECK.
 */
const STANDARD_BARCODE_FORMAT = "code128" as const

/**
 * Pro-gated assertion for "this caller wants a non-default barcode
 * format on a roll." The `custom_barcode_formats` feature key is
 * Pro-tier — Standard customers must stick with `code128`.
 *
 * Forward-facing by design: the action schema for `addRoll` doesn't
 * accept a format field yet, so today every call site passes either
 * `undefined` or `"code128"` and the helper short-circuits. When a
 * future PR widens the schema, the gate fires automatically — no
 * second pass needed to remember to wire enforcement.
 *
 * The `requireFeature` callsite is what the feature-tier coverage
 * architecture test grep finds for the `custom_barcode_formats`
 * key, so removing this helper without a replacement gate would
 * fail the test.
 */
export async function assertBarcodeFormatAllowed(
  actor: ActionActor,
  format: string | null | undefined
): Promise<void> {
  if (format == null || format === STANDARD_BARCODE_FORMAT) return
  await requireFeature(actor, "custom_barcode_formats")
}
