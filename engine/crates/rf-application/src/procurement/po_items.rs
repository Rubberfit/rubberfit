//! PurchaseOrderItem port + CRUD use cases (S3c Task 2).
//!
//! Line items for a purchase order. Separate aggregate from the PO
//! header because:
//!
//! - The receive flow in Task 5 needs item-level writes under a
//!   different atomicity story (transactional RPC vs. per-row PATCH).
//! - Adding / removing items happens often during PO drafting — the
//!   UI table has per-row buttons that would otherwise need to round-
//!   trip the whole PO + items shape.
//!
//! Line_total / PO subtotal / PO total_amount are populated by the
//! existing DB triggers. Rust writes the raw inputs (quantity_sqft +
//! unit_cost) and reads the trigger-populated row back via
//! `Prefer: return=representation` at the adapter.

use std::sync::Arc;

use async_trait::async_trait;
use rf_domain::{MaterialTypeId, PurchaseOrderId, PurchaseOrderItem, PurchaseOrderItemId};

use crate::error::AppError;

/// Request shape for adding a line item. `line_number` is assigned
/// by the use case (max(existing) + 1) so concurrent adds don't
/// conflict on the UNIQUE(purchase_order_id, line_number) constraint
/// — the service layer owns that, not the client.
#[derive(Debug, Clone)]
pub struct NewPurchaseOrderItem {
    pub material_type_id: MaterialTypeId,
    pub description: String,
    pub width: Option<f64>,
    pub length: Option<f64>,
    pub thickness: Option<f64>,
    pub color: Option<String>,
    pub quantity_sqft: f64,
    pub unit_cost: f64,
    pub notes: Option<String>,
}

/// Patch shape for a line item.
///
/// `quantity_received` + `received_date` are **deliberately omitted**
/// from this patch — those fields are receive-flow-only (Task 5's
/// transactional RPC is the sole writer). Keeping them off this
/// struct prevents the handler from offering a silent bypass of the
/// receive RPC's roll-creation + date-stamping guarantees.
#[derive(Debug, Clone, Default)]
pub struct PurchaseOrderItemUpdate {
    pub material_type_id: Option<MaterialTypeId>,
    pub description: Option<String>,
    pub width: Option<Option<f64>>,
    pub length: Option<Option<f64>>,
    pub thickness: Option<Option<f64>>,
    pub color: Option<Option<String>>,
    pub quantity_sqft: Option<f64>,
    pub unit_cost: Option<f64>,
    pub notes: Option<Option<String>>,
}

#[async_trait]
pub trait PurchaseOrderItemPort: Send + Sync {
    async fn list_for_po(
        &self,
        po_id: &PurchaseOrderId,
    ) -> Result<Vec<PurchaseOrderItem>, AppError>;

    async fn get(
        &self,
        id: &PurchaseOrderItemId,
    ) -> Result<Option<PurchaseOrderItem>, AppError>;

    /// Create a line item. The adapter computes the next
    /// `line_number` inside a single-statement upsert (or a single
    /// round-trip after the max query) so the allocation stays
    /// consistent with the UNIQUE constraint.
    async fn create(
        &self,
        po_id: &PurchaseOrderId,
        new: &NewPurchaseOrderItem,
    ) -> Result<PurchaseOrderItem, AppError>;

    async fn update(
        &self,
        id: &PurchaseOrderItemId,
        patch: &PurchaseOrderItemUpdate,
    ) -> Result<Option<PurchaseOrderItem>, AppError>;

    async fn delete(&self, id: &PurchaseOrderItemId) -> Result<bool, AppError>;
}

fn validate_positive(v: f64, field: &str) -> Result<(), AppError> {
    if !v.is_finite() || v <= 0.0 {
        return Err(AppError::InvalidInput(format!(
            "{field} must be a finite positive number"
        )));
    }
    Ok(())
}

fn validate_positive_opt(v: Option<f64>, field: &str) -> Result<(), AppError> {
    if let Some(value) = v {
        validate_positive(value, field)?;
    }
    Ok(())
}

fn validate_description(description: &str) -> Result<(), AppError> {
    let trimmed = description.trim();
    if trimmed.is_empty() {
        return Err(AppError::InvalidInput("description must not be blank".into()));
    }
    Ok(())
}

#[derive(Clone)]
pub struct ListPurchaseOrderItemsUseCase {
    port: Arc<dyn PurchaseOrderItemPort>,
}

impl ListPurchaseOrderItemsUseCase {
    pub fn new(port: Arc<dyn PurchaseOrderItemPort>) -> Self {
        Self { port }
    }

    pub async fn execute(
        &self,
        po_id: PurchaseOrderId,
    ) -> Result<Vec<PurchaseOrderItem>, AppError> {
        self.port.list_for_po(&po_id).await
    }
}

#[derive(Clone)]
pub struct AddPurchaseOrderItemUseCase {
    port: Arc<dyn PurchaseOrderItemPort>,
}

impl AddPurchaseOrderItemUseCase {
    pub fn new(port: Arc<dyn PurchaseOrderItemPort>) -> Self {
        Self { port }
    }

    pub async fn execute(
        &self,
        po_id: PurchaseOrderId,
        mut new: NewPurchaseOrderItem,
    ) -> Result<PurchaseOrderItem, AppError> {
        validate_description(&new.description)?;
        new.description = new.description.trim().to_string();
        validate_positive(new.quantity_sqft, "quantity_sqft")?;
        validate_positive(new.unit_cost, "unit_cost")?;
        validate_positive_opt(new.width, "width")?;
        validate_positive_opt(new.length, "length")?;
        validate_positive_opt(new.thickness, "thickness")?;
        if new.material_type_id.0.trim().is_empty() {
            return Err(AppError::InvalidInput(
                "material_type_id is required".into(),
            ));
        }
        self.port.create(&po_id, &new).await
    }
}

#[derive(Clone)]
pub struct UpdatePurchaseOrderItemUseCase {
    port: Arc<dyn PurchaseOrderItemPort>,
}

impl UpdatePurchaseOrderItemUseCase {
    pub fn new(port: Arc<dyn PurchaseOrderItemPort>) -> Self {
        Self { port }
    }

    pub async fn execute(
        &self,
        id: PurchaseOrderItemId,
        mut patch: PurchaseOrderItemUpdate,
    ) -> Result<PurchaseOrderItem, AppError> {
        if let Some(desc) = patch.description.as_deref() {
            validate_description(desc)?;
            patch.description = Some(desc.trim().to_string());
        }
        validate_positive_opt(patch.quantity_sqft, "quantity_sqft")?;
        validate_positive_opt(patch.unit_cost, "unit_cost")?;
        if let Some(Some(w)) = patch.width {
            validate_positive(w, "width")?;
        }
        if let Some(Some(l)) = patch.length {
            validate_positive(l, "length")?;
        }
        if let Some(Some(t)) = patch.thickness {
            validate_positive(t, "thickness")?;
        }
        match self.port.update(&id, &patch).await? {
            Some(item) => Ok(item),
            None => Err(AppError::NotFound),
        }
    }
}

#[derive(Clone)]
pub struct DeletePurchaseOrderItemUseCase {
    port: Arc<dyn PurchaseOrderItemPort>,
}

impl DeletePurchaseOrderItemUseCase {
    pub fn new(port: Arc<dyn PurchaseOrderItemPort>) -> Self {
        Self { port }
    }

    pub async fn execute(&self, id: PurchaseOrderItemId) -> Result<(), AppError> {
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
        items: Mutex<Vec<PurchaseOrderItem>>,
        next_id: Mutex<u32>,
        not_found: Mutex<bool>,
    }

    impl FakePort {
        fn mint(
            &self,
            po_id: &PurchaseOrderId,
            new: &NewPurchaseOrderItem,
        ) -> PurchaseOrderItem {
            let mut id_guard = self.next_id.lock().unwrap();
            *id_guard += 1;
            let line_number = self
                .items
                .lock()
                .unwrap()
                .iter()
                .filter(|i| i.purchase_order_id == *po_id)
                .map(|i| i.line_number)
                .max()
                .unwrap_or(0)
                + 1;
            PurchaseOrderItem {
                id: PurchaseOrderItemId(format!("poi-{}", *id_guard)),
                purchase_order_id: po_id.clone(),
                material_type_id: new.material_type_id.clone(),
                line_number,
                description: new.description.clone(),
                width: new.width,
                length: new.length,
                thickness: new.thickness,
                color: new.color.clone(),
                quantity_sqft: new.quantity_sqft,
                unit_cost: new.unit_cost,
                // Trigger-populated in real DB; fake computes it here
                // to round-trip through the use case tests.
                line_total: (new.quantity_sqft * new.unit_cost * 100.0).round() / 100.0,
                quantity_received: 0.0,
                received_date: None,
                notes: new.notes.clone(),
                created_at: Some("2026-04-19T00:00:00Z".into()),
                updated_at: Some("2026-04-19T00:00:00Z".into()),
            }
        }
    }

    #[async_trait]
    impl PurchaseOrderItemPort for FakePort {
        async fn list_for_po(
            &self,
            po_id: &PurchaseOrderId,
        ) -> Result<Vec<PurchaseOrderItem>, AppError> {
            Ok(self
                .items
                .lock()
                .unwrap()
                .iter()
                .filter(|i| i.purchase_order_id == *po_id)
                .cloned()
                .collect())
        }
        async fn get(
            &self,
            id: &PurchaseOrderItemId,
        ) -> Result<Option<PurchaseOrderItem>, AppError> {
            Ok(self
                .items
                .lock()
                .unwrap()
                .iter()
                .find(|i| i.id == *id)
                .cloned())
        }
        async fn create(
            &self,
            po_id: &PurchaseOrderId,
            new: &NewPurchaseOrderItem,
        ) -> Result<PurchaseOrderItem, AppError> {
            let item = self.mint(po_id, new);
            self.items.lock().unwrap().push(item.clone());
            Ok(item)
        }
        async fn update(
            &self,
            id: &PurchaseOrderItemId,
            patch: &PurchaseOrderItemUpdate,
        ) -> Result<Option<PurchaseOrderItem>, AppError> {
            if *self.not_found.lock().unwrap() {
                return Ok(None);
            }
            let mut guard = self.items.lock().unwrap();
            for item in guard.iter_mut() {
                if item.id == *id {
                    if let Some(desc) = patch.description.clone() {
                        item.description = desc;
                    }
                    if let Some(q) = patch.quantity_sqft {
                        item.quantity_sqft = q;
                        item.line_total = (q * item.unit_cost * 100.0).round() / 100.0;
                    }
                    if let Some(c) = patch.unit_cost {
                        item.unit_cost = c;
                        item.line_total =
                            (item.quantity_sqft * c * 100.0).round() / 100.0;
                    }
                    return Ok(Some(item.clone()));
                }
            }
            Ok(None)
        }
        async fn delete(&self, id: &PurchaseOrderItemId) -> Result<bool, AppError> {
            let mut guard = self.items.lock().unwrap();
            let len = guard.len();
            guard.retain(|i| i.id != *id);
            Ok(guard.len() != len)
        }
    }

    fn sample_new() -> NewPurchaseOrderItem {
        NewPurchaseOrderItem {
            material_type_id: MaterialTypeId("mt-1".into()),
            description: "1/4in Neoprene".into(),
            width: Some(48.0),
            length: Some(600.0),
            thickness: Some(0.25),
            color: Some("Black".into()),
            quantity_sqft: 100.0,
            unit_cost: 3.50,
            notes: None,
        }
    }

    #[tokio::test]
    async fn add_item_assigns_sequential_line_numbers() {
        let port = Arc::new(FakePort::default());
        let uc = AddPurchaseOrderItemUseCase::new(port.clone());
        let first = uc
            .execute(PurchaseOrderId("po-1".into()), sample_new())
            .await
            .unwrap();
        let second = uc
            .execute(PurchaseOrderId("po-1".into()), sample_new())
            .await
            .unwrap();
        assert_eq!(first.line_number, 1);
        assert_eq!(second.line_number, 2);
    }

    #[tokio::test]
    async fn add_item_rejects_zero_quantity() {
        let port = Arc::new(FakePort::default());
        let uc = AddPurchaseOrderItemUseCase::new(port);
        let mut new = sample_new();
        new.quantity_sqft = 0.0;
        let err = uc
            .execute(PurchaseOrderId("po-1".into()), new)
            .await
            .unwrap_err();
        assert!(matches!(err, AppError::InvalidInput(_)), "got {err:?}");
    }

    #[tokio::test]
    async fn add_item_rejects_blank_description() {
        let port = Arc::new(FakePort::default());
        let uc = AddPurchaseOrderItemUseCase::new(port);
        let mut new = sample_new();
        new.description = "   ".into();
        let err = uc
            .execute(PurchaseOrderId("po-1".into()), new)
            .await
            .unwrap_err();
        assert!(matches!(err, AppError::InvalidInput(_)), "got {err:?}");
    }

    #[tokio::test]
    async fn add_item_trims_description() {
        let port = Arc::new(FakePort::default());
        let uc = AddPurchaseOrderItemUseCase::new(port);
        let mut new = sample_new();
        new.description = "  1/4in Neoprene  ".into();
        let item = uc
            .execute(PurchaseOrderId("po-1".into()), new)
            .await
            .unwrap();
        assert_eq!(item.description, "1/4in Neoprene");
    }

    #[tokio::test]
    async fn update_missing_returns_not_found() {
        let port = Arc::new(FakePort::default());
        *port.not_found.lock().unwrap() = true;
        let uc = UpdatePurchaseOrderItemUseCase::new(port);
        let err = uc
            .execute(
                PurchaseOrderItemId("gone".into()),
                PurchaseOrderItemUpdate {
                    quantity_sqft: Some(10.0),
                    ..Default::default()
                },
            )
            .await
            .unwrap_err();
        assert!(matches!(err, AppError::NotFound));
    }

    #[tokio::test]
    async fn update_rejects_negative_cost() {
        let port = Arc::new(FakePort::default());
        let add = AddPurchaseOrderItemUseCase::new(port.clone());
        let item = add
            .execute(PurchaseOrderId("po-1".into()), sample_new())
            .await
            .unwrap();
        let uc = UpdatePurchaseOrderItemUseCase::new(port);
        let err = uc
            .execute(
                item.id,
                PurchaseOrderItemUpdate {
                    unit_cost: Some(-1.0),
                    ..Default::default()
                },
            )
            .await
            .unwrap_err();
        assert!(matches!(err, AppError::InvalidInput(_)), "got {err:?}");
    }

    #[tokio::test]
    async fn delete_missing_returns_not_found() {
        let port = Arc::new(FakePort::default());
        let uc = DeletePurchaseOrderItemUseCase::new(port);
        let err = uc
            .execute(PurchaseOrderItemId("gone".into()))
            .await
            .unwrap_err();
        assert!(matches!(err, AppError::NotFound));
    }

    #[tokio::test]
    async fn list_filters_by_po() {
        let port = Arc::new(FakePort::default());
        let add = AddPurchaseOrderItemUseCase::new(port.clone());
        add.execute(PurchaseOrderId("po-1".into()), sample_new())
            .await
            .unwrap();
        add.execute(PurchaseOrderId("po-2".into()), sample_new())
            .await
            .unwrap();
        let list = ListPurchaseOrderItemsUseCase::new(port);
        let po1 = list
            .execute(PurchaseOrderId("po-1".into()))
            .await
            .unwrap();
        assert_eq!(po1.len(), 1);
    }
}
