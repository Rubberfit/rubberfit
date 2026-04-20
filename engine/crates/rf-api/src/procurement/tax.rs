//! HTTP handler for `GET /api/v2/po/tax/preview` (S3c Task 4).
//!
//! Thin proxy over `TaxPort::calculate_po_tax` — resolves a request-
//! scoped `HttpTaxProxy` from the procurement factory and forwards
//! the authenticated caller's JWT so the downstream TS route can
//! verify it against Supabase. The endpoint is named "preview"
//! because it's what the PO-create dialog calls for the live total
//! before the operator clicks Save; the actual write path (CREATE /
//! UPDATE) continues to accept a client-supplied `tax_amount`, which
//! the UI fills from this endpoint's response. Full server-side
//! re-calculation on write lives in S3d along with the full port.

use std::sync::Arc;

use axum::extract::{Query, Request, State};
use axum::Json;
use rf_application::error::AppError;
use rf_application::tax::TaxCalculation;
use rf_domain::SupplierId;
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};

use crate::auth::{require_auth, AppState};
use crate::cuts::ApiError;

#[derive(Debug, Clone, Deserialize, IntoParams)]
#[into_params(parameter_in = Query)]
pub struct TaxPreviewQuery {
    pub supplier_id: String,
    pub subtotal: f64,
}

/// Response shape — mirrors the TS service's `TaxCalculation` minus
/// the redundant `subtotal` / `total` fields (the client already has
/// those). `tax_level` is one of `"state"`, `"city"`, `"zip_code"`,
/// `"default"`, `"exempt"`, `"override"`, or `"api"`; `tax_name`
/// is the human-readable label the PO dialog shows (`"Texas State"`,
/// `"Tax Exempt"`, `"Supplier Override Rate"`, etc.). Both are
/// passed through verbatim — treated as opaque at this layer.
#[derive(Debug, Clone, Serialize, ToSchema)]
pub struct TaxPreviewDto {
    pub tax_amount: f64,
    pub tax_rate: f64,
    pub tax_level: String,
    pub tax_name: String,
}

impl From<TaxCalculation> for TaxPreviewDto {
    fn from(c: TaxCalculation) -> Self {
        Self {
            tax_amount: c.tax_amount,
            tax_rate: c.tax_rate,
            tax_level: c.tax_level,
            tax_name: c.tax_name,
        }
    }
}

#[utoipa::path(
    get,
    path = "/api/v2/po/tax/preview",
    tag = "procurement",
    params(TaxPreviewQuery),
    responses(
        (status = 200, description = "Tax preview", body = TaxPreviewDto),
        (status = 400, description = "subtotal must be a finite non-negative number"),
        (status = 401, description = "Missing or invalid bearer token"),
        (status = 500, description = "TAX_PROXY_BASE not configured or downstream failure"),
    ),
    security(("supabase_jwt" = []))
)]
pub async fn tax_preview(
    State(state): State<Arc<AppState>>,
    Query(q): Query<TaxPreviewQuery>,
    req: Request,
) -> Result<Json<TaxPreviewDto>, ApiError> {
    let auth = require_auth(&req).map_err(ApiError::from)?;
    if !q.subtotal.is_finite() || q.subtotal < 0.0 {
        return Err(ApiError::App(AppError::InvalidInput(
            "subtotal must be a finite non-negative number".into(),
        )));
    }
    let tax = state
        .procurement_factory
        .tax(auth)
        .map_err(ApiError::App)?;
    let calc = tax
        .calculate_po_tax(&SupplierId(q.supplier_id), q.subtotal)
        .await
        .map_err(ApiError::App)?;
    Ok(Json(calc.into()))
}
