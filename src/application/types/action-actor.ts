/**
 * The authenticated caller of an orchestrated operation.
 *
 * Lives in `src/application/` (not `app/server/auth/`) so use-cases
 * and services can accept it as input without depending on the Next.js
 * action layer. The action layer's `requireAuthenticatedUser` builds
 * one of these from the request session and passes it through.
 *
 * `roles` is the raw `memberships.roles` value for the active tenant
 * (no default `["member"]` substitution). Permission checks normalize
 * at check time so callers can distinguish "no role assignment" from
 * "default member role".
 *
 * `activeTenantId` is the tenant the caller is currently acting in,
 * resolved from the `rema_active_tenant` cookie (validated against
 * the caller's active memberships). May be `null` when:
 *   - the user has zero active memberships (rare; the auth boundary
 *     usually rejects that earlier), OR
 *   - the user is hitting the tenant-chooser flow before picking.
 * Actions that mutate tenant-scoped data should call
 * `requireActiveTenant(actor)` to fail closed instead of writing to
 * a global context.
 */
export interface ActionActor {
  id: string
  email: string
  roles: string[]
  isSuperAdmin: boolean
  activeTenantId: string | null
}
