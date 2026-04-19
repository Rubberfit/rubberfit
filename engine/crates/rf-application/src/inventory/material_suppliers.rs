//! MaterialSupplier port + CRUD use cases.
//!
//! Junction table between material_types and suppliers. GET paths
//! embed both parents (via PostgREST's `material_type:material_types
//! (*)` alias on the adapter side) so the UI sees the same
//! `MaterialSupplierWithDetails` shape it already renders. Writes
//! take just the FK ids.
//!
//! `preferred_supplier` is stored as a row-level boolean — no
//! "exactly one preferred per material" invariant. If/when that
//! constraint becomes a product requirement, it's a Postgres
//! function + dedicated endpoint in a later phase.

use std::sync::Arc;

use async_trait::async_trait;
use rf_domain::{MaterialSupplier, MaterialSupplierId, MaterialTypeId, SupplierId};

use crate::error::AppError;

#[derive(Debug, Clone, Default)]
pub struct MaterialSupplierFilters {
    pub material_type_id: Option<MaterialTypeId>,
    pub supplier_id: Option<SupplierId>,
    pub active: Option<bool>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

#[derive(Debug, Clone)]
pub struct NewMaterialSupplier {
    pub material_type_id: MaterialTypeId,
    pub supplier_id: SupplierId,
    pub supplier_material_code: Option<String>,
    pub cost_per_sqft: f64,
    pub minimum_order_sqft: Option<f64>,
    pub lead_time_days: Option<i32>,
    pub preferred_supplier: Option<bool>,
    pub active: Option<bool>,
    pub notes: Option<String>,
    pub effective_date: Option<String>,
    pub expiration_date: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct MaterialSupplierUpdate {
    pub supplier_material_code: Option<Option<String>>,
    pub cost_per_sqft: Option<f64>,
    pub minimum_order_sqft: Option<Option<f64>>,
    pub lead_time_days: Option<Option<i32>>,
    pub preferred_supplier: Option<bool>,
    pub active: Option<bool>,
    pub notes: Option<Option<String>>,
    pub effective_date: Option<Option<String>>,
    pub expiration_date: Option<Option<String>>,
}

#[async_trait]
pub trait MaterialSupplierPort: Send + Sync {
    async fn list(
        &self,
        filters: &MaterialSupplierFilters,
    ) -> Result<Vec<MaterialSupplier>, AppError>;

    async fn get(
        &self,
        id: &MaterialSupplierId,
    ) -> Result<Option<MaterialSupplier>, AppError>;

    async fn create(
        &self,
        new: &NewMaterialSupplier,
    ) -> Result<MaterialSupplier, AppError>;

    async fn update(
        &self,
        id: &MaterialSupplierId,
        patch: &MaterialSupplierUpdate,
    ) -> Result<Option<MaterialSupplier>, AppError>;

    async fn delete(&self, id: &MaterialSupplierId) -> Result<bool, AppError>;
}

fn validate_cost(cost: f64) -> Result<(), AppError> {
    if !cost.is_finite() || cost <= 0.0 {
        return Err(AppError::InvalidInput(
            "cost_per_sqft must be a finite positive number".into(),
        ));
    }
    Ok(())
}

fn validate_non_negative(value: Option<f64>, field: &str) -> Result<(), AppError> {
    if let Some(v) = value {
        if !v.is_finite() || v < 0.0 {
            return Err(AppError::InvalidInput(format!(
                "{field} must be a finite non-negative number"
            )));
        }
    }
    Ok(())
}

fn validate_lead_time(days: Option<i32>) -> Result<(), AppError> {
    if let Some(d) = days {
        if d < 0 {
            return Err(AppError::InvalidInput(
                "lead_time_days must not be negative".into(),
            ));
        }
    }
    Ok(())
}

fn validate_date_range(
    effective: Option<&str>,
    expiration: Option<&str>,
) -> Result<(), AppError> {
    // The DB has a CHECK (expiration > effective); we pre-validate
    // here so the 400 error has a human message. String comparison is
    // safe for ISO-8601 `YYYY-MM-DD` since each component is
    // lexicographically ordered.
    if let (Some(e), Some(x)) = (effective, expiration) {
        if x <= e {
            return Err(AppError::InvalidInput(
                "expiration_date must be strictly after effective_date".into(),
            ));
        }
    }
    Ok(())
}

#[derive(Clone)]
pub struct ListMaterialSuppliersUseCase {
    port: Arc<dyn MaterialSupplierPort>,
}

impl ListMaterialSuppliersUseCase {
    pub fn new(port: Arc<dyn MaterialSupplierPort>) -> Self {
        Self { port }
    }

    pub async fn execute(
        &self,
        mut filters: MaterialSupplierFilters,
    ) -> Result<Vec<MaterialSupplier>, AppError> {
        if let Some(limit) = filters.limit {
            if limit > 200 {
                filters.limit = Some(200);
            }
        }
        self.port.list(&filters).await
    }
}

#[derive(Clone)]
pub struct GetMaterialSupplierUseCase {
    port: Arc<dyn MaterialSupplierPort>,
}

impl GetMaterialSupplierUseCase {
    pub fn new(port: Arc<dyn MaterialSupplierPort>) -> Self {
        Self { port }
    }

    pub async fn execute(
        &self,
        id: MaterialSupplierId,
    ) -> Result<MaterialSupplier, AppError> {
        match self.port.get(&id).await? {
            Some(ms) => Ok(ms),
            None => Err(AppError::NotFound),
        }
    }
}

#[derive(Clone)]
pub struct CreateMaterialSupplierUseCase {
    port: Arc<dyn MaterialSupplierPort>,
}

impl CreateMaterialSupplierUseCase {
    pub fn new(port: Arc<dyn MaterialSupplierPort>) -> Self {
        Self { port }
    }

    pub async fn execute(
        &self,
        new: NewMaterialSupplier,
    ) -> Result<MaterialSupplier, AppError> {
        validate_cost(new.cost_per_sqft)?;
        validate_non_negative(new.minimum_order_sqft, "minimum_order_sqft")?;
        validate_lead_time(new.lead_time_days)?;
        validate_date_range(
            new.effective_date.as_deref(),
            new.expiration_date.as_deref(),
        )?;
        self.port.create(&new).await
    }
}

#[derive(Clone)]
pub struct UpdateMaterialSupplierUseCase {
    port: Arc<dyn MaterialSupplierPort>,
}

impl UpdateMaterialSupplierUseCase {
    pub fn new(port: Arc<dyn MaterialSupplierPort>) -> Self {
        Self { port }
    }

    pub async fn execute(
        &self,
        id: MaterialSupplierId,
        patch: MaterialSupplierUpdate,
    ) -> Result<MaterialSupplier, AppError> {
        if let Some(cost) = patch.cost_per_sqft {
            validate_cost(cost)?;
        }
        if let Some(Some(mos)) = patch.minimum_order_sqft {
            validate_non_negative(Some(mos), "minimum_order_sqft")?;
        }
        if let Some(Some(lt)) = patch.lead_time_days {
            validate_lead_time(Some(lt))?;
        }
        // Date-range validation is DB-enforced; we only pre-check
        // when both fields are present in the patch. Partial patches
        // where one field changes can only be safely validated with
        // the current-row state, which we don't re-read on update —
        // let Postgres reject the transaction if needed.
        if let (Some(Some(e)), Some(Some(x))) = (
            patch.effective_date.as_ref(),
            patch.expiration_date.as_ref(),
        ) {
            validate_date_range(Some(e), Some(x))?;
        }
        match self.port.update(&id, &patch).await? {
            Some(ms) => Ok(ms),
            None => Err(AppError::NotFound),
        }
    }
}

#[derive(Clone)]
pub struct DeleteMaterialSupplierUseCase {
    port: Arc<dyn MaterialSupplierPort>,
}

impl DeleteMaterialSupplierUseCase {
    pub fn new(port: Arc<dyn MaterialSupplierPort>) -> Self {
        Self { port }
    }

    pub async fn execute(&self, id: MaterialSupplierId) -> Result<(), AppError> {
        let deleted = self.port.delete(&id).await?;
        if deleted {
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
        rows: Mutex<Vec<MaterialSupplier>>,
        duplicate: Mutex<bool>,
    }

    #[async_trait]
    impl MaterialSupplierPort for FakePort {
        async fn list(
            &self,
            _filters: &MaterialSupplierFilters,
        ) -> Result<Vec<MaterialSupplier>, AppError> {
            Ok(self.rows.lock().unwrap().clone())
        }
        async fn get(
            &self,
            id: &MaterialSupplierId,
        ) -> Result<Option<MaterialSupplier>, AppError> {
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
            new: &NewMaterialSupplier,
        ) -> Result<MaterialSupplier, AppError> {
            if *self.duplicate.lock().unwrap() {
                return Err(AppError::conflict("DUPLICATE_PAIR"));
            }
            let ms = MaterialSupplier {
                id: MaterialSupplierId("ms-1".into()),
                material_type_id: new.material_type_id.clone(),
                supplier_id: new.supplier_id.clone(),
                supplier_material_code: new.supplier_material_code.clone(),
                cost_per_sqft: new.cost_per_sqft,
                minimum_order_sqft: new.minimum_order_sqft,
                lead_time_days: new.lead_time_days,
                preferred_supplier: new.preferred_supplier.unwrap_or(false),
                active: new.active.unwrap_or(true),
                notes: new.notes.clone(),
                effective_date: new.effective_date.clone(),
                expiration_date: new.expiration_date.clone(),
                created_at: Some("2026-04-19T00:00:00Z".into()),
                updated_at: Some("2026-04-19T00:00:00Z".into()),
                material_type: None,
                supplier: None,
            };
            self.rows.lock().unwrap().push(ms.clone());
            Ok(ms)
        }
        async fn update(
            &self,
            id: &MaterialSupplierId,
            _patch: &MaterialSupplierUpdate,
        ) -> Result<Option<MaterialSupplier>, AppError> {
            Ok(self
                .rows
                .lock()
                .unwrap()
                .iter()
                .find(|r| r.id == *id)
                .cloned())
        }
        async fn delete(
            &self,
            id: &MaterialSupplierId,
        ) -> Result<bool, AppError> {
            let mut g = self.rows.lock().unwrap();
            let len = g.len();
            g.retain(|r| r.id != *id);
            Ok(g.len() != len)
        }
    }

    fn sample_new() -> NewMaterialSupplier {
        NewMaterialSupplier {
            material_type_id: MaterialTypeId("mt-1".into()),
            supplier_id: SupplierId("sup-1".into()),
            supplier_material_code: None,
            cost_per_sqft: 3.15,
            minimum_order_sqft: Some(500.0),
            lead_time_days: Some(14),
            preferred_supplier: Some(false),
            active: Some(true),
            notes: None,
            effective_date: Some("2026-01-01".into()),
            expiration_date: Some("2026-12-31".into()),
        }
    }

    #[tokio::test]
    async fn create_rejects_zero_cost() {
        let uc = CreateMaterialSupplierUseCase::new(Arc::new(FakePort::default()));
        let err = uc
            .execute(NewMaterialSupplier {
                cost_per_sqft: 0.0,
                ..sample_new()
            })
            .await
            .unwrap_err();
        assert!(matches!(err, AppError::InvalidInput(_)));
    }

    #[tokio::test]
    async fn create_rejects_negative_min_order() {
        let uc = CreateMaterialSupplierUseCase::new(Arc::new(FakePort::default()));
        let err = uc
            .execute(NewMaterialSupplier {
                minimum_order_sqft: Some(-1.0),
                ..sample_new()
            })
            .await
            .unwrap_err();
        assert!(matches!(err, AppError::InvalidInput(_)));
    }

    #[tokio::test]
    async fn create_rejects_expiration_before_effective() {
        let uc = CreateMaterialSupplierUseCase::new(Arc::new(FakePort::default()));
        let err = uc
            .execute(NewMaterialSupplier {
                effective_date: Some("2026-06-01".into()),
                expiration_date: Some("2026-05-01".into()),
                ..sample_new()
            })
            .await
            .unwrap_err();
        assert!(matches!(err, AppError::InvalidInput(_)));
    }

    #[tokio::test]
    async fn create_happy_path_returns_row() {
        let uc = CreateMaterialSupplierUseCase::new(Arc::new(FakePort::default()));
        let ms = uc.execute(sample_new()).await.unwrap();
        assert_eq!(ms.cost_per_sqft, 3.15);
    }

    #[tokio::test]
    async fn create_duplicate_maps_to_conflict() {
        let port = Arc::new(FakePort::default());
        *port.duplicate.lock().unwrap() = true;
        let uc = CreateMaterialSupplierUseCase::new(port);
        let err = uc.execute(sample_new()).await.unwrap_err();
        match err {
            AppError::Conflict(code) => assert_eq!(code, "DUPLICATE_PAIR"),
            other => panic!("expected Conflict, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn delete_missing_returns_not_found() {
        let uc = DeleteMaterialSupplierUseCase::new(Arc::new(FakePort::default()));
        let err = uc
            .execute(MaterialSupplierId("nope".into()))
            .await
            .unwrap_err();
        assert!(matches!(err, AppError::NotFound));
    }
}
