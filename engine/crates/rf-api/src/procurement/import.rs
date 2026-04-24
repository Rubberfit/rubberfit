//! HTTP handlers for `/api/v2/import/rolls` + `/csv` (S3c Task 8).
//!
//! Two shapes of input, one receipt response:
//!
//! - `POST /api/v2/import/rolls` accepts JSON `{ rows: [...] }` —
//!   the reviewed-row path used by the dedicated import page.
//! - `POST /api/v2/import/rolls/csv` accepts `text/csv` bytes (or
//!   `application/octet-stream` / `multipart/form-data`) — the
//!   quick-upload path used on the main inventory page.
//!
//! DXF / DWG imports are deliberately out of scope per
//! 2026-04-19 user direction — those create part-shape entities,
//! not inventory rolls. Future work.

use std::sync::Arc;

use axum::body::Bytes;
use axum::extract::{Request, State};
use axum::http::StatusCode;
use axum::Json;
use rf_application::error::AppError;
use rf_application::procurement::{
    ImportCsvBytesUseCase, ImportReceipt, ImportReviewedRowsUseCase, ImportRowError,
};
use rf_domain::{CsvImportRow, MaterialTypeId};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

use crate::auth::{require_auth, AppState};
use crate::cuts::ApiError;

/// Matches `CsvImportRow` on the wire. `material_type_id` is
/// optional and null-safe — the dedicated review page fills it
/// when the row matches an existing material, and leaves it null
/// when the user typed a new name.
#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct ImportRollRowBody {
    #[serde(default)]
    pub material_type_id: Option<String>,
    pub material_type: String,
    pub width: f64,
    pub length: f64,
    pub thickness: f64,
    #[serde(default)]
    pub color: Option<String>,
    #[serde(default)]
    pub location: Option<String>,
    #[serde(default)]
    pub date_received: Option<String>,
    #[serde(default)]
    pub supplier: Option<String>,
    #[serde(default)]
    pub cost_per_sqft: Option<f64>,
    #[serde(default)]
    pub notes: Option<String>,
}

impl From<ImportRollRowBody> for CsvImportRow {
    fn from(b: ImportRollRowBody) -> Self {
        Self {
            material_type_id: b.material_type_id.map(MaterialTypeId),
            material_type: b.material_type,
            width: b.width,
            length: b.length,
            thickness: b.thickness,
            color: b.color,
            location: b.location,
            date_received: b.date_received,
            supplier: b.supplier,
            cost_per_sqft: b.cost_per_sqft,
            notes: b.notes,
        }
    }
}

#[derive(Debug, Clone, Deserialize, ToSchema)]
pub struct ImportRollsBody {
    pub rows: Vec<ImportRollRowBody>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ImportRowErrorDto {
    pub row_number: usize,
    pub message: String,
}

impl From<ImportRowError> for ImportRowErrorDto {
    fn from(e: ImportRowError) -> Self {
        Self {
            row_number: e.row_number,
            message: e.message,
        }
    }
}

#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct ImportReceiptDto {
    pub imported: usize,
    pub skipped: usize,
    pub errors: Vec<ImportRowErrorDto>,
}

impl From<ImportReceipt> for ImportReceiptDto {
    fn from(r: ImportReceipt) -> Self {
        Self {
            imported: r.imported,
            skipped: r.skipped,
            errors: r.errors.into_iter().map(ImportRowErrorDto::from).collect(),
        }
    }
}

// ---- JSON reviewed rows --------------------------------------------------

#[utoipa::path(
    post,
    path = "/api/v2/import/rolls",
    tag = "procurement",
    request_body = ImportRollsBody,
    responses(
        (status = 200, description = "Import receipt", body = ImportReceiptDto),
        (status = 400, description = "Validation failed"),
        (status = 401, description = "Missing or invalid bearer token"),
    ),
    security(("supabase_jwt" = []))
)]
pub async fn import_rolls_json(
    State(state): State<Arc<AppState>>,
    req: Request,
) -> Result<Json<ImportReceiptDto>, ApiError> {
    let auth = require_auth(&req).map_err(ApiError::from)?.clone();
    let body = req.into_body();
    // 10 MiB ceiling — covers a generous CSV review batch without
    // letting a pathological client drain memory.
    let bytes = axum::body::to_bytes(body, 10 * 1024 * 1024)
        .await
        .map_err(|_| ApiError::App(AppError::InvalidInput("request body too large".into())))?;
    let incoming: ImportRollsBody = serde_json::from_slice(&bytes)
        .map_err(|e| ApiError::App(AppError::InvalidInput(format!("invalid JSON: {e}"))))?;

    let rows: Vec<CsvImportRow> = incoming.rows.into_iter().map(CsvImportRow::from).collect();

    let port = state
        .procurement_factory
        .csv_import(&auth)
        .map_err(ApiError::App)?;
    let use_case = ImportReviewedRowsUseCase::new(port);
    let receipt = use_case.execute(rows).await.map_err(ApiError::App)?;
    Ok(Json(receipt.into()))
}

// ---- Raw CSV bytes --------------------------------------------------------

#[utoipa::path(
    post,
    path = "/api/v2/import/rolls/csv",
    tag = "procurement",
    request_body(
        content_type = "text/csv",
        description = "CSV with required columns material_type, width, length, thickness \
                       and optional color, location, date_received, supplier, cost_per_sqft, \
                       notes. Header row is case-insensitive; whitespace → underscore."
    ),
    responses(
        (status = 200, description = "Import receipt", body = ImportReceiptDto),
        (status = 400, description = "CSV missing required columns or empty"),
        (status = 401, description = "Missing or invalid bearer token"),
        (status = 413, description = "CSV body exceeds 10 MiB"),
    ),
    security(("supabase_jwt" = []))
)]
pub async fn import_rolls_csv(
    State(state): State<Arc<AppState>>,
    req: Request,
) -> Result<Json<ImportReceiptDto>, ApiError> {
    let auth = require_auth(&req).map_err(ApiError::from)?.clone();
    let body = req.into_body();
    let bytes: Bytes = axum::body::to_bytes(body, 10 * 1024 * 1024)
        .await
        .map_err(|_| {
            ApiError::App(AppError::InvalidInput(
                "CSV body too large (10 MiB max)".into(),
            ))
        })?;

    let port = state
        .procurement_factory
        .csv_import(&auth)
        .map_err(ApiError::App)?;
    let use_case = ImportCsvBytesUseCase::new(port);
    let receipt = use_case
        .execute(bytes.as_ref())
        .await
        .map_err(ApiError::App)?;
    Ok(Json(receipt.into()))
}

// ---- status codes --------------------------------------------------------
//
// We return 200 (not 201) because a CSV import is a receipt over a
// mixed outcome — successes, skips, errors — not a single newly
// created entity. Clients read `imported` on the body to know how
// many rolls landed.

#[allow(dead_code)]
const _RETURN_CODE_IS_200_NOT_201: StatusCode = StatusCode::OK;
