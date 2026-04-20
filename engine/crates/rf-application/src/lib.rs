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
//! - S3b added the inventory ports: `MaterialTypePort`, `SupplierPort`,
//!   `MaterialSupplierPort`, `RollPort`.
//! - S3c adds procurement (POs + items + reorder + suggestions + CSV
//!   import) plus two cross-cutting ports: `NotificationPort` (used by
//!   approve / receive / reorder flows) and `TaxPort` (proxy to TS in
//!   S3c, full port in S3d).

pub mod cuts;
pub mod error;
pub mod inventory;
pub mod notifications;
pub mod procurement;
pub mod tax;

pub use error::AppError;
pub use notifications::NotificationPort;
pub use tax::{TaxCalculation, TaxPort};
