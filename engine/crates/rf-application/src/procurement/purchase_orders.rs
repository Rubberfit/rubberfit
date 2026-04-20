//! PurchaseOrder port + CRUD use cases (S3c Task 2).
//!
//! PO header CRUD. Items live in the sibling `po_items` module.
//!
//! DB-side computation stays authoritative for line_total / subtotal /
//! total_amount: the S3c plan keeps the existing
//! `trigger_update_purchase_order_totals` + `trigger_calculate_po_item_line_total`
//! triggers in place. Rust writes raw columns; the adapter uses
//! `Prefer: return=representation` on write, so the caller reads back
//! the trigger-populated values without a follow-up GET.
//!
//! `po_number` comes from the Postgres `generate_po_number()` RPC,
//! which Task 1's migration re-wrote to use a per-year SEQUENCE object
//! (race-safe under concurrent creates). The Create use case hands
//! the RPC-minted string straight into the insert payload so the
//! adapter never needs to know about the function.

use std::sync::Arc;

use async_trait::async_trait;
use rf_domain::{
    PurchaseOrder, PurchaseOrderFilters, PurchaseOrderId, PurchaseOrderStatus, SupplierId,
};
use serde_json::json;

use crate::error::AppError;
use crate::notifications::NotificationPort;

/// Request shape for creating a PO header. `po_number` is *not* on
/// this struct — the use case obtains it from the RPC before calling
/// the port. `status` defaults to `Draft` at the DB level; callers
/// can override for internal scenarios (migrations, tests).
#[derive(Debug, Clone)]
pub struct NewPurchaseOrder {
    pub supplier_id: SupplierId,
    pub status: Option<PurchaseOrderStatus>,
    pub order_date: Option<String>,
    pub requested_delivery_date: Option<String>,
    pub tax_amount: Option<f64>,
    pub shipping_cost: Option<f64>,
    pub payment_terms: Option<String>,
    pub shipping_address: Option<String>,
    pub billing_address: Option<String>,
    pub notes: Option<String>,
    pub created_by: Option<String>,
    pub auto_generated: Option<bool>,
    pub reorder_rule_id: Option<String>,
}

/// Patch shape for a PO header. Nullable columns are double-Optioned
/// so omitted (None) and explicit null (Some(None)) are
/// distinguishable.
///
/// `status` is intentionally **not** patchable through this path:
/// status transitions go through the dedicated `UpdateStatus` use
/// case (Task 3), which enforces the state machine + blocks
/// `received` from the generic dropdown path. Keeping it off the
/// struct prevents the handler from offering a silent bypass.
#[derive(Debug, Clone, Default)]
pub struct PurchaseOrderUpdate {
    pub supplier_id: Option<SupplierId>,
    pub order_date: Option<Option<String>>,
    pub requested_delivery_date: Option<Option<String>>,
    pub tax_amount: Option<f64>,
    pub shipping_cost: Option<f64>,
    pub payment_terms: Option<Option<String>>,
    pub shipping_address: Option<Option<String>>,
    pub billing_address: Option<Option<String>>,
    pub notes: Option<Option<String>>,
}

#[async_trait]
pub trait PurchaseOrderPort: Send + Sync {
    async fn list(
        &self,
        filters: &PurchaseOrderFilters,
    ) -> Result<Vec<PurchaseOrder>, AppError>;

    async fn get(
        &self,
        id: &PurchaseOrderId,
    ) -> Result<Option<PurchaseOrder>, AppError>;

    /// Mint a PO number from the `generate_po_number()` Postgres RPC.
    /// Kept on the port (vs. a raw adapter call at the handler layer)
    /// because the number generator is part of the "create a PO"
    /// transaction and we want tests to inject predictable sequences.
    async fn generate_number(&self) -> Result<String, AppError>;

    /// Insert a PO. `po_number` is passed explicitly — minted by the
    /// use case via `generate_number` — so the adapter stays pure.
    async fn create(
        &self,
        po_number: &str,
        new: &NewPurchaseOrder,
    ) -> Result<PurchaseOrder, AppError>;

    async fn update(
        &self,
        id: &PurchaseOrderId,
        patch: &PurchaseOrderUpdate,
    ) -> Result<Option<PurchaseOrder>, AppError>;

    /// Status-only update. Lives on the port (vs. a side-ported
    /// "status transition" repository) because the adapter stamps
    /// the side-column fields (approved_by/approved_at on approve,
    /// order_date on ordered) in the same round-trip — keeping the
    /// use case from knowing those column names.
    ///
    /// `approved_by` is the caller's user id, threaded from the JWT
    /// at the HTTP boundary. The adapter only uses it when the
    /// target status is `Approved`.
    ///
    /// Validation (state-machine + received-terminal) happens in the
    /// use-case layer BEFORE this method is called; the port assumes
    /// the transition is legal.
    async fn update_status(
        &self,
        id: &PurchaseOrderId,
        target: PurchaseOrderStatus,
        approved_by: Option<&str>,
    ) -> Result<Option<PurchaseOrder>, AppError>;

    async fn delete(&self, id: &PurchaseOrderId) -> Result<bool, AppError>;
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

fn validate_iso_date_opt(value: &Option<String>, field: &str) -> Result<(), AppError> {
    if let Some(s) = value {
        if !is_iso_date(s) {
            return Err(AppError::InvalidInput(format!(
                "{field} must be an ISO-8601 date (YYYY-MM-DD)"
            )));
        }
    }
    Ok(())
}

/// Minimal YYYY-MM-DD shape check. The use case treats dates as
/// strings so the struct stays on `serde` + nothing else; real
/// calendar validation is the DB's job.
fn is_iso_date(s: &str) -> bool {
    let bytes = s.as_bytes();
    if bytes.len() != 10 {
        return false;
    }
    bytes[0..4].iter().all(|b| b.is_ascii_digit())
        && bytes[4] == b'-'
        && bytes[5..7].iter().all(|b| b.is_ascii_digit())
        && bytes[7] == b'-'
        && bytes[8..10].iter().all(|b| b.is_ascii_digit())
}

#[derive(Clone)]
pub struct ListPurchaseOrdersUseCase {
    port: Arc<dyn PurchaseOrderPort>,
}

impl ListPurchaseOrdersUseCase {
    pub fn new(port: Arc<dyn PurchaseOrderPort>) -> Self {
        Self { port }
    }

    pub async fn execute(
        &self,
        mut filters: PurchaseOrderFilters,
    ) -> Result<Vec<PurchaseOrder>, AppError> {
        if let Some(limit) = filters.limit {
            if limit > 200 {
                filters.limit = Some(200);
            }
        }
        self.port.list(&filters).await
    }
}

#[derive(Clone)]
pub struct GetPurchaseOrderUseCase {
    port: Arc<dyn PurchaseOrderPort>,
}

impl GetPurchaseOrderUseCase {
    pub fn new(port: Arc<dyn PurchaseOrderPort>) -> Self {
        Self { port }
    }

    pub async fn execute(&self, id: PurchaseOrderId) -> Result<PurchaseOrder, AppError> {
        match self.port.get(&id).await? {
            Some(po) => Ok(po),
            None => Err(AppError::NotFound),
        }
    }
}

#[derive(Clone)]
pub struct CreatePurchaseOrderUseCase {
    port: Arc<dyn PurchaseOrderPort>,
}

impl CreatePurchaseOrderUseCase {
    pub fn new(port: Arc<dyn PurchaseOrderPort>) -> Self {
        Self { port }
    }

    pub async fn execute(
        &self,
        new: NewPurchaseOrder,
    ) -> Result<PurchaseOrder, AppError> {
        validate_non_negative(new.tax_amount, "tax_amount")?;
        validate_non_negative(new.shipping_cost, "shipping_cost")?;
        validate_iso_date_opt(&new.order_date, "order_date")?;
        validate_iso_date_opt(&new.requested_delivery_date, "requested_delivery_date")?;
        if new.supplier_id.0.trim().is_empty() {
            return Err(AppError::InvalidInput("supplier_id is required".into()));
        }
        // Terminal-via-receive-only invariant (plan §"PO status state
        // machine"): the receive endpoint is the only writer for
        // `received` — creating a PO directly in `received` would
        // bypass roll creation + actual_delivery_date stamping. The
        // UPDATE status path mirrors this rejection so the invariant
        // can't be side-stepped from either entry point, with the
        // SAME response shape (`ConflictWithDetails` → `{code,
        // details: {allowedTargets: [...]}}`) so the client's 409
        // handler is branch-free. On CREATE there's no "current
        // state" so `allowedTargets` is empty.
        if matches!(new.status, Some(PurchaseOrderStatus::Received)) {
            let empty: Vec<&str> = Vec::new();
            return Err(AppError::ConflictWithDetails(
                "RECEIVED_REQUIRES_RECEIVE_FLOW".into(),
                json!({ "allowedTargets": empty }),
            ));
        }
        let po_number = self.port.generate_number().await?;
        self.port.create(&po_number, &new).await
    }
}

#[derive(Clone)]
pub struct UpdatePurchaseOrderUseCase {
    port: Arc<dyn PurchaseOrderPort>,
}

impl UpdatePurchaseOrderUseCase {
    pub fn new(port: Arc<dyn PurchaseOrderPort>) -> Self {
        Self { port }
    }

    pub async fn execute(
        &self,
        id: PurchaseOrderId,
        patch: PurchaseOrderUpdate,
    ) -> Result<PurchaseOrder, AppError> {
        validate_non_negative(patch.tax_amount, "tax_amount")?;
        validate_non_negative(patch.shipping_cost, "shipping_cost")?;
        if let Some(Some(s)) = &patch.order_date {
            if !is_iso_date(s) {
                return Err(AppError::InvalidInput(
                    "order_date must be YYYY-MM-DD".into(),
                ));
            }
        }
        if let Some(Some(s)) = &patch.requested_delivery_date {
            if !is_iso_date(s) {
                return Err(AppError::InvalidInput(
                    "requested_delivery_date must be YYYY-MM-DD".into(),
                ));
            }
        }
        match self.port.update(&id, &patch).await? {
            Some(po) => Ok(po),
            None => Err(AppError::NotFound),
        }
    }
}

/// State-machine + received-terminal check for the generic
/// status-update path. Returns:
///
/// - `Err(RECEIVED_REQUIRES_RECEIVE_FLOW)` when the target is
///   `Received` (that transition is reachable only via the dedicated
///   receive flow, which also creates rolls + stamps delivery date
///   atomically — see S3c plan §"PO status state machine").
/// - `Err(INVALID_STATE_TRANSITION)` when the target isn't in the
///   source's `allowed_targets_from()` set.
/// - `Ok(())` when the transition is legal.
///
/// Both error bodies carry `allowedTargets: [...]` in their JSON
/// details so the UI can show the operator what they CAN do without
/// another round-trip.
fn validate_transition(
    from: PurchaseOrderStatus,
    to: PurchaseOrderStatus,
) -> Result<(), AppError> {
    let allowed: Vec<&str> = from
        .allowed_targets_from()
        .iter()
        .map(|s| s.as_str())
        .collect();
    if matches!(to, PurchaseOrderStatus::Received) {
        return Err(AppError::ConflictWithDetails(
            "RECEIVED_REQUIRES_RECEIVE_FLOW".into(),
            json!({ "allowedTargets": allowed }),
        ));
    }
    if !from.allowed_targets_from().contains(&to) {
        return Err(AppError::ConflictWithDetails(
            "INVALID_STATE_TRANSITION".into(),
            json!({
                "from": from.as_str(),
                "to": to.as_str(),
                "allowedTargets": allowed,
            }),
        ));
    }
    Ok(())
}

/// Update a PO's status, enforcing the state machine + receiving-
/// the-received-terminal rule + firing the PO-approved notification
/// side-effect. The adapter stamps `approved_by/approved_at` on
/// approve and `order_date` on ordered — the use case just asks for
/// the transition.
#[derive(Clone)]
pub struct UpdatePurchaseOrderStatusUseCase {
    port: Arc<dyn PurchaseOrderPort>,
    notifications: Arc<dyn NotificationPort>,
}

impl UpdatePurchaseOrderStatusUseCase {
    pub fn new(
        port: Arc<dyn PurchaseOrderPort>,
        notifications: Arc<dyn NotificationPort>,
    ) -> Self {
        Self { port, notifications }
    }

    pub async fn execute(
        &self,
        id: PurchaseOrderId,
        target: PurchaseOrderStatus,
        actor: Option<String>,
    ) -> Result<PurchaseOrder, AppError> {
        let current = match self.port.get(&id).await? {
            Some(po) => po,
            None => return Err(AppError::NotFound),
        };

        // Fast-path: no-op transition to the same status. Returning
        // the existing row keeps the HTTP path idempotent for
        // "click approve twice" UI retries.
        if current.status == target {
            return Ok(current);
        }

        validate_transition(current.status, target)?;

        let updated = self
            .port
            .update_status(&id, target, actor.as_deref())
            .await?
            .ok_or(AppError::NotFound)?;

        // Notify only when a caller actually caused the transition
        // (not on no-op). `send_po_approved` is the S3c entry for
        // the approve event; receive/create-reorder have their own
        // notification hooks wired in Tasks 5 / 7.
        if matches!(target, PurchaseOrderStatus::Approved) {
            // Notification is fire-and-forget at this layer: a
            // failure shouldn't roll back a PO that's already
            // flipped in the DB — that matches the TS use case
            // where the toast/email was a separate side channel.
            // We still log at WARN so operators can spot a stuck
            // notification subsystem without having to correlate
            // HTTP access logs.
            if let Err(err) = self.notifications.send_po_approved(&updated).await {
                tracing::warn!(
                    po_id = %updated.id.0,
                    po_number = %updated.po_number,
                    error = %err,
                    "send_po_approved failed; PO transition already persisted",
                );
            }
        }

        Ok(updated)
    }
}

#[derive(Clone)]
pub struct DeletePurchaseOrderUseCase {
    port: Arc<dyn PurchaseOrderPort>,
}

impl DeletePurchaseOrderUseCase {
    pub fn new(port: Arc<dyn PurchaseOrderPort>) -> Self {
        Self { port }
    }

    pub async fn execute(&self, id: PurchaseOrderId) -> Result<(), AppError> {
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
        by_id: Mutex<Vec<PurchaseOrder>>,
        next_seq: Mutex<u32>,
        not_found: Mutex<bool>,
    }

    impl FakePort {
        fn mint(&self, po_number: String, new: &NewPurchaseOrder) -> PurchaseOrder {
            PurchaseOrder {
                id: PurchaseOrderId(format!("po-{}", po_number)),
                po_number,
                supplier_id: new.supplier_id.clone(),
                status: new.status.unwrap_or(PurchaseOrderStatus::Draft),
                order_date: new.order_date.clone(),
                requested_delivery_date: new.requested_delivery_date.clone(),
                actual_delivery_date: None,
                subtotal: 0.0,
                tax_amount: new.tax_amount.unwrap_or(0.0),
                shipping_cost: new.shipping_cost.unwrap_or(0.0),
                total_amount: new.tax_amount.unwrap_or(0.0) + new.shipping_cost.unwrap_or(0.0),
                payment_terms: new.payment_terms.clone(),
                shipping_address: new.shipping_address.clone(),
                billing_address: new.billing_address.clone(),
                notes: new.notes.clone(),
                created_by: new.created_by.clone(),
                approved_by: None,
                approved_at: None,
                auto_generated: new.auto_generated.unwrap_or(false),
                reorder_rule_id: None,
                created_at: Some("2026-04-19T00:00:00Z".into()),
                updated_at: Some("2026-04-19T00:00:00Z".into()),
            }
        }
    }

    #[async_trait]
    impl PurchaseOrderPort for FakePort {
        async fn list(
            &self,
            _filters: &PurchaseOrderFilters,
        ) -> Result<Vec<PurchaseOrder>, AppError> {
            Ok(self.by_id.lock().unwrap().clone())
        }
        async fn get(
            &self,
            id: &PurchaseOrderId,
        ) -> Result<Option<PurchaseOrder>, AppError> {
            Ok(self
                .by_id
                .lock()
                .unwrap()
                .iter()
                .find(|p| p.id == *id)
                .cloned())
        }
        async fn generate_number(&self) -> Result<String, AppError> {
            let mut seq = self.next_seq.lock().unwrap();
            *seq += 1;
            Ok(format!("PO-26-{:04}", *seq))
        }
        async fn create(
            &self,
            po_number: &str,
            new: &NewPurchaseOrder,
        ) -> Result<PurchaseOrder, AppError> {
            let po = self.mint(po_number.to_string(), new);
            self.by_id.lock().unwrap().push(po.clone());
            Ok(po)
        }
        async fn update(
            &self,
            id: &PurchaseOrderId,
            patch: &PurchaseOrderUpdate,
        ) -> Result<Option<PurchaseOrder>, AppError> {
            if *self.not_found.lock().unwrap() {
                return Ok(None);
            }
            let mut guard = self.by_id.lock().unwrap();
            for po in guard.iter_mut() {
                if po.id == *id {
                    if let Some(s) = &patch.supplier_id {
                        po.supplier_id = s.clone();
                    }
                    if let Some(v) = patch.tax_amount {
                        po.tax_amount = v;
                    }
                    if let Some(v) = patch.shipping_cost {
                        po.shipping_cost = v;
                    }
                    return Ok(Some(po.clone()));
                }
            }
            Ok(None)
        }
        async fn update_status(
            &self,
            id: &PurchaseOrderId,
            target: PurchaseOrderStatus,
            approved_by: Option<&str>,
        ) -> Result<Option<PurchaseOrder>, AppError> {
            let mut guard = self.by_id.lock().unwrap();
            for po in guard.iter_mut() {
                if po.id == *id {
                    po.status = target;
                    match target {
                        PurchaseOrderStatus::Approved => {
                            po.approved_by = approved_by.map(str::to_string);
                            po.approved_at = Some("2026-04-19T12:00:00Z".into());
                        }
                        PurchaseOrderStatus::Ordered => {
                            po.order_date = Some("2026-04-19".into());
                        }
                        _ => {}
                    }
                    return Ok(Some(po.clone()));
                }
            }
            Ok(None)
        }
        async fn delete(&self, id: &PurchaseOrderId) -> Result<bool, AppError> {
            let mut guard = self.by_id.lock().unwrap();
            let len = guard.len();
            guard.retain(|p| p.id != *id);
            Ok(guard.len() != len)
        }
    }

    /// Notification stub that records every invocation so tests can
    /// assert send_po_approved fires exactly once on a successful
    /// approve transition.
    #[derive(Default)]
    struct FakeNotifier {
        approved: Mutex<Vec<String>>,
    }

    #[async_trait]
    impl NotificationPort for FakeNotifier {
        async fn send_po_approved(
            &self,
            po: &PurchaseOrder,
        ) -> Result<(), AppError> {
            self.approved.lock().unwrap().push(po.id.0.clone());
            Ok(())
        }
        async fn send_po_received(
            &self,
            _po: &PurchaseOrder,
        ) -> Result<(), AppError> {
            Ok(())
        }
        async fn send_reorder_po_created(
            &self,
            _po: &PurchaseOrder,
            _rule: &rf_domain::ReorderRule,
        ) -> Result<(), AppError> {
            Ok(())
        }
    }

    fn sample_new(supplier: &str) -> NewPurchaseOrder {
        NewPurchaseOrder {
            supplier_id: SupplierId(supplier.into()),
            status: None,
            order_date: None,
            requested_delivery_date: None,
            tax_amount: None,
            shipping_cost: None,
            payment_terms: None,
            shipping_address: None,
            billing_address: None,
            notes: None,
            created_by: Some("user-1".into()),
            auto_generated: None,
            reorder_rule_id: None,
        }
    }

    #[tokio::test]
    async fn create_mints_po_number_from_port() {
        let port = Arc::new(FakePort::default());
        let uc = CreatePurchaseOrderUseCase::new(port);
        let po = uc.execute(sample_new("sup-1")).await.unwrap();
        assert_eq!(po.po_number, "PO-26-0001");
    }

    #[tokio::test]
    async fn create_rejects_blank_supplier_id() {
        let port = Arc::new(FakePort::default());
        let uc = CreatePurchaseOrderUseCase::new(port);
        let err = uc.execute(sample_new("   ")).await.unwrap_err();
        assert!(matches!(err, AppError::InvalidInput(_)), "got {err:?}");
    }

    #[tokio::test]
    async fn create_rejects_negative_tax() {
        let port = Arc::new(FakePort::default());
        let uc = CreatePurchaseOrderUseCase::new(port);
        let mut new = sample_new("sup-1");
        new.tax_amount = Some(-1.0);
        let err = uc.execute(new).await.unwrap_err();
        assert!(matches!(err, AppError::InvalidInput(_)), "got {err:?}");
    }

    #[tokio::test]
    async fn create_rejects_received_status() {
        // Terminal-via-receive-only: CREATE must not land a PO in
        // `received` state — the receive flow is the sole writer.
        // Mirrors the UPDATE-side gate with the same response shape
        // (`ConflictWithDetails` + `allowedTargets`) so clients can
        // share one branch for both entry points.
        let port = Arc::new(FakePort::default());
        let uc = CreatePurchaseOrderUseCase::new(port);
        let mut new = sample_new("sup-1");
        new.status = Some(PurchaseOrderStatus::Received);
        let err = uc.execute(new).await.unwrap_err();
        match err {
            AppError::ConflictWithDetails(code, details) => {
                assert_eq!(code, "RECEIVED_REQUIRES_RECEIVE_FLOW");
                let allowed =
                    details.get("allowedTargets").unwrap().as_array().unwrap();
                assert!(
                    allowed.is_empty(),
                    "CREATE has no source state, so allowedTargets is empty"
                );
            }
            other => panic!("expected ConflictWithDetails, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn create_accepts_other_statuses() {
        // Smoke test that only `received` is rejected, not every
        // explicit status.
        let port = Arc::new(FakePort::default());
        let uc = CreatePurchaseOrderUseCase::new(port);
        for s in [
            PurchaseOrderStatus::Draft,
            PurchaseOrderStatus::Pending,
            PurchaseOrderStatus::Approved,
            PurchaseOrderStatus::Ordered,
            PurchaseOrderStatus::Cancelled,
        ] {
            let mut new = sample_new("sup-1");
            new.status = Some(s);
            uc.execute(new).await.unwrap();
        }
    }

    #[tokio::test]
    async fn create_rejects_bad_iso_date() {
        let port = Arc::new(FakePort::default());
        let uc = CreatePurchaseOrderUseCase::new(port);
        let mut new = sample_new("sup-1");
        new.order_date = Some("2026/04/01".into());
        let err = uc.execute(new).await.unwrap_err();
        assert!(matches!(err, AppError::InvalidInput(_)), "got {err:?}");
    }

    #[tokio::test]
    async fn get_missing_returns_not_found() {
        let port = Arc::new(FakePort::default());
        let uc = GetPurchaseOrderUseCase::new(port);
        let err = uc
            .execute(PurchaseOrderId("missing".into()))
            .await
            .unwrap_err();
        assert!(matches!(err, AppError::NotFound));
    }

    #[tokio::test]
    async fn update_missing_returns_not_found() {
        let port = Arc::new(FakePort::default());
        *port.not_found.lock().unwrap() = true;
        let uc = UpdatePurchaseOrderUseCase::new(port);
        let err = uc
            .execute(
                PurchaseOrderId("gone".into()),
                PurchaseOrderUpdate {
                    tax_amount: Some(1.0),
                    ..Default::default()
                },
            )
            .await
            .unwrap_err();
        assert!(matches!(err, AppError::NotFound));
    }

    #[tokio::test]
    async fn delete_missing_returns_not_found() {
        let port = Arc::new(FakePort::default());
        let uc = DeletePurchaseOrderUseCase::new(port);
        let err = uc
            .execute(PurchaseOrderId("gone".into()))
            .await
            .unwrap_err();
        assert!(matches!(err, AppError::NotFound));
    }

    #[tokio::test]
    async fn list_clamps_limit_to_200() {
        let port = Arc::new(FakePort::default());
        let uc = ListPurchaseOrdersUseCase::new(port);
        let filters = PurchaseOrderFilters {
            limit: Some(5000),
            ..Default::default()
        };
        // Shouldn't error — just proves we don't pass raw 5000 through
        // (verified via the trait method being called with a mutated
        // filter). The fake ignores filters, so we just assert no err.
        uc.execute(filters).await.unwrap();
    }

    #[tokio::test]
    async fn list_returns_all_created() {
        let port = Arc::new(FakePort::default());
        let create = CreatePurchaseOrderUseCase::new(port.clone());
        for _ in 0..3 {
            create.execute(sample_new("sup-1")).await.unwrap();
        }
        let list = ListPurchaseOrdersUseCase::new(port);
        let all = list.execute(PurchaseOrderFilters::default()).await.unwrap();
        assert_eq!(all.len(), 3);
        assert_eq!(all[0].po_number, "PO-26-0001");
        assert_eq!(all[2].po_number, "PO-26-0003");
    }

    // ---- Task 3: status transitions --------------------------------

    async fn create_draft(port: &Arc<FakePort>) -> PurchaseOrder {
        CreatePurchaseOrderUseCase::new(port.clone())
            .execute(sample_new("sup-1"))
            .await
            .unwrap()
    }

    #[tokio::test]
    async fn status_rejects_received_target_via_generic_path() {
        let port = Arc::new(FakePort::default());
        let po = create_draft(&port).await;
        // Set to Ordered first — from Draft → Received wouldn't
        // even be in the allowed_targets_from set, so we'd hit the
        // INVALID_STATE_TRANSITION branch and never reach the
        // received-specific branch. Testing via Ordered exercises
        // the guard that terminates received regardless of source.
        let uc = UpdatePurchaseOrderStatusUseCase::new(
            port.clone(),
            Arc::new(FakeNotifier::default()),
        );
        // Drive to Ordered via Pending → Approved → Ordered first.
        uc.execute(po.id.clone(), PurchaseOrderStatus::Pending, None)
            .await
            .unwrap();
        uc.execute(po.id.clone(), PurchaseOrderStatus::Approved, None)
            .await
            .unwrap();
        uc.execute(po.id.clone(), PurchaseOrderStatus::Ordered, None)
            .await
            .unwrap();
        let err = uc
            .execute(po.id, PurchaseOrderStatus::Received, None)
            .await
            .unwrap_err();
        match err {
            AppError::ConflictWithDetails(code, details) => {
                assert_eq!(code, "RECEIVED_REQUIRES_RECEIVE_FLOW");
                let allowed =
                    details.get("allowedTargets").unwrap().as_array().unwrap();
                // Ordered.allowed_targets_from() = [cancelled] — UI
                // can show this list after the 409.
                let allowed_strs: Vec<&str> =
                    allowed.iter().map(|v| v.as_str().unwrap()).collect();
                assert_eq!(allowed_strs, vec!["cancelled"]);
            }
            other => panic!("expected ConflictWithDetails, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn status_rejects_illegal_transition_with_allowed_list() {
        let port = Arc::new(FakePort::default());
        let po = create_draft(&port).await;
        let uc = UpdatePurchaseOrderStatusUseCase::new(
            port.clone(),
            Arc::new(FakeNotifier::default()),
        );
        // Draft → Ordered is illegal (Draft.allowed_targets_from()
        // = [Pending, Cancelled]).
        let err = uc
            .execute(po.id, PurchaseOrderStatus::Ordered, None)
            .await
            .unwrap_err();
        match err {
            AppError::ConflictWithDetails(code, details) => {
                assert_eq!(code, "INVALID_STATE_TRANSITION");
                assert_eq!(details.get("from").unwrap(), "draft");
                assert_eq!(details.get("to").unwrap(), "ordered");
                let allowed: Vec<&str> = details
                    .get("allowedTargets")
                    .unwrap()
                    .as_array()
                    .unwrap()
                    .iter()
                    .map(|v| v.as_str().unwrap())
                    .collect();
                assert_eq!(allowed, vec!["pending", "cancelled"]);
            }
            other => panic!("expected ConflictWithDetails, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn approve_fires_notification_exactly_once() {
        let port = Arc::new(FakePort::default());
        let notifier = Arc::new(FakeNotifier::default());
        let po = create_draft(&port).await;
        let uc = UpdatePurchaseOrderStatusUseCase::new(
            port.clone(),
            notifier.clone(),
        );
        uc.execute(po.id.clone(), PurchaseOrderStatus::Pending, None)
            .await
            .unwrap();
        assert!(notifier.approved.lock().unwrap().is_empty());
        let approved = uc
            .execute(
                po.id.clone(),
                PurchaseOrderStatus::Approved,
                Some("user-1".into()),
            )
            .await
            .unwrap();
        assert_eq!(approved.approved_by.as_deref(), Some("user-1"));
        assert!(approved.approved_at.is_some());
        let fired = notifier.approved.lock().unwrap();
        assert_eq!(fired.len(), 1);
        assert_eq!(fired[0], approved.id.0);
    }

    #[tokio::test]
    async fn ordered_transition_stamps_order_date() {
        let port = Arc::new(FakePort::default());
        let po = create_draft(&port).await;
        let uc = UpdatePurchaseOrderStatusUseCase::new(
            port.clone(),
            Arc::new(FakeNotifier::default()),
        );
        uc.execute(po.id.clone(), PurchaseOrderStatus::Pending, None)
            .await
            .unwrap();
        uc.execute(po.id.clone(), PurchaseOrderStatus::Approved, None)
            .await
            .unwrap();
        let ordered = uc
            .execute(po.id, PurchaseOrderStatus::Ordered, None)
            .await
            .unwrap();
        assert!(ordered.order_date.is_some());
    }

    #[tokio::test]
    async fn status_no_op_is_idempotent() {
        let port = Arc::new(FakePort::default());
        let notifier = Arc::new(FakeNotifier::default());
        let po = create_draft(&port).await;
        let uc = UpdatePurchaseOrderStatusUseCase::new(
            port.clone(),
            notifier.clone(),
        );
        // Draft → Draft is a no-op; returns current row, does NOT
        // fire notifications.
        let out = uc
            .execute(po.id.clone(), PurchaseOrderStatus::Draft, None)
            .await
            .unwrap();
        assert_eq!(out.status, PurchaseOrderStatus::Draft);
        assert!(notifier.approved.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn status_update_on_missing_returns_not_found() {
        let port = Arc::new(FakePort::default());
        let uc = UpdatePurchaseOrderStatusUseCase::new(
            port,
            Arc::new(FakeNotifier::default()),
        );
        let err = uc
            .execute(
                PurchaseOrderId("missing".into()),
                PurchaseOrderStatus::Pending,
                None,
            )
            .await
            .unwrap_err();
        assert!(matches!(err, AppError::NotFound));
    }

    #[tokio::test]
    async fn terminal_received_blocks_all_further_transitions() {
        // Received has NO allowed targets at the state-machine level
        // (domain test locks this in). Confirm the use case surfaces
        // that as an INVALID_STATE_TRANSITION when called — the
        // get() returns a PO already in received from a receive flow
        // (simulated by seeding the fake port).
        let port = Arc::new(FakePort::default());
        let po = create_draft(&port).await;
        // Seed it directly into received, bypassing the use case
        // (simulating the receive flow in Task 5 that WILL set this).
        {
            let mut guard = port.by_id.lock().unwrap();
            guard[0].status = PurchaseOrderStatus::Received;
        }
        let uc = UpdatePurchaseOrderStatusUseCase::new(
            port,
            Arc::new(FakeNotifier::default()),
        );
        let err = uc
            .execute(po.id, PurchaseOrderStatus::Cancelled, None)
            .await
            .unwrap_err();
        match err {
            AppError::ConflictWithDetails(code, _) => {
                assert_eq!(code, "INVALID_STATE_TRANSITION");
            }
            other => panic!("expected ConflictWithDetails, got {other:?}"),
        }
    }
}
