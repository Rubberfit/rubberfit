//! REMA backend HTTP delivery layer — Axum router, middleware stack,
//! DTO types, and the `build_router` factory that integration tests
//! use to exercise the server without binding a TCP socket.
//!
//! Depends on `rema-application` for the use-case surface and on
//! `rema-supabase` so `main.rs` can wire concrete repositories at
//! startup. See
//! `docs/superpowers/specs/2026-04-19-s3-rust-backend-design.md` for
//! the full architectural context.

pub mod config;
pub mod health;
pub mod router;

pub use router::build_router;
