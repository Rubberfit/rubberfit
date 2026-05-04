//! Reorder → PO flow (S3c Task 7).
//!
//! One use case drives three HTTP entry points (row, individual
//! batch, supplier-grouped bulk). The Postgres
//! `create_reorder_purchase_order` RPC owns the transaction
//! (FOR UPDATE on rule rows, generate_po_number, insert PO +
//! items, bump last_triggered_at).
//!
//! The use case validates the input shape, calls the RPC, fetches
//! the post-write PO so the notification side-effect has the
//! up-to-date row, and fires `send_reorder_po_created` once per
//! RPC success — for the bulk path that's a single notification
//! regardless of how many rules the PO consolidated.

use std::sync::Arc;

use async_trait::async_trait;
use rf_domain::{PurchaseOrderId, ReorderRuleId, SupplierId};
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::notifications::NotificationPort;
use crate::procurement::purchase_orders::PurchaseOrderPort;
use crate::procurement::reorder_rules::ReorderRulePort;

/// Input item. `rule_id` identifies which suggestion this line
/// fulfills; `quantity_sqft` and `unit_cost` come from the
/// caller (the UI's create-PO dialog lets the user edit both
/// before confirmation).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReorderPoItem {
    pub rule_id: ReorderRuleId,
    pub quantity_sqft: f64,
    pub unit_cost: f64,
}

/// Which HTTP path invoked this use case. The variant doesn't
/// change server-side behavior beyond the bulk flag the adapter
/// forwards (it controls whether `reorder_rule_id` on the PO
/// header stamps as the first rule or null for multi-rule bulk).
/// Tracked so the notification payload can render a human
/// message per path.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReorderPoMode {
    /// One rule → one PO. `rule_ids = [rule]`, `items = [rule]`.
    Row,
    /// N rules → N POs. Each invocation is a Row call; this
    /// variant exists so the HTTP handler can thread a batch
    /// through a single loop without losing the intent.
    IndividualBatch,
    /// N rules for ONE supplier → 1 PO with N items. Bulk flag
    /// set so the RPC stamps `reorder_rule_id = NULL` on the PO
    /// header.
    Bulk,
}

/// The receipt shape the RPC returns. Mirrors the JSONB
/// `jsonb_build_object(...)` result in the migration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReorderPoReceipt {
    pub po_id: PurchaseOrderId,
    pub po_number: String,
    pub supplier_id: SupplierId,
    pub items_count: i32,
    pub subtotal: f64,
    pub rule_ids: Vec<ReorderRuleId>,
    pub bulk: bool,
}

/// Port for the RPC. Separate from `PurchaseOrderPort` because
/// the transaction semantics and error surface (P0010/P0011/P0012)
/// are distinct, and Task 7's single RPC is enough surface to
/// justify its own trait.
#[async_trait]
pub trait CreateReorderPoPort: Send + Sync {
    async fn call(
        &self,
        rule_ids: &[ReorderRuleId],
        supplier_id: &SupplierId,
        items: &[ReorderPoItem],
        user_id: &str,
        bulk: bool,
    ) -> Result<ReorderPoReceipt, AppError>;
}

/// Orchestrates the reorder → PO flow.
///
/// Validates input shape BEFORE the RPC call so bad calls fail at
/// the use-case boundary with a 400, not as a Postgres CHECK /
/// cast error from the adapter. Fires the notification side
/// effect after a successful RPC, fetching the PO header so the
/// notification has the current state. The notification send is
/// fire-and-forget (log on failure, don't roll back the PO).
#[derive(Clone)]
pub struct CreateReorderPurchaseOrderUseCase {
    rpc: Arc<dyn CreateReorderPoPort>,
    po_port: Arc<dyn PurchaseOrderPort>,
    rule_port: Arc<dyn ReorderRulePort>,
    notifications: Arc<dyn NotificationPort>,
}

impl CreateReorderPurchaseOrderUseCase {
    pub fn new(
        rpc: Arc<dyn CreateReorderPoPort>,
        po_port: Arc<dyn PurchaseOrderPort>,
        rule_port: Arc<dyn ReorderRulePort>,
        notifications: Arc<dyn NotificationPort>,
    ) -> Self {
        Self {
            rpc,
            po_port,
            rule_port,
            notifications,
        }
    }

    pub async fn execute(
        &self,
        mode: ReorderPoMode,
        rule_ids: Vec<ReorderRuleId>,
        supplier_id: SupplierId,
        items: Vec<ReorderPoItem>,
        user_id: String,
    ) -> Result<ReorderPoReceipt, AppError> {
        if rule_ids.is_empty() {
            return Err(AppError::InvalidInput(
                "rule_ids must include at least one rule".into(),
            ));
        }
        if items.is_empty() {
            return Err(AppError::InvalidInput(
                "items must include at least one line".into(),
            ));
        }
        if supplier_id.0.trim().is_empty() {
            return Err(AppError::InvalidInput("supplier_id is required".into()));
        }
        for item in &items {
            if item.rule_id.0.trim().is_empty() {
                return Err(AppError::InvalidInput("item rule_id is required".into()));
            }
            if !item.quantity_sqft.is_finite() || item.quantity_sqft <= 0.0 {
                return Err(AppError::InvalidInput(
                    "item quantity_sqft must be a finite positive number".into(),
                ));
            }
            if !item.unit_cost.is_finite() || item.unit_cost <= 0.0 {
                return Err(AppError::InvalidInput(
                    "item unit_cost must be a finite positive number".into(),
                ));
            }
        }
        // Row mode: exactly one rule, exactly one item, item.rule_id == rule_ids[0].
        if matches!(mode, ReorderPoMode::Row) {
            if rule_ids.len() != 1 || items.len() != 1 {
                return Err(AppError::InvalidInput(
                    "row mode requires exactly one rule and one item".into(),
                ));
            }
            if items[0].rule_id != rule_ids[0] {
                return Err(AppError::InvalidInput(
                    "row mode item.rule_id must match the rule_id in path".into(),
                ));
            }
        }
        // Bulk mode: at least two rules, each item references a rule
        // in the set. Verified in-RPC too; catching here surfaces a
        // 400 instead of a 409.
        if matches!(mode, ReorderPoMode::Bulk) {
            for item in &items {
                if !rule_ids.contains(&item.rule_id) {
                    return Err(AppError::InvalidInput(format!(
                        "bulk item rule_id {} not in rule_ids",
                        item.rule_id.0
                    )));
                }
            }
        }

        let bulk = matches!(mode, ReorderPoMode::Bulk);
        let receipt = self
            .rpc
            .call(&rule_ids, &supplier_id, &items, &user_id, bulk)
            .await?;

        // Fetch the post-insert PO for the notification payload.
        // If the PO vanished (race), skip notifying but still
        // return the receipt so the HTTP caller sees success —
        // the DB transaction committed before the race.
        if let Some(po) = self.po_port.get(&receipt.po_id).await? {
            // TODO(s3d): bulk POs consolidate N rules but this
            // only notifies against the first one. Operators
            // watching rules B+C won't see the trigger for a
            // supplier-grouped bulk that references A+B+C.
            // Options: (a) loop and notify per rule, (b) add a
            // `send_reorder_po_created_bulk(po, rules: &[ReorderRule])`
            // port method, (c) stamp "bulk reorder for N materials"
            // in the body and drop the per-rule affordance.
            // Pick in S3d alongside the auto-reorder worker design.
            let first_rule_id = &receipt.rule_ids[0];
            if let Some(rule) = self.rule_port.get(first_rule_id).await? {
                if let Err(err) = self.notifications.send_reorder_po_created(&po, &rule).await {
                    tracing::warn!(
                        po_id = %po.id.0,
                        po_number = %po.po_number,
                        error = %err,
                        "send_reorder_po_created failed; PO already persisted",
                    );
                }
            }
        }

        Ok(receipt)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rf_domain::{PurchaseOrder, PurchaseOrderStatus, ReorderRule};
    use std::sync::Mutex;

    /// One recorded invocation of the fake RPC. Named fields keep
    /// the test setup readable — `call.bulk` is clearer than
    /// `call.3` at the assertion sites.
    #[derive(Debug)]
    struct RecordedCall {
        rule_ids: Vec<String>,
        supplier_id: String,
        items: Vec<ReorderPoItem>,
        bulk: bool,
    }

    #[derive(Default)]
    struct FakeRpc {
        calls: Mutex<Vec<RecordedCall>>,
        next: Mutex<Option<ReorderPoReceipt>>,
        error: Mutex<Option<AppError>>,
    }

    #[async_trait]
    impl CreateReorderPoPort for FakeRpc {
        async fn call(
            &self,
            rule_ids: &[ReorderRuleId],
            supplier_id: &SupplierId,
            items: &[ReorderPoItem],
            _user_id: &str,
            bulk: bool,
        ) -> Result<ReorderPoReceipt, AppError> {
            self.calls.lock().unwrap().push(RecordedCall {
                rule_ids: rule_ids.iter().map(|r| r.0.clone()).collect(),
                supplier_id: supplier_id.0.clone(),
                items: items.to_vec(),
                bulk,
            });
            if let Some(err) = self.error.lock().unwrap().take() {
                return Err(err);
            }
            Ok(self
                .next
                .lock()
                .unwrap()
                .take()
                .unwrap_or(ReorderPoReceipt {
                    po_id: PurchaseOrderId("po-new".into()),
                    po_number: "PO-26-0001".into(),
                    supplier_id: supplier_id.clone(),
                    items_count: items.len() as i32,
                    subtotal: items.iter().map(|i| i.quantity_sqft * i.unit_cost).sum(),
                    rule_ids: rule_ids.to_vec(),
                    bulk,
                }))
        }
    }

    #[derive(Default)]
    struct FakePo {
        row: Mutex<Option<PurchaseOrder>>,
    }

    #[async_trait]
    impl PurchaseOrderPort for FakePo {
        async fn list(
            &self,
            _: &rf_domain::PurchaseOrderFilters,
        ) -> Result<Vec<PurchaseOrder>, AppError> {
            unreachable!()
        }
        async fn get(&self, _: &PurchaseOrderId) -> Result<Option<PurchaseOrder>, AppError> {
            Ok(self.row.lock().unwrap().clone())
        }
        async fn generate_number(&self) -> Result<String, AppError> {
            unreachable!()
        }
        async fn create(
            &self,
            _: &str,
            _: &crate::procurement::NewPurchaseOrder,
        ) -> Result<PurchaseOrder, AppError> {
            unreachable!()
        }
        async fn update(
            &self,
            _: &PurchaseOrderId,
            _: &crate::procurement::PurchaseOrderUpdate,
        ) -> Result<Option<PurchaseOrder>, AppError> {
            unreachable!()
        }
        async fn update_status(
            &self,
            _: &PurchaseOrderId,
            _: PurchaseOrderStatus,
            _: Option<&str>,
        ) -> Result<Option<PurchaseOrder>, AppError> {
            unreachable!()
        }
        async fn delete(&self, _: &PurchaseOrderId) -> Result<bool, AppError> {
            unreachable!()
        }
    }

    #[derive(Default)]
    struct FakeRules {
        row: Mutex<Option<ReorderRule>>,
    }

    #[async_trait]
    impl ReorderRulePort for FakeRules {
        async fn list(&self) -> Result<Vec<ReorderRule>, AppError> {
            unreachable!()
        }
        async fn get(&self, _: &ReorderRuleId) -> Result<Option<ReorderRule>, AppError> {
            Ok(self.row.lock().unwrap().clone())
        }
        async fn create(
            &self,
            _: &crate::procurement::NewReorderRule,
        ) -> Result<ReorderRule, AppError> {
            unreachable!()
        }
        async fn update(
            &self,
            _: &ReorderRuleId,
            _: &crate::procurement::ReorderRuleUpdate,
        ) -> Result<Option<ReorderRule>, AppError> {
            unreachable!()
        }
        async fn touch_triggered_at(&self, _: &ReorderRuleId) -> Result<(), AppError> {
            Ok(())
        }
        async fn delete(&self, _: &ReorderRuleId) -> Result<bool, AppError> {
            unreachable!()
        }
    }

    #[derive(Default)]
    struct FakeNotifier {
        reorder_fired: Mutex<Vec<String>>,
    }

    #[async_trait]
    impl NotificationPort for FakeNotifier {
        async fn send_po_approved(&self, _: &PurchaseOrder) -> Result<(), AppError> {
            Ok(())
        }
        async fn send_po_received(&self, _: &PurchaseOrder) -> Result<(), AppError> {
            Ok(())
        }
        async fn send_reorder_po_created(
            &self,
            po: &PurchaseOrder,
            _: &ReorderRule,
        ) -> Result<(), AppError> {
            self.reorder_fired.lock().unwrap().push(po.id.0.clone());
            Ok(())
        }
    }

    fn fake_rule() -> ReorderRule {
        ReorderRule {
            id: ReorderRuleId("rr-1".into()),
            material_type_id: rf_domain::MaterialTypeId("mt-1".into()),
            supplier_id: Some(SupplierId("sup-1".into())),
            reorder_point: 500.0,
            reorder_quantity: 1000.0,
            max_stock_level: None,
            lead_time_days: 7,
            safety_stock_days: None,
            auto_reorder: false,
            active: true,
            notes: None,
            last_triggered_at: None,
            created_at: None,
            updated_at: None,
            material_type: None,
            supplier: None,
        }
    }

    fn fake_po() -> PurchaseOrder {
        PurchaseOrder {
            id: PurchaseOrderId("po-new".into()),
            po_number: "PO-26-0001".into(),
            supplier_id: SupplierId("sup-1".into()),
            status: PurchaseOrderStatus::Draft,
            order_date: None,
            requested_delivery_date: None,
            actual_delivery_date: None,
            subtotal: 1000.0,
            tax_amount: 0.0,
            shipping_cost: 0.0,
            total_amount: 1000.0,
            payment_terms: None,
            shipping_address: None,
            billing_address: None,
            notes: None,
            created_by: None,
            approved_by: None,
            approved_at: None,
            auto_generated: true,
            reorder_rule_id: Some(ReorderRuleId("rr-1".into())),
            created_at: None,
            updated_at: None,
        }
    }

    fn sample_item(rule: &str, qty: f64, cost: f64) -> ReorderPoItem {
        ReorderPoItem {
            rule_id: ReorderRuleId(rule.into()),
            quantity_sqft: qty,
            unit_cost: cost,
        }
    }

    fn new_uc() -> (
        Arc<FakeRpc>,
        Arc<FakePo>,
        Arc<FakeRules>,
        Arc<FakeNotifier>,
        CreateReorderPurchaseOrderUseCase,
    ) {
        let rpc = Arc::new(FakeRpc::default());
        let po = Arc::new(FakePo::default());
        *po.row.lock().unwrap() = Some(fake_po());
        let rules = Arc::new(FakeRules::default());
        *rules.row.lock().unwrap() = Some(fake_rule());
        let notifier = Arc::new(FakeNotifier::default());
        let uc = CreateReorderPurchaseOrderUseCase::new(
            rpc.clone(),
            po.clone(),
            rules.clone(),
            notifier.clone(),
        );
        (rpc, po, rules, notifier, uc)
    }

    #[tokio::test]
    async fn row_mode_happy_path_fires_notification() {
        let (rpc, _, _, notifier, uc) = new_uc();
        let r = uc
            .execute(
                ReorderPoMode::Row,
                vec![ReorderRuleId("rr-1".into())],
                SupplierId("sup-1".into()),
                vec![sample_item("rr-1", 1000.0, 5.0)],
                "user-1".into(),
            )
            .await
            .unwrap();
        assert_eq!(r.items_count, 1);
        assert_eq!(r.subtotal, 5000.0);
        assert!(!r.bulk);
        let calls = rpc.calls.lock().unwrap();
        assert_eq!(calls.len(), 1);
        let fired = notifier.reorder_fired.lock().unwrap();
        assert_eq!(fired.len(), 1);
        assert_eq!(fired[0], "po-new");
    }

    #[tokio::test]
    async fn row_mode_rejects_multi_rule_input() {
        let (_, _, _, _, uc) = new_uc();
        let err = uc
            .execute(
                ReorderPoMode::Row,
                vec![ReorderRuleId("rr-1".into()), ReorderRuleId("rr-2".into())],
                SupplierId("sup-1".into()),
                vec![sample_item("rr-1", 1000.0, 5.0)],
                "user-1".into(),
            )
            .await
            .unwrap_err();
        assert!(matches!(err, AppError::InvalidInput(_)));
    }

    #[tokio::test]
    async fn row_mode_rejects_mismatched_item_rule() {
        let (_, _, _, _, uc) = new_uc();
        let err = uc
            .execute(
                ReorderPoMode::Row,
                vec![ReorderRuleId("rr-1".into())],
                SupplierId("sup-1".into()),
                vec![sample_item("rr-99", 1000.0, 5.0)],
                "user-1".into(),
            )
            .await
            .unwrap_err();
        assert!(matches!(err, AppError::InvalidInput(_)));
    }

    #[tokio::test]
    async fn bulk_mode_sets_bulk_flag() {
        let (rpc, _, _, _, uc) = new_uc();
        uc.execute(
            ReorderPoMode::Bulk,
            vec![ReorderRuleId("rr-1".into()), ReorderRuleId("rr-2".into())],
            SupplierId("sup-1".into()),
            vec![
                sample_item("rr-1", 500.0, 5.0),
                sample_item("rr-2", 300.0, 4.0),
            ],
            "user-1".into(),
        )
        .await
        .unwrap();
        let calls = rpc.calls.lock().unwrap();
        assert_eq!(calls.len(), 1);
        let call = &calls[0];
        assert!(call.bulk, "bulk flag should be true");
        assert_eq!(call.rule_ids, vec!["rr-1".to_string(), "rr-2".to_string()]);
        assert_eq!(call.supplier_id, "sup-1");
        assert_eq!(call.items.len(), 2);
    }

    #[tokio::test]
    async fn bulk_rejects_items_not_in_rule_ids() {
        let (_, _, _, _, uc) = new_uc();
        let err = uc
            .execute(
                ReorderPoMode::Bulk,
                vec![ReorderRuleId("rr-1".into()), ReorderRuleId("rr-2".into())],
                SupplierId("sup-1".into()),
                vec![sample_item("rr-99", 500.0, 5.0)],
                "user-1".into(),
            )
            .await
            .unwrap_err();
        assert!(matches!(err, AppError::InvalidInput(_)));
    }

    #[tokio::test]
    async fn rejects_empty_items() {
        let (_, _, _, _, uc) = new_uc();
        let err = uc
            .execute(
                ReorderPoMode::Row,
                vec![ReorderRuleId("rr-1".into())],
                SupplierId("sup-1".into()),
                vec![],
                "user-1".into(),
            )
            .await
            .unwrap_err();
        assert!(matches!(err, AppError::InvalidInput(_)));
    }

    #[tokio::test]
    async fn rejects_negative_quantity() {
        let (_, _, _, _, uc) = new_uc();
        let err = uc
            .execute(
                ReorderPoMode::Row,
                vec![ReorderRuleId("rr-1".into())],
                SupplierId("sup-1".into()),
                vec![sample_item("rr-1", -1.0, 5.0)],
                "user-1".into(),
            )
            .await
            .unwrap_err();
        assert!(matches!(err, AppError::InvalidInput(_)));
    }

    #[tokio::test]
    async fn rpc_error_surfaces() {
        let (rpc, _, _, _, uc) = new_uc();
        *rpc.error.lock().unwrap() = Some(AppError::Conflict("RULE_INACTIVE".into()));
        let err = uc
            .execute(
                ReorderPoMode::Row,
                vec![ReorderRuleId("rr-1".into())],
                SupplierId("sup-1".into()),
                vec![sample_item("rr-1", 1000.0, 5.0)],
                "user-1".into(),
            )
            .await
            .unwrap_err();
        match err {
            AppError::Conflict(code) => assert_eq!(code, "RULE_INACTIVE"),
            other => panic!("expected Conflict, got {other:?}"),
        }
    }
}
