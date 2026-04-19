//! RF domain types — pure Rust data structures with no I/O or
//! framework dependencies.
//!
//! This crate is the innermost ring of the Clean Architecture split
//! that S3 is rolling out (spec:
//! `docs/superpowers/specs/2026-04-19-s3-rust-backend-design.md`).
//! Everything here must compile against plain `serde` + `thiserror`
//! only — no `reqwest`, no `axum`, no `tokio`, nothing async or
//! networking. Upper layers depend on `rf-domain`; `rf-domain`
//! depends on nothing in the workspace.
//!
//! Aggregates land here one at a time as each vertical slice ships.
//! Task 5 adds the Cut aggregate (cut_history row + favorites);
//! Roll, PurchaseOrder, and others arrive in later S3 phases.

pub mod cut;

pub use cut::{CutHistoryEntry, CutHistoryFilters, CutHistoryId, UserId};
