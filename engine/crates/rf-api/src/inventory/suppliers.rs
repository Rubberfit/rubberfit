//! HTTP handlers for `/api/v2/inventory/suppliers`.

use std::sync::Arc;

use axum::extract::{Path, Query, Request, State};
use axum::http::StatusCode;
use axum::Json;
use rf_application::error::AppError;
use rf_application::inventory::{
    CreateSupplierUseCase, DeleteSupplierUseCase, GetSupplierUseCase, ListSuppliersUseCase,
    NewSupplier, SupplierUpdate, UpdateSupplierUseCase,
};
use rf_domain::{Supplier, SupplierFilters, SupplierId};
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};

use crate::auth::{require_auth, AppState};
use crate::cuts::ApiError;

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct SupplierDto {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub contact_person: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub phone: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub address: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub city: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub zip_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub country: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub website: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tax_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payment_terms: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rating: Option<f64>,
    pub preferred: bool,
    pub active: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
}

impl From<Supplier> for SupplierDto {
    fn from(s: Supplier) -> Self {
        Self {
            id: s.id.0,
            name: s.name,
            contact_person: s.contact_person,
            email: s.email,
            phone: s.phone,
            address: s.address,
            city: s.city,
            state: s.state,
            zip_code: s.zip_code,
            country: s.country,
            website: s.website,
            tax_id: s.tax_id,
            payment_terms: s.payment_terms,
            rating: s.rating,
            preferred: s.preferred,
            active: s.active,
            notes: s.notes,
            created_at: s.created_at,
            updated_at: s.updated_at,
        }
    }
}

/// Query params for the list endpoint. `active` / `preferred` map
/// directly onto the SupplierFilters; `q` is the ILIKE search term.
#[derive(Debug, Default, Deserialize, IntoParams)]
pub struct ListSuppliersQuery {
    /// When set, only return suppliers matching the given active flag.
    #[serde(default)]
    pub active: Option<bool>,
    /// When set, only return suppliers matching the given preferred flag.
    #[serde(default)]
    pub preferred: Option<bool>,
    /// ILIKE search across name / contact_person / email / city.
    #[serde(default)]
    pub q: Option<String>,
    /// Page size. Clamped to 200 server-side.
    #[serde(default)]
    pub limit: Option<u32>,
    /// Zero-based offset.
    #[serde(default)]
    pub offset: Option<u32>,
}

impl From<ListSuppliersQuery> for SupplierFilters {
    fn from(q: ListSuppliersQuery) -> Self {
        Self {
            active: q.active,
            preferred: q.preferred,
            search: q.q,
            limit: q.limit,
            offset: q.offset,
        }
    }
}

#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct CreateSupplierBody {
    pub name: String,
    #[serde(default)]
    pub contact_person: Option<String>,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub phone: Option<String>,
    #[serde(default)]
    pub address: Option<String>,
    #[serde(default)]
    pub city: Option<String>,
    #[serde(default)]
    pub state: Option<String>,
    #[serde(default)]
    pub zip_code: Option<String>,
    #[serde(default)]
    pub country: Option<String>,
    #[serde(default)]
    pub website: Option<String>,
    #[serde(default)]
    pub tax_id: Option<String>,
    #[serde(default)]
    pub payment_terms: Option<String>,
    #[serde(default)]
    pub rating: Option<f64>,
    #[serde(default)]
    pub preferred: Option<bool>,
    #[serde(default)]
    pub active: Option<bool>,
    #[serde(default)]
    pub notes: Option<String>,
}

impl From<CreateSupplierBody> for NewSupplier {
    fn from(b: CreateSupplierBody) -> Self {
        Self {
            name: b.name,
            contact_person: b.contact_person,
            email: b.email,
            phone: b.phone,
            address: b.address,
            city: b.city,
            state: b.state,
            zip_code: b.zip_code,
            country: b.country,
            website: b.website,
            tax_id: b.tax_id,
            payment_terms: b.payment_terms,
            rating: b.rating,
            preferred: b.preferred,
            active: b.active,
            notes: b.notes,
        }
    }
}

/// Update body — all fields optional. Single-level `Option<T>` for
/// simplicity; explicit null-ing of columns isn't something the UI
/// needs today. When it does, promote to Option<Option<T>>.
#[derive(Debug, Default, Clone, Deserialize, ToSchema)]
pub struct UpdateSupplierBody {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub contact_person: Option<String>,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub phone: Option<String>,
    #[serde(default)]
    pub address: Option<String>,
    #[serde(default)]
    pub city: Option<String>,
    #[serde(default)]
    pub state: Option<String>,
    #[serde(default)]
    pub zip_code: Option<String>,
    #[serde(default)]
    pub country: Option<String>,
    #[serde(default)]
    pub website: Option<String>,
    #[serde(default)]
    pub tax_id: Option<String>,
    #[serde(default)]
    pub payment_terms: Option<String>,
    #[serde(default)]
    pub rating: Option<f64>,
    #[serde(default)]
    pub preferred: Option<bool>,
    #[serde(default)]
    pub active: Option<bool>,
    #[serde(default)]
    pub notes: Option<String>,
}

impl From<UpdateSupplierBody> for SupplierUpdate {
    fn from(b: UpdateSupplierBody) -> Self {
        Self {
            name: b.name,
            contact_person: b.contact_person.map(Some),
            email: b.email.map(Some),
            phone: b.phone.map(Some),
            address: b.address.map(Some),
            city: b.city.map(Some),
            state: b.state.map(Some),
            zip_code: b.zip_code.map(Some),
            country: b.country.map(Some),
            website: b.website.map(Some),
            tax_id: b.tax_id.map(Some),
            payment_terms: b.payment_terms.map(Some),
            rating: b.rating.map(Some),
            preferred: b.preferred,
            active: b.active,
            notes: b.notes.map(Some),
        }
    }
}

#[utoipa::path(
    get,
    path = "/api/v2/inventory/suppliers",
    tag = "inventory",
    params(ListSuppliersQuery),
    responses(
        (status = 200, description = "Suppliers, preferred first then alphabetical", body = [SupplierDto]),
        (status = 401, description = "Missing or invalid bearer token"),
        (status = 500, description = "Downstream infrastructure failure"),
    ),
    security(("supabase_jwt" = []))
)]
pub async fn list_suppliers(
    State(state): State<Arc<AppState>>,
    Query(params): Query<ListSuppliersQuery>,
    req: Request,
) -> Result<Json<Vec<SupplierDto>>, ApiError> {
    let auth = require_auth(&req).map_err(ApiError::from)?;
    let port = state
        .inventory_factory
        .suppliers(auth)
        .map_err(ApiError::App)?;
    let use_case = ListSuppliersUseCase::new(port);
    let rows = use_case
        .execute(params.into())
        .await
        .map_err(ApiError::App)?;
    Ok(Json(rows.into_iter().map(SupplierDto::from).collect()))
}

#[utoipa::path(
    get,
    path = "/api/v2/inventory/suppliers/{id}",
    tag = "inventory",
    params(("id" = String, Path, description = "Supplier UUID")),
    responses(
        (status = 200, description = "The supplier", body = SupplierDto),
        (status = 401, description = "Missing or invalid bearer token"),
        (status = 404, description = "Row not found"),
        (status = 500, description = "Downstream infrastructure failure"),
    ),
    security(("supabase_jwt" = []))
)]
pub async fn get_supplier(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    req: Request,
) -> Result<Json<SupplierDto>, ApiError> {
    let auth = require_auth(&req).map_err(ApiError::from)?;
    let port = state
        .inventory_factory
        .suppliers(auth)
        .map_err(ApiError::App)?;
    let use_case = GetSupplierUseCase::new(port);
    let s = use_case
        .execute(SupplierId(id))
        .await
        .map_err(ApiError::App)?;
    Ok(Json(s.into()))
}

#[utoipa::path(
    post,
    path = "/api/v2/inventory/suppliers",
    tag = "inventory",
    request_body = CreateSupplierBody,
    responses(
        (status = 201, description = "Created", body = SupplierDto),
        (status = 400, description = "Validation failed"),
        (status = 401, description = "Missing or invalid bearer token"),
        (status = 409, description = "Duplicate name — `DUPLICATE_NAME` code in body"),
        (status = 500, description = "Downstream infrastructure failure"),
    ),
    security(("supabase_jwt" = []))
)]
pub async fn create_supplier(
    State(state): State<Arc<AppState>>,
    req: Request,
) -> Result<(StatusCode, Json<SupplierDto>), ApiError> {
    let auth = require_auth(&req).map_err(ApiError::from)?.clone();
    let body = req.into_body();
    let bytes = axum::body::to_bytes(body, 1024 * 1024)
        .await
        .map_err(|_| ApiError::App(AppError::InvalidInput("request body too large".into())))?;
    let incoming: CreateSupplierBody = serde_json::from_slice(&bytes)
        .map_err(|e| ApiError::App(AppError::InvalidInput(format!("invalid JSON: {e}"))))?;
    let port = state
        .inventory_factory
        .suppliers(&auth)
        .map_err(ApiError::App)?;
    let use_case = CreateSupplierUseCase::new(port);
    let s = use_case
        .execute(incoming.into())
        .await
        .map_err(ApiError::App)?;
    Ok((StatusCode::CREATED, Json(s.into())))
}

#[utoipa::path(
    put,
    path = "/api/v2/inventory/suppliers/{id}",
    tag = "inventory",
    params(("id" = String, Path, description = "Supplier UUID")),
    request_body = UpdateSupplierBody,
    responses(
        (status = 200, description = "Updated", body = SupplierDto),
        (status = 400, description = "Validation failed"),
        (status = 401, description = "Missing or invalid bearer token"),
        (status = 404, description = "Row not found"),
        (status = 409, description = "Duplicate name — `DUPLICATE_NAME` code in body"),
        (status = 500, description = "Downstream infrastructure failure"),
    ),
    security(("supabase_jwt" = []))
)]
pub async fn update_supplier(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    req: Request,
) -> Result<Json<SupplierDto>, ApiError> {
    let auth = require_auth(&req).map_err(ApiError::from)?.clone();
    let body = req.into_body();
    let bytes = axum::body::to_bytes(body, 1024 * 1024)
        .await
        .map_err(|_| ApiError::App(AppError::InvalidInput("request body too large".into())))?;
    let incoming: UpdateSupplierBody = serde_json::from_slice(&bytes)
        .map_err(|e| ApiError::App(AppError::InvalidInput(format!("invalid JSON: {e}"))))?;
    let port = state
        .inventory_factory
        .suppliers(&auth)
        .map_err(ApiError::App)?;
    let use_case = UpdateSupplierUseCase::new(port);
    let s = use_case
        .execute(SupplierId(id), incoming.into())
        .await
        .map_err(ApiError::App)?;
    Ok(Json(s.into()))
}

#[utoipa::path(
    delete,
    path = "/api/v2/inventory/suppliers/{id}",
    tag = "inventory",
    params(("id" = String, Path, description = "Supplier UUID")),
    responses(
        (status = 204, description = "Deleted"),
        (status = 401, description = "Missing or invalid bearer token"),
        (status = 404, description = "Row not found"),
        (status = 409, description = "Blocked — material_supplier rows reference this supplier"),
        (status = 500, description = "Downstream infrastructure failure"),
    ),
    security(("supabase_jwt" = []))
)]
pub async fn delete_supplier(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    req: Request,
) -> Result<StatusCode, ApiError> {
    let auth = require_auth(&req).map_err(ApiError::from)?;
    let port = state
        .inventory_factory
        .suppliers(auth)
        .map_err(ApiError::App)?;
    let use_case = DeleteSupplierUseCase::new(port);
    use_case
        .execute(SupplierId(id))
        .await
        .map_err(ApiError::App)?;
    Ok(StatusCode::NO_CONTENT)
}
