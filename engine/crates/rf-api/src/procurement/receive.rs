//! `POST /api/v2/po/{id}/receive` (S3c Task 5).
//!
//! Wires the HTTP body shape to
//! `rf-application::procurement::ReceivePurchaseOrderUseCase`.
//! Request validation (non-empty items, finite quantities, non-blank
//! item_id) lives in the use case so a raw programmatic caller hits
//! the same guard as a browser.

use std::sync::Arc;

use axum::extract::{Path, Request, State};
use axum::Json;
use rf_application::error::AppError;
use rf_application::procurement::{
    ReceiveItem, ReceivePurchaseOrderUseCase, ReceiveReceipt, ReceiveRollData,
};
use rf_domain::PurchaseOrderId;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::auth::{require_auth, AppState};
use crate::cuts::ApiError;

#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct ReceiveItemBody {
    pub item_id: String,
    pub quantity_received: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub roll_data: Option<ReceiveRollDataBody>,
}

#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct ReceiveRollDataBody {
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

#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct ReceivePurchaseOrderBody {
    pub items: Vec<ReceiveItemBody>,
}

impl From<ReceiveRollDataBody> for ReceiveRollData {
    fn from(b: ReceiveRollDataBody) -> Self {
        Self {
            width: b.width,
            length: b.length,
            thickness: b.thickness,
            color: b.color,
            location: b.location,
        }
    }
}

impl From<ReceiveItemBody> for ReceiveItem {
    fn from(b: ReceiveItemBody) -> Self {
        Self {
            item_id: b.item_id,
            quantity_received: b.quantity_received,
            roll_data: b.roll_data.map(ReceiveRollData::from),
        }
    }
}

/// Response DTO — JSON representation of `ReceiveReceipt`. Kept
/// separate so the HTTP shape can evolve without touching the
/// use-case struct.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ReceiveReceiptDto {
    pub po_id: String,
    pub items_received: i32,
    pub roll_ids: Vec<String>,
    pub partial: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<String>,
}

impl From<ReceiveReceipt> for ReceiveReceiptDto {
    fn from(r: ReceiveReceipt) -> Self {
        Self {
            po_id: r.po_id.0,
            items_received: r.items_received,
            roll_ids: r.roll_ids.into_iter().map(|id| id.0).collect(),
            partial: r.partial,
            completed_at: r.completed_at,
        }
    }
}

#[utoipa::path(
    post,
    path = "/api/v2/po/{id}/receive",
    tag = "procurement",
    params(("id" = String, Path, description = "Purchase order UUID")),
    request_body = ReceivePurchaseOrderBody,
    responses(
        (status = 200, description = "Receive flow completed (or partial)", body = ReceiveReceiptDto),
        (status = 400, description = "Validation failed (empty items, bad quantity, etc.)"),
        (status = 401, description = "Missing or invalid bearer token"),
        (
            status = 409,
            description = "PO_ALREADY_RECEIVED / PO_NOT_FOUND / PO_ITEM_NOT_FOUND / CHECK_VIOLATION / FK_VIOLATION_PARENT_MISSING"
        ),
    ),
    security(("supabase_jwt" = []))
)]
pub async fn receive_purchase_order(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    req: Request,
) -> Result<Json<ReceiveReceiptDto>, ApiError> {
    let auth = require_auth(&req).map_err(ApiError::from)?.clone();
    // `approved_by` is threaded into receive as the user id stamped
    // on rolls.user_id. Use the verified `sub` claim so RLS and
    // audit agree on who received the stock.
    let actor = auth.claims.sub.clone();
    let body = req.into_body();
    let bytes = axum::body::to_bytes(body, 1024 * 1024)
        .await
        .map_err(|_| ApiError::App(AppError::InvalidInput("request body too large".into())))?;
    let incoming: ReceivePurchaseOrderBody = serde_json::from_slice(&bytes)
        .map_err(|e| ApiError::App(AppError::InvalidInput(format!("invalid JSON: {e}"))))?;

    let items: Vec<ReceiveItem> =
        incoming.items.into_iter().map(ReceiveItem::from).collect();

    let receive_port = state
        .procurement_factory
        .receive(&auth)
        .map_err(ApiError::App)?;
    let po_port = state
        .procurement_factory
        .purchase_orders(&auth)
        .map_err(ApiError::App)?;
    let notifications = state
        .procurement_factory
        .notifications(&auth)
        .map_err(ApiError::App)?;

    let use_case =
        ReceivePurchaseOrderUseCase::new(receive_port, po_port, notifications);
    let receipt = use_case
        .execute(PurchaseOrderId(id), items, actor)
        .await
        .map_err(ApiError::App)?;
    Ok(Json(receipt.into()))
}
