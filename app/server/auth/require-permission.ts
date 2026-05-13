import type { AppRole, Permission } from "@/src/application/permissions"
import { normalizeRoles } from "@/src/application/rbac"
import type { ActionActor } from "@/src/application/types/action-actor"
import { hasPermission } from "@/src/infrastructure/services/permissionService"

import { ForbiddenError } from "./errors"

/**
 * Layered on top of `requireAuthenticatedUser` to enforce per-action
 * RBAC. Without this, a caller with a valid session but the wrong role
 * could invoke any action by hash — the route-level proxy doesn't see
 * action invocations.
 *
 * Super-admins bypass the permission table. For everyone else,
 * `normalizeRoles` runs here (not in `requireAuthenticatedUser`) so
 * the actor's raw role list is preserved up to the check site.
 */
export function requirePermission(actor: ActionActor, permission: Permission): void {
  if (actor.isSuperAdmin) return
  const roles = normalizeRoles(actor.roles) as AppRole[]
  if (!hasPermission(roles, permission)) {
    throw new ForbiddenError()
  }
}
