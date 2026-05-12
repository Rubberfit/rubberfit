/**
 * The authenticated caller of an orchestrated operation.
 *
 * Lives in `src/application/` (not `app/server/auth/`) so use-cases
 * and services can accept it as input without depending on the Next.js
 * action layer. The action layer's `requireAuthenticatedUser` builds
 * one of these from the request session and passes it through.
 *
 * `roles` is the raw `profiles.roles` value (or `[]` if null) — no
 * default `["member"]` substitution. Permission checks normalize at
 * check time so callers can distinguish "no role assignment" from
 * "default member role".
 */
export interface ActionActor {
  id: string
  email: string
  roles: string[]
  isSuperAdmin: boolean
}
