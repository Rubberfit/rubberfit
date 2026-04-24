# /api/v2

Next.js route handlers that bridge Supabase **session cookies**
(used by the rest of the app) to **bearer JWTs** (required by the
Rust backend at `RF_API_URL`).

## Why route handlers, not rewrites

A pure `next.config.mjs` rewrite is a transparent proxy — it
cannot mint a bearer token from a cookie. Because the Rust
backend's JWKS middleware only accepts `Authorization: Bearer
<jwt>`, we need server-side code that:

1. Reads the Supabase session from cookies via `@supabase/ssr`.
2. Extracts `session.access_token`.
3. Calls the Rust endpoint with `Authorization: Bearer <token>`.
4. Streams the response body back with preserved status + headers.

Route handlers also give us a place for per-route feature flags
(canary/rollback) and idempotency-key injection for future POST
routes in S3c.

## Layout

```
app/api/v2/
├── _lib/
│   └── bridge.ts               ← the single cookie→bearer bridge
├── cuts/
│   ├── favorites/route.ts      ← GET /api/v2/cuts/favorites
│   └── history/
│       ├── route.ts            ← GET /api/v2/cuts/history
│       └── [id]/route.ts       ← GET /api/v2/cuts/history/{id}
└── README.md
```

Each `route.ts` is a thin shim (~5 lines) that calls
`forwardToRust(request, { path })`. All auth, streaming, env
validation, and error mapping lives in `_lib/bridge.ts`.

## Env

- `RF_API_URL` — origin of the Rust backend, e.g.
  `https://rf-api.fly.dev`. No trailing slash required; the
  bridge strips it.
- `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` —
  used to construct the SSR client that reads the session cookie.

All three must be present in production. The bridge returns 503
with a distinct error message for each missing variable so
operators can pinpoint the misconfiguration quickly.

## Error mapping

| Situation                            | Status | Body                                         |
| ------------------------------------ | ------ | -------------------------------------------- |
| `RF_API_URL` missing               | 503    | `RF_API_URL is not configured on the server` |
| Supabase env missing                 | 503    | `Supabase environment variables are missing`   |
| No session cookie                    | 401    | `Unauthorized`                                |
| Rust upstream unreachable            | 502    | `upstream service unavailable`                |
| Rust responds                        | pass-through | Rust's body + non-hop-by-hop headers    |

## Tests

Unit tests: `tests/api-v2-bridge.test.ts` (7 scenarios).

The bridge exposes `__setAccessTokenResolverForTests` so tests can
swap the `getSession` path without mocking `@supabase/ssr`, which
this repo's nested-`node_modules` layout makes awkward to stub.
