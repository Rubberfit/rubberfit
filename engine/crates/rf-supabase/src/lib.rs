//! Supabase REST adapter — concrete implementations of the Port
//! traits defined in `rf-application`.
//!
//! This crate is where `reqwest` lives. It speaks PostgREST to the
//! Supabase backend, translates rows into `rf-domain` aggregates,
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
pub mod material_suppliers;
pub mod material_types;
pub mod notifications;
pub mod po_items;
pub mod postgrest;
pub mod purchase_orders;
pub mod receive;
pub mod reorder_rules;
pub mod rolls;
pub mod suggestions;
pub mod suppliers;
pub mod tax;

pub use cut_history::SupabaseCutHistoryRepository;
pub use material_suppliers::SupabaseMaterialSupplierRepository;
pub use material_types::SupabaseMaterialTypeRepository;
pub use notifications::SupabaseNotificationRepository;
pub use po_items::SupabasePurchaseOrderItemRepository;
pub use postgrest::{PostgrestClient, PostgrestError};
pub use purchase_orders::SupabasePurchaseOrderRepository;
pub use receive::SupabaseReceiveRepository;
pub use reorder_rules::SupabaseReorderRuleRepository;
pub use rolls::SupabaseRollRepository;
pub use suggestions::SupabaseSuggestionReads;
pub use suppliers::SupabaseSupplierRepository;
pub use tax::HttpTaxProxy;
