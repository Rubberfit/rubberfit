//! REMA application layer — Port trait definitions and use-case
//! orchestration for the Rust backend (S3).
//!
//! Sits between `rema-domain` (pure types, no I/O) and the
//! infrastructure / delivery layers (`rema-supabase`, `rema-api`).
//! Ports here are the abstractions the use cases depend on; concrete
//! impls live in `rema-supabase`.
//!
//! Current scope: S3a Task 5 lands the `CutHistoryPort` + the three
//! cut-history use cases. Richer aggregates (rolls, POs, reorder)
//! follow in later S3 tasks.

pub mod cuts;
pub mod error;

pub use error::AppError;
