//! RF application layer — Port trait definitions and use-case
//! orchestration for the Rust backend (S3).
//!
//! Sits between `rf-domain` (pure types, no I/O) and the
//! infrastructure / delivery layers (`rf-supabase`, `rf-api`).
//! Ports here are the abstractions the use cases depend on; concrete
//! impls live in `rf-supabase`.
//!
//! Current scope:
//! - S3a Task 5 landed `CutHistoryPort` + three cut-history use cases.
//! - S3b lands the inventory ports: `MaterialTypePort`, plus
//!   `SupplierPort`, `MaterialSupplierPort`, `RollPort` as each
//!   task ships.
//! - POs + reorder aggregate follow in S3c.

pub mod cuts;
pub mod error;
pub mod inventory;

pub use error::AppError;
