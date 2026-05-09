/**
 * Thrown by entity factory functions when entity-level invariants fail
 * (cross-field constraints, business rules that can't be expressed as
 * single-field VO validation).
 *
 * Distinct from InvalidValueObjectError: the latter is single-field format
 * validation, this one is "this combination of fields is not a valid entity".
 */
export class InvalidEntityError extends Error {
  public readonly code = "INVALID_ENTITY" as const

  constructor(
    public readonly entity: string,
    public readonly reason: string,
  ) {
    super(`Invalid ${entity}: ${reason}`)
    this.name = "InvalidEntityError"
  }
}
