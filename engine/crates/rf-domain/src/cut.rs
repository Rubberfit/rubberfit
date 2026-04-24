//! Cut aggregate — mirrors `cut_history` + `cut_history_favorites`
//! rows per the migrations at
//! `src/infrastructure/supabase/migrations/20260412055550_create_cut_history.sql`
//! and `20260412120000_create_cut_history_favorites.sql`.
//!
//! Every field is optional-or-safe to round-trip. `user_id` is a
//! string here (not a typed UUID) to keep `rf-domain` zero-dep
//! beyond serde/thiserror; validation lives at the application or
//! API boundary.

use serde::{Deserialize, Serialize};

/// `cut_history.id` — Postgres SERIAL (auto-increment).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct CutHistoryId(pub i64);

/// Supabase `auth.users.id` — a UUID in Postgres, string in our
/// layer. Not parsed here; the API boundary rejects bad shapes.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct UserId(pub String);

/// One row from `cut_history`. Field layout mirrors the migration
/// 1:1 so the Supabase adapter can deserialize PostgREST JSON
/// responses straight into this struct.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CutHistoryEntry {
    pub id: CutHistoryId,
    pub user_id: Option<UserId>,
    pub material_id: i32,
    pub part_id: i32,
    pub cut_length: f64,
    pub cut_width: f64,
    pub cut_thickness: f64,
    #[serde(default)]
    pub part_custom_width: Option<f64>,
    #[serde(default)]
    pub part_custom_height: Option<f64>,
    #[serde(default)]
    pub part_selected_size: Option<Vec<i32>>,
    #[serde(default)]
    pub part_selected_size_text: Option<Vec<String>>,
    #[serde(default)]
    pub part_selected_label: Option<Vec<String>>,
    pub cut_amount: i32,
    pub parts_completed: i32,
    pub material_used_sqft: f64,
    pub reusable_offset_sqft: f64,
    pub scrap_sqft: f64,
    pub fab_score: f64,
    pub cut_pieces: i32,
    pub cut_date: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    /// Which cutting-engine surface recorded this cut — `auto` (Auto-nest
    /// / pack-cli) or `manual` (Free-roam drag/drop). Optional on the
    /// domain so pre-migration rows still deserialize cleanly; the DB
    /// default is `'auto'`.
    #[serde(default)]
    pub source: Option<String>,
}

/// Query filters for `list_history`. Pagination + a couple of
/// narrow filters is enough for S3a; richer filtering moves to
/// S3b when the full dashboard slice migrates.
#[derive(Debug, Clone, Default)]
pub struct CutHistoryFilters {
    /// Page size. Caller-enforced; the port clamps in practice.
    pub limit: Option<u32>,
    /// Offset from the newest entry. 0 = the most recent page.
    pub offset: Option<u32>,
    /// Lower bound on `cut_date` (ISO-8601). Inclusive.
    pub since: Option<String>,
    /// Upper bound on `cut_date` (ISO-8601). Inclusive.
    pub until: Option<String>,
}
