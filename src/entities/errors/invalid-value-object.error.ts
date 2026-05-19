/**
 * Thrown by value-object factory functions when input fails format/range
 * validation. VOs are invariants: if construction fails, the application
 * should never see a malformed value crossing a domain boundary.
 *
 * Caught by server-action wrappers and translated to user-facing error
 * messages. Use the `code` field for cross-RPC discrimination — errors lose
 * their prototype chain across the React Server Action boundary, so
 * `instanceof` is unreliable in catch sites.
 */
export class InvalidValueObjectError extends Error {
  public readonly code = "INVALID_VALUE_OBJECT" as const

  constructor(
    public readonly valueObject: string,
    public readonly reason: string,
    public readonly receivedValue: unknown
  ) {
    super(`Invalid ${valueObject}: ${reason}`)
    this.name = "InvalidValueObjectError"
  }
}
