//! Shared code for Vercel Rust functions under `api/`.
//!
//! Kept separate from `engine/` so the function bundle stays lean —
//! we only pull `rf-layout` (the packing engine) plus a lifted copy
//! of the Supabase JWKS / JWT verification logic from
//! `engine/crates/rf-api/src/jwks.rs`.

pub mod auth;
pub mod jwks;
