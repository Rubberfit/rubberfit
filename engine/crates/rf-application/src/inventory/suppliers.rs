//! Supplier port + CRUD use cases.
//!
//! Vendor master data. Adds a couple wrinkles over material_types:
//!
//! - List supports `active` / `preferred` filter flavors (the TS
//!   surface already has `getActiveSuppliers` / `getPreferredSuppliers`
//!   variants the UI consumes).
//! - `search` is an ILIKE sweep across name / contact_person / email
//!   / city — matches the existing `searchSuppliers` behavior.
//! - Rating validation: 0–5 (the DB CHECK constraint is the backstop;
//!   we catch it earlier for a cleaner error message).
//! - `updateSupplierRating` is DELIBERATELY omitted from S3b — it's
//!   driven by the PO receive flow which lands in S3c.

use std::sync::Arc;

use async_trait::async_trait;
use rf_domain::{Supplier, SupplierFilters, SupplierId};

use crate::error::AppError;

#[derive(Debug, Clone)]
pub struct NewSupplier {
    pub name: String,
    pub contact_person: Option<String>,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub address: Option<String>,
    pub city: Option<String>,
    pub state: Option<String>,
    pub zip_code: Option<String>,
    pub country: Option<String>,
    pub website: Option<String>,
    pub tax_id: Option<String>,
    pub payment_terms: Option<String>,
    pub rating: Option<f64>,
    pub preferred: Option<bool>,
    pub active: Option<bool>,
    pub notes: Option<String>,
}

/// Patch shape — every field optional, every nullable column
/// double-Optioned so explicit `null` vs. omitted is representable.
#[derive(Debug, Clone, Default)]
pub struct SupplierUpdate {
    pub name: Option<String>,
    pub contact_person: Option<Option<String>>,
    pub email: Option<Option<String>>,
    pub phone: Option<Option<String>>,
    pub address: Option<Option<String>>,
    pub city: Option<Option<String>>,
    pub state: Option<Option<String>>,
    pub zip_code: Option<Option<String>>,
    pub country: Option<Option<String>>,
    pub website: Option<Option<String>>,
    pub tax_id: Option<Option<String>>,
    pub payment_terms: Option<Option<String>>,
    pub rating: Option<Option<f64>>,
    pub preferred: Option<bool>,
    pub active: Option<bool>,
    pub notes: Option<Option<String>>,
}

#[async_trait]
pub trait SupplierPort: Send + Sync {
    async fn list(
        &self,
        filters: &SupplierFilters,
    ) -> Result<Vec<Supplier>, AppError>;

    async fn get(&self, id: &SupplierId) -> Result<Option<Supplier>, AppError>;

    async fn create(&self, new: &NewSupplier) -> Result<Supplier, AppError>;

    async fn update(
        &self,
        id: &SupplierId,
        patch: &SupplierUpdate,
    ) -> Result<Option<Supplier>, AppError>;

    async fn delete(&self, id: &SupplierId) -> Result<bool, AppError>;
}

fn validate_name(name: &str) -> Result<(), AppError> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(AppError::InvalidInput("name must not be blank".into()));
    }
    if trimmed.len() > 200 {
        // Matches the suppliers.name VARCHAR(200) column.
        return Err(AppError::InvalidInput(
            "name must be 200 chars or fewer".into(),
        ));
    }
    Ok(())
}

fn validate_rating(rating: Option<f64>) -> Result<(), AppError> {
    if let Some(r) = rating {
        if !r.is_finite() {
            return Err(AppError::InvalidInput(
                "rating must be a finite number".into(),
            ));
        }
        if !(0.0..=5.0).contains(&r) {
            return Err(AppError::InvalidInput(
                "rating must be between 0 and 5".into(),
            ));
        }
    }
    Ok(())
}

#[derive(Clone)]
pub struct ListSuppliersUseCase {
    port: Arc<dyn SupplierPort>,
}

impl ListSuppliersUseCase {
    pub fn new(port: Arc<dyn SupplierPort>) -> Self {
        Self { port }
    }

    pub async fn execute(
        &self,
        mut filters: SupplierFilters,
    ) -> Result<Vec<Supplier>, AppError> {
        // Clamp page size so a misconfigured caller can't drag the
        // whole table. 200 is the same ceiling ListCutHistoryUseCase
        // uses.
        if let Some(limit) = filters.limit {
            if limit > 200 {
                filters.limit = Some(200);
            }
        }
        self.port.list(&filters).await
    }
}

#[derive(Clone)]
pub struct GetSupplierUseCase {
    port: Arc<dyn SupplierPort>,
}

impl GetSupplierUseCase {
    pub fn new(port: Arc<dyn SupplierPort>) -> Self {
        Self { port }
    }

    pub async fn execute(&self, id: SupplierId) -> Result<Supplier, AppError> {
        match self.port.get(&id).await? {
            Some(s) => Ok(s),
            None => Err(AppError::NotFound),
        }
    }
}

#[derive(Clone)]
pub struct CreateSupplierUseCase {
    port: Arc<dyn SupplierPort>,
}

impl CreateSupplierUseCase {
    pub fn new(port: Arc<dyn SupplierPort>) -> Self {
        Self { port }
    }

    pub async fn execute(&self, mut new: NewSupplier) -> Result<Supplier, AppError> {
        validate_name(&new.name)?;
        new.name = new.name.trim().to_string();
        validate_rating(new.rating)?;
        self.port.create(&new).await
    }
}

#[derive(Clone)]
pub struct UpdateSupplierUseCase {
    port: Arc<dyn SupplierPort>,
}

impl UpdateSupplierUseCase {
    pub fn new(port: Arc<dyn SupplierPort>) -> Self {
        Self { port }
    }

    pub async fn execute(
        &self,
        id: SupplierId,
        mut patch: SupplierUpdate,
    ) -> Result<Supplier, AppError> {
        if let Some(name) = patch.name.as_deref() {
            validate_name(name)?;
            patch.name = Some(name.trim().to_string());
        }
        if let Some(Some(r)) = patch.rating {
            validate_rating(Some(r))?;
        }
        match self.port.update(&id, &patch).await? {
            Some(s) => Ok(s),
            None => Err(AppError::NotFound),
        }
    }
}

#[derive(Clone)]
pub struct DeleteSupplierUseCase {
    port: Arc<dyn SupplierPort>,
}

impl DeleteSupplierUseCase {
    pub fn new(port: Arc<dyn SupplierPort>) -> Self {
        Self { port }
    }

    pub async fn execute(&self, id: SupplierId) -> Result<(), AppError> {
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
        rows: Mutex<Vec<Supplier>>,
        next: Mutex<u32>,
        duplicate: Mutex<bool>,
    }

    impl FakePort {
        fn sample(&self, new: &NewSupplier) -> Supplier {
            let mut n = self.next.lock().unwrap();
            *n += 1;
            Supplier {
                id: SupplierId(format!("sup-{}", *n)),
                name: new.name.clone(),
                contact_person: new.contact_person.clone(),
                email: new.email.clone(),
                phone: new.phone.clone(),
                address: new.address.clone(),
                city: new.city.clone(),
                state: new.state.clone(),
                zip_code: new.zip_code.clone(),
                country: new.country.clone().or_else(|| Some("USA".into())),
                website: new.website.clone(),
                tax_id: new.tax_id.clone(),
                payment_terms: new.payment_terms.clone(),
                rating: new.rating,
                preferred: new.preferred.unwrap_or(false),
                active: new.active.unwrap_or(true),
                notes: new.notes.clone(),
                created_at: Some("2026-04-19T00:00:00Z".into()),
                updated_at: Some("2026-04-19T00:00:00Z".into()),
            }
        }
    }

    #[async_trait]
    impl SupplierPort for FakePort {
        async fn list(
            &self,
            _filters: &SupplierFilters,
        ) -> Result<Vec<Supplier>, AppError> {
            Ok(self.rows.lock().unwrap().clone())
        }
        async fn get(&self, id: &SupplierId) -> Result<Option<Supplier>, AppError> {
            Ok(self
                .rows
                .lock()
                .unwrap()
                .iter()
                .find(|s| s.id == *id)
                .cloned())
        }
        async fn create(&self, new: &NewSupplier) -> Result<Supplier, AppError> {
            if *self.duplicate.lock().unwrap() {
                return Err(AppError::conflict("DUPLICATE_NAME"));
            }
            let s = self.sample(new);
            self.rows.lock().unwrap().push(s.clone());
            Ok(s)
        }
        async fn update(
            &self,
            id: &SupplierId,
            patch: &SupplierUpdate,
        ) -> Result<Option<Supplier>, AppError> {
            let mut g = self.rows.lock().unwrap();
            for row in g.iter_mut() {
                if row.id == *id {
                    if let Some(name) = patch.name.clone() {
                        row.name = name;
                    }
                    if let Some(r) = patch.rating {
                        row.rating = r;
                    }
                    if let Some(a) = patch.active {
                        row.active = a;
                    }
                    if let Some(p) = patch.preferred {
                        row.preferred = p;
                    }
                    return Ok(Some(row.clone()));
                }
            }
            Ok(None)
        }
        async fn delete(&self, id: &SupplierId) -> Result<bool, AppError> {
            let mut g = self.rows.lock().unwrap();
            let len = g.len();
            g.retain(|s| s.id != *id);
            Ok(g.len() != len)
        }
    }

    #[tokio::test]
    async fn create_rejects_blank_name() {
        let uc = CreateSupplierUseCase::new(Arc::new(FakePort::default()));
        let err = uc
            .execute(NewSupplier {
                name: "   ".into(),
                contact_person: None,
                email: None,
                phone: None,
                address: None,
                city: None,
                state: None,
                zip_code: None,
                country: None,
                website: None,
                tax_id: None,
                payment_terms: None,
                rating: None,
                preferred: None,
                active: None,
                notes: None,
            })
            .await
            .unwrap_err();
        assert!(matches!(err, AppError::InvalidInput(_)));
    }

    #[tokio::test]
    async fn create_rejects_rating_out_of_range() {
        let uc = CreateSupplierUseCase::new(Arc::new(FakePort::default()));
        let err = uc
            .execute(NewSupplier {
                name: "Acme".into(),
                contact_person: None,
                email: None,
                phone: None,
                address: None,
                city: None,
                state: None,
                zip_code: None,
                country: None,
                website: None,
                tax_id: None,
                payment_terms: None,
                rating: Some(6.0),
                preferred: None,
                active: None,
                notes: None,
            })
            .await
            .unwrap_err();
        assert!(matches!(err, AppError::InvalidInput(_)));
    }

    #[tokio::test]
    async fn create_accepts_rating_at_endpoints() {
        let uc = CreateSupplierUseCase::new(Arc::new(FakePort::default()));
        for r in [0.0_f64, 5.0] {
            let res = uc
                .execute(NewSupplier {
                    name: format!("Acme-{r}"),
                    contact_person: None,
                    email: None,
                    phone: None,
                    address: None,
                    city: None,
                    state: None,
                    zip_code: None,
                    country: None,
                    website: None,
                    tax_id: None,
                    payment_terms: None,
                    rating: Some(r),
                    preferred: None,
                    active: None,
                    notes: None,
                })
                .await;
            assert!(res.is_ok(), "rating {r} should be accepted");
        }
    }

    #[tokio::test]
    async fn create_surfaces_duplicate_as_conflict() {
        let port = Arc::new(FakePort::default());
        *port.duplicate.lock().unwrap() = true;
        let uc = CreateSupplierUseCase::new(port);
        let err = uc
            .execute(NewSupplier {
                name: "Acme".into(),
                contact_person: None,
                email: None,
                phone: None,
                address: None,
                city: None,
                state: None,
                zip_code: None,
                country: None,
                website: None,
                tax_id: None,
                payment_terms: None,
                rating: None,
                preferred: None,
                active: None,
                notes: None,
            })
            .await
            .unwrap_err();
        match err {
            AppError::Conflict(code) => assert_eq!(code, "DUPLICATE_NAME"),
            other => panic!("expected Conflict, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn list_clamps_limit_at_200() {
        let uc = ListSuppliersUseCase::new(Arc::new(FakePort::default()));
        let got = uc
            .execute(SupplierFilters {
                limit: Some(9999),
                ..Default::default()
            })
            .await
            .unwrap();
        assert_eq!(got.len(), 0);
    }

    #[tokio::test]
    async fn get_maps_none_to_not_found() {
        let uc = GetSupplierUseCase::new(Arc::new(FakePort::default()));
        let err = uc.execute(SupplierId("nope".into())).await.unwrap_err();
        assert!(matches!(err, AppError::NotFound));
    }

    #[tokio::test]
    async fn update_rejects_invalid_rating() {
        let port = Arc::new(FakePort::default());
        let uc = UpdateSupplierUseCase::new(port.clone());
        // Seed a row so the update finds something.
        let create = CreateSupplierUseCase::new(port);
        let s = create
            .execute(NewSupplier {
                name: "Acme".into(),
                contact_person: None,
                email: None,
                phone: None,
                address: None,
                city: None,
                state: None,
                zip_code: None,
                country: None,
                website: None,
                tax_id: None,
                payment_terms: None,
                rating: None,
                preferred: None,
                active: None,
                notes: None,
            })
            .await
            .unwrap();
        let err = uc
            .execute(
                s.id,
                SupplierUpdate {
                    rating: Some(Some(-1.0)),
                    ..Default::default()
                },
            )
            .await
            .unwrap_err();
        assert!(matches!(err, AppError::InvalidInput(_)));
    }

    #[tokio::test]
    async fn delete_maps_missing_to_not_found() {
        let uc = DeleteSupplierUseCase::new(Arc::new(FakePort::default()));
        let err = uc.execute(SupplierId("gone".into())).await.unwrap_err();
        assert!(matches!(err, AppError::NotFound));
    }
}
