//! PostgREST-backed `NotificationPort` (S3c Task 3).
//!
//! Writes into TWO tables per the existing notifications gotcha
//! (see CLAUDE.md "Notifications gotcha"):
//!
//! - `notifications` — in-app feed (the bell icon + notifications
//!   page). PO events are not in the CHECK constraint's enum, so
//!   they land as `system_alert` with a descriptive title/body.
//! - `notification_queue` — async email/SMS dispatch; the CHECK
//!   there DOES include `po_approved`, `delivery_received`, etc.,
//!   so we stamp the specific type.
//!
//! Both writes are best-effort from the caller's perspective —
//! `UpdatePurchaseOrderStatusUseCase` drops the error rather than
//! rolling back a successful status flip. The adapter still returns
//! errors so the call site can log/trace if it wants to.

use async_trait::async_trait;
use rf_application::error::AppError;
use rf_application::notifications::NotificationPort;
use rf_domain::{PurchaseOrder, ReorderRule};
use serde::Serialize;

use crate::postgrest::PostgrestClient;

/// Fan-out audience for procurement notifications on the queue side.
/// The TS service writes this same literal; the email dispatcher
/// resolves it to the subscriber list at send time. Keeping it as
/// a named const avoids ad-hoc drift if the sentinel changes.
const QUEUE_AUDIENCE: &str = "procurement-watchers";

pub struct SupabaseNotificationRepository {
    client: PostgrestClient,
}

impl SupabaseNotificationRepository {
    pub fn new(client: PostgrestClient) -> Self {
        Self { client }
    }
}

#[derive(Serialize)]
struct InAppRow<'a> {
    /// The `notifications` table CHECK constraint allows
    /// `low_stock | roll_depleted | cut_completed | system_alert`.
    /// PO events don't fit — fall through to `system_alert` with a
    /// descriptive title so the feed is still scannable.
    #[serde(rename = "type")]
    kind: &'static str,
    title: String,
    description: Option<&'a str>,
}

#[derive(Serialize)]
struct QueueRow<'a> {
    user_identifier: &'a str,
    notification_type: &'static str,
    title: String,
    message: String,
    send_email: bool,
    priority: &'static str,
}

impl SupabaseNotificationRepository {
    async fn write_in_app(&self, title: String, description: Option<&str>) -> Result<(), AppError> {
        let row = InAppRow {
            kind: "system_alert",
            title,
            description,
        };
        // Discard the returned row — we don't need the id for
        // anything. `Vec<serde_json::Value>` just satisfies the
        // deserialize constraint on PostgREST's representation
        // response.
        let _: Vec<serde_json::Value> = self
            .client
            .post("/rest/v1/notifications", &row)
            .await
            .map_err(AppError::infrastructure)?;
        Ok(())
    }

    async fn write_queue_broadcast(
        &self,
        notification_type: &'static str,
        title: String,
        message: String,
    ) -> Result<(), AppError> {
        // The queue schema requires `user_identifier`; we don't
        // have a subscriber list here. Use the QUEUE_AUDIENCE
        // sentinel the TS service already writes — the email
        // dispatcher's `processEmailQueue` resolves it to actual
        // subscribers at send time.
        let row = QueueRow {
            user_identifier: QUEUE_AUDIENCE,
            notification_type,
            title,
            message,
            send_email: true,
            priority: "normal",
        };
        let _: Vec<serde_json::Value> = self
            .client
            .post("/rest/v1/notification_queue", &row)
            .await
            .map_err(AppError::infrastructure)?;
        Ok(())
    }
}

impl SupabaseNotificationRepository {
    /// Run both the in-app feed write and the queue dispatch
    /// independently so a failure on one path doesn't starve the
    /// other. The channels serve different consumers (bell icon vs.
    /// email/SMS); partial delivery is better than none. If either
    /// side fails we still surface the first error to the caller,
    /// but only after both have been attempted.
    async fn broadcast(
        &self,
        in_app_title: String,
        in_app_description: String,
        queue_type: &'static str,
    ) -> Result<(), AppError> {
        let in_app = self
            .write_in_app(in_app_title.clone(), Some(&in_app_description))
            .await;
        let queue = self
            .write_queue_broadcast(queue_type, in_app_title, in_app_description)
            .await;
        match (in_app, queue) {
            (Ok(()), Ok(())) => Ok(()),
            (Err(e), _) | (_, Err(e)) => Err(e),
        }
    }
}

#[async_trait]
impl NotificationPort for SupabaseNotificationRepository {
    async fn send_po_approved(&self, po: &PurchaseOrder) -> Result<(), AppError> {
        let title = format!("PO {} approved", po.po_number);
        // Supplier id is a UUID — not pretty on the bell-icon feed
        // but acceptable here. A follow-up can hydrate the supplier
        // name via the embedded `?select=*,suppliers(name)` pattern
        // used in S3b's material_suppliers adapter; keeping it
        // simple for now rather than threading a name onto the
        // domain type or adding a fan-out query.
        let description = format!("Purchase order {} has been approved.", po.po_number);
        self.broadcast(title, description, "po_approved").await
    }

    async fn send_po_received(&self, po: &PurchaseOrder) -> Result<(), AppError> {
        let title = format!("PO {} received", po.po_number);
        let description = format!("Purchase order {} has been marked received.", po.po_number);
        self.broadcast(title, description, "delivery_received")
            .await
    }

    async fn send_reorder_po_created(
        &self,
        po: &PurchaseOrder,
        rule: &ReorderRule,
    ) -> Result<(), AppError> {
        let title = format!("Reorder PO {} created", po.po_number);
        let description = format!(
            "Reorder rule {} triggered PO {} for material {}.",
            rule.id.0, po.po_number, rule.material_type_id.0
        );
        self.broadcast(title, description, "po_created").await
    }
}
