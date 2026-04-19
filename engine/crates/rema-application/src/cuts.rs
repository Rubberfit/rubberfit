//! Cut-history Port trait + use-case orchestrators.
//!
//! The Port is the abstract repository interface; `rema-supabase`
//! implements it against PostgREST. Handlers in `rema-api`
//! instantiate the concrete adapter per request (it carries a
//! user-scoped JWT) and wrap it in `Arc<dyn CutHistoryPort + ...>`
//! to feed the use cases.

use std::sync::Arc;

use async_trait::async_trait;
use rema_domain::{CutHistoryEntry, CutHistoryFilters, CutHistoryId, UserId};

use crate::error::AppError;

/// Repository interface over the `cut_history` + `cut_history_favorites`
/// tables. All methods are `async` because the concrete impl hits
/// Supabase over HTTP.
///
/// Every method takes `user_id` explicitly so the implementation can
/// scope queries (or, in the Supabase case, reassure itself that
/// PostgREST + RLS is doing the scoping for us).
#[async_trait]
pub trait CutHistoryPort: Send + Sync {
    async fn list_history(
        &self,
        user_id: &UserId,
        filters: &CutHistoryFilters,
    ) -> Result<Vec<CutHistoryEntry>, AppError>;

    async fn get_history_item(
        &self,
        user_id: &UserId,
        cut_id: CutHistoryId,
    ) -> Result<Option<CutHistoryEntry>, AppError>;

    async fn list_favorites(
        &self,
        user_id: &UserId,
    ) -> Result<Vec<CutHistoryEntry>, AppError>;
}

/// Use case: list cut history for the calling user.
#[derive(Clone)]
pub struct ListCutHistoryUseCase {
    port: Arc<dyn CutHistoryPort>,
}

impl ListCutHistoryUseCase {
    pub fn new(port: Arc<dyn CutHistoryPort>) -> Self {
        Self { port }
    }

    pub async fn execute(
        &self,
        user_id: &UserId,
        filters: CutHistoryFilters,
    ) -> Result<Vec<CutHistoryEntry>, AppError> {
        // Defensive clamp — a handler misconfigured by a future
        // route change doesn't blow the page budget.
        let mut filters = filters;
        if let Some(limit) = filters.limit {
            if limit > 200 {
                filters.limit = Some(200);
            }
        } else {
            filters.limit = Some(50);
        }
        self.port.list_history(user_id, &filters).await
    }
}

/// Use case: fetch a single cut-history row. Returns `NotFound` when
/// the row doesn't exist OR is filtered by RLS — we never leak which.
#[derive(Clone)]
pub struct GetCutHistoryItemUseCase {
    port: Arc<dyn CutHistoryPort>,
}

impl GetCutHistoryItemUseCase {
    pub fn new(port: Arc<dyn CutHistoryPort>) -> Self {
        Self { port }
    }

    pub async fn execute(
        &self,
        user_id: &UserId,
        cut_id: CutHistoryId,
    ) -> Result<CutHistoryEntry, AppError> {
        match self.port.get_history_item(user_id, cut_id).await? {
            Some(entry) => Ok(entry),
            None => Err(AppError::NotFound),
        }
    }
}

/// Use case: list favorites. Thin wrapper for now; business rules
/// (e.g. starring limits, soft-delete semantics) would land here.
#[derive(Clone)]
pub struct ListFavoritesUseCase {
    port: Arc<dyn CutHistoryPort>,
}

impl ListFavoritesUseCase {
    pub fn new(port: Arc<dyn CutHistoryPort>) -> Self {
        Self { port }
    }

    pub async fn execute(
        &self,
        user_id: &UserId,
    ) -> Result<Vec<CutHistoryEntry>, AppError> {
        self.port.list_favorites(user_id).await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    /// Fake port that records calls + returns canned data. Lets each
    /// test assert both what the use case asked for AND what it did
    /// with the response.
    #[derive(Default)]
    struct FakePort {
        history: Vec<CutHistoryEntry>,
        item: Option<CutHistoryEntry>,
        favorites: Vec<CutHistoryEntry>,
        observed_filters: Mutex<Option<CutHistoryFilters>>,
    }

    #[async_trait]
    impl CutHistoryPort for FakePort {
        async fn list_history(
            &self,
            _user_id: &UserId,
            filters: &CutHistoryFilters,
        ) -> Result<Vec<CutHistoryEntry>, AppError> {
            *self.observed_filters.lock().unwrap() = Some(filters.clone());
            Ok(self.history.clone())
        }
        async fn get_history_item(
            &self,
            _user_id: &UserId,
            _cut_id: CutHistoryId,
        ) -> Result<Option<CutHistoryEntry>, AppError> {
            Ok(self.item.clone())
        }
        async fn list_favorites(
            &self,
            _user_id: &UserId,
        ) -> Result<Vec<CutHistoryEntry>, AppError> {
            Ok(self.favorites.clone())
        }
    }

    fn sample_entry(id: i64) -> CutHistoryEntry {
        CutHistoryEntry {
            id: CutHistoryId(id),
            user_id: Some(UserId("user-a".into())),
            material_id: 1,
            part_id: 2,
            cut_length: 10.0,
            cut_width: 20.0,
            cut_thickness: 1.0,
            part_custom_width: None,
            part_custom_height: None,
            part_selected_size: None,
            part_selected_size_text: None,
            part_selected_label: None,
            cut_amount: 1,
            parts_completed: 1,
            material_used_sqft: 1.0,
            reusable_offset_sqft: 0.0,
            scrap_sqft: 0.1,
            fab_score: 0.95,
            cut_pieces: 1,
            cut_date: None,
            created_at: None,
            updated_at: None,
        }
    }

    #[tokio::test]
    async fn list_clamps_limit_at_200() {
        let fake = Arc::new(FakePort {
            history: vec![sample_entry(1)],
            ..Default::default()
        });
        let use_case = ListCutHistoryUseCase::new(fake.clone());
        let filters = CutHistoryFilters {
            limit: Some(9999),
            ..Default::default()
        };
        let _ = use_case
            .execute(&UserId("u".into()), filters)
            .await
            .unwrap();
        let observed = fake.observed_filters.lock().unwrap().clone().unwrap();
        assert_eq!(observed.limit, Some(200), "limit should be clamped to 200");
    }

    #[tokio::test]
    async fn list_default_limit_is_50() {
        let fake = Arc::new(FakePort::default());
        let use_case = ListCutHistoryUseCase::new(fake.clone());
        let _ = use_case
            .execute(&UserId("u".into()), CutHistoryFilters::default())
            .await
            .unwrap();
        let observed = fake.observed_filters.lock().unwrap().clone().unwrap();
        assert_eq!(observed.limit, Some(50));
    }

    #[tokio::test]
    async fn get_returns_not_found_when_port_returns_none() {
        let fake = Arc::new(FakePort::default());
        let use_case = GetCutHistoryItemUseCase::new(fake);
        let err = use_case
            .execute(&UserId("u".into()), CutHistoryId(42))
            .await
            .unwrap_err();
        assert!(matches!(err, AppError::NotFound));
    }

    #[tokio::test]
    async fn get_returns_entry_when_port_has_it() {
        let entry = sample_entry(42);
        let fake = Arc::new(FakePort {
            item: Some(entry.clone()),
            ..Default::default()
        });
        let use_case = GetCutHistoryItemUseCase::new(fake);
        let got = use_case
            .execute(&UserId("u".into()), CutHistoryId(42))
            .await
            .unwrap();
        assert_eq!(got.id.0, 42);
    }

    #[tokio::test]
    async fn favorites_passes_through() {
        let fake = Arc::new(FakePort {
            favorites: vec![sample_entry(1), sample_entry(2)],
            ..Default::default()
        });
        let use_case = ListFavoritesUseCase::new(fake);
        let got = use_case.execute(&UserId("u".into())).await.unwrap();
        assert_eq!(got.len(), 2);
    }
}
