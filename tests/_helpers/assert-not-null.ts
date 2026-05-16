/**
 * Type-narrowing assertion for tests. Lets test bodies follow the
 * "expect not null → use the value" pattern without non-null
 * assertions (`!`) — which CLAUDE.md TypeScript rules forbid.
 *
 * Usage:
 *   const result = doSomething()
 *   expect(result).not.toBeNull()
 *   assertNotNull(result)
 *   expect(result.outer).toHaveLength(4)  // ← narrowed, no `!`
 */
export function assertNotNull<T>(value: T | null | undefined): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error("Expected non-null value, got " + String(value))
  }
}
