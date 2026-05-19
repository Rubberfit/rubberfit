/**
 * Null-safe equality for value objects. Both null is true; exactly one
 * null is false; both non-null delegates to the VO's `equals` method.
 *
 * Type bound: T must expose an `equals(other: T) => boolean` method.
 * Every VO in src/entities/value-objects satisfies this.
 *
 * Used at no-op-equality checks in entity state-transition methods that
 * accept a `Field | null` parameter — e.g., Tenant.changeBillingEmail,
 * Person.updateDetails.
 */
export function nullableEqual<T extends { equals(other: T): boolean }>(
  a: T | null,
  b: T | null
): boolean {
  if (a === null && b === null) return true
  if (a === null || b === null) return false
  return a.equals(b)
}
