# api-client

TypeScript types generated from the Rust backend's OpenAPI document
at `engine/crates/rema-api/openapi.json`.

## Regeneration

```bash
# 1. Regenerate the OpenAPI JSON from Rust attribute macros.
npm run openapi:dump

# 2. Regenerate this directory's types.ts from that JSON.
npm run openapi:types
```

Run both when any `#[utoipa::path]` or `ToSchema`-derived DTO in
`engine/crates/rema-api/` changes. The committed `openapi.json` is
the source of truth for the shape of the HTTP contract.

## Drift check

CI runs `npm run openapi:check` to regenerate the spec to a temp
file and diff against the committed copy. Any drift fails the build,
forcing the author to re-run the commands above and commit the
updates so backend and frontend types stay in lockstep.

## What lives here

- `types.ts` — auto-generated from `openapi-typescript`. Do not edit
  by hand. Exports `paths`, `components`, and `operations`.

When we start consuming these types, the client wrapper code lands
here too (likely as `client.ts` calling `openapi-fetch` with the
generated `paths` type).
