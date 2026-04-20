//! HTTP handlers for the reorder → PO flow (S3c Task 7).
//!
//! Three entry points, one use case:
//!
//! - `POST /api/v2/reorder-rules/{id}/create-po` — row mode.
//!   Body: `{ supplier_id, quantity_sqft, unit_cost }`. The rule id
//!   from the path is passed as both `rule_ids[0]` and
//!   `items[0].rule_id`.
//! - `POST /api/v2/reorder-rules/create-pos` — individual batch.
//!   Body: `{ items: [{ rule_id, supplier_id, quantity_sqft,
//!   unit_cost }] }`. Each item invokes the use case independently;
//!   we aggregate the receipts.
//! - `POST /api/v2/reorder-rules/create-bulk-po` — supplier-grouped
//!   bulk. Body: `{ supplier_id, items: [{ rule_id, quantity_sqft,
//!   unit_cost }] }`. One PO with N line items.

use std::sync::Arc;

use axum::extract::{Path, Request, State};
use axum::http::StatusCode;
use axum::Json;
use rf_application::error::AppError;
use rf_application::procurement::{
    CreateReorderPurchaseOrderUseCase, ReorderPoItem, ReorderPoMode,
    ReorderPoReceipt,
};
use rf_domain::{ReorderRuleId, SupplierId};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::auth::{require_auth, AppState};
use crate::cuts::ApiError;

/// Response DTO — mirrors `ReorderPoReceipt` in snake_case.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ReorderPoReceiptDto {
    pub po_id: String,
    pub po_number: String,
    pub supplier_id: String,
    pub items_count: i32,
    pub subtotal: f64,
    pub rule_ids: Vec<String>,
    pub bulk: bool,
}

impl From<ReorderPoReceipt> for ReorderPoReceiptDto {
    fn from(r: ReorderPoReceipt) -> Self {
        Self {
            po_id: r.po_id.0,
            po_number: r.po_number,
            supplier_id: r.supplier_id.0,
            items_count: r.items_count,
            subtotal: r.subtotal,
            rule_ids: r.rule_ids.into_iter().map(|id| id.0).collect(),
            bulk: r.bulk,
        }
    }
}

// ---- Row mode ------------------------------------------------------------

#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct CreateReorderPoRowBody {
    pub supplier_id: String,
    pub quantity_sqft: f64,
    pub unit_cost: f64,
}

#[utoipa::path(
    post,
    path = "/api/v2/reorder-rules/{id}/create-po",
    tag = "procurement",
    params(("id" = String, Path, description = "Reorder rule UUID")),
    request_body = CreateReorderPoRowBody,
    responses(
        (status = 201, description = "PO created", body = ReorderPoReceiptDto),
        (status = 400, description = "Validation failed"),
        (status = 401, description = "Missing or invalid bearer token"),
        (
            status = 409,
            description = "RULE_NOT_FOUND, RULE_INACTIVE, SUPPLIER_NOT_FOUND, DUPLICATE_RULE_IDS, CHECK_VIOLATION, or FK_VIOLATION_PARENT_MISSING"
        ),
    ),
    security(("supabase_jwt" = []))
)]
pub async fn create_reorder_po_row(
    State(state): State<Arc<AppState>>,
    Path(rule_id): Path<String>,
    req: Request,
) -> Result<(StatusCode, Json<ReorderPoReceiptDto>), ApiError> {
    let auth = require_auth(&req).map_err(ApiError::from)?.clone();
    let actor = auth.claims.sub.clone();
    let body = req.into_body();
    let bytes = axum::body::to_bytes(body, 1024 * 1024)
        .await
        .map_err(|_| ApiError::App(AppError::InvalidInput("request body too large".into())))?;
    let incoming: CreateReorderPoRowBody = serde_json::from_slice(&bytes)
        .map_err(|e| ApiError::App(AppError::InvalidInput(format!("invalid JSON: {e}"))))?;

    let receipt = run_use_case(
        &state,
        &auth,
        ReorderPoMode::Row,
        vec![ReorderRuleId(rule_id.clone())],
        SupplierId(incoming.supplier_id),
        vec![ReorderPoItem {
            rule_id: ReorderRuleId(rule_id),
            quantity_sqft: incoming.quantity_sqft,
            unit_cost: incoming.unit_cost,
        }],
        actor,
    )
    .await?;
    Ok((StatusCode::CREATED, Json(receipt.into())))
}

// ---- Individual batch ----------------------------------------------------

#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct ReorderPoBatchItemBody {
    pub rule_id: String,
    pub supplier_id: String,
    pub quantity_sqft: f64,
    pub unit_cost: f64,
}

#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct CreateReorderPoBatchBody {
    pub items: Vec<ReorderPoBatchItemBody>,
}

#[utoipa::path(
    post,
    path = "/api/v2/reorder-rules/create-pos",
    tag = "procurement",
    request_body = CreateReorderPoBatchBody,
    responses(
        (
            status = 201,
            description = "All N items succeeded; response is an ordered array of N receipts. \
                           IMPORTANT: the handler is NOT transactional across items — each \
                           input runs its own RPC and commits independently. A mid-batch \
                           failure returns 4xx/5xx and earlier successes persist in the \
                           DB but are NOT returned in the response body. Clients should \
                           refetch the PO list (or retry just the failing items) after a \
                           partial-batch error rather than trust the current response \
                           body on failure.",
            body = [ReorderPoReceiptDto]
        ),
        (status = 400, description = "Validation failed (empty items / negative quantity / etc.)"),
        (status = 401, description = "Missing or invalid bearer token"),
        (
            status = 409,
            description = "RULE_NOT_FOUND, RULE_INACTIVE, SUPPLIER_NOT_FOUND, DUPLICATE_RULE_IDS, CHECK_VIOLATION, or FK_VIOLATION_PARENT_MISSING. Earlier items in the batch may have committed (see 201 notes)."
        ),
    ),
    security(("supabase_jwt" = []))
)]
pub async fn create_reorder_po_batch(
    State(state): State<Arc<AppState>>,
    req: Request,
) -> Result<(StatusCode, Json<Vec<ReorderPoReceiptDto>>), ApiError> {
    let auth = require_auth(&req).map_err(ApiError::from)?.clone();
    let actor = auth.claims.sub.clone();
    let body = req.into_body();
    let bytes = axum::body::to_bytes(body, 1024 * 1024)
        .await
        .map_err(|_| ApiError::App(AppError::InvalidInput("request body too large".into())))?;
    let incoming: CreateReorderPoBatchBody = serde_json::from_slice(&bytes)
        .map_err(|e| ApiError::App(AppError::InvalidInput(format!("invalid JSON: {e}"))))?;

    if incoming.items.is_empty() {
        return Err(ApiError::App(AppError::InvalidInput(
            "items must include at least one entry".into(),
        )));
    }

    let mut receipts: Vec<ReorderPoReceiptDto> = Vec::with_capacity(incoming.items.len());
    for item in incoming.items {
        // Each batch item is its own Row-mode call — one RPC
        // transaction per PO. Partial failure is possible across
        // items; the response includes receipts for successes,
        // and the first error surfaces through `?`. The client
        // can retry just the failed items.
        let receipt = run_use_case(
            &state,
            &auth,
            ReorderPoMode::IndividualBatch,
            vec![ReorderRuleId(item.rule_id.clone())],
            SupplierId(item.supplier_id),
            vec![ReorderPoItem {
                rule_id: ReorderRuleId(item.rule_id),
                quantity_sqft: item.quantity_sqft,
                unit_cost: item.unit_cost,
            }],
            actor.clone(),
        )
        .await?;
        receipts.push(receipt.into());
    }
    Ok((StatusCode::CREATED, Json(receipts)))
}

// ---- Supplier-grouped bulk ----------------------------------------------

#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct ReorderPoBulkItemBody {
    pub rule_id: String,
    pub quantity_sqft: f64,
    pub unit_cost: f64,
}

#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct CreateReorderPoBulkBody {
    pub supplier_id: String,
    pub items: Vec<ReorderPoBulkItemBody>,
}

#[utoipa::path(
    post,
    path = "/api/v2/reorder-rules/create-bulk-po",
    tag = "procurement",
    request_body = CreateReorderPoBulkBody,
    responses(
        (status = 201, description = "Bulk PO created (1 PO, N line items)", body = ReorderPoReceiptDto),
        (status = 400, description = "Validation failed"),
        (status = 401, description = "Missing or invalid bearer token"),
        (
            status = 409,
            description = "RULE_NOT_FOUND, RULE_INACTIVE, SUPPLIER_NOT_FOUND, CHECK_VIOLATION, or FK_VIOLATION_PARENT_MISSING (transactional — any failure rolls back the entire bulk PO)"
        ),
    ),
    security(("supabase_jwt" = []))
)]
pub async fn create_reorder_po_bulk(
    State(state): State<Arc<AppState>>,
    req: Request,
) -> Result<(StatusCode, Json<ReorderPoReceiptDto>), ApiError> {
    let auth = require_auth(&req).map_err(ApiError::from)?.clone();
    let actor = auth.claims.sub.clone();
    let body = req.into_body();
    let bytes = axum::body::to_bytes(body, 1024 * 1024)
        .await
        .map_err(|_| ApiError::App(AppError::InvalidInput("request body too large".into())))?;
    let incoming: CreateReorderPoBulkBody = serde_json::from_slice(&bytes)
        .map_err(|e| ApiError::App(AppError::InvalidInput(format!("invalid JSON: {e}"))))?;

    if incoming.items.is_empty() {
        return Err(ApiError::App(AppError::InvalidInput(
            "items must include at least one entry".into(),
        )));
    }
    let rule_ids: Vec<ReorderRuleId> = incoming
        .items
        .iter()
        .map(|i| ReorderRuleId(i.rule_id.clone()))
        .collect();
    let items: Vec<ReorderPoItem> = incoming
        .items
        .into_iter()
        .map(|i| ReorderPoItem {
            rule_id: ReorderRuleId(i.rule_id),
            quantity_sqft: i.quantity_sqft,
            unit_cost: i.unit_cost,
        })
        .collect();

    let receipt = run_use_case(
        &state,
        &auth,
        ReorderPoMode::Bulk,
        rule_ids,
        SupplierId(incoming.supplier_id),
        items,
        actor,
    )
    .await?;
    Ok((StatusCode::CREATED, Json(receipt.into())))
}

// ---- shared ---------------------------------------------------------------

/// Collapses the factory-resolve + use-case-construct + execute
/// boilerplate shared by all three paths. Using a helper keeps the
/// handler bodies small enough to scan alongside their OpenAPI
/// annotations.
async fn run_use_case(
    state: &Arc<AppState>,
    auth: &crate::auth::AuthContext,
    mode: ReorderPoMode,
    rule_ids: Vec<ReorderRuleId>,
    supplier_id: SupplierId,
    items: Vec<ReorderPoItem>,
    actor: String,
) -> Result<ReorderPoReceipt, ApiError> {
    let rpc_port = state
        .procurement_factory
        .create_reorder_po(auth)
        .map_err(ApiError::App)?;
    let po_port = state
        .procurement_factory
        .purchase_orders(auth)
        .map_err(ApiError::App)?;
    let rule_port = state
        .procurement_factory
        .reorder_rules(auth)
        .map_err(ApiError::App)?;
    let notifications = state
        .procurement_factory
        .notifications(auth)
        .map_err(ApiError::App)?;
    let use_case = CreateReorderPurchaseOrderUseCase::new(
        rpc_port,
        po_port,
        rule_port,
        notifications,
    );
    use_case
        .execute(mode, rule_ids, supplier_id, items, actor)
        .await
        .map_err(ApiError::App)
}
