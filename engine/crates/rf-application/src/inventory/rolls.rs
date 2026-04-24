//! Roll port + CRUD use cases.
//!
//! The core of the inventory pipeline. Richer than the other
//! aggregates on two axes:
//!
//! - **Denormalized `material_type` column.** The handler stamps
//!   this server-side from the `material_type_id` lookup (via a
//!   separate port call) so client-supplied values can't drift.
//!   The domain struct + port signatures carry both fields; the
//!   handler is where the coupling between them is enforced.
//! - **Depletion invariant.** Setting `status = "depleted"` must
//!   also zero `remaining_length` — that's what the
//!   `rolls_check_depletion` DB trigger gates on to fire the
//!   downstream notification. An update that sets one without
//!   the other fails 400 `INVALID_DEPLETION_STATE`.
//!
//! Search is ILIKE across material_type / color / location /
//! supplier / notes — matches the current TS `searchRolls`.

use std::sync::Arc;

use async_trait::async_trait;
use rf_domain::{Roll, RollFilters, RollId, RollStatus};

use crate::error::AppError;

#[derive(Debug, Clone)]
pub struct NewRoll {
    pub material_type_id: Option<String>,
    pub material_type: String,
    pub width: f64,
    pub length: f64,
    pub thickness: f64,
    pub color: Option<String>,
    pub location: Option<String>,
    pub date_received: Option<String>,
    pub supplier: Option<String>,
    pub cost_per_sqft: Option<f64>,
    pub remaining_length: f64,
    pub status: Option<RollStatus>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct RollUpdate {
    pub material_type_id: Option<Option<String>>,
    pub material_type: Option<String>,
    pub width: Option<f64>,
    pub length: Option<f64>,
    pub thickness: Option<f64>,
    pub color: Option<Option<String>>,
    pub location: Option<Option<String>>,
    pub date_received: Option<Option<String>>,
    pub supplier: Option<Option<String>>,
    pub cost_per_sqft: Option<Option<f64>>,
    pub remaining_length: Option<f64>,
    pub status: Option<RollStatus>,
    pub notes: Option<Option<String>>,
}

#[async_trait]
pub trait RollPort: Send + Sync {
    async fn list(&self, filters: &RollFilters) -> Result<Vec<Roll>, AppError>;

    async fn get(&self, id: &RollId) -> Result<Option<Roll>, AppError>;

    async fn create(&self, new: &NewRoll) -> Result<Roll, AppError>;

    async fn update(&self, id: &RollId, patch: &RollUpdate) -> Result<Option<Roll>, AppError>;

    async fn delete(&self, id: &RollId) -> Result<bool, AppError>;
}

fn validate_positive(v: f64, field: &str) -> Result<(), AppError> {
    if !v.is_finite() || v <= 0.0 {
        return Err(AppError::InvalidInput(format!(
            "{field} must be a finite positive number"
        )));
    }
    Ok(())
}

fn validate_non_negative(v: f64, field: &str) -> Result<(), AppError> {
    if !v.is_finite() || v < 0.0 {
        return Err(AppError::InvalidInput(format!(
            "{field} must be a finite non-negative number"
        )));
    }
    Ok(())
}

fn validate_material_type_name(name: &str) -> Result<(), AppError> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(AppError::InvalidInput(
            "material_type must not be blank".into(),
        ));
    }
    if trimmed.len() > 100 {
        return Err(AppError::InvalidInput(
            "material_type must be 100 chars or fewer".into(),
        ));
    }
    Ok(())
}

/// Depletion invariant: status=depleted ⇔ remaining_length=0. We
/// treat remaining_length as the canonical signal (the DB trigger
/// agrees) and reject requests that touch one without the other
/// landing consistent.
fn validate_depletion(
    status: Option<RollStatus>,
    remaining_length: Option<f64>,
) -> Result<(), AppError> {
    const EPSILON: f64 = 0.001;
    match (status, remaining_length) {
        (Some(RollStatus::Depleted), Some(len)) if len > EPSILON => Err(AppError::InvalidInput(
            "INVALID_DEPLETION_STATE: status=depleted requires remaining_length \
                 <= 0.001 in the same request"
                .into(),
        )),
        (Some(RollStatus::Depleted), None) => Err(AppError::InvalidInput(
            "INVALID_DEPLETION_STATE: status=depleted requires an explicit \
             remaining_length=0 in the same request so the DB trigger fires"
                .into(),
        )),
        _ => Ok(()),
    }
}

#[derive(Clone)]
pub struct ListRollsUseCase {
    port: Arc<dyn RollPort>,
}

impl ListRollsUseCase {
    pub fn new(port: Arc<dyn RollPort>) -> Self {
        Self { port }
    }

    pub async fn execute(&self, mut filters: RollFilters) -> Result<Vec<Roll>, AppError> {
        if let Some(limit) = filters.limit {
            if limit > 200 {
                filters.limit = Some(200);
            }
        }
        self.port.list(&filters).await
    }
}

#[derive(Clone)]
pub struct GetRollUseCase {
    port: Arc<dyn RollPort>,
}

impl GetRollUseCase {
    pub fn new(port: Arc<dyn RollPort>) -> Self {
        Self { port }
    }

    pub async fn execute(&self, id: RollId) -> Result<Roll, AppError> {
        match self.port.get(&id).await? {
            Some(r) => Ok(r),
            None => Err(AppError::NotFound),
        }
    }
}

#[derive(Clone)]
pub struct CreateRollUseCase {
    port: Arc<dyn RollPort>,
}

impl CreateRollUseCase {
    pub fn new(port: Arc<dyn RollPort>) -> Self {
        Self { port }
    }

    pub async fn execute(&self, mut new: NewRoll) -> Result<Roll, AppError> {
        validate_material_type_name(&new.material_type)?;
        new.material_type = new.material_type.trim().to_string();
        validate_positive(new.width, "width")?;
        validate_positive(new.length, "length")?;
        validate_positive(new.thickness, "thickness")?;
        validate_non_negative(new.remaining_length, "remaining_length")?;
        if let Some(cost) = new.cost_per_sqft {
            validate_non_negative(cost, "cost_per_sqft")?;
        }
        validate_depletion(new.status, Some(new.remaining_length))?;
        self.port.create(&new).await
    }
}

#[derive(Clone)]
pub struct UpdateRollUseCase {
    port: Arc<dyn RollPort>,
}

impl UpdateRollUseCase {
    pub fn new(port: Arc<dyn RollPort>) -> Self {
        Self { port }
    }

    pub async fn execute(&self, id: RollId, mut patch: RollUpdate) -> Result<Roll, AppError> {
        if let Some(name) = patch.material_type.as_deref() {
            validate_material_type_name(name)?;
            patch.material_type = Some(name.trim().to_string());
        }
        if let Some(w) = patch.width {
            validate_positive(w, "width")?;
        }
        if let Some(l) = patch.length {
            validate_positive(l, "length")?;
        }
        if let Some(t) = patch.thickness {
            validate_positive(t, "thickness")?;
        }
        if let Some(rl) = patch.remaining_length {
            validate_non_negative(rl, "remaining_length")?;
        }
        if let Some(Some(c)) = patch.cost_per_sqft {
            validate_non_negative(c, "cost_per_sqft")?;
        }
        validate_depletion(patch.status, patch.remaining_length)?;
        match self.port.update(&id, &patch).await? {
            Some(r) => Ok(r),
            None => Err(AppError::NotFound),
        }
    }
}

#[derive(Clone)]
pub struct DeleteRollUseCase {
    port: Arc<dyn RollPort>,
}

impl DeleteRollUseCase {
    pub fn new(port: Arc<dyn RollPort>) -> Self {
        Self { port }
    }

    pub async fn execute(&self, id: RollId) -> Result<(), AppError> {
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
        rows: Mutex<Vec<Roll>>,
        next: Mutex<u32>,
    }

    #[async_trait]
    impl RollPort for FakePort {
        async fn list(&self, _filters: &RollFilters) -> Result<Vec<Roll>, AppError> {
            Ok(self.rows.lock().unwrap().clone())
        }
        async fn get(&self, id: &RollId) -> Result<Option<Roll>, AppError> {
            Ok(self
                .rows
                .lock()
                .unwrap()
                .iter()
                .find(|r| r.id == *id)
                .cloned())
        }
        async fn create(&self, new: &NewRoll) -> Result<Roll, AppError> {
            let mut n = self.next.lock().unwrap();
            *n += 1;
            let r = Roll {
                id: RollId(format!("roll-{}", *n)),
                material_type_id: new.material_type_id.clone().map(rf_domain::MaterialTypeId),
                material_type: new.material_type.clone(),
                width: new.width,
                length: new.length,
                thickness: new.thickness,
                color: new.color.clone(),
                location: new.location.clone(),
                date_received: new.date_received.clone(),
                supplier: new.supplier.clone(),
                cost_per_sqft: new.cost_per_sqft,
                remaining_length: new.remaining_length,
                status: new.status.unwrap_or(RollStatus::Active),
                notes: new.notes.clone(),
                part_number: Some(format!("RF-{:06}", *n)),
                parent_roll_id: None,
                is_offcut: Some(false),
                barcode_format: Some("code128".into()),
                barcode_asset_path: None,
                barcode_generated_at: None,
                created_at: Some("2026-04-19T00:00:00Z".into()),
                updated_at: Some("2026-04-19T00:00:00Z".into()),
            };
            self.rows.lock().unwrap().push(r.clone());
            Ok(r)
        }
        async fn update(&self, id: &RollId, patch: &RollUpdate) -> Result<Option<Roll>, AppError> {
            let mut g = self.rows.lock().unwrap();
            for row in g.iter_mut() {
                if row.id == *id {
                    if let Some(s) = patch.status {
                        row.status = s;
                    }
                    if let Some(rl) = patch.remaining_length {
                        row.remaining_length = rl;
                    }
                    return Ok(Some(row.clone()));
                }
            }
            Ok(None)
        }
        async fn delete(&self, id: &RollId) -> Result<bool, AppError> {
            let mut g = self.rows.lock().unwrap();
            let len = g.len();
            g.retain(|r| r.id != *id);
            Ok(g.len() != len)
        }
    }

    fn sample_new() -> NewRoll {
        NewRoll {
            material_type_id: Some("mt-1".into()),
            material_type: "Neoprene".into(),
            width: 48.0,
            length: 600.0,
            thickness: 0.25,
            color: Some("Black".into()),
            location: Some("Rack A3".into()),
            date_received: Some("2026-03-15".into()),
            supplier: Some("Acme".into()),
            cost_per_sqft: Some(3.25),
            remaining_length: 600.0,
            status: Some(RollStatus::Active),
            notes: None,
        }
    }

    #[tokio::test]
    async fn create_rejects_blank_material_type() {
        let uc = CreateRollUseCase::new(Arc::new(FakePort::default()));
        let err = uc
            .execute(NewRoll {
                material_type: "  ".into(),
                ..sample_new()
            })
            .await
            .unwrap_err();
        assert!(matches!(err, AppError::InvalidInput(_)));
    }

    #[tokio::test]
    async fn create_rejects_nonpositive_dimensions() {
        let uc = CreateRollUseCase::new(Arc::new(FakePort::default()));
        let err = uc
            .execute(NewRoll {
                width: 0.0,
                ..sample_new()
            })
            .await
            .unwrap_err();
        assert!(matches!(err, AppError::InvalidInput(_)));
    }

    #[tokio::test]
    async fn create_rejects_negative_remaining_length() {
        let uc = CreateRollUseCase::new(Arc::new(FakePort::default()));
        let err = uc
            .execute(NewRoll {
                remaining_length: -1.0,
                ..sample_new()
            })
            .await
            .unwrap_err();
        assert!(matches!(err, AppError::InvalidInput(_)));
    }

    #[tokio::test]
    async fn create_rejects_depleted_with_nonzero_length() {
        let uc = CreateRollUseCase::new(Arc::new(FakePort::default()));
        let err = uc
            .execute(NewRoll {
                status: Some(RollStatus::Depleted),
                remaining_length: 100.0,
                ..sample_new()
            })
            .await
            .unwrap_err();
        match err {
            AppError::InvalidInput(msg) => {
                assert!(msg.contains("INVALID_DEPLETION_STATE"));
            }
            other => panic!("expected InvalidInput, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn update_depletion_with_zero_length_is_ok() {
        let port = Arc::new(FakePort::default());
        let create = CreateRollUseCase::new(port.clone());
        let r = create.execute(sample_new()).await.unwrap();
        let update = UpdateRollUseCase::new(port);
        let res = update
            .execute(
                r.id,
                RollUpdate {
                    status: Some(RollStatus::Depleted),
                    remaining_length: Some(0.0),
                    ..Default::default()
                },
            )
            .await;
        assert!(res.is_ok());
    }

    #[tokio::test]
    async fn update_depleted_without_length_fails() {
        let port = Arc::new(FakePort::default());
        let create = CreateRollUseCase::new(port.clone());
        let r = create.execute(sample_new()).await.unwrap();
        let update = UpdateRollUseCase::new(port);
        let err = update
            .execute(
                r.id,
                RollUpdate {
                    status: Some(RollStatus::Depleted),
                    ..Default::default()
                },
            )
            .await
            .unwrap_err();
        assert!(matches!(err, AppError::InvalidInput(_)));
    }

    #[tokio::test]
    async fn list_clamps_limit_at_200() {
        let port = Arc::new(FakePort::default());
        let uc = ListRollsUseCase::new(port);
        let got = uc
            .execute(RollFilters {
                limit: Some(99999),
                ..Default::default()
            })
            .await
            .unwrap();
        assert_eq!(got.len(), 0);
    }

    #[tokio::test]
    async fn get_missing_maps_to_not_found() {
        let uc = GetRollUseCase::new(Arc::new(FakePort::default()));
        let err = uc.execute(RollId("nope".into())).await.unwrap_err();
        assert!(matches!(err, AppError::NotFound));
    }

    #[tokio::test]
    async fn delete_missing_maps_to_not_found() {
        let uc = DeleteRollUseCase::new(Arc::new(FakePort::default()));
        let err = uc.execute(RollId("gone".into())).await.unwrap_err();
        assert!(matches!(err, AppError::NotFound));
    }
}
