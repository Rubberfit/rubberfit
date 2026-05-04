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
- `rf/inventory.ts` — S3b typed SDK. Per-aggregate wrappers
  (`materialTypes`, `suppliers`, `materialSuppliers`, `rolls`) with
  CRUD + stats methods. Flag-gated on
  `NEXT_PUBLIC_USE_RUST_INVENTORY`; when OFF, calls route to the
  existing legacy repositories/services.
- `cut-history.ts` — the S3a consumer. Exports `listCutHistory` +
  `listFavoriteIds`. Branches on `NEXT_PUBLIC_USE_RUST_CUT_HISTORY`:
  - `"true"` — hits the v2 Next.js route handlers at `/api/v2/cuts/*`
    which forward to Rust via the cookie→bearer bridge.
  - anything else — hits the legacy `/api/cuts/*` routes that query
    Supabase directly via the service role.

Callers receive the same `CutHistory[]` shape regardless of which
backend served the data, so a per-request rollback is a pure flag
flip — no UI code changes.

## Feature flags

```
NEXT_PUBLIC_USE_RUST_CUT_HISTORY=true      # S3a cut-history
NEXT_PUBLIC_USE_RUST_INVENTORY=true        # S3b inventory (rolls,
                                           #  material types, suppliers,
                                           #  material-supplier links)
```

Per-aggregate per-flag so operators can roll out one surface at a
time and roll back instantly.

Set in `.env.local` (dev) or Vercel env (staging/prod). The flag
is read at call time, so a Vercel env change takes effect on the
next page render without a redeploy.

Default is OFF until the Fly staging deploy (Task 9.5) validates
latency + parity against legacy. Rollback path for production: flip
the flag back to `false` in Vercel and the hook's next call lands
on the original Supabase path.
