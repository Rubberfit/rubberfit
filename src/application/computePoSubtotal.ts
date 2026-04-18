export interface PoLineInput {
  quantitySqft: number
  unitCost: number
}

export function computePoSubtotal(items: PoLineInput[]): number {
  return items.reduce((s, it) => s + it.quantitySqft * it.unitCost, 0)
}
