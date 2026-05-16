# Server Actions

Server-only entrypoints that the client `await`s. Each action is a hard physical line between the browser and the orchestration layer — action IDs ship in the client bundle and are RPC-callable by hash, so the auth + RBAC + Zod-parse checks here **are the security boundary**. `proxy.ts` does not see action invocations.

## Mandatory shape

Every action file starts with `"use server"`. Every exported action follows this order (the security boundary depends on the order):

```ts
export async function actionName(input: ActionInput): Promise<ActionResult> {
  ensureDatabaseFactoryRegistered() // ← always first; idempotent
  const actor = await requireAuthenticatedUser() // throws UnauthorizedError
  requirePermission(actor, "manageRolls") // throws ForbiddenError
  const parsed = schema.parse(input) // strips extra keys; throws on bad input

  // Either:
  const useCase = resolveUseCase<IFoo>(TOKENS.IFoo)
  const result = await useCase.execute({ ...parsed, actor })
  // Or (simple ops with no use-case):
  const result = await someService.doIt({ ...parsed, actorId: actor.id })

  revalidatePath(RELEVANT_PATH) // server-side cache bust
  return result
}
```

**Two exceptions to the `requirePermission` step:** `active-tenant.ts::selectTenant` (the action that establishes which tenant the actor is operating in — must run before any permission check is meaningful, since permissions are scoped to the active tenant) and `profile.ts::requestSelfDelete` (the actor is always the target; no caller-supplied userId, so no privilege escalation is possible). Both still run `ensureDatabaseFactoryRegistered()`, `requireAuthenticatedUser()`, and Zod-parse their input.

Three error classes propagate across the RPC boundary: `UnauthorizedError` (401-class), `ForbiddenError` (403-class), `AuthConfigError` (5xx-class). Catch wrappers in client callers should discriminate on `error.code`, **not** `instanceof` — error prototype chains don't survive serialisation.

Public input is `z.input<typeof schema>` (derived from the Zod schema) — not `Omit<UseCaseInput, "actor">`. The Zod schema is the source of truth for the runtime parse contract; using `z.input` keeps types and runtime in lockstep.

## Catalog (11 files)

| File                                             | Permission token                                                                     | Exports                                                                                                                                                                                                                                                     | Use-case wrapped?                   | Revalidates                                                                                                                               |
| ------------------------------------------------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| [`active-tenant.ts`](./active-tenant.ts)         | (auth only — no perm check)                                                          | `selectTenant`. Membership-validates the target tenant, persists `last_active_tenant_id`, writes the `rema_active_tenant` cookie, revalidates the root layout. Deliberately does NOT call `requireActiveTenant` (it's the action that resolves that state). | No — direct `active-tenant.service` | `/` (layout — busts every tenant-scoped RSC fetch)                                                                                        |
| [`cuts.ts`](./cuts.ts)                           | (auth only — read-only facade)                                                       | `fetchCutsInRange`, `fetchRecentCuts`. Server-side read facade over `GetCutAnalyticsUseCase` + `ListCutHistoryUseCase` so dashboard client components don't resolve DI directly. Replaces the read paths the retired `legacyCutService` used to provide. Uses `makeAdminClient()` because privileged roles read across users; the use-cases enforce per-caller privilege scoping internally. | Yes — 2 cut-history use-cases       | (none — read-only)                                                                                                                        |
| [`purchase-orders.ts`](./purchase-orders.ts)     | `manageRolls`                                                                        | `createPurchaseOrder`, `updatePurchaseOrder`, `approvePurchaseOrder`, `rejectPurchaseOrder`, `receivePurchaseOrder`                                                                                                                                         | Yes — 5 PO use-cases                | `/dashboard/inventory/purchase-orders`                                                                                                    |
| [`po-reconciliation.ts`](./po-reconciliation.ts) | `reconcileReceipts`                                                                  | `reconcilePendingApply`, `reconcilePendingRollCreation`. Step 7c-2 admin recovery — operator-actionable Retry buttons backing the two safety-net views (`po_receipts_pending_apply`, `po_receipts_pending_roll_creation`).                                  | Yes — 2 reconcile use-cases         | `/dashboard/admin/inventory/po-reconciliation`                                                                                            |
| [`reorder.ts`](./reorder.ts)                     | `manageRolls`                                                                        | `generateReorderSuggestions`, `createReorderPurchaseOrder`, `createBulkReorderPurchaseOrder` (read of reorder rules)                                                                                                                                        | Yes — 3 reorder use-cases           | `/dashboard/inventory/reorder`, `/dashboard/inventory/purchase-orders`                                                                    |
| [`cut-history.ts`](./cut-history.ts)             | `createCut`                                                                          | `saveCut`. The file also re-exports two PDF helpers (`getCutPdfPublicUrl`, `safeRemoveOrphanedCutPdf`) from `cutPdfStorageService` for action-layer callers — those are service helpers, not server actions.                                                | Yes — `RecordCutUseCase`            | `/dashboard/cutting-engine/history`                                                                                                       |
| [`materials.ts`](./materials.ts)                 | `manageMaterialTypes`                                                                | Material-type create/update/delete (FK pre-flight inside delete). See file header for the cost-write permission caveat.                                                                                                                                     | No — direct service calls           | `/dashboard/settings/materials`, `/dashboard/inventory/materials/pricing`, `/dashboard/inventory/materials/types`, `/dashboard/inventory` |
| [`inventory.ts`](./inventory.ts)                 | `manageRolls`                                                                        | Roll quick-create only (`addRoll`). Calls `rollService.addRoll` — the legacy shim was retired in the final shim cleanup; the raw-row write surface now lives on `IRollService` as a transitional pass-through.                                              | No — direct `rollService`           | `/dashboard/inventory`                                                                                                                    |
| [`users.ts`](./users.ts)                         | `manageUsers`                                                                        | `updateUser`, `deactivateUser`, `reactivateUser`. Field surface intentionally narrowed (accessibility — `memberships.deleted_at` — is not editable through `updateUser`; only via deactivate/reactivate).                                                   | No — direct `userManagementService` | `/dashboard/users`                                                                                                                        |
| [`profile.ts`](./profile.ts)                     | (auth only — no perm check)                                                          | Self-delete. Target is always the actor; no caller-supplied userId.                                                                                                                                                                                         | No — direct `profileRepository`     | (none — user is about to redirect out)                                                                                                    |
| [`invitations.ts`](./invitations.ts)             | `manageMembers` (admin actions); auth only on `acceptInvitation` (token IS the auth) | `inviteMember`, `resendInvitation`, `revokeInvitation`, `acceptInvitation`. Accept also writes the `rema_active_tenant` cookie to the newly-joined tenant before invalidating the root layout.                                                              | Yes — 4 invitation use-cases        | `/dashboard/admin/members` for admin actions; `/` (layout) for accept                                                                     |

## When to wrap with a use-case vs. call services directly

Follow the same rule as the use-cases [README](../../src/application/use-cases/README.md): wrap in a use-case if the action fires a side effect (notification, audit log), touches >1 service, or enforces a business rule (status transition, EOQ, threshold). Otherwise call the infrastructure service directly from the action body — `materials.ts`, `inventory.ts`, `users.ts`, `profile.ts` are the live examples.

The action layer **always** stays. Even when there's no use-case, the action carries the auth + RBAC + Zod surface. Hooks must never call infrastructure services that mutate — those must go through an action.

## Patterns to copy

- **Use-case-wrapped + cache bust** → `purchase-orders.ts::createPurchaseOrder`
- **Direct-service + narrow field surface (security)** → `users.ts::updateUser`
- **Server-fetched authoritative state (no client-supplied payload)** → `reorder.ts::createReorderPurchaseOrder` (the file header explains why the previous payload-passing shape was a security gap)
- **Typed return for UX discrimination** → `profile.ts` self-delete `{ ok, error }`
- **No-revalidate (user redirects out)** → `profile.ts`

## Client-side responsibilities

Actions handle server cache invalidation with `revalidatePath`. The client must **also** call `queryClient.invalidateQueries({ queryKey: [...] })` after the action returns when the relevant data is read through React Query. Forgetting either side creates stale UI.

---

## Keeping this index current

If you add, remove, or rename a file under `app/actions/`, or add new exports to an existing file, update the catalog table above **in the same commit**. Row format: `| file | Permission | Exports | Use-case wrapped? | Revalidates |`. PRs that touch this folder without a matching table edit should be sent back in review.
