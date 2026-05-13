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

Three error classes propagate across the RPC boundary: `UnauthorizedError` (401-class), `ForbiddenError` (403-class), `AuthConfigError` (5xx-class). Catch wrappers in client callers should discriminate on `error.code`, **not** `instanceof` — error prototype chains don't survive serialisation.

Public input is `z.input<typeof schema>` (derived from the Zod schema) — not `Omit<UseCaseInput, "actor">`. The Zod schema is the source of truth for the runtime parse contract; using `z.input` keeps types and runtime in lockstep.

## Catalog (8 files)

| File                                         | Permission token            | Exports                                                                                                                     | Use-case wrapped?                   | Revalidates                                                                                                                               |
| -------------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| [`active-tenant.ts`](./active-tenant.ts)     | (auth only — no perm check) | `selectTenant`. Membership-validates the target tenant, persists `last_active_tenant_id`, writes the `rema_active_tenant` cookie, revalidates the root layout. Deliberately does NOT call `requireActiveTenant` (it's the action that resolves that state).  | No — direct `active-tenant.service` | `/` (layout — busts every tenant-scoped RSC fetch)                                                                                       |
| [`purchase-orders.ts`](./purchase-orders.ts) | `manageRolls`               | `createPurchaseOrder`, `updatePurchaseOrder`, `approvePurchaseOrder`, `rejectPurchaseOrder`, `receivePurchaseOrder`         | Yes — 5 PO use-cases                | `/dashboard/inventory/purchase-orders`                                                                                                    |
| [`reorder.ts`](./reorder.ts)                 | `manageRolls`               | `generateReorderSuggestions`, `createReorderPurchaseOrder`, `createBulkReorderPurchaseOrder` (read of reorder rules)        | Yes — 3 reorder use-cases           | `/dashboard/inventory/reorder`, `/dashboard/inventory/purchase-orders`                                                                    |
| [`cut-history.ts`](./cut-history.ts)         | `createCut`                 | `recordCut`, plus PDF helpers (`getCutPdfPublicUrl`, `safeRemoveOrphanedCutPdf`)                                            | Yes — `RecordCutUseCase`            | `/dashboard/cutting-engine/history`                                                                                                       |
| [`materials.ts`](./materials.ts)             | `manageMaterialTypes`       | Material-type create/update/delete (FK pre-flight inside delete). See file header for the cost-write permission caveat.     | No — direct service calls           | `/dashboard/settings/materials`, `/dashboard/inventory/materials/pricing`, `/dashboard/inventory/materials/types`, `/dashboard/inventory` |
| [`inventory.ts`](./inventory.ts)             | `manageRolls`               | Roll quick-create + roll updates (sidebar dialog backing).                                                                  | No — direct `rollService`           | `/dashboard/inventory`                                                                                                                    |
| [`users.ts`](./users.ts)                     | `manageUsers`               | `updateUser`, `deactivateUser`, `reactivateUser`. Field surface intentionally narrowed (accessibility — `memberships.deleted_at` — is not editable through `updateUser`; only via deactivate/reactivate).                          | No — direct `userManagementService` | `/dashboard/users`                                                                                                                        |
| [`profile.ts`](./profile.ts)                 | (auth only — no perm check) | Self-delete. Target is always the actor; no caller-supplied userId.                                                         | No — direct `profileRepository`     | (none — user is about to redirect out)                                                                                                    |

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
