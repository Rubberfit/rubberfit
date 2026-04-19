//! Supabase REST adapter — concrete implementations of the Port
//! traits defined in `rema-application`.
//!
//! This crate is where `reqwest` lives. It speaks PostgREST to the
//! Supabase backend, translates rows into `rema-domain` aggregates,
//! and surfaces failures as the application-layer errors defined
//! upstream. The rest of the backend has no direct Supabase
//! dependency.
//!
//! Auth model: every request carries a user-scoped JWT so PostgREST
//! honors RLS. The adapter never uses a service role key — that's a
//! deliberate constraint per the S3 spec to keep per-user security
//! enforced at the DB layer.
//!
//! Concrete repository structs (`SupabaseRollRepository`,
//! `SupabasePurchaseOrderRepository`, etc.) land as each aggregate
//! migrates off the TS Supabase client in S3a-S3d.

pub mod cut_history;
pub mod postgrest;

pub use cut_history::SupabaseCutHistoryRepository;
pub use postgrest::{PostgrestClient, PostgrestError};
