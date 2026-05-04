//! HTTP handler for `PUT /api/v2/po/{id}/status` — status
//! transitions (S3c Task 3).
//!
//! This is the generic dropdown path. Enforces the state machine +
//! the terminal-via-receive-only rule via
//! `UpdatePurchaseOrderStatusUseCase`. `received` as a target
//! returns 409 `RECEIVED_REQUIRES_RECEIVE_FLOW` with an echoed
//! `allowedTargets` list so the UI can surface the real next
//! options without another round-trip.
//!
//! The caller's user id (from the verified JWT `sub` claim) is
//! threaded down as the `actor` so the approve path can stamp
//! `approved_by` inside the DB write.

use std::sync::Arc;

use axum::extract::{Path, Request, State};
use axum::Json;
use rf_application::error::AppError;
use rf_application::procurement::UpdatePurchaseOrderStatusUseCase;
use rf_domain::{PurchaseOrderId, PurchaseOrderStatus};
use serde::Deserialize;
use utoipa::ToSchema;

use crate::auth::{require_auth, AppState};
use crate::cuts::ApiError;

use super::purchase_orders::PurchaseOrderDto;

/// `PUT /api/v2/po/{id}/status` body. `status` is the lowercase
/// string variant (`draft` / `pending` / `approved` / `ordered` /
/// `cancelled`). `received` is accepted on the wire but rejected
/// in the use case with a 409 — we deliberately don't drop it at
/// parse time so the error carries the structured
/// `allowedTargets` payload the UI consumes.
#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct UpdatePurchaseOrderStatusBody {
    pub status: String,
}

fn parse_status(s: &str) -> Result<PurchaseOrderStatus, AppError> {
    match s {
        "draft" => Ok(PurchaseOrderStatus::Draft),
        "pending" => Ok(PurchaseOrderStatus::Pending),
        "approved" => Ok(PurchaseOrderStatus::Approved),
        "ordered" => Ok(PurchaseOrderStatus::Ordered),
        "received" => Ok(PurchaseOrderStatus::Received),
        "cancelled" => Ok(PurchaseOrderStatus::Cancelled),
        other => Err(AppError::InvalidInput(format!("unknown status '{other}'"))),
    }
}

#[utoipa::path(
    put,
    path = "/api/v2/po/{id}/status",
    tag = "procurement",
    params(("id" = String, Path, description = "Purchase order UUID")),
    request_body = UpdatePurchaseOrderStatusBody,
    responses(
        (status = 200, description = "Status updated", body = PurchaseOrderDto),
        (status = 400, description = "Unknown status string"),
        (status = 401, description = "Missing or invalid bearer token"),
        (status = 404, description = "PO not found"),
        (
            status = 409,
            description = "Invalid transition. Body is \
                `{ code: \"INVALID_STATE_TRANSITION\" | \
                \"RECEIVED_REQUIRES_RECEIVE_FLOW\", \
                details: { allowedTargets: [...] } }`. Received is \
                only reachable via /api/v2/po/{id}/receive (Task 5)."
        ),
    ),
    security(("supabase_jwt" = []))
)]
pub async fn update_purchase_order_status(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    req: Request,
) -> Result<Json<PurchaseOrderDto>, ApiError> {
    let auth = require_auth(&req).map_err(ApiError::from)?.clone();
    let actor = auth.claims.sub.clone();
    let body = req.into_body();
    let bytes = axum::body::to_bytes(body, 1024 * 1024)
        .await
        .map_err(|_| ApiError::App(AppError::InvalidInput("request body too large".into())))?;
    let incoming: UpdatePurchaseOrderStatusBody = serde_json::from_slice(&bytes)
        .map_err(|e| ApiError::App(AppError::InvalidInput(format!("invalid JSON: {e}"))))?;
    let target = parse_status(&incoming.status).map_err(ApiError::App)?;

    let port = state
        .procurement_factory
        .purchase_orders(&auth)
        .map_err(ApiError::App)?;
    let notifications = state
        .procurement_factory
        .notifications(&auth)
        .map_err(ApiError::App)?;

    let use_case = UpdatePurchaseOrderStatusUseCase::new(port, notifications);
    let po = use_case
        .execute(PurchaseOrderId(id), target, Some(actor))
        .await
        .map_err(ApiError::App)?;
    Ok(Json(po.into()))
}
