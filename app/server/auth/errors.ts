/**
 * Error types for the server-action auth + permission boundary.
 *
 * Action callers (and their catch wrappers) discriminate on `code` —
 * not `instanceof`, since serialized errors from server actions lose
 * their prototype chain when they cross the RPC boundary.
 *
 * - UNAUTHORIZED  → 401-class. Caller is not authenticated, the
 *   profile is missing, or the account is deactivated.
 * - FORBIDDEN     → 403-class. Caller is authenticated but lacks the
 *   required permission for the action.
 * - AUTH_CONFIG   → 5xx-class. Server is misconfigured (missing
 *   Supabase env). Distinct from UNAUTHORIZED so deploy breakage
 *   doesn't masquerade as a user/session problem.
 */
export class UnauthorizedError extends Error {
  readonly code = "UNAUTHORIZED" as const
  constructor(message = "Not authenticated") {
    super(message)
    this.name = "UnauthorizedError"
  }
}

export class ForbiddenError extends Error {
  readonly code = "FORBIDDEN" as const
  constructor(message = "Forbidden") {
    super(message)
    this.name = "ForbiddenError"
  }
}

export class AuthConfigError extends Error {
  readonly code = "AUTH_CONFIG" as const
  constructor(message = "Auth not configured") {
    super(message)
    this.name = "AuthConfigError"
  }
}
