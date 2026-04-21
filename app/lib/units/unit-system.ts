export type UnitSystem = "metric" | "imperial"

export const DEFAULT_UNIT_SYSTEM: UnitSystem = "metric"

export function isUnitSystem(value: unknown): value is UnitSystem {
  return value === "metric" || value === "imperial"
}
