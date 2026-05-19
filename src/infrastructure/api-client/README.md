# api-client

TypeScript types generated from the Rust backend's OpenAPI document
at `engine/crates/rf-api/openapi.json`.

## Regeneration

```bash
# 1. Regenerate the OpenAPI JSON from Rust attribute macros.
npm run openapi:dump

# 2. Regenerate this directory's types.ts from that JSON.
npm run openapi:types
```

Run both when any `#[utoipa::path]` or `ToSchema`-derived DTO in
`engine/crates/rf-api/` changes. The committed `openapi.json` is
the source of truth for the shape of the HTTP contract.

## Drift check

CI runs `npm run openapi:check` to regenerate the spec to a temp
file and diff against the committed copy. Any drift fails the build,
forcing the author to re-run the commands above and commit the
updates so backend and frontend types stay in lockstep.

## What lives here

- `types.ts` — auto-generated from `openapi-typescript`. Do not edit
  by hand. Exports `paths`, `components`, and `operations`.
- `client.ts` — shared `openapi-fetch` instance for the Rust backend.
  Consumers should import the per-aggregate wrappers, not this
  client directly.
- `rf/inventory.ts` — typed SDK with per-aggregate wrappers
  (`materialTypes`, `suppliers`, `materialSuppliers`, `rolls`). The
  Rust v2 backend is the canonical surface; flag-OFF branches throw
  `inventoryFlagOffError` to direct operators to flip
  `NEXT_PUBLIC_USE_RUST_INVENTORY=true`. Legacy repository/service
  fallbacks were retired (see commit history for the burial — mirrors
  the cut-history / PO / reorder pattern).
- `cut-history.ts` — exports `listCutHistory` + `listFavoriteIds`.
  Same burial pattern: flag-OFF throws `cutHistoryFlagOffError`; the
  v2 path hits `/api/v2/cuts/*` route handlers that forward to Rust
  via the cookie→bearer bridge.

## Feature flags

```
NEXT_PUBLIC_USE_RUST_CUT_HISTORY=true      # cut-history surface
NEXT_PUBLIC_USE_RUST_INVENTORY=true        # inventory (rolls,
                                           #  material types, suppliers,
                                           #  material-supplier links)
NEXT_PUBLIC_USE_RUST_PROCUREMENT=true      # purchase orders / reorder
```

Per-aggregate per-flag. Set in `.env.local` (dev) or Vercel env
(staging/prod). The flag is read at call time, so a Vercel env
change takes effect on the next page render without a redeploy.

Flag-OFF no longer routes to a legacy fallback — it throws an
operator-facing error (`<surface> flag-OFF path not wired`) and tells
the caller to flip the flag. Rolling a surface back to a pre-Rust
implementation now requires a code revert, not a runtime flag flip.

Flag-ON requires `RF_API_URL` to be set on the server; the v2 bridge
at `app/api/v2/_lib/bridge.ts` returns 503 if it isn't.
