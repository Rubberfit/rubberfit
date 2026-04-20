//! HTTP handlers for `/api/v2/po` — PurchaseOrder CRUD (S3c Task 2).
//!
//! Handlers are thin adapters over
//! `rf-application::procurement::purchase_orders`. Delivery pattern
//! matches the S3b inventory handlers: pull `AuthContext`, resolve a
//! request-scoped port from the factory on `AppState`, invoke a use
//! case, shape the result as a DTO.

use std::sync::Arc;

use axum::extract::{Path, Query, Request, State};
use axum::http::StatusCode;
use axum::Json;
use rf_application::error::AppError;
use rf_application::procurement::{
    CreatePurchaseOrderUseCase, DeletePurchaseOrderUseCase, GetPurchaseOrderUseCase,
    ListPurchaseOrdersUseCase, NewPurchaseOrder, PurchaseOrderUpdate,
    UpdatePurchaseOrderUseCase,
};
use rf_domain::{
    PurchaseOrder, PurchaseOrderFilters, PurchaseOrderId, PurchaseOrderStatus, SupplierId,
};
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};

use crate::auth::{require_auth, AppState};
use crate::cuts::ApiError;

/// Response DTO — mirrors the domain struct. Separate so the HTTP
/// surface can diverge from the domain without a domain change.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct PurchaseOrderDto {
    pub id: String,
    pub po_number: String,
    pub supplier_id: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub order_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub requested_delivery_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub actual_delivery_date: Option<String>,
    pub subtotal: f64,
    pub tax_amount: f64,
    pub shipping_cost: f64,
    pub total_amount: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payment_terms: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shipping_address: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub billing_address: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_by: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub approved_by: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub approved_at: Option<String>,
    pub auto_generated: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reorder_rule_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
}

impl From<PurchaseOrder> for PurchaseOrderDto {
    fn from(po: PurchaseOrder) -> Self {
        Self {
            id: po.id.0,
            po_number: po.po_number,
            supplier_id: po.supplier_id.0,
            status: po.status.as_str().to_string(),
            order_date: po.order_date,
            requested_delivery_date: po.requested_delivery_date,
            actual_delivery_date: po.actual_delivery_date,
            subtotal: po.subtotal,
            tax_amount: po.tax_amount,
            shipping_cost: po.shipping_cost,
            total_amount: po.total_amount,
            payment_terms: po.payment_terms,
            shipping_address: po.shipping_address,
            billing_address: po.billing_address,
            notes: po.notes,
            created_by: po.created_by,
            approved_by: po.approved_by,
            approved_at: po.approved_at,
            auto_generated: po.auto_generated,
            reorder_rule_id: po.reorder_rule_id.map(|r| r.0),
            created_at: po.created_at,
            updated_at: po.updated_at,
        }
    }
}

/// List query — all filters optional.
#[derive(Debug, Clone, Default, Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct ListPurchaseOrdersQuery {
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub supplier_id: Option<String>,
    #[serde(default)]
    pub auto_generated: Option<bool>,
    #[serde(default)]
    pub q: Option<String>,
    #[serde(default)]
    pub limit: Option<u32>,
    #[serde(default)]
    pub offset: Option<u32>,
}

fn parse_status(s: &str) -> Result<PurchaseOrderStatus, AppError> {
    match s {
        "draft" => Ok(PurchaseOrderStatus::Draft),
        "pending" => Ok(PurchaseOrderStatus::Pending),
        "approved" => Ok(PurchaseOrderStatus::Approved),
        "ordered" => Ok(PurchaseOrderStatus::Ordered),
        "received" => Ok(PurchaseOrderStatus::Received),
        "cancelled" => Ok(PurchaseOrderStatus::Cancelled),
        other => Err(AppError::InvalidInput(format!(
            "unknown status '{other}'"
        ))),
    }
}

impl TryFrom<ListPurchaseOrdersQuery> for PurchaseOrderFilters {
    type Error = AppError;
    fn try_from(q: ListPurchaseOrdersQuery) -> Result<Self, Self::Error> {
        Ok(Self {
            status: q.status.as_deref().map(parse_status).transpose()?,
            supplier_id: q.supplier_id.map(SupplierId),
            auto_generated: q.auto_generated,
            search: q.q,
            limit: q.limit,
            offset: q.offset,
        })
    }
}

/// Body for POST. `status` defaults to `draft` server-side if omitted.
#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct CreatePurchaseOrderBody {
    pub supplier_id: String,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub order_date: Option<String>,
    #[serde(default)]
    pub requested_delivery_date: Option<String>,
    #[serde(default)]
    pub tax_amount: Option<f64>,
    #[serde(default)]
    pub shipping_cost: Option<f64>,
    #[serde(default)]
    pub payment_terms: Option<String>,
    #[serde(default)]
    pub shipping_address: Option<String>,
    #[serde(default)]
    pub billing_address: Option<String>,
    #[serde(default)]
    pub notes: Option<String>,
    #[serde(default)]
    pub created_by: Option<String>,
    #[serde(default)]
    pub auto_generated: Option<bool>,
    #[serde(default)]
    pub reorder_rule_id: Option<String>,
}

impl TryFrom<CreatePurchaseOrderBody> for NewPurchaseOrder {
    type Error = AppError;
    fn try_from(b: CreatePurchaseOrderBody) -> Result<Self, Self::Error> {
        Ok(Self {
            supplier_id: SupplierId(b.supplier_id),
            status: b.status.as_deref().map(parse_status).transpose()?,
            order_date: b.order_date,
            requested_delivery_date: b.requested_delivery_date,
            tax_amount: b.tax_amount,
            shipping_cost: b.shipping_cost,
            payment_terms: b.payment_terms,
            shipping_address: b.shipping_address,
            billing_address: b.billing_address,
            notes: b.notes,
            created_by: b.created_by,
            auto_generated: b.auto_generated,
            reorder_rule_id: b.reorder_rule_id,
        })
    }
}

/// Body for PUT — status is NOT on this type. Status changes go
/// through `PUT /api/v2/po/{id}/status` (Task 3), which enforces the
/// state machine + blocks `received` from the generic path.
#[derive(Debug, Clone, Default, Deserialize, ToSchema)]
pub struct UpdatePurchaseOrderBody {
    #[serde(default)]
    pub supplier_id: Option<String>,
    #[serde(default)]
    pub order_date: Option<String>,
    #[serde(default)]
    pub requested_delivery_date: Option<String>,
    #[serde(default)]
    pub tax_amount: Option<f64>,
    #[serde(default)]
    pub shipping_cost: Option<f64>,
    #[serde(default)]
    pub payment_terms: Option<String>,
    #[serde(default)]
    pub shipping_address: Option<String>,
    #[serde(default)]
    pub billing_address: Option<String>,
    #[serde(default)]
    pub notes: Option<String>,
}

impl From<UpdatePurchaseOrderBody> for PurchaseOrderUpdate {
    fn from(b: UpdatePurchaseOrderBody) -> Self {
        Self {
            supplier_id: b.supplier_id.map(SupplierId),
            order_date: b.order_date.map(Some),
            requested_delivery_date: b.requested_delivery_date.map(Some),
            tax_amount: b.tax_amount,
            shipping_cost: b.shipping_cost,
            payment_terms: b.payment_terms.map(Some),
            shipping_address: b.shipping_address.map(Some),
            billing_address: b.billing_address.map(Some),
            notes: b.notes.map(Some),
        }
    }
}

#[utoipa::path(
    get,
    path = "/api/v2/po",
    tag = "procurement",
    params(ListPurchaseOrdersQuery),
    responses(
        (status = 200, description = "All POs matching filters", body = [PurchaseOrderDto]),
        (status = 401, description = "Missing or invalid bearer token"),
    ),
    security(("supabase_jwt" = []))
)]
pub async fn list_purchase_orders(
    State(state): State<Arc<AppState>>,
    Query(q): Query<ListPurchaseOrdersQuery>,
    req: Request,
) -> Result<Json<Vec<PurchaseOrderDto>>, ApiError> {
    let auth = require_auth(&req).map_err(ApiError::from)?;
    let filters: PurchaseOrderFilters = q.try_into().map_err(ApiError::App)?;
    let port = state
        .procurement_factory
        .purchase_orders(auth)
        .map_err(ApiError::App)?;
    let use_case = ListPurchaseOrdersUseCase::new(port);
    let rows = use_case.execute(filters).await.map_err(ApiError::App)?;
    Ok(Json(rows.into_iter().map(PurchaseOrderDto::from).collect()))
}

#[utoipa::path(
    get,
    path = "/api/v2/po/{id}",
    tag = "procurement",
    params(("id" = String, Path, description = "Purchase order UUID")),
    responses(
        (status = 200, description = "The PO", body = PurchaseOrderDto),
        (status = 401, description = "Missing or invalid bearer token"),
        (status = 404, description = "Not found"),
    ),
    security(("supabase_jwt" = []))
)]
pub async fn get_purchase_order(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    req: Request,
) -> Result<Json<PurchaseOrderDto>, ApiError> {
    let auth = require_auth(&req).map_err(ApiError::from)?;
    let port = state
        .procurement_factory
        .purchase_orders(auth)
        .map_err(ApiError::App)?;
    let use_case = GetPurchaseOrderUseCase::new(port);
    let po = use_case
        .execute(PurchaseOrderId(id))
        .await
        .map_err(ApiError::App)?;
    Ok(Json(po.into()))
}

#[utoipa::path(
    post,
    path = "/api/v2/po",
    tag = "procurement",
    request_body = CreatePurchaseOrderBody,
    responses(
        (status = 201, description = "Created", body = PurchaseOrderDto),
        (status = 400, description = "Validation failed"),
        (status = 401, description = "Missing or invalid bearer token"),
        (status = 409, description = "Conflict (FK / duplicate / check violation)"),
    ),
    security(("supabase_jwt" = []))
)]
pub async fn create_purchase_order(
    State(state): State<Arc<AppState>>,
    req: Request,
) -> Result<(StatusCode, Json<PurchaseOrderDto>), ApiError> {
    let auth = require_auth(&req).map_err(ApiError::from)?.clone();
    let body = req.into_body();
    let bytes = axum::body::to_bytes(body, 1024 * 1024)
        .await
        .map_err(|_| ApiError::App(AppError::InvalidInput("request body too large".into())))?;
    let incoming: CreatePurchaseOrderBody = serde_json::from_slice(&bytes)
        .map_err(|e| ApiError::App(AppError::InvalidInput(format!("invalid JSON: {e}"))))?;
    let new: NewPurchaseOrder = incoming.try_into().map_err(ApiError::App)?;

    let port = state
        .procurement_factory
        .purchase_orders(&auth)
        .map_err(ApiError::App)?;
    let use_case = CreatePurchaseOrderUseCase::new(port);
    let po = use_case.execute(new).await.map_err(ApiError::App)?;
    Ok((StatusCode::CREATED, Json(po.into())))
}

#[utoipa::path(
    put,
    path = "/api/v2/po/{id}",
    tag = "procurement",
    params(("id" = String, Path, description = "Purchase order UUID")),
    request_body = UpdatePurchaseOrderBody,
    responses(
        (status = 200, description = "Updated", body = PurchaseOrderDto),
        (status = 400, description = "Validation failed"),
        (status = 401, description = "Missing or invalid bearer token"),
        (status = 404, description = "Not found"),
        (status = 409, description = "Conflict (FK / check violation)"),
    ),
    security(("supabase_jwt" = []))
)]
pub async fn update_purchase_order(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    req: Request,
) -> Result<Json<PurchaseOrderDto>, ApiError> {
    let auth = require_auth(&req).map_err(ApiError::from)?.clone();
    let body = req.into_body();
    let bytes = axum::body::to_bytes(body, 1024 * 1024)
        .await
        .map_err(|_| ApiError::App(AppError::InvalidInput("request body too large".into())))?;
    let incoming: UpdatePurchaseOrderBody = serde_json::from_slice(&bytes)
        .map_err(|e| ApiError::App(AppError::InvalidInput(format!("invalid JSON: {e}"))))?;

    let port = state
        .procurement_factory
        .purchase_orders(&auth)
        .map_err(ApiError::App)?;
    let use_case = UpdatePurchaseOrderUseCase::new(port);
    let po = use_case
        .execute(PurchaseOrderId(id), incoming.into())
        .await
        .map_err(ApiError::App)?;
    Ok(Json(po.into()))
}

#[utoipa::path(
    delete,
    path = "/api/v2/po/{id}",
    tag = "procurement",
    params(("id" = String, Path, description = "Purchase order UUID")),
    responses(
        (status = 204, description = "Deleted"),
        (status = 401, description = "Missing or invalid bearer token"),
        (status = 404, description = "Not found"),
    ),
    security(("supabase_jwt" = []))
)]
pub async fn delete_purchase_order(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    req: Request,
) -> Result<StatusCode, ApiError> {
    let auth = require_auth(&req).map_err(ApiError::from)?;
    let port = state
        .procurement_factory
        .purchase_orders(auth)
        .map_err(ApiError::App)?;
    let use_case = DeletePurchaseOrderUseCase::new(port);
    use_case
        .execute(PurchaseOrderId(id))
        .await
        .map_err(ApiError::App)?;
    Ok(StatusCode::NO_CONTENT)
}
