//! REMA backend HTTP delivery layer — Axum router, middleware stack,
//! DTO types, and the `build_router` factory that integration tests
//! use to exercise the server without binding a TCP socket.
//!
//! Depends on `rema-application` for the use-case surface and on
//! `rema-supabase` so `main.rs` can wire concrete repositories at
//! startup. See
//! `docs/superpowers/specs/2026-04-19-s3-rust-backend-design.md` for
//! the full architectural context.

pub mod auth;
pub mod config;
pub mod health;
pub mod jwks;
pub mod router;

pub use auth::{require_auth, user_postgrest, AppState, AuthContext, AuthError};
pub use jwks::{HttpJwksFetcher, JwksCache, JwksError, JwksFetcher, SupabaseClaims};
pub use router::{build_public_router, build_router, build_router_with_state};
