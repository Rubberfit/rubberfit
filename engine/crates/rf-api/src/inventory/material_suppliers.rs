//! HTTP handlers for `/api/v2/inventory/material-suppliers`.
//!
//! Responses embed the referenced `material_type` and `supplier`
//! objects so the UI's existing `MaterialSupplierWithDetails` shape
//! keeps working — see the adapter for the PostgREST embed alias.

use std::sync::Arc;

use axum::extract::{Path, Query, Request, State};
use axum::http::StatusCode;
use axum::Json;
use rf_application::error::AppError;
use rf_application::inventory::{
    CreateMaterialSupplierUseCase, DeleteMaterialSupplierUseCase,
    GetMaterialSupplierUseCase, ListMaterialSuppliersUseCase,
    MaterialSupplierFilters, MaterialSupplierUpdate, NewMaterialSupplier,
    UpdateMaterialSupplierUseCase,
};
use rf_domain::{MaterialSupplier, MaterialSupplierId, MaterialTypeId, SupplierId};
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};

use crate::auth::{require_auth, AppState};
use crate::cuts::ApiError;
use crate::inventory::material_types::MaterialTypeDto;
use crate::inventory::suppliers::SupplierDto;

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct MaterialSupplierDto {
    pub id: String,
    pub material_type_id: String,
    pub supplier_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supplier_material_code: Option<String>,
    pub cost_per_sqft: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub minimum_order_sqft: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lead_time_days: Option<i32>,
    pub preferred_supplier: bool,
    pub active: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub effective_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expiration_date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
    /// The embedded material_types row, present on list/get, absent
    /// on create/update response (PostgREST Prefer:
    /// return=representation doesn't include embeds).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub material_type: Option<MaterialTypeDto>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub supplier: Option<SupplierDto>,
}

impl From<MaterialSupplier> for MaterialSupplierDto {
    fn from(ms: MaterialSupplier) -> Self {
        Self {
            id: ms.id.0,
            material_type_id: ms.material_type_id.0,
            supplier_id: ms.supplier_id.0,
            supplier_material_code: ms.supplier_material_code,
            cost_per_sqft: ms.cost_per_sqft,
            minimum_order_sqft: ms.minimum_order_sqft,
            lead_time_days: ms.lead_time_days,
            preferred_supplier: ms.preferred_supplier,
            active: ms.active,
            notes: ms.notes,
            effective_date: ms.effective_date,
            expiration_date: ms.expiration_date,
            created_at: ms.created_at,
            updated_at: ms.updated_at,
            material_type: ms.material_type.map(MaterialTypeDto::from),
            supplier: ms.supplier.map(SupplierDto::from),
        }
    }
}

#[derive(Debug, Default, Deserialize, IntoParams)]
pub struct ListMaterialSuppliersQuery {
    #[serde(default)]
    pub material_type_id: Option<String>,
    #[serde(default)]
    pub supplier_id: Option<String>,
    #[serde(default)]
    pub active: Option<bool>,
    #[serde(default)]
    pub limit: Option<u32>,
    #[serde(default)]
    pub offset: Option<u32>,
}

impl From<ListMaterialSuppliersQuery> for MaterialSupplierFilters {
    fn from(q: ListMaterialSuppliersQuery) -> Self {
        Self {
            material_type_id: q.material_type_id.map(MaterialTypeId),
            supplier_id: q.supplier_id.map(SupplierId),
            active: q.active,
            limit: q.limit,
            offset: q.offset,
        }
    }
}

#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct CreateMaterialSupplierBody {
    pub material_type_id: String,
    pub supplier_id: String,
    #[serde(default)]
    pub supplier_material_code: Option<String>,
    pub cost_per_sqft: f64,
    #[serde(default)]
    pub minimum_order_sqft: Option<f64>,
    #[serde(default)]
    pub lead_time_days: Option<i32>,
    #[serde(default)]
    pub preferred_supplier: Option<bool>,
    #[serde(default)]
    pub active: Option<bool>,
    #[serde(default)]
    pub notes: Option<String>,
    #[serde(default)]
    pub effective_date: Option<String>,
    #[serde(default)]
    pub expiration_date: Option<String>,
}

impl From<CreateMaterialSupplierBody> for NewMaterialSupplier {
    fn from(b: CreateMaterialSupplierBody) -> Self {
        Self {
            material_type_id: MaterialTypeId(b.material_type_id),
            supplier_id: SupplierId(b.supplier_id),
            supplier_material_code: b.supplier_material_code,
            cost_per_sqft: b.cost_per_sqft,
            minimum_order_sqft: b.minimum_order_sqft,
            lead_time_days: b.lead_time_days,
            preferred_supplier: b.preferred_supplier,
            active: b.active,
            notes: b.notes,
            effective_date: b.effective_date,
            expiration_date: b.expiration_date,
        }
    }
}

#[derive(Debug, Default, Clone, Deserialize, ToSchema)]
pub struct UpdateMaterialSupplierBody {
    #[serde(default)]
    pub supplier_material_code: Option<String>,
    #[serde(default)]
    pub cost_per_sqft: Option<f64>,
    #[serde(default)]
    pub minimum_order_sqft: Option<f64>,
    #[serde(default)]
    pub lead_time_days: Option<i32>,
    #[serde(default)]
    pub preferred_supplier: Option<bool>,
    #[serde(default)]
    pub active: Option<bool>,
    #[serde(default)]
    pub notes: Option<String>,
    #[serde(default)]
    pub effective_date: Option<String>,
    #[serde(default)]
    pub expiration_date: Option<String>,
}

impl From<UpdateMaterialSupplierBody> for MaterialSupplierUpdate {
    fn from(b: UpdateMaterialSupplierBody) -> Self {
        Self {
            supplier_material_code: b.supplier_material_code.map(Some),
            cost_per_sqft: b.cost_per_sqft,
            minimum_order_sqft: b.minimum_order_sqft.map(Some),
            lead_time_days: b.lead_time_days.map(Some),
            preferred_supplier: b.preferred_supplier,
            active: b.active,
            notes: b.notes.map(Some),
            effective_date: b.effective_date.map(Some),
            expiration_date: b.expiration_date.map(Some),
        }
    }
}

#[utoipa::path(
    get,
    path = "/api/v2/inventory/material-suppliers",
    tag = "inventory",
    params(ListMaterialSuppliersQuery),
    responses(
        (status = 200, description = "Material-supplier rows with embedded material_type + supplier", body = [MaterialSupplierDto]),
        (status = 401, description = "Missing or invalid bearer token"),
        (status = 500, description = "Downstream infrastructure failure"),
    ),
    security(("supabase_jwt" = []))
)]
pub async fn list_material_suppliers(
    State(state): State<Arc<AppState>>,
    Query(params): Query<ListMaterialSuppliersQuery>,
    req: Request,
) -> Result<Json<Vec<MaterialSupplierDto>>, ApiError> {
    let auth = require_auth(&req).map_err(ApiError::from)?;
    let port = state
        .inventory_factory
        .material_suppliers(auth)
        .map_err(ApiError::App)?;
    let use_case = ListMaterialSuppliersUseCase::new(port);
    let rows = use_case.execute(params.into()).await.map_err(ApiError::App)?;
    Ok(Json(
        rows.into_iter().map(MaterialSupplierDto::from).collect(),
    ))
}

#[utoipa::path(
    get,
    path = "/api/v2/inventory/material-suppliers/{id}",
    tag = "inventory",
    params(("id" = String, Path, description = "Material-supplier row UUID")),
    responses(
        (status = 200, description = "Row with embedded parents", body = MaterialSupplierDto),
        (status = 401, description = "Missing or invalid bearer token"),
        (status = 404, description = "Row not found"),
        (status = 500, description = "Downstream infrastructure failure"),
    ),
    security(("supabase_jwt" = []))
)]
pub async fn get_material_supplier(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    req: Request,
) -> Result<Json<MaterialSupplierDto>, ApiError> {
    let auth = require_auth(&req).map_err(ApiError::from)?;
    let port = state
        .inventory_factory
        .material_suppliers(auth)
        .map_err(ApiError::App)?;
    let use_case = GetMaterialSupplierUseCase::new(port);
    let ms = use_case
        .execute(MaterialSupplierId(id))
        .await
        .map_err(ApiError::App)?;
    Ok(Json(ms.into()))
}

#[utoipa::path(
    post,
    path = "/api/v2/inventory/material-suppliers",
    tag = "inventory",
    request_body = CreateMaterialSupplierBody,
    responses(
        (status = 201, description = "Created", body = MaterialSupplierDto),
        (status = 400, description = "Validation failed"),
        (status = 401, description = "Missing or invalid bearer token"),
        (status = 409, description = "Duplicate (material_type, supplier) pair — `DUPLICATE_PAIR`"),
        (status = 500, description = "Downstream infrastructure failure"),
    ),
    security(("supabase_jwt" = []))
)]
pub async fn create_material_supplier(
    State(state): State<Arc<AppState>>,
    req: Request,
) -> Result<(StatusCode, Json<MaterialSupplierDto>), ApiError> {
    let auth = require_auth(&req).map_err(ApiError::from)?.clone();
    let body = req.into_body();
    let bytes = axum::body::to_bytes(body, 1024 * 1024)
        .await
        .map_err(|_| ApiError::App(AppError::InvalidInput("request body too large".into())))?;
    let incoming: CreateMaterialSupplierBody = serde_json::from_slice(&bytes)
        .map_err(|e| ApiError::App(AppError::InvalidInput(format!("invalid JSON: {e}"))))?;
    let port = state
        .inventory_factory
        .material_suppliers(&auth)
        .map_err(ApiError::App)?;
    let use_case = CreateMaterialSupplierUseCase::new(port);
    let ms = use_case
        .execute(incoming.into())
        .await
        .map_err(ApiError::App)?;
    Ok((StatusCode::CREATED, Json(ms.into())))
}

#[utoipa::path(
    put,
    path = "/api/v2/inventory/material-suppliers/{id}",
    tag = "inventory",
    params(("id" = String, Path, description = "Material-supplier row UUID")),
    request_body = UpdateMaterialSupplierBody,
    responses(
        (status = 200, description = "Updated", body = MaterialSupplierDto),
        (status = 400, description = "Validation failed"),
        (status = 401, description = "Missing or invalid bearer token"),
        (status = 404, description = "Row not found"),
        (status = 500, description = "Downstream infrastructure failure"),
    ),
    security(("supabase_jwt" = []))
)]
pub async fn update_material_supplier(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    req: Request,
) -> Result<Json<MaterialSupplierDto>, ApiError> {
    let auth = require_auth(&req).map_err(ApiError::from)?.clone();
    let body = req.into_body();
    let bytes = axum::body::to_bytes(body, 1024 * 1024)
        .await
        .map_err(|_| ApiError::App(AppError::InvalidInput("request body too large".into())))?;
    let incoming: UpdateMaterialSupplierBody = serde_json::from_slice(&bytes)
        .map_err(|e| ApiError::App(AppError::InvalidInput(format!("invalid JSON: {e}"))))?;
    let port = state
        .inventory_factory
        .material_suppliers(&auth)
        .map_err(ApiError::App)?;
    let use_case = UpdateMaterialSupplierUseCase::new(port);
    let ms = use_case
        .execute(MaterialSupplierId(id), incoming.into())
        .await
        .map_err(ApiError::App)?;
    Ok(Json(ms.into()))
}

#[utoipa::path(
    delete,
    path = "/api/v2/inventory/material-suppliers/{id}",
    tag = "inventory",
    params(("id" = String, Path, description = "Material-supplier row UUID")),
    responses(
        (status = 204, description = "Deleted"),
        (status = 401, description = "Missing or invalid bearer token"),
        (status = 404, description = "Row not found"),
        (status = 500, description = "Downstream infrastructure failure"),
    ),
    security(("supabase_jwt" = []))
)]
pub async fn delete_material_supplier(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    req: Request,
) -> Result<StatusCode, ApiError> {
    let auth = require_auth(&req).map_err(ApiError::from)?;
    let port = state
        .inventory_factory
        .material_suppliers(auth)
        .map_err(ApiError::App)?;
    let use_case = DeleteMaterialSupplierUseCase::new(port);
    use_case
        .execute(MaterialSupplierId(id))
        .await
        .map_err(ApiError::App)?;
    Ok(StatusCode::NO_CONTENT)
}
