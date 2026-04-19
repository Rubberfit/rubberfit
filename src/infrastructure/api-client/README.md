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
- `cut-history.ts` — the first consumer. Exports `listCutHistory` +
  `listFavoriteIds`. Branches on `NEXT_PUBLIC_USE_RUST_CUT_HISTORY`:
  - `"true"` — hits the v2 Next.js route handlers at `/api/v2/cuts/*`
    which forward to Rust via the cookie→bearer bridge.
  - anything else — hits the legacy `/api/cuts/*` routes that query
    Supabase directly via the service role.

Callers receive the same `CutHistory[]` shape regardless of which
backend served the data, so a per-request rollback is a pure flag
flip — no UI code changes.

## Feature flag

```
NEXT_PUBLIC_USE_RUST_CUT_HISTORY=true
```

Set in `.env.local` (dev) or Vercel env (staging/prod). The flag
is read at call time, so a Vercel env change takes effect on the
next page render without a redeploy.

Default is OFF until the Fly staging deploy (Task 9.5) validates
latency + parity against legacy. Rollback path for production: flip
the flag back to `false` in Vercel and the hook's next call lands
on the original Supabase path.
