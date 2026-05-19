import type { ActionActor } from "@/src/application/types/action-actor"

import { ForbiddenError } from "./errors"

/**
 * Asserts the caller has a resolved active tenant and narrows the
 * actor type accordingly. Actions that mutate tenant-scoped data
 * MUST call this — otherwise a caller in the pre-chooser window
 * (multi-tenant user with no `last_active_tenant_id`, no cookie) can
 * silently target `null` and surface as confusing RLS-blocked writes.
 *
 * Throws `ForbiddenError` with code `FORBIDDEN` so the action-layer
 * catch wrappers map it to a 403-class client error, same as a
 * permission denial — the user's recourse is the chooser UI, not a
 * retry of the same request.
 *
 * Intentional separation from `requireAuthenticatedUser`: the chooser
 * action itself runs without an active tenant (that's the state it
 * resolves), so making the actor's tenant load-bearing in
 * `requireAuthenticatedUser` would create a chicken-and-egg.
 */
export function requireActiveTenant(
  actor: ActionActor
): asserts actor is ActionActor & { activeTenantId: string } {
  if (!actor.activeTenantId) {
    throw new ForbiddenError("Pick a tenant to continue")
  }
}
