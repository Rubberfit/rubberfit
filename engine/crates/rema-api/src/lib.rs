//! REMA backend HTTP delivery layer — Axum router, JWT middleware,
//! OpenAPI schema, DTO types (S3).
//!
//! This crate is the outermost ring: it maps HTTP requests to
//! use-case invocations and serializes results back out. It depends
//! on `rema-application` for the use-case surface and on
//! `rema-supabase` only so `main.rs` can wire concrete repositories
//! into the DI container at startup.
//!
//! Task 2 adds the Axum server boot + `/health`. JWKS/JWT middleware
//! arrives in Task 3. Per-aggregate endpoints land as each S3a-S3d
//! vertical slice ships.
