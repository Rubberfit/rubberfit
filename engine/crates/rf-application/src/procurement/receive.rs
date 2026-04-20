//! PO receive flow (S3c Task 5).
//!
//! A single use case orchestrating the `receive_purchase_order`
//! Postgres RPC + the `send_po_received` notification side effect.
//! The DB function (see
//! `20260419000002_s3c_receive_purchase_order_rpc.sql`) takes a PO
//! row lock, updates line items, inserts rolls, and flips status
//! atomically — the Rust layer only orchestrates.

use std::sync::Arc;

use async_trait::async_trait;
use rf_domain::{PurchaseOrderId, RollId};
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::notifications::NotificationPort;
use crate::procurement::purchase_orders::PurchaseOrderPort;

/// Caller input for one receive line. Mirrors the JSONB shape the
/// Postgres function reads; `roll_data` is optional so callers can
/// receive a "quantity only" update (partial delivery of loose
/// stock) without minting a roll row.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReceiveItem {
    pub item_id: String,
    pub quantity_received: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub roll_data: Option<ReceiveRollData>,
}

/// Optional roll-creation overrides. Any field left `None` falls
/// through to the PO item defaults inside the DB function
/// (material dimensions, color, etc.). Width/length/thickness
/// default to 60 / quantity_received / 0.125 respectively when
/// neither `roll_data` nor PO item provides one — matches the
/// legacy TS path.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReceiveRollData {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub width: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub length: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thickness: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub location: Option<String>,
}

/// What the RPC returns + what the HTTP handler surfaces. `partial`
/// is true when at least one item's `quantity_received` is still
/// short of `quantity_sqft` after this call.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReceiveReceipt {
    pub po_id: PurchaseOrderId,
    pub items_received: i32,
    pub roll_ids: Vec<RollId>,
    pub partial: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<String>,
}

/// Port for the receive-flow RPC. Separate from `PurchaseOrderPort`
/// because the receive path has different atomicity semantics — one
/// Postgres transaction spanning three tables — and the shape of
/// errors the adapter maps is also different (PO_ALREADY_RECEIVED,
/// PO_NOT_FOUND, PO_ITEM_NOT_FOUND).
#[async_trait]
pub trait ReceivePort: Send + Sync {
    async fn receive(
        &self,
        po_id: &PurchaseOrderId,
        items: &[ReceiveItem],
        user_id: &str,
    ) -> Result<ReceiveReceipt, AppError>;
}

/// Receive flow orchestrator. Pulls the post-receive PO row via the
/// existing `PurchaseOrderPort::get` so the notification carries the
/// current state (status / actual_delivery_date) without the RPC
/// having to echo the entire row.
#[derive(Clone)]
pub struct ReceivePurchaseOrderUseCase {
    receive_port: Arc<dyn ReceivePort>,
    po_port: Arc<dyn PurchaseOrderPort>,
    notifications: Arc<dyn NotificationPort>,
}

impl ReceivePurchaseOrderUseCase {
    pub fn new(
        receive_port: Arc<dyn ReceivePort>,
        po_port: Arc<dyn PurchaseOrderPort>,
        notifications: Arc<dyn NotificationPort>,
    ) -> Self {
        Self {
            receive_port,
            po_port,
            notifications,
        }
    }

    pub async fn execute(
        &self,
        po_id: PurchaseOrderId,
        items: Vec<ReceiveItem>,
        user_id: String,
    ) -> Result<ReceiveReceipt, AppError> {
        if items.is_empty() {
            return Err(AppError::InvalidInput(
                "receive body must include at least one item".into(),
            ));
        }
        // Pre-validation. The DB CHECK will catch these too, but a
        // 400 here gives a clearer error than a 500 on a rollback.
        for item in &items {
            if !item.quantity_received.is_finite() || item.quantity_received < 0.0 {
                return Err(AppError::InvalidInput(format!(
                    "quantity_received for item {} must be a finite non-negative number",
                    item.item_id
                )));
            }
            if item.item_id.trim().is_empty() {
                return Err(AppError::InvalidInput("item_id is required".into()));
            }
        }

        let receipt = self
            .receive_port
            .receive(&po_id, &items, &user_id)
            .await?;

        // Fire the PO-received notification only on a FULL receipt.
        // Partial receipts (at least one item still short on
        // quantity_received) do not flip the PO status to
        // `received`, and the TS use case gates the notification
        // the same way — an operator would otherwise see "PO X
        // received" toasts for every partial delivery instead of
        // once when the order actually closes.
        if !receipt.partial {
            if let Some(po) = self.po_port.get(&po_id).await? {
                // Fire-and-forget — same rationale as approve (see
                // UpdatePurchaseOrderStatusUseCase). The DB write is
                // already committed; log warn on failure, return
                // the receipt verbatim.
                if let Err(err) = self.notifications.send_po_received(&po).await {
                    tracing::warn!(
                        po_id = %po.id.0,
                        po_number = %po.po_number,
                        error = %err,
                        "send_po_received failed; receipt already persisted",
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
    use rf_domain::{PurchaseOrder, PurchaseOrderId, PurchaseOrderStatus, SupplierId};
    use std::sync::Mutex;

    #[derive(Default)]
    struct FakeReceive {
        calls: Mutex<Vec<(String, Vec<ReceiveItem>, String)>>,
        next: Mutex<Option<ReceiveReceipt>>,
        error: Mutex<Option<AppError>>,
    }

    #[async_trait]
    impl ReceivePort for FakeReceive {
        async fn receive(
            &self,
            po_id: &PurchaseOrderId,
            items: &[ReceiveItem],
            user_id: &str,
        ) -> Result<ReceiveReceipt, AppError> {
            self.calls.lock().unwrap().push((
                po_id.0.clone(),
                items.to_vec(),
                user_id.to_string(),
            ));
            if let Some(err) = self.error.lock().unwrap().take() {
                return Err(err);
            }
            Ok(self
                .next
                .lock()
                .unwrap()
                .take()
                .unwrap_or_else(|| ReceiveReceipt {
                    po_id: po_id.clone(),
                    items_received: items.len() as i32,
                    roll_ids: Vec::new(),
                    partial: false,
                    completed_at: Some("2026-04-19T12:00:00Z".into()),
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
        async fn get(
            &self,
            _: &PurchaseOrderId,
        ) -> Result<Option<PurchaseOrder>, AppError> {
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
    struct FakeNotifier {
        received: Mutex<Vec<String>>,
    }

    #[async_trait]
    impl NotificationPort for FakeNotifier {
        async fn send_po_approved(
            &self,
            _po: &PurchaseOrder,
        ) -> Result<(), AppError> {
            Ok(())
        }
        async fn send_po_received(
            &self,
            po: &PurchaseOrder,
        ) -> Result<(), AppError> {
            self.received.lock().unwrap().push(po.id.0.clone());
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

    fn fake_po(id: &str) -> PurchaseOrder {
        PurchaseOrder {
            id: PurchaseOrderId(id.into()),
            po_number: "PO-26-0001".into(),
            supplier_id: SupplierId("sup-1".into()),
            status: PurchaseOrderStatus::Received,
            order_date: None,
            requested_delivery_date: None,
            actual_delivery_date: Some("2026-04-19".into()),
            subtotal: 100.0,
            tax_amount: 0.0,
            shipping_cost: 0.0,
            total_amount: 100.0,
            payment_terms: None,
            shipping_address: None,
            billing_address: None,
            notes: None,
            created_by: None,
            approved_by: None,
            approved_at: None,
            auto_generated: false,
            reorder_rule_id: None,
            created_at: None,
            updated_at: None,
        }
    }

    #[tokio::test]
    async fn rejects_empty_items() {
        let uc = ReceivePurchaseOrderUseCase::new(
            Arc::new(FakeReceive::default()),
            Arc::new(FakePo::default()),
            Arc::new(FakeNotifier::default()),
        );
        let err = uc
            .execute(PurchaseOrderId("po-1".into()), vec![], "user-1".into())
            .await
            .unwrap_err();
        assert!(matches!(err, AppError::InvalidInput(_)), "got {err:?}");
    }

    #[tokio::test]
    async fn rejects_negative_quantity() {
        let uc = ReceivePurchaseOrderUseCase::new(
            Arc::new(FakeReceive::default()),
            Arc::new(FakePo::default()),
            Arc::new(FakeNotifier::default()),
        );
        let err = uc
            .execute(
                PurchaseOrderId("po-1".into()),
                vec![ReceiveItem {
                    item_id: "poi-1".into(),
                    quantity_received: -1.0,
                    roll_data: None,
                }],
                "user-1".into(),
            )
            .await
            .unwrap_err();
        assert!(matches!(err, AppError::InvalidInput(_)));
    }

    #[tokio::test]
    async fn rejects_blank_item_id() {
        let uc = ReceivePurchaseOrderUseCase::new(
            Arc::new(FakeReceive::default()),
            Arc::new(FakePo::default()),
            Arc::new(FakeNotifier::default()),
        );
        let err = uc
            .execute(
                PurchaseOrderId("po-1".into()),
                vec![ReceiveItem {
                    item_id: "   ".into(),
                    quantity_received: 10.0,
                    roll_data: None,
                }],
                "user-1".into(),
            )
            .await
            .unwrap_err();
        assert!(matches!(err, AppError::InvalidInput(_)));
    }

    #[tokio::test]
    async fn fires_notification_on_successful_receive() {
        let receive = Arc::new(FakeReceive::default());
        let po = Arc::new(FakePo::default());
        *po.row.lock().unwrap() = Some(fake_po("po-1"));
        let notifier = Arc::new(FakeNotifier::default());
        let uc = ReceivePurchaseOrderUseCase::new(
            receive.clone(),
            po,
            notifier.clone(),
        );
        uc.execute(
            PurchaseOrderId("po-1".into()),
            vec![ReceiveItem {
                item_id: "poi-1".into(),
                quantity_received: 10.0,
                roll_data: None,
            }],
            "user-1".into(),
        )
        .await
        .unwrap();
        let fired = notifier.received.lock().unwrap();
        assert_eq!(fired.len(), 1);
        assert_eq!(fired[0], "po-1");
    }

    #[tokio::test]
    async fn does_not_fire_notification_on_partial_receive() {
        // Partial receipts leave the PO status untouched — TS
        // gates send_po_received the same way; otherwise every
        // box-of-stock arrival would fire "PO X received".
        let receive = Arc::new(FakeReceive::default());
        *receive.next.lock().unwrap() = Some(ReceiveReceipt {
            po_id: PurchaseOrderId("po-1".into()),
            items_received: 1,
            roll_ids: Vec::new(),
            partial: true,
            completed_at: None,
        });
        let po = Arc::new(FakePo::default());
        *po.row.lock().unwrap() = Some(fake_po("po-1"));
        let notifier = Arc::new(FakeNotifier::default());
        let uc = ReceivePurchaseOrderUseCase::new(
            receive,
            po,
            notifier.clone(),
        );
        let r = uc
            .execute(
                PurchaseOrderId("po-1".into()),
                vec![ReceiveItem {
                    item_id: "poi-1".into(),
                    quantity_received: 5.0,
                    roll_data: None,
                }],
                "user-1".into(),
            )
            .await
            .unwrap();
        assert!(r.partial);
        assert!(
            notifier.received.lock().unwrap().is_empty(),
            "partial receipts must not fire send_po_received"
        );
    }

    #[tokio::test]
    async fn surfaces_rpc_error() {
        let receive = Arc::new(FakeReceive::default());
        *receive.error.lock().unwrap() =
            Some(AppError::Conflict("PO_ALREADY_RECEIVED".into()));
        let uc = ReceivePurchaseOrderUseCase::new(
            receive,
            Arc::new(FakePo::default()),
            Arc::new(FakeNotifier::default()),
        );
        let err = uc
            .execute(
                PurchaseOrderId("po-1".into()),
                vec![ReceiveItem {
                    item_id: "poi-1".into(),
                    quantity_received: 10.0,
                    roll_data: None,
                }],
                "user-1".into(),
            )
            .await
            .unwrap_err();
        match err {
            AppError::Conflict(code) => assert_eq!(code, "PO_ALREADY_RECEIVED"),
            other => panic!("expected Conflict, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn swallows_notification_failure_but_returns_receipt() {
        // Notification port that errors — receipt should still come back
        // cleanly because the DB write is already committed. Use a
        // PO row on the fake so the use case attempts the notification.
        struct FailingNotifier;
        #[async_trait]
        impl NotificationPort for FailingNotifier {
            async fn send_po_approved(&self, _: &PurchaseOrder) -> Result<(), AppError> {
                unreachable!()
            }
            async fn send_po_received(&self, _: &PurchaseOrder) -> Result<(), AppError> {
                Err(AppError::Infrastructure("boom".into()))
            }
            async fn send_reorder_po_created(
                &self,
                _: &PurchaseOrder,
                _: &rf_domain::ReorderRule,
            ) -> Result<(), AppError> {
                unreachable!()
            }
        }
        let po = Arc::new(FakePo::default());
        *po.row.lock().unwrap() = Some(fake_po("po-1"));
        let uc = ReceivePurchaseOrderUseCase::new(
            Arc::new(FakeReceive::default()),
            po,
            Arc::new(FailingNotifier),
        );
        let receipt = uc
            .execute(
                PurchaseOrderId("po-1".into()),
                vec![ReceiveItem {
                    item_id: "poi-1".into(),
                    quantity_received: 10.0,
                    roll_data: None,
                }],
                "user-1".into(),
            )
            .await
            .unwrap();
        assert_eq!(receipt.items_received, 1);
    }
}
