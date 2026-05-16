/**
 * Domain errors for cut-history operations. Thrown by use-cases that
 * enforce role/owner authorization, mapped to HTTP 404/403 at the
 * route boundary.
 */
export class CutNotFoundError extends Error {
  constructor() {
    super("Cut record not found")
    this.name = "CutNotFoundError"
  }
}

export class CutForbiddenError extends Error {
  constructor() {
    super("Forbidden")
    this.name = "CutForbiddenError"
  }
}
