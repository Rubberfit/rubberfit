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

Empty scaffold. Axum wiring lands in S3a Task 2; JWT middleware in
Task 3; first endpoint (cut-history) in Task 4.

## Running

Once wired:

```bash
cargo run -p rema-api
# → listens on REMA_API_BIND (default 127.0.0.1:8080)
# → GET /health returns { "status": "ok", ... }
```
