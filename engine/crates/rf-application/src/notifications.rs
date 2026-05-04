//! Notification side-effect port.
//!
//! Some procurement use cases (approve PO, receive PO, create reorder
//! PO) fire user-visible notifications — in-app toast/feed entries +
//! queued email/SMS. S3c ports those side effects off the TS
//! use-cases and into the Rust pipeline so flag-ON users don't lose
//! behavior during the cutover (see S3c plan §"Notifications ported
//! into Rust use cases").
//!
//! The port is intentionally narrow: one method per triggered event,
//! no generic "send(template, ctx)" surface. That keeps the adapter
//! free to decide how each event maps to rows on `notifications` and
//! `notification_queue` — including the CHECK constraint workaround
//! where non-low-stock events persist as `system_alert`.

use async_trait::async_trait;

use rf_domain::{PurchaseOrder, ReorderRule};

use crate::error::AppError;

/// Side-effect sink for procurement-driven notifications.
///
/// Adapter writes to `notifications` (in-app feed) +
/// `notification_queue` (email/SMS dispatch) as appropriate. Low-
/// stock notifications and supplier-rating recompute stay on the
/// existing Postgres triggers — those are NOT represented here.
#[async_trait]
pub trait NotificationPort: Send + Sync {
    /// Fired when a PO transitions to `approved` via the generic
    /// status-update path. Mirrors the TS
    /// `approve-purchase-order.use-case.ts` side effect.
    async fn send_po_approved(&self, po: &PurchaseOrder) -> Result<(), AppError>;

    /// Fired after `receive_purchase_order` RPC succeeds. Mirrors
    /// `receive-purchase-order.use-case.ts`.
    async fn send_po_received(&self, po: &PurchaseOrder) -> Result<(), AppError>;

    /// Fired after `create_reorder_purchase_order` RPC succeeds.
    /// Mirrors `create-reorder-purchase-order.use-case.ts`.
    async fn send_reorder_po_created(
        &self,
        po: &PurchaseOrder,
        rule: &ReorderRule,
    ) -> Result<(), AppError>;
}
