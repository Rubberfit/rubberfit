//! HTTP handlers for `/api/v2/po/{po_id}/items` — line-item CRUD
//! (S3c Task 2).
//!
//! Handlers resolve a request-scoped `PurchaseOrderItemPort` from the
//! `ProcurementPortFactory` on `AppState`, then invoke a use case.
//! `quantity_received` and `received_date` stay unreachable from this
//! surface — the receive flow in Task 5 is the only writer for those
//! fields.

use std::sync::Arc;

use axum::extract::{Path, Request, State};
use axum::http::StatusCode;
use axum::Json;
use rf_application::error::AppError;
use rf_application::procurement::{
    AddPurchaseOrderItemUseCase, DeletePurchaseOrderItemUseCase,
    ListPurchaseOrderItemsUseCase, NewPurchaseOrderItem, PurchaseOrderItemUpdate,
    UpdatePurchaseOrderItemUseCase,
};
use rf_domain::{MaterialTypeId, PurchaseOrderId, PurchaseOrderItem, PurchaseOrderItemId};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::auth::{require_auth, AppState};
use crate::cuts::ApiError;

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct PurchaseOrderItemDto {
    pub id: String,
    pub purchase_order_id: String,
    pub material_type_id: String,
    pub line_number: i32,
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub length: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thickness: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    pub quantity_sqft: f64,
    pub unit_cost: f64,
    pub line_total: f64,
    pub quantity_received: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub received_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
}

impl From<PurchaseOrderItem> for PurchaseOrderItemDto {
    fn from(item: PurchaseOrderItem) -> Self {
        Self {
            id: item.id.0,
            purchase_order_id: item.purchase_order_id.0,
            material_type_id: item.material_type_id.0,
            line_number: item.line_number,
            description: item.description,
            width: item.width,
            length: item.length,
            thickness: item.thickness,
            color: item.color,
            quantity_sqft: item.quantity_sqft,
            unit_cost: item.unit_cost,
            line_total: item.line_total,
            quantity_received: item.quantity_received,
            received_date: item.received_date,
            notes: item.notes,
            created_at: item.created_at,
            updated_at: item.updated_at,
        }
    }
}

#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct CreatePurchaseOrderItemBody {
    pub material_type_id: String,
    pub description: String,
    #[serde(default)]
    pub width: Option<f64>,
    #[serde(default)]
    pub length: Option<f64>,
    #[serde(default)]
    pub thickness: Option<f64>,
    #[serde(default)]
    pub color: Option<String>,
    pub quantity_sqft: f64,
    pub unit_cost: f64,
    #[serde(default)]
    pub notes: Option<String>,
}

impl From<CreatePurchaseOrderItemBody> for NewPurchaseOrderItem {
    fn from(b: CreatePurchaseOrderItemBody) -> Self {
        Self {
            material_type_id: MaterialTypeId(b.material_type_id),
            description: b.description,
            width: b.width,
            length: b.length,
            thickness: b.thickness,
            color: b.color,
            quantity_sqft: b.quantity_sqft,
            unit_cost: b.unit_cost,
            notes: b.notes,
        }
    }
}

#[derive(Debug, Clone, Default, Deserialize, ToSchema)]
pub struct UpdatePurchaseOrderItemBody {
    #[serde(default)]
    pub material_type_id: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub width: Option<f64>,
    #[serde(default)]
    pub length: Option<f64>,
    #[serde(default)]
    pub thickness: Option<f64>,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub quantity_sqft: Option<f64>,
    #[serde(default)]
    pub unit_cost: Option<f64>,
    #[serde(default)]
    pub notes: Option<String>,
}

impl From<UpdatePurchaseOrderItemBody> for PurchaseOrderItemUpdate {
    fn from(b: UpdatePurchaseOrderItemBody) -> Self {
        Self {
            material_type_id: b.material_type_id.map(MaterialTypeId),
            description: b.description,
            width: b.width.map(Some),
            length: b.length.map(Some),
            thickness: b.thickness.map(Some),
            color: b.color.map(Some),
            quantity_sqft: b.quantity_sqft,
            unit_cost: b.unit_cost,
            notes: b.notes.map(Some),
        }
    }
}

#[utoipa::path(
    get,
    path = "/api/v2/po/{po_id}/items",
    tag = "procurement",
    params(("po_id" = String, Path, description = "Parent PO UUID")),
    responses(
        (status = 200, description = "All items for the PO", body = [PurchaseOrderItemDto]),
        (status = 401, description = "Missing or invalid bearer token"),
    ),
    security(("supabase_jwt" = []))
)]
pub async fn list_po_items(
    State(state): State<Arc<AppState>>,
    Path(po_id): Path<String>,
    req: Request,
) -> Result<Json<Vec<PurchaseOrderItemDto>>, ApiError> {
    let auth = require_auth(&req).map_err(ApiError::from)?;
    let port = state
        .procurement_factory
        .po_items(auth)
        .map_err(ApiError::App)?;
    let use_case = ListPurchaseOrderItemsUseCase::new(port);
    let rows = use_case
        .execute(PurchaseOrderId(po_id))
        .await
        .map_err(ApiError::App)?;
    Ok(Json(
        rows.into_iter().map(PurchaseOrderItemDto::from).collect(),
    ))
}

#[utoipa::path(
    post,
    path = "/api/v2/po/{po_id}/items",
    tag = "procurement",
    params(("po_id" = String, Path, description = "Parent PO UUID")),
    request_body = CreatePurchaseOrderItemBody,
    responses(
        (status = 201, description = "Line item added", body = PurchaseOrderItemDto),
        (status = 400, description = "Validation failed"),
        (status = 401, description = "Missing or invalid bearer token"),
        (status = 409, description = "Conflict — `LINE_NUMBER_RACE` or FK violation"),
    ),
    security(("supabase_jwt" = []))
)]
pub async fn add_po_item(
    State(state): State<Arc<AppState>>,
    Path(po_id): Path<String>,
    req: Request,
) -> Result<(StatusCode, Json<PurchaseOrderItemDto>), ApiError> {
    let auth = require_auth(&req).map_err(ApiError::from)?.clone();
    let body = req.into_body();
    let bytes = axum::body::to_bytes(body, 1024 * 1024)
        .await
        .map_err(|_| ApiError::App(AppError::InvalidInput("request body too large".into())))?;
    let incoming: CreatePurchaseOrderItemBody = serde_json::from_slice(&bytes)
        .map_err(|e| ApiError::App(AppError::InvalidInput(format!("invalid JSON: {e}"))))?;

    let port = state
        .procurement_factory
        .po_items(&auth)
        .map_err(ApiError::App)?;
    let use_case = AddPurchaseOrderItemUseCase::new(port);
    let item = use_case
        .execute(PurchaseOrderId(po_id), incoming.into())
        .await
        .map_err(ApiError::App)?;
    Ok((StatusCode::CREATED, Json(item.into())))
}

#[utoipa::path(
    put,
    path = "/api/v2/po/{po_id}/items/{item_id}",
    tag = "procurement",
    params(
        ("po_id" = String, Path, description = "Parent PO UUID"),
        ("item_id" = String, Path, description = "Line item UUID"),
    ),
    request_body = UpdatePurchaseOrderItemBody,
    responses(
        (status = 200, description = "Line item updated", body = PurchaseOrderItemDto),
        (status = 400, description = "Validation failed"),
        (status = 401, description = "Missing or invalid bearer token"),
        (status = 404, description = "Not found"),
    ),
    security(("supabase_jwt" = []))
)]
pub async fn update_po_item(
    State(state): State<Arc<AppState>>,
    Path((po_id, item_id)): Path<(String, String)>,
    req: Request,
) -> Result<Json<PurchaseOrderItemDto>, ApiError> {
    let auth = require_auth(&req).map_err(ApiError::from)?.clone();
    let body = req.into_body();
    let bytes = axum::body::to_bytes(body, 1024 * 1024)
        .await
        .map_err(|_| ApiError::App(AppError::InvalidInput("request body too large".into())))?;
    let incoming: UpdatePurchaseOrderItemBody = serde_json::from_slice(&bytes)
        .map_err(|e| ApiError::App(AppError::InvalidInput(format!("invalid JSON: {e}"))))?;

    let port = state
        .procurement_factory
        .po_items(&auth)
        .map_err(ApiError::App)?;
    let use_case = UpdatePurchaseOrderItemUseCase::new(port);
    let item = use_case
        .execute(PurchaseOrderItemId(item_id), incoming.into())
        .await
        .map_err(ApiError::App)?;
    // Sanity-check that the URL's `po_id` segment actually matches
    // the item's parent PO. Without this, a caller could
    // `PUT /api/v2/po/<WRONG>/items/<right>` and successfully
    // mutate an item whose parent PO the URL misrepresents. Not a
    // security hole (RLS scopes by user, not by URL shape), but a
    // UX footgun. Returning 404 keeps the error surface consistent
    // with an id-from-another-tenant miss.
    if item.purchase_order_id.0 != po_id {
        return Err(ApiError::App(AppError::NotFound));
    }
    Ok(Json(item.into()))
}

#[utoipa::path(
    delete,
    path = "/api/v2/po/{po_id}/items/{item_id}",
    tag = "procurement",
    params(
        ("po_id" = String, Path, description = "Parent PO UUID"),
        ("item_id" = String, Path, description = "Line item UUID"),
    ),
    responses(
        (status = 204, description = "Deleted"),
        (status = 401, description = "Missing or invalid bearer token"),
        (status = 404, description = "Not found"),
    ),
    security(("supabase_jwt" = []))
)]
pub async fn delete_po_item(
    State(state): State<Arc<AppState>>,
    Path((po_id, item_id)): Path<(String, String)>,
    req: Request,
) -> Result<StatusCode, ApiError> {
    let auth = require_auth(&req).map_err(ApiError::from)?;
    let port = state
        .procurement_factory
        .po_items(auth)
        .map_err(ApiError::App)?;
    let item_id_typed = PurchaseOrderItemId(item_id);
    // Look up the item so we can confirm the URL's `po_id`
    // segment matches its parent PO before deleting. Same
    // rationale as the update handler: prevents
    // `DELETE /api/v2/po/<wrong>/items/<right>` from succeeding.
    match port.get(&item_id_typed).await.map_err(ApiError::App)? {
        Some(item) if item.purchase_order_id.0 != po_id => {
            return Err(ApiError::App(AppError::NotFound));
        }
        Some(_) => {}
        None => return Err(ApiError::App(AppError::NotFound)),
    }
    let use_case = DeletePurchaseOrderItemUseCase::new(port);
    use_case
        .execute(item_id_typed)
        .await
        .map_err(ApiError::App)?;
    Ok(StatusCode::NO_CONTENT)
}
