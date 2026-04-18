/**
 * Canonical PO number format: PO-YY-NNNN
 * Example: PO-26-0042
 */
export function generatePoNumber(year: number, sequence: number): string {
  const yy = String(year % 100).padStart(2, "0")
  const nnnn = String(sequence).padStart(4, "0")
  return `PO-${yy}-${nnnn}`
}
