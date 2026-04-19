# rema-api

Axum HTTP delivery layer for the REMA backend (S3). Maps REST
requests to use-case calls via the Ports in `rema-application`,
resolving concrete repositories (`rema-supabase`) per request.

## Layer rules

- **Consumers**: end users (HTTP) and the Next.js frontend as a
  reverse-proxy target.
- **Dependencies**: all three inner crates (`rema-domain`,
  `rema-application`, `rema-supabase`) + Axum + middleware stack
  + `utoipa` for OpenAPI.
- **Auth**: JWKS/RS256 verification middleware (Task 3) extracts a
  user `AuthContext` and passes it to every request handler.

## What lives here

- `main.rs` — binary entrypoint: boots Axum, loads config, binds
  port, installs middleware, mounts routes.
- `lib.rs` — the router factory, middleware, DTO types, OpenAPI
  schema assembly. Integration tests construct the router via this
  library interface.
- Per-resource handler modules as each aggregate ships: `cuts`,
  `rolls`, `purchase_orders`, etc.
- Middleware: auth, request-ID, timeout, CORS, error mapping.

## What does NOT live here

- Business logic — call into `rema-application` use cases.
- SQL or direct Supabase I/O — goes through `rema-supabase`.
- Domain invariants — defer to `rema-domain` types.

## Current state

S3a Tasks 2, 3, 4, 5, 6 landed.

- **Task 2**: Axum server boot + `/health`.
- **Task 3**: JWKS + RS256 JWT middleware for `/api/v2/*`.
- **Task 4**: Request-scoped PostgREST client (`rema-supabase`).
- **Task 5**: Cut-history Port + use cases + Supabase impl
  (`rema-application::cuts`, `rema-supabase::cut_history`).
- **Task 6**: Cut-history HTTP routes + DTOs (this crate):
  - `GET /api/v2/cuts/history` — list with `limit`/`offset`/`since`/`until`.
  - `GET /api/v2/cuts/history/{id}` — single entry by id.
  - `GET /api/v2/cuts/favorites` — favorites list.

Routes are assembled via `build_router_with_state(cfg, state)`.
`AppState` carries a `CutHistoryPortFactory` trait object so
integration tests inject fakes while production uses
`SupabaseCutHistoryFactory` (builds a per-request PostgREST
client from the caller's JWT).

## Running

```bash
cargo run -p rema-api
# → listens on REMA_API_BIND (default 127.0.0.1:8080)
# → GET /health returns { "status": "ok", ... }
# → GET /api/v2/cuts/history requires a Supabase JWT (RS256)
```
