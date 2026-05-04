//! Material-type port + CRUD use cases.
//!
//! Master data — the simplest aggregate in S3b's inventory pipeline.
//! Every roll points at one; every material_suppliers row too. The
//! port is defined here; `rf-supabase::material_types` implements it
//! against PostgREST.

use std::sync::Arc;

use async_trait::async_trait;
use rf_domain::{MaterialType, MaterialTypeId};

use crate::error::AppError;

/// Request shape for creating a material type. Matches the HTTP
/// body the handler accepts after validation.
#[derive(Debug, Clone)]
pub struct NewMaterialType {
    pub name: String,
    pub description: Option<String>,
    pub default_cost: Option<f64>,
    pub min_stock_alert: Option<f64>,
}

/// Patch shape — every field optional. Current TS code always sends
/// a full replacement, but modelling the update as a patch gives us
/// room to move to PATCH semantics without breaking the port.
#[derive(Debug, Clone, Default)]
pub struct MaterialTypeUpdate {
    pub name: Option<String>,
    pub description: Option<Option<String>>,
    pub default_cost: Option<Option<f64>>,
    pub min_stock_alert: Option<Option<f64>>,
}

#[async_trait]
pub trait MaterialTypePort: Send + Sync {
    async fn list(&self) -> Result<Vec<MaterialType>, AppError>;

    async fn get(&self, id: &MaterialTypeId) -> Result<Option<MaterialType>, AppError>;

    async fn create(&self, new: &NewMaterialType) -> Result<MaterialType, AppError>;

    async fn update(
        &self,
        id: &MaterialTypeId,
        patch: &MaterialTypeUpdate,
    ) -> Result<Option<MaterialType>, AppError>;

    async fn delete(&self, id: &MaterialTypeId) -> Result<bool, AppError>;
}

fn validate_name(name: &str) -> Result<(), AppError> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(AppError::InvalidInput("name must not be blank".into()));
    }
    if trimmed.len() > 100 {
        // Matches the column's VARCHAR(100) constraint — catch it
        // before Postgres does so the error is actionable.
        return Err(AppError::InvalidInput(
            "name must be 100 chars or fewer".into(),
        ));
    }
    Ok(())
}

fn validate_non_negative_cost(value: Option<f64>, field: &str) -> Result<(), AppError> {
    if let Some(v) = value {
        if !v.is_finite() || v < 0.0 {
            return Err(AppError::InvalidInput(format!(
                "{field} must be a finite non-negative number"
            )));
        }
    }
    Ok(())
}

#[derive(Clone)]
pub struct ListMaterialTypesUseCase {
    port: Arc<dyn MaterialTypePort>,
}

impl ListMaterialTypesUseCase {
    pub fn new(port: Arc<dyn MaterialTypePort>) -> Self {
        Self { port }
    }

    pub async fn execute(&self) -> Result<Vec<MaterialType>, AppError> {
        self.port.list().await
    }
}

#[derive(Clone)]
pub struct GetMaterialTypeUseCase {
    port: Arc<dyn MaterialTypePort>,
}

impl GetMaterialTypeUseCase {
    pub fn new(port: Arc<dyn MaterialTypePort>) -> Self {
        Self { port }
    }

    pub async fn execute(&self, id: MaterialTypeId) -> Result<MaterialType, AppError> {
        match self.port.get(&id).await? {
            Some(mt) => Ok(mt),
            None => Err(AppError::NotFound),
        }
    }
}

#[derive(Clone)]
pub struct CreateMaterialTypeUseCase {
    port: Arc<dyn MaterialTypePort>,
}

impl CreateMaterialTypeUseCase {
    pub fn new(port: Arc<dyn MaterialTypePort>) -> Self {
        Self { port }
    }

    pub async fn execute(&self, mut new: NewMaterialType) -> Result<MaterialType, AppError> {
        validate_name(&new.name)?;
        new.name = new.name.trim().to_string();
        validate_non_negative_cost(new.default_cost, "default_cost")?;
        validate_non_negative_cost(new.min_stock_alert, "min_stock_alert")?;
        self.port.create(&new).await
    }
}

#[derive(Clone)]
pub struct UpdateMaterialTypeUseCase {
    port: Arc<dyn MaterialTypePort>,
}

impl UpdateMaterialTypeUseCase {
    pub fn new(port: Arc<dyn MaterialTypePort>) -> Self {
        Self { port }
    }

    pub async fn execute(
        &self,
        id: MaterialTypeId,
        mut patch: MaterialTypeUpdate,
    ) -> Result<MaterialType, AppError> {
        if let Some(name) = patch.name.as_deref() {
            validate_name(name)?;
            patch.name = Some(name.trim().to_string());
        }
        if let Some(Some(v)) = patch.default_cost {
            validate_non_negative_cost(Some(v), "default_cost")?;
        }
        if let Some(Some(v)) = patch.min_stock_alert {
            validate_non_negative_cost(Some(v), "min_stock_alert")?;
        }
        match self.port.update(&id, &patch).await? {
            Some(mt) => Ok(mt),
            None => Err(AppError::NotFound),
        }
    }
}

#[derive(Clone)]
pub struct DeleteMaterialTypeUseCase {
    port: Arc<dyn MaterialTypePort>,
}

impl DeleteMaterialTypeUseCase {
    pub fn new(port: Arc<dyn MaterialTypePort>) -> Self {
        Self { port }
    }

    pub async fn execute(&self, id: MaterialTypeId) -> Result<(), AppError> {
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
        by_id: Mutex<Vec<MaterialType>>,
        next_id: Mutex<u32>,
        duplicate_name: Mutex<bool>,
        not_found: Mutex<bool>,
    }

    impl FakePort {
        fn mint(&self, new: &NewMaterialType) -> MaterialType {
            let mut n = self.next_id.lock().unwrap();
            *n += 1;
            MaterialType {
                id: MaterialTypeId(format!("mt-{}", *n)),
                name: new.name.clone(),
                description: new.description.clone(),
                default_cost: new.default_cost,
                min_stock_alert: new.min_stock_alert,
                created_at: Some("2026-04-19T00:00:00Z".into()),
                updated_at: Some("2026-04-19T00:00:00Z".into()),
            }
        }
    }

    #[async_trait]
    impl MaterialTypePort for FakePort {
        async fn list(&self) -> Result<Vec<MaterialType>, AppError> {
            Ok(self.by_id.lock().unwrap().clone())
        }
        async fn get(&self, id: &MaterialTypeId) -> Result<Option<MaterialType>, AppError> {
            Ok(self
                .by_id
                .lock()
                .unwrap()
                .iter()
                .find(|m| m.id == *id)
                .cloned())
        }
        async fn create(&self, new: &NewMaterialType) -> Result<MaterialType, AppError> {
            if *self.duplicate_name.lock().unwrap() {
                return Err(AppError::conflict("DUPLICATE_NAME"));
            }
            let mt = self.mint(new);
            self.by_id.lock().unwrap().push(mt.clone());
            Ok(mt)
        }
        async fn update(
            &self,
            id: &MaterialTypeId,
            patch: &MaterialTypeUpdate,
        ) -> Result<Option<MaterialType>, AppError> {
            if *self.not_found.lock().unwrap() {
                return Ok(None);
            }
            let mut guard = self.by_id.lock().unwrap();
            for mt in guard.iter_mut() {
                if mt.id == *id {
                    if let Some(name) = patch.name.clone() {
                        mt.name = name;
                    }
                    if let Some(desc) = patch.description.clone() {
                        mt.description = desc;
                    }
                    if let Some(cost) = patch.default_cost {
                        mt.default_cost = cost;
                    }
                    if let Some(msa) = patch.min_stock_alert {
                        mt.min_stock_alert = msa;
                    }
                    return Ok(Some(mt.clone()));
                }
            }
            Ok(None)
        }
        async fn delete(&self, id: &MaterialTypeId) -> Result<bool, AppError> {
            let mut guard = self.by_id.lock().unwrap();
            let len = guard.len();
            guard.retain(|m| m.id != *id);
            Ok(guard.len() != len)
        }
    }

    #[tokio::test]
    async fn create_rejects_blank_name() {
        let uc = CreateMaterialTypeUseCase::new(Arc::new(FakePort::default()));
        let err = uc
            .execute(NewMaterialType {
                name: "   ".into(),
                description: None,
                default_cost: None,
                min_stock_alert: None,
            })
            .await
            .unwrap_err();
        assert!(matches!(err, AppError::InvalidInput(_)), "got {err:?}");
    }

    #[tokio::test]
    async fn create_rejects_negative_cost() {
        let uc = CreateMaterialTypeUseCase::new(Arc::new(FakePort::default()));
        let err = uc
            .execute(NewMaterialType {
                name: "Neoprene".into(),
                description: None,
                default_cost: Some(-0.01),
                min_stock_alert: None,
            })
            .await
            .unwrap_err();
        assert!(matches!(err, AppError::InvalidInput(_)), "got {err:?}");
    }

    #[tokio::test]
    async fn create_trims_name() {
        let port = Arc::new(FakePort::default());
        let uc = CreateMaterialTypeUseCase::new(port.clone());
        let mt = uc
            .execute(NewMaterialType {
                name: "  Neoprene  ".into(),
                description: None,
                default_cost: Some(4.5),
                min_stock_alert: None,
            })
            .await
            .unwrap();
        assert_eq!(mt.name, "Neoprene");
    }

    #[tokio::test]
    async fn create_surfaces_duplicate_name_as_conflict() {
        let port = Arc::new(FakePort::default());
        *port.duplicate_name.lock().unwrap() = true;
        let uc = CreateMaterialTypeUseCase::new(port);
        let err = uc
            .execute(NewMaterialType {
                name: "Neoprene".into(),
                description: None,
                default_cost: None,
                min_stock_alert: None,
            })
            .await
            .unwrap_err();
        match err {
            AppError::Conflict(code) => assert_eq!(code, "DUPLICATE_NAME"),
            other => panic!("expected Conflict, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn get_maps_none_to_not_found() {
        let port = Arc::new(FakePort::default());
        let uc = GetMaterialTypeUseCase::new(port);
        let err = uc
            .execute(MaterialTypeId("missing".into()))
            .await
            .unwrap_err();
        assert!(matches!(err, AppError::NotFound));
    }

    #[tokio::test]
    async fn update_maps_none_to_not_found() {
        let port = Arc::new(FakePort::default());
        *port.not_found.lock().unwrap() = true;
        let uc = UpdateMaterialTypeUseCase::new(port);
        let err = uc
            .execute(
                MaterialTypeId("gone".into()),
                MaterialTypeUpdate {
                    name: Some("x".into()),
                    ..Default::default()
                },
            )
            .await
            .unwrap_err();
        assert!(matches!(err, AppError::NotFound));
    }

    #[tokio::test]
    async fn delete_maps_missing_to_not_found() {
        let port = Arc::new(FakePort::default());
        let uc = DeleteMaterialTypeUseCase::new(port);
        let err = uc.execute(MaterialTypeId("gone".into())).await.unwrap_err();
        assert!(matches!(err, AppError::NotFound));
    }

    #[tokio::test]
    async fn list_returns_all() {
        let port = Arc::new(FakePort::default());
        let create = CreateMaterialTypeUseCase::new(port.clone());
        for n in ["Neoprene", "EPDM", "Silicone"] {
            create
                .execute(NewMaterialType {
                    name: n.into(),
                    description: None,
                    default_cost: None,
                    min_stock_alert: None,
                })
                .await
                .unwrap();
        }
        let list = ListMaterialTypesUseCase::new(port);
        let all = list.execute().await.unwrap();
        assert_eq!(all.len(), 3);
    }
}
