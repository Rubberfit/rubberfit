# stores/

Zustand state stores for client-side state management. Each store wraps a service layer and exposes actions + loading / error state to React components.

## Files

- **preferences/** — UI preferences (theme, layout density, sidebar collapsed state).
  - `preferences-provider.tsx` — context provider mounted in `app/layout.tsx`.
  - `preferences-store.ts` — Zustand store backing the provider.

## History

Earlier iterations shipped `purchaseOrderStore.ts`, `reorderStore.ts`, and
`supplierStore.ts` alongside the procurement refactor. Those stores were
never wired up in the final flow — components call service singletons
through `di/` directly — so they were removed. Follow the current pattern
when adding new stores: keep UI state local via `useState`, lift to
Zustand only when two+ routes share the same reactive state.
