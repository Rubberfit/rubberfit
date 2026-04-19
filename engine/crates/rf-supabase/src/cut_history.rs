//! PostgREST-backed implementation of `CutHistoryPort`.
//!
//! Builds queries against `/rest/v1/cut_history` and
//! `/rest/v1/cut_history_favorites` per the migrations at
//! `src/infrastructure/supabase/migrations/`. The client is
//! request-scoped (see `postgrest.rs`) — one per authenticated call —
//! so Postgres RLS scopes rows to the caller automatically.

use async_trait::async_trait;
use rf_application::{cuts::CutHistoryPort, error::AppError};
use rf_domain::{CutHistoryEntry, CutHistoryFilters, CutHistoryId, UserId};

use crate::postgrest::PostgrestClient;

pub struct SupabaseCutHistoryRepository {
    client: PostgrestClient,
}

impl SupabaseCutHistoryRepository {
    pub fn new(client: PostgrestClient) -> Self {
        Self { client }
    }
}

#[async_trait]
impl CutHistoryPort for SupabaseCutHistoryRepository {
    async fn list_history(
        &self,
        _user_id: &UserId,
        filters: &CutHistoryFilters,
    ) -> Result<Vec<CutHistoryEntry>, AppError> {
        // We do NOT add `user_id=eq.<uuid>` to the filter — RLS does
        // that. Surfacing it here would duplicate the invariant AND
        // open a potential bypass if RLS ever loosens.
        let mut query: Vec<(String, String)> = Vec::new();
        query.push(("select".into(), "*".into()));
        query.push(("order".into(), "cut_date.desc".into()));

        if let Some(limit) = filters.limit {
            query.push(("limit".into(), limit.to_string()));
        }
        if let Some(offset) = filters.offset {
            query.push(("offset".into(), offset.to_string()));
        }
        if let Some(since) = filters.since.as_deref() {
            query.push(("cut_date".into(), format!("gte.{since}")));
        }
        if let Some(until) = filters.until.as_deref() {
            // `until` is additive — pushed as a second `cut_date`
            // filter. PostgREST composes them with AND.
            query.push(("cut_date".into(), format!("lte.{until}")));
        }

        let pairs: Vec<(&str, &str)> = query
            .iter()
            .map(|(k, v)| (k.as_str(), v.as_str()))
            .collect();

        self.client
            .get::<Vec<CutHistoryEntry>>("/rest/v1/cut_history", &pairs)
            .await
            .map_err(AppError::infrastructure)
    }

    async fn get_history_item(
        &self,
        _user_id: &UserId,
        cut_id: CutHistoryId,
    ) -> Result<Option<CutHistoryEntry>, AppError> {
        let id_filter = format!("eq.{}", cut_id.0);
        let query = [("select", "*"), ("id", id_filter.as_str()), ("limit", "1")];
        let mut rows: Vec<CutHistoryEntry> = self
            .client
            .get::<Vec<CutHistoryEntry>>("/rest/v1/cut_history", &query)
            .await
            .map_err(AppError::infrastructure)?;
        Ok(rows.pop())
    }

    async fn list_favorites(
        &self,
        _user_id: &UserId,
    ) -> Result<Vec<CutHistoryEntry>, AppError> {
        // PostgREST embed syntax: follow the FK on cut_history_favorites
        // back to the referenced `cut_history` row and return THAT.
        // We request the joined resource directly, not the favorite
        // rows themselves.
        let query = [
            ("select", "cut_history(*)"),
            ("order", "created_at.desc"),
        ];
        #[derive(serde::Deserialize)]
        struct FavoriteJoin {
            cut_history: Option<CutHistoryEntry>,
        }
        let rows: Vec<FavoriteJoin> = self
            .client
            .get::<Vec<FavoriteJoin>>("/rest/v1/cut_history_favorites", &query)
            .await
            .map_err(AppError::infrastructure)?;
        Ok(rows.into_iter().filter_map(|f| f.cut_history).collect())
    }
}
