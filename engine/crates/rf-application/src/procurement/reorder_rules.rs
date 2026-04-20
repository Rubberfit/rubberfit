//! ReorderRule port + CRUD use cases (S3c Task 6).
//!
//! Reorder rules are per-material (UNIQUE material_type_id at the
//! DB level). Each carries a `reorder_point` trigger, a default
//! `reorder_quantity`, optional `max_stock_level`, `lead_time_days`,
//! `safety_stock_days`, and an `auto_reorder` flag that stays inert
//! in S3c (the plan defers actual automation to a later background
//! worker).
//!
//! Suggestion generation lives in the sibling `suggestions` module
//! — this file is pure CRUD.

use std::sync::Arc;

use async_trait::async_trait;
use rf_domain::{MaterialTypeId, ReorderRule, ReorderRuleId, SupplierId};

use crate::error::AppError;

/// Create input. `material_type_id` is required + unique; anything
/// already bound to a rule errors with a `DUPLICATE_PAIR` conflict
/// from the adapter's unique-violation mapping.
#[derive(Debug, Clone)]
pub struct NewReorderRule {
    pub material_type_id: MaterialTypeId,
    pub supplier_id: Option<SupplierId>,
    pub reorder_point: f64,
    pub reorder_quantity: f64,
    pub max_stock_level: Option<f64>,
    pub lead_time_days: i32,
    pub safety_stock_days: Option<i32>,
    pub auto_reorder: Option<bool>,
    pub active: Option<bool>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct ReorderRuleUpdate {
    pub supplier_id: Option<Option<SupplierId>>,
    pub reorder_point: Option<f64>,
    pub reorder_quantity: Option<f64>,
    pub max_stock_level: Option<Option<f64>>,
    pub lead_time_days: Option<i32>,
    pub safety_stock_days: Option<Option<i32>>,
    pub auto_reorder: Option<bool>,
    pub active: Option<bool>,
    pub notes: Option<Option<String>>,
}

#[async_trait]
pub trait ReorderRulePort: Send + Sync {
    async fn list(&self) -> Result<Vec<ReorderRule>, AppError>;

    async fn get(
        &self,
        id: &ReorderRuleId,
    ) -> Result<Option<ReorderRule>, AppError>;

    async fn create(
        &self,
        new: &NewReorderRule,
    ) -> Result<ReorderRule, AppError>;

    async fn update(
        &self,
        id: &ReorderRuleId,
        patch: &ReorderRuleUpdate,
    ) -> Result<Option<ReorderRule>, AppError>;

    /// Bump `last_triggered_at` to now. Called from the
    /// create-reorder-PO flow in Task 7; kept on the port so the
    /// reorder→PO use case doesn't need a separate rule mutation
    /// surface.
    async fn touch_triggered_at(
        &self,
        id: &ReorderRuleId,
    ) -> Result<(), AppError>;

    async fn delete(&self, id: &ReorderRuleId) -> Result<bool, AppError>;
}

fn validate_non_negative(value: f64, field: &str) -> Result<(), AppError> {
    if !value.is_finite() || value < 0.0 {
        return Err(AppError::InvalidInput(format!(
            "{field} must be a finite non-negative number"
        )));
    }
    Ok(())
}

fn validate_positive(value: f64, field: &str) -> Result<(), AppError> {
    if !value.is_finite() || value <= 0.0 {
        return Err(AppError::InvalidInput(format!(
            "{field} must be a finite positive number"
        )));
    }
    Ok(())
}

fn validate_non_negative_i32(value: i32, field: &str) -> Result<(), AppError> {
    if value < 0 {
        return Err(AppError::InvalidInput(format!(
            "{field} must be non-negative"
        )));
    }
    Ok(())
}

#[derive(Clone)]
pub struct ListReorderRulesUseCase {
    port: Arc<dyn ReorderRulePort>,
}

impl ListReorderRulesUseCase {
    pub fn new(port: Arc<dyn ReorderRulePort>) -> Self {
        Self { port }
    }
    pub async fn execute(&self) -> Result<Vec<ReorderRule>, AppError> {
        self.port.list().await
    }
}

#[derive(Clone)]
pub struct GetReorderRuleUseCase {
    port: Arc<dyn ReorderRulePort>,
}

impl GetReorderRuleUseCase {
    pub fn new(port: Arc<dyn ReorderRulePort>) -> Self {
        Self { port }
    }
    pub async fn execute(
        &self,
        id: ReorderRuleId,
    ) -> Result<ReorderRule, AppError> {
        match self.port.get(&id).await? {
            Some(r) => Ok(r),
            None => Err(AppError::NotFound),
        }
    }
}

#[derive(Clone)]
pub struct CreateReorderRuleUseCase {
    port: Arc<dyn ReorderRulePort>,
}

impl CreateReorderRuleUseCase {
    pub fn new(port: Arc<dyn ReorderRulePort>) -> Self {
        Self { port }
    }
    pub async fn execute(
        &self,
        new: NewReorderRule,
    ) -> Result<ReorderRule, AppError> {
        if new.material_type_id.0.trim().is_empty() {
            return Err(AppError::InvalidInput(
                "material_type_id is required".into(),
            ));
        }
        validate_non_negative(new.reorder_point, "reorder_point")?;
        validate_positive(new.reorder_quantity, "reorder_quantity")?;
        if let Some(max) = new.max_stock_level {
            validate_positive(max, "max_stock_level")?;
            // DB CHECK enforces (max_stock_level >= reorder_quantity)
            // and (max_stock_level > reorder_point); catch both here
            // with a clearer error than PG's 23514.
            if max < new.reorder_quantity {
                return Err(AppError::InvalidInput(
                    "max_stock_level must be >= reorder_quantity".into(),
                ));
            }
            if max <= new.reorder_point {
                return Err(AppError::InvalidInput(
                    "max_stock_level must be greater than reorder_point".into(),
                ));
            }
        }
        validate_non_negative_i32(new.lead_time_days, "lead_time_days")?;
        if let Some(days) = new.safety_stock_days {
            validate_non_negative_i32(days, "safety_stock_days")?;
        }
        self.port.create(&new).await
    }
}

#[derive(Clone)]
pub struct UpdateReorderRuleUseCase {
    port: Arc<dyn ReorderRulePort>,
}

impl UpdateReorderRuleUseCase {
    pub fn new(port: Arc<dyn ReorderRulePort>) -> Self {
        Self { port }
    }
    pub async fn execute(
        &self,
        id: ReorderRuleId,
        patch: ReorderRuleUpdate,
    ) -> Result<ReorderRule, AppError> {
        if let Some(v) = patch.reorder_point {
            validate_non_negative(v, "reorder_point")?;
        }
        if let Some(v) = patch.reorder_quantity {
            validate_positive(v, "reorder_quantity")?;
        }
        if let Some(Some(v)) = patch.max_stock_level {
            validate_positive(v, "max_stock_level")?;
        }
        if let Some(v) = patch.lead_time_days {
            validate_non_negative_i32(v, "lead_time_days")?;
        }
        if let Some(Some(v)) = patch.safety_stock_days {
            validate_non_negative_i32(v, "safety_stock_days")?;
        }
        match self.port.update(&id, &patch).await? {
            Some(r) => Ok(r),
            None => Err(AppError::NotFound),
        }
    }
}

#[derive(Clone)]
pub struct DeleteReorderRuleUseCase {
    port: Arc<dyn ReorderRulePort>,
}

impl DeleteReorderRuleUseCase {
    pub fn new(port: Arc<dyn ReorderRulePort>) -> Self {
        Self { port }
    }
    pub async fn execute(&self, id: ReorderRuleId) -> Result<(), AppError> {
        if self.port.delete(&id).await? {
            Ok(())
        } else {
            Err(AppError::NotFound)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    #[derive(Default)]
    struct FakePort {
        rows: Mutex<Vec<ReorderRule>>,
        next_id: Mutex<u32>,
    }

    impl FakePort {
        fn mint(&self, new: &NewReorderRule) -> ReorderRule {
            let mut seq = self.next_id.lock().unwrap();
            *seq += 1;
            ReorderRule {
                id: ReorderRuleId(format!("rr-{}", *seq)),
                material_type_id: new.material_type_id.clone(),
                supplier_id: new.supplier_id.clone(),
                reorder_point: new.reorder_point,
                reorder_quantity: new.reorder_quantity,
                max_stock_level: new.max_stock_level,
                lead_time_days: new.lead_time_days,
                safety_stock_days: new.safety_stock_days,
                auto_reorder: new.auto_reorder.unwrap_or(false),
                active: new.active.unwrap_or(true),
                notes: new.notes.clone(),
                last_triggered_at: None,
                created_at: Some("2026-04-19T00:00:00Z".into()),
                updated_at: Some("2026-04-19T00:00:00Z".into()),
                material_type: None,
                supplier: None,
            }
        }
    }

    #[async_trait]
    impl ReorderRulePort for FakePort {
        async fn list(&self) -> Result<Vec<ReorderRule>, AppError> {
            Ok(self.rows.lock().unwrap().clone())
        }
        async fn get(
            &self,
            id: &ReorderRuleId,
        ) -> Result<Option<ReorderRule>, AppError> {
            Ok(self
                .rows
                .lock()
                .unwrap()
                .iter()
                .find(|r| r.id == *id)
                .cloned())
        }
        async fn create(
            &self,
            new: &NewReorderRule,
        ) -> Result<ReorderRule, AppError> {
            let r = self.mint(new);
            self.rows.lock().unwrap().push(r.clone());
            Ok(r)
        }
        async fn update(
            &self,
            id: &ReorderRuleId,
            patch: &ReorderRuleUpdate,
        ) -> Result<Option<ReorderRule>, AppError> {
            let mut guard = self.rows.lock().unwrap();
            for r in guard.iter_mut() {
                if r.id == *id {
                    if let Some(v) = patch.reorder_point {
                        r.reorder_point = v;
                    }
                    if let Some(v) = patch.reorder_quantity {
                        r.reorder_quantity = v;
                    }
                    if let Some(v) = patch.active {
                        r.active = v;
                    }
                    return Ok(Some(r.clone()));
                }
            }
            Ok(None)
        }
        async fn touch_triggered_at(
            &self,
            id: &ReorderRuleId,
        ) -> Result<(), AppError> {
            let mut guard = self.rows.lock().unwrap();
            for r in guard.iter_mut() {
                if r.id == *id {
                    r.last_triggered_at = Some("2026-04-19T12:00:00Z".into());
                    return Ok(());
                }
            }
            Ok(())
        }
        async fn delete(&self, id: &ReorderRuleId) -> Result<bool, AppError> {
            let mut guard = self.rows.lock().unwrap();
            let len = guard.len();
            guard.retain(|r| r.id != *id);
            Ok(guard.len() != len)
        }
    }

    fn sample_new(mt: &str) -> NewReorderRule {
        NewReorderRule {
            material_type_id: MaterialTypeId(mt.into()),
            supplier_id: None,
            reorder_point: 500.0,
            reorder_quantity: 1000.0,
            max_stock_level: Some(2000.0),
            lead_time_days: 7,
            safety_stock_days: Some(3),
            auto_reorder: None,
            active: None,
            notes: None,
        }
    }

    #[tokio::test]
    async fn create_rejects_blank_material_type_id() {
        let uc = CreateReorderRuleUseCase::new(Arc::new(FakePort::default()));
        let err = uc.execute(sample_new("")).await.unwrap_err();
        assert!(matches!(err, AppError::InvalidInput(_)));
    }

    #[tokio::test]
    async fn create_rejects_zero_reorder_quantity() {
        let uc = CreateReorderRuleUseCase::new(Arc::new(FakePort::default()));
        let mut new = sample_new("mt-1");
        new.reorder_quantity = 0.0;
        let err = uc.execute(new).await.unwrap_err();
        assert!(matches!(err, AppError::InvalidInput(_)));
    }

    #[tokio::test]
    async fn create_rejects_max_below_reorder_quantity() {
        // DB check enforces this too; catching here surfaces a
        // clearer error than a 23514 CHECK_VIOLATION.
        let uc = CreateReorderRuleUseCase::new(Arc::new(FakePort::default()));
        let mut new = sample_new("mt-1");
        new.reorder_quantity = 1000.0;
        new.max_stock_level = Some(500.0);
        let err = uc.execute(new).await.unwrap_err();
        assert!(matches!(err, AppError::InvalidInput(_)));
    }

    #[tokio::test]
    async fn create_rejects_max_not_above_reorder_point() {
        let uc = CreateReorderRuleUseCase::new(Arc::new(FakePort::default()));
        let mut new = sample_new("mt-1");
        new.reorder_point = 500.0;
        new.max_stock_level = Some(500.0);
        let err = uc.execute(new).await.unwrap_err();
        assert!(matches!(err, AppError::InvalidInput(_)));
    }

    #[tokio::test]
    async fn create_happy_path_mints_id() {
        let port = Arc::new(FakePort::default());
        let uc = CreateReorderRuleUseCase::new(port);
        let r = uc.execute(sample_new("mt-1")).await.unwrap();
        assert!(r.id.0.starts_with("rr-"));
        assert!(r.active);
        assert!(!r.auto_reorder);
    }

    #[tokio::test]
    async fn update_rejects_negative_lead_time() {
        let port = Arc::new(FakePort::default());
        let r = CreateReorderRuleUseCase::new(port.clone())
            .execute(sample_new("mt-1"))
            .await
            .unwrap();
        let uc = UpdateReorderRuleUseCase::new(port);
        let err = uc
            .execute(
                r.id,
                ReorderRuleUpdate {
                    lead_time_days: Some(-1),
                    ..Default::default()
                },
            )
            .await
            .unwrap_err();
        assert!(matches!(err, AppError::InvalidInput(_)));
    }

    #[tokio::test]
    async fn delete_missing_returns_not_found() {
        let uc = DeleteReorderRuleUseCase::new(Arc::new(FakePort::default()));
        let err = uc
            .execute(ReorderRuleId("gone".into()))
            .await
            .unwrap_err();
        assert!(matches!(err, AppError::NotFound));
    }
}
