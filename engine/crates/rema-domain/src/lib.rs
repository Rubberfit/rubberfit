//! REMA domain types — pure Rust data structures with no I/O or
//! framework dependencies.
//!
//! This crate is the innermost ring of the Clean Architecture split
//! that S3 is rolling out (spec:
//! `docs/superpowers/specs/2026-04-19-s3-rust-backend-design.md`).
//! Everything here must compile against plain `serde` + `thiserror`
//! only — no `reqwest`, no `axum`, no `tokio`, nothing async or
//! networking. Upper layers depend on `rema-domain`; `rema-domain`
//! depends on nothing in the workspace.
//!
//! Populating this crate with the real aggregates (Cut, Roll, Part,
//! PurchaseOrder, ReorderSuggestion, etc.) lands in subsequent S3a
//! tasks as each vertical slice migrates off the TS-side Supabase
//! client.
